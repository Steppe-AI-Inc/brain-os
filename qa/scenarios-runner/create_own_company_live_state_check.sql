-- Reusable live-state check for create_own_company() (202609010001_create_own_company.sql,
-- qa/KNOWN_FAILURE_MODES.md #58, independently re-confirmed #59). This project has a
-- documented gotcha: `supabase migration list` can show a version as applied without the
-- function body having actually landed — never trust that alone. This checks the real,
-- live function definition and grants directly. Read-only, no mutation, nothing to
-- roll back.
--
-- Expected (re-confirm after any future change to this function):
--   - funcdef byte-matches the committed migration body (SECURITY DEFINER, sets the
--     creator as sole 'owner', no subsidiary/company_relationships row, no employer
--     membership touched).
--   - grants: EXECUTE for authenticated/postgres/service_role ONLY — anon and public
--     must never appear here (an ordinary unauthenticated visitor must not be able to
--     spin up companies).

-- NOTE: `npx supabase db query --linked --file <this>.sql` only surfaces the LAST
-- statement's result set (confirmed during #59's re-verification) — run each SELECT
-- below as its own `db query` invocation if you need both results, don't rely on one
-- combined run.

select pg_get_functiondef('public.create_own_company(text, text, text, text)'::regprocedure) as funcdef;

select grantee, privilege_type
from information_schema.role_routine_grants
where routine_name = 'create_own_company'
order by grantee;
