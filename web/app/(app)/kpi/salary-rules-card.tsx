import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Formula = {
  type: "efficiency_bonus" | "commission";
  metric_label?: string;
  rate_pct?: number;
  uncapped?: boolean;
  bonus_bands?: { min_score_pct: number; bonus_pct: number }[];
};

type Rule = {
  id: string;
  role_title: string | null;
  rule_name: string;
  formula: unknown;
  companies: { name: string } | null;
};

function formatFormula(formula: Formula): string {
  if (formula.type === "commission") {
    return `${formula.rate_pct}% of won contract value${formula.uncapped ? ", uncapped" : ""}`;
  }
  const bands = formula.bonus_bands ?? [];
  const sorted = [...bands].sort((a, b) => b.min_score_pct - a.min_score_pct);
  return sorted.map((b) => `≥${b.min_score_pct}% → +${b.bonus_pct}% bonus`).join(" · ");
}

export function SalaryRulesCard({ rules }: { rules: Rule[] }) {
  if (rules.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 bg-card/80 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4" /> Active compensation policy
      </div>
      <p className="text-xs text-muted-foreground">
        Base salaries are frozen — increases only come from bonuses computed by these fixed rules, not manager
        discretion.
      </p>
      <div className="flex flex-col gap-2">
        {rules.map((r) => {
          const formula = r.formula as Formula;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <Badge variant="outline">{r.role_title ?? "All other roles (default)"}</Badge>
              {r.companies?.name && <span className="text-xs text-muted-foreground">{r.companies.name}</span>}
              <span className="font-medium">{r.rule_name}</span>
              <span className="text-xs text-muted-foreground">— {formatFormula(formula)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
