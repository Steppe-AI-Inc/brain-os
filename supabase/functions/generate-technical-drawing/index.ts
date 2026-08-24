// Brain OS v0.7 Supabase Edge Function: generate-technical-drawing
// The founder's "engineering factory" ask (parking spot / EV charging station layouts)
// is real parametric CAD in the ideal case, but that's a fundamentally different
// capability from anything else in this app and not something to fake. This is the
// honest v1: an AI-generated, labeled, top-down SVG technical diagram from a plain-
// language description — a real technical drawing (scaled, dimensioned, labeled), just
// not CAD-file (DXF/DWG) output. Framed that way in the UI, not oversold.
//
// Same small/stateless shape as analyze-financial-document: does the one external-API
// thing, returns structured JSON, does not touch the database.
//
// Required secret: ANTHROPIC_API_KEY.
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

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}
function parseModelJson(rawText: string): unknown {
  const fenceStripped = stripCodeFence(rawText);
  try {
    return JSON.parse(fenceStripped);
  } catch (firstError) {
    try {
      return JSON.parse(extractJsonObject(fenceStripped));
    } catch {
      throw firstError;
    }
  }
}

// Defense in depth: even though the prompt forbids it, never trust model-generated
// markup blindly before it's rendered client-side. Strips anything that could execute.
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/(href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, "")
    .replace(/(href|xlink:href)\s*=\s*'javascript:[^']*'/gi, "");
}

const SYSTEM_PROMPT = `You are an AI engineering drafter for a parking/EV-infrastructure company. Given a plain-language description, produce a labeled, scaled, top-down technical diagram as a single self-contained SVG.

Rules for the SVG:
- Root <svg> must have a viewBox (no external width/height dependency) and a white/light background rect.
- Draw to a stated scale (e.g. 1 unit = 1 meter) and put a scale note as <text> on the diagram itself.
- Label every distinct element with <text> (parking stalls, drive aisles, EV charging stalls, entry/exit, dimensions in meters).
- EV charging stalls must be visually distinct (different fill color) and labeled "EV".
- Use only <svg>, <rect>, <circle>, <line>, <path>, <text>, <g>, <polygon>, <polyline> elements. No <script>, no <foreignObject>, no event handler attributes, no external references (no <image>, no url() to an external host).
- Keep it a real, usable layout sketch — correct stall counts, plausible spacing (standard stall ~2.5m x 5m, drive aisle >= 6m), not just decoration.

Return strict JSON only, no markdown, in exactly this shape:
{
  "title": string,
  "svg": string,
  "dimensionsSummary": string,
  "notes": string
}
"svg" is the complete <svg>...</svg> markup as a single string. "dimensionsSummary" is one short line (e.g. "24m x 15m lot, 18 standard stalls, 4 EV stalls, 6m aisle"). "notes" flags any assumptions you had to make because the description didn't specify them.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing Authorization bearer token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return json({ error: 'Invalid user session' }, 401);

  let description: string;
  try {
    const body = await req.json();
    description = String(body.description || '').trim();
    if (!description) return json({ error: 'Missing description' }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 503);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
        temperature: 0.2,
      }),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      return json({ error: errBody?.error?.message || `Anthropic request failed (${r.status})` }, 502);
    }
    const body = await r.json();
    const text = (body.content || []).map((b: any) => b.text || '').join('');
    let result: any;
    try {
      result = parseModelJson(text);
    } catch {
      return json({ error: 'Model returned invalid JSON', raw: text.slice(0, 2000) }, 502);
    }
    if (typeof result.svg !== 'string' || !result.svg.includes('<svg')) {
      return json({ error: 'Model did not return valid SVG markup' }, 502);
    }
    result.svg = sanitizeSvg(result.svg);
    return json({ result });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
