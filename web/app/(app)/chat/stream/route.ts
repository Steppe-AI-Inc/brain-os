import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryExecuteBoardCommand } from "@/lib/board-command";

type ProfileRow = { id: string };
type ThreadRow = { id: string; title: string };
type SseEvent = {
  type?: string;
  text?: string;
  error?: string;
  result?: { summary?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  [key: string]: unknown;
};

function untyped(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function titleFromCommand(command: string): string {
  const clean = command.replace(/\s+/g, " ").trim();
  return clean.length <= 72 ? clean : clean.slice(0, 69).trimEnd() + "…";
}

function sse(event: unknown): Uint8Array {
  return new TextEncoder().encode("data: " + JSON.stringify(event) + "\n\n");
}

async function resolveThread(
  db: SupabaseClient,
  profileId: string,
  requestedId: string | null,
  command: string
): Promise<ThreadRow | null> {
  if (requestedId) {
    const { data, error } = await db
      .from("chat_threads")
      .select("id, title")
      .eq("id", requestedId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as ThreadRow | null;
  }

  const { data, error } = await db
    .from("chat_threads")
    .insert({
      created_by_profile_id: profileId,
      title: titleFromCommand(command),
      last_message_at: new Date().toISOString(),
    })
    .select("id, title")
    .single();
  if (error) throw error;
  return data as ThreadRow;
}

async function persistMessage(
  db: SupabaseClient,
  values: {
    threadId: string;
    profileId: string;
    role: "user" | "assistant";
    content: string;
    status: "done" | "error";
    result?: Record<string, unknown> | null;
    usage?: Record<string, unknown> | null;
    error?: string | null;
  }
) {
  const { error } = await db.from("chat_messages").insert({
    thread_id: values.threadId,
    author_profile_id: values.profileId,
    role: values.role,
    content: values.content,
    status: values.status,
    result: values.result ?? null,
    usage: values.usage ?? null,
    error: values.error ?? null,
  });
  if (error) throw error;

  const { error: threadError } = await db
    .from("chat_threads")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.threadId);
  if (threadError) throw threadError;
}

function parseFrames(
  buffer: string,
  onEvent: (event: SseEvent) => void,
  flush = false
): string {
  const lines = buffer.split("\n");
  const remaining = flush ? "" : lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      onEvent(JSON.parse(raw) as SseEvent);
    } catch {
      // Keep proxying malformed upstream frames; valid frames still persist.
    }
  }
  return remaining;
}

export async function POST(req: NextRequest) {
  const typedClient = await createClient();
  const db = untyped(typedClient);
  const {
    data: { session },
  } = await typedClient.auth.getSession();

  if (!session) return jsonError("Not signed in.", 401);

  let command = "";
  let requestedThreadId: string | null = null;
  try {
    const payload = (await req.json()) as { command?: unknown; threadId?: unknown };
    command = typeof payload.command === "string" ? payload.command.trim() : "";
    requestedThreadId =
      typeof payload.threadId === "string" && payload.threadId.trim()
        ? payload.threadId.trim()
        : null;
  } catch {
    return jsonError("Invalid command payload.", 400);
  }
  if (!command) return jsonError("Command is required.", 400);

  const { data: profileData, error: profileError } = await db
    .from("profiles")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .single();
  if (profileError || !profileData) return jsonError("Founder profile is unavailable.", 403);
  const profile = profileData as ProfileRow;

  let thread: ThreadRow | null;
  try {
    thread = await resolveThread(db, profile.id, requestedThreadId, command);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Conversation could not be opened.", 500);
  }
  if (!thread) return jsonError("Conversation was not found or is not yours.", 404);

  try {
    await persistMessage(db, {
      threadId: thread.id,
      profileId: profile.id,
      role: "user",
      content: command,
      status: "done",
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Message could not be saved.", 500);
  }

  const boardOutcome = await tryExecuteBoardCommand(command);
  if (boardOutcome) {
    const doneEvent = {
      type: "done",
      result: { summary: boardOutcome.summary },
      createdActions: boardOutcome.actions,
      model: "SEM deterministic",
      usage: { input_tokens: 0, output_tokens: 0 },
    };

    try {
      await persistMessage(db, {
        threadId: thread.id,
        profileId: profile.id,
        role: "assistant",
        content: boardOutcome.summary,
        status: "done",
        result: doneEvent,
        usage: doneEvent.usage,
      });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Assistant reply could not be saved.", 500);
    }

    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(sse({ type: "thread", threadId: thread!.id, title: thread!.title }));
          controller.enqueue(sse({ type: "delta", text: boardOutcome.summary }));
          controller.enqueue(sse(doneEvent));
          controller.close();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return jsonError("Supabase Edge Function configuration is missing.", 500);

  const edgeRes = await fetch(url + "/functions/v1/sem-ai-command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: "Bearer " + session.access_token,
    },
    body: JSON.stringify({ command }),
  });

  if (!edgeRes.ok || !edgeRes.body) {
    const text = await edgeRes.text().catch(() => "");
    const message = text || "Edge Function error " + edgeRes.status;
    await persistMessage(db, {
      threadId: thread.id,
      profileId: profile.id,
      role: "assistant",
      content: message,
      status: "error",
      error: message,
    }).catch(() => undefined);
    return jsonError(message, edgeRes.status || 500);
  }

  const reader = edgeRes.body.getReader();
  const decoder = new TextDecoder();
  const activeThread = thread;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let accumulated = "";
      let finalEvent: SseEvent | null = null;
      let errorEvent: SseEvent | null = null;

      const observe = (event: SseEvent) => {
        if (event.type === "delta" && typeof event.text === "string") {
          accumulated += event.text;
        } else if (event.type === "done") {
          finalEvent = event;
        } else if (event.type === "error") {
          errorEvent = event;
        }
      };

      controller.enqueue(
        sse({ type: "thread", threadId: activeThread.id, title: activeThread.title })
      );

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });
          buffer = parseFrames(buffer, observe);
        }
        buffer += decoder.decode();
        parseFrames(buffer + "\n", observe, true);

        const finished = finalEvent as SseEvent | null;
        const failed = errorEvent as SseEvent | null;
        const summary =
          finished?.result?.summary ||
          accumulated.trim() ||
          failed?.error ||
          "Command completed.";

        await persistMessage(db, {
          threadId: activeThread.id,
          profileId: profile.id,
          role: "assistant",
          content: summary,
          status: failed ? "error" : "done",
          result: finished ? (finished as Record<string, unknown>) : null,
          usage: finished?.usage ? (finished.usage as Record<string, unknown>) : null,
          error: failed?.error ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat stream failed.";
        await persistMessage(db, {
          threadId: activeThread.id,
          profileId: profile.id,
          role: "assistant",
          content: message,
          status: "error",
          error: message,
        }).catch(() => undefined);
        controller.enqueue(sse({ type: "error", error: message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}