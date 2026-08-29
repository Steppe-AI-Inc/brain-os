"use client";

export type ChatResult = {
  summary: string;
  taskCount: number;
  approvalCount: number;
  deletedCount: number;
  companyCount: number;
  personCount: number;
  projectCount: number;
  goalCount: number;
  relationshipCount: number;
  assignmentCount: number;
  memoryCount: number;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  // Only set when the command was unambiguously about one company — used to backfill a
  // freshly-created channel's company_id (KNOWN_FAILURE_MODES.md #7). Null otherwise.
  primaryCompanyId: string | null;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "ai_command_run"; id: string }
  | { type: "usage"; input_tokens?: number; output_tokens?: number }
  | {
      type: "done";
      result?: { summary?: string };
      createdTasks?: unknown[];
      createdApprovals?: unknown[];
      deletedTaskIds?: unknown[];
      createdCompanies?: unknown[];
      createdPeople?: unknown[];
      createdProjects?: unknown[];
      createdGoals?: unknown[];
      createdCompanyRelationships?: unknown[];
      createdPersonAssignments?: unknown[];
      createdMemories?: unknown[];
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number } | null;
      primaryCompanyId?: string | null;
    }
  | { type: "error"; error?: string };

// Consumes the /chat/stream SSE response, invoking onEvent for each frame. Resolves once
// the stream ends (after a `done`/`error` event, or a transport-level failure — the
// latter is surfaced as a synthetic `error` event so callers only need one code path).
export async function consumeChatStream(
  command: string,
  onEvent: (evt: StreamEvent) => void,
  channelId?: string | null,
  image?: { base64: string; mimeType: string } | null
): Promise<void> {
  try {
    const res = await fetch("/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command,
        channelId: channelId ?? null,
        ...(image ? { imageBase64: image.base64, imageMimeType: image.mimeType } : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let message = `Request failed (${res.status})`;
      try {
        message = JSON.parse(text).error || message;
      } catch {
        // non-JSON error body, keep the generic message
      }
      onEvent({ type: "error", error: message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminalEvent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw) as StreamEvent;
          if (evt.type === "done" || evt.type === "error") sawTerminalEvent = true;
          onEvent(evt);
        } catch {
          // malformed frame, skip
        }
      }
    }

    // The connection can end (a platform execution limit, a network drop) without ever
    // sending done/error — verified live on a long multi-ticket generation. Without this,
    // every caller silently reverts to idle with zero feedback while the server-side
    // work may have actually completed. Surface something actionable instead.
    if (!sawTerminalEvent) {
      onEvent({
        type: "error",
        error: "Connection ended before this finished — it may still be running. Check Tasks/Approvals for the result.",
      });
    }
  } catch (e) {
    onEvent({ type: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function toChatResult(evt: Extract<StreamEvent, { type: "done" }>): ChatResult {
  return {
    summary: evt.result?.summary || "Command executed.",
    taskCount: evt.createdTasks?.length ?? 0,
    approvalCount: evt.createdApprovals?.length ?? 0,
    deletedCount: evt.deletedTaskIds?.length ?? 0,
    companyCount: evt.createdCompanies?.length ?? 0,
    personCount: evt.createdPeople?.length ?? 0,
    projectCount: evt.createdProjects?.length ?? 0,
    goalCount: evt.createdGoals?.length ?? 0,
    relationshipCount: evt.createdCompanyRelationships?.length ?? 0,
    assignmentCount: evt.createdPersonAssignments?.length ?? 0,
    memoryCount: evt.createdMemories?.length ?? 0,
    model: evt.model || "unknown",
    usage: evt.usage
      ? { input_tokens: evt.usage.input_tokens ?? 0, output_tokens: evt.usage.output_tokens ?? 0 }
      : null,
    primaryCompanyId: evt.primaryCompanyId ?? null,
  };
}
