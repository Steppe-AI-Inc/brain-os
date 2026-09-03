"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// BUG-001 (Work-PC QA campaign C001): joins to companies(name, status) alone give the UI
// nothing to render an archived-parent indicator from - a department whose company was
// just archived rendered as an ordinary active row, contradicting the same page's own
// company picker (which correctly excludes archived companies). Selecting `status` too
// is the minimal real fix; the corresponding page renders <ArchivedCompanyBadge/>
// (web/components/archived-company-badge.tsx) from it.
// Multi-org milestone: activeOrganizationId scopes Departments to the currently selected
// organization when set, same pattern as getPeople() in lib/data/people.ts — a query-shape
// filter only, RLS remains the sole authorization boundary either way. The goals count
// query is scoped in step: an unscoped count would still be *correct* (the map is only
// read for the filtered departments) but would fetch every org's goals for nothing.
export async function getDepartments(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let departmentsQuery = supabase
    .from("departments")
    .select("id, name, slug, company_id, created_at, companies(name, status)")
    .order("created_at", { ascending: false });
  let goalsQuery = supabase.from("goals").select("department_id").eq("status", "active");
  if (activeOrganizationId) {
    departmentsQuery = departmentsQuery.eq("company_id", activeOrganizationId);
    goalsQuery = goalsQuery.eq("company_id", activeOrganizationId);
  }
  const [{ data: departments, error }, { data: activeGoals }] = await Promise.all([departmentsQuery, goalsQuery]);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const g of activeGoals ?? []) {
    if (!g.department_id) continue;
    counts.set(g.department_id, (counts.get(g.department_id) ?? 0) + 1);
  }

  return (departments ?? []).map((d) => ({
    ...d,
    active_goal_count: counts.get(d.id) ?? 0,
  }));
}

export async function createDepartment(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  if (!name) return "Name is required.";
  if (!companyId) return "Company is required.";

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ company_id: companyId, name, slug });
  if (error) return error.message;

  revalidatePath("/departments");
  return null;
}

export type DepartmentInput = { name: string; companyId: string };

// Both check affected row count, not just `error` — departments_write_manager RLS
// means a caller outside the company's manager tier silently matches 0 rows rather than
// erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateDepartment(id: string, input: DepartmentInput) {
  if (!input.name.trim()) return "Name is required.";
  if (!input.companyId) return "Company is required.";
  const slug = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({ name: input.name.trim(), company_id: input.companyId, slug })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this department may no longer exist or you may not have access to it.";
  revalidatePath("/departments");
  return null;
}

export async function deleteDepartment(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this department may no longer exist or you may not have access to it.";
  revalidatePath("/departments");
  return null;
}
