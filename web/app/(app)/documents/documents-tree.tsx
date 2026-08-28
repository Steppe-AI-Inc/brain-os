"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileImage,
  FileSpreadsheet,
  Download,
  Trash2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getDocumentDownloadUrl, deleteDocuments } from "@/lib/data/documents";

type DocumentRow = {
  id: string;
  title: string;
  category: string | null;
  mime_type: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  company_id: string | null;
  department_id: string | null;
  project_id: string | null;
  editable_source_status: string | null;
  created_at: string | null;
  companies: { name: string } | null;
  departments: { name: string } | null;
  projects: { title: string } | null;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string | null }) {
  if (!mime) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mime.startsWith("image/")) return <FileImage className="h-4 w-4 text-muted-foreground" />;
  if (mime.includes("sheet") || mime.includes("csv")) return <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />;
  if (mime === "application/pdf" || mime.startsWith("text/")) return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function DocumentsTree({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tree = useMemo(() => {
    const byCompany = new Map<string, { name: string; docs: DocumentRow[] }>();
    for (const doc of documents) {
      const key = doc.company_id ?? "none";
      const name = doc.companies?.name ?? "No company";
      if (!byCompany.has(key)) byCompany.set(key, { name, docs: [] });
      byCompany.get(key)!.docs.push(doc);
    }
    return Array.from(byCompany.entries())
      .map(([id, v]) => {
        const byCategory = new Map<string, DocumentRow[]>();
        for (const doc of v.docs) {
          const cat = doc.category || "General";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(doc);
        }
        return { id, name: v.name, count: v.docs.length, categories: Array.from(byCategory.entries()) };
      })
      .sort((a, b) => b.count - a.count);
  }, [documents]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadOne(id: string) {
    const result = await getDocumentDownloadUrl(id);
    if (typeof result === "string") {
      setMessage(`Error: ${result}`);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function downloadZip() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/documents/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(`Error: ${body.error || "Download failed."}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brain-os-documents-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    setBusy(true);
    setMessage(null);
    const result = await deleteDocuments(Array.from(selected));
    setBusy(false);
    if (result) {
      setMessage(`Error: ${result}`);
      // A partial result still deleted some real rows — refresh so the tree reflects
      // that, even though selection/message stay for the error.
      router.refresh();
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={downloadZip}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download as ZIP
          </Button>
          <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy} onClick={deleteSelected}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {message && <p className="text-sm text-destructive">{message}</p>}

      {tree.length === 0 && <p className="text-sm text-muted-foreground">No documents visible yet.</p>}

      <Accordion className="rounded-xl border bg-card/80 px-3 backdrop-blur">
        {tree.map((company) => (
          <AccordionItem key={company.id} value={company.id}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                {company.name}
                <Badge variant="secondary" className="text-xs">
                  {company.count}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion className="pl-6">
                {company.categories.map(([cat, docs]) => (
                  <AccordionItem key={cat} value={`${company.id}-${cat}`}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2 text-sm">
                        <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                        {cat}
                        <Badge variant="outline" className="text-xs">
                          {docs.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-1 pl-6">
                        {docs.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                            <Checkbox checked={selected.has(doc.id)} onCheckedChange={() => toggle(doc.id)} />
                            <FileIcon mime={doc.mime_type} />
                            <span className="flex-1 truncate font-medium">{doc.title}</span>
                            {doc.editable_source_status === "missing" && (
                              <Badge variant="destructive" className="gap-1 text-xs">
                                <TriangleAlert className="h-3 w-3" /> Editable source missing
                              </Badge>
                            )}
                            {doc.departments?.name && (
                              <Badge variant="outline" className="text-xs">
                                {doc.departments.name}
                              </Badge>
                            )}
                            {doc.projects?.title && (
                              <Badge variant="outline" className="text-xs">
                                {doc.projects.title}
                              </Badge>
                            )}
                            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                              {formatSize(doc.file_size_bytes)}
                            </span>
                            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "—"}
                            </span>
                            {doc.storage_path && (
                              <Button variant="ghost" size="icon-sm" onClick={() => downloadOne(doc.id)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
