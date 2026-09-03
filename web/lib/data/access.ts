import { createClient } from "@/lib/supabase/server";

// profiles_select_self_or_admin RLS means a non-admin caller only ever gets their own
// row back here — no client-side role check needed to "hide" other users' data, it's
// simply not returned.
export async function getProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, created_at")
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function getMemberships() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_memberships")
    .select("id, role_in_company, active, companies(name, status), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
