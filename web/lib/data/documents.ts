"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const DOCUMENT_SELECT =
  "id, title, category, sensitivity, summary, mime_type, original_filename, file_size_bytes, storage_path, company_id, department_id, project_id, created_at, companies!documents_company_id_fkey(name), departments(name), projects(title)";

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

    const { error } = await supabase.from("documents").insert({
      title,
      company_id: companyId || null,
      department_id: departmentId || null,
      project_id: projectId || null,
      category,
      storage_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      original_filename: file.name,
      file_size_bytes: file.size,
      sensitivity: "internal",
      uploaded_by_profile_id: profile.id,
    });
    if (error) return error.message;
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
      sensitivity: "internal",
      uploaded_by_profile_id: profile.id,
    });
    if (error) return error.message;
  }

  revalidatePath("/documents");
  return null;
}

export type DocumentInput = { title: string; companyId: string; sensitivity: string; summary: string };

export async function updateDocument(id: string, input: DocumentInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      title: input.title.trim(),
      company_id: input.companyId || null,
      sensitivity: input.sensitivity as "public" | "internal" | "confidential" | "restricted" | "founder_only",
      summary: input.summary.trim() || null,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/documents");
  return null;
}

export async function deleteDocument(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/documents");
  return null;
}

export async function deleteDocuments(ids: string[]) {
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const { error } = await supabase.from("documents").delete().in("id", ids);
  if (error) return error.message;
  revalidatePath("/documents");
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
