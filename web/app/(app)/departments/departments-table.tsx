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
import { EditSheet } from "@/components/edit-sheet";\nimport { ListControls, useListView } from "@/components/list-controls";
import { updateDepartment, deleteDepartment, type DepartmentInput } from "@/lib/data/departments";

type DepartmentRow = {
  id: string;
  name: string;
  company_id: string | null;
  active_goal_count: number;
  companies: { name: string } | null;
};

export function DepartmentsTable({
  departments,
  companies,
}: {
  departments: DepartmentRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [values, setValues] = useState<DepartmentInput>({ name: "", companyId: "" });

  const view = useListView({
    items: departments,
    searchText: (department) => [department.name, department.companies?.name].filter(Boolean).join(" "),
    filterValue: (department) => department.company_id ?? "unassigned",
  });

  function openEdit(d: DepartmentRow) {
    setValues({ name: d.name, companyId: d.company_id ?? "" });
    setEditing(d);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search departments…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="companies"
        filterOptions={companies.map((company) => ({ value: company.id, label: company.name }))}
        resultCount={view.items.length} totalCount={departments.length} onClear={view.clear} />

      <Card className="overflow-hidden border-border/80 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Active goals</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((d) => (
              <TableRow key={d.id} className="group/row">
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={d.active_goal_count > 0 ? "default" : "secondary"}>{d.active_goal_count}</Badge>
                </TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="department"
                    className="opacity-0 group-hover/row:opacity-100"
                    onEdit={() => openEdit(d)}
                    onDelete={() => deleteDepartment(d.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No departments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit department"
        saveDisabled={!values.name.trim() || !values.companyId}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateDepartment(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-dept-name">Name</Label>
          <Input id="edit-dept-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-dept-company">Company</Label>
          <Select value={values.companyId} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v }))}>
            <SelectTrigger id="edit-dept-company" className="w-full">
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
      </EditSheet>
    </>
  );
}
