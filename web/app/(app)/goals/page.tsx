import { Target } from "lucide-react";
import { getGoals } from "@/lib/data/goals";
import { getCompanies } from "@/lib/data/companies";
import { getDepartments } from "@/lib/data/departments";
import { PageHeader } from "@/components/page-header";
import { GoalComposer } from "./goal-composer";
import { GoalList } from "./goal-list";

export default async function GoalsPage() {
  const [goals, companies, departments] = await Promise.all([
    getGoals(),
    getCompanies(),
    getDepartments(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Target}
        title="Goals"
        description="Every outcome the company is working toward, in one place."
        actions={<GoalComposer companies={companies} departments={departments} />}
      />
      <GoalList goals={goals} />
    </div>
  );
}
