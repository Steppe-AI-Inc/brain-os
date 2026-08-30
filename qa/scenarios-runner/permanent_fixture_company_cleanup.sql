-- Permanent regression for KNOWN_FAILURE_MODES.md #33 (permanentDeleteFixtureCompanyIds /
-- permanently_delete_fixture_company_graph(), migration 202608300003). Proves, against real
-- fixture data in a rolled-back transaction, against the already-deployed
-- permanently_delete_fixture_company_graph()/check_person_delete_dependents() (not redefined
-- here — same convention as company_archive_ownership.sql):
--   0. founder + fully clean fixture company/person/assignment -> real cascade delete
--   1. idempotency: calling again on the now-deleted id -> not_found, not an error
--   2. fixture-named company with a NON-fixture-named person attached -> refused
--      (non_fixture_people_attached), nothing touched
--   3. NON-fixture-named company (even with zero dependents) -> refused (not_a_fixture),
--      nothing touched
--   4. fixture company with a non-fixture dependent resource (a goal) -> refused
--      (has_non_fixture_dependents), nothing touched
--   5. fixture company with a fixture person who owns a task IN THAT SAME COMPANY ->
--      refused at the COMPANY level (has_non_fixture_dependents/tasks) before the
--      per-person check ever runs — same-company task/goal/project/etc. dependents are
--      caught by the generic "block, don't guess" company blockers list first, by design
--   5b. fixture company with a fixture person who is a genuinely PERSON-level blocked
--       dependent with NO same-company resource blocker (they manage another person) ->
--       refused specifically as person_delete_blocked, NEITHER company nor person touched
--       (transactional: a blocked person must not leave the company half-deleted)
--   6. non-founder authenticated user -> denied, nothing touched (existence re-checked
--      as founder afterward — checking as the denied non-founder caller would be a false
--      negative under RLS visibility, not proof of an actual delete)
--   7. not-found id (never existed) -> reason not_found
-- This is the exact real incident class from KNOWN_FAILURE_MODES.md #33: a founder asked
-- Brain Chat to "delete all data related to test4 company", confirmed, and got "Confirmed —
-- Permanently delete test4 company, test4 employee..." with ZERO real mutation behind it.
begin;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- ===== 0. happy path: fully clean fixture graph, real cascade delete =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0001-0000-0000-0000-000000000001','QA-VERIFY-DELETE-CO','active','legal_entity');
insert into public.people (id, company_id, full_name, active)
  values ('fcfc0001-0000-0000-0000-000000000002','fcfc0001-0000-0000-0000-000000000001','QA-VERIFY-DELETE-PERSON', true);
insert into public.person_assignments (id, person_id, legal_employer_company_id, operating_company_id, job_title, state)
  values ('fcfc0001-0000-0000-0000-000000000003','fcfc0001-0000-0000-0000-000000000002','fcfc0001-0000-0000-0000-000000000001','fcfc0001-0000-0000-0000-000000000001','QA Tester', 'current');
select set_config('pfc.scenario0', (public.permanently_delete_fixture_company_graph('fcfc0001-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario0_company_gone', (not exists(select 1 from public.companies where id='fcfc0001-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario0_person_gone', (not exists(select 1 from public.people where id='fcfc0001-0000-0000-0000-000000000002'))::text, true);
select set_config('pfc.scenario0_assignment_gone', (not exists(select 1 from public.person_assignments where id='fcfc0001-0000-0000-0000-000000000003'))::text, true);

-- ===== 1. idempotency: same id again, already gone =====
select set_config('pfc.scenario1', (public.permanently_delete_fixture_company_graph('fcfc0001-0000-0000-0000-000000000001'))::text, true);

-- ===== 2. non-fixture PERSON attached to a fixture-named company =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0002-0000-0000-0000-000000000001','QA-VERIFY-DELETE-CO-B','active','legal_entity');
insert into public.people (id, company_id, full_name, active)
  values ('fcfc0002-0000-0000-0000-000000000002','fcfc0002-0000-0000-0000-000000000001','Bob RealEmployee NonFixture', true);
select set_config('pfc.scenario2', (public.permanently_delete_fixture_company_graph('fcfc0002-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario2_company_survives', (exists(select 1 from public.companies where id='fcfc0002-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario2_person_survives', (exists(select 1 from public.people where id='fcfc0002-0000-0000-0000-000000000002'))::text, true);

-- ===== 3. non-fixture COMPANY name (real-looking company, zero dependents) =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0003-0000-0000-0000-000000000001','RealCo-VERIFY-NotAFixture','active','legal_entity');
select set_config('pfc.scenario3', (public.permanently_delete_fixture_company_graph('fcfc0003-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario3_company_survives', (exists(select 1 from public.companies where id='fcfc0003-0000-0000-0000-000000000001'))::text, true);

-- ===== 4. fixture company with a non-fixture dependent resource (a goal) =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0004-0000-0000-0000-000000000001','QA-VERIFY-DELETE-CO-D','active','legal_entity');
insert into public.goals (id, company_id, title, status)
  values ('fcfc0004-0000-0000-0000-000000000002','fcfc0004-0000-0000-0000-000000000001','QA-VERIFY test goal','draft');
select set_config('pfc.scenario4', (public.permanently_delete_fixture_company_graph('fcfc0004-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario4_company_survives', (exists(select 1 from public.companies where id='fcfc0004-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario4_goal_survives', (exists(select 1 from public.goals where id='fcfc0004-0000-0000-0000-000000000002'))::text, true);

-- ===== 5. fixture person who owns a task IN THE SAME company -> company-level blocker
-- fires first (tasks), same "has_non_fixture_dependents" reason as scenario 4 =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0005-0000-0000-0000-000000000001','QA-VERIFY-DELETE-CO-E','active','legal_entity');
insert into public.people (id, company_id, full_name, active)
  values ('fcfc0005-0000-0000-0000-000000000002','fcfc0005-0000-0000-0000-000000000001','QA-VERIFY-DELETE-PERSON-E', true);
insert into public.tasks (id, company_id, title, owner_type, owner_person_id)
  values ('fcfc0005-0000-0000-0000-000000000003','fcfc0005-0000-0000-0000-000000000001','QA-VERIFY task owned by fixture person','human','fcfc0005-0000-0000-0000-000000000002');
select set_config('pfc.scenario5', (public.permanently_delete_fixture_company_graph('fcfc0005-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario5_company_survives', (exists(select 1 from public.companies where id='fcfc0005-0000-0000-0000-000000000001'))::text, true);
select set_config('pfc.scenario5_person_survives', (exists(select 1 from public.people where id='fcfc0005-0000-0000-0000-000000000002'))::text, true);

-- ===== 5b. genuinely PERSON-level blocked dependent, no same-company resource blocker:
-- the fixture person is another (fixture-named) person's manager. "people.manager_person_id"
-- is NOT one of the company-level blockers checked above, so this can only be caught by
-- check_person_delete_dependents() itself — proves that per-person check is real and not
-- merely shadowed by the company-level list. =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0005-0000-0000-0000-000000000004','QA-VERIFY-DELETE-CO-E2','active','legal_entity');
insert into public.people (id, company_id, full_name, active)
  values ('fcfc0005-0000-0000-0000-000000000005','fcfc0005-0000-0000-0000-000000000004','QA-VERIFY-DELETE-MANAGER', true);
insert into public.people (id, company_id, full_name, active, manager_person_id)
  values ('fcfc0005-0000-0000-0000-000000000006','fcfc0005-0000-0000-0000-000000000004','QA-VERIFY-DELETE-REPORT', true, 'fcfc0005-0000-0000-0000-000000000005');
select set_config('pfc.scenario5b', (public.permanently_delete_fixture_company_graph('fcfc0005-0000-0000-0000-000000000004'))::text, true);
select set_config('pfc.scenario5b_company_survives', (exists(select 1 from public.companies where id='fcfc0005-0000-0000-0000-000000000004'))::text, true);
select set_config('pfc.scenario5b_manager_survives', (exists(select 1 from public.people where id='fcfc0005-0000-0000-0000-000000000005'))::text, true);
select set_config('pfc.scenario5b_report_survives', (exists(select 1 from public.people where id='fcfc0005-0000-0000-0000-000000000006'))::text, true);

-- ===== 6. non-founder authenticated user -> denied =====
insert into public.companies (id, name, status, organization_type)
  values ('fcfc0006-0000-0000-0000-000000000001','QA-VERIFY-DELETE-CO-F','active','legal_entity');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('pfc.scenario6', (public.permanently_delete_fixture_company_graph('fcfc0006-0000-0000-0000-000000000001'))::text, true);
reset role;
-- Re-check existence as FOUNDER, not as the denied non-founder caller — checking under
-- the denied user's own role would conflate "RLS hides this row from you" with "this row
-- was actually deleted," which are not the same thing and must not be tested as if they
-- were.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('pfc.scenario6_company_survives', (exists(select 1 from public.companies where id='fcfc0006-0000-0000-0000-000000000001'))::text, true);
reset role;

-- ===== 7. not-found id (never existed) =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('pfc.scenario7', (public.permanently_delete_fixture_company_graph('00000000-1111-2222-3333-444444444444'))::text, true);
reset role;

select json_build_object(
  'scenario', 'PERMANENT-FIXTURE-COMPANY-CLEANUP',
  'classification', 'FIXED (KNOWN_FAILURE_MODES.md #33 — see migration 202608300003_permanent_fixture_company_cleanup.sql)',
  'scenario0_happy_path', current_setting('pfc.scenario0', true)::jsonb,
  'scenario0_company_gone', current_setting('pfc.scenario0_company_gone', true) = 'true',
  'scenario0_person_gone', current_setting('pfc.scenario0_person_gone', true) = 'true',
  'scenario0_assignment_gone', current_setting('pfc.scenario0_assignment_gone', true) = 'true',
  'scenario1_idempotent_not_found', current_setting('pfc.scenario1', true)::jsonb,
  'scenario2_non_fixture_person', current_setting('pfc.scenario2', true)::jsonb,
  'scenario2_company_survives', current_setting('pfc.scenario2_company_survives', true) = 'true',
  'scenario2_person_survives', current_setting('pfc.scenario2_person_survives', true) = 'true',
  'scenario3_not_a_fixture', current_setting('pfc.scenario3', true)::jsonb,
  'scenario3_company_survives', current_setting('pfc.scenario3_company_survives', true) = 'true',
  'scenario4_non_fixture_dependents', current_setting('pfc.scenario4', true)::jsonb,
  'scenario4_company_survives', current_setting('pfc.scenario4_company_survives', true) = 'true',
  'scenario4_goal_survives', current_setting('pfc.scenario4_goal_survives', true) = 'true',
  'scenario5_same_company_task_blocker', current_setting('pfc.scenario5', true)::jsonb,
  'scenario5_company_survives', current_setting('pfc.scenario5_company_survives', true) = 'true',
  'scenario5_person_survives', current_setting('pfc.scenario5_person_survives', true) = 'true',
  'scenario5b_person_delete_blocked', current_setting('pfc.scenario5b', true)::jsonb,
  'scenario5b_company_survives', current_setting('pfc.scenario5b_company_survives', true) = 'true',
  'scenario5b_manager_survives', current_setting('pfc.scenario5b_manager_survives', true) = 'true',
  'scenario5b_report_survives', current_setting('pfc.scenario5b_report_survives', true) = 'true',
  'scenario6_denied', current_setting('pfc.scenario6', true)::jsonb,
  'scenario6_company_survives', current_setting('pfc.scenario6_company_survives', true) = 'true',
  'scenario7_not_found', current_setting('pfc.scenario7', true)::jsonb,
  'all_pass', (
        (current_setting('pfc.scenario0', true)::jsonb->>'reason') = 'deleted'
    and (current_setting('pfc.scenario0', true)::jsonb->>'changed') = 'true'
    and current_setting('pfc.scenario0_company_gone', true) = 'true'
    and current_setting('pfc.scenario0_person_gone', true) = 'true'
    and current_setting('pfc.scenario0_assignment_gone', true) = 'true'
    and (current_setting('pfc.scenario1', true)::jsonb->>'reason') = 'not_found'
    and (current_setting('pfc.scenario2', true)::jsonb->>'reason') = 'non_fixture_people_attached'
    and current_setting('pfc.scenario2_company_survives', true) = 'true'
    and current_setting('pfc.scenario2_person_survives', true) = 'true'
    and (current_setting('pfc.scenario3', true)::jsonb->>'reason') = 'not_a_fixture'
    and current_setting('pfc.scenario3_company_survives', true) = 'true'
    and (current_setting('pfc.scenario4', true)::jsonb->>'reason') = 'has_non_fixture_dependents'
    and current_setting('pfc.scenario4_company_survives', true) = 'true'
    and current_setting('pfc.scenario4_goal_survives', true) = 'true'
    and (current_setting('pfc.scenario5', true)::jsonb->>'reason') = 'has_non_fixture_dependents'
    and current_setting('pfc.scenario5_company_survives', true) = 'true'
    and current_setting('pfc.scenario5_person_survives', true) = 'true'
    and (current_setting('pfc.scenario5b', true)::jsonb->>'reason') = 'person_delete_blocked'
    and current_setting('pfc.scenario5b_company_survives', true) = 'true'
    and current_setting('pfc.scenario5b_manager_survives', true) = 'true'
    and current_setting('pfc.scenario5b_report_survives', true) = 'true'
    and (current_setting('pfc.scenario6', true)::jsonb->>'reason') = 'denied'
    and current_setting('pfc.scenario6_company_survives', true) = 'true'
    and (current_setting('pfc.scenario7', true)::jsonb->>'reason') = 'not_found'
  )
) as verdict;

rollback;
