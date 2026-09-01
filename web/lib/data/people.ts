"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// BUG-001 (Work-PC QA campaign C001): live-confirmed on this exact surface - a person
// whose company was archived rendered as an ordinary active row, no indication at all
// (verbatim the QA charter's named priority failure pattern: "Business Unit archives
// BUT employee still appears actively attached to it"). Selecting `status` too is the
// minimal real fix; the corresponding page renders <ArchivedCompanyBadge/>
// (web/components/archived-company-badge.tsx) from it.
// Overnight multi-org milestone: `activeOrganizationId` scopes People to the
// currently-selected organization when set (real behavior change, not a decorative
// dropdown — the founder's explicit requirement that the selector "must affect...
// People"). RLS is unaffected either way — this is a query-shape filter on top of an
// already-correctly-scoped result set, never a source of authority itself. Omit the
// argument for the prior cross-company view (still used nowhere today, kept as an
// explicit opt-out for a future "All Organizations" mode).
// Manager relationship is per-organization/employment context (person_assignments,
// operating_company_id-scoped), not a single global field — the founder's explicit
// requirement ("who is X's manager in company Y" must not cross-contaminate). Fetched as
// a separate query (a self-referencing aliased embed — people -> person_assignments ->
// manager:people — defeats supabase-js's generated-type inference, collapsing the whole
// row to an untyped error type) and merged in JS, rather than trusting
// people.manager_person_id (a legacy, single-company field with no explicit UI or write
// path today) as the source of truth. RLS already scopes person_assignments to companies
// the caller can see (person_assignments_select_scope) — this is a query-shape join only.
export async function getPeople(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("people")
    .select("id, full_name, email, role_title, company_id, active, profile_id, companies(name, status)")
    .order("full_name");
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  if (data.length === 0) return data.map((p) => ({ ...p, manager_name: null as string | null }));

  const { data: assignments } = await supabase
    .from("person_assignments")
    .select("person_id, operating_company_id, is_primary, state, manager:people!person_assignments_manager_person_id_fkey(full_name)")
    .in(
      "person_id",
      data.map((p) => p.id)
    );

  return data.map((p) => {
    const forThisCompany = (assignments ?? []).filter((a) => a.person_id === p.id && a.operating_company_id === p.company_id && a.manager);
    const best =
      forThisCompany.find((a) => a.is_primary && a.state === "current") ??
      forThisCompany.find((a) => a.state === "current") ??
      forThisCompany[0];
    return { ...p, manager_name: best?.manager?.full_name ?? null };
  });
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

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Admin client setup failed." };
  }
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

  // BUG-004 follow-on regression, found live tonight: handle_new_auth_user()
  // (202608310009) now creates every new signup inert (active=false) by design -
  // correct for public self-signup, but this function is a DIFFERENT, already
  // founder/admin-gated path (checked at the top of this function) that deserves real
  // activation, same as accept_company_invitation() grants. Without this, using the
  // existing "Invite" button on /people would produce a permanently-inert account that
  // lands on /pending-activation forever despite a fully legitimate invite.
  const { error: activateError } = await admin.from("profiles").update({ active: true }).eq("id", newProfile.id);
  if (activateError) {
    return { ok: false, message: `Invite sent to ${person.email}, but activation failed: ${activateError.message}. Activate manually.` };
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Replaces the old deletePerson() — that was a literal hard `DELETE FROM people`,
// cascading away compensation history (salary_private), KPI history (kpi_records),
// person_ai_policy, and the entire employment audit trail (person_assignments), for what
// is ordinarily just "this employee no longer works here." end_person_employment()
// (supabase/migrations/202608290008_person_lifecycle_end_employment_and_delete.sql) is
// the real, correct primary action: soft, historicizes person_assignments, marks
// people.active=false, never touches the person identity row or its history. Same
// RPC-result-shape convention as archiveCompany()/restoreCompany() above.
export async function endPersonEmployment(id: string) {
  if (!UUID_RE.test(id)) return "Invalid person id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_person_employment", { p_person_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "End employment failed — no result returned.";
  if (result.reason === "not_found") return "This person no longer exists.";
  if (result.reason === "denied") return "You do not have permission to end this person's employment.";
  revalidatePath("/people");
  return null;
}

export async function restorePersonEmployment(id: string) {
  if (!UUID_RE.test(id)) return "Invalid person id.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_person_employment", { p_person_id: id });
  if (error) return error.message;
  const result = data as { changed: boolean; authorized: boolean; reason: string } | null;
  if (!result) return "Restore failed — no result returned.";
  if (result.reason === "not_found") return "This person no longer exists.";
  if (result.reason === "denied") return "You do not have permission to restore this person's employment.";
  revalidatePath("/people");
  return null;
}

// The tightly-controlled real hard delete — mirrors permanentlyDeleteCompany()'s
// founder/admin gate in spirit, but the dependency pre-check itself lives server-side in
// delete_person() (the RPC pre-checks every owner_person_id/manager_person_id-referencing
// table before attempting the delete), not duplicated here client-side. Not reachable
// from AI chat at all — this is the one UI-only escape hatch, deliberately asymmetric
// with endPersonEmployment/restorePersonEmployment.
export async function permanentlyDeletePerson(id: string) {
  if (!UUID_RE.test(id)) return "Invalid person id.";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: actingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!actingProfile || !["founder", "holding_admin"].includes(actingProfile.role)) {
    return "Only the founder or an admin can permanently delete a person.";
  }

  const { data, error } = await supabase.rpc("delete_person", { p_person_id: id });
  if (error) return error.message;
  const result = data as
    | { changed: boolean; authorized: boolean; reason: string; dependents?: { table: string; count: number }[] }
    | null;
  if (!result) return "Delete failed — no result returned.";
  if (result.reason === "not_found") return "This person no longer exists.";
  if (result.reason === "denied") return "You do not have permission to permanently delete this person.";
  if (result.reason === "has_dependents") {
    const parts = (result.dependents ?? []).map((d) => `${d.count} ${d.table}`);
    return `Can't permanently delete — this person is still referenced by: ${parts.join(", ")}. Reassign those first, or use "End employment" instead (keeps their record and history).`;
  }
  revalidatePath("/people");
  return null;
}
