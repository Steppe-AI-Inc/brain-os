"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getApprovals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "id, title, reason, status, risk_level, domain, decision_notes, created_at, companies(name)"
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
