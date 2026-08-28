SCENARIO ID: SC-132-approval-delete-actually-executes

PURPOSE: An approval-record deletion (via chat, the per-row delete button, or "Clear all")
must actually remove the row(s) from `public.approvals`, and the count reported back must
be the real affected count — not the requested count, not a model's guess. Grounded in a
real 2026-08-28 bug: the founder asked chat to "delete all tasks and approvals"; tasks
really were deleted (`deleteTaskIds` already worked), but the AI's summary claimed "deleting
... 85 pending approvals" when there was no `deleteApprovalIds` field, no execution code,
and no DELETE RLS policy on `approvals` at all — `pending_approval_count` stayed at 85,
confirmed directly against production. See qa/KNOWN_FAILURE_MODES.md #16 and #17.

ACTOR: FOUNDER (positive), ORDINARY_EMPLOYEE (negative), wrong-company COMPANY_MANAGER
(negative).

ORGANIZATION: any company with `pending`/decided `approvals` rows.

ROLE: `founder`/`holding_admin` or `company_manager` (own company) — positive;
`employee`/`contractor` or a manager of a *different* company — negative.

CAPABILITIES: `approvals_delete_scope` RLS (migration 202608280001):
`is_founder_or_admin() OR is_company_manager(company_id)`. Deliberately narrower than
`approvals_update_approver` (which also allows the domain-gated approver/hr_finance to
*decide* an approval) — deleting the record outright is an administrative action, same
tier as `tasks_delete_scope`, not a decision.

PRECONDITIONS: N ≥ 3 real approval rows across at least 2 companies, mixed pending/decided.

ACTION:
1. UI: click the per-row delete (trash) button on one pending and one decided approval.
2. UI: "Clear all pending" and "Clear all decided" (`web/app/(app)/approvals/clear-all-approvals.tsx`).
3. Chat: "delete approval <id>" (one real id from `context.approvals`), then "delete all
   pending approvals" when the pending count exceeds the 20-row context cap.
4. Negative: repeat as an employee, and as a manager of a different company.

EXPECTED RESULT:
- Row(s) actually removed from `public.approvals` — verified by a real `count(*)` query,
  not just the UI updating.
- Chat's reply is grounded in the real affected count (`web/lib/data/approvals.ts`
  `deleteApproval`/`deleteAllApprovals`; `sem-ai-command/index.ts`'s `deleteApprovalIds`
  block + the prepended fact-line, see SC-133) — if 20 of a claimed 85 are actually in
  context and deleted, the reply says 20, and separately says more exist beyond what it
  could see, pointing at the "Clear all" button for the rest.
- "Clear all pending"/"Clear all decided" delete exactly the ids the page loaded
  (`getApprovals()` has no limit) — reliable for true "delete everything" regardless of
  chat's context cap.

EXPECTED DENIALS: employee/contractor gets 0 rows affected (RLS-scoped delete, not an
error) on every path above. A manager of company B cannot delete company A's approvals.

EXPECTED DATABASE STATE: exactly the targeted rows gone; everything else untouched
(including decided rows the action wasn't scoped to, e.g. "Clear all pending" must not
touch decided rows).

EXPECTED AUDIT EVENTS: none dedicated yet for approval-record deletion (open item — the
`decide_approval`-driven decision path writes `approval_decided`; a plain row DELETE via
RLS today does not itself write an audit_logs row). Flagged as a gap, not silently ignored.

EXPECTED AI VISIBILITY: `context.approvals` only ever holds pending rows
(`.eq('status','pending').limit(20)`) — chat can never reference a decided approval by id.

CLEANUP: fixture rows only; delete via the same mechanism under test.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — RLS policy confirmed present in
`supabase/schema-v0.7-production-core.sql` and the standalone migration
`202608280001_approvals_delete_scope.sql`; not yet pushed to production (needs the same
explicit founder authorization as any RLS/security change) and not yet re-verified live
post-push. Re-verify with the same live-impersonation method used for SC-057/SC-093 once
pushed.

LAST VERIFIED DATE: not yet run live — code + migration written and build-verified
(`npm run build`, `npx tsc --noEmit`, `npx eslint` all clean) 2026-08-28; pending production
push authorization.
