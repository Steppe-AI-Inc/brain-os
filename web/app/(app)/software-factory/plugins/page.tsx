import { PackageSearch, ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw, Bot } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPluginComponents } from "@/lib/data/factory";

// Phase 6 — the plugin/skill registry made genuinely useful, per the founder's explicit
// requirement: every field here is real registry/attachment/runtime state, never a
// hardcoded badge. install_status walks the real lifecycle (discovered -> reviewing ->
// quarantined -> testing -> installed -> enabled/disabled/failed/update_available -
// 202608310005) - a component sitting at "discovered" is shown as exactly that, never
// rounded up to "Installed" just because a GitHub source exists for it.
//
// Read-only for now (disclosed, not silently skipped): Attach/Detach/Review-update/
// Disable/Rollback are real, working commands today via
// `node scripts/factory-runner/plugin-attach.mjs <verb> ...` (proven live this session -
// see qa/KNOWN_FAILURE_MODES.md #49) but are not yet wired to interactive buttons here -
// that requires real founder-authenticated server actions against the same
// founder-admin-only RLS policy this page's own read already goes through, which is a
// distinct, not-yet-built follow-up.

const INSTALL_STATUS_STYLE: Record<string, string> = {
  discovered: "bg-muted text-muted-foreground border-border",
  reviewing: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  quarantined: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  testing: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  installed: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  enabled: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  disabled: "bg-muted/60 text-muted-foreground/70 border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  update_available: "bg-chart-1/15 text-chart-1 border-chart-1/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize ${INSTALL_STATUS_STYLE[status] ?? "border-border text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function ReviewBadge({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <span className="flex items-center gap-1 text-chart-2">
        <ShieldCheck className="h-3.5 w-3.5" /> Passed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 text-destructive">
        <ShieldAlert className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <ShieldQuestion className="h-3.5 w-3.5" /> Pending
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function PluginsPage() {
  const components = await getPluginComponents();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={PackageSearch}
        title="Plugin / Skill Registry"
        description="Real GitHub-sourced components — every pinned SHA, review result, attachment, and runtime-use timestamp here is live canonical state, never a cosmetic badge."
      />

      <div className="flex flex-col gap-4">
        {components.map((c) => (
          <Card key={c.id} className="border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold">{c.displayName ?? c.slug}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.componentType} · Source: {c.sourceOwner}/{c.sourceRepo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.updateAvailable && (
                  <Badge variant="outline" className="flex items-center gap-1 border-chart-1/30 bg-chart-1/15 text-chart-1">
                    <RefreshCw className="h-3 w-3" /> Update available
                  </Badge>
                )}
                <StatusBadge status={c.installStatus} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Pinned commit</div>
                <div className="mt-0.5 font-mono text-xs">
                  {c.pinnedCommitSha ? c.pinnedCommitSha.slice(0, 12) + "…" : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Definition hash</div>
                <div className="mt-0.5 font-mono text-xs">
                  {c.definitionHash ? c.definitionHash.slice(0, 12) + "…" : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">License</div>
                <div className="mt-0.5">{c.license ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Version</div>
                <div className="mt-0.5">{c.installedVersion ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">License review</div>
                <div className="mt-0.5"><ReviewBadge status={c.licenseReviewStatus} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Security review</div>
                <div className="mt-0.5"><ReviewBadge status={c.securityReviewStatus} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last runtime use</div>
                <div className="mt-0.5">{timeAgo(c.lastRuntimeUseAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Attached to</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {c.attachedAgentNames.length === 0 && <span className="text-muted-foreground">none</span>}
                  {c.attachedAgentNames.map((name) => (
                    <span key={name} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                      <Bot className="h-3 w-3" /> {name}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {components.length === 0 && (
          <Card className="border-border/80 shadow-none">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No plugin/skill components registered yet — run{" "}
              <code className="rounded bg-secondary px-1 py-0.5">node scripts/factory-runner/plugin-attach.mjs discover ...</code>.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
