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
  // Clearing "the rest" legitimately affects 0 rows when this is the only provider —
  // that's not a failure, so only the targeted activation below is checked.
  const { error: clearError } = await supabase
    .from("ai_providers")
    .update({ is_active: false })
    .neq("id", id);
  if (clearError) return clearError.message;

  // Checks affected row count, not just `error` — ai_providers_update_founder_only RLS
  // means a non-founder caller's update silently matches 0 rows rather than erroring.
  // Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
  const { data, error } = await supabase.from("ai_providers").update({ is_active: true }).eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this provider may no longer exist or you may not have access to change it.";

  revalidatePath("/settings");
  revalidatePath("/chat");
  return null;
}

export async function deleteAiProvider(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_providers").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this provider may no longer exist or you may not have access to it.";

  revalidatePath("/settings");
  return null;
}
