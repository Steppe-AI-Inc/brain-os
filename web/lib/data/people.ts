"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getPeople() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, full_name, email, role_title, company_id, active, profile_id, companies(name)")
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

// Real login-account onboarding: a `people` row is just an HR record, it never grants
// access. This sends a real Supabase invite email, then links the resulting profile back
// onto the person and grants company membership. Uses the service-role client for
// auth.admin.inviteUserByEmail (the one operation RLS can't gate), so unlike every other
// action in this file it does its own founder/admin check up front — RLS alone doesn't
// protect that call.
export async function invitePerson(personId: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: actingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!actingProfile || !["founder", "holding_admin"].includes(actingProfile.role)) {
    return { ok: false, message: "Only the founder or an admin can invite employees." };
  }

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, full_name, email, company_id, profile_id")
    .eq("id", personId)
    .maybeSingle();
  if (personError || !person) return { ok: false, message: "Person not found." };
  if (person.profile_id) return { ok: false, message: `${person.full_name} already has a login account.` };
  if (!person.email) return { ok: false, message: `Add an email for ${person.full_name} before inviting.` };

  const admin = createAdminClient();
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(person.email, {
    data: { full_name: person.full_name },
  });
  if (inviteError) return { ok: false, message: `Invite failed: ${inviteError.message}` };

  const newAuthUserId = inviteData.user?.id;
  if (!newAuthUserId) return { ok: false, message: "Invite sent but no user id came back — check the Supabase dashboard manually." };

  // handle_new_auth_user (schema-v0.7-production-core.sql) fires synchronously on the
  // auth.users insert above, so the profiles row already exists by the time we look.
  const { data: newProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", newAuthUserId)
    .maybeSingle();
  if (!newProfile) {
    return { ok: false, message: `Invite sent to ${person.email}, but no profile was created — check the on_auth_user_created trigger.` };
  }

  const { error: linkError, data: linkedRows } = await supabase
    .from("people")
    .update({ profile_id: newProfile.id })
    .eq("id", personId)
    .select("id");
  if (linkError || !linkedRows?.length) {
    return { ok: false, message: `Invite sent to ${person.email}, but linking the person record failed: ${linkError?.message ?? "no rows updated"}.` };
  }

  if (person.company_id) {
    const { error: memberError } = await supabase.from("company_memberships").insert({
      company_id: person.company_id,
      profile_id: newProfile.id,
      role_in_company: "employee",
    });
    if (memberError) {
      return { ok: false, message: `Invite sent and linked, but company membership failed: ${memberError.message}. Add it manually.` };
    }
  }

  revalidatePath("/people");
  return { ok: true, message: `Invited ${person.full_name} at ${person.email}.` };
}

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this person may no longer exist or you may not have access to them.";
  revalidatePath("/people");
  return null;
}
