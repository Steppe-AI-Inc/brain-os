"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifyGoal, type GoalKind } from "@/lib/goals/classify";

const GOAL_LIST_COLUMNS =
  "id, title, description, status, kind, progress, due_at, cron_expr, company_id, department_id, companies(name), departments(name), updated_at";

export async function getGoals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_LIST_COLUMNS)
    .neq("status", "archived")
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

// All four check affected row count, not just `error` — goals_update_scope/
// goals_delete_manager/key_results_write_scope RLS means a caller outside the allowed
// tier silently matches 0 rows rather than erroring. Same defect class as
// qa/KNOWN_FAILURE_MODES.md #17/#18.

/** Generic patch used by both the Kanban drag-drop and the per-kind action panel.
 * 'archived' is deliberately excluded from status - the DB trigger
 * (enforce_goal_lifecycle_via_rpc, 202608290001) now rejects any direct write into/out
 * of 'archived' outside archive_goal()/restore_goal(); use those (or the archiveGoal()/
 * restoreGoal() actions below) instead. */
export async function updateGoal(
  id: string,
  patch: Partial<{
    status: "draft" | "active" | "paused" | "achieved";
    progress: number;
  }>
) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").update(patch).eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this goal may no longer exist or you may not have access to it.";

  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath(`/goals/${id}`);
  revalidatePath("/dashboard");
  return null;
}

export type GoalDetailsInput = { title: string; description: string };

export async function updateGoalDetails(id: string, input: GoalDetailsInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .update({ title: input.title.trim(), description: input.description.trim() || null })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this goal may no longer exist or you may not have access to it.";

  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath(`/goals/${id}`);
  return null;
}

// The real, permanent removal (cascades key_results, unlike archiveGoal below) - kept
// separate, same safe-default/rare-destructive split as companies/tasks.
export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this goal may no longer exist or you may not have access to it.";

  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath("/dashboard");
  return null;
}

// The ordinary "archive"/"decline" path - reversible, destroys nothing (key_results stay
// intact), open to the goal's own creator with active membership too, not just a
// manager. Matches AI chat exactly - both call the same RPC.
export async function archiveGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_goal", { p_goal_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Archive failed — no result returned.";
  if (result.reason === "not_found") return "This goal no longer exists.";
  if (result.reason === "denied") return "You do not have permission to archive this goal.";
  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath(`/goals/${id}`);
  revalidatePath("/dashboard");
  return null;
}

export async function restoreGoal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_goal", { p_goal_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This goal no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this goal.";
  revalidatePath("/goals");
  revalidatePath("/board");
  revalidatePath(`/goals/${id}`);
  revalidatePath("/dashboard");
  return null;
}

export async function getArchivedGoals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_LIST_COLUMNS)
    .eq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
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
  const { data, error } = await supabase.from("key_results").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this key result may no longer exist or you may not have access to it.";

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
