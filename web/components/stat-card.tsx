import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ACCENTS: Record<string, string> = {
  amber: "from-primary/20 to-primary/5 text-primary ring-primary/25",
  cyan: "from-chart-2/20 to-chart-2/5 text-chart-2 ring-chart-2/25",
  violet: "from-chart-3/20 to-chart-3/5 text-chart-3 ring-chart-3/25",
  green: "from-chart-4/20 to-chart-4/5 text-chart-4 ring-chart-4/25",
  rose: "from-chart-5/20 to-chart-5/5 text-chart-5 ring-chart-5/25",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "amber",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 backdrop-blur transition-transform hover:-translate-y-0.5">
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 ${ACCENTS[accent]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-black leading-none tracking-tight">{value}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
