"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifyGoal, type GoalKind } from "@/lib/goals/classify";

const GOAL_LIST_COLUMNS =
  "id, title, description, status, kind, progress, due_at, cron_expr, company_id, department_id, companies(name), departments(name)";

export async function getGoals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export async function getGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(
      "*, companies(name), departments(name), key_results(*), goal_context(content_md)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createGoal(_prevState: string | null, formData: FormData) {
  const raw = String(formData.get("raw_content") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const departmentId = String(formData.get("department_id") || "").trim();
  const kindOverride = String(formData.get("kind_override") || "").trim();
  if (!raw) return "Tell us what's on your mind.";
  if (!companyId) return "Pick a company.";

  const classified = classifyGoal(raw);
  const kind = (kindOverride || classified.kind) as GoalKind;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .insert({
      company_id: companyId,
      department_id: departmentId || null,
      title: classified.title,
      description: classified.description,
      kind,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return error.message;

  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  redirect(`/goals/${data.id}`);
}

/** Generic patch used by both the Kanban drag-drop and the per-kind action panel. */
export async function updateGoal(
  id: string,
  patch: Partial<{
    status: "draft" | "active" | "paused" | "achieved" | "archived";
    progress: number;
  }>
) {
  const supabase = await createClient();
  const { error } = await supabase.from("goals").update(patch).eq("id", id);
  if (error) return error.message;

  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath(`/goals/${id}`);
  revalidatePath("/dashboard");
  return null;
}

export async function createKeyResult(_prevState: string | null, formData: FormData) {
  const goalId = String(formData.get("goal_id") || "").trim();
  const label = String(formData.get("label") || "").trim();
  const targetValue = String(formData.get("target_value") || "").trim();
  const currentValue = String(formData.get("current_value") || "").trim();
  const unit = String(formData.get("unit") || "").trim();
  if (!goalId) return "Missing goal.";
  if (!label) return "Label is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("key_results").insert({
    goal_id: goalId,
    label,
    target_value: targetValue || null,
    current_value: currentValue || null,
    unit: unit || null,
  });
  if (error) return error.message;

  revalidatePath(`/goals/${goalId}`);
  return null;
}

export async function deleteKeyResult(id: string, goalId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("key_results").delete().eq("id", id);
  if (error) return error.message;

  revalidatePath(`/goals/${goalId}`);
  return null;
}

export async function saveGoalContext(goalId: string, contentMd: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_context")
    .upsert(
      { goal_id: goalId, content_md: contentMd, updated_at: new Date().toISOString() },
      { onConflict: "goal_id" }
    );
  if (error) return error.message;

  revalidatePath(`/goals/${goalId}`);
  return null;
}
