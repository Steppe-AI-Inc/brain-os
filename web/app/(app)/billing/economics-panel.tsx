"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateMarkup } from "@/lib/data/billing";

type Economics = {
  markup: number;
  providerCost: number;
  customerCharge: number;
  grossMargin: number;
  marginPct: number;
  byModel: Array<{ model: string; providerCost: number; customerCharge: number; requests: number; tokens: number }>;
};

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EconomicsPanel({ economics, markup, canEdit }: { economics: Economics; markup: number; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(markup));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateMarkup(Number(value));
      if (result) {
        setError(result);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 bg-card/80 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4" /> AI usage &amp; economics — real provider cost, informational customer-charge preview
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Markup ×</Label>
            <Input type="number" min="0.1" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-16" />
            <Button size="sm" variant="outline" disabled={isPending} onClick={save}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Provider cost is real (from logged model usage). Customer charge = provider cost × markup — a preview of SEM Brain
        service-credit pricing, not yet auto-debited per transaction (that needs usage events resolved to a company, which
        isn&apos;t wired up yet).
      </p>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead>Provider cost</TableHead>
            <TableHead>Customer charge</TableHead>
            <TableHead>Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {economics.byModel.map((m) => (
            <TableRow key={m.model}>
              <TableCell className="font-medium">{m.model}</TableCell>
              <TableCell>{m.requests.toLocaleString()}</TableCell>
              <TableCell>{m.tokens.toLocaleString()}</TableCell>
              <TableCell>{fmt(m.providerCost)}</TableCell>
              <TableCell>{fmt(m.customerCharge)}</TableCell>
              <TableCell>{fmt(m.customerCharge - m.providerCost)}</TableCell>
            </TableRow>
          ))}
          {economics.byModel.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No AI usage logged yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
