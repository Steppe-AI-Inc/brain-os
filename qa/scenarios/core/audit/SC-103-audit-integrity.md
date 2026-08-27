SCENARIO ID: SC-103-audit-integrity

PURPOSE: After a sensitive action, the real `audit_logs` row must exist with actor / role /
event / entity / timestamp, and an ordinary user must not be able to modify or delete it.
Audit integrity is a security property, not a nicety.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: `audit_logs_insert_auth` (any authenticated may insert), `audit_logs_select_scope`
(read own/company/admin). There is deliberately **no** UPDATE or DELETE policy.

PRECONDITIONS: an audit row actored by the employee (so they can even see it).

ACTION: employee attempts `UPDATE audit_logs SET message=...` and `DELETE FROM audit_logs`
on their own row.

EXPECTED RESULT: neither takes effect — the message is unchanged and the row still exists.
With RLS enabled and no UPDATE/DELETE policy present, both operations are default-denied
(they silently affect 0 rows).

EXPECTED DENIALS: UPDATE and DELETE on `audit_logs` for any non-superuser — enforced by
**absence** of a permissive policy (RLS default-deny), which this scenario documents as
the actual mechanism (verified live, not assumed).

EXPECTED DATABASE STATE: audit row unchanged and present after the attempts.

EXPECTED AUDIT EVENTS: n/a (the tamper attempts produce no rows).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc103_audit_integrity.sql. Finding
recorded: `audit_logs` write-protection is real but is provided by the *absence* of an
UPDATE/DELETE policy under enabled RLS — worth keeping in mind if a future migration ever
adds a broad `for all` policy to this table (that would silently open tampering; this is
the same class as KNOWN_FAILURE_MODES.md #1). Cross-ref SC-070, SC-125 (policy coverage).

LAST VERIFIED DATE: 2026-08-27 (PASS — UPDATE/DELETE left the row unchanged and present)
