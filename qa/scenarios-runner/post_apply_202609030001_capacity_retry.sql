-- POST-APPLY acceptance for 202609030001_agent_run_capacity_retry.sql.
-- Run ONLY after that migration is applied. Self-cleaning (begin;…rollback;).
--
-- This is security-sensitive orchestration infrastructure: the claim RPC restarts real
-- production Agent Runs. The properties proven here are the ones that make an automatic
-- restart safe — authority, atomicity, eligibility, and provider provenance.

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- ---- 1. COLUMNS + function shape ----------------------------------------------------
insert into t_verdicts values (jsonb_build_object(
  'check', 'schema',
  'all_retry_columns_present', (
    select count(*) = 16 from information_schema.columns
     where table_schema='public' and table_name='agent_runs'
       and column_name in ('blocked_at','retry_after','attempt_count','checkpoint_location',
         'source_sha','worktree','last_completed_scenario','remaining_scenarios',
         'verification_campaign_id','requested_provider','requested_model','actual_provider',
         'actual_model','fallback_reason','claimed_by','claimed_at')),
  -- requested_ and actual_ must be SEPARATE columns: a substitution has to be visible,
  -- never implied by a single overwritten field.
  'requested_and_actual_are_separate', (
    select count(*) = 4 from information_schema.columns
     where table_schema='public' and table_name='agent_runs'
       and column_name in ('requested_provider','requested_model','actual_provider','actual_model')),
  'attempt_count_defaults_to_1', (
    select column_default like '%1%' from information_schema.columns
     where table_schema='public' and table_name='agent_runs' and column_name='attempt_count'),
  'claim_function_exists', exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='claim_blocked_run_for_retry'),
  'claim_is_security_definer', (
    select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1),
  'claim_search_path_hardened', (
    select array_to_string(p.proconfig, ',') = 'search_path=""'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1),
  'eligibility_index_present', exists(
    select 1 from pg_indexes where schemaname='public' and indexname='agent_runs_retry_eligible_idx')
));

-- ---- 2. GRANTS on the privileged RPC -------------------------------------------------
insert into t_verdicts values (jsonb_build_object(
  'check', 'grants',
  -- R-ART4: this asserted `authenticated_can_execute` - the PRE-D7 state. D7 revoked
  -- EXECUTE from `authenticated` precisely because the real caller is the server-side
  -- supervisor on a direct superuser connection, which needs no grant at all. Left as it
  -- was, this file would have reported the shipped, hardened migration as FAILING, and a
  -- correctly-narrowed grant as the defect. An acceptance script must encode the decision
  -- that shipped, not the one it replaced.
  'authenticated_cannot_execute', not has_function_privilege('authenticated',
    (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1), 'EXECUTE'),
  'service_role_can_execute', has_function_privilege('service_role',
    (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1), 'EXECUTE'),
  'anon_cannot_execute', not has_function_privilege('anon',
    (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1), 'EXECUTE'),
  'public_cannot_execute', not has_function_privilege('public',
    (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='claim_blocked_run_for_retry' limit 1), 'EXECUTE')
));

-- ---- 3. AUTHORITY: an ordinary employee cannot claim a run for retry ------------------
-- The RPC raises for non-founder/admin. Restarting a production Agent Run is real
-- factory authority; an employee-tier caller must not be able to trigger one.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','484ece55-b088-45f1-b795-a55ae2e0dbde','role','authenticated')::text, true);
do $$
declare v_err text; v_claimed boolean := false;
begin
  begin
    -- R-ART4 follow-on: with D7 shipped, `authenticated` has no EXECUTE at all, so this
    -- now fails at the GRANT (42501) rather than reaching the RPC's own founder check.
    -- Both are correct refusals and the test records WHICH, so that "an employee cannot
    -- claim a run" can never again be satisfied by an error that has nothing to do with
    -- authority - the R-ART7 failure shape.
    perform * from public.claim_blocked_run_for_retry('attacker-supervisor');
    v_claimed := true;
  exception when others then
    get stacked diagnostics v_err = MESSAGE_TEXT;
  end;
  insert into t_verdicts values (jsonb_build_object(
    'check','authority',
    'ordinary_employee_cannot_claim', not v_claimed,
    'message', left(coalesce(v_err,''), 120)));
end $$;

-- ---- 4. ELIGIBILITY + single-claim, as founder/admin against fixtures -----------------
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub',(select p.auth_user_id::text from public.profiles p where p.role='founder' limit 1),
                    'role','authenticated')::text, true);
set local role authenticated;

-- Three fixture runs: one genuinely eligible, one whose window has not arrived, one
-- blocked for an UNCLASSIFIED reason (must never auto-restart — that would loop on a
-- real bug rather than recover from a quota).
-- run12/D8 (the reviewer's finding against THIS file): two fixtures originally shared a
-- byte-identical retry_after, so "the second supervisor did not get the same row" was a
-- planner-dependent tie that could pass vacuously. Every retry_after is now distinct and
-- ordered, so the claim order is deterministic and the assertion means something.
-- A fourth fixture covers the attempt cap (D1) and a fifth the second-block recovery (D3).
insert into public.agent_runs (id, status, execution_provider, blocked_reason, retry_after, attempt_count, source_sha, claimed_by)
values
  -- eligible, oldest window -> must be claimed FIRST
  ('eeee0001-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() - interval '30 minutes', 1, 'deadbeef', null),
  -- window has not arrived
  ('eeee0002-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() + interval '2 hours', 1, 'deadbeef', null),
  -- UNCLASSIFIED failure: never auto-restart (a real bug must escalate, not loop)
  ('eeee0003-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'agent crashed: TypeError', now() - interval '20 minutes', 1, 'deadbeef', null),
  -- at the attempt cap: eligible in every other respect, must NOT be claimable (D1)
  ('eeee0004-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() - interval '25 minutes', 6, 'deadbeef', null),
  -- already claimed by another supervisor: not re-claimable
  ('eeee0005-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() - interval '15 minutes', 2, 'deadbeef', 'supervisor-Z');

do $$
declare v_first uuid; v_second uuid; v_status text; v_attempts int; v_reclaim uuid;
begin
  select id into v_first from public.claim_blocked_run_for_retry('supervisor-A');
  -- A second supervisor claiming immediately must NOT get the same row back. With
  -- distinct, ordered retry_after values this is a real assertion, not a planner tie.
  select id into v_second from public.claim_blocked_run_for_retry('supervisor-B');
  select status::text, attempt_count into v_status, v_attempts
    from public.agent_runs where id = 'eeee0001-0000-0000-0000-000000000001';
  insert into t_verdicts values (jsonb_build_object(
    'check','claim_semantics',
    'oldest_eligible_run_claimed_first', v_first = 'eeee0001-0000-0000-0000-000000000001'::uuid,
    'second_supervisor_did_not_get_same_row', v_second is distinct from v_first,
    'future_retry_after_never_claimed', v_second is distinct from 'eeee0002-0000-0000-0000-000000000001'::uuid,
    'unclassified_failure_never_claimed', v_second is distinct from 'eeee0003-0000-0000-0000-000000000001'::uuid,
    -- D1: at the cap, eligible in every other respect, still not claimable.
    'attempt_cap_enforced', v_second is distinct from 'eeee0004-0000-0000-0000-000000000001'::uuid,
    -- Already claimed by supervisor-Z.
    'claimed_run_never_reclaimed', v_second is distinct from 'eeee0005-0000-0000-0000-000000000001'::uuid,
    -- BLOCKED -> RUNNING, never BLOCKED -> COMPLETED.
    'status_became_in_progress', v_status = 'in_progress',
    'attempt_count_incremented', v_attempts = 2));

  -- D3: a run capacity-blocked a SECOND time must be recoverable again. Simulate the
  -- re-block the supervisor performs (claim released) and confirm it is claimable.
  update public.agent_runs
     set status = 'blocked'::work_status, claimed_by = null, claimed_at = null,
         retry_after = now() - interval '1 minute'
   where id = 'eeee0001-0000-0000-0000-000000000001';
  select id into v_reclaim from public.claim_blocked_run_for_retry('supervisor-C');
  insert into t_verdicts values (jsonb_build_object(
    'check','second_block_recovery',
    'reblocked_run_is_claimable_again', v_reclaim = 'eeee0001-0000-0000-0000-000000000001'::uuid));
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as post_apply_202609030001 from t_verdicts;


-- ---- R-ART8: MACHINE-DECIDED VERDICT ------------------------------------------------
-- Every one of these files previously ended by printing a raw JSON blob for a human to
-- eyeball. Eyeballing is how a vacuous pass survives: three of the four scripts in this
-- batch were reported as passing when one aborted before its assertions ran, one was
-- refused by a PRIMARY KEY rather than the CHECK it tested, and one by a FOREIGN KEY
-- rather than the RLS it tested. A file must state its own verdict.
--
-- Convention: any key whose name is SHOUTED (upper-case) is a DEFECT marker - true means
-- something bad is present. Any other boolean key is an EXPECTATION - false means the
-- property this file exists to prove does not hold.
select
  count(*) filter (where defect_present)  as defect_markers_true,
  count(*) filter (where expectation_failed) as expectations_false,
  case when count(*) filter (where defect_present or expectation_failed) = 0
       then 'PASS' else 'FAIL' end        as verdict,
  jsonb_agg(kv.key) filter (where defect_present or expectation_failed) as failing_keys
from t_verdicts v,
     lateral jsonb_each(v.verdict) as kv(key, val),
     lateral (select
       (kv.key = upper(kv.key) and kv.key ~ '[A-Z]{4}' and kv.val = 'true'::jsonb) as defect_present,
       (kv.key <> upper(kv.key) and jsonb_typeof(kv.val) = 'boolean' and kv.val = 'false'::jsonb) as expectation_failed
     ) f;

rollback;
