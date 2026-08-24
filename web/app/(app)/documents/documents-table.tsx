"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { ListControls, useListView } from "@/components/list-controls";
import { updateDocument, deleteDocument, queueDocumentDriveBackup, type DocumentInput } from "@/lib/data/documents";

const SENSITIVITY_OPTIONS = ["public", "internal", "confidential", "restricted", "founder_only"];

type DocumentRow = {
  id: string;
  title: string;
  sensitivity: string | null;
  summary: string | null;
  company_id: string | null;
  category: string | null;
  mime_type: string | null;
  storage_path: string | null;
  created_at: string | null;
  companies: { name: string } | null;
};

export function DocumentsTable({
  documents,
  companies,
}: {
  documents: DocumentRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [values, setValues] = useState<DocumentInput>({ title: "", companyId: "", sensitivity: "internal", summary: "" });

  const view = useListView({
    items: documents,
    searchText: (document) => [document.title, document.summary, document.sensitivity, document.companies?.name].filter(Boolean).join(" "),
    filterValue: (document) => document.sensitivity ?? "internal",
  });

  function openEdit(d: DocumentRow) {
    setValues({
      title: d.title,
      companyId: d.company_id ?? "",
      sensitivity: d.sensitivity ?? "internal",
      summary: d.summary ?? "",
    });
    setEditing(d);
  }

  return (
    <>
      <ListControls query={view.query} onQueryChange={view.setQuery} searchPlaceholder="Search documents and summaries…"
        filter={view.filter} onFilterChange={view.setFilter} filterLabel="sensitivity"
        filterOptions={SENSITIVITY_OPTIONS.map((sensitivity) => ({ value: sensitivity, label: sensitivity.replace("_", " ") }))}
        resultCount={view.items.length} totalCount={documents.length} onClear={view.clear} />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((d) => (
              <TableRow key={d.id} className="group/row">
                <TableCell>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.category?.replaceAll("_", " ") || "general"} · {d.storage_path ? "stored file" : "indexed text"}
                  </div>
                </TableCell>
                <TableCell>{d.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{d.sensitivity}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{d.summary}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {d.storage_path && (
                      <a
                        href={`/documents/${d.id}/download`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Download secure file"
                        aria-label={`Download ${d.title}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {d.storage_path && (
                      <form action={queueDocumentDriveBackup}>
                        <input type="hidden" name="document_id" value={d.id} />
                        <button
                          type="submit"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Queue Google Drive backup"
                          aria-label={`Queue Google Drive backup for ${d.title}`}
                        >
                          <CloudUpload className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    )}
                    <RowActionsMenu
                      itemLabel="document"
                      className="opacity-70 group-hover/row:opacity-100"
                      onEdit={() => openEdit(d)}
                      onDelete={() => deleteDocument(d.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No documents visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit document"
        saveDisabled={!values.title.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateDocument(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-title">Title</Label>
          <Input id="edit-doc-title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-company">Company</Label>
          <Select value={values.companyId} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v }))}>
            <SelectTrigger id="edit-doc-company" className="w-full">
              <SelectValue>
                {() => companies.find((c) => c.id === values.companyId)?.name ?? "No company"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No company</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-sensitivity">Sensitivity</Label>
          <Select
            value={values.sensitivity}
            onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, sensitivity: v }))}
          >
            <SelectTrigger id="edit-doc-sensitivity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENSITIVITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-summary">Summary</Label>
          <Textarea id="edit-doc-summary" value={values.summary} onChange={(e) => setValues((v) => ({ ...v, summary: e.target.value }))} rows={4} />
        </div>
      </EditSheet>
    </>
  );
}
