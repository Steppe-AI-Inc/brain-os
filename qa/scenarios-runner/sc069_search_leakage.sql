-- SC-069 Search leakage. An ordinary employee searching salary/cash/shareholder/legal/
-- termination/bank keywords must get 0 restricted rows — via direct SELECT AND via an
-- ILIKE substring search (the two ways the app and sem-ai-command actually query). The
-- restriction is that the rows are not readable, so no title/snippet/metadata/count can
-- leak. All fixtures rolled back.
begin;

insert into public.documents (id, company_id, title, sensitivity) values
 ('eeee0001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','Shareholder agreement and cap table','confidential'),
 ('eeee0001-0000-0000-0000-000000000002','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','2026 termination and severance memo','confidential');
insert into public.memories (id, company_id, entity_type, fact, sensitivity) values
 ('eeee0002-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','company','Company cash balance is 4.2B MNT across two bank accounts','confidential');
insert into public.financial_reports (id, company_id, period, revenue) values
 ('eeee0003-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','2026-Q2', 999999999);
insert into public.people (id, company_id, full_name) values
 ('eeee0004-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','SC069 Salaried Person');
insert into public.salary_private (person_id, base_salary, compensation_notes) values
 ('eeee0004-0000-0000-0000-000000000001', 9000000, 'confidential bank transfer details');

insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

select json_build_object(
  'scenario','SC-069',
  'persona','ordinary employee, CLIX GPS',
  'confidential_docs_search_zero', (select count(*) from public.documents where sensitivity='confidential' and (title ilike '%shareholder%' or title ilike '%termination%')) = 0,
  'confidential_memory_search_zero', (select count(*) from public.memories where sensitivity='confidential' and (fact ilike '%cash%' or fact ilike '%bank%')) = 0,
  'financial_reports_zero', (select count(*) from public.financial_reports) = 0,
  'salary_search_zero', (select count(*) from public.salary_private where compensation_notes ilike '%bank%') = 0,
  'all_pass', (
        (select count(*) from public.documents where sensitivity='confidential' and (title ilike '%shareholder%' or title ilike '%termination%'))=0
    and (select count(*) from public.memories where sensitivity='confidential')=0
    and (select count(*) from public.financial_reports)=0
    and (select count(*) from public.salary_private)=0
  )
) as verdict;

reset role;
rollback;
