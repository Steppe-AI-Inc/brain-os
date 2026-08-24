"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, CloudUpload, Download, RefreshCw } from "lucide-react";
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
import {
  updateDocument,
  deleteDocument,
  queueDocumentDriveBackup,
  reanalyzeArtifact,
  type DocumentInput,
} from "@/lib/data/documents";

const SENSITIVITY_OPTIONS = ["public", "internal", "confidential", "restricted", "founder_only"];
const ANALYSIS_OPTIONS = ["pending", "processing", "ready", "needs_review", "failed"];

type DocumentRow = {
  id: string;
  title: string;
  sensitivity: string | null;
  summary: string | null;
  analysis_summary: string | null;
  analysis_status: string | null;
  analysis_error: string | null;
  analyzed_at: string | null;
  company_match_status: string | null;
  company_match_confidence: number | null;
  company_match_reason: string | null;
  suggested_company_id: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  company_id: string | null;
  category: string | null;
  mime_type: string | null;
  storage_path: string | null;
  created_at: string | null;
  companies: { name: string } | null;
};

function analysisVariant(status: string | null) {
  if (status === "ready") return "default" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

export function DocumentsTable({
  documents,
  companies,
}: {
  documents: DocumentRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [values, setValues] = useState<DocumentInput>({
    title: "",
    companyId: "",
    sensitivity: "internal",
    summary: "",
  });

  const view = useListView({
    items: documents,
    searchText: (document) => [
      document.title,
      document.original_filename,
      document.summary,
      document.analysis_summary,
      document.analysis_status,
      document.company_match_reason,
      document.companies?.name,
    ].filter(Boolean).join(" "),
    filterValue: (document) => document.analysis_status ?? "pending",
  });

  function openEdit(document: DocumentRow) {
    setValues({
      title: document.title,
      companyId: document.company_id ?? "",
      sensitivity: document.sensitivity ?? "internal",
      summary: document.analysis_summary ?? document.summary ?? "",
    });
    setEditing(document);
  }

  return (
    <>
      <ListControls
        query={view.query}
        onQueryChange={view.setQuery}
        searchPlaceholder="Search artifacts, clients, summaries and companies…"
        filter={view.filter}
        onFilterChange={view.setFilter}
        filterLabel="analysis status"
        filterOptions={ANALYSIS_OPTIONS.map((status) => ({
          value: status,
          label: status.replaceAll("_", " "),
        }))}
        resultCount={view.items.length}
        totalCount={documents.length}
        onClear={view.clear}
      />

      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artifact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Analysis</TableHead>
              <TableHead>Company match</TableHead>
              <TableHead>Knowledge summary</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.items.map((document) => (
              <TableRow key={document.id} className="group/row">
                <TableCell>
                  <div className="font-medium">{document.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {document.category?.replaceAll("_", " ") || "general"} · {document.original_filename || (document.storage_path ? "stored file" : "indexed text")}
                    {document.file_size_bytes ? " · " + Math.ceil(document.file_size_bytes / 1024).toLocaleString() + " KB" : ""}
                  </div>
                </TableCell>
                <TableCell>{document.companies?.name ?? "Needs assignment"}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={analysisVariant(document.analysis_status)}>
                      {(document.analysis_status || "pending").replaceAll("_", " ")}
                    </Badge>
                    {document.analysis_error && (
                      <span className="max-w-52 truncate text-[10px] text-amber-700" title={document.analysis_error}>
                        {document.analysis_error}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={document.company_match_status === "review_needed" ? "destructive" : "outline"}>
                      {(document.company_match_status || "unconfirmed").replaceAll("_", " ")}
                    </Badge>
                    {document.company_match_confidence != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(Number(document.company_match_confidence) * 100)}% confidence
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {document.analysis_summary || document.summary || "Awaiting analysis"}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <form action={reanalyzeArtifact}>
                      <input type="hidden" name="document_id" value={document.id} />
                      <button type="submit" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Run private local analysis again" aria-label={"Re-analyze " + document.title + " locally"}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </form>
                    <form action={reanalyzeArtifact}>
                      <input type="hidden" name="document_id" value={document.id} />
                      <input type="hidden" name="confirm_external_ai" value="yes" />
                      <button
                        type="submit"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Analyze with OpenAI (sends this artifact to the configured external API)"
                        aria-label={"Analyze " + document.title + " with external AI"}
                        onClick={(event) => {
                          if (!window.confirm("This will temporarily send this private artifact to the configured OpenAI API for analysis. Continue?")) event.preventDefault();
                        }}
                      >
                        <BrainCircuit className="h-3.5 w-3.5" />
                      </button>
                    </form>
                    {document.storage_path && (
                      <a href={"/documents/" + document.id + "/download"} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Download secure file" aria-label={"Download " + document.title}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {document.storage_path && (
                      <form action={queueDocumentDriveBackup}>
                        <input type="hidden" name="document_id" value={document.id} />
                        <button type="submit" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Queue Google Drive backup" aria-label={"Queue Google Drive backup for " + document.title}>
                          <CloudUpload className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    )}
                    <RowActionsMenu itemLabel="artifact" className="opacity-70 group-hover/row:opacity-100" onEdit={() => openEdit(document)} onDelete={() => deleteDocument(document.id)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">No artifacts match this view.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Review artifact"
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
          <Input id="edit-doc-title" value={values.title} onChange={(event) => setValues((value) => ({ ...value, title: event.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-company">Confirmed company</Label>
          <Select value={values.companyId} onValueChange={(value: unknown) => typeof value === "string" && setValues((current) => ({ ...current, companyId: value }))}>
            <SelectTrigger id="edit-doc-company" className="w-full">
              <SelectValue>{() => companies.find((company) => company.id === values.companyId)?.name ?? "No company"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No company</SelectItem>
              {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {editing?.company_match_reason && <p className="text-xs text-muted-foreground">{editing.company_match_reason}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-sensitivity">Sensitivity</Label>
          <Select value={values.sensitivity} onValueChange={(value: unknown) => typeof value === "string" && setValues((current) => ({ ...current, sensitivity: value }))}>
            <SelectTrigger id="edit-doc-sensitivity" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SENSITIVITY_OPTIONS.map((sensitivity) => <SelectItem key={sensitivity} value={sensitivity}>{sensitivity.replaceAll("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-doc-summary">Reviewed knowledge summary</Label>
          <Textarea id="edit-doc-summary" value={values.summary} onChange={(event) => setValues((value) => ({ ...value, summary: event.target.value }))} rows={6} />
        </div>
      </EditSheet>
    </>
  );
}
