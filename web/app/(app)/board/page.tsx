import Link from "next/link";
import { ArrowRight, Kanban, Target } from "lucide-react";
import { getBoards } from "@/lib/data/boards";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BoardCreateForm } from "./board-create-form";

export default async function BoardPage() {
  const [boards, companies] = await Promise.all([getBoards(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Kanban}
        title="Work Boards"
        description="Create company boards, shape the workflow, assign people, and move real tasks. Every card remains one canonical task."
        actions={
          <Link href="/board/goals" className={buttonVariants({ variant: "outline" })}>
            <Target className="size-4" />
            Strategic goal board
          </Link>
        }
      />

      <BoardCreateForm companies={companies.map((company) => ({ id: company.id, name: company.name }))} />

      {boards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <Link key={board.id} href={`/board/${board.id}`} className="group outline-none">
              <Card className="h-full border-0 py-0 shadow-sm ring-1 ring-foreground/10 transition group-hover:-translate-y-0.5 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <div className="h-1.5" style={{ backgroundColor: board.color }} />
                <CardHeader className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{board.name}</CardTitle>
                      <CardDescription className="mt-1">{board.companyName}</CardDescription>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pb-4">
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {board.description || "A flexible operating board for this company."}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{board.columnCount} columns</Badge>
                    <Badge variant="outline">{board.itemCount} cards</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-dashed bg-muted/20 py-10 text-center shadow-none">
          <CardContent>
            <Kanban className="mx-auto mb-3 size-8 text-muted-foreground" />
            <h2 className="font-medium">Create your first operating board</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with the default workflow, then rename or add columns for sales, engineering, field operations, or any team.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
