import { Kanban } from "lucide-react";
import { getGoals } from "@/lib/data/goals";
import { PageHeader } from "@/components/page-header";
import { BoardColumns } from "./board-columns";

export default async function BoardPage() {
  const goals = await getGoals();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Kanban}
        title="Board"
        description="Every goal's status, one drag away from changing. Every move is audited."
      />
      <BoardColumns goals={goals} />
    </div>
  );
}
