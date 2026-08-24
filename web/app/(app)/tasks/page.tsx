import { ListChecks } from "lucide-react";
import { getTasks } from "@/lib/data/tasks";
import { TASK_COLUMNS } from "@/lib/data/task-columns";
import { PageHeader } from "@/components/page-header";
import { TaskCard } from "./task-card";

const COLUMN_LABELS: Record<(typeof TASK_COLUMNS)[number], string> = {
  queued: "Queued",
  in_progress: "In Progress",
  needs_approval: "Needs Approval",
  done: "Done",
};

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={ListChecks} title="Tasks" description="Grouped by status, scoped to what RLS allows you to see." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {TASK_COLUMNS.map((status) => {
          const columnTasks = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{COLUMN_LABELS[status]}</h2>
                <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
              </div>
              {columnTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {columnTasks.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No tasks.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
