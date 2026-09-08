// ExecutionResultEnvelope / MutationReceipt — governance/OPERATING_TRUTH_MODEL.md §4.1-§4.2.
// Mirrored for the Edge runtime in supabase/functions/_shared/execution.ts; the drift guard
// qa/scenarios-runner/architecture_shared_contracts_mirror_contract.mjs pins the two copies.
//
// The ONLY admissible evidence for a current-turn mutation-success claim is an envelope with
// executed === true && postcondition_verified === true whose canonical_entity_ids cover the
// claimed target. Conversation text never self-certifies execution.

export type ExecutionActionType =
  | 'archive' | 'restore' | 'create' | 'update' | 'rename' | 'assign' | 'reassign' | 'unassign'
  | 'delete' | 'permanent_delete' | 'approve' | 'reject' | 'invite' | 'revoke' | 'activate' | 'deactivate'
  | 'end_employment' | 'restore_employment' | (string & {});

export type ExecutionResultEnvelope = {
  request_id: string | null;
  channel_id: string | null;
  turn: number | null;
  action_type: ExecutionActionType;
  entity_type: string;
  canonical_entity_ids: string[];
  requested_values: Record<string, unknown> | null;
  executed: boolean;
  rows_affected: number | null;
  backend_result: unknown;
  precondition: unknown;
  postcondition: unknown;
  postcondition_verified: boolean;
  error: string | null;
  timestamp: string;
};

/** The one combination that admits a success claim. */
export function admitsSuccessClaim(e: ExecutionResultEnvelope): boolean {
  return e.executed === true && e.postcondition_verified === true;
}

/** Outcome classes a receipt may render. Idempotent and failed outcomes are truthful, not errors. */
export type ExecutionOutcome =
  | 'verified' | 'postcondition_failed' | 'already_in_target_state' | 'not_found' | 'denied'
  | 'foreign_org' | 'stale_state' | 'conflicting_update' | 'partial_backend_failure' | 'error' | 'not_executed';

export function classifyOutcome(e: ExecutionResultEnvelope): ExecutionOutcome {
  if (admitsSuccessClaim(e)) return 'verified';
  if (e.executed && !e.postcondition_verified) return 'postcondition_failed';
  const err = String(e.error ?? '');
  if (/^already_/.test(err)) return 'already_in_target_state';
  if (err === 'not_found') return 'not_found';
  if (err === 'denied') return 'denied';
  if (err === 'foreign_org') return 'foreign_org';
  if (err === 'stale_state') return 'stale_state';
  if (err === 'conflicting_update') return 'conflicting_update';
  if (err === 'partial_backend_failure') return 'partial_backend_failure';
  if (err) return 'error';
  return 'not_executed';
}

export type MutationReceiptLine = {
  action: ExecutionActionType;
  entityType: string;
  entityLabel: string;
  outcome: ExecutionOutcome;
  detail: string | null;
  rowsAffected: number | null;
};

/**
 * One renderer for every entity type: the founder-facing account of a turn's mutations,
 * rendered from envelopes, never from the model. Callers supply labels for canonical ids.
 */
export function renderMutationReceipt(
  ledger: ExecutionResultEnvelope[],
  label: (entityType: string, id: string) => string,
): MutationReceiptLine[] {
  return ledger.map((e) => {
    const id = e.canonical_entity_ids[0] ?? '';
    const outcome = classifyOutcome(e);
    const changed = e.requested_values ? Object.entries(e.requested_values).map(([k, v]) => `${k} → ${String(v)}`).join(', ') : null;
    return {
      action: e.action_type,
      entityType: e.entity_type,
      entityLabel: label(e.entity_type, id),
      outcome,
      detail: outcome === 'verified' ? changed : (e.error ?? changed),
      rowsAffected: e.rows_affected,
    };
  });
}

/** The never-silent line for a mutation-intent turn whose ledger holds no verified envelope. */
export function noChangeLine(reason: string): string {
  return `No change was made — ${reason}.`;
}
