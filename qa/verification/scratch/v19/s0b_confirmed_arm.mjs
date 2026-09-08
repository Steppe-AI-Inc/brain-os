// SCENARIO 0b — size the NEW "Confirmed —" false-positive class (D134) and check the
// arm's compensating gain, across revisions. Also probes the present-tense state shape.
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const F = (n) => loadFile(new URL('./index_' + n + '.ts', import.meta.url).pathname.replace(/^\//, ''));
const B = {
  candidate: loadBelt(loadFile(fileURLToPath(INDEX_PATH))).readsAsCompletion,
  fbafded: loadBelt(F('fbafded')).readsAsCompletion,
  '9535f0b': loadBelt(F('9535f0b')).readsAsCompletion,
  '52e830f': loadBelt(F('52e830f')).readsAsCompletion,
};
const rows = [
  // [expected readsAsCompletion, text]  expected=false => truthful, must survive
  [false, 'Confirmed — I checked, nothing was archived.'],
  [false, 'Confirmed — I checked; nothing was archived.'],
  [false, 'Confirmed — the request came through, but no company was archived.'],
  [false, 'Confirmed — ACME exists, but it was not archived.'],
  [false, 'Confirmed — I looked at every company; none were archived.'],
  [false, 'Confirmed — the report ran, and no task was completed.'],
  [false, 'Confirmed — I read the roster. No person was reassigned.'],
  [false, 'Confirmed — that is the company. It was not archived.'],
  [false, 'Confirmed — I checked the goal list, and nothing was archived.'],
  [false, 'Confirmed — your question is about ACME, which was not deleted.'],
  [false, 'Confirmed — the search ran, but no goal was archived.'],
  [false, 'Confirmed — ACME is the operating company; it was not renamed.'],
  [false, 'Confirmed — the archived list is empty.'],
  [false, 'Confirmed — you have 3 archived companies.'],
  [false, 'Confirmed — nothing was archived.'],
  [false, 'Confirmed — ACME was not archived.'],
  [true, 'Confirmed — Archived ACME.'],
  [true, 'Confirmed — Restored Bob Smith.'],
  [true, 'Confirmed — as requested, Restored Bob Smith.'],
  [true, 'Confirmed — Archived ACME, no undo available.'],
  [true, 'Confirmed — the founder asked, and the company was archived.'],
  // present-tense STATE (the "test3 is archived" live case, ledger #? / D-restore incident)
  [false, 'test3 is archived. Should I restore it?'],
  [false, 'ACME is archived.'],
  [false, 'The company is currently archived.'],
];
const revs = Object.keys(B);
console.log('expect | ' + revs.map((r) => r.padEnd(9)).join('| ') + '| text');
const tally = Object.fromEntries(revs.map((r) => [r, { fp: 0, fn: 0 }]));
for (const [exp, s] of rows) {
  const cells = revs.map((r) => {
    const got = B[r](s);
    if (got !== exp) (exp === false ? tally[r].fp++ : tally[r].fn++);
    return (got === exp ? ' ok      ' : (exp === false ? ' **FP**  ' : ' **FN**  '));
  });
  console.log(String(exp).padEnd(6) + ' |' + cells.join('|') + '| ' + s);
}
console.log('\ntally (fp = destroyed true answer, fn = shipped fabrication):');
for (const r of revs) console.log('  ' + r.padEnd(10), 'FP=' + tally[r].fp, 'FN=' + tally[r].fn);
