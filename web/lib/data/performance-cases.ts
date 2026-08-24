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

async function currentIdentity() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Your session expired. Please sign in again.");

  const { data: profileId, error: profileError } = await supabase.rpc("current_profile_id");
  if (profileError || !profileId) throw new Error("No Brain OS profile is linked to this account.");
  return { supabase, user, profileId };
}

export async function getPerformanceCases() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_cases")
    .select(
      "id, company_id, person_id, replacement_person_id, title, country, role_title, status, rating, summary, start_date, review_date, decision, created_at, updated_at, closed_at, companies(id,name), people!performance_cases_person_id_fkey(id,full_name,role_title,email,active), replacement:people!performance_cases_replacement_person_id_fkey(id,full_name,role_title,email,active)"
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPerformanceCaseDetail(caseId: string | null) {
  if (!caseId) return null;
  const supabase = await createClient();

  const [caseResult, eventResult, documentResult, taskResult, approvalResult] = await Promise.all([
    supabase
      .from("performance_cases")
      .select(
        "id, company_id, person_id, replacement_person_id, title, country, role_title, status, rating, summary, expectations, start_date, review_date, decision, created_at, updated_at, closed_at, companies(id,name), people!performance_cases_person_id_fkey(id,full_name,role_title,email,active), replacement:people!performance_cases_replacement_person_id_fkey(id,full_name,role_title,email,active)"
      )
      .eq("id", caseId)
      .maybeSingle(),
    supabase
      .from("performance_case_events")
      .select("id, event_type, title, details, document_id, task_id, approval_id, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, category, mime_type, storage_path, summary, sensitivity, created_at")
      .eq("performance_case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, description, status, priority, deadline, created_at")
      .eq("performance_case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("approvals")
      .select("id, title, reason, status, domain, risk_level, approval_payload, created_at, decided_at")
      .eq("performance_case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);

  if (caseResult.error) throw caseResult.error;
  if (!caseResult.data) return null;
  if (eventResult.error) throw eventResult.error;
  if (documentResult.error) throw documentResult.error;
  if (taskResult.error) throw taskResult.error;
  if (approvalResult.error) throw approvalResult.error;

  return {
    case: caseResult.data,
    events: eventResult.data,
    documents: documentResult.data,
    tasks: taskResult.data,
    approvals: approvalResult.data,
  };
}

export async function createPerformanceCase(formData: FormData) {
  const companyId = String(formData.get("company_id") || "").trim();
  const personId = String(formData.get("person_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const roleTitle = String(formData.get("role_title") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  const reviewDate = String(formData.get("review_date") || "").trim();

  if (!companyId || !personId || !title) {
    throw new Error("Company, employee and case title are required.");
  }

  const { supabase, profileId } = await currentIdentity();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, company_id, full_name")
    .eq("id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) throw new Error("Employee not found.");
  if (person.company_id && person.company_id !== companyId) {
    throw new Error("The selected employee belongs to a different company.");
  }

  const { data: created, error } = await supabase
    .from("performance_cases")
    .insert({
      company_id: companyId,
      person_id: personId,
      title,
      country: country || null,
      role_title: roleTitle || null,
      summary: summary || null,
      review_date: reviewDate || null,
      created_by_profile_id: profileId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: eventError } = await supabase.from("performance_case_events").insert({
    case_id: created.id,
    event_type: "system",
    title: "Performance case opened",
    details: summary || `Case opened for ${person.full_name}.`,
    created_by_profile_id: profileId,
  });
  if (eventError) throw eventError;

  revalidatePath("/people/cases");
}

export async function addPerformanceCaseNote(formData: FormData) {
  const caseId = String(formData.get("case_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const details = String(formData.get("details") || "").trim();
  const eventType = String(formData.get("event_type") || "note").trim();

  if (!caseId || !title) throw new Error("Case and note title are required.");
  const allowedTypes = new Set(["report", "evidence", "note", "review", "communication", "candidate"]);
  if (!allowedTypes.has(eventType)) throw new Error("Unsupported event type.");

  const { supabase, profileId } = await currentIdentity();
  const { error } = await supabase.from("performance_case_events").insert({
    case_id: caseId,
    event_type: eventType,
    title,
    details: details || null,
    created_by_profile_id: profileId,
  });
  if (error) throw error;
  revalidatePath("/people/cases");
}

export async function uploadPerformanceArtifact(formData: FormData) {
  const caseId = String(formData.get("case_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "performance_report").trim();
  const file = formData.get("file");

  if (!caseId || !title) throw new Error("Case and artifact title are required.");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Artifact exceeds the 25 MB limit.");
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Upload PDF, DOCX, XLSX, TXT, MD, CSV, JSON, PNG, JPEG or WEBP.");
  }

  const { supabase, user, profileId } = await currentIdentity();
  const { data: performanceCase, error: caseError } = await supabase
    .from("performance_cases")
    .select("id, company_id, person_id")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!performanceCase) throw new Error("Performance case not found or access denied.");

  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-160) || "artifact";
  const storagePath = `${performanceCase.company_id}/${user.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const textLike = file.type.startsWith("text/") || file.type === "application/json";
  const extractedText = textLike ? (await file.text()).slice(0, 250_000) : null;
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      company_id: performanceCase.company_id,
      person_id: performanceCase.person_id,
      performance_case_id: performanceCase.id,
      title,
      category,
      storage_path: storagePath,
      mime_type: file.type,
      extracted_text: extractedText,
      summary: extractedText
        ? extractedText.replace(/\s+/g, " ").slice(0, 240)
        : `Stored file: ${file.name}`,
      sensitivity: "confidential",
      uploaded_by_profile_id: profileId,
    })
    .select("id")
    .single();

  if (documentError) {
    await supabase.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
    throw documentError;
  }

  const { error: eventError } = await supabase.from("performance_case_events").insert({
    case_id: performanceCase.id,
    event_type: category === "performance_report" ? "report" : "evidence",
    title: `Artifact received: ${title}`,
    details: `${file.name} · ${Math.ceil(file.size / 1024).toLocaleString()} KB`,
    document_id: document.id,
    created_by_profile_id: profileId,
  });
  if (eventError) throw eventError;

  revalidatePath("/people/cases");
  revalidatePath("/documents");
}

export async function transitionPerformanceCase(formData: FormData) {
  const caseId = String(formData.get("case_id") || "").trim();
  const action = String(formData.get("action") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const deadline = String(formData.get("deadline") || "").trim();
  const candidatePersonId = String(formData.get("candidate_person_id") || "").trim();

  if (!caseId || !action) throw new Error("Case and action are required.");
  const { supabase } = await currentIdentity();
  const { error } = await supabase.rpc("manage_performance_case", {
    p_case_id: caseId,
    p_action: action,
    p_notes: notes || undefined,
    p_deadline: deadline || undefined,
    p_candidate_person_id: candidatePersonId || undefined,
  });
  if (error) throw error;

  revalidatePath("/people/cases");
  revalidatePath("/tasks");
  revalidatePath("/approvals");
}

export async function finalizePerformanceCaseAction(formData: FormData) {
  const caseId = String(formData.get("case_id") || "").trim();
  const action = String(formData.get("action") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const effectiveDate = String(formData.get("effective_date") || "").trim();
  const candidatePersonId = String(formData.get("candidate_person_id") || "").trim();
  const legalReviewConfirmed = formData.get("legal_review_confirmed") === "yes";

  if (!caseId || !action || !effectiveDate) {
    throw new Error("Case, action and effective date are required.");
  }

  const { supabase } = await currentIdentity();
  const { error } = await supabase.rpc("finalize_performance_case_action", {
    p_case_id: caseId,
    p_action: action,
    p_notes: notes,
    p_effective_date: effectiveDate,
    p_legal_review_confirmed: legalReviewConfirmed,
    p_candidate_person_id: candidatePersonId || undefined,
  });
  if (error) throw error;

  revalidatePath("/people/cases");
  revalidatePath("/people");
  revalidatePath("/tasks");
  revalidatePath("/approvals");
}

export async function queueArtifactDriveBackup(formData: FormData) {
  const caseId = String(formData.get("case_id") || "").trim();
  const documentId = String(formData.get("document_id") || "").trim();
  if (!caseId || !documentId) throw new Error("Case and document are required.");

  const { supabase, profileId } = await currentIdentity();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, title, company_id, storage_path")
    .eq("id", documentId)
    .eq("performance_case_id", caseId)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document || !document.storage_path) throw new Error("Stored artifact not found.");

  const { error } = await supabase.from("integration_queue").insert({
    company_id: document.company_id,
    integration: "google_drive",
    action: "backup_private_artifact",
    payload: {
      document_id: document.id,
      title: document.title,
      storage_bucket: ARTIFACT_BUCKET,
      storage_path: document.storage_path,
      performance_case_id: caseId,
    },
    status: "queued",
    created_by_profile_id: profileId,
  });
  if (error) throw error;

  const { error: eventError } = await supabase.from("performance_case_events").insert({
    case_id: caseId,
    event_type: "system",
    title: "Google Drive backup queued",
    details: `${document.title} is queued. It will remain queued until the Google Drive connector is authorized.`,
    document_id: document.id,
    created_by_profile_id: profileId,
  });
  if (eventError) throw eventError;

  revalidatePath("/people/cases");
  revalidatePath("/integrations");
}
