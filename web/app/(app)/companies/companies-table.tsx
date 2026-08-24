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
import { updateCompany, deleteCompany, type CompanyInput } from "@/lib/data/companies";

type CompanyRow = {
  id: string;
  name: string;
  country: string | null;
  legal_entity_name: string | null;
  status: string | null;
  strategic_priority: number | null;
  risk_score: number | null;
  aliases: string[] | null;
};

const STATUS_OPTIONS = ["active", "planning", "paused", "closed"];

export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [values, setValues] = useState<CompanyInput>({ name: "", country: "", legalEntityName: "", status: "active", aliases: "" });

  const view = useListView({
    items: companies,
    searchText: (company) => [company.name, company.country, company.legal_entity_name, ...(company.aliases || []), company.status].filter(Boolean).join(" "),
    filterValue: (company) => company.status ?? "unknown",
  });

  function openEdit(c: CompanyRow) {
    setValues({
      name: c.name,
      country: c.country ?? "",
      legalEntityName: c.legal_entity_name ?? "",
      status: c.status ?? "active",
      aliases: (c.aliases || []).join(", "),
    });
    setEditing(c);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search companies…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="statuses"
        filterOptions={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
        resultCount={view.items.length} totalCount={companies.length} onClear={view.clear} />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((c) => (
              <TableRow key={c.id} className="group/row">
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.country ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell>{c.strategic_priority}</TableCell>
                <TableCell>{c.risk_score}</TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    itemLabel="company"
                    className="opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100"
                    onEdit={() => openEdit(c)}
                    onDelete={() => deleteCompany(c.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No companies visible — either none exist yet, or RLS is scoping you out
                  of the ones that do.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit company"
        saveDisabled={!values.name.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateCompany(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-name">Name</Label>
          <Input id="edit-company-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-country">Country</Label>
          <Input id="edit-company-country" value={values.country} onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-legal">Legal entity name</Label>
          <Input
            id="edit-company-legal"
            value={values.legalEntityName}
            onChange={(e) => setValues((v) => ({ ...v, legalEntityName: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-aliases">Artifact matching aliases</Label>
          <Input
            id="edit-company-aliases"
            value={values.aliases}
            placeholder="OpenSpot, Brain OS, IQParking"
            onChange={(e) => setValues((v) => ({ ...v, aliases: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">Comma-separated brands, products, abbreviations and client-facing names.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-status">Status</Label>
          <Select value={values.status} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, status: v }))}>
            <SelectTrigger id="edit-company-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EditSheet>
    </>
  );
}
