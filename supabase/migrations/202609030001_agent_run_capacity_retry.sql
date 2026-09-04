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
-- Execution mode is recorded as DATA so a reviewer can see which dispatch path actually ran.
-- 'isolated_process' = a separate top-level `claude -p` in an isolated worktree at the
-- pinned SHA (the only mode permitted for the independent verifier);
-- 'background_subagent' = `claude --bg` from a parent session (can inherit an unactionable
-- plan/approval gate — never for verification).
alter table public.agent_runs add column if not exists execution_mode text;
alter table public.agent_runs drop constraint if exists agent_runs_execution_mode_known;
alter table public.agent_runs add constraint agent_runs_execution_mode_known check (
  execution_mode is null or execution_mode in ('isolated_process', 'background_subagent')
);

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
  p_max_attempts integer default 6,
  -- run13/R-D4: how long a claim may sit before it is treated as abandoned.
  p_stale_claim_after interval default interval '30 minutes'
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
          -- run13/R-D1: `current_user` is the WRONG primitive inside a SECURITY DEFINER
          -- function — PostgreSQL rebinds it to the function's OWNER, so this test was
          -- ALWAYS TRUE and the authority check above it was unreachable. `session_user`
          -- is the actually-connected role and is NOT rebound: it is 'postgres' for a
          -- direct superuser connection (the supervisor's transport) and 'authenticator'
          -- for every PostgREST request, whatever role it later SETs — so anon and
          -- authenticated can never satisfy it. service_role is deliberately absent: a
          -- service_role request still arrives as 'authenticator'.
          or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'Only the founder, an admin, or the server-side supervisor identity can claim a blocked Agent Run for retry';
  end if;

  select ar.id into v_id
    from public.agent_runs ar
   where ar.status = 'blocked'::public.work_status
     and ar.retry_after is not null
     and ar.retry_after <= now()
     -- run13/R-D4: a claim previously had NO expiry, and release happened only in
     -- JavaScript (recordCapacityBlock). Any path that claimed a run and then died before
     -- re-blocking it — a spawn failure, a killed supervisor — left the row
     -- in_progress with claimed_by set and PERMANENTLY unclaimable. A claim older than
     -- the reclaim window is now treated as abandoned, so recovery cannot depend on a
     -- process surviving long enough to clean up after itself. (Double-claiming stays
     -- impossible: FOR UPDATE SKIP LOCKED still serialises concurrent supervisors.)
     and (ar.claimed_by is null or ar.claimed_at < now() - p_stale_claim_after)
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
-- revoked too.
-- ROUND 3 / D-2 (P1): the previous version also GRANTED service_role "for a future
-- PostgREST-side caller" — but a service_role request through PostgREST arrives with
-- session_user = 'authenticator' and a JWT with no sub, so the authority check inside refuses
-- it: the only grantee was the one identity the function refuses, and the grant documented a
-- path that cannot work. Decision: this function is DIRECT-CONNECTION-ONLY (the supervisor's
-- transport), stated rather than implied. No role holds EXECUTE; the founder/admin branch of
-- the internal check remains for a direct founder session.
revoke execute on function public.claim_blocked_run_for_retry(text, integer, interval) from anon, public, authenticated, service_role;

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
  -- run13/R-D1 (CRITICAL, the same defect as above and the reason this trigger blocked
  -- NOBODY): SECURITY DEFINER rebinds `current_user` to the function owner, so this
  -- bypass was unconditionally true and every comparison below it was dead code — the
  -- manager escalation it was written to stop stayed fully open behind a guard that
  -- read as closed. `session_user` is not rebound.
  if public.is_founder_or_admin() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  -- run13/R-D2: the first list omitted the columns that most directly steer a resumed,
  -- unattended session — remaining_scenarios and last_completed_scenario (which decide
  -- what the resumed run SKIPS as already-certified), verification_campaign_id (which is
  -- interpolated into its prompt), status (the claim's primary gate — flipping it makes a
  -- run re-claimable or hides it), claimed_at and fallback_reason.
  -- ROUND 4 / R4-1 (P2): this comment used to claim "every column the claim RETURNS or
  -- SELECTS ON is now guarded" while canonical_work_order_id, task_id and agent_id — three
  -- columns the claim RETURNS to the supervisor that spawns an unattended session — were
  -- missing, so a company manager could re-target a blocked run at another task or agent
  -- before it resumed (the same defect as D-3, one round later). The list below is now
  -- DERIVED from the claim's return list plus the columns its predicate reads, and the
  -- liveness signals a future watchdog would trust (R4-2: last_event, last_heartbeat_at).
  -- The claim's return list and this guard are pinned to each other by
  -- qa/scenarios-runner/agent_run_guard_covers_claim_returns.mjs, so the next omission
  -- fails a suite instead of a review.
  if new.worktree is distinct from old.worktree
     or new.checkpoint_location is distinct from old.checkpoint_location
     or new.source_sha is distinct from old.source_sha
     or new.branch is distinct from old.branch
     or new.retry_after is distinct from old.retry_after
     or new.claimed_by is distinct from old.claimed_by
     or new.claimed_at is distinct from old.claimed_at
     or new.attempt_count is distinct from old.attempt_count
     or new.blocked_reason is distinct from old.blocked_reason
     or new.blocked_at is distinct from old.blocked_at
     or new.status is distinct from old.status
     or new.remaining_scenarios is distinct from old.remaining_scenarios
     or new.last_completed_scenario is distinct from old.last_completed_scenario
     or new.verification_campaign_id is distinct from old.verification_campaign_id
     or new.fallback_reason is distinct from old.fallback_reason
     or new.requested_provider is distinct from old.requested_provider
     or new.requested_model is distinct from old.requested_model
     or new.actual_provider is distinct from old.actual_provider
     or new.actual_model is distinct from old.actual_model
     -- ROUND 3 / D-3 (P2): execution_mode is the reviewer-facing attestation of which dispatch
     -- path ran, added by this same migration — and it was not in this list, so a company
     -- manager could rewrite it. A forgeable attestation is worse than none.
     or new.execution_mode is distinct from old.execution_mode
     -- ROUND 4 / R4-1: the three RETURNED columns the list omitted.
     or new.canonical_work_order_id is distinct from old.canonical_work_order_id
     or new.task_id is distinct from old.task_id
     or new.agent_id is distinct from old.agent_id
     -- ROUND 4 / R4-2: liveness signals a watchdog would trust; a forged heartbeat is a
     -- forged "still alive".
     or new.last_event is distinct from old.last_event
     or new.last_heartbeat_at is distinct from old.last_heartbeat_at then
    -- ROUND 4 / R4-9: an AUTHORITY refusal carries 42501 like every other guard in this batch,
    -- so a client (and the persona suite) can tell it from a business-rule error by SQLSTATE.
    raise exception 'Only the founder, an admin, or the server-side supervisor identity may modify Agent Run retry/checkpoint state'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ROUND 3 / A-6 class: a SECURITY DEFINER trigger function must not be PUBLIC-executable.
revoke execute on function public.guard_agent_run_retry_columns() from public, anon, authenticated;

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
--   drop function if exists public.claim_blocked_run_for_retry(text, integer, interval);
--   drop trigger if exists agent_runs_guard_retry_columns on public.agent_runs;
--   drop function if exists public.guard_agent_run_retry_columns();
--   alter table public.agent_runs drop constraint if exists agent_runs_no_silent_provider_fallback;
--   alter table public.agent_runs drop constraint if exists agent_runs_no_silent_model_fallback;
--   (run13/R-D8: the signature MUST match exactly — DROP FUNCTION IF EXISTS with the
--    wrong arity is a silent no-op that leaves the function live while the operator
--    believes it is gone.)
--   drop index if exists public.agent_runs_retry_eligible_idx;
--   alter table public.agent_runs drop column if exists blocked_at, drop column if exists retry_after,
--     drop column if exists attempt_count, drop column if exists checkpoint_location,
--     drop column if exists source_sha, drop column if exists worktree,
--     drop column if exists last_completed_scenario, drop column if exists remaining_scenarios,
--     drop column if exists verification_campaign_id, drop column if exists requested_provider,
--     drop column if exists requested_model, drop column if exists actual_provider,
--     drop column if exists actual_model, drop column if exists fallback_reason,
--     drop column if exists execution_mode, drop column if exists claimed_by, drop column if exists claimed_at;
--   (ROUND 3 / D-5: enumerated so this block can be pasted under pressure.)
-- Purely additive; the supervisor is feature-gated on the claim function existing, so
-- rolling back the migration returns the Factory to today's manual-recovery behaviour
-- without an application rollback.
