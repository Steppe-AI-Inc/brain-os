SCENARIO ID: SC-091-terminated-employee

PURPOSE: On termination, verify access is gone across every route — login/session, API,
files, messages, AI, direct URL, cached UI — with no lingering access via old frontend
state. This is the "belt and braces" version of SC-088.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`, terminated (membership removed AND, for full effect, auth session
revoked).

CAPABILITIES: none post-termination.

PRECONDITIONS: an active employee with data access.

ACTION: terminate (remove membership; disable/revoke the auth session), then attempt:
(1) direct DB/API query, (2) direct resource URL, (3) Brain AI, (4) refreshing a
still-open browser tab (cached UI), (5) re-login.

EXPECTED RESULT:
- DB/API/AI: 0 company rows immediately (RLS live re-evaluation — proven).
- Direct resource URL: server-rendered pages fetch through RLS, so they render empty /
  404 for company data.
- Re-login: if the auth.users row is disabled, login fails; if only membership was
  removed, login succeeds but shows no company data.
- Cached UI: any data already painted into a still-open client tab is a **client-cache
  limitation** — the bytes already in the browser are not retroactively wiped. A refresh /
  new server render shows nothing. This is documented honestly, not claimed as a perfect
  guarantee (see SC-106).

EXPECTED DENIALS: every server-side route returns 0 company rows.

EXPECTED DATABASE STATE: unchanged by the test (rolled back).

EXPECTED AUDIT EVENTS: termination flow should audit; the post-termination reads produce
none.

EXPECTED AI VISIBILITY: 0 company rows in context.

CLEANUP: none — runner rolls back the fixture.

AUTOMATION STATUS: AUTOMATED (server-side data half) — sc088_091_access_revocation.sql.
The auth-session-revocation and cached-UI halves are architectural / client-side and are
MANUAL VERIFICATION ONLY (require the Supabase Admin API and a real browser). The honest
statement: data access dies instantly server-side; the session token and any already-
rendered client bytes require session revocation and a refresh respectively. Cross-ref
SC-088, SC-106, web/lib/supabase/middleware.ts.

LAST VERIFIED DATE: 2026-08-27 (server-side data revocation PASS; session/cache halves MANUAL)
