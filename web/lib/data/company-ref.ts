// Canonical company-reference join, and the single place that decides what a company
// reference must carry.
//
// BUG-001 / BUG-006 (ARCHIVED_PARENT_NOT_SURFACED). A row whose parent company is archived
// was rendering as an ordinary active row with no indication anywhere, contradicting the
// same screen's own company picker — which correctly excludes archived companies via
// get_effectively_active_companies(). The cause was never one bad query: 24 separate
// `companies(name)` joins each omitted `status`, so the UI could not show an archived
// marker even in principle.
//
// Work-PC closed BUG-001 on the two originally-reported surfaces (departments, people) and
// split the remaining 23 joins out as BUG-006. Patching them one at a time would leave the
// same drift free to reappear on the 25th join, so the fix is this constant plus the
// regression in qa/scenarios-runner/company_ref_no_bare_name_join.mjs, which fails if a
// bare `companies(name)` join is reintroduced anywhere under web/.
//
// planning/paused is NOT archived — only `status === 'archived'` marks an archived parent.
// See web/components/archived-company-badge.tsx, which renders from exactly this shape.

/** The only company-reference fragment that may appear in a PostgREST select. */
export const COMPANY_REF = 'companies(name, status)';

/** Named-FK variant, for tables with more than one FK to companies. */
export const companyRefVia = (constraint: string) => `companies!${constraint}(name, status)`;

/** The shape COMPANY_REF returns, and what ArchivedCompanyBadge consumes. */
export type CompanyRef = { name: string; status: string | null } | null;

/** True only for a genuinely archived parent. planning/paused/draft are not archived. */
export function isArchivedParent(ref: CompanyRef | undefined): boolean {
  return !!ref && ref.status === 'archived';
}
