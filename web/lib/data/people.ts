"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getPeople() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, full_name, email, role_title, company_id, active, companies(name)")
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function createPerson(_prevState: string | null, formData: FormData) {
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const roleTitle = String(formData.get("role_title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  if (!fullName) return "Full name is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("people").insert({
    full_name: fullName,
    email: email || null,
    role_title: roleTitle || null,
    company_id: companyId || null,
  });
  if (error) return error.message;

  revalidatePath("/people");
  return null;
}
