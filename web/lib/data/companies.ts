"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getCompanies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, country, legal_entity_name, status, strategic_priority, risk_score")
    .order("strategic_priority", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCompany(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const country = String(formData.get("country") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) return "Company name is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({
    name,
    country: country || null,
    description: description || null,
  });
  if (error) return error.message;

  revalidatePath("/companies");
  return null;
}
