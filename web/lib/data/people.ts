"use server";

import { revalidatePath } from "next/cache";
import { classifyError, isExistingAuthUser, result as invitationResult } from "./invitation-outcome";
import type { InvitationResult } from "./invitation-outcome";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callLifecycleRpc } from "@/lib/contracts/lifecycle";
import { COMPANY_REF } from "@/lib/data/company-ref";

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
    .select(`id, full_name, email, role_title, company_id, active, profile_id, ${COMPANY_REF}`)
    .order("full_name");
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  if (data.length === 0) return data.map((p) => ({ ...p, manager_name: null as string | null, manager_person_id: null as string | null }));

  const { data: assignments } = await supabase
    .from("person_assignments")
    .select("person_id, operating_company_id, is_primary, state, manager_person_id, manager:people!person_assignments_manager_person_id_fkey(full_name)")
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
    // BUG-011 (Work-PC, 2026-09-07): the set-manager sheet must show and pre-select the
    // current manager it says it will replace — the id rides along with the name.
    return { ...p, manager_name: best?.manager?.full_name ?? null, manager_person_id: best?.manager_person_id ?? null };
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

// The manager set-UI's write path — the piece the Work-PC handoff table called out as
// missing ("Manager relationships — read-only, no set-UI"). Calls the same idempotent
// set_person_assignment() RPC the AI-chat path uses (202608280011), so the UI and chat
// converge on one canonical write: authority is enforced INSIDE the RPC (founder/admin
// or manager of the target company — it raises, not silently no-ops), one current
// primary assignment per person is DB-unique, and people.company_id stays in sync.
//
// Honest scope limit, on purpose: the RPC coalesces p_manager_person_id on an existing
// current assignment, so passing null KEEPS the old manager rather than clearing it.
// Set/change is therefore all this action offers — a real "clear manager" needs an RPC
// change (a gated migration), and faking it here with a raw table update would bypass
// the canonical write path this exists to converge on.
//
// The person must already have a company: the assignment is org-scoped by definition
// ("who is X's manager in company Y"), and the RPC requires an operating company to
// scope authority against.
export async function setPersonManager(personId: string, managerPersonId: string): Promise<string | null> {
  if (!personId || !managerPersonId) return "Both a person and a manager are required.";
  if (personId === managerPersonId) return "A person can’t be their own manager.";
  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, company_id")
    .eq("id", personId)
    .maybeSingle();
  if (personError) return personError.message;
  if (!person) return "This person may no longer exist or you may not have access to them.";
  if (!person.company_id) return "Assign this person to a company first — a manager relationship is scoped to one organization.";
  // The manager must be visible to the caller and belong to the SAME organization —
  // the org-scoped-manager rule. The RPC itself doesn't check this (chat resolves
  // targets from context first), so the UI path checks it against a real read here
  // rather than trusting the submitted id.
  const { data: manager, error: managerError } = await supabase
    .from("people")
    .select("id, company_id, active")
    .eq("id", managerPersonId)
    .maybeSingle();
  if (managerError) return managerError.message;
  if (!manager) return "That manager may no longer exist or you may not have access to them.";
  if (manager.company_id !== person.company_id) return "Manager must belong to the same organization — manager relationships are per-company.";
  if (manager.active === false) return "That person’s employment has ended — pick a current employee as manager.";

  const { error } = await supabase.rpc("set_person_assignment", {
    p_person_id: personId,
    p_operating_company_id: person.company_id,
    p_manager_person_id: managerPersonId,
  });
  // The RPC RAISES on missing authority (founder/admin or target-company manager), so
  // unlike the RLS-silent-no-op paths above, an error here is a real, specific answer.
  if (error) return error.message;
  revalidatePath("/people");
  return null;
}

// THE GOVERNED INVITATION ROUTE — founder product decision, 2026-09-11: INVITE != ADD MEMBER.
//
// A `people` row is an HR record and has never granted access. What changed is that this action no
// longer grants access either. It creates a governed invitation and starts delivery. That is all.
//
//   INVITATION_CREATED -> DELIVERY_PENDING -> SENT -> ACCEPTED -> MEMBERSHIP_ACTIVE
//
// Everything from ACCEPTED onward belongs to `accept_company_invitation(token)`, which derives company,
// role and recipient authority FROM THE STORED ROW and takes no company or role parameter at all.
//
// WHAT THIS FUNCTION NO LONGER DOES, each of which was a contract violation:
//   * it does not insert company_memberships;
//   * it does not set profiles.active = true as a substitute for acceptance;
//   * it does not grant company authority before acceptance;
//   * it does not create a pseudo-invitation that cannot be revoked or expire;
//   * it does not claim "not a member until acceptance" while having just made them one.
//
// AND `bookkeepingFailure` IS GONE WITH THEM. It existed to report the partial state left when one of
// five writes after the mail call failed. There are no writes after the mail call now, so that whole
// class of half-finished invitation cannot occur — the defect is removed rather than reported better.
//
// ORDER IS A SECURITY PROPERTY HERE. The invitation is created FIRST, through
// `create_company_invitation` on the CALLER’S OWN client: it is `security invoker`, so RLS and its own
// `is_founder_or_admin() or is_company_manager(company)` check are the authority. The service-role
// client is constructed only AFTER that gate has passed, so an unauthorised caller never reaches it.
// The old code did its own founder/admin list check and then used the admin client — a duplicated
// authority list that could drift from the one the database actually enforces, and did: it refused
// company managers whom the governed model permits.

// Where the invitation link lands. Read from the deployment’s own public URL so no environment can
// quietly send a bearer token to a different origin; empty base yields a relative path, which is
// correct for a same-origin deployment and never points somewhere else.
function acceptInvitationUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return base + "/accept-invitation?token=" + encodeURIComponent(token);
}

// `ok` MEANS ONE THING: AN INVITATION NOW EXISTS IN THE GOVERNED LIFECYCLE.
//
// It does not mean an email arrived, and it certainly does not mean anyone joined anything. So
// DELIVERY_FAILED returns ok: true — the invitation is real, revocable and retryable, and telling the
// founder "nothing happened" would be false and would invite a duplicate. The refusals return false
// because they genuinely changed nothing.
export async function invitePerson(personId: string): Promise<{ ok: boolean } & InvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, ...invitationResult("NOT_PERMITTED", "that person") };

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, full_name, email, company_id, profile_id")
    .eq("id", personId)
    .maybeSingle();
  if (personError || !person) {
    console.error("invitePerson: person record not found", { personId, error: personError });
    return { ok: false, ...invitationResult("UNKNOWN_ERROR", "that person") };
  }
  if (!person.email) return { ok: false, ...invitationResult("INVALID_RECIPIENT", person.full_name) };
  // An invitation is always to ONE company — company_invitations.company_id is NOT NULL. Without one
  // there is nothing to invite them to, and saying so beats a foreign-key error.
  if (!person.company_id) return { ok: false, ...invitationResult("NO_COMPANY", person.full_name) };

  // EVERY AWAIT BELOW IS INSIDE THIS TRY (BUG-037). A throw inside a Server Action REJECTS it, and the
  // caller cannot turn a rejection into a message.
  try {
    // ALREADY A MEMBER IS A MEMBERSHIP QUESTION, NOT A profile_id QUESTION. The old code refused on
    // `person.profile_id` alone, which is a link between an HR record and a login — evidence of
    // neither acceptance nor membership. Treating it as membership is what made a half-finished
      // invitation permanently unrepeatable.
    if (person.profile_id) {
      const { data: membership } = await supabase
        .from("company_memberships")
        .select("profile_id")
        .eq("company_id", person.company_id)
        .eq("profile_id", person.profile_id)
        .eq("active", true)
        .maybeSingle();
      if (membership) return { ok: false, ...invitationResult("ALREADY_MEMBER", person.full_name) };
    }

    // THE AUTHORIZATION GATE, AND THE IDEMPOTENCY, ARE BOTH HERE.
    //
    // create_company_invitation carries `on conflict (company_id, email) where status = 'pending' do
    // update set ... token = <fresh>`, so a second click REFRESHES the live invitation instead of
    // creating a second one or failing. A partial unique index makes two live invitations for one
    // (company, email) impossible at the database level rather than by convention. An expired or
    // revoked row is outside that index, so resending after either correctly starts a new invitation.
    const { data: created, error: createError } = await supabase.rpc("create_company_invitation", {
      p_company_id: person.company_id,
      p_email: person.email,
    });
    if (createError) {
      const outcome = classifyError(createError);
      console.error("invitePerson: the invitation was not created", { personId, outcome, error: createError });
      return { ok: false, ...invitationResult(outcome, person.full_name) };
    }
    const invitation = Array.isArray(created) ? created[0] : created;
    if (!invitation?.token) {
      console.error("invitePerson: the invitation RPC returned no token", { personId });
      return { ok: false, ...invitationResult("UNKNOWN_ERROR", person.full_name) };
    }

    // DELIVERY STARTS ONLY NOW, AND IT CANNOT GRANT ANYTHING.
    //
    // The service-role client is needed for auth.admin.inviteUserByEmail — the one operation RLS
    // cannot gate — and is constructed only after the authorization gate above has passed. The
    // redirect carries the governed token, so the link the recipient follows leads to acceptance
    // rather than to an inert account with nothing to redeem.
    let admin;
    try {
      admin = createAdminClient();
    } catch (e) {
      // THE INVITATION EXISTS. A configuration fault is a delivery failure, which is retryable, and
      // saying "nothing was changed" here would be false and would invite a duplicate.
      console.error("invitePerson: admin client setup failed after the invitation was created", { personId, error: e });
      return { ok: true, ...invitationResult("DELIVERY_FAILED", person.full_name) };
    }
    const { error: mailError } = await admin.auth.admin.inviteUserByEmail(person.email, {
      data: { full_name: person.full_name },
      redirectTo: acceptInvitationUrl(invitation.token),
    });

    // AN EXISTING AUTH ACCOUNT IS NOT A FAILURE. The invitation is created, redeemable and bound to
    // this email; the person signs in and accepts it. The old code classified "already registered" as
    // a failure, which is what turned a second attempt into a permanent dead end.
    if (mailError && !isExistingAuthUser(mailError)) {
      const outcome = classifyError(mailError);
      console.error("invitePerson: delivery failed, invitation retained", { personId, outcome, error: mailError });
      // Only a transport-shaped failure is DELIVERY_FAILED; a rate limit or an unreachable provider
      // keeps its own name, and all of them leave the invitation standing.
      return { ok: true, ...invitationResult(outcome === "UNKNOWN_ERROR" ? "DELIVERY_FAILED" : outcome, person.full_name) };
    }

    revalidatePath("/people");
    revalidatePath("/access");
    // NOT `SENT`. The contract requires SENT to mean the delivery contract reached its terminal success
    // state, and a mailer accepting a message is not that. Nothing here can observe delivery, so the
    // honest state is DELIVERY_PENDING — this is the FALSE SENT defect closed at its root.
    return { ok: true, ...invitationResult("DELIVERY_PENDING", person.full_name) };
  } catch (e) {
    // A THROW IS STILL AN ENDING. classifyError is total, so no path leaves the caller waiting.
    const outcome = classifyError(e);
    console.error("invitePerson: threw", { personId, outcome, error: e });
    return { ok: false, ...invitationResult(outcome, person.full_name) };
  }
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
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "end_person_employment", idParam: "p_person_id", id, entityType: "person", action: "end_employment", requestedValues: { active: false } });
  if (userMessage) return userMessage;
  revalidatePath("/people");
  return null;
}

export async function restorePersonEmployment(id: string) {
  const supabase = await createClient();
  const { userMessage } = await callLifecycleRpc(supabase, { rpc: "restore_person_employment", idParam: "p_person_id", id, entityType: "person", action: "restore_employment", requestedValues: { active: true } });
  if (userMessage) return userMessage;
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
