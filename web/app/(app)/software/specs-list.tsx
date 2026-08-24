"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { ListControls, useListView } from "@/components/list-controls";
import { updateProductSpec, deleteProductSpec, type ProductSpecInput } from "@/lib/data/software";

type SpecRow = {
  id: string;
  title: string;
  status: string | null;
  body_md: string | null;
  companies: { name: string } | null;
};

export function SpecsList({ specs }: { specs: SpecRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SpecRow | null>(null);
  const [values, setValues] = useState<ProductSpecInput>({ title: "", status: "draft", bodyMd: "" });

  const view = useListView({
    items: specs,
    searchText: (spec) => [spec.title, spec.status, spec.body_md, spec.companies?.name].filter(Boolean).join(" "),
    filterValue: (spec) => spec.status ?? "draft",
  });

  function openEdit(s: SpecRow) {
    setValues({ title: s.title, status: s.status ?? "draft", bodyMd: s.body_md ?? "" });
    setEditing(s);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search PRDs…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="statuses"
        filterOptions={Array.from(new Set(specs.map((spec) => spec.status ?? "draft"))).map((status) => ({ value: status, label: status.replace("_", " ") }))}
        resultCount={view.items.length} totalCount={specs.length} onClear={view.clear} />

      <div className="flex flex-col gap-2">
        {view.items.map((s) => (
          <div key={s.id} className="group/row rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{s.status}</Badge>
                <RowActionsMenu
                  itemLabel="PRD"
                  className="opacity-0 group-hover/row:opacity-100"
                  onEdit={() => openEdit(s)}
                  onDelete={() => deleteProductSpec(s.id)}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{s.companies?.name ?? "Parent"}</p>
          </div>
        ))}
        {view.items.length === 0 && <p className="text-sm text-muted-foreground">No PRDs yet.</p>}
      </div>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit PRD"
        saveDisabled={!values.title.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateProductSpec(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-spec-title">Title</Label>
          <Input id="edit-spec-title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-spec-status">Status</Label>
          <Input id="edit-spec-status" value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-spec-body">Body</Label>
          <Textarea id="edit-spec-body" value={values.bodyMd} onChange={(e) => setValues((v) => ({ ...v, bodyMd: e.target.value }))} rows={6} />
        </div>
      </EditSheet>
    </>
  );
}
