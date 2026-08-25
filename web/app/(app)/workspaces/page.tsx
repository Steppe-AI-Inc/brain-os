import { Building2, ShieldCheck, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getWorkspaces } from "@/lib/data/workspaces";
import { WorkspaceControls } from "./workspace-controls";

export default async function WorkspacesPage() {
  const workspaces = await getWorkspaces();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Building2}
        title="Workspaces & Organizations"
        description="Platform account, workspace membership and employment are separate security concepts. RLS follows the active memberships — not a global employee role."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Your workspaces</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{workspaces.length}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Owner/Admin</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{workspaces.filter((w) => ["owner", "admin"].includes(w.role)).length}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><UserRoundCog className="h-4 w-4" />Employment</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Managed separately in People + KPI.</CardContent>
        </Card>
      </div>

      <Card className="bg-card/80">
        <CardHeader><CardTitle className="text-base">Memberships</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((w) => (
            <div key={w.membershipId} className="rounded-xl border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{w.organization?.name ?? "Unknown workspace"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{w.organization?.slug}</div>
                </div>
                <Badge variant="outline" className="capitalize">{w.role}</Badge>
              </div>
              <div className="mt-3 flex gap-2 text-xs text-muted-foreground">
                <span>{w.organization?.kind ?? "—"}</span>
                {w.organization?.is_sem_internal && <span>• SEM internal</span>}
              </div>
            </div>
          ))}
          {workspaces.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No v1 workspace membership is visible yet. Apply the v1 tenancy migration or create a new account after it is deployed.
            </div>
          )}
        </CardContent>
      </Card>

      <WorkspaceControls workspaces={workspaces} />
    </div>
  );
}
