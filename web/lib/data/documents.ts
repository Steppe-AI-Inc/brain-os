"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ARTIFACT_BUCKET = "company-artifacts";
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, category, sensitivity, summary, created_at, company_id, storage_path, mime_type, performance_case_id, person_id, companies(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function createDocument(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const category = String(formData.get("category") || "general").trim();
  const sensitivity = String(formData.get("sensitivity") || "internal").trim();
  const text = String(formData.get("text") || "").trim();
  const file = formData.get("file");

  if (!title) return "Title is required.";
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !text) return "Upload a file or paste document content.";
  if (hasFile && !companyId) return "Choose a company for private file storage.";

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return "Your session expired. Please sign in again.";

  const { data: profileId, error: profileError } = await supabase.rpc("current_profile_id");
  if (profileError || !profileId) return "No Brain OS profile is linked to this account.";

  let storagePath: string | null = null;
  let mimeType = "text/plain";
  let extractedText = text || null;

  if (hasFile) {
    if (file.size > 25 * 1024 * 1024) return "Artifact exceeds the 25 MB limit.";
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return "Unsupported file type. Upload PDF, DOCX, XLSX, TXT, MD, CSV, JSON, PNG, JPEG or WEBP.";
    }

    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-160) || "artifact";
    storagePath = `${companyId}/${user.id}/${crypto.randomUUID()}-${safeName}`;
    mimeType = file.type;

    const { error: uploadError } = await supabase.storage
      .from(ARTIFACT_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return uploadError.message;

    const textLike = file.type.startsWith("text/") || file.type === "application/json";
    if (textLike) {
      extractedText = [text, (await file.text()).slice(0, 250_000)].filter(Boolean).join("\n\n");
    }
  }

  const summarySource = extractedText || (hasFile ? `Stored file: ${file.name}` : title);
  const { error } = await supabase.from("documents").insert({
    title,
    company_id: companyId || null,
    category,
    storage_path: storagePath,
    mime_type: mimeType,
    extracted_text: extractedText,
    summary: summarySource.replace(/\s+/g, " ").slice(0, 240),
    sensitivity: sensitivity as "public" | "internal" | "confidential" | "restricted" | "founder_only",
    uploaded_by_profile_id: profileId,
  });

  if (error) {
    if (storagePath) await supabase.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
    return error.message;
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
  const { data: document, error: findError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (findError) return findError.message;

  if (document?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(ARTIFACT_BUCKET)
      .remove([document.storage_path]);
    if (storageError) return storageError.message;
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/documents");
  revalidatePath("/people/cases");
  return null;
}

export async function queueDocumentDriveBackup(formData: FormData): Promise<void> {
  const documentId = String(formData.get("document_id") || "").trim();
  if (!documentId) throw new Error("Document is required.");

  const supabase = await createClient();
  const { data: profileId, error: profileError } = await supabase.rpc("current_profile_id");
  if (profileError || !profileId) {
    throw new Error("No Brain OS profile is linked to this account.");
  }

  const { data: document, error: findError } = await supabase
    .from("documents")
    .select("id, title, company_id, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (findError) throw findError;
  if (!document?.storage_path) {
    throw new Error("This document has no stored file to back up.");
  }

  const { error } = await supabase.from("integration_queue").insert({
    company_id: document.company_id,
    integration: "google_drive",
    action: "backup_private_artifact",
    payload: {
      document_id: document.id,
      title: document.title,
      storage_bucket: ARTIFACT_BUCKET,
      storage_path: document.storage_path,
    },
    status: "queued",
    created_by_profile_id: profileId,
  });
  if (error) throw error;

  revalidatePath("/integrations");
}

export type ChatTextAttachmentInput = {
  title: string;
  text: string;
  mimeType: string;
};

export async function saveChatTextAttachment(input: ChatTextAttachmentInput): Promise<string | null> {
  const title = input.title.trim().slice(0, 180);
  const text = input.text.trim();
  if (!title) return "Attachment title is required.";
  if (!text) return "Attachment contains no readable text.";

  const supabase = await createClient();
  const { data: profileId } = await supabase.rpc("current_profile_id");
  const { error } = await supabase.from("documents").insert({
    title,
    category: "chat_attachment",
    mime_type: input.mimeType || "text/plain",
    extracted_text: text,
    summary: text.replace(/\s+/g, " ").slice(0, 240),
    sensitivity: "internal",
    uploaded_by_profile_id: profileId || null,
  });
  if (error) return error.message;

  revalidatePath("/documents");
  return null;
}
