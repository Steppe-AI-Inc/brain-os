"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getEngineeringDrawings(companyId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("engineering_drawings")
    .select("id, company_id, title, description, svg_content, dimensions_summary, notes, created_at, companies(name)")
    .order("created_at", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// The "engineering factory" ask, v1: a plain-language description in, a real labeled
// top-down SVG technical diagram out — see supabase/functions/generate-technical-drawing
// for why this is honest scope (not CAD-file output) rather than a shortcut.
export async function generateEngineeringDrawing(_prevState: string | null, formData: FormData): Promise<string | null> {
  const description = String(formData.get("description") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  if (!description) return "Describe what you want drawn.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const { data: gen, error: genError } = await supabase.functions.invoke("generate-technical-drawing", {
    body: { description },
  });
  if (genError) {
    // The SDK's top-level error.message is a generic "non-2xx status code" — the real
    // reason is in the response body it captured, same fix needed as the finance pipeline
    // would otherwise hit too.
    const context = (genError as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    return detail?.error || genError.message || "Drawing generation failed.";
  }
  const result = gen?.result;
  if (!result?.svg) return gen?.error || "Drawing generation returned no result.";

  const { error: insertError } = await supabase.from("engineering_drawings").insert({
    company_id: companyId || null,
    title: typeof result.title === "string" && result.title.trim() ? result.title.trim() : description.slice(0, 80),
    description,
    svg_content: result.svg,
    dimensions_summary: typeof result.dimensionsSummary === "string" ? result.dimensionsSummary : null,
    notes: typeof result.notes === "string" ? result.notes : null,
    created_by_profile_id: profile.id,
  });
  if (insertError) return insertError.message;

  revalidatePath("/engineering");
  return null;
}

export async function deleteEngineeringDrawing(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("engineering_drawings").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/engineering");
  return null;
}
