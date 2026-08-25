"use client";

import { useActionState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPersonAssistantAction } from "@/lib/data/assistants";
import type { WorkspaceRow } from "@/lib/data/workspaces";

export function AssistantForm({
  workspaces,
  people,
}: {
  workspaces: WorkspaceRow[];
  people: Array<{ id: string; full_name: string; role_title: string | null }>;
}) {
  const [error, action, pending] = useActionState(createPersonAssistantAction, null);
  const manageable = workspaces.filter((w) => ["owner", "admin"].includes(w.role) && w.organization);

  return (
    <form action={action} className="grid gap-3 rounded-xl border border-border/60 bg-card p-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Workspace</Label>
        <select name="organization_id" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Select workspace…</option>
          {manageable.map((w) => <option key={w.organization!.id} value={w.organization!.id}>{w.organization!.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Employee/person</Label>
        <select name="person_id" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Select person…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.role_title ? ` — ${p.role_title}` : ""}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Automation</Label>
        <select name="mode" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="draft">
          <option value="manual">Manual</option>
          <option value="draft">Draft only</option>
          <option value="auto_routine">Auto routine</option>
          <option value="fallback_after_timeout">Fallback after SLA</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Fallback SLA (min)</Label>
        <Input name="fallback_sla_minutes" type="number" min={1} defaultValue={60} />
      </div>
      <div className="space-y-1.5 md:col-span-2 xl:col-span-5">
        <Label>Routine categories AI may answer</Label>
        <Input name="allowed_categories" placeholder="brochure, product_info, meeting_schedule, status_update" />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" className="w-full" disabled={pending || manageable.length === 0}>
          <Bot className="mr-2 h-4 w-4" />
          {pending ? "Creating…" : "Create paired AI"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive md:col-span-2 xl:col-span-6">{error}</p>}
    </form>
  );
}
