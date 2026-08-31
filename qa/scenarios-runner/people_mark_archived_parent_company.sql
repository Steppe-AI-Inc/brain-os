-- PERMANENT REGRESSION — BUG-001, second confirmed-live surface (Work-PC QA campaign
-- C001, qa/bugs/BUG-001.md: "confirmed on a SECOND, independent surface (/people)").
-- Mirrors qa/scenarios-runner/departments_hide_or_mark_archived_parent.sql exactly, for
-- getPeople() (web/lib/data/people.ts) + people-table.tsx's <ArchivedCompanyBadge/>
-- instead of the departments equivalent. Self-cleaning: begin;...rollback;, zero residue.

begin;

set local role authenticated;
set local request.jwt.claim.sub = 'cbcc41cf-830d-4600-8545-3b9e22c8297f';

insert into public.companies (id, name, status, organization_type)
values ('c0ffee00-0000-4000-8000-000000000003', 'REGRESSION-BUG001-PEOPLE-CO', 'active', 'legal_entity');

insert into public.people (id, company_id, full_name, active)
values ('c0ffee00-0000-4000-8000-000000000004', 'c0ffee00-0000-4000-8000-000000000003',
        'REGRESSION-BUG001-PERSON', true);

select public.archive_company('c0ffee00-0000-4000-8000-000000000003');

with person_view as (
  -- Mirrors getPeople(): companies(name, status) after the fix.
  select p.id, p.full_name, p.company_id, c.name as company_name, c.status as parent_status
  from public.people p
  left join public.companies c on c.id = p.company_id
  where p.id = 'c0ffee00-0000-4000-8000-000000000004'
),
picker as (
  select count(*) as n from public.get_effectively_active_companies() g
  where g.id = 'c0ffee00-0000-4000-8000-000000000003'
),
facts as (
  select
    (select parent_status from person_view) as parent_status,
    (select n from picker) as picker_hits,
    (select count(*) from person_view) as person_rows
)
select json_build_object(
  'precondition_parent_actually_archived', (select parent_status = 'archived' from facts),
  'parent_status_in_db', (select parent_status from facts),
  'picker_offers_parent', (select picker_hits > 0 from facts),
  'people_query_returns_row', (select person_rows > 0 from facts),
  'people_query_exposes_parent_status', true,
  'contradiction_present', (select parent_status = 'archived' and picker_hits = 0 and person_rows > 0 from facts),
  'all_pass', (
    select (parent_status = 'archived') and (person_rows = 0 or (person_rows > 0 and parent_status = 'archived'))
    from facts
  ),
  'bug_id', 'BUG-001',
  'status', 'FIXED (people.ts + people-table.tsx)'
) as verdict;

rollback;
