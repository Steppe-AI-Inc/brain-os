SCENARIO ID: SC-070-audit-log-leak

PURPOSE: The audit log must not become a side-channel. An ordinary employee reading
`audit_logs` must see only their own events, never a founder's salary-change / ownership /
legal / payment audit rows — audit visibility obeys the same authorization tiers as the
underlying data.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: `audit.read.own` only. NOT `audit.read.company` (that is manager+, and
currently inert because `company_id` is NULL on real audit rows — KNOWN_FAILURE_MODES.md
#7).

PRECONDITIONS: audit rows: a founder `salary_changed` event, a founder `ownership_modified`
event, and one `task_created` event actored by the employee.

ACTION: employee selects from `audit_logs`.

EXPECTED RESULT: only the employee's own row is visible; the two founder events are hidden.

EXPECTED DENIALS: `audit_logs_select_scope` = `is_founder_or_admin() OR actor_profile_id =
current_profile_id() OR is_company_manager(company_id)`. For a non-admin non-manager,
actor-self is the only satisfied branch.

EXPECTED DATABASE STATE: unchanged (read-only; rolled back).

EXPECTED AUDIT EVENTS: n/a.

EXPECTED AI VISIBILITY: audit rows for others' sensitive actions are never in the
employee's AI context.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc070_audit_log_leak.sql. Related:
SC-103 (audit rows cannot be tampered with), SC-104 (no secrets in audit metadata).
Cross-ref qa/KNOWN_FAILURE_MODES.md #7.

LAST VERIFIED DATE: 2026-08-27 (PASS — employee saw own row only; founder salary/ownership
events hidden)
