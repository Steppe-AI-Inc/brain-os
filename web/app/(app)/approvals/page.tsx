import { ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { getApprovals } from "@/lib/data/approvals";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApprovalActions } from "./approval-actions";
import { ApprovalDeleteButton } from "./approval-delete-button";
import { ClearAllApprovals } from "./clear-all-approvals";

// Redesigned as a real "approval center": a top summary strip so the founder can see the
// state of the whole queue without scrolling, and Pending/Decided split into tabs instead
// of one long stacked page — the old layout buried decided history far below a growing
// pending list, and "important actions are difficult to find" was a direct complaint.
export default async function ApprovalsPage() {
  const approvals = await getApprovals();
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
          <div className="mb-3 flex items-center justify-end">
            <ClearAllApprovals ids={decided.map((a) => a.id)} scopeLabel="decided" />
          </div>
          <div className="flex flex-col gap-2">
            {decided.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{a.title}</span>
                    <Badge variant="outline" className="text-[10px]">{a.domain}</Badge>
                    {a.companies?.name && (
                      <Badge variant="secondary" className="text-[10px]">{a.companies.name}</Badge>
                    )}
                  </div>
                  {/* decision_notes is the real "what actually happened" record — a task
                      resumed, a deletion executed, or nothing at all if this approval had
                      no linked action. Showing it here is the direct fix for "approved"
                      silently meaning nothing happened. */}
                  {a.decision_notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.decision_notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={a.status === "approved" ? "default" : "destructive"}>
                    {a.status}
                  </Badge>
                  <ApprovalDeleteButton approvalId={a.id} title={a.title} />
                </div>
              </div>
            ))}
            {decided.length === 0 && (
              <p className="text-sm text-muted-foreground">No decided approvals yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
