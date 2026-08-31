// Split out of organizations.ts: a "use server" module may only export async
// functions (Next.js Server Actions constraint) — a const or a type export in
// that file silently causes the whole module to resolve with NO exports at
// all under Turbopack/webpack bundling (confirmed live: "The module has no
// exports at all" for every export, including the async functions, once
// ALL_ORGANIZATIONS_ID/OrganizationOption/OrganizationContext were added
// there). Plain data/types live here instead; organizations.ts re-exports
// nothing non-async.

export const ACTIVE_ORG_COOKIE = "brain_active_org_id";

// Founder/superadmin explicit cross-company view - never automatic, never available to
// an ordinary employee (the founder's own explicit requirement: "same owner/founder
// does not automatically mean all employees may see group-company data"). Represented
// as a real, listed option only when isFounderOrAdmin is true.
export const ALL_ORGANIZATIONS_ID = "__all__";

export type OrganizationOption = {
  id: string;
  name: string;
  roleInCompany: string | null;
};

export type OrganizationContext = {
  isFounderOrAdmin: boolean;
  memberships: OrganizationOption[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
};
