import { Gauge } from "lucide-react";
import { getKpiRecords } from "@/lib/data/kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { CheckinButton } from "./checkin-button";

export default async function KpiPage() {
  const records = await getKpiRecords();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Gauge}
        title="KPI + Salary"
        description="Salary figures are RLS-gated to HR-finance/founder — not fetched here at all for other roles."
        actions={<CheckinButton />}
      />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => {
              const pct = r.target ? Math.min(100, Math.round(((r.actual ?? 0) / r.target) * 100)) : 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.people?.full_name ?? "—"}</TableCell>
                  <TableCell>{r.metric}</TableCell>
                  <TableCell>{r.period}</TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-2" />
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                </TableRow>
              );
            })}
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No KPI records visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
