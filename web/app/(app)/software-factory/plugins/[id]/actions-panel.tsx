"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PluginComponentDetail } from "@/lib/data/plugins";
import {
  enablePluginComponent,
  disablePluginComponent,
  attachPluginComponentToAgent,
  detachPluginComponentFromAgent,
  requestSandboxTest,
  requestRollback,
} from "@/lib/data/plugins";

// Governed console actions. Enable/Disable/Attach/Detach are real, immediate server
// actions (pure DB state, no filesystem needed - see lib/data/plugins.ts's own header
// comment for the architectural reason). Sandbox-test/Rollback here write a real
// plugin_operation_requests row and report the queued request id - the always-on local
// Runner (poll-plugin-operations.mjs) is what actually executes them, since only it has
// filesystem access to the pinned source content. None of these are cosmetic: every
// click either mutates real canonical state now, or queues real work a real process
// will perform.

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  running: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  done: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

export function ActionsPanel({ component, agentOptions }: { component: PluginComponentDetail; agentOptions: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [lastQueuedId, setLastQueuedId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(agentOptions[0]?.id ?? "");
  const [selectedVersionId, setSelectedVersionId] = useState(component.versions[1]?.id ?? component.versions[0]?.id ?? "");

  function run(fn: () => Promise<void | string>) {
    startTransition(async () => {
      const result = await fn();
      if (typeof result === "string") setLastQueuedId(result);
    });
  }

  const canEnable = ["installed", "disabled"].includes(component.installStatus);
  const canDisable = component.installStatus === "enabled";
  const canAttach = component.installStatus === "enabled" && component.enabled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {canEnable && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => enablePluginComponent(component.id))}>
            Enable
          </Button>
        )}
        {canDisable && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => disablePluginComponent(component.id))}>
            Disable
          </Button>
        )}
        {component.installStatus === "installed" && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => requestSandboxTest(component.id))}>
            Re-run Sandbox Test
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !canAttach || !selectedAgentId}
          onClick={() => run(() => attachPluginComponentToAgent(selectedAgentId, component.id))}
        >
          Attach
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !selectedAgentId}
          onClick={() => run(() => detachPluginComponentFromAgent(selectedAgentId, component.id))}
        >
          Detach
        </Button>
      </div>

      {component.versions.length > 1 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            {component.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.recordedReason} · {v.recordedAt.slice(0, 19)} · {v.pinnedCommitSha?.slice(0, 10) ?? "—"}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || !selectedVersionId}
            onClick={() => run(() => requestRollback(component.id, selectedVersionId))}
          >
            Queue Rollback to Selected Version
          </Button>
        </div>
      )}

      {lastQueuedId && (
        <p className="text-xs text-muted-foreground">
          Queued request <code className="rounded bg-secondary px-1 py-0.5">{lastQueuedId}</code> — the Runner
          (poll-plugin-operations.mjs) will pick it up and execute it against the real pinned source.
        </p>
      )}

      {component.operationRequests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">Recent queued operations</div>
          {component.operationRequests.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono">{r.operation}</span>
              <Badge variant="outline" className={`text-xs capitalize ${REQUEST_STATUS_STYLE[r.status] ?? ""}`}>
                {r.status}
              </Badge>
              <span className="text-muted-foreground">{new Date(r.requestedAt).toLocaleString()}</span>
              {r.error && <span className="truncate text-destructive">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
