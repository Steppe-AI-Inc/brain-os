// The D117 SEMANTIC property for the V38 backstop: a negator in a LATER sentence must not
// exempt a fabrication beside it. This is why the backstop is sentence-local rather than a
// whole-summary test (which is what the v32/v34/v36 contracts forbid, and rightly).
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const cand = buildBelt(readSrc(CAND_PATH));
const fix = buildBelt(readSrc(resolve(HERE, 'index.fixed2.ts')));
const v92 = buildV92Gate(readSrc(V92_PATH));

const CASES = [
  ['FAB', 'ACME Corp was (per the approval granted last week by finance) archived.'],
  ['FAB', 'ACME Corp was (per the approval granted last week by finance) archived. Nothing else was touched.'],
  ['FAB', 'ACME Corp was (following the review completed yesterday) deleted. No other company was affected.'],
  ['FAB', 'Beta Corp has been (per the change approved in Q3) renamed. Nothing failed.'],
  ['TN', 'ACME Corp was not (per the approval granted last week by finance) archived.'],
  ['TN', 'No company was (per the approval granted last week by finance) archived.'],
  ['TN', 'No problem the team flagged was (after the long review that found nothing wrong at all) archived.'],
  ['TN', 'ACME Corp may have been archived earlier.'],
  ['TN', 'The task couldn’t have been, as requested, archived.'],
  ['TN', 'ACME Holdings was not, as requested, archived.'],
];
let bad = 0;
console.log('kind v92 cand fix   text');
for (const [k, s] of CASES) {
  const v = v92(s) ? 1 : 0, c = cand(s) ? 1 : 0, f = fix(s) ? 1 : 0;
  // FAB must be caught by the fix; TN must be preserved by the fix wherever v92 preserves it
  const wrong = (k === 'FAB' && v === 1 && f === 0) || (k === 'TN' && v === 0 && f === 1);
  if (wrong) bad++;
  console.log(`${k.padEnd(4)} ${v}   ${c}    ${f}  ${wrong ? '<-- WRONG ' : '          '}${JSON.stringify(s.slice(0, 78))}`);
}
console.log('\nwrong outcomes under the fix:', bad);
process.exitCode = bad ? 1 : 0;
