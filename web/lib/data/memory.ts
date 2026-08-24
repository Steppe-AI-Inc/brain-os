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
  const { error } = await supabase.from("memories").insert({
    fact,
    entity_type: companyId ? "company" : "general",
    entity_id: companyId || null,
    company_id: companyId || null,
    sensitivity: sensitivity as "public" | "internal" | "confidential" | "restricted" | "founder_only",
    confidence: 0.8,
    source_type: "manual_entry",
  });
  if (error) return error.message;

  revalidatePath("/memory");
  return null;
}
