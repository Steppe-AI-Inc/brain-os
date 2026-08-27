SCENARIO ID: SC-058-bookkeeper-segregation-of-duties

PURPOSE: Document — honestly, as a KNOWN GAP — that Brain OS has no preparer-vs-approver
segregation of duties for finance/salary. A bookkeeper who creates an expense/payment
request should NOT be able to approve or execute their own; a separately authorized
CFO/founder should approve. Today the schema cannot express this.

ACTOR: BOOKKEEPER (personas/bookkeeper.md) = `hr_finance` — the same role a CFO maps to.

ORGANIZATION: CLIX GPS.

ROLE: `hr_finance`.

CAPABILITIES: `salary_write_hr` (`for all` = insert+update+delete on salary_private),
`finance`/`salary_hr` approval authority. There is no capability that grants "prepare
only, cannot approve."

PRECONDITIONS: an hr_finance account; a self-requested `finance` approval
(`requested_by_profile_id = self`); a person to attach salary to.

ACTION: The hr_finance account (1) writes a `salary_private` row directly, and (2) approves
its own self-requested finance approval.

EXPECTED RESULT: **GAP REPRODUCED — this is not a passing control.** Both succeed: the
salary row is written directly (no preparer restriction) and the self-requested finance
approval is self-approved (no requester≠approver check). A correct SoD control would deny
at least one.

EXPECTED DENIALS: (intended, not enforced) a preparer should be denied approving their own
finance/salary approval; a bookkeeper should be denied direct salary writes.

EXPECTED DATABASE STATE: salary row present, approval `approved` — demonstrating the gap.

EXPECTED AUDIT EVENTS: the writes/approvals audit normally; nothing flags the SoD
violation because none is defined.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: KNOWN GAP — see qa/KNOWN_FAILURE_MODES.md #14 and
qa/scenarios-runner/sc058_bookkeeper_sod_gap.sql (which REPRODUCES the gap, not a pass).
Fix requires either a new `bookkeeper` app_role (insert-only, no approval authority) or a
`requested_by_profile_id <> current_profile_id()` clause in `approvals_update_approver`
for finance/salary domains. Neither built (schema change needs founder-authorized push).
**Do NOT report SC-058 as PASS.**

LAST VERIFIED DATE: 2026-08-27 (gap REPRODUCED live: salary written directly + self-approval
succeeded)
