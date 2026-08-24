"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS } from "./task-columns";
import type { Database } from "@/types/database";

type PriorityLevel = Database["public"]["Enums"]["priority_level"];
type RiskLevel = Database["public"]["Enums"]["risk_level"];
type WorkStatus = Database["public"]["Enums"]["work_status"];

const TASK_SELECT =
  "id, title, description, status, priority, risk_level, approval_required, company_id, companies(name), created_at";

export async function getTasks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .in("status", TASK_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
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
export async function updateTaskStatus(id: string, status: WorkStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) return error.message;
  revalidatePath("/tasks");
  return null;
}

// RLS-gated to manager+/admin (tasks_delete_scope, migration 202608260003) — a task
// outside the caller's access simply won't delete (0 rows), not an error, so a stray
// unauthorized click is a silent no-op rather than a leak of "you can't do that".
export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/tasks");
  return null;
}
