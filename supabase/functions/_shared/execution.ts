// ExecutionResultEnvelope / MutationReceipt — Edge mirror of web/lib/contracts/execution.ts
// (governance/OPERATING_TRUTH_MODEL.md §4.1-§4.2). sem-ai-command/index.ts is deployed as a
// single file and keeps its own byte-identical copy of the envelope TYPE (the drift guard
// qa/scenarios-runner/architecture_shared_contracts_mirror_contract.mjs pins the field list
// across this file, the web copy and index.ts). Runtime helpers here are for future Edge
// functions that can import from _shared.

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

export function noChangeLine(reason: string): string {
  return `No change was made — ${reason}.`;
}
