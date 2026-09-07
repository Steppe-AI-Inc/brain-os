// Archived-parent policy — Edge mirror of web/lib/policy/archived-parent.ts
// (governance/CANONICAL_WORK_CONTRACT.md §4). The same decisions, expressed over the pack's
// company rows: a child under an archived parent may not receive lifecycle-dependent
// mutations from chat, and is not offered for new active work.

export type ParentState = 'active' | 'archived' | 'missing';

export type ParentPolicy = {
  parentState: ParentState;
  canActOnChild: boolean;
  offerInActiveLists: boolean;
  reason: string | null;
  badge: 'parent archived' | 'no company' | null;
};

export const PARENT_ARCHIVED_REASON = 'Company is archived — restore it first';
export const PARENT_MISSING_REASON = 'Assign a company first';

export function parentStateOf(status: string | null | undefined, companyId: string | null | undefined): ParentState {
  if (!companyId) return 'missing';
  if (status === 'archived') return 'archived';
  return 'active';
}

export function parentPolicy(status: string | null | undefined, companyId: string | null | undefined): ParentPolicy {
  const parentState = parentStateOf(status, companyId);
  if (parentState === 'archived') {
    return { parentState, canActOnChild: false, offerInActiveLists: false, reason: PARENT_ARCHIVED_REASON, badge: 'parent archived' };
  }
  if (parentState === 'missing') {
    return { parentState, canActOnChild: false, offerInActiveLists: true, reason: PARENT_MISSING_REASON, badge: 'no company' };
  }
  return { parentState, canActOnChild: true, offerInActiveLists: true, reason: null, badge: null };
}

export function canActOnParent(status: string | null | undefined, companyId: string | null | undefined): boolean {
  return parentPolicy(status, companyId).canActOnChild;
}
