import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";
import { getArchivedGoals } from "@/lib/data/goals";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ArchivedGoalsTable } from "./archived-goals-table";

export default async function ArchivedGoalsPage() {
  const goals = await getArchivedGoals();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Archive}
        title="Archived goals"
        description="Deleted goals live here, not gone — their key results stay intact. Restore any of them at any time."
        actions={
          <Link href="/goals" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="h-4 w-4" />
            Back to Goals
          </Link>
        }
      />
      <ArchivedGoalsTable goals={goals} />
    </div>
  );
}
