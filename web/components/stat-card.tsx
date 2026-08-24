import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ACCENTS: Record<string, string> = {
  amber: "bg-primary/10 text-primary",
  cyan: "bg-chart-2/10 text-chart-2",
  violet: "bg-chart-4/10 text-chart-4",
  green: "bg-chart-2/10 text-chart-2",
  rose: "bg-destructive/10 text-destructive",
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
    <Card className="border-border/80 shadow-none">
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENTS[accent]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none tracking-tight">{value}</div>
          <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
