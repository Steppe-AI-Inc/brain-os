import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
