import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { getArchivedTasks } from "@/lib/data/tasks";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ArchivedTasksTable } from "./archived-tasks-table";

export default async function ArchivedTasksPage() {
  const tasks = await getArchivedTasks();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Archive}
        title="Archived tasks"
        description="Deleted tasks live here, not gone. Restore any of them at any time — they return to exactly the status they were in before archiving."
        actions={
          <Link href="/tasks" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Back to Tasks
          </Link>
        }
      />
      <ArchivedTasksTable tasks={tasks} />
    </div>
  );
}
