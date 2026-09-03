-- Factory reliability: durable provider-capacity retry state (P1). STATUS: FIX
-- PREPARED / REVIEW REQUIRED — NOT pushed; requires founder authorization at the
-- `supabase db push` boundary.
--
-- THE DEFECT THIS CLOSES, observed three times in the 2026-09-01/02/03 campaign:
-- a dispatched Agent Run hit "You've hit your session limit" and the CLI process
-- exited 0. 202609020003-era work already classifies that as PROVIDER_CAPACITY_BLOCKED
-- (scripts/factory-runner/provider.mjs), but classification alone changed nothing:
-- nothing relaunched the run after the provider's reset time, because the only thing
-- that COULD relaunch it was the very Claude session whose quota had just been
-- exhausted. A dead process meant a dead company goal.
--
--   PROCESS LIFETIME != WORK ORDER LIFETIME.
--
-- Retry ownership therefore moves OUT of the Claude session and into durable Postgres
-- state + an external supervisor loop (scripts/factory-runner/supervisor.mjs), which
-- polls for eligible blocked runs, ATOMICALLY claims one, and spawns a NEW session with
-- the checkpoint injected. The columns below are what a fresh session needs to resume
-- without founder context, and what makes double-restart impossible.
--
-- Purely additive: new nullable columns on agent_runs + one SECURITY DEFINER claim
-- function. No existing column changes type or meaning; every existing query keeps
-- working untouched. Rollback = drop the function and the columns.

begin;

-- ---- Retry/checkpoint state -------------------------------------------------------
alter table public.agent_runs add column if not exists blocked_at timestamptz;
alter table public.agent_runs add column if not exists retry_after timestamptz;
alter table public.agent_runs add column if not exists attempt_count integer not null default 1;
-- Where the resumable checkpoint lives (a repo path, e.g.
-- qa/verification/CURRENT_CAMPAIGN.json). Deliberately a POINTER, not the payload:
-- the checkpoint is a reviewable committed artifact, not a blob only the DB has.
alter table public.agent_runs add column if not exists checkpoint_location text;
-- The exact source identity the run was certifying. A restart MUST verify this still
-- matches before reusing any completed-scenario evidence — otherwise partial
-- certification silently transfers to different code
-- (SOURCE_SHA_CHANGE_INVALIDATES_PARTIAL_CERTIFICATION).
alter table public.agent_runs add column if not exists source_sha text;
alter table public.agent_runs add column if not exists worktree text;
alter table public.agent_runs add column if not exists last_completed_scenario text;
alter table public.agent_runs add column if not exists remaining_scenarios jsonb;
alter table public.agent_runs add column if not exists verification_campaign_id text;

-- ---- Provider/model transparency: NO SILENT FALLBACK ------------------------------
-- Requested and actual are stored SEPARATELY and both surfaced. A restart that had to
-- use a different provider/model must be visibly a different provider/model, never a
-- substitution presented as the original.
alter table public.agent_runs add column if not exists requested_provider text;
alter table public.agent_runs add column if not exists requested_model text;
alter table public.agent_runs add column if not exists actual_provider text;
alter table public.agent_runs add column if not exists actual_model text;
alter table public.agent_runs add column if not exists fallback_reason text;

-- ---- Atomic claim, so two supervisors cannot double-restart one run ---------------
alter table public.agent_runs add column if not exists claimed_by text;
alter table public.agent_runs add column if not exists claimed_at timestamptz;

-- Eligible-run scan support: only blocked rows carrying a retry time are ever scanned.
create index if not exists agent_runs_retry_eligible_idx
  on public.agent_runs (retry_after)
  where status = 'blocked'::work_status and retry_after is not null;

-- Claim EXACTLY ONE eligible blocked run, atomically. FOR UPDATE SKIP LOCKED is the
-- whole point: two supervisors racing take different rows or none, never the same row
-- twice (TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN). The status flip to in_progress
-- happens INSIDE the same statement's transaction as the row selection, so a crash
-- between "select" and "claim" cannot leave a run claimed-but-not-running.
--
-- SECURITY DEFINER + founder/admin check: restarting a production Agent Run is real
-- factory authority, never something an ordinary member may trigger.
create or replace function public.claim_blocked_run_for_retry(p_claimed_by text)
returns table (
  id uuid,
  canonical_work_order_id uuid,
  task_id uuid,
  agent_id uuid,
  checkpoint_location text,
  source_sha text,
  branch text,
  worktree text,
  last_completed_scenario text,
  remaining_scenarios jsonb,
  verification_campaign_id text,
  attempt_count integer,
  requested_provider text,
  requested_model text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_founder_or_admin() then
    raise exception 'Only the founder or an admin can claim a blocked Agent Run for retry';
  end if;

  select ar.id into v_id
    from public.agent_runs ar
   where ar.status = 'blocked'::public.work_status
     and ar.retry_after is not null
     and ar.retry_after <= now()
     and ar.claimed_by is null
   order by ar.retry_after
   for update skip locked
   limit 1;

  if v_id is null then
    return;
  end if;

  update public.agent_runs ar
     set status = 'in_progress'::public.work_status,
         claimed_by = p_claimed_by,
         claimed_at = now(),
         attempt_count = ar.attempt_count + 1,
         last_heartbeat_at = now(),
         last_event = 'resumed_after_provider_capacity_block'
   where ar.id = v_id;

  return query
    select ar.id, ar.canonical_work_order_id, ar.task_id, ar.agent_id,
           ar.checkpoint_location, ar.source_sha, ar.branch, ar.worktree,
           ar.last_completed_scenario, ar.remaining_scenarios, ar.verification_campaign_id,
           ar.attempt_count, ar.requested_provider, ar.requested_model
      from public.agent_runs ar
     where ar.id = v_id;
end;
$$;

revoke execute on function public.claim_blocked_run_for_retry(text) from anon, public;
grant execute on function public.claim_blocked_run_for_retry(text) to authenticated;

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file):
--   drop function if exists public.claim_blocked_run_for_retry(text);
--   drop index if exists public.agent_runs_retry_eligible_idx;
--   alter table public.agent_runs drop column if exists <each column added above>;
-- Purely additive; the supervisor is feature-gated on the claim function existing, so
-- rolling back the migration returns the Factory to today's manual-recovery behaviour
-- without an application rollback.
