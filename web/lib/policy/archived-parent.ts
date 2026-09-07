// Archived-parent policy — governance/CANONICAL_WORK_CONTRACT.md §4. The ONE place that
// decides how descendants of a non-active parent are treated on every surface. Mirrored for
// the Edge runtime in supabase/functions/_shared/parent-policy.ts.
//
// BUG-013 (Work-PC, 2026-09-07): archiving a company left people actively attached, manager
// links live, set-manager / invite / onboarding controls enabled and the project active —
// the display badge was the only consumer of the parent's status. No destructive cascade is
// implied by archiving; the policy is about what the child may DO and how it is SHOWN.

import { isArchivedParent, type CompanyRef } from "@/lib/data/company-ref";

export type ParentState = "active" | "archived" | "missing";

export type ParentPolicy = {
  parentState: ParentState;
  /** Lifecycle-dependent controls (set manager, invite, onboarding, add project/department, new assignment). */
  canActOnChild: boolean;
  /** Offered in active lists and creation / assignment selectors. */
  offerInActiveLists: boolean;
  /** Human reason shown on a disabled control; null when allowed. */
  reason: string | null;
  /** Short visible indication for the row. */
  badge: "parent archived" | "no company" | null;
};

export const PARENT_ARCHIVED_REASON = "Company is archived — restore it first";
export const PARENT_MISSING_REASON = "Assign a company first";

export function parentStateOf(ref: CompanyRef | undefined, companyId: string | null | undefined): ParentState {
  if (!companyId) return "missing";
  if (isArchivedParent(ref)) return "archived";
  return "active";
}

/** The policy for a child under the given parent reference. */
export function parentPolicy(ref: CompanyRef | undefined, companyId: string | null | undefined): ParentPolicy {
  const parentState = parentStateOf(ref, companyId);
  if (parentState === "archived") {
    return { parentState, canActOnChild: false, offerInActiveLists: false, reason: PARENT_ARCHIVED_REASON, badge: "parent archived" };
  }
  if (parentState === "missing") {
    return { parentState, canActOnChild: false, offerInActiveLists: true, reason: PARENT_MISSING_REASON, badge: "no company" };
  }
  return { parentState, canActOnChild: true, offerInActiveLists: true, reason: null, badge: null };
}

/** True when lifecycle-dependent controls may act on the child. */
export function canActOnParent(ref: CompanyRef | undefined, companyId: string | null | undefined): boolean {
  return parentPolicy(ref, companyId).canActOnChild;
}
