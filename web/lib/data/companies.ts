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

// company_id is ON DELETE CASCADE on all of these (schema-v0.7-production-core.sql) —
// deleting a company with any of this attached would silently wipe it too, with no
// warning beyond a generic "can't be undone" dialog. Master-prompt spec §28: "Hard
// deletion of a referenced organization should normally be prohibited... prefer
// archived." people/tasks are ON DELETE SET NULL instead (orphaned, not deleted), but
// still worth surfacing — losing every employee's company link silently is its own harm.
const CASCADE_DEPENDENCY_TABLES = [
  { table: "projects", label: "project(s)" },
  { table: "financial_reports", label: "financial report(s)" },
  { table: "product_lines", label: "product line(s)" },
  { table: "inventory_items", label: "inventory item(s)" },
  { table: "sales_leads", label: "sales lead(s)" },
  { table: "proposals", label: "proposal(s)" },
  { table: "kpi_records", label: "KPI record(s)" },
  { table: "salary_rules", label: "salary rule(s)" },
  { table: "billing_accounts", label: "billing account(s)" },
  { table: "departments", label: "department(s)" },
  { table: "goals", label: "goal(s)" },
  { table: "company_memberships", label: "team member access grant(s)" },
] as const;
const ORPHAN_WARN_TABLES = [
  { table: "people", label: "people record(s) would lose their company link" },
  { table: "tasks", label: "task(s) would lose their company link" },
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteCompany(id: string) {
  if (!UUID_RE.test(id)) return "Invalid company id.";
  const supabase = await createClient();

  const dependents: string[] = [];
  for (const { table, label } of CASCADE_DEPENDENCY_TABLES) {
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", id);
    if (count && count > 0) dependents.push(`${count} ${label}`);
  }
  // company_relationships has two FK columns to companies (company_id AND
  // related_company_id, both ON DELETE CASCADE) — a company can be the parent OR the
  // child side of a link, either way deleting it would silently sever/delete that row.
  const { count: relCount } = await supabase
    .from("company_relationships")
    .select("id", { count: "exact", head: true })
    .or(`company_id.eq.${id},related_company_id.eq.${id}`);
  if (relCount && relCount > 0) dependents.push(`${relCount} organization relationship(s) (ownership/business-unit links)`);
  if (dependents.length > 0) {
    return `Can't delete — this would also permanently delete: ${dependents.join(", ")}. Archive the company instead (set status to "closed"), or reassign these records first.`;
  }
  const orphaned: string[] = [];
  for (const { table, label } of ORPHAN_WARN_TABLES) {
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", id);
    if (count && count > 0) orphaned.push(`${count} ${label}`);
  }
  if (orphaned.length > 0) {
    return `Can't delete — ${orphaned.join(" and ")}. Reassign them to another company first, or archive this company instead of deleting it.`;
  }

  const { data, error } = await supabase.from("companies").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this company may no longer exist or you may not have access to it.";
  revalidatePath("/companies");
  return null;
}
