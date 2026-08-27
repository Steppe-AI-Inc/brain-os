SCENARIO ID: SC-096-database-failure-during-action

PURPOSE: If an external side effect succeeds (e.g. a send) but the DB status write fails, a
retry must determine whether the external action already happened and avoid duplicating it.
Document a reconciliation path.

ACTOR: system.

ORGANIZATION: any.

ROLE: system.

CAPABILITIES: n/a.

PRECONDITIONS: an action with both an external side effect and a DB status write.

EXPECTED RESULT — honest assessment of the CURRENT system:
- **No external-integration side effects exist today** (no messaging/payment provider), so
  the "external succeeded but DB failed" split does not currently occur in production.
  Marked NOT APPLICABLE for the messaging case.
- **The one real side-effecting path is `decide_approval()`'s deletion**, and it is SAFE:
  the delete, the `approvals` status update, and the `audit_logs` insert all run inside ONE
  plpgsql function = ONE transaction. If the audit insert (or status update) fails, the
  DELETE rolls back with it — you cannot end up with "rows deleted but approval still
  pending." There is no external-vs-DB split to reconcile for the deletion path; it is
  atomic. **This is a strength, not a gap** — the task flagged a hypothetical gap here, but
  for the pure-DB deletion path it does not exist because everything is one transaction.
- **General principle for future integrations** (SC-109): any action with an external side
  effect MUST use an idempotency key + a reconciliation step (record "attempting", perform
  the external call with an idempotency key, record "done"; on retry, check the external
  provider's idempotency response before re-sending). This is a DESIGN REQUIREMENT for when
  such a path is built, not something to test today.

EXPECTED DENIALS / DATABASE STATE: the deletion path is atomic (all-or-nothing). No orphan
state.

EXPECTED AUDIT EVENTS: atomic with the action.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. The atomicity of the real deletion path is CODE-VERIFIED (single
transaction in migration 202608270005). The external-reconciliation requirement is NOT
APPLICABLE today (no external side effect) and is a future design requirement. Cross-ref
SC-095, SC-097, SC-109, CLAUDE.md §10.

LAST VERIFIED DATE: 2026-08-27 (deletion-path atomicity code-verified; external case N/A)
