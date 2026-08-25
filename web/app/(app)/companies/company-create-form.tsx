"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createCompany } from "@/lib/data/companies";
import type { WorkspaceRow } from "@/lib/data/workspaces";

export function CompanyCreateForm({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const [error, formAction, pending] = useActionState(createCompany, null);
  const manageable = workspaces.filter((w) => ["owner", "admin"].includes(w.role) && w.organization);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organization_id">Workspace</Label>
            <select id="organization_id" name="organization_id" required className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select workspace…</option>
              {manageable.map((w) => <option key={w.organization!.id} value={w.organization!.id}>{w.organization!.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required className="w-56" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" className="w-64" />
          </div>
          <Button type="submit" disabled={pending || manageable.length === 0}>
            {pending ? "Creating…" : "Add company"}
          </Button>
        </form>
        {manageable.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Create a workspace first. Companies must belong to a tenant workspace in v1.</p>}
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
