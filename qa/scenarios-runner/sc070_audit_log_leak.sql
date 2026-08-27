-- SC-070 Audit log leak. audit_logs_select_scope = founder/admin OR actor=self OR
-- is_company_manager(company_id). An ordinary employee must see ONLY their own audit
-- rows, never a founder's salary-change/ownership/payment audit event. (company_id is
-- NULL on real audit rows today — qa/KNOWN_FAILURE_MODES.md #7 — so the manager branch is
-- inert; access is actor-self only for non-admins, which is what we assert.) Rolled back.
begin;

insert into public.audit_logs (id, actor_profile_id, actor_role, event_type, message) values
 ('ffff0001-0000-0000-0000-000000000001','46bf57d3-33b3-47b4-8302-126726a92775','founder','salary_changed','SC070 founder changed a salary'),
 ('ffff0001-0000-0000-0000-000000000002','46bf57d3-33b3-47b4-8302-126726a92775','founder','ownership_modified','SC070 founder modified ownership'),
 ('ffff0001-0000-0000-0000-000000000003','66ef2052-d002-4592-b841-82cd2171b51a','employee','task_created','SC070 employee own event');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select json_build_object(
  'scenario','SC-070',
  'persona','ordinary employee',
  'founder_salary_audit_hidden',    not exists(select 1 from public.audit_logs where id='ffff0001-0000-0000-0000-000000000001'),
  'founder_ownership_audit_hidden', not exists(select 1 from public.audit_logs where id='ffff0001-0000-0000-0000-000000000002'),
  'own_audit_visible',              exists(select 1 from public.audit_logs where id='ffff0001-0000-0000-0000-000000000003'),
  'all_pass', (
        not exists(select 1 from public.audit_logs where id in ('ffff0001-0000-0000-0000-000000000001','ffff0001-0000-0000-0000-000000000002'))
    and exists(select 1 from public.audit_logs where id='ffff0001-0000-0000-0000-000000000003')
  )
) as verdict;

reset role;
rollback;
