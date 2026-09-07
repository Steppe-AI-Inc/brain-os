// resolveOrgScope — governance/CANONICAL_WORK_CONTRACT.md §5. The one place a page turns the
// organization context into a query scope; pages never hand-write the sentinel comparison.
// (Plain module: no "use server" — it exports a synchronous helper and a type.)

import { ALL_ORGANIZATIONS_ID, type OrganizationContext } from "./organizations-types";

export type OrgScope =
  | { kind: "all" }
  | { kind: "company"; companyId: string }
  | { kind: "none" };

/** All organizations (founder/admin with the sentinel active), one company, or nothing (no membership). */
export function resolveOrgScope(context: Pick<OrganizationContext, "activeOrganizationId">): OrgScope {
  const id = context.activeOrganizationId;
  if (!id) return { kind: "none" };
  if (id === ALL_ORGANIZATIONS_ID) return { kind: "all" };
  return { kind: "company", companyId: id };
}

/** Applies the scope to a PostgREST builder with a company_id column. */
export function scopeQuery<Q extends { eq: (column: string, value: string) => Q }>(query: Q, scope: OrgScope, column = "company_id"): Q {
  if (scope.kind === "company") return query.eq(column, scope.companyId);
  return query;
}

/**
 * The page rule: a user with more than one membership sees the active company only; the
 * "All Organizations" sentinel and single-membership users keep the unscoped (RLS-only) query.
 * Returns the company id to filter on, or null for no page-level filter.
 */
export function scopeToActiveOrganization(context: Pick<OrganizationContext, "activeOrganizationId" | "memberships">): string | null {
  const scope = resolveOrgScope(context);
  return context.memberships.length > 1 && scope.kind === "company" ? scope.companyId : null;
}

/** For in-memory rows (already RLS-scoped) — the same rule applied client-side. */
export function inScope(scope: OrgScope, companyId: string | null | undefined): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return companyId === scope.companyId;
}
