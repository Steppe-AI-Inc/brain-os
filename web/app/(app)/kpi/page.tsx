import { Gauge } from "lucide-react";
import { getKpiRecords, getSalaryRules } from "@/lib/data/kpi";
import { getPeople } from "@/lib/data/people";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { CheckinButton } from "./checkin-button";
import { ScoringButton } from "./scoring-button";
import { SalaryRulesCard } from "./salary-rules-card";
import { JobTimeForm } from "./job-time-form";

export const maxDuration = 30;

export default async function KpiPage() {
  const [records, rules, people] = await Promise.all([getKpiRecords(), getSalaryRules(), getPeople()]);

  const manualLogRoleTitles = new Set(
    rules
      .filter((r) => {
        const f = r.formula as { type?: string; input?: string };
        return f?.type === "efficiency_bonus" && f?.input === "manual_time_log";
      })
      .map((r) => r.role_title)
  );
  const eligiblePeople = people
    .filter((p) => p.active && p.role_title && manualLogRoleTitles.has(p.role_title))
    .map((p) => ({ id: p.id, full_name: p.full_name, role_title: p.role_title }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Gauge}
        title="KPI + Salary"
        description="Salary figures are RLS-gated to HR-finance/founder — not fetched here at all for other roles."
        actions={
          <div className="flex flex-col items-end gap-2">
            <ScoringButton />
            <CheckinButton />
          </div>
        }
      />

      <SalaryRulesCard rules={rules} />
      <JobTimeForm eligiblePeople={eligiblePeople} />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Bonus</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => {
              // r.score is already oriented "higher = better" for both efficiency_bonus
              // directions (see runAutomatedKpiScoring/logTechnicianJobTime) — prefer it
              // over recomputing actual/target, which reads backwards for a
              // lower-is-better metric like technician job time (faster than target
              // would otherwise show as a low, alarming-looking percentage).
              const displayPct = r.score != null && r.score !== 0 ? r.score : r.target ? Math.round(((r.actual ?? 0) / r.target) * 100) : 0;
              const barPct = Math.min(100, Math.max(0, displayPct));
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.people?.full_name ?? "—"}</TableCell>
                  <TableCell>{r.metric}</TableCell>
                  <TableCell>{r.period}</TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Progress value={barPct} className="h-2" />
                      <span className="text-xs text-muted-foreground">{displayPct}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.bonus_amount != null
                      ? r.bonus_amount.toLocaleString()
                      : r.salary_impact_pct
                        ? `+${r.salary_impact_pct}%`
                        : "—"}
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                </TableRow>
              );
            })}
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
