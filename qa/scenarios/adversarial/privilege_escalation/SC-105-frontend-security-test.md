SCENARIO ID: SC-105-frontend-security-test

PURPOSE: For every hidden UI feature, all FOUR paths must fail for an unauthorized user,
not just the UI affordance: (1) button/menu hidden, (2) direct navigation to the route,
(3) calling the underlying server action / API directly, (4) querying the DB resource
directly. UI hiding is irrelevant to security (CLAUDE.md §7).

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: none for the founder/finance features tested.

PRECONDITIONS: the app exposes at least three sensitive surfaces. Real examples traced:

- **Finance page (`financial_reports`)** — (1) the finance nav/card is role-gated in the UI;
  (2) direct nav to the finance route server-renders through RLS; (3) the server component's
  Supabase query uses the user's cookie session (web/lib/supabase/server.ts) — no service
  role; (4) direct `financial_reports` query returns 0 rows for an employee. Paths 2–4 all
  reduce to the same RLS boundary — AUTOMATED, sc069/sc074 PASS.
- **Approvals page** — (3)/(4) approving via a direct PostgREST PATCH is gated by
  `approvals_update_approver` (SC-057 PASS: manager can't approve salary/finance/legal,
  employee can't approve at all).
- **Company/ownership settings (`company_sensitive`)** — (4) direct query returns 0 for
  employee/manager/CFO (SC-074 PASS).

ACTION: for each surface, attempt all four paths as the employee.

EXPECTED RESULT: every path fails for the unauthorized user. The critical point: because
`web/lib/supabase/server.ts` has NO application-level permission layer and every query
rides the user's RLS-scoped session, hiding a button and blocking the data are the SAME
boundary — there is no server action that bypasses RLS to trace separately (confirmed: no
service-role client anywhere, SC-092).

EXPECTED DENIALS: paths 2–4 return 0 rows / 403 for the employee on each surface.

EXPECTED DATABASE STATE: unchanged.

EXPECTED AUDIT EVENTS: n/a for the blocked reads.

EXPECTED AI VISIBILITY: the same data is absent from AI context.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. Paths 3–4 (server action / direct DB) are AUTOMATED via the
runner suite (sc057/sc069/sc074) because they reduce to RLS with no bypass layer. Paths 1–2
(UI hidden / route render) are MANUAL VERIFICATION via a real browser as the employee.
Cross-ref CLAUDE.md §7/§20, SC-092, SC-057, SC-074.

LAST VERIFIED DATE: 2026-08-27 (data-path halves PASS via runner; UI/route halves MANUAL)
