import { ShieldCheck } from "lucide-react";
import { getApprovals } from "@/lib/data/approvals";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ApprovalActions } from "./approval-actions";

export default async function ApprovalsPage() {
  const approvals = await getApprovals();
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={ShieldCheck} title="Approvals" description="Domain-gated: only the right authority can decide each one." />

      <div className="flex flex-col gap-3">
        {pending.map((a) => (
          <Card key={a.id} className="bg-card/90">
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div>
                <div className="font-semibold">{a.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline">{a.risk_level}</Badge>
                  <Badge variant="outline">{a.domain}</Badge>
                  {a.companies?.name && (
                    <Badge variant="secondary">{a.companies.name}</Badge>
                  )}
                </div>
              </div>
              <ApprovalActions approvalId={a.id} />
            </CardContent>
          </Card>
        ))}
        {pending.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending approvals.</p>
        )}
      </div>

      {decided.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">Decided</h2>
          {decided.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-2 text-sm"
            >
              <span>{a.title}</span>
              <Badge variant={a.status === "approved" ? "default" : "destructive"}>
                {a.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
