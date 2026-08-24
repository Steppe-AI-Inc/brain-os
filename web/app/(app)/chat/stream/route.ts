import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryExecuteBoardCommand } from "@/lib/board-command";

// Thin auth-forwarding proxy to the sem-ai-command Edge Function's SSE stream.
// Deliberately a Route Handler, not a Server Action — decouples chat entirely from
// Next.js's Server Action/transition machinery so a long-running generation can't read
// as the whole app being frozen.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return new Response(JSON.stringify({ error: "Not signed in." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  let command = "";
  try {
    const payload = JSON.parse(body) as { command?: unknown };
    command = typeof payload.command === "string" ? payload.command.trim() : "";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid command payload." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!command) {
    return new Response(JSON.stringify({ error: "Command is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Deterministic board actions share the same database/RLS boundary as the manual UI.
  // Commands outside this narrow, validated grammar continue to the AI orchestrator.
  const boardOutcome = await tryExecuteBoardCommand(command);
  if (boardOutcome) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "delta", text: boardOutcome.summary })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              result: { summary: boardOutcome.summary },
              createdActions: boardOutcome.actions,
              model: "SEM deterministic",
              usage: { input_tokens: 0, output_tokens: 0 },
            })}\n\n`
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const edgeRes = await fetch(`${url}/functions/v1/sem-ai-command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  });

  if (!edgeRes.ok || !edgeRes.body) {
    const text = await edgeRes.text().catch(() => "");
    return new Response(JSON.stringify({ error: text || `Edge Function error ${edgeRes.status}` }), {
      status: edgeRes.status || 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(edgeRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
