"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS } from "./task-columns";

export async function getTasks() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, status, priority, risk_level, approval_required, company_id, companies(name), created_at"
    )
    .in("status", TASK_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
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
