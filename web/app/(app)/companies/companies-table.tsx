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
import { updateCompany, archiveCompany, type CompanyInput } from "@/lib/data/companies";

type CompanyRow = {
  id: string;
  name: string;
  country: string | null;
  legal_entity_name: string | null;
  status: string | null;
  organization_type: string | null;
  strategic_priority: number | null;
  risk_score: number | null;
};

const STATUS_OPTIONS = ["active", "planning", "paused", "closed"];
const ORGANIZATION_TYPES = ["legal_entity", "holding_company", "subsidiary", "business_unit", "brand", "department", "country_operation"];
const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  legal_entity: "Legal entity",
  holding_company: "Holding company",
  subsidiary: "Subsidiary",
  business_unit: "Business unit",
  brand: "Brand",
  department: "Department",
  country_operation: "Country operation",
};

export function CompaniesTable({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [values, setValues] = useState<CompanyInput>({ name: "", country: "", legalEntityName: "", status: "active", organizationType: "legal_entity" });

  function openEdit(c: CompanyRow) {
    setValues({
      name: c.name,
      country: c.country ?? "",
      legalEntityName: c.legal_entity_name ?? "",
      status: c.status ?? "active",
      organizationType: c.organization_type ?? "legal_entity",
    });
    setEditing(c);
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id} className="group/row">
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant={!c.organization_type || c.organization_type === "legal_entity" ? "default" : "outline"}>
                    {ORGANIZATION_TYPE_LABELS[c.organization_type ?? "legal_entity"] ?? c.organization_type}
                  </Badge>
                </TableCell>
                <TableCell>{c.country ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell>{c.strategic_priority}</TableCell>
                <TableCell>{c.risk_score}</TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="company"
                    className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                    onEdit={() => openEdit(c)}
                    onDelete={() => archiveCompany(c.id)}
                    deletingLabel="Archiving…"
                    deleteDescription="The company is archived, not destroyed — nothing attached to it (tasks, projects, documents, org relationships) is touched, and you can restore it from Companies → Archived at any time."
                  />
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-company-org-type">Type</Label>
          <Select
            value={values.organizationType}
            onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, organizationType: v }))}
          >
            <SelectTrigger id="edit-company-org-type" className="w-full">
              <SelectValue>{() => ORGANIZATION_TYPE_LABELS[values.organizationType] ?? values.organizationType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORGANIZATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ORGANIZATION_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Business unit / brand / department / subsidiary — anything that isn&apos;t a real
            registered legal company. Use chat to set which company it sits under
            (&quot;X is a business unit of Y&quot;).
          </p>
        </div>
      </EditSheet>
    </>
  );
}
