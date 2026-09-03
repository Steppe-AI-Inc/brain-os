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
  'authenticated_can_execute', has_function_privilege('authenticated',
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
insert into public.agent_runs (id, status, execution_provider, blocked_reason, retry_after, attempt_count, source_sha)
values
  ('eeee0001-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() - interval '5 minutes', 1, 'deadbeef'),
  ('eeee0002-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'PROVIDER_CAPACITY_BLOCKED: retryable provider quota', now() + interval '2 hours', 1, 'deadbeef'),
  ('eeee0003-0000-0000-0000-000000000001','blocked'::work_status,'claude_code_background',
   'agent crashed: TypeError', now() - interval '5 minutes', 1, 'deadbeef');

do $$
declare v_first uuid; v_second uuid; v_status text; v_attempts int;
begin
  select id into v_first from public.claim_blocked_run_for_retry('supervisor-A');
  -- A second supervisor claiming immediately must NOT get the same row back.
  select id into v_second from public.claim_blocked_run_for_retry('supervisor-B');
  select status::text, attempt_count into v_status, v_attempts
    from public.agent_runs where id = 'eeee0001-0000-0000-0000-000000000001';
  insert into t_verdicts values (jsonb_build_object(
    'check','claim_semantics',
    'eligible_run_was_claimed', v_first = 'eeee0001-0000-0000-0000-000000000001'::uuid,
    'second_supervisor_did_not_get_same_row', v_second is distinct from v_first,
    'future_retry_after_not_claimed', v_second is distinct from 'eeee0002-0000-0000-0000-000000000001'::uuid,
    'unclassified_failure_not_claimed', v_second is distinct from 'eeee0003-0000-0000-0000-000000000001'::uuid,
    -- BLOCKED -> RUNNING, never BLOCKED -> COMPLETED.
    'status_became_in_progress', v_status = 'in_progress',
    'attempt_count_incremented', v_attempts = 2));
end $$;

reset role;
select jsonb_pretty(jsonb_agg(verdict)) as post_apply_202609030001 from t_verdicts;

rollback;
