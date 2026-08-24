import { Activity, ArrowDownToLine, ArrowUpFromLine, DollarSign } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UsageSummary } from "@/lib/data/usage";

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

export function UsagePanel({
  summary,
  recent,
}: {
  summary: { today: UsageSummary; last7d: UsageSummary; last30d: UsageSummary };
  recent: RecentUsageRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
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
