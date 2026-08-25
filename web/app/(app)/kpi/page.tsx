/* eslint-disable @typescript-eslint/no-explicit-any */
import { Gauge, ShieldCheck, TrendingUp, WalletCards } from "lucide-react";
import {
  getCompensationRecommendations,
  getFixedSalaryVisibleToCaller,
  getKpiRecords,
  getSalesCommissionEvents,
} from "@/lib/data/kpi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { CheckinButton } from "./checkin-button";

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

const personOf = (row: any) => (Array.isArray(row.people) ? row.people[0] : row.people);

export default async function KpiPage() {
  const [records, recommendations, commissions, salaries] = await Promise.all([
    getKpiRecords(),
    getCompensationRecommendations(),
    getSalesCommissionEvents(),
    getFixedSalaryVisibleToCaller(),
  ]);

  const latestByPerson = new Map<string, any[]>();
  for (const r of records) {
    const list = latestByPerson.get(r.person_id) ?? [];
    list.push(r);
    latestByPerson.set(r.person_id, list);
  }

  const peopleScore = Array.from(latestByPerson.entries()).map(([personId, rows]) => {
    const weighted = rows.reduce((sum, r) => sum + Number(r.calculated_score ?? r.score ?? 0) * Number(r.weight ?? 0), 0);
    const weight = rows.reduce((sum, r) => sum + Number(r.weight ?? 0), 0);
    const score = weight > 0 ? weighted / weight : rows.reduce((sum, r) => sum + Number(r.calculated_score ?? r.score ?? 0), 0) / Math.max(1, rows.length);
    return { personId, person: personOf(rows[0]), rows, score: Math.round(score) };
  }).sort((a, b) => b.score - a.score);

  const fixedSalaryTotalVisible = salaries.reduce((sum: number, s: any) => sum + Number(s.base_salary || 0), 0);
  const bonusRecommended = recommendations.reduce((sum: number, r: any) => sum + Number(r.total_variable_amount || 0), 0);
  const salesCommission = commissions.reduce((sum: number, c: any) => sum + Number(c.commission_amount || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Gauge}
        title="KPI + Bonus"
        description="Fixed salary pays for the role. Better measurable performance creates variable upside. AI calculates from auditable evidence; compensation changes and payouts remain human-approved."
        actions={<CheckinButton />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="text-sm">People scored</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{peopleScore.length}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><WalletCards className="h-4 w-4" />Fixed payroll visible</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{salaries.length ? money(fixedSalaryTotalVisible, salaries[0]?.currency || "USD") : "RLS restricted"}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Performance bonus recommended</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(bonusRecommended, recommendations[0]?.currency || "USD")}</CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" />Sales commission</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(salesCommission, commissions[0]?.currency || "USD")}</CardContent>
        </Card>
      </div>

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div><div className="text-sm font-medium">Fixed salary stays fixed</div><p className="mt-1 text-xs text-muted-foreground">Tenure or asking for a raise does not automatically change contractual salary. Promotion/role changes use a separate human review.</p></div>
          <div><div className="text-sm font-medium">Performance bonus</div><p className="mt-1 text-xs text-muted-foreground">Evidence-based variable upside can reward speed, quality, punctuality, communication and ownership. Quality gates stop rushed/bad work from gaming speed.</p></div>
          <div><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />Sales upside can be uncapped</div><p className="mt-1 text-xs text-muted-foreground">Commission is calculated from the approved basis such as collected revenue or gross profit and still requires evidence/approval before payout.</p></div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <CardHeader><CardTitle className="text-base">People performance</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Evidence dimensions</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {peopleScore.map((p) => (
              <TableRow key={p.personId}>
                <TableCell>
                  <div className="font-medium">{p.person?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.person?.role_title ?? ""}</div>
                </TableCell>
                <TableCell className="w-44">
                  <div className="flex items-center gap-2">
                    <Progress value={Math.min(100, p.score)} className="h-2" />
                    <span className="text-xs font-medium">{p.score}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-xl flex-wrap gap-1.5">
                    {p.rows.slice(0, 6).map((r: any) => (
                      <Badge key={r.id} variant="outline" className="font-normal">
                        {r.metric}: {Math.round(Number(r.calculated_score ?? r.score ?? 0))}%
                        {r.quality_gate_passed === false ? " · QA gate failed" : ""}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.score >= 90 ? "default" : p.score >= 70 ? "secondary" : "outline"}>
                    {p.score >= 90 ? "strong" : p.score >= 70 ? "on track" : "needs attention"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {peopleScore.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No KPI evidence visible yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card/80">
          <CardHeader><CardTitle className="text-base">Variable compensation recommendations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recommendations.map((r: any) => {
              const person = personOf(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-3 text-sm">
                  <div>
                    <div className="font-medium">{person?.full_name ?? "Employee"}</div>
                    <div className="text-xs text-muted-foreground">{r.period} · KPI {r.overall_kpi_score ?? "—"}% · bonus {r.performance_bonus_pct}%</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{money(Number(r.total_variable_amount || 0), r.currency || "USD")}</div>
                    <Badge variant="outline" className="mt-1 capitalize">{String(r.status).replaceAll("_", " ")}</Badge>
                  </div>
                </div>
              );
            })}
            {recommendations.length === 0 && <p className="text-sm text-muted-foreground">No bonus recommendations yet. Collect evidence first.</p>}
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader><CardTitle className="text-base">Sales commissions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {commissions.map((c: any) => {
              const person = personOf(c);
              return (
                <div key={c.id} className="rounded-lg border border-border/50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{person?.full_name ?? "Sales"} · {c.customer_name || "Contract"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Basis: {String(c.commission_basis).replaceAll("_", " ")} · rate {c.commission_rate_pct}% · collected {money(Number(c.collected_revenue || 0), c.currency || "USD")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{money(Number(c.commission_amount || 0), c.currency || "USD")}</div>
                      <Badge variant="outline" className="mt-1 capitalize">{c.status}</Badge>
                    </div>
                  </div>
                </div>
              );
            })}
            {commissions.length === 0 && <p className="text-sm text-muted-foreground">No commission events yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
