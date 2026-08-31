"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw, Bot, Search, HeartPulse, AlertTriangle, CircleHelp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PluginComponent } from "@/lib/data/factory";
import { enablePluginComponent, disablePluginComponent } from "@/lib/data/plugins";

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

const HEALTH_STYLE: Record<PluginComponent["health"], { className: string; icon: React.ElementType; label: string }> = {
  HEALTHY: { className: "border-chart-2/30 bg-chart-2/15 text-chart-2", icon: HeartPulse, label: "Healthy" },
  DEGRADED: { className: "border-chart-3/30 bg-chart-3/15 text-chart-3", icon: AlertTriangle, label: "Degraded" },
  DOWN: { className: "border-destructive/30 bg-destructive/15 text-destructive", icon: AlertTriangle, label: "Down" },
  UNKNOWN: { className: "border-border bg-muted text-muted-foreground", icon: CircleHelp, label: "Unknown" },
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize ${INSTALL_STATUS_STYLE[status] ?? "border-border text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function HealthBadge({ health }: { health: PluginComponent["health"] }) {
  const s = HEALTH_STYLE[health];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${s.className}`}>
      <Icon className="h-3 w-3" /> {s.label}
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

export function PluginList({ initial }: { initial: PluginComponent[] }) {
  const [components, setComponents] = useState(initial);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const types = useMemo(() => Array.from(new Set(initial.map((c) => c.componentType))).sort(), [initial]);
  const statuses = useMemo(() => Array.from(new Set(initial.map((c) => c.installStatus))).sort(), [initial]);

  const filtered = components.filter((c) => {
    if (typeFilter !== "all" && c.componentType !== typeFilter) return false;
    if (statusFilter !== "all" && c.installStatus !== statusFilter) return false;
    if (query && !`${c.displayName ?? ""} ${c.slug} ${c.sourceOwner}/${c.sourceRepo}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  function toggleEnabled(c: PluginComponent) {
    startTransition(async () => {
      if (c.installStatus === "enabled") {
        await disablePluginComponent(c.id);
        setComponents((prev) => prev.map((x) => (x.id === c.id ? { ...x, installStatus: "disabled", enabled: false } : x)));
      } else if (["installed", "disabled"].includes(c.installStatus)) {
        await enablePluginComponent(c.id);
        setComponents((prev) => prev.map((x) => (x.id === c.id ? { ...x, installStatus: "enabled", enabled: true } : x)));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search components..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm capitalize"
        >
          <option value="all">All lifecycle states</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {filtered.map((c) => (
        <Card key={c.id} className="border-border/80 shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <Link href={`/software-factory/plugins/${c.id}`} className="hover:underline">
                <CardTitle className="text-base font-semibold">{c.displayName ?? c.slug}</CardTitle>
              </Link>
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
              <HealthBadge health={c.health} />
              <StatusBadge status={c.installStatus} />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Pinned commit</div>
              <div className="mt-0.5 font-mono text-xs">{c.pinnedCommitSha ? c.pinnedCommitSha.slice(0, 12) + "…" : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Definition hash</div>
              <div className="mt-0.5 font-mono text-xs">{c.definitionHash ? c.definitionHash.slice(0, 12) + "…" : "—"}</div>
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
          <div className="flex items-center gap-2 border-t border-border/60 px-6 py-3">
            {["installed", "enabled", "disabled"].includes(c.installStatus) && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => toggleEnabled(c)}>
                {c.installStatus === "enabled" ? "Disable" : "Enable"}
              </Button>
            )}
            <Link href={`/software-factory/plugins/${c.id}`} className="text-xs text-primary hover:underline">
              View details & governed actions →
            </Link>
          </div>
        </Card>
      ))}
      {filtered.length === 0 && (
        <Card className="border-border/80 shadow-none">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {components.length === 0
              ? "No plugin/skill components registered yet."
              : "No components match the current filters."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
