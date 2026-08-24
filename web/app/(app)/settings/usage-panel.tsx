import { Activity, ArrowDownToLine, ArrowUpFromLine, DollarSign } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DailyUsage, UsageSummary } from "@/lib/data/usage";

type RecentUsageRow = {
  id: string;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string | null;
  profiles: { full_name: string } | null;
};

function fmtCost(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function DailyUsageChart({ daily }: { daily: DailyUsage[] }) {
  const max = Math.max(1, ...daily.map((d) => d.totalTokens));
  return (
    <Card className="border-border/80 p-4 shadow-none">
      <p className="mb-3 text-sm font-medium text-muted-foreground">
        Tokens per day (last {daily.length} days)
      </p>
      <div className="flex h-32 items-end gap-1.5">
        {daily.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
            style={{ height: `${Math.max(2, (d.totalTokens / max) * 100)}%` }}
            title={`${d.date}: ${d.totalTokens.toLocaleString()} tokens, ${fmtCost(d.costUsd)}, ${d.calls} call(s)`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </Card>
  );
}

export function UsagePanel({
  summary,
  recent,
  daily,
}: {
  summary: { today: UsageSummary; last7d: UsageSummary; last30d: UsageSummary };
  recent: RecentUsageRow[];
  daily: DailyUsage[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <DailyUsageChart daily={daily} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Activity} label="Calls today" value={summary.today.totalCalls} accent="amber" />
        <StatCard
          icon={ArrowDownToLine}
          label="Input tokens (7d)"
          value={summary.last7d.totalInputTokens.toLocaleString()}
          accent="cyan"
        />
        <StatCard
          icon={ArrowUpFromLine}
          label="Output tokens (7d)"
          value={summary.last7d.totalOutputTokens.toLocaleString()}
          accent="violet"
        />
        <StatCard
          icon={DollarSign}
          label="Est. cost (30d)"
          value={fmtCost(summary.last30d.totalCostUsd)}
          accent="green"
        />
      </div>

      <Card className="overflow-hidden border-border/80 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>By</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.model_name ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{(r.input_tokens ?? 0).toLocaleString()}</TableCell>
                <TableCell className="tabular-nums">{(r.output_tokens ?? 0).toLocaleString()}</TableCell>
                <TableCell className="tabular-nums">{fmtCost(Number(r.estimated_cost_usd ?? 0))}</TableCell>
                <TableCell className="text-muted-foreground">{r.profiles?.full_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                </TableCell>
              </TableRow>
            ))}
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No AI command calls yet — send one from AI Native Chat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
