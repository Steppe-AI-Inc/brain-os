SCENARIO ID: SC-136-approval-history-accessible-without-long-scroll

PURPOSE: Decided approval history must be reachable without scrolling past a long, growing
pending list. Grounded in explicit UX feedback: "excessive vertical scrolling... approval
history is too far down... active approvals and history are not clearly separated."

ACTOR: any user with the Approvals page authorized.

ORGANIZATION: any.

ROLE: any with `approvals_select_scope` visibility.

CAPABILITIES: read-only for this scenario.

PRECONDITIONS: N ≥ 20 pending approvals and M ≥ 10 decided approvals for the same viewer.

ACTION: open `/approvals`.

EXPECTED RESULT: `web/app/(app)/approvals/page.tsx` renders a top summary strip (needs-
decision / approved / rejected / total counts, `StatCard`) followed by a `Tabs` split
(`Pending (N)` / `Decided (M)`) — decided history is one click away regardless of how long
the pending list is, not N cards of scrolling away. Each tab's own list still scrolls
normally with its own content, but switching tabs is instant navigation, not scrolling.

EXPECTED DENIALS: n/a (UI-only scenario; the underlying `getApprovals()` RLS scoping is
unchanged from before this redesign).

EXPECTED DATABASE STATE: unchanged — this is presentation only.

EXPECTED AUDIT EVENTS: n/a.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: fixture rows only.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — `tsc`/`eslint`/`next build` clean 2026-08-28;
not yet checked in a real browser with a large synthetic dataset (spec's own #26/#27 call
for 200-500 records — not generated this pass; flagged as a real follow-up, not silently
skipped).

LAST VERIFIED DATE: not yet run live.
