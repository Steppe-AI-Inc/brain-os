"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, ALL_ORGANIZATIONS_ID, type OrganizationContext, type OrganizationOption } from "@/lib/data/organizations-types";

// Overnight multi-org milestone, Priority 1/2 — real organization selector +
// server-validated active-organization context. AUTH IDENTITY (profiles) != PERSON
// (people) != ORGANIZATION MEMBERSHIP (company_memberships, already multi-row-capable
// per profile - the schema already supported this, only the UI/context layer was
// missing) != EMPLOYMENT != MANAGER RELATIONSHIP != OWNERSHIP: this file only manages
// which of a profile's REAL, existing company_memberships is "active" for the current
// session - it grants no new access. Canonical authorization stays exactly what it
// already was (has_company_access()/is_company_manager()/RLS) - this cookie is a UI
// convenience for scoping queries, never itself a source of authority. A page that
// reads the active org and queries by it still goes through the same RLS as any other
// query; a stale/tampered cookie value naming an org the profile has no membership in
// is silently ignored and falls back to a real membership, never trusted blindly.
//
// This file must only export async functions ("use server" / Server Actions
// constraint) — constants and types live in ./organizations-types instead; see that
// file's own comment for the real bug this caused when violated.

export async function getOrganizationContext(): Promise<OrganizationContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { isFounderOrAdmin: false, memberships: [], activeOrganizationId: null, activeOrganizationName: null };

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (!profile) return { isFounderOrAdmin: false, memberships: [], activeOrganizationId: null, activeOrganizationName: null };

  const isFounderOrAdmin = profile.role === "founder" || profile.role === "holding_admin";

  // Founder/admin sees every real, non-archived company (their platform-wide authority
  // already grants this via RLS - is_founder_or_admin() short-circuits every relevant
  // policy) - never a synthetic "give them a membership row everywhere" hack.
  // Ordinary users see exactly their own real, active company_memberships - no more.
  const founderCompanyOptions: OrganizationOption[] = isFounderOrAdmin
    ? ((await supabase.from("companies").select("id, name").neq("status", "archived").order("name")).data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        roleInCompany: "founder",
      }))
    : [];
  const memberships: OrganizationOption[] = isFounderOrAdmin
    ? [{ id: ALL_ORGANIZATIONS_ID, name: "All Organizations", roleInCompany: "founder" }, ...founderCompanyOptions]
    : ((
        await supabase
          .from("company_memberships")
          .select("company_id, role_in_company, companies(id, name, status)")
          .eq("profile_id", profile.id)
          .eq("active", true)
      ).data ?? [])
        .filter((m) => {
          const c = m.companies as unknown as { status: string } | null;
          return c && c.status !== "archived";
        })
        .map((m) => {
          const c = m.companies as unknown as { id: string; name: string };
          return { id: c.id, name: c.name, roleInCompany: m.role_in_company };
        });

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  // Never trust the cookie blindly - it must name a real, current membership (or any
  // company at all, for founder/admin). A stale/tampered/foreign org id is silently
  // ignored, falling back to the first real membership - the cookie is a UI
  // convenience, not a source of authority.
  const valid = cookieValue ? memberships.find((m) => m.id === cookieValue) : null;
  const active = valid ?? memberships[0] ?? null;

  return {
    isFounderOrAdmin,
    memberships,
    activeOrganizationId: active?.id ?? null,
    activeOrganizationName: active?.name ?? null,
  };
}

export async function setActiveOrganization(companyId: string) {
  const context = await getOrganizationContext();
  // Re-validate server-side even though the client only ever offers real options -
  // never persist a cookie for an org the profile doesn't actually have access to.
  if (!context.memberships.find((m) => m.id === companyId)) {
    throw new Error("Not a member of that organization.");
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
