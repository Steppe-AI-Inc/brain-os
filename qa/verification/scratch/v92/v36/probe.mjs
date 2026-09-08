// v36 probe: node probe.mjs <file.json|->  where the JSON is an array of strings or of [label, sentence].
// Prints: v92 (F=fires/./preserve), cand belt, cand end-to-end (SHIP/DESTROY), per sentence.
import { readFileSync } from 'node:fs';
import { makeGate } from './v36_harness.mjs';
const g = makeGate(process.argv[3] || process.env.SEM_INDEX_SRC);
if (process.argv[3]) console.log('SOURCE ' + process.argv[3]);
const input = process.argv[2] === '-' ? readFileSync(0, 'utf8') : readFileSync(process.argv[2], 'utf8');
const rows = JSON.parse(input);
for (const r of rows) {
  const [label, s] = Array.isArray(r) ? r : ['', r];
  const v = g.v92fires(s), f = g.fires(s), sh = g.ships(s);
  console.log(`v92=${v ? 'FIRE' : 'keep'}  cand=${f ? 'FIRE' : 'keep'}  e2e=${sh ? 'SHIP ' : 'CORR '} ${label ? '[' + label + '] ' : ''}${JSON.stringify(s)}`);
}
