SCENARIO ID: SC-094-destructive-bulk-action

PURPOSE: The most fully-specified destructive-action scenario, tied directly to the real
68-task bug and the `decide_approval()` fix. "Delete all Done tasks" must: compute the
exact affected ids up front, show the count, create an immutable approval payload
containing exactly those ids, NOT include tasks created after the request, execute only
the original ids on approval, be idempotent on re-run, and record the affected count/ids
in audit.

ACTOR: FOUNDER — fixture auth `cbcc41cf-830d-4600-8545-3b9e22c8297f`.

ORGANIZATION: CLIX GPS.

ROLE: `founder`.

CAPABILITIES: bulk deletion via a deferred approval payload; `decide_approval()` executes.

PRECONDITIONS: Several `done` tasks. sem-ai-command resolves the "all done tasks" set to
concrete ids (cross-checked against `contextTaskIds`), attaches them as
`pendingDeleteTaskIds` -> an approval with `approval_payload.execute = {action:'delete_tasks',
taskIds:[...]}`. A NEW `done` task is created AFTER the approval is made.

ACTION: Founder approves the bulk-deletion approval, then re-runs the executor.

EXPECTED RESULT: Only the ids captured at request time are deleted. The task created after
the request is NOT deleted (it was never in the payload — immutability of the target set).
Status flips once; re-run deletes nothing (idempotent `status='pending'` guard). Audit
records the affected count.

EXPECTED DENIALS: any id outside the approval's `company_id` is not deleted (defense-in-
depth clause). An unauthorized approver: no-op.

EXPECTED DATABASE STATE: exactly the original id set deleted; later task survives; approval
`approved`; single execution.

EXPECTED AUDIT EVENTS: one `approval_decided` row with `deletionSummary` and the affected
count.

EXPECTED AI VISIBILITY: the chat reply shows the real deletion summary ("N task(s)
deleted."), never a bare "approved."

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED (logic) — shares qa/scenarios-runner/sc059_approval_execution.sql
(same mechanism; SC-059 proves exact-id + idempotency + control-survivor). The "tasks
added after the request are excluded" property is structural: the payload is a fixed id
array captured at request time, so a later task simply isn't in it. Deployment of the
underlying migration is still PENDING founder authorization (see SC-059 blocker). Cross-ref
qa/ACCEPTANCE_TESTS.md #7, SC-059, SC-126.

LAST VERIFIED DATE: 2026-08-27 (logic VERIFIED via SC-059 runner)
