-- SC-074 Founder-only data. company_sensitive (cash/revenue/ownership/investor notes) is
-- readable ONLY by is_founder_or_admin(). An employee, a company manager, AND an
-- hr_finance (CFO) must all see 0 rows. Proves CFO != founder. Rolled back.
begin;

insert into public.company_sensitive (company_id) values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d');
create temp table sc074_obs (k text, v int) on commit drop;
grant insert, select on sc074_obs to authenticated;

-- (1) employee
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into sc074_obs values ('employee_sees', (select count(*) from public.company_sensitive where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'));
reset role;

-- (2) upgrade same membership to manager
update public.company_memberships set role_in_company='manager' where profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into sc074_obs values ('manager_sees', (select count(*) from public.company_sensitive where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'));
reset role;

-- (3) promote to hr_finance (CFO)
update public.profiles set role='hr_finance' where id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into sc074_obs values ('cfo_sees', (select count(*) from public.company_sensitive where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'));
reset role;

select json_build_object(
  'scenario','SC-074',
  'employee_sees', (select v from sc074_obs where k='employee_sees'),
  'manager_sees',  (select v from sc074_obs where k='manager_sees'),
  'cfo_sees',      (select v from sc074_obs where k='cfo_sees'),
  'all_pass', (select bool_and(v=0) from sc074_obs)
) as verdict;

rollback;
