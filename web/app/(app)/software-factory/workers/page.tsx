import { Server, HeartPulse, AlertTriangle, CircleHelp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getWorkers } from "@/lib/data/plugins";

// Phase 6 — real worker/machine registry. A row here exists only because that machine
// actually ran scripts/factory-runner/register-worker.mjs against production — never a
// placeholder "Main PC"/"Work PC" row. live_status is computed from real
// last_heartbeat_at (public.workers_with_live_status), same heartbeat-derived pattern
// as agents_with_live_status/agent_runs_with_live_status — never a stored, fakeable flag.
//
// This is the source of truth for "is component X actually deployed to a machine",
// distinct from the plugin registry's own install_status (which tracks whether Brain OS
// has reviewed/approved a component, not whether any particular machine runs it).

const STATUS_STYLE: Record<string, { className: string; icon: React.ElementType }> = {
  HEALTHY: { className: "border-chart-2/30 bg-chart-2/15 text-chart-2", icon: HeartPulse },
  DEGRADED: { className: "border-chart-3/30 bg-chart-3/15 text-chart-3", icon: AlertTriangle },
  DOWN: { className: "border-destructive/30 bg-destructive/15 text-destructive", icon: AlertTriangle },
  UNKNOWN: { className: "border-border bg-muted text-muted-foreground", icon: CircleHelp },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function WorkersPage() {
  const workers = await getWorkers();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Server}
        title="Factory Workers"
        description="Real, self-registered machines only — a row exists here because that machine actually ran register-worker.mjs against production, never a placeholder."
      />

      <div className="flex flex-col gap-4">
        {workers.map((w) => {
          const style = STATUS_STYLE[w.liveStatus] ?? STATUS_STYLE.UNKNOWN;
          const Icon = style.icon;
          return (
            <Card key={w.id} className="border-border/80 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">{w.displayName ?? w.hostname}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.workerRole ?? "role not set"} · {w.osPlatform ?? "—"}
                  </p>
                </div>
                <Badge variant="outline" className={`flex items-center gap-1 ${style.className}`}>
                  <Icon className="h-3 w-3" /> {w.liveStatus}
                </Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Last heartbeat</div>
                  <div className="mt-0.5">{timeAgo(w.lastHeartbeatAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Node version</div>
                  <div className="mt-0.5">{w.nodeVersion ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Claude Code version</div>
                  <div className="mt-0.5">{w.claudeCodeVersion ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max concurrency</div>
                  <div className="mt-0.5">{w.maxConcurrency ?? "—"}</div>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-xs text-muted-foreground">Installed plugin components</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {w.installedComponents.length === 0 && <span className="text-xs text-muted-foreground">none recorded</span>}
                    {w.installedComponents.map((c) => (
                      <Badge
                        key={c.slug}
                        variant="outline"
                        className={c.configurationDrift ? "border-destructive/30 bg-destructive/15 text-destructive" : ""}
                      >
                        {c.slug}
                        {c.configurationDrift && " (drift)"}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {workers.length === 0 && (
          <Card className="border-border/80 shadow-none">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No workers registered yet — run{" "}
              <code className="rounded bg-secondary px-1 py-0.5">node scripts/factory-runner/register-worker.mjs</code> on a real
              machine.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
