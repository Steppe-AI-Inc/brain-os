// RETRACTED IN FULL — verifier #46, V46-D2. This file built `before` from index.ts and `after`
// from fix46.ts AFTER fix46 had already been copied over index.ts. Both paths were the same
// bytes (sha256 d0de7e7e), so it compared the candidate against ITSELF. Its speedup figures
// were noise and its "0 verdict changes of 9" was 0 BY CONSTRUCTION and could never fail.
// That number was published in ledger #111 and in a report to the founder as evidence that the
// V45-N2 guard was safe. The guard destroyed 8 truthful refusals (V46-D3).
// It is kept, unrun, as the record of the mistake. The honest replacement takes its `before`
// from GIT: qa/verification/scratch/v92/v47_guard_repro.mjs.
console.log("RETRACTED: this probe compared a build against itself. See v47_guard_repro.mjs.");
process.exit(2);

/* original follows, retained as the record
// Does the V45-N2 short-circuit actually take the belt off its quadratic curve?
//
// A first attempt measured a filler string with NO completion vocabulary in it. The short-circuit
// fires immediately on such a string, so both builds were fast and the table showed nothing — a
// measurement of the guard's own fast path, not of the work it was meant to skip. The input has to
// CONTAIN completion vocabulary and negators, or the scan loop is never entered in either build.
import { buildGate } from '../../lib/belt_extract.mjs';

globalThis.knownEntityNames = new Set();
const ROOT = 'C:/Users/Dell/dev/brain-os/';
const before = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const after = buildGate(ROOT + 'qa/verification/scratch/v92/fix46.ts');

// A realistic long summary: completion vocabulary and negators throughout, which is exactly the
// shape the per-negator scan loop exists for and the shape that made it quadratic.
const UNIT = 'No company was archived and no task was completed, though the record shows ACME Holdings '
  + 'was reviewed and nothing was deleted for the depot. ';

function timeOn(fn, s, reps) {
  fn(s); // warm the JIT so the first row is not measuring compilation
  const t = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn(s);
  return Number(process.hrtime.bigint() - t) / 1e6 / reps;
}

// Ordinary prose with NO completion vocabulary — the common case in production, and the only case
// the short-circuit can help, because it exists precisely to skip clauses whose answer is fixed.
const PLAIN = 'The quarterly report covers every department and the staffing plans they submitted. ';

function table(label, unit) {
console.log(label);
console.log('  chars       before(ms)    after(ms)   speedup');
for (const n of [1089, 4239, 8439, 16839, 33639]) {
  const s = unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const reps = n > 16000 ? 3 : 20;
  const b = timeOn((x) => before.readsAsCompletion(x), s, reps);
  const a = timeOn((x) => after.readsAsCompletion(x), s, reps);
  console.log(String(n).padStart(7) + '   ' + b.toFixed(2).padStart(10) + '   ' + a.toFixed(2).padStart(10)
    + '   ' + (b / a).toFixed(2) + 'x');
}
console.log('');
}
table('A. ordinary prose, NO completion vocabulary (the case the guard is for)', PLAIN);
table('B. completion vocabulary and negators throughout (the guard cannot fire here)', UNIT);
console.log('NOTE, stated rather than smoothed over: verifier #45 measured 657 ms at 33,639 chars.');
console.log('I could not reproduce that on either shape — my worst case is single-digit ms and the');
console.log('growth reads roughly LINEAR, not quadratic. The discrepancy is unresolved and belongs to');
console.log('the next verifier; the short-circuit is reported as verdict-neutral and as a saving on');
console.log('shape A only, which is what was actually measured here.');
console.log('');
// The guard must not change any verdict — it may only skip work whose answer is already fixed.
const ROWS = [
  'No company was archived.', 'ACME Holdings was archived.', 'Nothing was deleted.',
  'I archived ACME Holdings.', 'No errors occurred the department was removed.',
  'Confirmed - Archived Media Group. It is still active.', 'The report is ready.',
  'Archiving a company is done from the Companies page.', 'No task named Salt and Pepper Co was archived.',
];
const diff = ROWS.filter((s) => before.readsAsCompletion(s) !== after.readsAsCompletion(s));
console.log('verdict differences introduced by the short-circuit: ' + diff.length + ' of ' + ROWS.length);
diff.forEach((s) => console.log('   CHANGED ' + JSON.stringify(s)));
process.exit(diff.length === 0 ? 0 : 1);

*/
