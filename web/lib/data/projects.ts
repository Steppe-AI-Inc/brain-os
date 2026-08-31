"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Overnight multi-org milestone: activeOrganizationId scopes Projects to the currently
// selected organization when set, same pattern as getPeople() in lib/data/people.ts —
// a query-shape filter only, RLS remains the sole authorization boundary either way.
export async function getProjects(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("id, title, status, deadline, risk_score, company_id, companies(name)")
    .order("created_at", { ascending: false });
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createProject(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const goal = String(formData.get("goal") || "").trim();
  if (!title) return "Title is required.";
  if (!companyId) return "Company is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    title,
    company_id: companyId,
    goal: goal || null,
  });
  if (error) return error.message;

  revalidatePath("/projects");
  return null;
}

export type ProjectInput = { title: string; companyId: string; goal: string; status: string; deadline: string };

// Both check affected row count, not just `error` — projects_write_manager RLS means a
// caller outside the company's manager tier silently matches 0 rows rather than
// erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateProject(id: string, input: ProjectInput) {
  if (!input.title.trim()) return "Title is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      title: input.title.trim(),
      company_id: input.companyId,
      goal: input.goal.trim() || null,
      status: input.status.trim() || "active",
      deadline: input.deadline || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this project may no longer exist or you may not have access to it.";
  revalidatePath("/projects");
  return null;
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this project may no longer exist or you may not have access to it.";
  revalidatePath("/projects");
  return null;
}
