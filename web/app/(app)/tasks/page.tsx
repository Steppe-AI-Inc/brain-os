import Link from "next/link";
import { ListChecks, Archive } from "lucide-react";
import { getTasks, getCurrentPersonId } from "@/lib/data/tasks";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { scopeToActiveOrganization } from "@/lib/data/org-scope";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { TasksBoard } from "./tasks-board";

export default async function TasksPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg = scopeToActiveOrganization(organizations);
  const [tasks, companies, currentPersonId] = await Promise.all([
    getTasks(scopeToActiveOrg),
    getCompaniesForSelection(),
    getCurrentPersonId(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `Drag a card to change status, click to edit, or add one per column. Scoped to ${organizations.activeOrganizationName}.`
            : "Drag a card to change status, click to edit, or add one per column."
        }
        actions={
          <Link href="/tasks/archived" className={buttonVariants({ variant: "outline" })}>
            <Archive className="h-4 w-4" />
            Archived
          </Link>
        }
      />
      <TasksBoard
        tasks={tasks}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        currentPersonId={currentPersonId}
      />
    </div>
  );
}
