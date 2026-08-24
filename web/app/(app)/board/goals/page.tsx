import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import { getGoals } from "@/lib/data/goals";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { BoardColumns } from "../board-columns";

export default async function GoalBoardPage() {
  const goals = await getGoals();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Target}
        title="Strategic Goal Board"
        description="Move founder goals between backlog, active work, blocked, and achieved."
        actions={
          <Link href="/board" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Work boards
          </Link>
        }
      />
      <BoardColumns goals={goals} />
    </div>
  );
}
