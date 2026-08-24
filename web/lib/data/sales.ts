"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getLeads() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_leads")
    .select("id, client_name, contact_name, contact_email, status, stage, value_estimate, company_id, companies(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Any company member can create/work their own leads (RLS: sales_leads_insert_member /
// sales_leads_update_own_or_manager) — normal CRM usage, not manager-gated like
// product_lines/proposals.
export async function createLead(_prevState: string | null, formData: FormData) {
  const clientName = String(formData.get("client_name") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const contactEmail = String(formData.get("contact_email") || "").trim();
  const valueEstimate = Number(formData.get("value_estimate") || 0);
  if (!clientName) return "Client name is required.";
  if (!companyId) return "Company is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("sales_leads").insert({
    client_name: clientName,
    company_id: companyId,
    contact_email: contactEmail || null,
    value_estimate: valueEstimate,
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

export async function updateLead(id: string, input: LeadInput) {
  if (!input.clientName.trim()) return "Client name is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("sales_leads")
    .update({
      client_name: input.clientName.trim(),
      company_id: input.companyId,
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim() || null,
      stage: input.stage.trim() || "lead",
      value_estimate: input.valueEstimate,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/sales");
  return null;
}

export async function deleteLead(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_leads").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/sales");
  return null;
}
