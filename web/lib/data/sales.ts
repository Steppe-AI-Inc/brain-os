"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Multi-org milestone: activeOrganizationId scopes Leads to the currently selected
// organization when set, same pattern as getPeople() in lib/data/people.ts — a query-shape
// filter only, RLS remains the sole authorization boundary either way.
export async function getLeads(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("sales_leads")
    .select("id, client_name, contact_name, contact_email, status, stage, value_estimate, company_id, companies(name, status)")
    .order("created_at", { ascending: false });
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Any company member can create/work their own leads (RLS: sales_leads_insert_member /
// sales_leads_update_own_or_manager / sales_leads_select_scope) — normal CRM usage, not
// manager-gated like product_lines/proposals. owner_person_id must actually be set to
// the creator, or "leads they own" is meaningless: the update and (as of this pass)
// select policies both key off it, so a lead created without an owner was invisible to
// its own creator (only managers could see or edit it) — a real pre-existing bug, not
// just a hardening gap.
export async function createLead(_prevState: string | null, formData: FormData) {
  const clientName = String(formData.get("client_name") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const contactEmail = String(formData.get("contact_email") || "").trim();
  const valueEstimate = Number(formData.get("value_estimate") || 0);
  if (!clientName) return "Client name is required.";
  if (!companyId) return "Company is required.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let ownerPersonId: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
    if (profile) {
      const { data: person } = await supabase.from("people").select("id").eq("profile_id", profile.id).maybeSingle();
      ownerPersonId = person?.id ?? null;
    }
  }

  const { error } = await supabase.from("sales_leads").insert({
    client_name: clientName,
    company_id: companyId,
    contact_email: contactEmail || null,
    value_estimate: valueEstimate,
    owner_person_id: ownerPersonId,
  });
  if (error) return error.message;

  revalidatePath("/sales");
  return null;
}

export type LeadInput = {
  clientName: string;
  companyId: string;
  contactName: string;
  contactEmail: string;
  stage: string;
  valueEstimate: number;
};

// Both check affected row count, not just `error` — sales_leads_update_own_or_manager/
// sales_leads_delete_manager RLS means a caller outside the allowed tier silently matches
// 0 rows rather than erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateLead(id: string, input: LeadInput) {
  if (!input.clientName.trim()) return "Client name is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_leads")
    .update({
      client_name: input.clientName.trim(),
      company_id: input.companyId,
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim() || null,
      stage: input.stage.trim() || "lead",
      value_estimate: input.valueEstimate,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this lead may no longer exist or you may not have access to it.";
  revalidatePath("/sales");
  return null;
}

export async function deleteLead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales_leads").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this lead may no longer exist or you may not have access to it.";
  revalidatePath("/sales");
  return null;
}
