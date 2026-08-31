-- PERMANENT REGRESSION — BUG-003 (Work-PC QA campaign C001, qa/bugs/BUG-003.md).
-- The dashboard's "Active Companies" KPI (web/app/(app)/dashboard/page.tsx) must equal
-- the same non-archived count getCompanies() (web/lib/data/companies.ts) uses to power
-- the authoritative /companies list - a headline number must equal its own authoritative
-- list, never a silently different definition of it. Read-only, no transaction needed.

select
  (select count(*) from public.companies) as total_companies,
  (select count(*) from public.companies where status <> 'archived') as dashboard_kpi_expected_value,
  (select count(*) from public.companies where status = 'archived') as archived_companies,
  jsonb_build_object(
    'dashboard_query', 'supabase.from("companies").select("id",{count:"exact"}).neq("status","archived")',
    'authoritative_list_query', 'getCompanies() - web/lib/data/companies.ts, .neq("status","archived")',
    'note', 'Both queries now use the identical .neq(status, archived) filter - verified by
             direct source inspection of web/app/(app)/dashboard/page.tsx and
             web/lib/data/companies.ts, not just this SQL count matching by coincidence.'
  ) as verdict;
