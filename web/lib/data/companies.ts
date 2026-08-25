/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getCompanies() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("companies")
    .select("id,name,country,legal_entity_name,description,aliases,status,strategic_priority,risk_score,organization_id")
    .order("strategic_priority", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCompany(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const organizationId = String(formData.get("organization_id") || "").trim();
  if (!name) return "Company name is required.";
  if (!organizationId) return "Choose the workspace that owns this company.";

  const supabase = await createClient();
  const db = supabase as any;
  const { error } = await db.rpc("create_company_in_organization", {
    p_organization_id: organizationId,
    p_name: name,
    p_country: country || null,
    p_description: description || null,
  });
  if (error) return error.message;

  revalidatePath("/companies");
  revalidatePath("/workspaces");
  return null;
}

export async function adoptLegacyCompanyAction(_prevState: string | null, formData: FormData) {
  const organizationId = String(formData.get("organization_id") || "");
  const companyId = String(formData.get("company_id") || "");
  if (!organizationId || !companyId) return "Workspace and legacy company are required.";

  const supabase = await createClient();
  const db = supabase as any;
  const { error } = await db.rpc("adopt_legacy_company", {
    p_organization_id: organizationId,
    p_company_id: companyId,
    p_include_people: true,
  });
  if (error) return error.message;

  revalidatePath("/companies");
  revalidatePath("/people");
  revalidatePath("/workspaces");
  return null;
}

export type CompanyInput = {
  name: string;
  country: string;
  legalEntityName: string;
  status: string;
  aliases: string;
};

export async function updateCompany(id: string, input: CompanyInput) {
  if (!input.name.trim()) return "Company name is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name: input.name.trim(),
      country: input.country.trim() || null,
      legal_entity_name: input.legalEntityName.trim() || null,
      status: input.status || "active",
      aliases: input.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/companies");
  return null;
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/companies");
  return null;
}
