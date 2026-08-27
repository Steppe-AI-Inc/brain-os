SCENARIO ID: SC-062-approval-target-changed

PURPOSE: An approval requests deletion of Task A; before execution Task A changes company
or becomes protected. The executor must revalidate the target at execution time, not
blindly execute a stale approval — and audit the reason.

ACTOR: FOUNDER / authorized approver.

ORGANIZATION: CLIX GPS.

ROLE: `founder`.

CAPABILITIES: `decide_approval()` executes the deferred deletion.

PRECONDITIONS: a pending approval with `execute.taskIds=[A]`; then Task A is moved to
another company (its `company_id` changes) before the approval is decided.

ACTION: approve the approval; `decide_approval()` runs the deletion.

EXPECTED RESULT: `decide_approval()` deletes with a defense-in-depth scope clause:
`delete from public.tasks where id = any(v_task_ids) AND company_id is not distinct from
v_approval.company_id`. If Task A no longer belongs to the approval's `company_id`, it is
NOT deleted — the deletion count reflects only rows still matching, and the summary reports
the real (possibly 0) count. So a stale target that moved company is not blindly deleted.

EXPECTED DENIALS: a target whose company no longer matches the approval's company is
skipped by the scope clause.

EXPECTED DATABASE STATE: only still-valid targets deleted; moved/protected target survives;
approval `approved`.

EXPECTED AUDIT EVENTS: one `approval_decided` row whose `deletionSummary`/metadata reflects
the actual affected count (0 or fewer than requested if a target moved).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: CODE-VERIFIED + partially logic-tested. The company-scope revalidation
clause is in migration 202608270005 (the `company_id is not distinct from v_approval.company_id`
guard on the delete). SC-059's runner confirms the delete runs scoped to the approval's
company; a variant that moves the target company first would show a reduced count — follows
directly from the same clause. **Honest gap**: the executor revalidates COMPANY scope but
does NOT check a "protected" flag (no such flag exists on tasks today) — if a
protected-target concept is added later, the executor must be extended to check it. Cross-ref
SC-059, SC-094, SC-061.

LAST VERIFIED DATE: 2026-08-27 (company-scope revalidation code-verified via SC-059; protected-flag N/A)
