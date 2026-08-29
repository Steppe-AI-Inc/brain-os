import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCommit } from "lucide-react";
import { getWorkOrderDetail } from "@/lib/data/factory";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  queued: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
  needs_approval: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  qa_review: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  done: "bg-primary/10 text-primary border-primary/25",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  archived: "bg-muted/60 text-muted-foreground/70 border-border",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "queued";
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_STYLE[s] ?? "border-border text-muted-foreground"}`}>
      {s.replace(/_/g, " ")}
    </Badge>
  );
}

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workOrder = await getWorkOrderDetail(id);
  if (!workOrder) notFound();

  const acceptanceCriteria = Array.isArray(workOrder.acceptanceCriteria)
    ? (workOrder.acceptanceCriteria as unknown[])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/software-factory"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Software Factory
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{workOrder.title}</h1>
            <StatusBadge status={workOrder.status} />
          </div>
          {workOrder.objective && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{workOrder.objective}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{workOrder.companyName ?? "—"}</span>
            {workOrder.goalTitle && (
              <>
                <span>·</span>
                <span>Goal: {workOrder.goalTitle}</span>
              </>
            )}
            <span>·</span>
            <span className="capitalize">{workOrder.workType.replace(/_/g, " ")}</span>
            <span>·</span>
            <span className="capitalize">{workOrder.priority} priority</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Acceptance Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            {acceptanceCriteria.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="flex list-inside list-disc flex-col gap-1 text-sm">
                {acceptanceCriteria.map((c, i) => (
                  <li key={i}>{typeof c === "string" ? c : JSON.stringify(c)}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tasks ({workOrder.tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {workOrder.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">{t.title}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {workOrder.tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Agent Runs ({workOrder.runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {workOrder.runs.map((r) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-lg border border-border/60 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.agentName ?? "unknown agent"}</span>
                <div className="flex items-center gap-1.5">
                  {r.verificationStatus && (
                    <Badge variant="outline" className="text-[11px] capitalize">
                      {r.verificationStatus.replace(/_/g, " ")}
                    </Badge>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </div>
              {r.summary && <p className="text-xs text-muted-foreground">{r.summary}</p>}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                {r.providerRunId && <span>run {r.providerRunId}</span>}
                {r.branch && <span>· {r.branch}</span>}
                {r.headCommit && (
                  <span className="flex items-center gap-1">
                    <GitCommit className="h-3 w-3" /> {r.headCommit.slice(0, 7)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {workOrder.runs.length === 0 && (
            <p className="text-sm text-muted-foreground">No agent runs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
