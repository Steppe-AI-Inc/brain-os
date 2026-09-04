import { detype } from './x.mjs';
import fs from 'node:fs';
const src = fs.readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const a = src.indexOf('const FUTURE_PROMISE_PATTERN');
const ifIdx = src.indexOf('if (rewriteFromStructure)', a);
const walk = (from) => { let d = 0; for (let k = src.indexOf('{', from); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return k + 1; } } };
let end = walk(ifIdx); if (/^\s*else\s+if\s*\(/.test(src.slice(end, end + 40))) end = walk(end);
const body = detype(src.slice(a, end));
fs.writeFileSync('qa/verification/scratch/v19/gate_slice.js', body);
const seen = new Set();
const env = new Proxy({
  model: 'gpt-x', result: { summary: 'ACME was archived.', pendingAction: null },
  groundedOutcomeThisTurn: false, factLines: [], hasExecutionEvidence: false, proposedPlan: null,
  lifecycleMismatchCorrections: [], command: 'archive acme', claimExecutionEvidence: [],
  organizationGraphCheck: null, contextCompanies: [], contextPeople: [], contextTasks: [], contextGoals: [], lifecycleReports: [], contextPack: {}, stateClaimCorrections: [], Deno: { env: { get: () => undefined } }, deletionAttempted: false, permanentDeleteReports: [], workOrderReports: [],
}, {
  has: (t, k) => (k in t) || !(k in globalThis),
  get: (t, k) => { if (k in t) return t[k]; if (typeof k === 'string') seen.add(k); return undefined; },
});
try { new Function('$e', 'with($e){' + body + '\n}')(env); } catch (e) { console.log('THROW:', e.message); }
console.log('UNKNOWN NAMES READ:', [...seen].filter((n) => !['console', 'Object', 'Array', 'String', 'Number', 'Map', 'Set', 'JSON', 'RegExp', 'Math', 'Symbol', 'undefined'].includes(n)).join(' '));
