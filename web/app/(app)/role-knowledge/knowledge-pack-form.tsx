"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKnowledgePackAction } from "@/lib/data/role-knowledge";
import type { WorkspaceRow } from "@/lib/data/workspaces";

export function KnowledgePackForm({
  workspaces,
  companies,
}: {
  workspaces: WorkspaceRow[];
  companies: Array<{ id: string; name: string; organization_id?: string | null }>;
}) {
  const [error, action, pending] = useActionState(createKnowledgePackAction, null);
  const manageable = workspaces.filter((w) => ["owner", "admin", "manager"].includes(w.role) && w.organization);

  return (
    <form action={action} className="grid gap-3 rounded-xl border border-border/60 bg-card p-4 md:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Workspace</Label>
        <select name="organization_id" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Select workspace…</option>
          {manageable.map((w) => <option key={w.organization!.id} value={w.organization!.id}>{w.organization!.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Company (optional)</Label>
        <select name="company_id" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All / role-wide</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Level</Label>
        <Input name="level" type="number" min={1} defaultValue={1} />
      </div>
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Role title</Label>
        <Input name="role_title" placeholder="Country Manager" required />
      </div>
      <div className="space-y-1.5 xl:col-span-2">
        <Label>Knowledge pack title</Label>
        <Input name="title" placeholder="Country Manager Level 1" required />
      </div>
      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending || manageable.length === 0} className="w-full">
          {pending ? "Creating…" : "Create pack"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive md:col-span-2 xl:col-span-5">{error}</p>}
    </form>
  );
}
