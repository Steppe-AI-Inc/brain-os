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
create or replace function public.claim_blocked_run_for_retry(
  p_claimed_by text,
  -- run12/D1: the cap is a real parameter of the CLAIM, not an unreachable JS constant.
  p_max_attempts integer default 6
)
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
  max_attempts integer,
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
  -- run12/D4: the supervisor's ONLY implemented transport is `npx supabase db query
  -- --linked`, a direct superuser connection with no request.jwt.claims — so auth.uid()
  -- is null and is_founder_or_admin() returns FALSE. The founder check alone made this
  -- function uncallable by its own intended caller (and the failure surfaced as
  -- "migration not applied", worse than a denial). The direct-connection path is now
  -- EXPLICIT rather than accidental: someone holding superuser/service credentials
  -- already has unrestricted DB access, so recognising them here grants nothing new —
  -- but it is stated, not inferred. auth.uid() IS NULL is deliberately NOT used as the
  -- test: anon carries a JWT with a null sub and would pass it.
  if not (public.is_founder_or_admin()
          or current_user in ('postgres', 'service_role', 'supabase_admin')) then
    raise exception 'Only the founder, an admin, or the server-side supervisor identity can claim a blocked Agent Run for retry';
  end if;

  select ar.id into v_id
    from public.agent_runs ar
   where ar.status = 'blocked'::public.work_status
     and ar.retry_after is not null
     and ar.retry_after <= now()
     and ar.claimed_by is null
     -- run12/D2: the CLASSIFICATION must gate the claim in SQL. It previously lived only
     -- in supervisor.isRetryEligible(), which has zero call sites — so any blocked row
     -- carrying a retry_after was claimable, and a genuinely crashed agent would be
     -- relaunched on a timer instead of escalated. That is the precise failure this
     -- migration's own comments say must not happen.
     and ar.blocked_reason like 'PROVIDER_CAPACITY_BLOCKED%'
     -- run12/D1: the attempt cap was INCREMENTED but never COMPARED, so the loop was
     -- unbounded in SQL; the JS cap was likewise unreachable. A permanently
     -- capacity-limited campaign would have restarted forever, burning quota with no
     -- terminal state.
     and ar.attempt_count < p_max_attempts
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
           ar.attempt_count, p_max_attempts, ar.requested_provider, ar.requested_model
      from public.agent_runs ar
     where ar.id = v_id;
end;
$$;

-- run12/D7: the grant was broader than the demonstrated need — EXECUTE to every logged-in
-- user, with only the internal check stopping them. The real caller is the server-side
-- supervisor (direct superuser connection, which needs no grant) so `authenticated` is
-- revoked too; service_role covers a future PostgREST-side caller. Narrowing here costs
-- nothing today because no authenticated client calls this function.
revoke execute on function public.claim_blocked_run_for_retry(text, integer) from anon, public, authenticated;
grant execute on function public.claim_blocked_run_for_retry(text, integer) to service_role;

-- run12/D5: claim AUTHORITY was founder-only, but authority over the claim's INPUTS was
-- not — agent_runs_update_scope lets a company manager UPDATE rows for their company,
-- i.e. write worktree / checkpoint_location / source_sha / branch / retry_after /
-- claimed_by / attempt_count / blocked_reason: every field the supervisor consumes when
-- it spawns an unattended session. That is an escalation between privileged tiers (not
-- an anonymous hole — inserts are founder-only), and the smaller fix is a column-scoped
-- guard rather than rewriting the table policy, mirroring the lifecycle-guard pattern
-- already used in this schema.
create or replace function public.guard_agent_run_retry_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_founder_or_admin() or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if new.worktree is distinct from old.worktree
     or new.checkpoint_location is distinct from old.checkpoint_location
     or new.source_sha is distinct from old.source_sha
     or new.branch is distinct from old.branch
     or new.retry_after is distinct from old.retry_after
     or new.claimed_by is distinct from old.claimed_by
     or new.attempt_count is distinct from old.attempt_count
     or new.blocked_reason is distinct from old.blocked_reason
     or new.requested_provider is distinct from old.requested_provider
     or new.requested_model is distinct from old.requested_model
     or new.actual_provider is distinct from old.actual_provider
     or new.actual_model is distinct from old.actual_model then
    raise exception 'Only the founder, an admin, or the server-side supervisor identity may modify Agent Run retry/checkpoint state';
  end if;
  return new;
end;
$$;

drop trigger if exists agent_runs_guard_retry_columns on public.agent_runs;
create trigger agent_runs_guard_retry_columns
  before update on public.agent_runs
  for each row execute function public.guard_agent_run_retry_columns();

-- run12/D6: NO_SILENT_PROVIDER_FALLBACK was a schema-only guarantee — five columns that
-- nothing wrote and nothing enforced, so a substitution would have left them all null and
-- been invisible while the guarantee "read as met". A substitution now cannot be RECORDED
-- without a stated reason. (Populating requested_* at dispatch is application work,
-- tracked separately; this constraint is what makes the omission detectable rather than
-- silent.)
alter table public.agent_runs drop constraint if exists agent_runs_no_silent_provider_fallback;
alter table public.agent_runs add constraint agent_runs_no_silent_provider_fallback check (
  actual_provider is null
  or requested_provider is null
  or actual_provider = requested_provider
  or fallback_reason is not null
);
alter table public.agent_runs drop constraint if exists agent_runs_no_silent_model_fallback;
alter table public.agent_runs add constraint agent_runs_no_silent_model_fallback check (
  actual_model is null
  or requested_model is null
  or actual_model = requested_model
  or fallback_reason is not null
);

commit;

-- ROLLBACK STRATEGY (for the reviewer; not executed by this file):
--   drop function if exists public.claim_blocked_run_for_retry(text);
--   drop index if exists public.agent_runs_retry_eligible_idx;
--   alter table public.agent_runs drop column if exists <each column added above>;
-- Purely additive; the supervisor is feature-gated on the claim function existing, so
-- rolling back the migration returns the Factory to today's manual-recovery behaviour
-- without an application rollback.
