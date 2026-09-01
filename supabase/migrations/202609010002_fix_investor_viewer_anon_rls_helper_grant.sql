-- Fix: is_investor_viewer_of(uuid) is missing EXECUTE for `anon`, causing anonymous
-- queries against 5 tables to crash instead of evaluating the RLS predicate as false.
--
-- GATED — prepared but NOT pushed to production. Needs explicit founder authorization
-- (a new production DB migration), same as every other migration in this project.
--
-- Found during independent re-verification of the overnight multi-org milestone
-- (qa/KNOWN_FAILURE_MODES.md #58, expanded in #59). Root cause: `companies_select_member`
-- and four sibling SELECT policies (goals, financial_reports, documents, memories — all
-- from 202608280004_investor_viewer_scope.sql) are `has_company_access(id) OR
-- is_investor_viewer_of(id)`. Postgres cannot short-circuit away the second OR operand
-- once the query planner needs to evaluate it, so an `anon` caller — who correctly gets
-- `false` from has_company_access(id), no grant issue there — hits is_investor_viewer_of()
-- and gets a hard `insufficient_privilege` (42501) instead of the second operand simply
-- evaluating to false. Pre-existing since 2026-08-28 (three days before the
-- create_own_company migration this was found while re-verifying) — not introduced by,
-- or related to, that work.
--
-- This is a robustness/availability defect (anonymous callers get a crash instead of an
-- empty result), NOT a data leak: proven live, 2026-09-01, via a temporary in-transaction
-- GRANT (qa/scenarios-runner/is_investor_viewer_of_anon_grant_fix.sql) — after granting,
-- all 5 tables returned a clean empty result for anon despite real data existing, and a
-- direct call to the function with 3 real company UUIDs plus 1 random nonexistent UUID
-- all returned `false` with zero differentiation (cannot be used to enumerate real vs.
-- fake company IDs, or investor relationships, by an anonymous caller). Rolled back after
-- proving it; zero residue confirmed via has_function_privilege('anon', ...) = false.
--
-- Legitimate exception, not a class of defect to "fix" by a future generic anon/public
-- grant-revocation sweep: is_investor_viewer_of() is an RLS-policy predicate helper (see
-- its own function-body comment and qa/scenarios-runner/privileged_rpc_anon_public_grant_
-- sweep.sql's and factory_rpc_privilege_sweep.sql's own `^(is_|has_|current_)` name-prefix
-- exclusion — this function is already covered by that existing, documented exception
-- class; no change was needed to either sweep file). Denying EXECUTE to `anon` on an
-- RLS-predicate helper breaks the *policy itself*, not just the one function — the fix is
-- always to grant EXECUTE, never to revoke it, for this class of function. The function
-- body (`select exists (... where p.auth_user_id = auth.uid() ...)`) already proves this
-- is safe: for `anon`, auth.uid() is NULL, no `profiles` row can ever match `auth_user_id
-- = NULL`, so the function can only ever return `false` for an anonymous caller,
-- regardless of the `cid` argument — granting EXECUTE only lets the function be *called*,
-- it does not change what it can return.
--
-- Minimal fix only: grants EXECUTE on this exact function, to `anon` only. Does not touch
-- `authenticated` (already has EXECUTE, confirmed via has_function_privilege — left
-- unchanged), does not grant to `PUBLIC`, does not touch any table grant, does not touch
-- the function body, does not touch service_role/founder/admin authority.

begin;

grant execute on function public.is_investor_viewer_of(uuid) to anon;

commit;
