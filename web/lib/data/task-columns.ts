// Kanban read view — same 4 status columns as the old js/modules/tasks.js, filtered by
// RLS (tasks_select_scope: own/created tasks + managers see all company tasks) so there
// is nothing left to filter client-side. Split out from tasks.ts because a "use server"
// module may only export async functions — this plain constant can't live there.
export const TASK_COLUMNS = ["queued", "in_progress", "needs_approval", "done"] as const;
