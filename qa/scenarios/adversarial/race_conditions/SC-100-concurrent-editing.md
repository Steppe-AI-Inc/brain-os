SCENARIO ID: SC-100-concurrent-editing

PURPOSE: Two people acting on the same object simultaneously. The spec's original framing
(two employees replying to the same customer conversation) is NOT APPLICABLE — no external
conversation/reply subsystem exists. A scoped-down, REAL version applies: two authorized
users editing the same task, or deciding the same approval, concurrently.

ACTOR: two managers/founders of the same company.

ORGANIZATION: CLIX GPS.

ROLE: `manager`/`founder`.

CAPABILITIES: both can edit the task / decide the approval.

PRECONDITIONS: one shared task (or one pending approval).

ACTION: two sessions update the same task concurrently / decide the same approval
concurrently.

EXPECTED RESULT:
- **Tasks**: `tasks_update_scope` allows both managers; there is no optimistic-lock/version
  column on `tasks`, so concurrent edits are **last-write-wins** at the field level. This is
  acceptable for internal task edits but is documented honestly: there is NO conflict
  detection today. If a future feature needs it, add an `updated_at`/version guard.
- **Approvals**: `decide_approval()`'s `FOR UPDATE` lock + `status='pending'` guard make
  concurrent decisions safe — exactly one decision takes effect (SC-064). This is the one
  place concurrency is genuinely guarded.
- **External customer replies**: NOT APPLICABLE — no such subsystem.

EXPECTED DENIALS: none at the task layer (both are authorized); the losing approval
decision no-ops.

EXPECTED DATABASE STATE: task reflects the last write; approval decided once.

EXPECTED AUDIT EVENTS: each task edit audits independently; the approval audits once.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. The approval-concurrency guard is CODE-VERIFIED (SC-064). The
task last-write-wins behavior is documented as a known non-guarantee (no version column) —
MANUAL to demonstrate, not a defect but a design fact worth recording. The
customer-conversation half is NOT APPLICABLE — feature not yet implemented. Cross-ref
SC-064, messaging/.

LAST VERIFIED DATE: 2026-08-27 (approval concurrency via SC-064; task last-write-wins documented)
