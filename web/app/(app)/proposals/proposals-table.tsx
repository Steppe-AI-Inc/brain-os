"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { updateProposal, deleteProposal, type ProposalInput } from "@/lib/data/proposals";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  needs_approval: "destructive",
  sent: "secondary",
  won: "default",
  lost: "destructive",
};

type ProposalRow = {
  id: string;
  title: string;
  status: string | null;
  currency: string | null;
  total: number | null;
  internal_margin: number | null;
  payment_terms: string | null;
  companies: { name: string } | null;
};

export function ProposalsTable({ proposals }: { proposals: ProposalRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProposalRow | null>(null);
  const [values, setValues] = useState<ProposalInput>({ title: "", status: "draft", paymentTerms: "" });

  function openEdit(p: ProposalRow) {
    setValues({
      title: p.title,
      status: p.status ?? "draft",
      paymentTerms: p.payment_terms ?? "",
    });
    setEditing(p);
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.map((p) => (
              <TableRow key={p.id} className="group/row">
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  {p.currency} {p.total?.toLocaleString()}
                </TableCell>
                <TableCell>{p.internal_margin?.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status ?? "draft"] ?? "outline"}>{(p.status ?? "draft").replace("_", " ")}</Badge>
                </TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="proposal"
                    className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                    onEdit={() => openEdit(p)}
                    onDelete={() => deleteProposal(p.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {proposals.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No proposals visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit proposal"
        description="Financials (subtotal, total, margin) are server-computed at creation and not editable here."
        saveDisabled={!values.title.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateProposal(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-proposal-title">Title</Label>
          <Input id="edit-proposal-title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-proposal-status">Status</Label>
          <Input id="edit-proposal-status" value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-proposal-terms">Payment terms</Label>
          <Input
            id="edit-proposal-terms"
            value={values.paymentTerms}
            onChange={(e) => setValues((v) => ({ ...v, paymentTerms: e.target.value }))}
          />
        </div>
      </EditSheet>
    </>
  );
}
