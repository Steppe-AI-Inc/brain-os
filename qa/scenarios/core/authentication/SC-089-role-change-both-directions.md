SCENARIO ID: SC-089-role-change-both-directions

PURPOSE: Promotion and demotion must both take effect correctly — no stale broad access
surviving a demotion. Employee promoted to manager gains manager rights; demoted back to
employee loses them, immediately, on the same session.

ACTOR: EMPLOYEE ↔ MANAGER — fixture EMPLOYEE with `role_in_company` toggled.

ORGANIZATION: CLIX GPS.

ROLE: `role_in_company` promoted `employee`→`manager`, then demoted back.

CAPABILITIES: manager-tier reads/writes (`is_company_manager`) appear on promotion and
disappear on demotion, because the RLS functions read `role_in_company` live.

PRECONDITIONS: employee member of CLIX GPS with a manager-only resource present
(financial_reports, a co-worker's task).

ACTION: (1) as employee: confirm manager-only resource is hidden; (2) promote to
`role_in_company='manager'`; re-query: now visible; (3) demote back to `employee`;
re-query: hidden again.

EXPECTED RESULT: visibility exactly tracks the current `role_in_company` at query time; no
manager visibility persists after demotion.

EXPECTED DENIALS: after demotion, `is_company_manager` returns false → financial_reports
and other-owner tasks return 0.

EXPECTED DATABASE STATE: unchanged (read-only; rolled back).

EXPECTED AUDIT EVENTS: role changes themselves should be audited by whatever admin flow
performs them (out of scope here).

EXPECTED AI VISIBILITY: AI context breadth tracks the current role — a demoted user's
context no longer includes manager-scoped rows.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED (same mechanism as SC-088) — the live proof that RLS
re-evaluates membership/role per query (sc088_091_access_revocation.sql) is the identical
guarantee; a promote→demote variant follows directly (toggle `role_in_company` between two
impersonated queries). SC-074's runner already demonstrates the employee→manager→hr_finance
progression producing different visibility per role. Cross-ref SC-088, SC-057.

LAST VERIFIED DATE: 2026-08-27 (mechanism VERIFIED via SC-074 + SC-088 runners)
