/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceRow = {
  membershipId: string;
  role: string;
  active: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    status: string;
    is_sem_internal: boolean;
  } | null;
};

export async function getWorkspaces(): Promise<WorkspaceRow[]> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("organization_memberships")
    .select("id, role, active, organizations(id,name,slug,kind,status,is_sem_internal)")
    .eq("active", true)
    .order("joined_at", { ascending: true });

  if (error) {
    // Allows the branch UI to render before the new migration is applied to a preview DB.
    if (String(error.message || "").includes("organization_memberships")) return [];
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    membershipId: row.id,
    role: row.role,
    active: row.active,
    organization: Array.isArray(row.organizations) ? row.organizations[0] ?? null : row.organizations ?? null,
  }));
}

export async function createWorkspaceAction(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "company");
  if (name.length < 2) return "Enter a workspace/company name.";

  const supabase = await createClient();
  const db = supabase as any;
  const { error } = await db.rpc("create_organization", { p_name: name, p_kind: kind });
  if (error) return error.message;
  revalidatePath("/workspaces");
  return null;
}

export type InviteState = { error?: string; token?: string; invitationId?: string } | null;

export async function createInvitationAction(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  const organizationId = String(formData.get("organization_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "member");
  if (!organizationId || !email) return { error: "Workspace and email are required." };

  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db.rpc("create_organization_invitation", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
    p_expires_hours: 168,
  });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/workspaces");
  return { token: row?.raw_token, invitationId: row?.invitation_id };
}

export async function acceptInvitationAction(_prevState: string | null, formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  if (!token) return "Invitation token is required.";
  const supabase = await createClient();
  const db = supabase as any;
  const { error } = await db.rpc("accept_organization_invitation", { p_raw_token: token });
  if (error) return error.message;
  revalidatePath("/workspaces");
  return null;
}
