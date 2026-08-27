SCENARIO ID: SC-060-approval-payload-immutability

PURPOSE: Once an approval is created, its payload (the exact content/target being
approved) must be immutable. Approving "$2,200" and then editing it to "$1,200" before
execution must be impossible — a content change requires a brand-new approval. Applies to
outbound messages, payments, deletions, contracts, deployments, salary changes.

ACTOR: EMPLOYEE / requester and MANAGER / approver (personas/employee.md, manager.md).

ORGANIZATION: CLIX GPS.

ROLE: various — the point is that *no one* on the normal path may mutate a pending
approval's payload fields; only its `status`/`decided_at`/`decision_notes` change at
decision time.

CAPABILITIES: `approvals_update_approver` gates who can decide; it does not, and must not,
become a licence to rewrite `title`/`reason`/`approval_payload`.

PRECONDITIONS: A pending approval with `approval_payload = {"offerPrice": 2200}` (or a
deletion payload with a fixed `execute.taskIds` set).

ACTION: Attempt, as the approver, `UPDATE approvals SET approval_payload =
'{"offerPrice":1200}' WHERE id=...`.

EXPECTED RESULT: **KNOWN GAP (partial).** `approvals_update_approver` is a row-level
policy — it authorizes an UPDATE on the row, but Postgres RLS **cannot** pin individual
columns as immutable. An authorized approver's UPDATE that also changes `approval_payload`
is not blocked by RLS alone. Today, immutability is enforced only by convention +
application code: sem-ai-command builds `execute` server-side and `decide_approval()`
reads the payload as-stored at decision time; the /web UI exposes no payload-edit control.
There is **no database-level guard** (e.g. a trigger rejecting payload changes on a
`pending`/decided approval).

EXPECTED DENIALS: at the DB layer, an approver *can* currently rewrite the payload — so
the honest expected result is: this is enforced by absence-of-UI + server-built payloads,
not by a hard constraint. A real fix is a `BEFORE UPDATE` trigger on `approvals` that
raises if `approval_payload`/`title`/`domain`/`company_id` change once set.

EXPECTED DATABASE STATE: (intended) payload unchanged after any decision. (actual) not
guaranteed by RLS.

EXPECTED AUDIT EVENTS: any payload change should be audited; today it is not distinctly
audited.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: KNOWN GAP — see qa/KNOWN_FAILURE_MODES.md #15 (add). A column-immutability
trigger is the correct fix; not built this pass (schema change needs founder-authorized
push). The application-level mitigations (server-built payloads, no edit UI, decision-time
read) are real and reduce exposure but are not a guarantee. Do NOT report SC-060 as a
passing hard control.

LAST VERIFIED DATE: not yet run as a hard-constraint test — documented as a gap 2026-08-27
