"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getAiProviders() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_providers")
    .select("id, provider, label, model, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createAiProvider(_prevState: string | null, formData: FormData) {
  const provider = String(formData.get("provider") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const label = String(formData.get("label") || "").trim() || model;
  if (!provider || !model) return "Provider and model are required.";

  const supabase = await createClient();
  const { error } = await supabase.from("ai_providers").insert({ provider, model, label });
  if (error) return error.message;

  revalidatePath("/settings");
  return null;
}

/** Only one provider is ever active — clear the rest, then activate this one. */
export async function setActiveProvider(id: string) {
  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("ai_providers")
    .update({ is_active: false })
    .neq("id", id);
  if (clearError) return clearError.message;

  const { error } = await supabase.from("ai_providers").update({ is_active: true }).eq("id", id);
  if (error) return error.message;

  revalidatePath("/settings");
  revalidatePath("/chat");
  return null;
}

export async function deleteAiProvider(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_providers").delete().eq("id", id);
  if (error) return error.message;

  revalidatePath("/settings");
  return null;
}
