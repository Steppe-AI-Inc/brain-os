"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MODEL_CATALOG } from "@/lib/usage/pricing";

async function adminAccessError(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return "Sign in to manage AI providers.";
  const { data: profile } = await supabase.from("profiles").select("role").eq("auth_user_id", user.id).single();
  if (!profile || !["founder", "holding_admin"].includes(profile.role)) return "Founder or holding admin access required.";
  return null;
}

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
  if (!MODEL_CATALOG.some((entry) => entry.provider === provider && entry.model === model)) return "Select a supported provider and model.";
  if (label.length > 120) return "Label must be 120 characters or fewer.";

  const supabase = await createClient();
  const denied = await adminAccessError(supabase);
  if (denied) return denied;
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
  const denied = await adminAccessError(supabase);
  if (denied) return denied;
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

  return setActiveProvider(targetId);
}

async function checkConnection(id: string, activate: boolean) {
  const supabase = await createClient();
  const denied = await adminAccessError(supabase);
  if (denied) return { ok: false, message: denied };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: "Sign in before testing a model." };
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sem-ai-provider-test`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, activate }),
        signal: AbortSignal.timeout(65_000),
        cache: "no-store",
      }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      return { ok: false, message: response.status === 404
        ? "Connection-test backend is unavailable or this provider no longer exists. Check the deployment."
        : typeof data?.error === "string" ? data.error : "Connection test failed. Current model unchanged." };
    }
    if (activate && data.activated !== true) return { ok: false, message: "Model was tested but not activated. Current model unchanged." };
    return { ok: true, message: `Connection and JSON response passed (${Math.round(data.latencyMs)} ms). This tests connectivity, not business-task quality.` };
  } catch {
    return { ok: false, message: "Connection test could not finish. Refresh to check the active model before retrying." };
  }
}

export async function testAiProviderConnection(id: string) {
  return checkConnection(id, false);
}

/** Probe first; the database switch and audit event commit atomically. */
export async function setActiveProvider(id: string) {
  const result = await checkConnection(id, true);
  if (!result.ok) return result.message;
  revalidatePath("/settings");
  revalidatePath("/chat");
  return null;
}

export async function deleteAiProvider(id: string) {
  const supabase = await createClient();
  const denied = await adminAccessError(supabase);
  if (denied) return denied;
  const { data, error } = await supabase.from("ai_providers").delete().eq("id", id).eq("is_active", false).select("id");
  if (error) return error.message;
  if (!data?.length) return "Switch to another model before removing the active provider, or check your access.";

  revalidatePath("/settings");
  return null;
}
