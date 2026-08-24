"use client";

export type ChatAction = {
  kind: "board" | "column" | "task";
  label: string;
  href: string;
};

export type ChatResult = {
  summary: string;
  taskCount: number;
  approvalCount: number;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  actions: ChatAction[];
};

export type StreamEvent =
  | { type: "thread"; threadId: string; title: string }
  | { type: "delta"; text: string }
  | { type: "usage"; input_tokens?: number; output_tokens?: number }
  | {
      type: "done";
      result?: { summary?: string };
      createdTasks?: unknown[];
      createdApprovals?: unknown[];
      createdActions?: ChatAction[];
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number } | null;
    }
  | { type: "error"; error?: string };

export async function consumeChatStream(
  command: string,
  threadId: string | null,
  onEvent: (evt: StreamEvent) => void
): Promise<void> {
  try {
    const res = await fetch("/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, threadId }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let message = "Request failed (" + res.status + ")";
      try {
        message = JSON.parse(text).error || message;
      } catch {
        // Keep the transport message for non-JSON responses.
      }
      onEvent({ type: "error", error: message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
          onEvent(JSON.parse(raw) as StreamEvent);
        } catch {
          // Malformed upstream frames are skipped; later valid frames still render.
        }
      }
    }
  } catch (error) {
    onEvent({ type: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

export function toChatResult(evt: Extract<StreamEvent, { type: "done" }>): ChatResult {
  return {
    summary: evt.result?.summary || "Command executed.",
    taskCount:
      evt.createdTasks?.length ??
      evt.createdActions?.filter((action) => action.kind === "task").length ??
      0,
    approvalCount: evt.createdApprovals?.length ?? 0,
    model: evt.model || "unknown",
    usage: evt.usage
      ? { input_tokens: evt.usage.input_tokens ?? 0, output_tokens: evt.usage.output_tokens ?? 0 }
      : null,
    actions: evt.createdActions ?? [],
  };
}