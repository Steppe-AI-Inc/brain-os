// LifecycleResult — Edge mirror of web/lib/contracts/lifecycle.ts
// (governance/CANONICAL_WORK_CONTRACT.md §2-§3). The jsonb every canonical lifecycle RPC
// returns, and the one rule for reading it: `changed && postconditionPassed` is the only
// verified outcome; `already_*` is a truthful no-op; anything else is a failure with a reason.

export type LifecycleResult = {
  operation: string;
  id?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  changed: boolean;
  authorized: boolean;
  postconditionPassed: boolean;
  reason: string;
  [key: string]: unknown;
};

export type LifecycleVerdict = 'verified' | 'postcondition_failed' | 'no_op' | 'refused';

export function lifecycleVerdict(r: LifecycleResult | null | undefined): LifecycleVerdict {
  if (!r) return 'refused';
  if (r.changed === true && r.postconditionPassed === true) return 'verified';
  if (r.changed === true) return 'postcondition_failed';
  if (/^already_/.test(String(r.reason))) return 'no_op';
  return 'refused';
}
