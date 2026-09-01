-- KNOWN GAP, not yet fixed. Found during #58 (companies only), broader blast radius found
-- and confirmed during #59's independent re-verification, 2026-09-01. Pre-existing since
-- 202608280004_investor_viewer_scope.sql (2026-08-28), three days before the
-- create_own_company migration #58/#59 were verifying — confirmed unrelated to that
-- migration, not introduced by it.
--
-- Root cause: is_investor_viewer_of(cid) has EXECUTE granted to authenticated/
-- service_role/postgres only, never anon (correctly revoked from public/anon in its own
-- migration) — but it's referenced via OR inside FIVE tables' select policies, each
-- combined with has_company_access(cid) (which itself resolves cleanly to false for
-- anon, no grant issue there). Because Postgres cannot short-circuit away the second
-- OR operand when the first evaluates false, anon hits the ungranted function and gets a
-- hard SQL error INSTEAD OF a clean empty result. Same-class search performed during #59
-- (grep every `revoke ... from public, anon` function against every RLS policy that
-- references it): is_investor_viewer_of is the only one embedded inside a table SELECT
-- policy this way — every other public/anon-revoked function in this schema is a direct
-- RPC (decide_approval, archive_company, create_own_company, etc.), where a revoke
-- produces a normal "permission denied for function" error at the RPC-call site, not an
-- accidental crash on an ordinary table SELECT.
--
-- Confirmed live (2026-09-01), all 5 tables using is_investor_viewer_of in their SELECT
-- policy (202608280004_investor_viewer_scope.sql) throw the identical 42501 for anon:
--   companies, goals, financial_reports, documents, memories
-- (`tasks`, and every table NOT touched by that migration, correctly return a clean
-- empty result for anon instead — proven separately in sc081_anon_persona_isolated.sql).
--
-- Severity: robustness/error-handling gap, NOT a data leak — no row content is ever
-- returned, only a 400/42501 instead of an empty array. Still real: any anonymous/
-- unauthenticated REST or PostgREST caller hitting these 5 tables gets a hard error
-- instead of Brain OS's otherwise-consistent "clean empty result" contract for anon.
--
-- Expected once fixed (own migration, needs founder authorization — NOT covered by
-- create_own_company's authorization scope): `grant execute on function
-- public.is_investor_viewer_of(uuid) to anon;` (safe — the function's own body already
-- requires auth.uid() to match a real, active, investor_viewer-role membership; granting
-- EXECUTE to anon only lets it be *called*, it still correctly returns false/no-match for
-- an anonymous caller with no auth.uid()). After that, all 5 queries below should return
-- a clean empty result instead of raising 42501 — update this comment and cross-reference
-- KNOWN_FAILURE_MODES.md when that lands.

begin;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
select
  (select count(*) from public.companies) as companies,
  (select count(*) from public.goals) as goals,
  (select count(*) from public.financial_reports) as financial_reports,
  (select count(*) from public.documents) as documents,
  (select count(*) from public.memories) as memories;
rollback;
