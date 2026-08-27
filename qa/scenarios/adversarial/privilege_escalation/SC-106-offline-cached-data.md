SCENARIO ID: SC-106-offline-cached-data

PURPOSE: A user who viewed permitted sensitive data and then loses permission must not keep
seeing it through stale client cache after a refresh / new session. Any unavoidable
client-cache limitation must be documented honestly, not claimed as a perfect guarantee.

ACTOR: a user whose access is revoked mid-session (e.g. demoted manager, transferred
employee).

ORGANIZATION: CLIX GPS.

ROLE: was manager/authorized, now not.

CAPABILITIES: revoked.

PRECONDITIONS: the user loaded a page showing sensitive data while authorized; then their
membership/role is changed to remove access.

ACTION: the user refreshes / opens a new session / re-navigates.

EXPECTED RESULT:
- **Server-rendered data**: gone immediately. Brain OS pages are server components that
  query through RLS on each request (web/lib/supabase/server.ts), and RLS re-evaluates
  live membership/role — so a refresh re-renders with 0 restricted rows (proven by
  sc088_091_access_revocation.sql: access 1→0 on the same session after revocation).
- **Already-painted client bytes**: data already rendered into a still-open tab is NOT
  retroactively wiped — those bytes live in the browser. This is an unavoidable client-side
  limitation, stated honestly. A refresh or navigation triggers a fresh server render that
  shows nothing; but a user who never refreshes still sees the stale screen until they do.
- **No offline PWA cache** of sensitive data should be persisted; if any client caching
  (SWR/React Query) holds data, it must be keyed to the session and invalidated on auth
  change — verify no long-lived client cache outlives the permission.

EXPECTED DENIALS: every new server request returns 0 restricted rows.

EXPECTED DATABASE STATE: unchanged.

EXPECTED AUDIT EVENTS: n/a.

EXPECTED AI VISIBILITY: AI context (server-built per request) has 0 restricted rows after
revocation.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. Server-side revocation is AUTOMATED (sc088_091). The
client-cache limitation is architectural and MANUAL VERIFICATION (browser refresh test);
it is documented as a known, honest limitation rather than claimed solved. Cross-ref
SC-088, SC-091, web/lib/supabase/server.ts.

LAST VERIFIED DATE: 2026-08-27 (server-side revocation PASS; client-cache limitation documented)
