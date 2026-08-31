"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS } from "./task-columns";
import type { Database } from "@/types/database";

type PriorityLevel = Database["public"]["Enums"]["priority_level"];
type RiskLevel = Database["public"]["Enums"]["risk_level"];
type WorkStatus = Database["public"]["Enums"]["work_status"];

const TASK_SELECT =
  "id, title, description, status, priority, risk_level, approval_required, company_id, companies(name), owner_person_id, people(full_name), created_at, updated_at";

// Overnight multi-org milestone: activeOrganizationId scopes Tasks to the currently
// selected organization when set, same pattern as getPeople() in lib/data/people.ts —
// a query-shape filter only, RLS remains the sole authorization boundary either way.
// A task with company_id IS NULL (the tasks_update_scope creator-owns-unscoped-task
// case, tracked separately as Work Order b9abe2f2-...) is simply excluded when a
// specific org is active, same as any other company-scoped filter would exclude it.
export async function getTasks(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .in("status", TASK_COLUMNS)
    .order("created_at", { ascending: false });
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getArchivedTasks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Resolves the logged-in profile to their linked people.id (a profile isn't necessarily
// staffed as a person — founders/admins often aren't — so this can legitimately be null).
// Lets the UI offer a real "assigned to me" filter instead of only ever showing every
// company task to every signed-in user regardless of role.
export async function getCurrentPersonId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return null;
  const { data: person } = await supabase.from("people").select("id").eq("profile_id", profile.id).maybeSingle();
  return person?.id ?? null;
}

export type TaskInput = {
  title: string;
  description: string;
  companyId: string | null;
  priority: PriorityLevel;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
};

export async function createTask(status: WorkStatus, input: TaskInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: input.title.trim(),
    description: input.description.trim() || null,
    company_id: input.companyId,
    priority: input.priority,
    risk_level: input.riskLevel,
    approval_required: input.approvalRequired,
    status,
    source: "manual",
  });
  if (error) return error.message;
  revalidatePath("/tasks");
  return null;
}

// RLS-gated to manager+/admin/owner (tasks_update_scope) — same scope as drag-and-drop
// status changes below.
export async function updateTask(id: string, input: TaskInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      company_id: input.companyId,
      priority: input.priority,
      risk_level: input.riskLevel,
      approval_required: input.approvalRequired,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/tasks");
  return null;
}

// Drag-and-drop between board columns — separate from updateTask so a card move never
// touches the other fields being edited in a still-open sheet on another tab.
// Checks affected row count, not just `error` — an RLS-blocked or already-gone task
// update/delete returns success with 0 rows, not an error, so trusting `error` alone
// means the UI reports "done" when nothing happened. Same defect class as the AI-chat
// "claimed a deletion that never executed" bug (see qa/KNOWN_FAILURE_MODES.md #17/#18):
// a human clicking a button deserves the same honesty an AI reply now has to give. The
// message stays generic (doesn't say *why* — lack of access vs. already deleted by
// someone else look the same from here) so it doesn't leak permission info to an
// unauthorized caller, matching this table's existing RLS-silent-no-op design.
export async function updateTaskStatus(id: string, status: WorkStatus) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update({ status }).eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this task may no longer exist or you may not have access to it.";
  revalidatePath("/tasks");
  return null;
}

// The ordinary delete path — reversible, and open to the task's own creator (not just a
// manager), matching AI chat exactly (both call the same RPC). Fast by design: archiving
// doesn't destroy or reassign anything, so there is nothing to check first.
export async function archiveTask(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_task", { p_task_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Archive failed — no result returned.";
  if (result.reason === "not_found") return "This task no longer exists.";
  if (result.reason === "denied") return "You do not have permission to archive this task.";
  revalidatePath("/tasks");
  return null;
}

// Returns the task to the exact status it had right before archiving (there is no
// single "active" status the way companies/goals have) — see archive_task/restore_task
// in 202608290001_task_goal_archive_restore.sql.
export async function restoreTask(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_task", { p_task_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This task no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this task.";
  revalidatePath("/tasks");
  return null;
}

// The real, permanent removal — kept separate from archiveTask above, same
// safe-default/rare-destructive split as companies (archiveCompany vs
// permanentlyDeleteCompany). tasks_delete_scope RLS (manager+/admin only) is the real
// gate; no dependency-blocking logic is needed here the way companies needed one, since
// nothing else in the schema references a task by FK the way projects/documents/etc.
// reference a company.
export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this task may no longer exist or you may not have access to it.";
  revalidatePath("/tasks");
  return null;
}

// Same check, for a whole board column at once — added so clearing out a stale batch of
// tasks doesn't mean clicking delete one card at a time. Reports the real count when it's
// less than requested, same as sem-ai-command's fact-lines for the AI-chat path.
export async function deleteTasks(ids: string[]) {
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().in("id", ids).select("id");
  if (error) return error.message;
  const deletedCount = data?.length || 0;
  // Revalidate whenever anything actually changed, even on a partial result — the ones
  // that did delete must not stay stuck showing stale in the UI just because the rest
  // didn't.
  if (deletedCount > 0) revalidatePath("/tasks");
  if (deletedCount < ids.length) {
    return `Only ${deletedCount} of ${ids.length} task(s) were deleted — the rest may no longer exist or you may not have access to them.`;
  }
  return null;
}
