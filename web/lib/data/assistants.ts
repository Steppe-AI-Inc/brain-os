/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getPersonAssistants() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("person_ai_assistants")
    .select("id,display_name,status,disclosure_label,organization_id,company_id,people(id,full_name,role_title),assistant_automation_policies(id,name,mode,fallback_sla_minutes,allowed_categories,blocked_categories,version,active)")
    .order("created_at", { ascending: false });
  if (error) {
    if (String(error.message || "").includes("person_ai_assistants")) return [];
    throw error;
  }
  return data ?? [];
}

export async function createPersonAssistantAction(_prevState: string | null, formData: FormData) {
  const organizationId = String(formData.get("organization_id") || "");
  const personId = String(formData.get("person_id") || "");
  const mode = String(formData.get("mode") || "draft");
  const fallbackMinutes = Math.max(1, Number(formData.get("fallback_sla_minutes") || 60));
  const allowed = String(formData.get("allowed_categories") || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!organizationId || !personId) return "Workspace and employee are required.";

  const supabase = await createClient();
  const db = supabase as any;
  const { data: person, error: personError } = await db
    .from("people")
    .select("id,full_name,company_id")
    .eq("id", personId)
    .single();
  if (personError || !person) return personError?.message || "Person not found.";

  const { data: policy, error: policyError } = await db
    .from("assistant_automation_policies")
    .insert({
      organization_id: organizationId,
      person_id: personId,
      name: `${person.full_name} assistant policy`,
      mode,
      fallback_sla_minutes: fallbackMinutes,
      allowed_categories: allowed,
      active: true,
    })
    .select("id")
    .single();
  if (policyError || !policy) return policyError?.message || "Failed to create assistant policy.";

  const { error } = await db.from("person_ai_assistants").insert({
    organization_id: organizationId,
    company_id: person.company_id || null,
    person_id: personId,
    policy_id: policy.id,
    display_name: `${person.full_name} AI Assistant`,
    disclosure_label: "AI Assistant",
    status: "active",
  });
  if (error) return error.message;

  revalidatePath("/assistants");
  return null;
}

export async function updateAssistantPolicyAction(_prevState: string | null, formData: FormData) {
  const policyId = String(formData.get("policy_id") || "");
  const mode = String(formData.get("mode") || "draft");
  const fallbackMinutes = Math.max(1, Number(formData.get("fallback_sla_minutes") || 60));
  if (!policyId) return "Policy is required.";

  const supabase = await createClient();
  const db = supabase as any;
  const { data: current, error: readError } = await db
    .from("assistant_automation_policies")
    .select("id,version")
    .eq("id", policyId)
    .single();
  if (readError || !current) return readError?.message || "Policy not found.";

  const { error } = await db
    .from("assistant_automation_policies")
    .update({
      mode,
      fallback_sla_minutes: fallbackMinutes,
      version: Number(current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", policyId);
  if (error) return error.message;
  revalidatePath("/assistants");
  return null;
}
