SCENARIO ID: SC-137-approval-approved-but-not-executed-visible

PURPOSE: A decided approval's real outcome must be visible in the UI, not just a bare
"approved"/"rejected" badge — the exact architectural defect this whole work session is
closing (an approval could read "approved" while nothing behind it ever ran).

ACTOR: any user with Approvals visibility.

ORGANIZATION: any.

ROLE: any.

CAPABILITIES: read-only for this scenario.

PRECONDITIONS: at least one decided approval with a non-null `decision_notes` produced by
`decide_approval()` (e.g. "Linked task resumed (queued)." or "3 task(s) deleted.") and at
least one with `decision_notes IS NULL` (a plain decision with nothing to resume/execute —
the common case for most approvals, which is correct, not a bug).

ACTION: open `/approvals`, switch to the Decided tab.

EXPECTED RESULT: each decided row shows its `decision_notes` line directly beneath the
title when present (`web/app/(app)/approvals/page.tsx`'s Decided tab,
`getApprovals()` now selects `decision_notes`) — the founder can see "3 task(s) deleted."
or "Linked task resumed (queued)." without opening anything else. A row with no
`decision_notes` shows just the badge, which is honest: nothing was deferred to this
approval, so there's nothing further to report.

EXPECTED DENIALS: n/a.

EXPECTED DATABASE STATE: unchanged (read-only).

EXPECTED AUDIT EVENTS: n/a for this scenario (covered by SC-059's `approval_decided` audit
row, which is where `decision_notes`'s content is derived from — see `decide_approval()`).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — `tsc`/`eslint`/`next build` clean 2026-08-28.
Known remaining gap, not solved by this pass: this system's execution is synchronous
(`decide_approval()` runs the resume/deletion inside the same transaction as the decision),
so there is no real "Approved — Waiting for Execution / Executing" intermediate state to
render — the spec's fuller execution-status lifecycle (section 22) assumes async execution
this architecture doesn't have. `decision_notes` is the honest substitute: it shows the
real result the moment it exists, because it always exists by the time the row is decided.

LAST VERIFIED DATE: not yet run live.
