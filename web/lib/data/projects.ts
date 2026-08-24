"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, status, deadline, risk_score, company_id, companies(name)")
    .order("created_at", { ascending: false });
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

export async function updateProject(id: string, input: ProjectInput) {
  if (!input.title.trim()) return "Title is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      title: input.title.trim(),
      company_id: input.companyId,
      goal: input.goal.trim() || null,
      status: input.status.trim() || "active",
      deadline: input.deadline || null,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/projects");
  return null;
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/projects");
  return null;
}
