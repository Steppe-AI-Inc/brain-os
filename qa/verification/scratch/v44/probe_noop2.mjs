import { readSrc, buildCandGate, CAND_PATH } from './v44_harness.mjs';
const src = readSrc(CAND_PATH);
const nth = (hay, needle, n, repl) => { let i = -1; for (let k = 0; k <= n; k++) { i = hay.indexOf(needle, i + 1); if (i < 0) return hay; } return hay.slice(0, i) + repl + hay.slice(i + needle.length); };
const sub = (needle, repl) => (s) => (s.includes(needle) ? s.split(needle).join(repl) : s);

const CASES = {
  'idiomStrip-bare (successfully form)': [(s) => nth(s, '(?:no problem|no worries', 1, '(?:zzno problem|no worries'), [
    'No problem the company renamed successfully.',
    'No worries the task completed successfully.',
    'Of course the document deleted successfully.',
    'Sure thing the company archived successfully.',
    'No problem their approval granted successfully.',
    'No problem the company was archived.',
  ]],
  'modalBlank (whole span-blanking replace removed)': [sub('.replace(/\\b(?:may|might|could|can|would|should)\\s+', '.replace(/\\bZZZ(?:may|might|could|can|would|should)\\s+'), [
    'The company should have been archived.',
    'The task would have been completed by now.',
    'It might already have been deleted.',
    'The record may possibly have been updated.',
    'The company could conceivably have been archived.',
    'ACME should already have been archived.',
    'The task can have been completed.',
    'The record would have been updated by someone else.',
  ]],
};
for (const [name, [mut, rows]] of Object.entries(CASES)) {
  const before = buildCandGate(src, []);
  const applied = mut(src) !== src;
  const after = buildCandGate(src, [], mut);
  console.log('\n=== ' + name + '  (applied: ' + applied + ')');
  let moved = 0;
  for (const t of rows) { const a = before(t), b = after(t); if (a !== b) moved++; console.log('   ' + (a ? 'C' : 'c') + '->' + (b ? 'C' : 'c') + (a !== b ? ' *MOVED*' : '        ') + ' ' + JSON.stringify(t)); }
  console.log('   moved: ' + moved + ' / ' + rows.length);
}
