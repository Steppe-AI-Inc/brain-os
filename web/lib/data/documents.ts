"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultSensitivityForCategory } from "@/lib/data/document-categories";

const DOCUMENT_SELECT =
  "id, title, category, sensitivity, summary, mime_type, original_filename, file_size_bytes, storage_path, company_id, department_id, project_id, editable_source_status, created_at, companies!documents_company_id_fkey(name), departments(name), projects(title)";

// Founder governance doc, section 1: "PDF-only delivery is insufficient for assets that
// should remain editable." These are the categories where a reusable editable source
// actually matters (brochures a successor needs to update, proposal templates, HR/legal
// paperwork) — engineering drawings and financial statements are legitimately PDF-native
// and excluded on purpose.
const CATEGORIES_REQUIRING_EDITABLE_SOURCE = new Set(["Marketing & Brochures", "Proposals & Quotations", "Contracts & Legal", "HR"]);

const EDITABLE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
const DERIVATIVE_ONLY_MIME_TYPES = new Set(["application/pdf"]);

function normalizeTitle(t: string): string {
  return t
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Runs after every upload into a tracked category: an editable file marks itself (and
// any matching-title PDF already on file) as satisfied; a PDF checks for a
// matching-title editable sibling and flags itself 'missing' if none exists.
async function reconcileEditableSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  docId: string,
  companyId: string,
  category: string,
  title: string,
  mimeType: string
) {
  if (!CATEGORIES_REQUIRING_EDITABLE_SOURCE.has(category)) return;
  const isEditable = EDITABLE_MIME_TYPES.has(mimeType);
  const isDerivativeOnly = DERIVATIVE_ONLY_MIME_TYPES.has(mimeType);
  if (!isEditable && !isDerivativeOnly) return;

  const normalized = normalizeTitle(title);
  const { data: siblings } = await supabase
    .from("documents")
    .select("id, title, mime_type")
    .eq("category", category)
    .eq("company_id", companyId)
    .neq("id", docId);

  const matchingSibling = (siblings ?? []).find((s) => normalizeTitle(s.title) === normalized);

  if (isEditable) {
    await supabase.from("documents").update({ editable_source_status: "present" }).eq("id", docId);
    if (matchingSibling && DERIVATIVE_ONLY_MIME_TYPES.has(matchingSibling.mime_type ?? "")) {
      await supabase.from("documents").update({ editable_source_status: "present" }).eq("id", matchingSibling.id);
    }
    return;
  }

  const hasEditableSibling = matchingSibling && EDITABLE_MIME_TYPES.has(matchingSibling.mime_type ?? "");
  await supabase
    .from("documents")
    .update({ editable_source_status: hasEditableSibling ? "present" : "missing" })
    .eq("id", docId);
}

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data;
}

// Real binary file upload (any mime type) to the `documents` Storage bucket — plain-text
// paste is still accepted as an alternative for quick manual notes (no file to attach).
export async function createDocument(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const category = String(formData.get("category") || "").trim() || "General";
  const departmentId = String(formData.get("department_id") || "").trim();
  const projectId = String(formData.get("project_id") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const file = formData.get("file") as File | null;
  const sensitivityOverride = String(formData.get("sensitivity") || "").trim();
  const sensitivity = (sensitivityOverride || defaultSensitivityForCategory(category)) as
    | "public"
    | "internal"
    | "confidential"
    | "restricted"
    | "founder_only";

  if (!title) return "Title is required.";
  if (!file || file.size === 0) {
    if (!text) return "Attach a file or paste text content.";
  } else if (!companyId) {
    // Storage write RLS is scoped by the company folder the upload lands in
    // (is_company_manager(company_id)) — an upload with no company can't be read back
    // by anyone except founder/admin, so require it up front instead of a silent gap.
    return "Pick a company before attaching a file.";
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  if (file && file.size > 0) {
    const storagePath = `${companyId || "unassigned"}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) return uploadError.message;

    const mimeType = file.type || "application/octet-stream";
    const { data: inserted, error } = await supabase
      .from("documents")
      .insert({
        title,
        company_id: companyId || null,
        department_id: departmentId || null,
        project_id: projectId || null,
        category,
        storage_path: storagePath,
        mime_type: mimeType,
        original_filename: file.name,
        file_size_bytes: file.size,
        sensitivity,
        uploaded_by_profile_id: profile.id,
      })
      .select("id")
      .single();
    if (error) return error.message;
    if (inserted && companyId) await reconcileEditableSource(supabase, inserted.id, companyId, category, title, mimeType);
  } else {
    const { error } = await supabase.from("documents").insert({
      title,
      company_id: companyId || null,
      department_id: departmentId || null,
      project_id: projectId || null,
      category,
      mime_type: "text/plain",
      extracted_text: text,
      summary: text.slice(0, 200),
      sensitivity,
      uploaded_by_profile_id: profile.id,
    });
    if (error) return error.message;
  }

  revalidatePath("/documents");
  return null;
}

export type DocumentInput = { title: string; companyId: string; sensitivity: string; summary: string };

// All three check affected row count, not just `error` — documents_write_scope RLS
// means a caller outside the company's manager tier silently matches 0 rows rather than
// erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateDocument(id: string, input: DocumentInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({
      title: input.title.trim(),
      company_id: input.companyId || null,
      sensitivity: input.sensitivity as "public" | "internal" | "confidential" | "restricted" | "founder_only",
      summary: input.summary.trim() || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this document may no longer exist or you may not have access to it.";
  revalidatePath("/documents");
  return null;
}

export async function deleteDocument(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this document may no longer exist or you may not have access to it.";
  revalidatePath("/documents");
  return null;
}

export async function deleteDocuments(ids: string[]) {
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().in("id", ids).select("id");
  if (error) return error.message;
  const deletedCount = data?.length || 0;
  if (deletedCount > 0) revalidatePath("/documents");
  if (deletedCount < ids.length) {
    return `Only ${deletedCount} of ${ids.length} document(s) were deleted — the rest may no longer exist or you may not have access to them.`;
  }
  return null;
}

export async function getDocumentDownloadUrl(id: string): Promise<string | { url: string }> {
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  if (error || !doc) return "Document not found.";
  if (!doc.storage_path) return "This document has no attached file (it was created as pasted text).";
  const { data, error: signError } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
  if (signError || !data) return signError?.message || "Failed to create a download link.";
  return { url: data.signedUrl };
}
