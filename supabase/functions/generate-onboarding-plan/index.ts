// Brain OS v0.7 Supabase Edge Function: generate-onboarding-plan
// Same shape as analyze-financial-document — stateless, one external-API call, the
// caller (web/lib/data/onboarding.ts) does the DB writes. Founder's ask: "generate your
// own education system and material... utilize full AI power" so a senior person
// doesn't have to spend weeks training each new hire in person. Grounded in real company
// documents/goals/tasks passed in by the caller (already RLS-scoped), not invented.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

const SYSTEM_PROMPT = `You are Brain OS's onboarding designer. You are given a new hire's name, role, company, and a digest of REAL material already on file for that company (documents, recent goals, recent tasks). Build a concrete 1-week induction plan grounded in that material — reference actual document titles/goals/tasks where relevant rather than generic advice. Where the provided material doesn't cover something the role clearly needs, say so explicitly rather than inventing specifics.
Return strict JSON only, no markdown, in exactly this shape:
{
  "roleSummary": string,
  "keyResponsibilities": [string],
  "week1Plan": [{ "day": string, "focus": string, "activities": [string], "resources": [string] }],
  "quiz": [{ "question": string, "expectedAnswerGuidance": string }],
  "certificationCriteria": string,
  "gaps": [string]
}
week1Plan should have exactly 5 entries (Day 1 through Day 5). quiz should have 5-8 questions that test real comprehension of the role and the provided material, not trivia. certificationCriteria is one paragraph describing what "passing" looks like before this person gets more authority/a stronger contract. gaps lists anything the role clearly needs that wasn't found in the provided material (e.g. "No approved brochure on file for this role — flag to the outgoing/senior person").`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing Authorization bearer token' }, 401);

  let personName: string, roleTitle: string, companyName: string, digest: string;
  try {
    const body = await req.json();
    personName = String(body.personName || '');
    roleTitle = String(body.roleTitle || '');
    companyName = String(body.companyName || '');
    digest = String(body.digest || '');
    if (!personName || !roleTitle) return json({ error: 'Missing personName or roleTitle' }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not configured' }, 503);

  const promptText = `New hire: ${personName}\nRole: ${roleTitle}\nCompany: ${companyName}\n\nReal material on file for this company:\n${digest || '(none found)'}\n\nBuild the induction plan described in your instructions.`;

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
        messages: [{ role: 'user', content: promptText }],
        temperature: 0.3,
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
