"use client";

import { useActionState } from "react";
import { Factory, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSoftwareFactoryRunAction } from "@/lib/data/software";
import type { WorkspaceRow } from "@/lib/data/workspaces";

export function FactoryRunForm({
  workspaces,
  companies,
}: {
  workspaces: WorkspaceRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, action, pending] = useActionState(createSoftwareFactoryRunAction, null);
  const manageable = workspaces.filter((w) => ["owner", "admin", "manager"].includes(w.role) && w.organization);

  return (
    <form action={action} className="rounded-xl border border-border/60 bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Factory className="h-4 w-4" />
        <div>
          <h3 className="font-medium">Start production run</h3>
          <p className="text-xs text-muted-foreground">Creates a staged delivery run from product brief → code → tests → Vercel preview → QA → release approval.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
            <option value="">Workspace product</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 xl:col-span-2">
          <Label>Template</Label>
          <select name="template_key" defaultValue="custom" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="custom">Custom software</option>
            <option value="hoa_mongolia">Mongolia HOA Automation OS</option>
          </select>
        </div>
        <div className="space-y-1.5 xl:col-span-3">
          <Label>Product / project title</Label>
          <Input name="title" placeholder="HOA OS — Mongolia" required />
        </div>
        <div className="space-y-1.5 xl:col-span-3">
          <Label>Business requirement</Label>
          <Input name="problem_statement" placeholder="What should the finished product achieve?" />
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || manageable.length === 0}>
          {pending ? "Creating run…" : "Start Software Factory"}
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Home className="h-3.5 w-3.5" /> HOA preset includes billing, resident accounts, payments, transparency, maintenance, RLS and mobile tests.</span>
      </div>
    </form>
  );
}
