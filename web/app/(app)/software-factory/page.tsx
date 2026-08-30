import Link from "next/link";
import { Factory, Activity, ShieldAlert, ShieldCheck, PackageCheck, Ban, Bot, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFactoryOverview, getRegisteredAgents, getRecentWorkOrders, getFounderNotifications } from "@/lib/data/factory";
import { FactoryRealtimeRefresher } from "./realtime-refresher";
import { NotificationPanel } from "./notification-panel";

// Real, computed-live status colors (live_status is never stored — see
// public.agents_with_live_status). UNKNOWN covers design-only agents that the Runner
// never dispatches (e.g. brain-os-product-architect has no execution_provider). STALE
// (Phase 2, agent_runs_with_live_status) is derived per-agent below from its most recent
// run's own heartbeat age — agents_with_live_status itself doesn't compute STALE at the
// agent level (only RUNNING/IDLE/FAILED/UNKNOWN), so a stale agent still shows RUNNING
// here until that view is extended; documented, not silently claimed complete.
const LIVE_STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  IDLE: "bg-muted text-muted-foreground border-border",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
  UNKNOWN: "bg-muted/60 text-muted-foreground/70 border-border",
};

const WORK_ORDER_STATUS_STYLE: Record<string, string> = {
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

function StatusBadge({ status, styleMap }: { status: string; styleMap: Record<string, string> }) {
  return (
    <Badge variant="outline" className={`capitalize ${styleMap[status] ?? "border-border text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export default async function SoftwareFactoryPage() {
  const [overview, agents, workOrders, notifications] = await Promise.all([
    getFactoryOverview(),
    getRegisteredAgents(),
    getRecentWorkOrders(10),
    getFounderNotifications(20),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <FactoryRealtimeRefresher />
      <PageHeader
        icon={Factory}
        title="Software Factory"
        description="Real Work Orders, real registered agents, real runs — every number here reflects live canonical state, nothing simulated."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard icon={Activity} label="Active Work Orders" value={overview.activeWorkOrders} accent="cyan" />
        <StatCard icon={Bot} label="Running Agents" value={overview.runningAgents} accent="green" />
        <StatCard icon={ShieldAlert} label="Verification Failures" value={overview.verificationFailures} accent="rose" />
        <StatCard icon={ShieldCheck} label="Waiting Approvals" value={overview.waitingApprovals} accent="amber" />
        <StatCard icon={PackageCheck} label="Release Ready" value={overview.releaseReady} accent="violet" />
        <StatCard icon={Ban} label="Blocked" value={overview.blocked} accent="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="border-border/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Work Orders</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {workOrders.map((w) => (
                <Link
                  key={w.id}
                  href={`/software-factory/${w.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-secondary"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{w.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{w.companyName ?? "—"}</span>
                      {w.goalTitle && (
                        <>
                          <span>·</span>
                          <span className="truncate">{w.goalTitle}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{w.taskCount} task{w.taskCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <StatusBadge status={w.status} styleMap={WORK_ORDER_STATUS_STYLE} />
                </Link>
              ))}
              {workOrders.length === 0 && (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  No Work Orders yet — the factory hasn&apos;t been asked to build anything
                  through Brain OS Chat.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Registered Agents</CardTitle>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {agents.length} <ArrowRight className="h-3 w-3" />
              </span>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.displayName ?? a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.category?.replace(/_/g, " ") ?? "—"}
                      {a.lastRunStatus && ` · last run: ${a.lastRunStatus}`}
                    </div>
                  </div>
                  <StatusBadge status={a.liveStatus} styleMap={LIVE_STATUS_STYLE} />
                </div>
              ))}
              {agents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No agents registered yet — run scripts/factory-runner/sync-agents.mjs.
                </p>
              )}
            </CardContent>
          </Card>

          <NotificationPanel initial={notifications} />
        </div>
      </div>
    </div>
  );
}
