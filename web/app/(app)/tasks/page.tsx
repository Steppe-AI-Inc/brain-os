import { getTasks, TASK_COLUMNS } from "@/lib/data/tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <h1 className="text-2xl font-bold">Tasks</h1>
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
                <Card key={task.id} className="bg-card/90">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm font-semibold leading-snug">
                      {task.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5 p-3 pt-1">
                    <Badge variant="outline" className="text-xs">
                      {task.priority}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {task.risk_level}
                    </Badge>
                    {task.approval_required && (
                      <Badge variant="destructive" className="text-xs">
                        approval required
                      </Badge>
                    )}
                    {task.companies?.name && (
                      <span className="text-xs text-muted-foreground">
                        {task.companies.name}
                      </span>
                    )}
                  </CardContent>
                </Card>
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
