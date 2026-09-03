"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Invite-only onboarding (202608310009) management surface. Creation goes through
// create_company_invitation() and acceptance through accept_company_invitation() — this
// module is only the founder/manager-facing LIST and REVOKE half that had no UI at all:
// an invitation could be sent but never seen again nor cancelled.
//
// The token column is deliberately NEVER selected here: it is a single-use bearer
// credential redeemed only via the SECURITY DEFINER acceptance RPC. A management list
// has no use for it, and putting it in a server-rendered page would turn every page
// view into a credential exposure. RLS (company_invitations_manage_scope:
// founder/admin or manager of the target company) scopes both reads and the revoke.
export async function getPendingInvitations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_invitations")
    .select("id, email, invited_role, status, expires_at, created_at, companies(name, status)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Checks affected row count, not just `error` — an RLS-blocked or already-decided
// invitation silently matches 0 rows rather than erroring. Same defect class as
// qa/KNOWN_FAILURE_MODES.md #17/#18. The status='pending' predicate makes revoke
// idempotent-safe: an already-accepted invitation can never be flipped to revoked
// after the fact (its membership was already granted; revoking the row would lie).
export async function revokeInvitation(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was revoked — this invitation may already be accepted, revoked, or outside your access.";
  revalidatePath("/access");
  return null;
}
