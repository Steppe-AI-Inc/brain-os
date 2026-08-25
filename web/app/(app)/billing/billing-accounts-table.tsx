"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLedgerEntries } from "@/lib/data/billing";

type Overview = {
  companyId: string;
  companyName: string;
  billingAccountId: string | null;
  currency: string;
  balance: number;
  totalDeposits: number;
};

type LedgerEntry = { id: string; entry_type: string; amount: number; description: string | null; created_at: string | null };

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  deposit: "default",
  usage: "secondary",
  promo_credit: "outline",
  refund: "outline",
  adjustment: "destructive",
};

export function BillingAccountsTable({ overview }: { overview: Overview[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, LedgerEntry[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(companyId: string) {
    if (expanded === companyId) {
      setExpanded(null);
      return;
    }
    setExpanded(companyId);
    if (!ledgers[companyId]) {
      setLoading(companyId);
      const entries = await getLedgerEntries(companyId);
      setLedgers((prev) => ({ ...prev, [companyId]: entries }));
      setLoading(null);
    }
  }

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>Company</TableHead>
            <TableHead>Total deposits</TableHead>
            <TableHead>Available balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {overview.map((o) => (
            <Fragment key={o.companyId}>
              <TableRow className="cursor-pointer" onClick={() => toggle(o.companyId)}>
                <TableCell className="w-6">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded === o.companyId ? "rotate-90" : ""}`} />
                </TableCell>
                <TableCell className="font-medium">{o.companyName}</TableCell>
                <TableCell>{fmt(o.totalDeposits)}</TableCell>
                <TableCell className={o.balance < 0 ? "font-medium text-destructive" : "font-medium"}>{fmt(o.balance)}</TableCell>
              </TableRow>
              {expanded === o.companyId && (
                <TableRow>
                  <TableCell colSpan={4} className="bg-muted/30">
                    {loading === o.companyId && <p className="p-2 text-sm text-muted-foreground">Loading…</p>}
                    {ledgers[o.companyId] && ledgers[o.companyId].length === 0 && (
                      <p className="p-2 text-sm text-muted-foreground">No ledger entries yet.</p>
                    )}
                    {ledgers[o.companyId] && ledgers[o.companyId].length > 0 && (
                      <div className="flex flex-col gap-1 p-2">
                        {ledgers[o.companyId].map((e) => (
                          <div key={e.id} className="flex items-center gap-2 text-sm">
                            <Badge variant={TYPE_VARIANT[e.entry_type] ?? "outline"} className="w-24 justify-center text-xs">
                              {e.entry_type}
                            </Badge>
                            <span className={e.amount < 0 ? "text-destructive" : "text-emerald-600"}>
                              {e.amount >= 0 ? "+" : ""}
                              {fmt(e.amount)}
                            </span>
                            <span className="flex-1 truncate text-muted-foreground">{e.description}</span>
                            <span className="text-xs text-muted-foreground">
                              {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
          {overview.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No companies on file yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
