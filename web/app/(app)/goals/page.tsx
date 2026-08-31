import Link from "next/link";
import { Target, Archive } from "lucide-react";
import { getGoals } from "@/lib/data/goals";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getDepartments } from "@/lib/data/departments";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { GoalComposer } from "./goal-composer";
import { GoalList } from "./goal-list";

export default async function GoalsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [goals, companies, departments] = await Promise.all([
    getGoals(scopeToActiveOrg),
    getCompaniesForSelection(),
    getDepartments(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Target}
        title="Goals"
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `Every outcome ${organizations.activeOrganizationName} is working toward, in one place.`
            : "Every outcome the company is working toward, in one place."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/goals/archived" className={buttonVariants({ variant: "outline" })}>
              <Archive className="h-4 w-4" />
              Archived
            </Link>
            <GoalComposer companies={companies} departments={departments} />
          </div>
        }
      />
      <GoalList goals={goals} />
    </div>
  );
}
