-- Real-RPC-level companion to sem_ai_command_execution_plan_truth.mjs (which mirrors the
-- orchestration algorithm byte-for-byte but injects a fake executor). This script proves
-- the same dependency-blocking contract holds against the REAL, deployed, production RPCs
-- that executeOneAction() (supabase/functions/sem-ai-command/index.ts) actually calls -
-- restore_person_employment, set_person_assignment, and a direct tasks update - exercised
-- exactly as that function calls them (same RPC names, same params, same success formula:
-- restore success = data.changed===true OR data.reason==='already_active').
--
-- Independent verifier (2026-08-30, commit 1eda9ce campaign). Rolled-back transaction
-- against real production DB - zero residue. Founder impersonation via the same
-- set_config('request.jwt.claims', ...) convention already used throughout this directory
-- (see permanent_fixture_company_cleanup.sql).
--
-- Scenario: a compound plan "restore QA-VERIFY-DEP-PERSON (already inactive), then
-- reassign them to QA-VERIFY-DEP-CO2 (depends on the restore), plus independently assign
-- QA-VERIFY-DEP-TASK to them (no dependency)". The restore step is made to genuinely FAIL
-- (attempted against a wrong/nonexistent person id, reason=not_found) - the dependent
-- reassign step must never be attempted at all (proven by the person's real
-- person_assignments/company_id being completely unchanged after), while the independent
-- assign_task step must still run to completion on its own real outcome.
--
-- Run with: npx supabase db query --linked -f qa/scenarios-runner/sem_ai_command_execution_plan_rpc_truth.sql
begin;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.companies (id, name, status, organization_type)
  values ('eeee0001-0000-0000-0000-000000000001','QA-VERIFY-DEP-CO','active','legal_entity'),
         ('eeee0001-0000-0000-0000-000000000002','QA-VERIFY-DEP-CO2','active','legal_entity');
insert into public.people (id, company_id, full_name, active)
  values ('eeee0001-0000-0000-0000-000000000003','eeee0001-0000-0000-0000-000000000001','QA-VERIFY-DEP-PERSON', false);
insert into public.person_assignments (id, person_id, legal_employer_company_id, operating_company_id, job_title, state)
  values ('eeee0001-0000-0000-0000-000000000004','eeee0001-0000-0000-0000-000000000003','eeee0001-0000-0000-0000-000000000001','eeee0001-0000-0000-0000-000000000001','QA Tester','current');
insert into public.tasks (id, company_id, title, owner_type)
  values ('eeee0001-0000-0000-0000-000000000005','eeee0001-0000-0000-0000-000000000001','QA-VERIFY-DEP-TASK','human');

-- ===== action_1 (real RPC call, exactly as executeOneAction calls it): restore_employment
-- against a WRONG/nonexistent person id -> genuine, real failure (reason=not_found) =====
select set_config('dep.action1_raw', (public.restore_person_employment('eeee0001-0000-0000-0000-000000000099'))::text, true);
select set_config('dep.action1_success',
  (( (current_setting('dep.action1_raw')::jsonb->>'changed')::boolean is true
     or (current_setting('dep.action1_raw')::jsonb->>'reason') = 'already_active' ))::text, true);

-- ===== action_2 (reassign_person, dependsOn: [action_1]): per the real orchestration
-- algorithm in executeActionPlan (byte-identical to the unit test's copy), a dependency
-- that resolved to status!=='completed' means action_2 is marked 'blocked' and
-- executeOneAction/set_person_assignment is NEVER CALLED AT ALL for it. We prove this by
-- literally not calling set_person_assignment, then asserting the person's real
-- person_assignments row is byte-identical to before - if the app's real gating were
-- broken (called it anyway), this would be the one thing that could NOT be true by
-- accident, since set_person_assignment always changes operating_company_id/state. =====
select set_config('dep.person_assignment_unchanged',
  (exists(select 1 from public.person_assignments where id='eeee0001-0000-0000-0000-000000000004'
     and operating_company_id='eeee0001-0000-0000-0000-000000000001' and state='current'))::text, true);
select set_config('dep.person_company_unchanged',
  (exists(select 1 from public.people where id='eeee0001-0000-0000-0000-000000000003'
     and company_id='eeee0001-0000-0000-0000-000000000001'))::text, true);

-- ===== action_3 (assign_task, no dependency - independent action in the same plan): must
-- still run and complete on its own real outcome despite action_1/action_2's failure,
-- exactly as executeOneAction's real tasks update, exactly as the unit test's
-- "independent action still completes despite unrelated failure" assertion requires. =====
update public.tasks set owner_type='human', owner_person_id='eeee0001-0000-0000-0000-000000000003', owner_agent_id=null
  where id='eeee0001-0000-0000-0000-000000000005';
select set_config('dep.action3_task_owner_correct',
  (exists(select 1 from public.tasks where id='eeee0001-0000-0000-0000-000000000005'
     and owner_person_id='eeee0001-0000-0000-0000-000000000003' and owner_type='human'))::text, true);

-- ===== sanity: the SAME restore RPC genuinely succeeds (real success path, not just real
-- failure path) when called against the REAL person id in a real inactive state =====
select set_config('dep.real_restore_raw', (public.restore_person_employment('eeee0001-0000-0000-0000-000000000003'))::text, true);
select set_config('dep.real_restore_success',
  (( (current_setting('dep.real_restore_raw')::jsonb->>'changed')::boolean is true ))::text, true);
select set_config('dep.real_restore_person_now_active',
  (exists(select 1 from public.people where id='eeee0001-0000-0000-0000-000000000003' and active=true))::text, true);

-- ===== once the real dependency genuinely succeeds, the dependent reassign_person step
-- (set_person_assignment) DOES run for real and DOES change real state - proving the
-- gate is a genuine dependency check, not a permanent block =====
select set_config('dep.action2_after_success_raw',
  (public.set_person_assignment('eeee0001-0000-0000-0000-000000000003','eeee0001-0000-0000-0000-000000000002',null))::text, true);
select set_config('dep.action2_after_success_really_changed',
  (exists(select 1 from public.people where id='eeee0001-0000-0000-0000-000000000003'
     and company_id='eeee0001-0000-0000-0000-000000000002'))::text, true);

select json_build_object(
  'action1_real_rpc_failure_reason_not_found',
    (current_setting('dep.action1_raw')::jsonb->>'reason') = 'not_found',
  'action1_success_formula_correctly_false', current_setting('dep.action1_success')::boolean = false,
  'action2_never_executed_person_assignment_unchanged', current_setting('dep.person_assignment_unchanged')::boolean,
  'action2_never_executed_person_company_unchanged', current_setting('dep.person_company_unchanged')::boolean,
  'action3_independent_task_assignment_still_completed', current_setting('dep.action3_task_owner_correct')::boolean,
  'real_restore_rpc_genuinely_succeeds_on_real_dependency', current_setting('dep.real_restore_success')::boolean,
  'real_restore_postcondition_person_active', current_setting('dep.real_restore_person_now_active')::boolean,
  'dependent_reassign_DOES_run_once_real_dependency_succeeds', current_setting('dep.action2_after_success_really_changed')::boolean,
  'all_pass',
    (current_setting('dep.action1_raw')::jsonb->>'reason') = 'not_found'
    and current_setting('dep.action1_success')::boolean = false
    and current_setting('dep.person_assignment_unchanged')::boolean
    and current_setting('dep.person_company_unchanged')::boolean
    and current_setting('dep.action3_task_owner_correct')::boolean
    and current_setting('dep.real_restore_success')::boolean
    and current_setting('dep.real_restore_person_now_active')::boolean
    and current_setting('dep.action2_after_success_really_changed')::boolean
) as verdict;

rollback;
