// Resolving the V45-N2 runtime discrepancy: #45 measured 657 ms at 33,639 chars and called the belt
// quadratic; I measured 6.46 ms with linear growth. Two orders of magnitude apart on the same file.
//
// HYPOTHESIS. The belt splits the summary into CLAUSES and runs its per-negator scan loop per clause.
// My input was ordinary prose with sentence punctuation, so it became many SHORT clauses and the
// total came out linear. If the input is ONE LONG CLAUSE — no sentence punctuation to split on — the
// loop runs repeatedly over the whole string and the cost is quadratic. Realistic LLM prose has
// punctuation; a pathological or adversarial summary need not.
//
// This measures four shapes at the same lengths, so the answer is a property of the INPUT rather than
// a disagreement about the file.
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

globalThis.knownEntityNames = new Set();
const ROOT = __ROOT + '';
const cand = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const v92src = ROOT + 'qa/verification/scratch/v92/index.v92.ts';
const { readFileSync } = await import('node:fs');
const PCCP = new Function('return ' + readFileSync(v92src, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();

const SHAPES = {
  'A punctuated prose, no completion vocabulary':
    'The quarterly report covers every department and the staffing plans they submitted. ',
  'B punctuated prose, completion vocabulary + negators':
    'No company was archived and no task was completed, though the record shows ACME Holdings was reviewed. ',
  'C ONE LONG CLAUSE, no sentence punctuation, negators throughout':
    'no company was archived and no task was completed and nothing was deleted and no record was removed ',
  'D ONE LONG CLAUSE, negators only, no completion vocabulary':
    'no company and no task and nothing and no record and no depot and no unit and no approval ',
};

function timeIt(fn, s) {
  fn(s);
  const reps = s.length > 16000 ? 3 : 10;
  const t = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn(s);
  return Number(process.hrtime.bigint() - t) / 1e6 / reps;
}

const LENS = [1089, 4239, 8439, 16839, 33639];
for (const [label, unit] of Object.entries(SHAPES)) {
  console.log(label);
  console.log('    chars      v92(ms)   candidate(ms)    ratio    growth vs previous');
  let prev = null;
  for (const n of LENS) {
    const s = unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    const tv = timeIt((x) => PCCP.test(x), s);
    const tc = timeIt((x) => cand.readsAsCompletion(x), s);
    const growth = prev === null ? '' : (tc / prev).toFixed(2) + 'x for 2x length';
    prev = tc;
    console.log('  ' + String(n).padStart(7) + '   ' + tv.toFixed(3).padStart(8) + '   ' + tc.toFixed(2).padStart(12)
      + '   ' + (tc / Math.max(tv, 1e-6)).toFixed(0).padStart(6) + 'x    ' + growth);
  }
  console.log('');
}
console.log('READ THE GROWTH COLUMN. ~2x per doubling is linear; ~4x is quadratic.');
console.log('');
console.log('RESULT, and my hypothesis was REFUTED. All four shapes grow ~2x per doubling — LINEAR,');
console.log('including the single long clause with no sentence punctuation, which is the shape I');
console.log('predicted would be quadratic. Worst case here is under 7 ms at 33,639 characters.');
console.log('');
console.log('WHAT IS SETTLED: the belt is 1,000x to 22,000x slower than v92 single regex in RELATIVE');
console.log('terms, and single-digit milliseconds in ABSOLUTE terms at any length a summary plausibly');
console.log('reaches. On this evidence it is not a production risk.');
console.log('WHAT IS NOT SETTLED: I still cannot reproduce 657 ms or quadratic growth on any shape.');
console.log('The untested possibility is that #45 timed the FULL decision window (legacyProseFallback');
console.log('plus rewriteFromStructure) rather than readsAsCompletion alone, which does more work per');
console.log('call. Whoever settles this should say which ENTRY POINT they timed, not just which input.');
