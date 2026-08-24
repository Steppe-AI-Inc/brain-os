import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGoal } from "@/lib/data/goals";
import { getMemoriesForEntity } from "@/lib/data/memory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GOAL_STATUS_DOT, GOAL_STATUS_LABEL } from "@/lib/goals/classify";
import {
  GoalKindActions,
  GoalHeaderActions,
  KeyResultsSection,
  GoalContextEditor,
  StandingRollup,
} from "./goal-detail-client";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) notFound();

  const memories = await getMemoriesForEntity("goal", id);
  const keyResults = goal.key_results ?? [];
  const showKeyResults = goal.kind === "standing" || keyResults.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/goals"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Goals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${GOAL_STATUS_DOT[goal.status]}`} />
            {GOAL_STATUS_LABEL[goal.status]}
            <Badge variant="outline" className="ml-1 capitalize">
              {goal.kind}
            </Badge>
            {goal.kind === "standing" && <StandingRollup keyResults={keyResults} />}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{goal.title}</h1>
          {goal.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{goal.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {goal.companies?.name && <Badge variant="secondary">{goal.companies.name}</Badge>}
            {goal.departments?.name && <Badge variant="secondary">{goal.departments.name}</Badge>}
          </div>
        </div>
        <div className="flex items-start gap-1">
          <GoalKindActions goal={goal} />
          <GoalHeaderActions goal={goal} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {showKeyResults && <KeyResultsSection goalId={goal.id} keyResults={keyResults} />}
        <GoalContextEditor goalId={goal.id} initialContent={goal.goal_context?.content_md ?? ""} />
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Related memory</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {memories.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="text-foreground">{m.fact}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {m.created_at ? new Date(m.created_at).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
          {memories.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
