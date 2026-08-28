"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getApprovals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "id, title, reason, status, risk_level, domain, decision_notes, approval_payload, created_at, decided_at, companies(name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// The real enforcement is the decide_approval() Postgres function (migration
// 202608270005), which re-implements the same domain-gated authority as the
// approvals_update_approver RLS policy (salary_hr/finance -> HR-finance role, general/
// production/external_comms -> company manager, legal -> founder/admin or the explicit
// approver) and only proceeds when the approval is still 'pending' — so deciding an
// already-decided approval is a safe no-op, never a double-execution. Beyond flipping
// status, it also resumes whatever was actually paused for this approval: a linked task
// (task_id) moves out of needs_approval, and a deferred deletion (approval_payload.execute)
// actually runs. Before this, decideApproval() only ever updated the approval row's own
// status — approving something never made anything happen (confirmed live: a 68-task
// bulk-deletion approval had no task_id and no target ids, so approving it deleted
// nothing; see qa/ACCEPTANCE_TESTS.md #7).
export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected"
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("decide_approval", { p_approval_id: approvalId, p_decision: decision })
    .single();

  if (error) return error.message;
  if (!data || !data.decided) {
    return "You don't have authority to decide this approval, or it was already decided (checked by the database, not just the UI).";
  }

  revalidatePath("/approvals");
  revalidatePath("/tasks");
  return null;
}

// approvals_delete_scope RLS (migration 202608280001) is the real enforcement — founder/
// admin or the approval's own company manager, same tier as tasks_delete_scope. Deleting
// the record is separate from deciding it: this never runs decide_approval(), so a linked
// task or deferred deletion in approval_payload.execute is untouched either way.
//
// Added after a real bug caught live: the founder asked chat to "delete all tasks and
// approvals" as test-data cleanup, and the AI replied claiming both were deleted — tasks
// really were (deleteTaskIds), approvals were not, because no delete mechanism existed at
// all (no field, no RLS policy). This bulk action is the reliable path — it deletes every
// id getApprovals() actually returned (that query has no limit/pagination), unlike a chat
// request whose context.approvals is capped and can't enumerate more than a page.
// Single-row version of the same action — deciding an approval (Approve/Reject) and
// deleting its record are deliberately separate controls in the UI, not one combined
// action, per the founder's explicit ask: deleting removes the record (including its
// decision history) without running whatever a decision would have.
export async function deleteApproval(id: string): Promise<string | null> {
  return deleteAllApprovals([id]);
}

// Checks affected row count, not just `error` — an RLS-blocked or already-gone approval
// returns success with 0 rows, not an error. Same defect class this whole session has
// been closing everywhere else (qa/KNOWN_FAILURE_MODES.md #17/#18) — a delete button that
// reports success without checking is exactly the same false-claim shape as the AI
// narrating a deletion that never ran, just triggered by a human click.
export async function deleteAllApprovals(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("approvals").delete().in("id", ids).select("id");
  if (error) return error.message;
  const deletedCount = data?.length || 0;
  if (deletedCount > 0) revalidatePath("/approvals");
  if (deletedCount < ids.length) {
    return `Only ${deletedCount} of ${ids.length} approval(s) were deleted — the rest may no longer exist or you may not have access to them.`;
  }
  return null;
}
