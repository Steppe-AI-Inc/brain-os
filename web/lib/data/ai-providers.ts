"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MODEL_CATALOG } from "@/lib/usage/pricing";

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

/**
 * Activate one of Brain OS's reviewed catalog models.
 *
 * The catalog is the allow-list. Provider credentials never enter this table or the
 * browser; they remain in Supabase Edge Function secrets.
 */
export async function activateCatalogModel(provider: string, model: string) {
  const allowed = MODEL_CATALOG.find(
    (candidate) => candidate.provider === provider && candidate.model === model
  );
  if (!allowed) return "That model is not in the supported Brain OS catalog.";

  const supabase = await createClient();
  const { data: existing, error: findError } = await supabase
    .from("ai_providers")
    .select("id")
    .eq("provider", allowed.provider)
    .eq("model", allowed.model)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) return findError.message;

  let targetId = existing?.id;
  if (!targetId) {
    const { data: created, error: createError } = await supabase
      .from("ai_providers")
      .insert({
        provider: allowed.provider,
        model: allowed.model,
        label: allowed.label,
        is_active: false,
      })
      .select("id")
      .single();
    if (createError) return createError.message;
    targetId = created.id;
  }

  const { error: clearError } = await supabase
    .from("ai_providers")
    .update({ is_active: false })
    .neq("id", targetId);
  if (clearError) return clearError.message;

  const { error: activateError } = await supabase
    .from("ai_providers")
    .update({ is_active: true, label: allowed.label })
    .eq("id", targetId);
  if (activateError) return activateError.message;

  revalidatePath("/settings");
  revalidatePath("/chat");
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
