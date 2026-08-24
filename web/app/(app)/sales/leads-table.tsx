"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { ListControls, useListView } from "@/components/list-controls";
import { updateLead, deleteLead, type LeadInput } from "@/lib/data/sales";

type LeadRow = {
  id: string;
  client_name: string;
  contact_name: string | null;
  contact_email: string | null;
  stage: string | null;
  value_estimate: number | null;
  company_id: string | null;
  companies: { name: string } | null;
};

export function LeadsTable({
  leads,
  companies,
}: {
  leads: LeadRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [values, setValues] = useState<LeadInput>({
    clientName: "",
    companyId: "",
    contactName: "",
    contactEmail: "",
    stage: "lead",
    valueEstimate: 0,
  });

  const view = useListView({
    items: leads,
    searchText: (lead) => [lead.client_name, lead.contact_name, lead.contact_email, lead.stage, lead.companies?.name].filter(Boolean).join(" "),
    filterValue: (lead) => lead.stage ?? "lead",
  });

  function openEdit(l: LeadRow) {
    setValues({
      clientName: l.client_name,
      companyId: l.company_id ?? "",
      contactName: l.contact_name ?? "",
      contactEmail: l.contact_email ?? "",
      stage: l.stage ?? "lead",
      valueEstimate: l.value_estimate ?? 0,
    });
    setEditing(l);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search leads and contacts…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="stages"
        filterOptions={Array.from(new Set(leads.map((lead) => lead.stage ?? "lead"))).map((stage) => ({ value: stage, label: stage.replace("_", " ") }))}
        resultCount={view.items.length} totalCount={leads.length} onClear={view.clear} />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((l) => (
              <TableRow key={l.id} className="group/row">
                <TableCell className="font-medium">{l.client_name}</TableCell>
                <TableCell>{l.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{l.stage}</Badge>
                </TableCell>
                <TableCell>${l.value_estimate?.toLocaleString()}</TableCell>
                <TableCell>{l.contact_email ?? "—"}</TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="lead"
                    className="opacity-0 group-hover/row:opacity-100"
                    onEdit={() => openEdit(l)}
                    onDelete={() => deleteLead(l.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No leads visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit lead"
        saveDisabled={!values.clientName.trim() || !values.companyId}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateLead(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-client">Client name</Label>
          <Input id="edit-lead-client" value={values.clientName} onChange={(e) => setValues((v) => ({ ...v, clientName: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-company">Company</Label>
          <Select value={values.companyId} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v }))}>
            <SelectTrigger id="edit-lead-company" className="w-full">
              <SelectValue>{() => companies.find((c) => c.id === values.companyId)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-contact-name">Contact name</Label>
          <Input
            id="edit-lead-contact-name"
            value={values.contactName}
            onChange={(e) => setValues((v) => ({ ...v, contactName: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-contact-email">Contact email</Label>
          <Input
            id="edit-lead-contact-email"
            type="email"
            value={values.contactEmail}
            onChange={(e) => setValues((v) => ({ ...v, contactEmail: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-stage">Stage</Label>
          <Input id="edit-lead-stage" value={values.stage} onChange={(e) => setValues((v) => ({ ...v, stage: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-lead-value">Value estimate</Label>
          <Input
            id="edit-lead-value"
            type="number"
            value={values.valueEstimate}
            onChange={(e) => setValues((v) => ({ ...v, valueEstimate: Number(e.target.value) }))}
          />
        </div>
      </EditSheet>
    </>
  );
}
