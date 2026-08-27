SCENARIO ID: SC-059-approval-must-execute

PURPOSE: Flagship "approval must actually execute" scenario. An approval that is approved
must perform the deferred work it promised — not merely flip its own status row. Grounded
in the real 2026-08-27 bug: a 68-task bulk-deletion approval was approved but nothing was
ever deleted, because `decideApproval()` only updated the approval row and never executed
anything or resumed the linked task. Fixed by the `decide_approval()` SECURITY DEFINER
function (migration 202608270005).

ACTOR: FOUNDER (positive control) — fixture auth `cbcc41cf-830d-4600-8545-3b9e22c8297f`.

ORGANIZATION: CLIX GPS (`ed8ae510-...`).

ROLE: `founder`.

CAPABILITIES: approve any domain; `decide_approval()` re-derives the same domain-gated
authority as `approvals_update_approver` before doing anything.

PRECONDITIONS: Tasks A, B, C (status `done`) plus control task D (`queued`) in CLIX GPS.
One `pending` approval whose `approval_payload.execute` = `{action:'delete_tasks',
taskIds:[A,B,C]}` — the payload is built server-side in sem-ai-command from
`pendingDeleteTaskIds` after cross-checking each id against `contextTaskIds`, never from
the model's raw JSON.

ACTION: Founder calls `decide_approval(<id>, 'approved')`. Then calls it a second time
(idempotency / double-click / retry).

EXPECTED RESULT: First call deletes exactly A, B, C and returns `deletion_summary = '3
task(s) deleted.'`. If the approval were linked to a task via `task_id`, that task
transitions `needs_approval -> queued`. Second call is a no-op (the approval is no longer
`pending`, so the `.eq status='pending'` guard skips execution) — returns no further
deletion.

EXPECTED DENIALS: D is never touched (not in the payload). An id outside the approval's
own `company_id` would not be deleted (defense-in-depth `company_id is not distinct from`
clause). A caller lacking the domain authority gets a no-op decided=false.

EXPECTED DATABASE STATE: A, B, C deleted; D present; approval `status='approved'`,
`decided_at` set; exactly one execution regardless of call count.

EXPECTED AUDIT EVENTS: one `approval_decided` audit_logs row per successful decision, with
`decision`, `taskResumed`, `deletionSummary` in metadata.

EXPECTED AI VISIBILITY: n/a (this is the execution layer, not a read path). The chat UI
should render the real `deletion_summary`, not a bare "approved."

CLEANUP: none — runner rolls back (including the function definition it loads).

AUTOMATION STATUS: AUTOMATED. Two runners exist:
- `qa/scenarios-runner/sc059_approval_execution.sql` — loads the committed function
  definition into a rolled-back transaction and verifies the logic (use before deployment).
- `qa/scenarios-runner/sc059b_live_decide_approval.sql` — calls the LIVE function directly
  (use once deployed).
**UNEXPECTED LIVE STATUS**: `decide_approval` was absent from production at session start
but is now LIVE as the full committed migration 202608270005 body, applied by a mechanism
NOT initiated by this work (I never ran `db push`; CI runs all failed). `sc059b` verified
the LIVE function works correctly (2 targets deleted, control survived, idempotent,
status approved). **See qa/scenarios/INCIDENT-2026-08-28-decide_approval-live.md — founder
must confirm whether this deployment is intended.** Cross-ref qa/ACCEPTANCE_TESTS.md #7,
SC-094, SC-126.

LAST VERIFIED DATE: 2026-08-27 (logic VERIFIED against committed migration) + LIVE function
VERIFIED via sc059b (deletes exact targets, idempotent, control survives)
