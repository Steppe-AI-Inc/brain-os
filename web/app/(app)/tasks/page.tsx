import { ListChecks } from "lucide-react";
import { getTasks } from "@/lib/data/tasks";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { TasksBoard } from "./tasks-board";

export default async function TasksPage() {
  const [tasks, companies] = await Promise.all([getTasks(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        description="Drag a card to change status, click to edit, or add one per column. Grouped by status, scoped to what RLS allows you to see."
      />
      <TasksBoard tasks={tasks} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
