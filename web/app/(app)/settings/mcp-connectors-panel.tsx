"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { createMcpConnector, deleteMcpConnector, testMcpConnector } from "@/lib/data/mcp-connectors";

type ConnectorRow = {
  id: string;
  name: string;
  endpoint_url: string;
  transport: string;
  last_checked_at: string | null;
  last_status: string | null;
  last_tool_count: number | null;
  enabled: boolean;
  created_at: string;
};

export function McpConnectorsPanel({ connectors }: { connectors: ConnectorRow[] }) {
  const [error, formAction, pending] = useActionState(createMcpConnector, null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function test(id: string) {
    setActionError(null);
    setBusy(id);
    startTransition(async () => {
      const result = await testMcpConnector(id);
      setBusy(null);
      if (result) setActionError(result);
    });
  }

  function remove(id: string) {
    setActionError(null);
    setBusy(id);
    startTransition(async () => {
      const result = await deleteMcpConnector(id);
      setBusy(null);
      if (result) setActionError(result);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/80 shadow-none">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Remote MCP servers only — a serverless app can&apos;t spawn local (stdio) MCP
            processes. &ldquo;Test connection&rdquo; performs a real MCP handshake (initialize +
            tools/list) against the endpoint. Bearer tokens are stored in Supabase
            Vault, never in a plain table.
          </p>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required className="w-40" placeholder="e.g. Linear" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endpoint_url">Endpoint URL</Label>
              <Input
                id="endpoint_url"
                name="endpoint_url"
                required
                type="url"
                className="w-72"
                placeholder="https://mcp.example.com/sse"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transport">Transport</Label>
              <Select name="transport" defaultValue="http">
                <SelectTrigger id="transport" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token">Bearer token (optional)</Label>
              <Input id="token" name="token" type="password" className="w-48" />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add connector"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-none">
        <div className="flex flex-col divide-y divide-border">
          {connectors.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">{c.endpoint_url}</div>
              </div>
              <Badge variant="outline" className="uppercase">
                {c.transport}
              </Badge>
              {c.last_status === "ok" ? (
                <Badge>{c.last_tool_count ?? 0} tools</Badge>
              ) : c.last_status ? (
                <Badge variant="destructive" className="max-w-40 truncate" title={c.last_status}>
                  {c.last_status}
                </Badge>
              ) : (
                <Badge variant="secondary">Untested</Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy === c.id}
                onClick={() => test(c.id)}
              >
                {busy === c.id ? "Testing…" : "Test connection"}
              </Button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy === c.id}
                onClick={() => remove(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {connectors.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No MCP connectors yet.
            </p>
          )}
        </div>
      </Card>
      {actionError && <p className="text-sm font-medium text-destructive">{actionError}</p>}
    </div>
  );
}
