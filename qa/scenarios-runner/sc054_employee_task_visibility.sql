-- SC-054 Employee task visibility.
-- Proves tasks_select_scope: an ordinary employee sees ONLY tasks they created/own,
-- never a co-worker's task, a founder-strategic task, a finance task, or another
-- company's task. All fixtures are rolled back.
--
-- Fixtures (created as postgres, bypassing RLS):
--   T1 CLIX GPS, created_by = EMPLOYEE   -> visible
--   T2 CLIX GPS, created_by = FOUNDER    -> hidden (another tech's task)
--   T3 CLIX GPS, created_by = FOUNDER    -> hidden (founder strategic)
--   T4 CLIX GPS, created_by = FOUNDER    -> hidden (finance task)
--   T5 SEM Global Robotics, created_by=FOUNDER -> hidden (other company)
begin;

insert into public.tasks (id, company_id, title, status, created_by_profile_id) values
 ('aaaa0001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC054 T1 employee own field task','queued','66ef2052-d002-4592-b841-82cd2171b51a'),
 ('aaaa0001-0000-0000-0000-000000000002','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC054 T2 other technician task','queued','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('aaaa0001-0000-0000-0000-000000000003','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC054 T3 founder strategic task','queued','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('aaaa0001-0000-0000-0000-000000000004','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC054 T4 finance settlement task','queued','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('aaaa0001-0000-0000-0000-000000000005','773210d1-1203-4910-b18a-eab4cc7c3d9c','SC054 T5 other company task','queued','46bf57d3-33b3-47b4-8302-126726a92775');

-- EMPLOYEE is an active member of CLIX GPS only.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select json_build_object(
  'scenario','SC-054',
  'persona','ORDINARY_EMPLOYEE (technician) at CLIX GPS',
  't1_own_visible',      exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000001'),
  't2_other_tech_hidden', not exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000002'),
  't3_strategic_hidden',  not exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000003'),
  't4_finance_hidden',    not exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000004'),
  't5_other_company_hidden', not exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000005'),
  'sc054_visible_count', (select count(*) from public.tasks where title like 'SC054%'),
  'all_pass', (
    exists(select 1 from public.tasks where id='aaaa0001-0000-0000-0000-000000000001')
    and not exists(select 1 from public.tasks where id in (
      'aaaa0001-0000-0000-0000-000000000002','aaaa0001-0000-0000-0000-000000000003',
      'aaaa0001-0000-0000-0000-000000000004','aaaa0001-0000-0000-0000-000000000005'))
    and (select count(*) from public.tasks where title like 'SC054%') = 1
  )
) as verdict;

reset role;
rollback;
