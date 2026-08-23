"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getDocuments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, category, sensitivity, summary, created_at, companies(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// No Supabase Storage bucket is provisioned yet, so this stores extracted text directly
// in the documents row rather than a blob reference — real content, real RLS, just no
// binary file storage until a bucket is set up (a Phase 3+ infra addition, not a mock).
export async function createDocument(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const text = String(formData.get("text") || "").trim();
  if (!title) return "Title is required.";
  if (!text) return "Paste or type the document's text content.";

  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    title,
    company_id: companyId || null,
    category: "manual_entry",
    mime_type: "text/plain",
    extracted_text: text,
    summary: text.slice(0, 200),
    sensitivity: "internal",
  });
  if (error) return error.message;

  revalidatePath("/documents");
  return null;
}
