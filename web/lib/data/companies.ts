"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getCompanies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, country, legal_entity_name, status, organization_type, strategic_priority, risk_score")
    .order("strategic_priority", { ascending: false });
  if (error) throw error;
  return data;
}

// Read-only organization graph for the Companies page — the actual defect this closes:
// company_relationships has existed since 2026-08-24 and the AI has been able to write
// to it, but until now nothing anywhere ever read it back. RLS on this table is
// founder/admin-only (company_relationships_select_founder), matching how ownership
// structure is treated everywhere else in this schema (company_sensitive is the same
// tier) — a non-founder simply gets an empty array here, not an error.
export async function getOrganizationRelationships() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_relationships")
    .select("id, company_id, related_company_id, relationship_type, ownership_pct, state")
    .eq("state", "current")
    .not("related_company_id", "is", null);
  if (error) return [];
  return data;
}

export async function createCompany(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) return "Company name is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({
    name,
    country: country || null,
    description: description || null,
  });
  if (error) return error.message;

  revalidatePath("/companies");
  return null;
}

export type CompanyInput = {
  name: string;
  country: string;
  legalEntityName: string;
  status: string;
  organizationType: string;
};

// Both check affected row count, not just `error` — companies_write_admin RLS
// (founder/admin only) means a non-admin caller's update/delete silently matches 0 rows
// rather than erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateCompany(id: string, input: CompanyInput) {
  if (!input.name.trim()) return "Company name is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({
      name: input.name.trim(),
      country: input.country.trim() || null,
      legal_entity_name: input.legalEntityName.trim() || null,
      status: input.status || "active",
      organization_type: input.organizationType || "legal_entity",
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this company may no longer exist or you may not have access to it.";
  revalidatePath("/companies");
  return null;
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this company may no longer exist or you may not have access to it.";
  revalidatePath("/companies");
  return null;
}
