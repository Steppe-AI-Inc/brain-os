"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { ListControls, useListView } from "@/components/list-controls";
import { updatePerson, deletePerson, type PersonInput } from "@/lib/data/people";

type PersonRow = {
  id: string;
  full_name: string;
  email: string | null;
  role_title: string | null;
  company_id: string | null;
  companies: { name: string } | null;
};

const EMPTY: PersonInput = { fullName: "", email: "", roleTitle: "", companyId: null };

export function PeopleTable({
  people,
  companies,
}: {
  people: PersonRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [values, setValues] = useState<PersonInput>(EMPTY);

  const view = useListView({
    items: people,
    searchText: (person) => [person.full_name, person.role_title, person.email, person.companies?.name].filter(Boolean).join(" "),
    filterValue: (person) => person.company_id ?? "unassigned",
  });

  function openEdit(p: PersonRow) {
    setValues({
      fullName: p.full_name,
      email: p.email ?? "",
      roleTitle: p.role_title ?? "",
      companyId: p.company_id,
    });
    setEditing(p);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search people, roles, or email…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="companies"
        filterOptions={[...companies.map((company) => ({ value: company.id, label: company.name })), { value: "unassigned", label: "Unassigned" }]}
        resultCount={view.items.length} totalCount={people.length} onClear={view.clear} />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((p) => (
              <TableRow key={p.id} className="group/row">
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell>{p.role_title ?? "—"}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>{p.email ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    itemLabel="person"
                    className="opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100"
                    onEdit={() => openEdit(p)}
                    onDelete={() => deletePerson(p.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No people visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit person"
        saveDisabled={!values.fullName.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updatePerson(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-name">Full name</Label>
          <Input id="edit-person-name" value={values.fullName} onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-role">Role title</Label>
          <Input id="edit-person-role" value={values.roleTitle} onChange={(e) => setValues((v) => ({ ...v, roleTitle: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-email">Email</Label>
          <Input id="edit-person-email" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-company">Company</Label>
          <Select
            value={values.companyId ?? "none"}
            onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v === "none" ? null : v }))}
          >
            <SelectTrigger id="edit-person-company" className="w-full">
              <SelectValue>
                {() => companies.find((c) => c.id === values.companyId)?.name ?? "No company"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No company</SelectItem>
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
