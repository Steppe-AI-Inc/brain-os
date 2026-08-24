"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getDepartments() {
  const supabase = await createClient();
  const [{ data: departments, error }, { data: activeGoals }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name, slug, company_id, created_at, companies(name)")
      .order("created_at", { ascending: false }),
    supabase.from("goals").select("department_id").eq("status", "active"),
  ]);
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

export async function updateDepartment(id: string, input: DepartmentInput) {
  if (!input.name.trim()) return "Name is required.";
  if (!input.companyId) return "Company is required.";
  const slug = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ name: input.name.trim(), company_id: input.companyId, slug })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/departments");
  return null;
}

export async function deleteDepartment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/departments");
  return null;
}
