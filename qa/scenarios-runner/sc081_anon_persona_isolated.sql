begin;

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', '66ef2052-d002-4592-b841-82cd2171b51a', 'employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select id as new_company_id, name into temp t_new_company
from public.create_own_company('SC-081b QA Anon Test Co', 'legal_entity', 'Mongolia', null);
grant select on t_new_company to authenticated, anon;

insert into public.tasks (id, company_id, title, status, created_by_profile_id)
select 'dddd0001-0000-0000-0000-000000000001', new_company_id, 'SC-081b task', 'queued', '66ef2052-d002-4592-b841-82cd2171b51a' from t_new_company;

reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

select json_build_object(
  'persona', 'unauthenticated (anon) — tasks table only',
  'tasks_hidden', not exists(select 1 from public.tasks where id = 'dddd0001-0000-0000-0000-000000000001')
) as verdict;

reset role;
rollback;
