"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getMemories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, fact, entity_type, sensitivity, confidence, created_at, companies(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function getMemoriesForEntity(entityType: string, entityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, fact, sensitivity, confidence, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function createMemory(_prevState: string | null, formData: FormData) {
  const fact = String(formData.get("fact") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const sensitivity = String(formData.get("sensitivity") || "internal");
  if (!fact) return "Fact is required.";

  const supabase = await createClient();

  // Best-effort: a manually created memory without an embedding still saves fine, it's
  // just unsearchable by the chat's semantic retrieval until a later backfill — the
  // embed-text call must never block a human from saving a fact they typed themselves.
  let embedding: number[] | undefined;
  try {
    const { data } = await supabase.functions.invoke("embed-text", { body: { text: fact } });
    if (Array.isArray(data?.embedding)) embedding = data.embedding;
  } catch {
    // ignore — embedding stays unset
  }

  const { error } = await supabase.from("memories").insert({
    fact,
    entity_type: companyId ? "company" : "general",
    entity_id: companyId || null,
    company_id: companyId || null,
    sensitivity: sensitivity as "public" | "internal" | "confidential" | "restricted" | "founder_only",
    confidence: 0.8,
    source_type: "manual_entry",
    // pgvector columns round-trip as text over PostgREST — "[0.1,0.2,...]", not a raw
    // JS array.
    ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
  });
  if (error) return error.message;

  revalidatePath("/memory");
  return null;
}
