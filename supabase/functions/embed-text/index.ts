// Brain OS v0.7 Supabase Edge Function: embed-text
// Tiny, single-purpose function so the Next.js app can get an embedding for a manually
// created memory (web/lib/data/memory.ts's createMemory()) without ever holding an
// OpenAI key itself — the real key only ever lives as this Edge Function's secret, same
// boundary already documented for chat (see providers-panel.tsx). Called via the
// Supabase JS client's `functions.invoke()`, which forwards the caller's session
// automatically.
//
// Required secret: OPENAI_API_KEY (same one sem-ai-command already uses for chat
// channel / memory RAG embeddings).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing Authorization bearer token' }, 401);

  // Auth-gated (any authenticated user may embed text for their own memory creation) —
  // this function has no side effects on the database, it only calls out to OpenAI and
  // returns the vector, so no RLS/role check beyond "is a real logged-in user" is needed.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: 'Invalid user session' }, 401);

  let text: string;
  try {
    const body = await req.json();
    text = String(body.text || '').trim();
    if (!text) return json({ error: 'Missing text' }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }

  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: 'OPENAI_API_KEY is not configured' }, 503);

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      return json({ error: errBody?.error?.message || `OpenAI embeddings request failed (${r.status})` }, 502);
    }
    const body = await r.json();
    const embedding = body?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return json({ error: 'OpenAI response had no embedding' }, 502);
    return json({ embedding });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
