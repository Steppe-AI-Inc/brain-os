-- Permanent regression for the is_investor_viewer_of() anon-EXECUTE fix (see
-- qa/scenarios-runner/anon_companies_investor_viewer_permission_denied_gap.sql for the
-- original gap documentation, and
-- supabase/migrations/202609010002_fix_investor_viewer_anon_rls_helper_grant.sql for the
-- production change).
--
-- MIGRATION IS NOW LIVE (pushed and verified 2026-09-01, KNOWN_FAILURE_MODES.md #60) —
-- this script no longer applies its own GRANT. It asserts the REAL, PERSISTENT
-- production state, so a future regression (someone revoking the grant, e.g. via an
-- over-broad security sweep) would make it fail loudly rather than being masked by the
-- script granting the privilege to itself. Read-only: no mutation, no transaction needed.
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
-- Proven live against production twice: first adversarially, pre-authorization, via a
-- temporary in-transaction GRANT that was rolled back (zero residue confirmed); then
-- again post-deploy against the real, permanent grant. Both runs: all 5 tables returned
-- a clean empty result for anon (0 rows, no error) despite real data existing (companies
-- has 18 real rows); direct calls to is_investor_viewer_of() with 3 real company UUIDs
-- (CLIX GPS, SEM Global Robotics, OpenSpot/Steppe AI) plus two random nonexistent UUIDs
-- all returned `false` with zero differentiation - proving the helper cannot be used to
-- enumerate real vs. fake company IDs or investor relationships by an anonymous caller.
--
-- Other personas re-verified post-deploy, all unaffected (this fix is purely additive to
-- `anon`): investor_viewer_scope.sql all_pass true (valid investor keeps intended
-- access), sc056_cross_company_isolation.sql all_pass true (authenticated non-investor
-- manager still sees 0 cross-company rows), factory_rpc_privilege_sweep.sql
-- founder_canonical_path_works true (founder/admin intact). Both generic privilege
-- sweeps (privileged_rpc_anon_public_grant_sweep.sql, factory_rpc_privilege_sweep.sql)
-- correctly do NOT flag this grant - their `^(is_|has_|current_)` RLS-helper exclusion
-- already covers it, so a future sweep will not try to revoke it again.

set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);

select json_build_object(
  'scenario', 'is_investor_viewer_of anon grant fix',
  -- RLS_HELPER_IS_INVESTOR_VIEWER_OF_CALLABLE_BY_ANON, asserted against the REAL
  -- persistent grant - fails loudly if anything ever revokes it.
  'grant_is_live_in_production', has_function_privilege('anon', 'public.is_investor_viewer_of(uuid)', 'EXECUTE'),
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
