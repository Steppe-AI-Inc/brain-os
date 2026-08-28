-- investor_viewer real scope — FIXED (qa/KNOWN_FAILURE_MODES.md #7's sibling finding in
-- governance/roles/README.md: "investor_viewer-tier test account saw identical data to a
-- plain employee — not reduced, not different", migration 202608280004). Not one of the
-- original SC-054..SC-131 scenarios (a new fix from the 2026-08-28 "fix all" pass, not a
-- pre-enumerated one) — no SC- prefix, tracked here instead.
--
-- Asserts: has_company_access() now excludes investor_viewer (so tables gated purely by
-- it — people, projects, product_lines, tasks INSERT — are correctly denied), while the
-- curated allow-list (companies, goals, financial_reports, public-tier documents) is
-- correctly granted via the new is_investor_viewer_of(). internal-tier documents stay
-- denied even under the broadened scope. All fixtures rolled back.
begin;

-- Promote the EMPLOYEE test profile to investor_viewer for the duration of this
-- transaction only, with a real membership at CLIX GPS.
update public.profiles set role='investor_viewer' where id='66ef2052-d002-4592-b841-82cd2171b51a';
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
 values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

-- Fixtures: one public-tier and one internal-tier document, one financial_reports row,
-- one goal, all at CLIX GPS.
insert into public.documents (id, company_id, title, sensitivity, category)
 values ('9c0a0001-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','Investor-visible doc','public','Marketing & Brochures'),
        ('9c0a0002-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','Internal-only doc','internal','Marketing & Brochures');
insert into public.financial_reports (id, company_id, period, revenue, expenses, net_income)
 values ('9c0a0003-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','2026-08',1000,500,500);
insert into public.goals (id, company_id, title, status)
 values ('9c0a0004-0000-0000-0000-000000000001','ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','Investor test goal','active');

create temp table iv_obs (k text, v text) on commit drop;
grant insert, select on iv_obs to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);

insert into iv_obs values
 ('has_company_access_own', public.has_company_access('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('is_investor_viewer_of_own', public.is_investor_viewer_of('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('company_visible', (select count(*) from public.companies where id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('goal_visible', (select count(*) from public.goals where id='9c0a0004-0000-0000-0000-000000000001')::text),
 ('financial_report_visible', (select count(*) from public.financial_reports where id='9c0a0003-0000-0000-0000-000000000001')::text),
 ('public_doc_visible', (select count(*) from public.documents where id='9c0a0001-0000-0000-0000-000000000001')::text),
 ('internal_doc_hidden', (select count(*) from public.documents where id='9c0a0002-0000-0000-0000-000000000001')::text),
 ('people_hidden', (select count(*) from public.people where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text),
 ('projects_hidden', (select count(*) from public.projects where company_id='ed8ae510-ddbc-4be6-9d9e-d1f725b1381d')::text);

-- INSERT into tasks must be denied (tasks_insert_scope is has_company_access-gated,
-- which now excludes investor_viewer entirely).
do $$ begin
  begin
    insert into public.tasks (company_id, title, status) values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d','iv test task','queued');
    insert into iv_obs values ('task_insert','ALLOWED-BAD');
  exception when insufficient_privilege then insert into iv_obs values ('task_insert','DENIED');
  end;
end $$;

reset role;

select json_build_object(
  'scenario','investor_viewer_scope',
  'has_company_access_own', (select v from iv_obs where k='has_company_access_own'),
  'is_investor_viewer_of_own', (select v from iv_obs where k='is_investor_viewer_of_own'),
  'company_visible', (select v from iv_obs where k='company_visible'),
  'goal_visible', (select v from iv_obs where k='goal_visible'),
  'financial_report_visible', (select v from iv_obs where k='financial_report_visible'),
  'public_doc_visible', (select v from iv_obs where k='public_doc_visible'),
  'internal_doc_hidden', (select v from iv_obs where k='internal_doc_hidden'),
  'people_hidden', (select v from iv_obs where k='people_hidden'),
  'projects_hidden', (select v from iv_obs where k='projects_hidden'),
  'task_insert', (select v from iv_obs where k='task_insert'),
  'all_pass', (
        (select v from iv_obs where k='has_company_access_own')='false'
    and (select v from iv_obs where k='is_investor_viewer_of_own')='true'
    and (select v from iv_obs where k='company_visible')='1'
    and (select v from iv_obs where k='goal_visible')='1'
    and (select v from iv_obs where k='financial_report_visible')='1'
    and (select v from iv_obs where k='public_doc_visible')='1'
    and (select v from iv_obs where k='internal_doc_hidden')='0'
    and (select v from iv_obs where k='people_hidden')='0'
    and (select v from iv_obs where k='projects_hidden')='0'
    and (select v from iv_obs where k='task_insert')='DENIED'
  )
) as verdict;

rollback;
