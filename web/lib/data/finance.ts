"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Multi-org milestone: the pre-existing optional company filter is now the canonical
// activeOrganizationId parameter, same pattern as getPeople() in lib/data/people.ts —
// a query-shape filter only, RLS remains the sole authorization boundary either way.
export async function getFinancialReports(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("financial_reports")
    .select(
      "id, company_id, period, revenue, expenses, net_income, cash_position, health_status, notable_flags, summary, created_at, companies(name, status)"
    )
    .order("created_at", { ascending: false });
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const VALID_HEALTH = new Set(["healthy", "watch", "at_risk", "unknown"]);

// The "one go pass" pipeline: upload -> save the artifact -> AI CFO/Bookkeeper analysis
// -> report -> dashboard, one Server Action, no manual steps in between. Every failure
// path returns a plain error string (existing_prevState pattern) rather than throwing,
// same convention as every other create-form action in this app.
export async function uploadFinancialDocument(_prevState: string | null, formData: FormData): Promise<string | null> {
  const file = formData.get("file") as File | null;
  const companyId = String(formData.get("company_id") || "").trim();
  const period = String(formData.get("period") || "").trim();
  if (!file || file.size === 0) return "Choose a file to upload.";
  if (!companyId) return "Pick a company.";

  const mimeType = file.type || "application/octet-stream";
  const isPdf = mimeType === "application/pdf";
  const isText = mimeType.startsWith("text/") || mimeType === "application/csv" || /\.(csv|txt)$/i.test(file.name);
  if (!isPdf && !isText) return "Only PDF and plain text/CSV files are supported right now.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).single();
  if (!company) return "Company not found.";

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const storagePath = `${companyId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file, {
    contentType: mimeType,
  });
  if (uploadError) return uploadError.message;

  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      title: file.name,
      category: "financial_statement",
      storage_path: storagePath,
      mime_type: mimeType,
      sensitivity: "confidential",
      uploaded_by_profile_id: profile.id,
    })
    .select("id")
    .single();
  if (docError || !docRow) return docError?.message || "Failed to save the uploaded document.";

  const { data: analysis, error: analysisError } = await supabase.functions.invoke("analyze-financial-document", {
    body: { base64, mimeType: isPdf ? "application/pdf" : "text/plain", companyName: company.name, period },
  });
  if (analysisError) {
    const context = (analysisError as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    return detail?.error || analysisError.message || "Analysis failed.";
  }
  const result = analysis?.result;
  if (!result) return analysis?.error || "Analysis returned no result.";

  const healthStatus = typeof result.healthStatus === "string" && VALID_HEALTH.has(result.healthStatus) ? result.healthStatus : "unknown";

  const { error: reportError } = await supabase.from("financial_reports").insert({
    document_id: docRow.id,
    company_id: companyId,
    period: period || null,
    revenue: typeof result.revenue === "number" ? result.revenue : null,
    expenses: typeof result.expenses === "number" ? result.expenses : null,
    net_income: typeof result.netIncome === "number" ? result.netIncome : null,
    cash_position: typeof result.cashPosition === "number" ? result.cashPosition : null,
    health_status: healthStatus,
    notable_flags: Array.isArray(result.notableFlags) ? result.notableFlags : [],
    summary: typeof result.summary === "string" ? result.summary : null,
    created_by_profile_id: profile.id,
  });
  if (reportError) return reportError.message;

  // Fold into the RAG pipeline shipped earlier this session: a real embedding so a later
  // chat question like "how's CLIX GPS doing financially" retrieves this via
  // match_memories. Best-effort — a missing memory row must never fail the upload.
  if (typeof result.summary === "string" && result.summary.trim()) {
    try {
      const { data: embedData } = await supabase.functions.invoke("embed-text", { body: { text: result.summary } });
      const embedding = Array.isArray(embedData?.embedding) ? (embedData.embedding as number[]) : null;
      await supabase.from("memories").insert({
        fact: result.summary,
        entity_type: "company",
        entity_id: companyId,
        company_id: companyId,
        sensitivity: "confidential",
        confidence: 0.9,
        source_type: "financial_report",
        source_id: docRow.id,
        created_by_profile_id: profile.id,
        ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
      });
    } catch {
      // ignore — the financial report itself already saved successfully
    }
  }

  revalidatePath("/finance");
  return null;
}
