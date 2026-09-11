// THE COMPANY ROLE VOCABULARY — one list, and the database owns it.
//
// `company_invitations.invited_role` and `company_memberships.role_in_company` both carry a role, and the
// invitation table constrains it with a CHECK. That CHECK is the authority. This file exists so the product
// has the same list in a form a form control can render, and a suite row asserts the two are identical —
// because a vocabulary that drifts from its constraint fails at the database, after the click, with a
// message no user can act on.
//
// WHY IT MATTERS HERE (BUG-035, RI-D1). The schema has modelled a per-invitation role since
// 202608310009_invite_only_signup.sql. Nothing in the product ever passed one, so every invitation took the
// `employee` default and the constrained, auditable role the schema models was unreachable. Roles were then
// adjusted after the fact, if at all, by editing a membership directly — which is the opposite of auditable.

/**
 * Exactly the values `company_invitations.invited_role` permits, in the order its CHECK lists them.
 *
 * Ordered from most to least authority deliberately: a form that renders this list renders it in that order,
 * and `employee` — the default the schema chooses — is in the middle rather than first, so choosing a role
 * is a decision rather than an acceptance of whatever sits at the top.
 */
export const COMPANY_ROLES = [
  'holding_admin',
  'hr_finance',
  'company_manager',
  'team_lead',
  'employee',
  'contractor',
  'investor_viewer',
] as const;

export type CompanyRole = (typeof COMPANY_ROLES)[number];

/** The role the database applies when an invitation names none. Stated here so the product never guesses. */
export const DEFAULT_COMPANY_ROLE: CompanyRole = 'employee';

/** What a person sees. The stored value stays the schema's, because that is what the CHECK constrains. */
export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  holding_admin: 'Holding admin',
  hr_finance: 'HR / Finance',
  company_manager: 'Company manager',
  team_lead: 'Team lead',
  employee: 'Employee',
  contractor: 'Contractor',
  investor_viewer: 'Investor (view only)',
};

/**
 * Is this a role the database will accept?
 *
 * Asked BEFORE the RPC, so an invalid role is refused with a sentence rather than arriving as a CHECK
 * violation the classifier would have to guess at. It is not a substitute for the CHECK — the constraint is
 * still the authority, and a client that bypasses this function still cannot store a role outside it.
 */
export function isCompanyRole(value: unknown): value is CompanyRole {
  return typeof value === 'string' && (COMPANY_ROLES as readonly string[]).includes(value);
}
