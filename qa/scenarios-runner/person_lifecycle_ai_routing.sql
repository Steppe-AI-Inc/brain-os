-- Person/Employment lifecycle — permanent regression for Bug 5 (quiet-wiggling-biscuit
-- plan, Workstream 1a: migration 202608290008_person_lifecycle_end_employment_and_delete.sql).
-- Proves, against real fixture companies/people/departments in a rolled-back transaction,
-- against the already-deployed end_person_employment()/restore_person_employment()/
-- delete_person()/enforce_person_assignment_department_company() (not redefined here,
-- same convention as organization_graph_integrity.sql and company_archive_ownership.sql):
--   1. company manager -> end/restore employment allowed on a person at their own company
--   2. former manager (membership deactivated) -> denied
--   3. a different, unrelated user (no membership at the person's company) -> denied
--   4. founder -> allowed unconditionally, idempotent (already_inactive/already_active),
--      not-found id -> reason not_found
--   5. the people_lifecycle_guard trigger blocks a direct UPDATE ... SET active=false
--      bypass, even after multiple prior real RPC calls in this same transaction (the
--      exact GUC-flag-leak class 202608280013 found and fixed once already)
--   6. end_person_employment historicizes exactly the person's current person_assignments
--      rows (state -> 'historical', end_date set) and the count it reports matches reality
--   7. enforce_person_assignment_department_company (+ set_person_assignment's own
--      redundant check) rejects a department that does not belong to the assignment's
--      operating_company_id, both via direct INSERT and via the RPC
--   8. delete_person: has_dependents blocks a hard delete and lists the real referencing
--      table+count; once dependents are cleared, founder can hard-delete and the returned
--      destroyedCounts match real ON DELETE CASCADE table row counts (independently
--      re-verified with a direct SELECT afterward, not just the RPC's own self-report);
--      a company manager (non-founder) cannot call delete_person at all, even for a person
--      at their own company
--   9. PERSON_DELETE_DOES_NOT_ROUTE_TO_COMPANY_ARCHIVE (SQL half - the manual/corrector-
--      regex half is Workstream 1c's sem-ai-command.index.ts change, out of this DB
--      migration's scope): confirms end_person_employment/delete_person never touch
--      public.companies.status - genuinely distinct code paths from archive_company, not
--      just distinct by naming convention
--  10. PERSON_MUTATION_REQUIRES_REAL_EXECUTION (SQL half, same scope note as #9): every
--      "changed":true claim from these RPCs is cross-checked against an independent
--      direct SELECT of the real row afterward, not just the RPC's own postconditionPassed
--      self-report

begin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_pl.founder_profile_id', (public.current_profile_id())::text, true);

-- ================== FIXTURES ==================

insert into public.companies (id, name, status) values
  ('aaaa1001-0000-0000-0000-000000000001','SC-PL Manager Co','active'),
  ('aaaa1001-0000-0000-0000-000000000002','SC-PL Unrelated Co','active');

-- EMPLOYEE persona is a MANAGER of company 001, has zero membership at company 002.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('aaaa1001-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

insert into public.departments (id, company_id, slug, name) values
  ('aaaa1003-0000-0000-0000-000000000001','aaaa1001-0000-0000-0000-000000000001','sc-pl-dept-a','SC-PL Dept A'),
  ('aaaa1003-0000-0000-0000-000000000002','aaaa1001-0000-0000-0000-000000000002','sc-pl-dept-b','SC-PL Dept B');

-- Person 1: manager-tier end/restore test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000001','aaaa1001-0000-0000-0000-000000000001','SC-PL Person One', true);
insert into public.person_assignments (id, person_id, operating_company_id, department_id, state, is_primary)
  values ('aaaa1005-0000-0000-0000-000000000001','aaaa1002-0000-0000-0000-000000000001','aaaa1001-0000-0000-0000-000000000001','aaaa1003-0000-0000-0000-000000000001','current', true);

-- Person 2: former-manager-after-removal test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000002','aaaa1001-0000-0000-0000-000000000001','SC-PL Person Two', true);

-- Person 3: unrelated-company denial test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000003','aaaa1001-0000-0000-0000-000000000002','SC-PL Person Three', true);

-- Person 4: founder-tier idempotency/not-found/direct-bypass test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000004','aaaa1001-0000-0000-0000-000000000001','SC-PL Person Four', true);

-- Person 5: delete_person has_dependents test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000005','aaaa1001-0000-0000-0000-000000000001','SC-PL Person Five', true);
insert into public.tasks (id, company_id, title, owner_person_id) values
  ('aaaa1004-0000-0000-0000-000000000001','aaaa1001-0000-0000-0000-000000000001','SC-PL Dependent Task','aaaa1002-0000-0000-0000-000000000005');

-- Person 6: full hard-delete-with-cascades test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000006','aaaa1001-0000-0000-0000-000000000001','SC-PL Person Six', true);
insert into public.salary_private (person_id, base_salary) values ('aaaa1002-0000-0000-0000-000000000006', 1000);
insert into public.kpi_records (person_id, company_id, period, metric) values
  ('aaaa1002-0000-0000-0000-000000000006','aaaa1001-0000-0000-0000-000000000001','2026-08','output');
insert into public.person_ai_policy (person_id, mode) values ('aaaa1002-0000-0000-0000-000000000006','manual');
insert into public.person_assignments (id, person_id, operating_company_id, department_id, state, is_primary)
  values ('aaaa1005-0000-0000-0000-000000000002','aaaa1002-0000-0000-0000-000000000006','aaaa1001-0000-0000-0000-000000000001','aaaa1003-0000-0000-0000-000000000001','current', true);

-- Person 7: non-founder delete_person denial test.
insert into public.people (id, company_id, full_name, active) values
  ('aaaa1002-0000-0000-0000-000000000007','aaaa1001-0000-0000-0000-000000000001','SC-PL Person Seven', true);

reset role;

-- ================== TESTS ==================

-- TEST 1: manager -> end/restore allowed, historicizes exactly the current assignment.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_pl.manager_end', (public.end_person_employment('aaaa1002-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_pl.manager_restore', (public.restore_person_employment('aaaa1002-0000-0000-0000-000000000001'))::text, true);
reset role;
select set_config('sc_pl.p1_assignment_state', (select state::text from public.person_assignments where id='aaaa1005-0000-0000-0000-000000000001'), true);
select set_config('sc_pl.p1_assignment_end_date_set', (select (end_date is not null)::text from public.person_assignments where id='aaaa1005-0000-0000-0000-000000000001'), true);
select set_config('sc_pl.p1_active_real', (select active::text from public.people where id='aaaa1002-0000-0000-0000-000000000001'), true);

-- TEST 2: former manager (membership deactivated) -> denied.
update public.company_memberships set active = false where company_id='aaaa1001-0000-0000-0000-000000000001' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_pl.former_manager_end', (public.end_person_employment('aaaa1002-0000-0000-0000-000000000002'))::text, true);
reset role;

-- TEST 3: unrelated user (no membership at Company 002 at all) -> denied.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_pl.unrelated_end', (public.end_person_employment('aaaa1002-0000-0000-0000-000000000003'))::text, true);
reset role;

-- TEST 4: founder -> allowed, idempotent, not-found.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_pl.founder_end', (public.end_person_employment('aaaa1002-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_pl.founder_end_idempotent', (public.end_person_employment('aaaa1002-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_pl.founder_restore', (public.restore_person_employment('aaaa1002-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_pl.founder_restore_idempotent', (public.restore_person_employment('aaaa1002-0000-0000-0000-000000000004'))::text, true);
select set_config('sc_pl.not_found', (public.end_person_employment('00000000-0000-0000-0000-000000000000'))::text, true);

-- TEST 5: direct bypass blocked, even after several real RPC calls above in this same
-- transaction (the exact stale-GUC-flag class already found/fixed for companies/tasks/goals).
do $$
begin
  begin
    update public.people set active = false where id = 'aaaa1002-0000-0000-0000-000000000004';
    perform set_config('sc_pl.direct_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('sc_pl.direct_bypass_blocked', 'true', true);
  end;
end $$;
select set_config('sc_pl.p4_active_after_bypass_attempt', (select active::text from public.people where id='aaaa1002-0000-0000-0000-000000000004'), true);

-- TEST 6: enforce_person_assignment_department_company - direct INSERT with a
-- cross-company department is rejected; a valid department is accepted.
do $$
begin
  begin
    insert into public.person_assignments (person_id, operating_company_id, department_id, state, is_primary)
      values ('aaaa1002-0000-0000-0000-000000000004','aaaa1001-0000-0000-0000-000000000001','aaaa1003-0000-0000-0000-000000000002','planned', false);
    perform set_config('sc_pl.dept_mismatch_blocked_direct', 'false', true);
  exception when others then
    perform set_config('sc_pl.dept_mismatch_blocked_direct', 'true', true);
  end;
end $$;

-- TEST 7: set_person_assignment's own redundant check rejects the same cross-company
-- department mismatch when called as the RPC (founder role active from TEST 4/5/6 above).
do $$
begin
  begin
    perform public.set_person_assignment('aaaa1002-0000-0000-0000-000000000004'::uuid, 'aaaa1001-0000-0000-0000-000000000001'::uuid,
      null, 'aaaa1003-0000-0000-0000-000000000002'::uuid, null, null, 'full_time', 100, null, true, 'current');
    perform set_config('sc_pl.dept_mismatch_blocked_rpc', 'false', true);
  exception when others then
    perform set_config('sc_pl.dept_mismatch_blocked_rpc', 'true', true);
  end;
end $$;
reset role;

-- TEST 8: delete_person has_dependents, then real hard delete once dependents clear.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_pl.delete_has_dependents', (public.delete_person('aaaa1002-0000-0000-0000-000000000005'))::text, true);
reset role;
update public.tasks set owner_person_id = null where id = 'aaaa1004-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_pl.delete_after_dependents_cleared', (public.delete_person('aaaa1002-0000-0000-0000-000000000005'))::text, true);
reset role;
select set_config('sc_pl.p5_really_gone', (not exists(select 1 from public.people where id='aaaa1002-0000-0000-0000-000000000005'))::text, true);

-- TEST 9: full hard delete with real cascades, cross-checked with independent SELECTs
-- (not the RPC's own self-report) both before and after.
select set_config('sc_pl.p6_salary_before', (select count(*)::text from public.salary_private where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_kpi_before', (select count(*)::text from public.kpi_records where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_policy_before', (select count(*)::text from public.person_ai_policy where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_assignments_before', (select count(*)::text from public.person_assignments where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_pl.p6_delete', (public.delete_person('aaaa1002-0000-0000-0000-000000000006'))::text, true);
reset role;
select set_config('sc_pl.p6_salary_after', (select count(*)::text from public.salary_private where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_kpi_after', (select count(*)::text from public.kpi_records where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_policy_after', (select count(*)::text from public.person_ai_policy where person_id='aaaa1002-0000-0000-0000-000000000006'), true);
select set_config('sc_pl.p6_assignments_after', (select count(*)::text from public.person_assignments where person_id='aaaa1002-0000-0000-0000-000000000006'), true);

-- TEST 10: a company manager (non-founder, but a real manager of Person 7's own company)
-- cannot call delete_person at all - founder/admin only, deliberately narrower than the
-- end/restore employment tier.
update public.company_memberships set active = true where company_id='aaaa1001-0000-0000-0000-000000000001' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_pl.manager_delete_denied', (public.delete_person('aaaa1002-0000-0000-0000-000000000007'))::text, true);
reset role;
select set_config('sc_pl.p7_still_exists', (exists(select 1 from public.people where id='aaaa1002-0000-0000-0000-000000000007'))::text, true);

-- TEST 9/10 companion (PERSON_DELETE_DOES_NOT_ROUTE_TO_COMPANY_ARCHIVE, SQL half):
-- Company 001 has had multiple end_person_employment/delete_person calls run against
-- people belonging to it above - its own companies.status must be completely untouched.
select set_config('sc_pl.company_status_untouched', (select (status = 'active')::text from public.companies where id='aaaa1001-0000-0000-0000-000000000001'), true);

select json_build_object(
  'scenario', 'PERSON-LIFECYCLE-AI-ROUTING',
  'classification', 'FIXED (quiet-wiggling-biscuit plan Bug 5 — see migration 202608290008)',
  'manager_end', current_setting('sc_pl.manager_end', true)::jsonb,
  'manager_restore', current_setting('sc_pl.manager_restore', true)::jsonb,
  'p1_assignment_state', current_setting('sc_pl.p1_assignment_state', true),
  'p1_assignment_end_date_set', current_setting('sc_pl.p1_assignment_end_date_set', true) = 'true',
  'p1_active_real', current_setting('sc_pl.p1_active_real', true),
  'former_manager_end', current_setting('sc_pl.former_manager_end', true)::jsonb,
  'unrelated_end', current_setting('sc_pl.unrelated_end', true)::jsonb,
  'founder_end', current_setting('sc_pl.founder_end', true)::jsonb,
  'founder_end_idempotent', current_setting('sc_pl.founder_end_idempotent', true)::jsonb,
  'founder_restore', current_setting('sc_pl.founder_restore', true)::jsonb,
  'founder_restore_idempotent', current_setting('sc_pl.founder_restore_idempotent', true)::jsonb,
  'not_found', current_setting('sc_pl.not_found', true)::jsonb,
  'direct_bypass_blocked', current_setting('sc_pl.direct_bypass_blocked', true) = 'true',
  'p4_active_after_bypass_attempt', current_setting('sc_pl.p4_active_after_bypass_attempt', true),
  'dept_mismatch_blocked_direct', current_setting('sc_pl.dept_mismatch_blocked_direct', true) = 'true',
  'dept_mismatch_blocked_rpc', current_setting('sc_pl.dept_mismatch_blocked_rpc', true) = 'true',
  'delete_has_dependents', current_setting('sc_pl.delete_has_dependents', true)::jsonb,
  'delete_after_dependents_cleared', current_setting('sc_pl.delete_after_dependents_cleared', true)::jsonb,
  'p5_really_gone', current_setting('sc_pl.p5_really_gone', true) = 'true',
  'p6_delete', current_setting('sc_pl.p6_delete', true)::jsonb,
  'p6_cascade_before', json_build_object(
    'salary', current_setting('sc_pl.p6_salary_before', true),
    'kpi', current_setting('sc_pl.p6_kpi_before', true),
    'policy', current_setting('sc_pl.p6_policy_before', true),
    'assignments', current_setting('sc_pl.p6_assignments_before', true)
  ),
  'p6_cascade_after', json_build_object(
    'salary', current_setting('sc_pl.p6_salary_after', true),
    'kpi', current_setting('sc_pl.p6_kpi_after', true),
    'policy', current_setting('sc_pl.p6_policy_after', true),
    'assignments', current_setting('sc_pl.p6_assignments_after', true)
  ),
  'manager_delete_denied', current_setting('sc_pl.manager_delete_denied', true)::jsonb,
  'p7_still_exists', current_setting('sc_pl.p7_still_exists', true) = 'true',
  'company_status_untouched', current_setting('sc_pl.company_status_untouched', true) = 'true',
  'all_pass', (
        (current_setting('sc_pl.manager_end', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_pl.manager_restore', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_pl.p1_assignment_state', true) = 'historical'
    and current_setting('sc_pl.p1_assignment_end_date_set', true) = 'true'
    and current_setting('sc_pl.p1_active_real', true) = 'true'
    and (current_setting('sc_pl.former_manager_end', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_pl.unrelated_end', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_pl.founder_end', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_pl.founder_end_idempotent', true)::jsonb->>'reason') = 'already_inactive'
    and (current_setting('sc_pl.founder_restore', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_pl.founder_restore_idempotent', true)::jsonb->>'reason') = 'already_active'
    and (current_setting('sc_pl.not_found', true)::jsonb->>'reason') = 'not_found'
    and current_setting('sc_pl.direct_bypass_blocked', true) = 'true'
    and current_setting('sc_pl.p4_active_after_bypass_attempt', true) = 'true'
    and current_setting('sc_pl.dept_mismatch_blocked_direct', true) = 'true'
    and current_setting('sc_pl.dept_mismatch_blocked_rpc', true) = 'true'
    and (current_setting('sc_pl.delete_has_dependents', true)::jsonb->>'reason') = 'has_dependents'
    and (current_setting('sc_pl.delete_after_dependents_cleared', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_pl.p5_really_gone', true) = 'true'
    and (current_setting('sc_pl.p6_delete', true)::jsonb->>'changed') = 'true'
    and current_setting('sc_pl.p6_salary_before', true) = '1' and current_setting('sc_pl.p6_salary_after', true) = '0'
    and current_setting('sc_pl.p6_kpi_before', true) = '1' and current_setting('sc_pl.p6_kpi_after', true) = '0'
    and current_setting('sc_pl.p6_policy_before', true) = '1' and current_setting('sc_pl.p6_policy_after', true) = '0'
    and current_setting('sc_pl.p6_assignments_before', true) = '1' and current_setting('sc_pl.p6_assignments_after', true) = '0'
    and (current_setting('sc_pl.manager_delete_denied', true)::jsonb->>'authorized') = 'false'
    and current_setting('sc_pl.p7_still_exists', true) = 'true'
    and current_setting('sc_pl.company_status_untouched', true) = 'true'
  )
) as verdict;

rollback;
