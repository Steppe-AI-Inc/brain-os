// LifecycleResult / callLifecycleRpc — governance/CANONICAL_WORK_CONTRACT.md §2-§3.
// The one web-side path for archive/restore-style lifecycle transitions. Every wrapper in
// lib/data/*.ts goes through here; none re-implements the transition or the result shape.
// Reference RPCs: archive_company / restore_company (202608280013), archive_task /
// restore_task / archive_goal / restore_goal (202608290001), end/restore employment (202608290008).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutionResultEnvelope } from "./execution";

/** The jsonb every lifecycle RPC returns (frictionless-secure-crud shape). */
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

export type LifecycleCall = {
  rpc: string;
  idParam: string;
  id: string;
  entityType: string;
  action: string;
  requestedValues?: Record<string, unknown> | null;
};

export type LifecycleOutcome = { envelope: ExecutionResultEnvelope; result: LifecycleResult | null; userMessage: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_TEXT: Record<string, (entity: string) => string> = {
  not_found: (entity) => `This ${entity} no longer exists.`,
  denied: (entity) => `You do not have permission to change this ${entity}.`,
};

/**
 * Calls a canonical lifecycle RPC as the signed-in user and returns one ExecutionResultEnvelope
 * plus the user-facing message (null when the operation verified or was a clean no-op).
 * `changed && postconditionPassed` is the only verified outcome; `already_*` is a truthful no-op.
 */
export async function callLifecycleRpc(supabase: SupabaseClient, call: LifecycleCall): Promise<LifecycleOutcome> {
  const base = {
    request_id: null,
    channel_id: null,
    turn: null,
    action_type: call.action,
    entity_type: call.entityType,
    canonical_entity_ids: [call.id],
    requested_values: call.requestedValues ?? null,
    timestamp: new Date().toISOString(),
  };
  if (!UUID_RE.test(call.id)) {
    return {
      envelope: { ...base, executed: false, rows_affected: null, backend_result: null, precondition: null, postcondition: null, postcondition_verified: false, error: "invalid_id" },
      result: null,
      userMessage: `Invalid ${call.entityType} id.`,
    };
  }
  const { data, error } = await supabase.rpc(call.rpc, { [call.idParam]: call.id });
  if (error) {
    return {
      envelope: { ...base, executed: false, rows_affected: null, backend_result: null, precondition: null, postcondition: null, postcondition_verified: false, error: error.message },
      result: null,
      userMessage: error.message,
    };
  }
  const result = (data ?? null) as LifecycleResult | null;
  if (!result) {
    return {
      envelope: { ...base, executed: false, rows_affected: null, backend_result: null, precondition: null, postcondition: null, postcondition_verified: false, error: "no_result" },
      result: null,
      userMessage: `${call.action} failed — no result returned.`,
    };
  }
  const verified = result.changed === true && result.postconditionPassed === true;
  const executed = result.changed === true;
  const envelope: ExecutionResultEnvelope = {
    ...base,
    executed,
    rows_affected: verified ? 1 : 0,
    backend_result: result,
    precondition: { status: result.previousStatus ?? null },
    postcondition: { status: result.newStatus ?? null },
    postcondition_verified: verified,
    error: verified ? null : (executed ? "postcondition_not_confirmed" : String(result.reason)),
  };
  let userMessage: string | null = null;
  if (executed && !verified) userMessage = `${call.action} attempted, but the persisted status did not confirm it — treat as not changed.`;
  else if (!executed && REASON_TEXT[result.reason]) userMessage = REASON_TEXT[result.reason](call.entityType);
  // already_* is a clean, truthful no-op: no error message, the caller re-reads state.
  return { envelope, result, userMessage };
}
