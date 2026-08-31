-- PERMANENT REGRESSION — BUG-001
-- Departments list surfaces departments whose parent company is ARCHIVED, with no
-- archived indication, on the same page whose own company picker correctly excludes
-- archived companies.
--
-- This test expresses the CORRECT expected behavior, not current behavior. It is
-- EXPECTED_FAIL / QUARANTINED until BUG-001 is fixed — deliberately, per the charter:
-- never weaken an assertion to make broken behavior pass.
--
-- WHY THIS IS A REAL DEFECT AND NOT A DESIGN CHOICE (the load-bearing evidence):
-- The SAME PAGE contradicts itself. /departments renders its "Company" picker from
-- getCompaniesForSelection() -> RPC get_effectively_active_companies, which deliberately
-- EXCLUDES archived companies (and even reasons about archived ANCESTORS). Meanwhile
-- getDepartments() (web/lib/data/departments.ts) does a plain select with NO filter on,
-- and no surfacing of, the parent company's status. So the picker says the company is not
-- selectable, while the table one element below presents it as an ordinary parent.
-- Two contradictory truths about one company, on one screen.
--
-- Live-proven 2026-08-31 against deployed SHA 256f183:
--   picker options            -> archived company ABSENT (correct)
--   departments table         -> "QA-SWARM-TEST-DEPT-EDITED | QA-SWARM-TEST-CO-VIA-CHAT"
--                                (archived parent shown, unmarked)
--
-- SELF-VERIFICATION NOTE (a real trap this script already fell into once): an earlier draft
-- called archive_company() WITHOUT founder impersonation. archive_company() gates on
-- is_founder_or_admin(), which is false for the CLI's admin connection (auth.uid() is null),
-- so the archive silently no-opped, the fixture stayed 'active', and the test reported
-- all_pass=true FOR THE WRONG REASON. The precondition assertions below now make that
-- failure mode impossible to repeat silently — if the archive doesn't take, the script says so.
--
-- Self-cleaning: begin;...rollback;. Zero residue.

begin;

-- Impersonate the real founder so the SECURITY DEFINER lifecycle RPC actually executes.
-- (Same live-impersonation method as the rest of qa/scenarios-runner/.)
set local role authenticated;
set local request.jwt.claim.sub = 'cbcc41cf-830d-4600-8545-3b9e22c8297f';

insert into public.companies (id, name, status, organization_type)
values ('c0ffee00-0000-4000-8000-000000000001', 'REGRESSION-BUG001-CO', 'active', 'legal_entity');

insert into public.departments (id, company_id, name, slug)
values ('c0ffee00-0000-4000-8000-000000000002', 'c0ffee00-0000-4000-8000-000000000001',
        'REGRESSION-BUG001-DEPT', 'regression-bug001-dept');

-- Archive the parent through the ONLY sanctioned path (DB-trigger-enforced RPC).
-- (Result intentionally discarded here; the precondition assertion below is what proves
-- the archive actually took effect, rather than trusting this call's own return value.)
select public.archive_company('c0ffee00-0000-4000-8000-000000000001');

with dept_view as (
  -- Mirrors exactly what getDepartments() selects: no parent-status filter, no status column.
  select d.id, d.name, d.company_id, c.name as company_name, c.status as parent_status
  from public.departments d
  left join public.companies c on c.id = d.company_id
  where d.id = 'c0ffee00-0000-4000-8000-000000000002'
),
picker as (
  -- Mirrors getCompaniesForSelection(): the app's own definition of "selectable/active".
  select count(*) as n
  from public.get_effectively_active_companies() g
  where g.id = 'c0ffee00-0000-4000-8000-000000000001'
),
facts as (
  select
    (select parent_status from dept_view)            as parent_status,
    (select n from picker)                            as picker_hits,
    (select count(*) from dept_view)                  as dept_rows
)
select json_build_object(
  -- PRECONDITION: if this is false the test is INVALID, not passing. Guards the exact
  -- silent-no-op trap described in the header.
  'precondition_parent_actually_archived', (select parent_status = 'archived' from facts),

  'parent_status_in_db',            (select parent_status from facts),
  'picker_offers_parent',           (select picker_hits > 0 from facts),
  'departments_query_returns_row',  (select dept_rows > 0 from facts),

  -- getDepartments() selects only "companies(name)" — never companies.status — so the UI
  -- has nothing to render an archived badge from even if it wanted to. Hardcoded false
  -- until the app actually exposes parent status; flip to a real check when fixed.
  'departments_query_exposes_parent_status', false,

  -- The defect signature: parent archived AND picker correctly hides it AND the departments
  -- query still returns it unmarked.
  'contradiction_present', (
    select parent_status = 'archived' and picker_hits = 0 and dept_rows > 0 from facts
  ),

  'all_pass', (
    select
      -- Test is only meaningful if the archive actually happened.
      (parent_status = 'archived')
      and (
        -- CORRECT expected behavior, either:
        --   (a) departments query filters out departments of archived parents, OR
        --   (b) it exposes parent status so the UI can mark the row.
        dept_rows = 0
        or false  -- placeholder for (b); flip to a real status-exposure check once implemented
      )
    from facts
  ),

  'bug_id', 'BUG-001',
  'expected_state_until_fixed', 'EXPECTED_FAIL'
) as verdict;

rollback;
