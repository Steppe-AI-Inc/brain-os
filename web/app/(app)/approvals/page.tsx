import { ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { getApprovals } from "@/lib/data/approvals";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApprovalActions } from "./approval-actions";
import { ApprovalDeleteButton } from "./approval-delete-button";
import { ClearAllApprovals } from "./clear-all-approvals";
import { DecidedList } from "./decided-list";

// Redesigned as a real "approval center": a top summary strip so the founder can see the
// state of the whole queue without scrolling, and Pending/Decided split into tabs instead
// of one long stacked page — the old layout buried decided history far below a growing
// pending list, and "important actions are difficult to find" was a direct complaint.
export default async function ApprovalsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const approvals = await getApprovals(scopeToActiveOrg);
  const pending = approvals.filter((a) => a.status === "pending");
  const approved = approvals.filter((a) => a.status === "approved");
  const rejected = approvals.filter((a) => a.status === "rejected");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ShieldCheck}
        title="Approvals"
        description="Routed automatically to whoever has the authority to decide each one."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Clock} label="Needs decision" value={pending.length} accent="amber" />
        <StatCard icon={CheckCircle2} label="Approved" value={approved.length} accent="green" />
        <StatCard icon={XCircle} label="Rejected" value={rejected.length} accent="rose" />
        <StatCard icon={ShieldCheck} label="Total records" value={approvals.length} accent="violet" />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="mb-3 flex items-center justify-end">
            <ClearAllApprovals ids={pending.map((a) => a.id)} scopeLabel="pending" />
          </div>
          <div className="flex flex-col gap-3">
            {pending.map((a) => (
              <Card key={a.id} className="bg-card/90">
                <CardContent className="flex items-start justify-between gap-4 pt-6">
                  <div className="min-w-0">
                    <div className="font-semibold">{a.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{a.risk_level}</Badge>
                      <Badge variant="outline">{a.domain}</Badge>
                      {a.companies?.name && (
                        <Badge variant="secondary">{a.companies.name}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <ApprovalActions approvalId={a.id} />
                    <ApprovalDeleteButton approvalId={a.id} title={a.title} />
                  </div>
                </CardContent>
              </Card>
            ))}
            {pending.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending approvals.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="decided" className="mt-4">
          <DecidedList approvals={decided} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
