-- SC-056 Cross-company isolation.
-- Company A = CLIX GPS (ed8ae510). Company B = SEM Global Robotics (773210d1, "the other
-- company" / Uzbekistan stand-in). Fixtures are created in Company B; a member of Company
-- A (as plain employee AND as manager) must see 0 of them across every table and every
-- route (direct table, direct-by-id, count). All rolled back.
begin;

insert into public.tasks (id, company_id, title, status, created_by_profile_id)
 values ('bbbb0001-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','SC056 B task','queued','46bf57d3-33b3-47b4-8302-126726a92775');
insert into public.projects (id, company_id, title)
 values ('bbbb0002-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','SC056 B project');
insert into public.documents (id, company_id, title, sensitivity)
 values ('bbbb0003-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','SC056 B internal doc','internal');
insert into public.financial_reports (id, company_id, period)
 values ('bbbb0004-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','2026-Q3');
insert into public.memories (id, company_id, entity_type, fact, sensitivity)
 values ('bbbb0005-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','company','SC056 B internal memory fact','internal');
insert into public.sales_leads (id, company_id, client_name)
 values ('bbbb0006-0000-0000-0000-000000000001','773210d1-1203-4910-b18a-eab4cc7c3d9c','SC056 B customer');

-- caller is a member of Company A only. Test both employee and manager role_in_company.
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select json_build_object(
  'scenario','SC-056',
  'persona','Company A manager, querying Company B resources',
  'b_task_hidden',    not exists(select 1 from public.tasks           where id='bbbb0001-0000-0000-0000-000000000001'),
  'b_project_hidden', not exists(select 1 from public.projects        where id='bbbb0002-0000-0000-0000-000000000001'),
  'b_document_hidden',not exists(select 1 from public.documents       where id='bbbb0003-0000-0000-0000-000000000001'),
  'b_finreport_hidden',not exists(select 1 from public.financial_reports where id='bbbb0004-0000-0000-0000-000000000001'),
  'b_memory_hidden',  not exists(select 1 from public.memories        where id='bbbb0005-0000-0000-0000-000000000001'),
  'b_lead_hidden',    not exists(select 1 from public.sales_leads     where id='bbbb0006-0000-0000-0000-000000000001'),
  'b_company_hidden', not exists(select 1 from public.companies       where id='773210d1-1203-4910-b18a-eab4cc7c3d9c'),
  'b_task_count_zero', (select count(*) from public.tasks where company_id='773210d1-1203-4910-b18a-eab4cc7c3d9c') = 0,
  'all_pass', (
    not exists(select 1 from public.tasks where id='bbbb0001-0000-0000-0000-000000000001')
    and not exists(select 1 from public.projects where id='bbbb0002-0000-0000-0000-000000000001')
    and not exists(select 1 from public.documents where id='bbbb0003-0000-0000-0000-000000000001')
    and not exists(select 1 from public.financial_reports where id='bbbb0004-0000-0000-0000-000000000001')
    and not exists(select 1 from public.memories where id='bbbb0005-0000-0000-0000-000000000001')
    and not exists(select 1 from public.sales_leads where id='bbbb0006-0000-0000-0000-000000000001')
    and not exists(select 1 from public.companies where id='773210d1-1203-4910-b18a-eab4cc7c3d9c')
  )
) as verdict;

reset role;
rollback;
