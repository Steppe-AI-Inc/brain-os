-- SC-059b Test the LIVE decide_approval() function directly (does NOT create it).
-- Use this ONLY when decide_approval is deployed to production. It calls the live function
-- against fixture data inside a rolled-back transaction. See sc059_approval_execution.sql
-- for the committed-migration logic test used before deployment.
begin;
insert into public.tasks (id, company_id, title, status, created_by_profile_id) values
 ('05b00000-0000-0000-0000-00000000000a','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059b A','done','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('05b00000-0000-0000-0000-00000000000b','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059b B','done','46bf57d3-33b3-47b4-8302-126726a92775'),
 ('05b00000-0000-0000-0000-00000000000d','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059b D KEEP','queued','46bf57d3-33b3-47b4-8302-126726a92775');
insert into public.approvals (id, company_id, title, domain, status, risk_level, approval_payload) values
 ('05b00001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC059b delete A,B','production','pending','high',
  '{"execute":{"action":"delete_tasks","taskIds":["05b00000-0000-0000-0000-00000000000a","05b00000-0000-0000-0000-00000000000b"]}}'::jsonb);
create temp table sc059b (k text, v text) on commit drop;
grant insert, select on sc059b to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
insert into sc059b select 'first', deletion_summary from public.decide_approval('05b00001-0000-0000-0000-000000000001','approved');
insert into sc059b select 'second', coalesce(deletion_summary,'noop') from public.decide_approval('05b00001-0000-0000-0000-000000000001','approved');
reset role;
select json_build_object(
  'scenario','SC-059b (LIVE decide_approval)',
  'first', (select v from sc059b where k='first'),
  'second', (select v from sc059b where k='second'),
  'A_deleted', not exists(select 1 from public.tasks where id='05b00000-0000-0000-0000-00000000000a'),
  'B_deleted', not exists(select 1 from public.tasks where id='05b00000-0000-0000-0000-00000000000b'),
  'D_survived', exists(select 1 from public.tasks where id='05b00000-0000-0000-0000-00000000000d'),
  'status', (select status from public.approvals where id='05b00001-0000-0000-0000-000000000001'),
  'all_pass', ((select v from sc059b where k='first')='2 task(s) deleted.'
    and not exists(select 1 from public.tasks where id in ('05b00000-0000-0000-0000-00000000000a','05b00000-0000-0000-0000-00000000000b'))
    and exists(select 1 from public.tasks where id='05b00000-0000-0000-0000-00000000000d')
    and (select status from public.approvals where id='05b00001-0000-0000-0000-000000000001')='approved')
) as verdict;
rollback;
