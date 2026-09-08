// VERIFIER #48 — reproduce #46's exact V46-D1 shape, properly warmed, and extend it.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
const SRC = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const N = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const body = N.map((n) => detype(extractConst(SRC, n))).join('\n');
const R = new Function('const knownEntityNames = new Set();\n' + body + '\nreturn readsAsCompletion;')();

const unit = 'No Limits Inc was archived and Never Summer Industries was archived and ';
const mk = (L) => { let s = ''; while (s.length < L) s += unit; return s.slice(0, L); };

// warm-up
for (let i = 0; i < 100; i++) R(mk(500));
const pts = [];
for (const L of [500, 1000, 2000, 4000, 8000, 16000]) {
  const s = mk(L);
  R(s);
  const reps = L <= 2000 ? 10 : 3;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) R(s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps;
  pts.push([L, ms]);
  console.log('  ' + String(L).padStart(6) + ' chars: ' + ms.toFixed(3) + ' ms');
}
let e = 0; let k = 0;
for (let i = 1; i < pts.length; i++) { e += Math.log(pts[i][1] / pts[i - 1][1]) / Math.log(pts[i][0] / pts[i - 1][0]); k++; }
console.log('  mean e over the whole sweep = ' + (e / k).toFixed(2));
const e14 = Math.log(pts[3][1] / pts[1][1]) / Math.log(4);
console.log("  #46's own two-point estimate (1 KB -> 4 KB) = " + e14.toFixed(2));
const e816 = Math.log(pts[5][1] / pts[4][1]) / Math.log(2);
console.log('  asymptotic estimate (8 KB -> 16 KB)         = ' + e816.toFixed(2));
console.log('  worst measured absolute cost: ' + pts[pts.length - 1][1].toFixed(2) + ' ms at ' + pts[pts.length - 1][0] + ' chars');
