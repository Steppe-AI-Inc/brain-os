"use server";

import { createClient } from "@/lib/supabase/server";

export type ChatResult = {
  summary: string;
  taskCount: number;
  approvalCount: number;
  model: string;
  error?: string;
};

// Always calls the real sem-ai-command Edge Function — no local template fallback.
// Per the rewrite plan: real auth is now mandatory, so there's no reason to keep the
// old app's local-simulation escape hatch around.
export async function runChatCommand(command: string): Promise<ChatResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { summary: "", taskCount: 0, approvalCount: 0, model: "", error: "Not signed in." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await fetch(`${url}/functions/v1/sem-ai-command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ command }),
  });

  const text = await res.text();
  let json: {
    error?: string;
    result?: { summary?: string };
    createdTasks?: unknown[];
    createdApprovals?: unknown[];
    model?: string;
  };
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return {
      summary: "",
      taskCount: 0,
      approvalCount: 0,
      model: "",
      error: `Edge Function returned non-JSON: ${text.slice(0, 200)}`,
    };
  }

  if (!res.ok) {
    return { summary: "", taskCount: 0, approvalCount: 0, model: "", error: json.error || `Edge Function error ${res.status}` };
  }

  return {
    summary: json.result?.summary || "Command executed.",
    taskCount: json.createdTasks?.length ?? 0,
    approvalCount: json.createdApprovals?.length ?? 0,
    model: json.model || "unknown",
  };
}
