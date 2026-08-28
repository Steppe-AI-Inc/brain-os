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

export type PersonInput = {
  fullName: string;
  email: string;
  roleTitle: string;
  companyId: string | null;
};

// Both check affected row count, not just `error` — people_write_manager RLS means a
// caller outside the company's manager tier silently matches 0 rows rather than
// erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updatePerson(id: string, input: PersonInput) {
  if (!input.fullName.trim()) return "Full name is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({
      full_name: input.fullName.trim(),
      email: input.email.trim() || null,
      role_title: input.roleTitle.trim() || null,
      company_id: input.companyId,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this person may no longer exist or you may not have access to them.";
  revalidatePath("/people");
  return null;
}

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this person may no longer exist or you may not have access to them.";
  revalidatePath("/people");
  return null;
}
