"use server";

import { createClient } from "@/lib/supabase/server";

// Chat history is reconstructed from tables that already have everything — no dedicated
// history table needed. work_orders is one row per chat turn (command + the model's raw
// output); model_usage has a real FK to it; audit_logs' 'ai_command_executed' event
// (entity_id = work_order id, logged from inside sem_execute_ai_command itself) has the
// exact per-action counts (tasks, approvals, deletedTasks, companies, people, projects,
// goals, companyRelationships, personAssignments) from when the RPC actually ran. Not
// 'ai_command_request_completed' — that's a separate, later Edge-Function-level audit
// event that never included tasks/approvals in its metadata (a pre-existing gap, caught
// live: history showed "0 task(s)" for a message that had in fact created a real task).
// All three source tables are already RLS-scoped to the caller's own rows
// (work_orders_select_scope: created_by_profile_id = self, or founder/admin).
export type ChatHistoryCounts = {
  tasks: number;
  approvals: number;
  deletedTasks: number;
  companies: number;
  people: number;
  projects: number;
  goals: number;
  companyRelationships: number;
  personAssignments: number;
  memories: number;
};

export type ChatHistoryMessage = {
  workOrderId: string;
  createdAt: string;
  command: string;
  status: string; // 'queued' | 'done' | 'rejected' | ...
  output: { summary?: string; error?: string } | null;
  modelName: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  counts: ChatHistoryCounts | null;
};

// channelId: undefined fetches everything (not used by the chat page itself, kept for
// completeness); null scopes to "General" (channel_id is null); a real id scopes to
// that channel only. The chat page always passes one of the latter two explicitly.
//
// beforeCreatedAt: optional cursor for "load older messages" pagination — when set, only
// turns strictly older than this timestamp are considered. Combined with the
// order-desc-then-limit-then-reverse shape below, this makes repeated calls page backward
// through real history instead of ever re-fetching (or, before this fix, silently
// dropping) the newest turns.
//
// ORDERING FIX (qa/KNOWN_FAILURE_MODES.md — "chat history silently loses recent messages
// on navigation"): PostgREST applies LIMIT after ORDER BY, so ordering `created_at`
// ascending then limiting fetched the OLDEST `limit` turns for any channel with more than
// `limit` turns — the exact opposite of "recent chat history." Order descending (newest
// first) so LIMIT keeps the newest N, then reverse in JS back to chronological order for
// display. See qa/scenarios-runner/chat_history_ordering.sql for the permanent regression
// proving `order by created_at desc limit N` returns the N most recent rows.
export async function getChatHistory(
  limit = 30,
  channelId?: string | null,
  beforeCreatedAt?: string
): Promise<ChatHistoryMessage[]> {
  const supabase = await createClient();

  let query = supabase
    .from("work_orders")
    .select("id, command, status, output, created_at, model_usage(model_name, input_tokens, output_tokens, estimated_cost_usd)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (channelId === null) query = query.is("channel_id", null);
  else if (channelId) query = query.eq("channel_id", channelId);
  if (beforeCreatedAt) query = query.lt("created_at", beforeCreatedAt);

  const { data: workOrdersDesc, error } = await query;
  if (error) throw error;
  // Reverse back to chronological (oldest-of-the-kept-window first) for display — the
  // fetch itself must stay newest-first so LIMIT keeps the right rows (see comment above).
  const workOrders = [...(workOrdersDesc ?? [])].reverse();

  const ids = workOrders.map((w) => w.id);
  const { data: auditRows } = ids.length
    ? await supabase
        .from("audit_logs")
        .select("entity_id, metadata")
        .eq("event_type", "ai_command_executed")
        .in("entity_id", ids)
    : { data: [] };

  const auditByWorkOrder = new Map((auditRows ?? []).map((a) => [a.entity_id, a.metadata as Record<string, number>]));

  return workOrders.map((w) => {
    const usageRow = Array.isArray(w.model_usage) ? w.model_usage[0] : w.model_usage;
    const metadata = auditByWorkOrder.get(w.id);
    const output = w.output as { summary?: string; error?: string } | null;
    return {
      workOrderId: w.id,
      createdAt: w.created_at ?? "",
      command: w.command,
      status: w.status ?? "queued",
      output,
      modelName: usageRow?.model_name ?? null,
      inputTokens: usageRow?.input_tokens ?? 0,
      outputTokens: usageRow?.output_tokens ?? 0,
      estimatedCostUsd: Number(usageRow?.estimated_cost_usd ?? 0),
      counts: metadata
        ? {
            tasks: metadata.tasks ?? 0,
            approvals: metadata.approvals ?? 0,
            deletedTasks: metadata.deletedTasks ?? 0,
            companies: metadata.companies ?? 0,
            people: metadata.people ?? 0,
            projects: metadata.projects ?? 0,
            goals: metadata.goals ?? 0,
            companyRelationships: metadata.companyRelationships ?? 0,
            personAssignments: metadata.personAssignments ?? 0,
            memories: metadata.memories ?? 0,
          }
        : null,
    };
  });
}
