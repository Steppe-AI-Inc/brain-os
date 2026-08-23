import { createClient } from "@/lib/supabase/server";

// Kanban read view — same 4 status columns as the old js/modules/tasks.js, filtered
// by RLS (tasks_select_scope: own/created tasks + managers see all company tasks) so
// there is nothing left to filter client-side.
export const TASK_COLUMNS = ["queued", "in_progress", "needs_approval", "done"] as const;

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
