import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Kanban } from "lucide-react";
import { getBoard } from "@/lib/data/boards";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { WorkBoard } from "./work-board";

export default async function WorkBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const board = await getBoard(id);
  if (!board) notFound();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        icon={Kanban}
        title={board.name}
        description={board.description || `${board.companyName} operating board`}
        actions={
          <Link href="/board" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            All boards
          </Link>
        }
      />
      <WorkBoard
        key={`${board.updatedAt}:${board.columns
          .map((column) => `${column.id}:${column.items.map((item) => `${item.id}-${item.columnId}-${item.title}`).join(",")}`)
          .join("|")}`}
        board={board}
      />
    </div>
  );
}
