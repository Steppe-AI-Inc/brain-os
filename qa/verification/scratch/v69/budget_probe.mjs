// VERIFIER #69 — carried founder mandate §1/§4/§5, measured rather than asserted.
//  (a) every TRIM_ORDER key must carry an envelope, or a trim drops rows with no truncated flag.
//  (b) headroom: the pack budget, the real .limit() caps, the system prompt, the model window.
import fs from 'node:fs';
const src = fs.readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n?/g, '\n');

const toStart = src.indexOf('const TRIM_ORDER');
const trimKeys = [...src.slice(toStart, src.indexOf('];', toStart)).matchAll(/\['([a-zA-Z]+)',/g)].map((m) => m[1]);

// brace-match the collections object literal
const ci = src.indexOf('const collections = {');
let depth = 0, end = ci;
for (let i = src.indexOf('{', ci); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const seg = src.slice(ci, end + 1);
const envKeys = new Set([...seg.matchAll(/(?:^|[,{\s])([a-zA-Z]+)\s*:/gm)].map((m) => m[1]));
const missing = trimKeys.filter((k) => !envKeys.has(k));
console.log('TRIM_ORDER keys: ' + trimKeys.length);
console.log('collections envelope keys: ' + envKeys.size);
console.log('TRIM_ORDER keys WITHOUT an envelope: ' + JSON.stringify(missing));

const promptStart = src.indexOf('const SYSTEM_PROMPT = `');
const promptEnd = src.indexOf('`;', promptStart);
const promptChars = promptEnd - (promptStart + 'const SYSTEM_PROMPT = `'.length);
const promptTokens = Math.ceil(promptChars / 4);
const packBudget = Math.max(2000, 12000 - 600);
console.log('\nSYSTEM_PROMPT tokens ' + promptTokens + '   packBudget ' + packBudget + '   modelContextMax default 180000');

// Worst case the pack budget permits: the pack is trimmed to <= packBudget in COMPACT form; the request
// gate measures the PRETTY-PRINTED body (JSON.stringify(x,null,2)) + prompt. Measure the real inflation
// factor on a pack-shaped fixture at the real .limit() caps.
const row = (i, extra = {}) => ({ id: '11111111-1111-4111-8111-' + String(i).padStart(12, '0'), name: 'QA-VERIFY Entity ' + i + ' Holding Group LLC', status: 'active', created_at: '2026-09-09T00:00:00.000Z', description: 'x'.repeat(120), ...extra });
const caps = { companies: 50, people: 30, tasks: 15, goals: 20, projects: 20, departments: 30, leads: 30, documents: 30, approvals: 20, memories: 8, conversationHistory: 4 };
const pack = {};
for (const [k, n] of Object.entries(caps)) pack[k] = Array.from({ length: n }, (_, i) => row(i));
const command = 'archive the old duplicate work order WO-1 and tell me what is left';
const compact = JSON.stringify({ command, contextPack: pack }).length;
const pretty = JSON.stringify({ profile: { id: 'p', role: 'founder' }, command, contextPack: pack }, null, 2).length;
console.log('fixture at real caps: compact tokens ' + Math.ceil(compact / 4) + '  pretty+prompt tokens ' + (promptTokens + Math.ceil(pretty / 4)));
console.log('inflation compact->pretty: ' + (pretty / compact).toFixed(2) + 'x');
// The worst request the pack gate can let through: a pack exactly at the budget, inflated, plus the prompt.
const worst = promptTokens + Math.ceil(packBudget * 4 * (pretty / compact) / 4);
console.log('worst request the pack gate permits ~ ' + worst + ' tokens vs modelContextMax 180000  => headroom ' + (180000 - worst));
console.log('same worst case vs a 32k-window model: headroom ' + (32000 - worst) + (32000 - worst < 0 ? '  <-- WOULD HARD STOP' : ''));
console.log('same worst case vs a 128k-window model: headroom ' + (128000 - worst));
