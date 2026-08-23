"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getApprovals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(
      "id, title, reason, status, risk_level, domain, created_at, companies(name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// The real enforcement is the approvals_update_approver RLS policy (domain-gated:
// salary_hr/finance -> HR-finance role, general/production/external_comms -> company
// manager, legal -> founder/admin or the explicit approver). If a user lacks
// authority for this approval's domain, this update simply affects 0 rows rather than
// erroring, which is correct Postgres RLS behavior for an UPDATE outside policy scope —
// surfaced here as a clear message rather than a silent no-op.
export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected"
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", approvalId)
    .select("id");

  if (error) return error.message;
  if (!data || data.length === 0) {
    return "You don't have authority to decide this approval (checked by the database, not just the UI).";
  }

  revalidatePath("/approvals");
  return null;
}
