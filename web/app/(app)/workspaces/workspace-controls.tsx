"use client";

import { useActionState } from "react";
import { Building2, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptInvitationAction,
  createInvitationAction,
  createWorkspaceAction,
  type InviteState,
  type WorkspaceRow,
} from "@/lib/data/workspaces";

export function WorkspaceControls({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const [workspaceError, createWorkspace, workspacePending] = useActionState(createWorkspaceAction, null);
  const [inviteState, createInvite, invitePending] = useActionState<InviteState, FormData>(createInvitationAction, null);
  const [acceptError, acceptInvite, acceptPending] = useActionState(acceptInvitationAction, null);

  const manageable = workspaces.filter((w) => ["owner", "admin"].includes(w.role) && w.organization);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <h3 className="font-medium">Create workspace/company</h3>
        </div>
        <form action={createWorkspace} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input id="workspace-name" name="name" placeholder="My Company LLC" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-kind">Type</Label>
            <select id="workspace-kind" name="kind" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="company">Company workspace</option>
              <option value="personal">Personal workspace</option>
            </select>
          </div>
          {workspaceError && <p className="text-xs text-destructive">{workspaceError}</p>}
          <Button type="submit" size="sm" disabled={workspacePending}>
            {workspacePending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          <h3 className="font-medium">Invite member/employee</h3>
        </div>
        <form action={createInvite} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Workspace</Label>
            <select name="organization_id" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
              <option value="">Select…</option>
              {manageable.map((w) => (
                <option key={w.organization!.id} value={w.organization!.id}>{w.organization!.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" name="email" required />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <select name="role" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="guest">Guest</option>
            </select>
          </div>
          {inviteState?.error && <p className="text-xs text-destructive">{inviteState.error}</p>}
          {inviteState?.token && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs">
              <div className="font-medium text-foreground">Invitation created</div>
              <p className="mt-1 break-all text-muted-foreground">{inviteState.token}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2" onClick={() => navigator.clipboard.writeText(inviteState.token || "")}>
                <Copy className="mr-1 h-3 w-3" /> Copy token
              </Button>
            </div>
          )}
          <Button type="submit" size="sm" disabled={invitePending || manageable.length === 0}>
            {invitePending ? "Creating…" : "Create invitation"}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="mb-4 font-medium">Accept invitation</h3>
        <form action={acceptInvite} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Invitation token</Label>
            <Input name="token" placeholder="Paste invitation token" required />
          </div>
          {acceptError && <p className="text-xs text-destructive">{acceptError}</p>}
          <Button type="submit" size="sm" disabled={acceptPending}>
            {acceptPending ? "Joining…" : "Join workspace"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Joining a workspace creates a membership only. Employment/KPI/salary are separate records.
        </p>
      </section>
    </div>
  );
}
