// Brain OS v0.7 Supabase Edge Function: analyze-financial-document
// Small, single-purpose — same shape as embed-text. Takes an uploaded document's bytes
// (already base64, from the caller's in-memory File), sends it to Claude for structured
// financial extraction, and returns strict JSON. Does NOT touch the database — the
// calling Server Action (web/lib/data/finance.ts) does the actual writes, mirroring how
// embed-text is a stateless "do one external-API thing" function.
//
// Required secret: ANTHROPIC_API_KEY (the one confirmed live/active this session — not
// the currently-selectable chat provider, which may be OpenAI).
//
// PDF support is real, not assumed: Claude's Messages API accepts a `document` content
// block with a base64-encoded PDF and reads it natively (text, layout, charts) —
// verified live against platform.claude.com/docs before building this, which lists
// "Analyzing financial reports and understanding charts/tables" as a sample use case.
// Plain text/CSV is simpler: decoded and sent as a normal text block, no document type
// needed. Binary formats other than PDF (e.g. .xlsx) are not supported here.
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

const SYSTEM_PROMPT = `You are the AI CFO / Bookkeeper for a founder-led multi-company holding system.
You are given one uploaded financial document (a statement, P&L export, or similar) for one company.
Extract what is actually present in the document. Do not invent numbers that are not there — use null for anything you cannot find.
Return strict JSON only, no markdown, in exactly this shape:
{
  "revenue": number|null,
  "expenses": number|null,
  "netIncome": number|null,
  "cashPosition": number|null,
  "healthStatus": "healthy"|"watch"|"at_risk"|"unknown",
  "notableFlags": [string],
  "summary": string
}
healthStatus rules: "healthy" only if net income is positive and no serious red flags; "watch" if figures are thin, declining, or ambiguous; "at_risk" if net income is meaningfully negative or cash position looks dangerously low; "unknown" only if the document doesn't contain enough real financial data to judge. notableFlags are short bullet-style strings (e.g. "Expenses grew 40% month over month", "No cash balance disclosed"). summary is one paragraph in plain language a non-accountant founder can read at a glance.`;

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

  let base64: string, mimeType: string, companyName: string, period: string;
  try {
    const body = await req.json();
    base64 = String(body.base64 || '');
    mimeType = String(body.mimeType || '').toLowerCase();
    companyName = String(body.companyName || 'the company');
    period = String(body.period || '');
    if (!base64) return json({ error: 'Missing base64 file content' }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 503);

  const isPdf = mimeType === 'application/pdf';
  const isText = mimeType.startsWith('text/') || mimeType === 'application/csv';
  if (!isPdf && !isText) {
    return json({ error: `Unsupported file type "${mimeType}" — only PDF and plain text/CSV are supported.` }, 400);
  }

  const promptText = `Company: ${companyName}${period ? `\nPeriod: ${period}` : ''}\n\nAnalyze the attached financial document and return the strict JSON described in your instructions.`;
  const content = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: promptText },
      ]
    : [
        { type: 'text', text: `${promptText}\n\nDocument content:\n${atob(base64)}` },
      ];

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
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        temperature: 0.1,
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
    return json({ result });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
