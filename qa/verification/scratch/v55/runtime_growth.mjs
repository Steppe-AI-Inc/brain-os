// VERIFIER #55 — the "cubic growth (e≈2.97) on one unsplittable clause carrying skipped negators" open
// item. One clause (no sentence punctuation, no comma, no newline), every negator in a skipped position
// (name-internal capitalised run governed by an auxiliary), doubling length; wall-clock per call of
// readsAsCompletion on the REAL belt. Also the practical ceiling: 8192 tokens ~ 32k chars.
import { buildBelt } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const belt = buildBelt(CAND, { names: ['No Limits Inc'] });
// unit: a skipped negator (nameInternal via capLead+subjectRun) repeated with no clause boundary
const unit = 'No Limits Inc has been reviewed and Nothing Bundt Cakes was reviewed and ';
function time(fn, reps = 3) { let best = Infinity; for (let i = 0; i < reps; i++) { const t = process.hrtime.bigint(); fn(); const d = Number(process.hrtime.bigint() - t) / 1e6; if (d < best) best = d; } return best; }
const pts = [];
for (let k = 8; k <= 512; k *= 2) {
  const s = unit.repeat(k) + 'ACME Holdings was archived';
  const ms = time(() => belt.readsAsCompletion(s));
  pts.push([s.length, ms]);
  console.log('chars', String(s.length).padStart(7), 'negators', String(2 * k).padStart(5), 'ms', ms.toFixed(1));
}
for (let i = 1; i < pts.length; i++) {
  const e = Math.log(pts[i][1] / pts[i - 1][1]) / Math.log(pts[i][0] / pts[i - 1][0]);
  console.log('exponent between', pts[i - 1][0], 'and', pts[i][0], '=', e.toFixed(2));
}
// second shape: negators in a non-skipped position but many of them (each breaks early) — control
const unit2 = 'nothing here and ';
const s2 = unit2.repeat(1800) + 'ACME Holdings was archived';
console.log('control (early-break negator) chars', s2.length, 'ms', time(() => belt.readsAsCompletion(s2)).toFixed(1));
// third: 32k chars of ordinary prose, punctuated
const s3 = 'ACME Holdings is a company in Ulaanbaatar with several active tasks. '.repeat(450) + 'Nothing was archived.';
console.log('punctuated prose chars', s3.length, 'ms', time(() => belt.readsAsCompletion(s3)).toFixed(1));
