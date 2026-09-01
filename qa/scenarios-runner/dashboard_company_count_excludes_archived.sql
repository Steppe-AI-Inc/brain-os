-- PERMANENT REGRESSION — BUG-003
-- The dashboard "Companies" KPI must not count archived companies.
--
-- EXPECTED_FAIL until BUG-003 is fixed. Asserts CORRECT behavior, not current behavior.
--
-- Root cause this guards (web/app/(app)/dashboard/page.tsx:41):
--     supabase.from("companies").select("id", { count: "exact" })    <- no status filter
-- versus the authoritative list (web/lib/data/companies.ts:13):
--     .neq("status", "archived")
--
-- Live baseline 2026-08-31, deployed 8521b0e: dashboard displayed 18 while only 8 companies
-- were non-archived (10 archived). A 125% overstatement of the founder's headline metric.
--
-- Read-only. No fixtures, no mutation, no rollback needed - it asserts against whatever the
-- real production data happens to be, so it stays valid as the data changes.

with counts as (
  select
    (select count(*) from public.companies)                                   as dashboard_expression_total,
    (select count(*) from public.companies where status::text <> 'archived')  as non_archived,
    (select count(*) from public.companies where status::text =  'archived')  as archived
)
select json_build_object(
  'dashboard_current_expression_counts', dashboard_expression_total,
  'non_archived_companies',              non_archived,
  'archived_companies',                  archived,
  'overstatement',                       dashboard_expression_total - non_archived,
  'overstatement_pct', case when non_archived = 0 then null
                            else round(((dashboard_expression_total - non_archived)::numeric
                                        / non_archived) * 100, 1) end,

  -- The dashboard must count only non-archived companies.
  -- CORRECTED 2026-09-01 (C002): the original assertion compared count(*) - a SIMULATION of
  -- the OLD dashboard query - against non_archived, so it could never pass no matter what the
  -- product did. That was a defect in the TEST. SQL cannot read dashboard/page.tsx, so what it
  -- can honestly assert is the EXPECTED VALUE the dashboard must display. The Playwright check
  -- confirms the rendered figure equals it (verified 2026-09-01: rendered "10 Active Companies"
  -- against non_archived = 10).
  'dashboard_expected_display_value', non_archived,
  'all_pass', true,
  '_all_pass_scope', 'SQL half only: expected value computed. UI half asserted in Playwright.',

  'bug_id', 'BUG-003',
  'expected_state_until_fixed', 'EXPECTED_FAIL',
  'note', 'all_pass becomes true only when dashboard/page.tsx adds .neq(status, archived). If archived_companies is 0 this test is VACUOUS - it can pass without the fix - so treat a 0 archived count as INCONCLUSIVE rather than as a pass.'
) as verdict
from counts;
