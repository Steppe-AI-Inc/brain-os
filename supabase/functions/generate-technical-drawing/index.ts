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

// SVG markup is full of double quotes (attribute values), which makes asking a model to
// nest it inside a JSON string fragile — a single unescaped quote in the model's output
// breaks JSON.parse with no good recovery. A delimiter-based format sidesteps the whole
// class of problem: each field is plain text between markers, no escaping required.
function parseDelimitedResponse(rawText: string): { title: string; dimensionsSummary: string; notes: string; svg: string } {
  const titleMatch = rawText.match(/TITLE:\s*(.*)/);
  const dimensionsMatch = rawText.match(/DIMENSIONS:\s*(.*)/);
  const notesMatch = rawText.match(/NOTES:\s*(.*)/);
  const svgStart = rawText.indexOf('<svg');
  const svgEnd = rawText.lastIndexOf('</svg>');
  const svg = svgStart !== -1 && svgEnd !== -1 ? rawText.slice(svgStart, svgEnd + '</svg>'.length) : '';
  return {
    title: (titleMatch?.[1] || '').trim(),
    dimensionsSummary: (dimensionsMatch?.[1] || '').trim(),
    notes: (notesMatch?.[1] || '').trim(),
    svg,
  };
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
- Prefer single-quoted attribute values inside the SVG (e.g. width='100') over double-quoted.

Respond in EXACTLY this plain-text format, no markdown code fences, nothing before or after:

TITLE: <short title>
DIMENSIONS: <one short line, e.g. "24m x 15m lot, 18 standard stalls, 4 EV stalls, 6m aisle">
NOTES: <one short line of assumptions you had to make, or "None">
SVG:
<the complete <svg>...</svg> markup, starting with <svg and ending with </svg>>`;

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
        max_tokens: 8192,
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
    const result = parseDelimitedResponse(text);
    if (!result.svg || !result.svg.includes('</svg>')) {
      return json({ error: 'Model did not return valid SVG markup', raw: text.slice(0, 2000) }, 502);
    }
    result.svg = sanitizeSvg(result.svg);
    return json({ result });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
