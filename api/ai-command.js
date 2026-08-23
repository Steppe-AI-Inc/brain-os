// Vercel Serverless Function: /api/ai-command
// Keep OPENAI_API_KEY in Vercel environment variables. Never expose it in browser code.
import { timingSafeEqual } from 'node:crypto';

// This endpoint has no user session (unlike supabase/functions/sem-ai-command, which
// checks a real per-user Supabase JWT) — without some check, anyone who finds this URL
// can burn the project's OpenAI budget with arbitrary prompts. AI_COMMAND_SHARED_SECRET
// is a stop-gap, not real per-user auth: fails closed if unset, and rejects requests
// whose x-sem-ai-key header doesn't match, using a constant-time comparison.
function verifySharedSecret(providedKey) {
  const expected = process.env.AI_COMMAND_SHARED_SECRET;
  if (!expected) return false;
  const a = Buffer.from(String(providedKey || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const SYSTEM_PROMPT = `You are SEM Brain Real AI Backend v0.6.
You convert one founder command into small atomic tasks for a multi-company operating brain.
Return strict JSON only. Do not include markdown.
Every task must be narrow, testable, have owner type, risk level, approval requirement, acceptance criteria and test method.
High-risk actions involving external messages, salary, HR, legal, money, production systems, contracts, publishing, or deletion require approvalRequired true.
Use only provided contextPack. If information is missing, create a clarification or research task instead of inventing facts.
Output JSON schema:
{
  "strategicGoal": string,
  "summary": string,
  "riskLevel": "low"|"medium"|"high"|"critical",
  "tasks": [
    {
      "title": string,
      "description": string,
      "companyId": string|null,
      "projectId": string|null,
      "ownerType": "agent"|"human",
      "ownerAgentId": string|null,
      "ownerPersonId": string|null,
      "status": "queued"|"needs_approval",
      "priority": "low"|"medium"|"high"|"critical",
      "riskLevel": "low"|"medium"|"high"|"critical",
      "approvalRequired": boolean,
      "expectedOutput": {"type": string},
      "acceptanceCriteria": [string],
      "testMethod": [string]
    }
  ],
  "approvals": [],
  "memories": []
}`;

function extractText(responseJson) {
  if (typeof responseJson.output_text === 'string') return responseJson.output_text;
  const out = responseJson.output || [];
  for (const item of out) {
    const content = item.content || [];
    for (const c of content) if (c.type === 'output_text' && c.text) return c.text;
  }
  return JSON.stringify(responseJson);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifySharedSecret(req.headers['x-sem-ai-key'])) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { command, contextPack, tokenPlan } = req.body || {};
    if (!command) return res.status(400).json({ error: 'Missing command' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server' });

    const model = process.env.OPENAI_MODEL || tokenPlan?.model || 'gpt-4.1-mini';
    const body = {
      model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ command, contextPack, tokenPlan }, null, 2) }
      ],
      temperature: 0.2
    };

    const apiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const json = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: json.error?.message || 'OpenAI API error', details: json });
    const text = extractText(json).trim();
    let result;
    try { result = JSON.parse(text); }
    catch (e) { return res.status(502).json({ error: 'Model returned invalid JSON', raw: text }); }
    return res.status(200).json({ result, model, usage: json.usage || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
