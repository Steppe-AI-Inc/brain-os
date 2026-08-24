import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HEALTH_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  watch: "secondary",
  at_risk: "destructive",
  unknown: "outline",
};

type Report = {
  id: string;
  period: string | null;
  revenue: number | null;
  expenses: number | null;
  net_income: number | null;
  cash_position: number | null;
  health_status: string;
  notable_flags: unknown;
  summary: string | null;
  created_at: string | null;
  companies: { name: string } | null;
};

function flagsOf(notableFlags: unknown): string[] {
  return Array.isArray(notableFlags) ? notableFlags.filter((f): f is string => typeof f === "string") : [];
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function FinanceDashboard({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No financial reports yet — upload a statement above.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {reports.map((r) => (
        <Card key={r.id} className="border-border/80 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">{r.companies?.name ?? "—"}</CardTitle>
              <p className="text-xs text-muted-foreground">{r.period || (r.created_at ? new Date(r.created_at).toLocaleDateString() : "—")}</p>
            </div>
            <Badge variant={HEALTH_VARIANT[r.health_status] ?? "outline"} className="capitalize">
              {r.health_status.replace("_", " ")}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-semibold">{fmt(r.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-lg font-semibold">{fmt(r.expenses)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net income</p>
                <p className="text-lg font-semibold">{fmt(r.net_income)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cash position</p>
                <p className="text-lg font-semibold">{fmt(r.cash_position)}</p>
              </div>
            </div>
            {r.summary && <p className="text-sm text-muted-foreground">{r.summary}</p>}
            {flagsOf(r.notable_flags).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {flagsOf(r.notable_flags).map((f, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
