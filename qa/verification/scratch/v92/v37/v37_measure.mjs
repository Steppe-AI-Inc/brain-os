// VERIFIER #37 — four-quadrant differential of candidate vs deployed v92 on my own corpus.
import { writeFileSync } from 'node:fs';
import { makeGate, makeV92 } from './v37_harness.mjs';
import { ROWS, SECTIONS } from './v37_corpus.mjs';
const g = makeGate(); const v = makeV92();
const out = [];
for (const [sec, kind, s] of ROWS) {
  const v92 = v.decide({ summary: s });               // v92 destroys/corrects on a bare ungrounded turn
  const cand = g.destroyed(s);                         // candidate destroys/corrects on the same turn
  const candRewrite = g.decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
  let q;
  if (kind === 'T') q = cand && !v92 ? 'TRUTH_REGRESSION' : cand && v92 ? 'shared_loss' : !cand && v92 ? 'truth_rescued' : 'preserved_both';
  else q = !cand && v92 ? 'FAB_REGRESSION' : cand && !v92 ? 'fab_improvement' : cand && v92 ? 'caught_both' : 'shared_miss';
  out.push({ sec, kind, s, v92, cand, candRewrite, q });
}
const counts = {};
for (const r of out) { counts[r.sec] ??= {}; counts[r.sec][r.q] = (counts[r.sec][r.q] || 0) + 1; }
console.log('rows', out.length, 'T', out.filter((r) => r.kind === 'T').length, 'F', out.filter((r) => r.kind === 'F').length);
for (const sec of SECTIONS) console.log(sec.padEnd(11), JSON.stringify(counts[sec]));
const tr = out.filter((r) => r.q === 'TRUTH_REGRESSION'), fr = out.filter((r) => r.q === 'FAB_REGRESSION');
console.log('\nTRUTH REGRESSIONS (v92 preserves, candidate destroys):', tr.length);
for (const r of tr) console.log('  [' + r.sec + '] ' + JSON.stringify(r.s));
console.log('FAB REGRESSIONS (v92 corrects, candidate ships):', fr.length);
for (const r of fr) console.log('  [' + r.sec + '] ' + JSON.stringify(r.s));
// candidate-only arms: fabrications v92 misses that the candidate ALSO misses (report only)
const sm = out.filter((r) => r.q === 'shared_miss');
console.log('shared misses (neither catches):', sm.length); for (const r of sm) console.log('  [' + r.sec + '] ' + JSON.stringify(r.s));
const sl = out.filter((r) => r.q === 'shared_loss' && (r.sec.startsWith('A3') || r.sec.startsWith('NEG')));
console.log('shared losses in attack/negname sections (both destroy):', sl.length); for (const r of sl) console.log('  [' + r.sec + '] ' + JSON.stringify(r.s));
const rw = out.filter((r) => r.kind === 'T' && !r.cand && r.candRewrite);
console.log('truths that ship on claims:null but rewrite on claims:[] (structured-mode only):', rw.length);
writeFileSync(new URL('./v37_measure_result.json', import.meta.url), JSON.stringify({ counts, rows: out }, null, 1));
process.exit(tr.length + fr.length ? 1 : 0);
