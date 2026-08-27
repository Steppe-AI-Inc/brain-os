SCENARIO ID: SC-088-deleted-employee

PURPOSE: An employee removed from the org while logged in must actually lose access —
tasks, documents, messages, financial data, and Brain AI — even if they still hold an
unexpired token and simply refresh.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`, membership deactivated mid-session.

CAPABILITIES: all company-scoped access flows through `has_company_access` /
`is_company_manager`, which read `company_memberships.active` LIVE per query.

PRECONDITIONS: employee is an active member and can see company data; then their
membership is set `active=false` (or deleted).

ACTION: without re-logging-in (same JWT), the employee re-queries company data / refreshes
the page / re-invokes Brain AI.

EXPECTED RESULT: company-scoped data drops to 0 rows immediately. The real mechanism:
Brain OS has **no application-level permission cache** — `web/lib/supabase/server.ts`
carries the user's session cookie and every query goes through RLS, and RLS functions
re-check `company_memberships` on each call. So the next query after revocation returns 0.

EXPECTED DENIALS: `has_company_access`/`is_company_manager` return false → 0 company rows;
`financial_reports`, `documents`, company `tasks`, `memories` all 0.

IMPORTANT CAVEAT (honest): the **auth session itself** (the Supabase JWT) is stateless and
remains valid until the access token expires (~1h) or the session is explicitly revoked.
So a just-removed user can still *load* pages (middleware sees a valid `user`) but sees no
company data. To also end the session immediately, the auth.users session must be revoked
/ the user disabled (Supabase Admin API) — membership removal alone does not invalidate
the token, it only empties what the token can read. This is the correct security posture
(data access gone instantly) but developers must know the session-vs-data distinction.

EXPECTED DATABASE STATE: unchanged by the test (rolled back).

EXPECTED AUDIT EVENTS: none from the reads.

EXPECTED AI VISIBILITY: after revocation, the AI context built under this JWT contains 0
company rows — the model has nothing to leak.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc088_091_access_revocation.sql
(proved live: company access 1 -> 0 on the same JWT after deactivating membership). The
session-token-still-valid caveat is architectural (Supabase Auth), documented not tested.
Cross-ref SC-089, SC-090, SC-091, web/lib/supabase/middleware.ts.

LAST VERIFIED DATE: 2026-08-27 (PASS — company access revoked immediately on same JWT)
