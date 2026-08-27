SCENARIO ID: SC-063-double-approval-click

PURPOSE: A founder clicking Approve twice, or an API retry resending the approval request,
must produce exactly one execution, one external effect, no duplicate deletion/message/
payment. Idempotency, tested directly against `decide_approval()`'s pending-status guard.

ACTOR: FOUNDER (or any authorized approver).

ORGANIZATION: CLIX GPS.

ROLE: `founder`.

CAPABILITIES: decide the approval; execution runs once.

PRECONDITIONS: a `pending` approval with a deferred `execute` deletion payload.

ACTION: call `decide_approval(<id>, 'approved')` twice in immediate succession.

EXPECTED RESULT: the first call transitions the approval and executes (deletes the exact
target set); the second call is a no-op. `decide_approval()` guards with
`if not v_can_decide or v_approval.status <> 'pending' then return (false…)` — once the
first call sets `status='approved'`, the row is no longer `pending`, so the second call
executes nothing. Exactly one deletion, one status flip, one audit row.

EXPECTED DENIALS: the second decision does nothing (decided=false).

EXPECTED DATABASE STATE: single execution; target rows deleted once; approval `approved`.

EXPECTED AUDIT EVENTS: exactly one `approval_decided` row (the first call).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED (logic) — proven by qa/scenarios-runner/sc059_approval_execution.sql
(second call returns "noop", no further deletion). Additionally, even the plain
`UPDATE approvals` path is idempotent by construction — it is a single-row UPDATE, not an
insert, so repeated calls converge (qa/REGRESSION_CATALOG.md "Approval double-decision").
Deployment of decide_approval still PENDING founder push (see SC-059). Cross-ref SC-064,
SC-059, SC-094.

LAST VERIFIED DATE: 2026-08-27 (idempotency VERIFIED via SC-059 runner: 2nd call noop)
