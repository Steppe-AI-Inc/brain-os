-- Real bug caught live, 2026-08-28: the founder asked Brain OS chat to "delete all tasks
-- and approvals" as test-data cleanup before employee rollout. The AI replied "deleting
-- all 12 tasks and 85 pending approvals... Deletion in progress" -- a false claim. Tasks
-- actually deleted (task_count went to 0, matching the real deleteTaskIds mechanism).
-- Approvals did not: there was no deleteApprovalIds field, no execution code, and no
-- DELETE RLS policy on public.approvals at all -- confirmed directly against production
-- (pending_approval_count stayed at 85, byte-for-byte the number the AI claimed to have
-- deleted). The AI's free-form summary text narrated an action outside anything it
-- actually did, with no mechanism to have honored it even if the model had tried.
--
-- This migration adds the missing DELETE policy, matching the same authority tier as
-- tasks_delete_scope (founder/admin or the approval's own company manager) -- deleting an
-- approval record outright is at least as administrative/destructive an action as deleting
-- a task, so it gets the same tier, not the broader approvals_update_approver domain-gated
-- tier (deciding an approval and deleting its record are different operations).

drop policy if exists "approvals_delete_scope" on public.approvals;
create policy "approvals_delete_scope" on public.approvals for delete using (
  public.is_founder_or_admin() or public.is_company_manager(company_id)
);
