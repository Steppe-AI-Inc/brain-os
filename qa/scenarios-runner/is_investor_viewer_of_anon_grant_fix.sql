-- Permanent regression for the is_investor_viewer_of() anon-EXECUTE fix (see
-- qa/scenarios-runner/anon_companies_investor_viewer_permission_denied_gap.sql for the
-- original gap documentation, and the migration this fix ships in for the production
-- change). Prepared 2026-09-01, ahead of authorization — the migration is NOT yet pushed
-- to production, so this script tests the fix in a self-cleaning, in-transaction GRANT
-- that is rolled back at the end, never a permanent production change on its own.
--
-- Named regressions covered:
--   RLS_HELPER_IS_INVESTOR_VIEWER_OF_CALLABLE_BY_ANON
--   ANON_RLS_PREDICATE_RETURNS_FALSE_NOT_PRIVILEGE_ERROR
--   ANON_COMPANIES_QUERY_DOES_NOT_CRASH
--   ANON_GOALS_QUERY_DOES_NOT_CRASH
--   ANON_FINANCIAL_REPORTS_QUERY_DOES_NOT_CRASH
--   ANON_DOCUMENTS_QUERY_DOES_NOT_CRASH
--   ANON_MEMORIES_QUERY_DOES_NOT_CRASH
--   ANON_INVESTOR_HELPER_GRANT_DOES_NOT_EXPOSE_INVESTOR_DATA
--
-- Adversarial proof already run live against production 2026-09-01 (evidence, not
-- prediction): after a temporary in-transaction GRANT, all 5 tables returned a clean
-- empty result for anon (0 rows, no error) despite real data existing (companies has 18
-- real rows); a direct call to is_investor_viewer_of() with 3 real company UUIDs (CLIX
-- GPS, SEM Global Robotics, OpenSpot/Steppe AI) plus one random nonexistent UUID all
-- returned `false` with zero differentiation - proving the helper cannot be used to
-- enumerate real vs. fake company IDs or investor relationships by an anonymous caller.
-- After ROLLBACK, has_function_privilege('anon', ...) confirmed false again (zero
-- residue) and the crash reproduced identically to before - the transaction had no
-- permanent effect. qa/scenarios-runner/investor_viewer_scope.sql (authenticated
-- investor_viewer path) re-run separately, unaffected, all_pass: true - this fix is
-- purely additive to `anon`, it does not touch the authenticated/founder/admin paths.
--
-- Self-cleaning: the GRANT below is inside begin;...rollback;. Nothing is permanently
-- changed by running this file before the real migration is authorized and pushed.

begin;

grant execute on function public.is_investor_viewer_of(uuid) to anon;

set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

select json_build_object(
  'scenario', 'is_investor_viewer_of anon grant fix',
  -- ANON_COMPANIES_QUERY_DOES_NOT_CRASH / ANON_GOALS_.../ etc: a clean integer back (even
  -- 0) proves no insufficient_privilege error was raised - the query itself succeeded.
  'anon_companies_query_does_not_crash', (select count(*) from public.companies) is not null,
  'anon_goals_query_does_not_crash', (select count(*) from public.goals) is not null,
  'anon_financial_reports_query_does_not_crash', (select count(*) from public.financial_reports) is not null,
  'anon_documents_query_does_not_crash', (select count(*) from public.documents) is not null,
  'anon_memories_query_does_not_crash', (select count(*) from public.memories) is not null,
  -- ANON_RLS_PREDICATE_RETURNS_FALSE_NOT_PRIVILEGE_ERROR / RLS_HELPER_...CALLABLE_BY_ANON:
  -- the function itself, called directly, must succeed (not error) and return false.
  'rls_helper_callable_by_anon_and_returns_false', public.is_investor_viewer_of('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'::uuid) = false,
  -- ANON_INVESTOR_HELPER_GRANT_DOES_NOT_EXPOSE_INVESTOR_DATA: real company IDs and a
  -- random nonexistent UUID must be indistinguishable to an anonymous caller.
  'anon_investor_helper_grant_does_not_expose_investor_data', (
    public.is_investor_viewer_of('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'::uuid) = false
    and public.is_investor_viewer_of('773210d1-1203-4910-b18a-eab4cc7c3d9c'::uuid) = false
    and public.is_investor_viewer_of('42790e8b-7bec-4b44-8ce2-35b08a703712'::uuid) = false
    and public.is_investor_viewer_of('00000000-0000-0000-0000-000000000000'::uuid) = false
  ),
  -- Still zero actual rows returned - the fix makes anon fail CLOSED cleanly, not open.
  'zero_protected_rows_exposed',
    (select count(*) from public.companies) = 0
    and (select count(*) from public.goals) = 0
    and (select count(*) from public.financial_reports) = 0
    and (select count(*) from public.documents) = 0
    and (select count(*) from public.memories) = 0
) as verdict;

reset role;

-- Prepared-ahead note: rollback here because the real migration hasn't been authorized
-- yet. Once it has been pushed for real, re-run this exact script (still safe - GRANT is
-- idempotent, `grant ... to anon` a second time is a no-op) to confirm the live state,
-- and change this comment + the fix report to reflect that.
rollback;
