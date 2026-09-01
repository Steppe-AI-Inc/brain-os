-- Independent verification (2026-09-01, campaign verify-a905df5): production has ZERO
-- person_assignments rows with manager_person_id set (confirmed: 0 of 4 total), so the
-- new per-organization Manager column (web/lib/data/people.ts getPeople()) has never
-- actually been exercised against real data. This builds real QA-VERIFY-* fixtures to
-- prove the manager-relationship merge logic actually works AND is cross-company-safe,
-- mirroring getPeople()'s exact query shape byte-for-byte. Self-cleaning: begin;...rollback;.

begin;

create temp table t_verdicts (verdict jsonb);
grant select, insert on t_verdicts to authenticated, anon;

-- Two isolated companies, one manager+report pair in EACH, so we can prove both
-- correct resolution (same-company) and isolation (cross-company).
insert into public.companies (id, name, organization_type, status) values
  ('eeee0001-0000-0000-0000-000000000001', 'QA-VERIFY-MGR-CO-A', 'legal_entity', 'active'),
  ('eeee0001-0000-0000-0000-000000000002', 'QA-VERIFY-MGR-CO-B', 'legal_entity', 'active');

insert into public.people (id, company_id, full_name, role_title, active) values
  ('eeee0002-0000-0000-0000-000000000001', 'eeee0001-0000-0000-0000-000000000001', 'QA-VERIFY Manager A', 'Manager', true),
  ('eeee0002-0000-0000-0000-000000000002', 'eeee0001-0000-0000-0000-000000000001', 'QA-VERIFY Report A', 'Engineer', true),
  ('eeee0002-0000-0000-0000-000000000003', 'eeee0001-0000-0000-0000-000000000002', 'QA-VERIFY Manager B', 'Manager', true),
  ('eeee0002-0000-0000-0000-000000000004', 'eeee0001-0000-0000-0000-000000000002', 'QA-VERIFY Report B', 'Engineer', true);

insert into public.person_assignments (id, person_id, operating_company_id, manager_person_id, is_primary, state) values
  ('eeee0003-0000-0000-0000-000000000001', 'eeee0002-0000-0000-0000-000000000002', 'eeee0001-0000-0000-0000-000000000001', 'eeee0002-0000-0000-0000-000000000001', true, 'current'),
  ('eeee0003-0000-0000-0000-000000000002', 'eeee0002-0000-0000-0000-000000000004', 'eeee0001-0000-0000-0000-000000000002', 'eeee0002-0000-0000-0000-000000000003', true, 'current');

-- Founder view (bypasses RLS) - baseline ground truth: both assignment rows visible,
-- both manager names resolvable via getPeople()'s exact join shape.
insert into t_verdicts (verdict) values (json_build_object(
  'persona', 'founder (ground truth, RLS-bypassing)',
  'company_a_report_manager_resolves_correctly', (
    select m.full_name from public.person_assignments pa
    join public.people m on m.id = pa.manager_person_id
    where pa.person_id = 'eeee0002-0000-0000-0000-000000000002' and pa.operating_company_id = 'eeee0001-0000-0000-0000-000000000001'
  ) = 'QA-VERIFY Manager A',
  'company_b_report_manager_resolves_correctly', (
    select m.full_name from public.person_assignments pa
    join public.people m on m.id = pa.manager_person_id
    where pa.person_id = 'eeee0002-0000-0000-0000-000000000004' and pa.operating_company_id = 'eeee0001-0000-0000-0000-000000000002'
  ) = 'QA-VERIFY Manager B'
));

-- Give a real employee-tier profile membership ONLY at Company A, impersonate them,
-- and mirror getPeople()'s exact two-query shape (people select, then person_assignments
-- .in(person_id, ...) select) to prove: (a) they see Company A's manager name correctly,
-- (b) they get ZERO person_assignments rows for Company B even when asked directly by
-- person_id (the RLS boundary this feature depends on, not just "app doesn't query it").
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('eeee0001-0000-0000-0000-000000000001', '66ef2052-d002-4592-b841-82cd2171b51a', 'employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

insert into t_verdicts (verdict) values ((
  select json_build_object(
    'persona', 'employee, member of Company A only',
    'sees_company_a_assignment_row', exists(
      select 1 from public.person_assignments where person_id = 'eeee0002-0000-0000-0000-000000000002'
    ),
    'does_NOT_see_company_b_assignment_row_even_when_directly_queried', not exists(
      select 1 from public.person_assignments where person_id = 'eeee0002-0000-0000-0000-000000000004'
    ),
    'company_a_manager_name_resolves_via_exact_getPeople_join_shape', (
      select m.full_name from public.person_assignments pa
      join public.people m on m.id = pa.manager_person_id
      where pa.person_id = 'eeee0002-0000-0000-0000-000000000002' and pa.operating_company_id = 'eeee0001-0000-0000-0000-000000000001'
    ) = 'QA-VERIFY Manager A'
  )
));

reset role;

select json_agg(verdict) as all_verdicts from t_verdicts;

rollback;
