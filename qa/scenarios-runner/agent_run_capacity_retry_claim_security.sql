-- Permanent regression: AGENT-RUN CAPACITY-RETRY CLAIM — eligibility, boundedness,
-- re-claimability, and authority.
--
-- Covers migration 202609030001_agent_run_capacity_retry.sql (claim_blocked_run_for_retry)
-- and the four DB-side defects found by independent verification on 2026-09-03
-- (qa/KNOWN_FAILURE_MODES.md #62). Every one of them exists because the supervisor's
-- SAFETY INVARIANTS LIVE IN A PURE JS FUNCTION (`supervisor.isRetryEligible`) THAT THE
-- LIVE PATH NEVER CALLS — `pollOnce` calls the RPC and spawns immediately, and the RPC's
-- own WHERE clause is weaker than the JS predicate. The RPC's RETURNS TABLE does not even
-- expose status/blocked_reason/retry_after/claimed_by, so the JS guard is structurally
-- incapable of re-checking what the RPC decided. This file therefore asserts the
-- invariants WHERE THEY MUST ACTUALLY HOLD: in SQL.
--
--   D1 ATTEMPT CAP NOT ENFORCED IN SQL      — supervisor.MAX_ATTEMPTS (6) is never applied
--                                             by the RPC; attempt_count is incremented but
--                                             never bounded.
--   D2 UNCLASSIFIED FAILURE IS CLAIMABLE    — the RPC filters on status/retry_after only,
--                                             never on blocked_reason. Any blocked run
--                                             that acquires a retry_after auto-restarts.
--   D3 claimed_by IS NEVER RESET            — nothing anywhere clears it, so a run can be
--                                             retried exactly ONCE and is then permanently
--                                             unclaimable (a stranded Work Order).
--   D4 SUPERVISOR'S OWN TRANSPORT IS DENIED — the supervisor reaches Postgres via
--                                             `npx supabase db query --linked` (superuser,
--                                             no JWT), where is_founder_or_admin() is
--                                             FALSE, so the RPC raises. pollOnce catches
--                                             that and reports "migration not applied".
--
-- D1+D2 and D3 are in direct tension and MUST be fixed together: today D3 is the only
-- thing preventing D1's unbounded restart loop. Fixing D3 alone turns a stranded run into
-- a run that restarts forever, burning provider quota. Do not land a partial fix.
--
-- Runs BEFORE or AFTER the push: the DDL below is a verbatim copy of the migration's, so
-- `add column if not exists` / `create or replace` are no-ops once 202609030001 is live.
-- Everything is inside begin;...rollback;. Zero residue.
--
-- STATUS ON AUTHORING (2026-09-03): NOT YET EXECUTED. The authoring session had no
-- approved database transport (`supabase db query` required interactive approval), so
-- every expectation below is derived from the committed SQL text, not from a live run.
-- The first session with DB access must run this and record the real verdict.
--   npx supabase db query --linked --file qa/scenarios-runner/agent_run_capacity_retry_claim_security.sql

begin;

-- ================== DDL under test (verbatim from 202609030001) ==================
alter table public.agent_runs add column if not exists blocked_at timestamptz;
alter table public.agent_runs add column if not exists retry_after timestamptz;
alter table public.agent_runs add column if not exists attempt_count integer not null default 1;
alter table public.agent_runs add column if not exists checkpoint_location text;
alter table public.agent_runs add column if not exists source_sha text;
alter table public.agent_runs add column if not exists worktree text;
alter table public.agent_runs add column if not exists last_completed_scenario text;
alter table public.agent_runs add column if not exists remaining_scenarios jsonb;
alter table public.agent_runs add column if not exists verification_campaign_id text;
alter table public.agent_runs add column if not exists requested_provider text;
alter table public.agent_runs add column if not exists requested_model text;
alter table public.agent_runs add column if not exists actual_provider text;
alter table public.agent_runs add column if not exists actual_model text;
alter table public.agent_runs add column if not exists fallback_reason text;
alter table public.agent_runs add column if not exists claimed_by text;
alter table public.agent_runs add column if not exists claimed_at timestamptz;

-- ================== R-ART9: THIS FILE NO LONGER DEFINES THE FUNCTION ==================
-- It used to. A round-1-era version of this script did `create or replace function
-- public.claim_blocked_run_for_retry(p_claimed_by text)` right here, followed by
-- `grant execute ... to authenticated` — and both are now the OPPOSITE of what shipped.
-- Migration 202609030001 revoked `authenticated` (D7), and the function takes three
-- parameters, not one (D1's attempt cap and R-D4's stale-claim window are real parameters
-- of the claim, not unreachable JS constants).
--
-- Two things were wrong with leaving that in place, and the second is the worse one:
--   * a permanent regression artifact that ASSERTS THE PRE-FIX STATE is worse than no
--     regression artifact, because it turns a known vulnerability into a green check;
--   * `create or replace` with the old 1-arg signature does not replace the shipped 3-arg
--     function - it creates a SECOND OVERLOAD. Every 1-arg call below would then have
--     bound to the local stale copy, so this file would have tested ITSELF rather than the
--     migration, while appearing to test the migration.
--
-- This file now exercises THE SHIPPED FUNCTION. The 1-arg calls below stay valid because
-- p_max_attempts and p_stale_claim_after are DEFAULTED; a call site probing a specific cap
-- or window passes it explicitly.
--
-- Precondition: refuse to run at all unless the shipped state is what we think it is. A
-- suite that runs against the wrong schema reports confidently about the wrong thing.
do $precondition$
declare
  v_args text;
  v_oid oid;
  v_authenticated_has_execute boolean;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid) into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_blocked_run_for_retry';

  if v_args is null then
    raise exception 'claim_blocked_run_for_retry does not exist - migration 202609030001 is not applied; this suite has nothing to test';
  end if;
  if v_args <> 'text, integer, interval' then
    raise exception 'claim_blocked_run_for_retry has signature (%), expected (text, integer, interval). Either the migration is not applied, or a stale overload exists.', v_args;
  end if;

  -- D7 is a shipped security decision: the real caller is the server-side supervisor on a
  -- direct superuser connection, which needs no grant at all. If `authenticated` regains
  -- EXECUTE, that decision has been reverted and this suite must not paper over it.
  select has_function_privilege('authenticated', v_oid, 'EXECUTE') into v_authenticated_has_execute;
  if v_authenticated_has_execute then
    raise exception 'D7 REGRESSION: authenticated has EXECUTE on claim_blocked_run_for_retry; the migration revokes it';
  end if;
end;
$precondition$;

-- ================== Fixtures — synthetic only, never real factory runs ==================
-- Every other blocked+retryable run is parked out of the way first, so `order by
-- retry_after limit 1` deterministically returns OUR fixture and never a real Work Order.
update public.agent_runs set retry_after = null
 where status = 'blocked'::public.work_status and retry_after is not null;

insert into public.agent_runs (id, company_id, status, blocked_reason, blocked_at, retry_after,
                               attempt_count, claimed_by, worktree, source_sha, branch, execution_provider)
values
  -- F1: a genuine, eligible provider-capacity block.
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
   'blocked', 'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now(), now() - interval '5 min',
   1, null, 'C:\Users\Dell\dev\brain-os', 'abc1234', 'pending/qa-verify', 'claude_code_background'),
  -- F2: attempts already exhausted (supervisor.MAX_ATTEMPTS = 6).
  ('aaaaaaaa-0000-4000-8000-000000000002', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
   'blocked', 'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now(), now() - interval '4 min',
   6, null, null, null, null, 'claude_code_background'),
  -- F3: a real crash, NOT a capacity block — must never auto-restart.
  ('aaaaaaaa-0000-4000-8000-000000000003', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
   'blocked', 'agent crashed: TypeError cannot read property of undefined', now(), now() - interval '3 min',
   1, null, null, null, null, 'claude_code_background'),
  -- F4: window has not arrived yet.
  ('aaaaaaaa-0000-4000-8000-000000000004', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
   'blocked', 'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now(), now() + interval '2 hour',
   1, null, null, null, null, 'claude_code_background');

-- ================== D4: the supervisor's ACTUAL transport (superuser, no JWT) ==================
-- `npx supabase db query --linked` connects as postgres with no request.jwt.claims, so
-- auth.uid() is null and is_founder_or_admin() returns false. This is the ONLY way
-- supervisor.mjs talks to the database.
select set_config('t.cli_context_is_founder', public.is_founder_or_admin()::text, true);
do $$
begin
  begin
    perform public.claim_blocked_run_for_retry('supervisor-cli-transport');
    perform set_config('t.cli_transport_can_claim', 'true', true);
  exception when others then
    perform set_config('t.cli_transport_can_claim', 'false', true);
  end;
end $$;

-- ================== Authority: anon and ordinary employee ==================
select set_config('t.anon_grant_exists',
  (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='claim_blocked_run_for_retry'
              and p.proacl is not null
              and exists (select 1 from unnest(p.proacl) a where a::text like 'anon=%')))::text, true);

do $$
begin
  begin
    set local role anon;
    perform public.claim_blocked_run_for_retry('anon-attack');
    reset role;
    perform set_config('t.anon_denied', 'false', true);
  exception when others then
    reset role;
    perform set_config('t.anon_denied', 'true', true);
  end;
end $$;

do $$
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"9c92a8d5-853c-4ef3-846a-f4fe8c42d97a","role":"authenticated"}', true);
    perform public.claim_blocked_run_for_retry('employee-attack');
    reset role;
    perform set_config('t.employee_denied', 'false', true);
  exception when others then
    reset role;
    perform set_config('t.employee_denied', 'true', true);
  end;
end $$;
select set_config('request.jwt.claims', null, true);

-- ================== D5 (RLS): can a non-founder FORGE the retry state itself? ==================
-- The claim RPC is founder-only, but agent_runs_update_scope also allows a COMPANY
-- MANAGER to UPDATE the row. Every field the supervisor consumes — worktree (becomes a
-- spawned process's cwd), checkpoint_location, source_sha, branch, retry_after,
-- claimed_by, attempt_count — is therefore manager-writable. Authority over the claim
-- means nothing if authority over its INPUTS is broader.
insert into public.company_memberships (profile_id, company_id, role_in_company, active)
values ('66ef2052-d002-4592-b841-82cd2171b51a', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', 'manager', true);

do $$
declare v_rows integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"9c92a8d5-853c-4ef3-846a-f4fe8c42d97a","role":"authenticated"}', true);
  begin
    update public.agent_runs
       set worktree = 'C:\Users\Dell\dev\attacker-checkout',
           retry_after = now() - interval '1 min',
           claimed_by = null,
           attempt_count = 0,
           blocked_reason = 'PROVIDER_CAPACITY_BLOCKED: forged by a company manager'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    get diagnostics v_rows = row_count;
    perform set_config('t.manager_forged_rows', v_rows::text, true);
  exception when others then
    perform set_config('t.manager_forged_rows', '-1', true);
  end;
  reset role;
end $$;
select set_config('request.jwt.claims', null, true);
-- Undo the forgery so the eligibility tests below measure the RPC, not the attack.
update public.agent_runs
   set worktree = 'C:\Users\Dell\dev\brain-os', retry_after = now() - interval '5 min',
       claimed_by = null, attempt_count = 1,
       blocked_reason = 'PROVIDER_CAPACITY_BLOCKED: retryable provider quota'
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- ================== Eligibility, as the founder (the intended caller) ==================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cbcc41cf-830d-4600-8545-3b9e22c8297f","role":"authenticated"}', true);

-- D2: park F1/F2/F4 so only the CRASHED run (F3) could possibly be picked.
update public.agent_runs set retry_after = now() + interval '9 hour'
 where id in ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002');
select set_config('t.unclassified_claimed',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-d2'))::text, true);

-- D1: only the attempts-exhausted run (F2) is in the window.
update public.agent_runs set retry_after = now() + interval '9 hour'
 where id = 'aaaaaaaa-0000-4000-8000-000000000003';
update public.agent_runs set retry_after = now() - interval '4 min', status = 'blocked'::public.work_status
 where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select set_config('t.exhausted_claimed',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-d1'))::text, true);

-- retry_after: only the future-window run (F4) remains — must not be claimable.
update public.agent_runs set retry_after = now() + interval '9 hour', status = 'blocked'::public.work_status
 where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select set_config('t.future_window_claimed',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-window'))::text, true);

-- Happy path + monotonic attempt_count + no double-claim of the same row.
update public.agent_runs set retry_after = now() - interval '5 min', status = 'blocked'::public.work_status,
       claimed_by = null, attempt_count = 1
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.agent_runs set retry_after = now() + interval '9 hour'
 where id in ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003',
              'aaaaaaaa-0000-4000-8000-000000000004');
select set_config('t.first_claim_rows',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-A'))::text, true);
select set_config('t.after_claim_status',
  (select status::text from public.agent_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'), true);
select set_config('t.after_claim_attempts',
  (select attempt_count::text from public.agent_runs where id = 'aaaaaaaa-0000-4000-8000-000000000001'), true);
-- A second supervisor polling immediately must get nothing (the row is no longer blocked).
select set_config('t.second_claim_rows',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-B'))::text, true);

-- D3: the run gets capacity-blocked AGAIN. This replays exactly what
-- supervisor.recordCapacityBlock() writes — note it does NOT clear claimed_by, because
-- nothing in the entire codebase ever does.
update public.agent_runs
   set status = 'blocked'::public.work_status,
       blocked_reason = 'PROVIDER_CAPACITY_BLOCKED: retryable provider quota',
       blocked_at = now(), retry_after = now() - interval '1 min'
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select set_config('t.reblocked_claim_rows',
  (select count(*) from public.claim_blocked_run_for_retry('supervisor-C'))::text, true);

reset role;
select set_config('request.jwt.claims', null, true);

-- ================== Verdict ==================
select json_build_object(
  'D4_supervisor_cli_transport',  json_build_object(
     'is_founder_or_admin_under_cli', current_setting('t.cli_context_is_founder')::boolean,
     'cli_transport_can_claim',       current_setting('t.cli_transport_can_claim')::boolean,
     'pass', current_setting('t.cli_transport_can_claim')::boolean,
     'note', 'FAIL here means the supervisor can never claim anything through its only implemented transport, and pollOnce silently reports "migration not applied".'),
  'authority', json_build_object(
     'anon_execute_grant_absent', not current_setting('t.anon_grant_exists')::boolean,
     'anon_denied',               current_setting('t.anon_denied')::boolean,
     'ordinary_employee_denied',  current_setting('t.employee_denied')::boolean,
     'pass', (not current_setting('t.anon_grant_exists')::boolean)
             and current_setting('t.anon_denied')::boolean
             and current_setting('t.employee_denied')::boolean),
  'D5_manager_cannot_forge_retry_inputs', json_build_object(
     'rows_a_company_manager_rewrote', current_setting('t.manager_forged_rows')::integer,
     'pass', current_setting('t.manager_forged_rows')::integer <= 0,
     'note', 'agent_runs_update_scope grants UPDATE to any company manager, so worktree/checkpoint/source_sha/retry_after/claimed_by are all writable below founder tier.'),
  'D2_unclassified_failure_not_claimable', json_build_object(
     'rows_claimed', current_setting('t.unclassified_claimed')::integer,
     'pass', current_setting('t.unclassified_claimed')::integer = 0),
  'D1_attempt_cap_enforced', json_build_object(
     'rows_claimed_at_max_attempts', current_setting('t.exhausted_claimed')::integer,
     'pass', current_setting('t.exhausted_claimed')::integer = 0),
  'retry_after_window_enforced', json_build_object(
     'rows_claimed_before_window', current_setting('t.future_window_claimed')::integer,
     'pass', current_setting('t.future_window_claimed')::integer = 0),
  'happy_path_and_no_double_claim', json_build_object(
     'first_claim_rows',  current_setting('t.first_claim_rows')::integer,
     'status_after_claim', current_setting('t.after_claim_status'),
     'attempt_count_after_claim', current_setting('t.after_claim_attempts')::integer,
     'second_claim_rows', current_setting('t.second_claim_rows')::integer,
     'pass', current_setting('t.first_claim_rows')::integer = 1
             and current_setting('t.after_claim_status') = 'in_progress'
             and current_setting('t.after_claim_attempts')::integer = 2
             and current_setting('t.second_claim_rows')::integer = 0),
  'D3_reblocked_run_is_claimable_again', json_build_object(
     'rows_claimed_after_second_block', current_setting('t.reblocked_claim_rows')::integer,
     'pass', current_setting('t.reblocked_claim_rows')::integer = 1,
     'note', 'FAIL here means one capacity block is recoverable and the second strands the Work Order forever, because claimed_by is never reset.'),
  'all_pass', (
       current_setting('t.cli_transport_can_claim')::boolean
   and not current_setting('t.anon_grant_exists')::boolean
   and current_setting('t.anon_denied')::boolean
   and current_setting('t.employee_denied')::boolean
   and current_setting('t.manager_forged_rows')::integer <= 0
   and current_setting('t.unclassified_claimed')::integer = 0
   and current_setting('t.exhausted_claimed')::integer = 0
   and current_setting('t.future_window_claimed')::integer = 0
   and current_setting('t.first_claim_rows')::integer = 1
   and current_setting('t.after_claim_status') = 'in_progress'
   and current_setting('t.after_claim_attempts')::integer = 2
   and current_setting('t.second_claim_rows')::integer = 0
   and current_setting('t.reblocked_claim_rows')::integer = 1)
) as verdict;

rollback;
