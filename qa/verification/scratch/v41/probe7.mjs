// VERIFIER #41 — STEP 3d: attack #40's CONFIRMED arm (determiner vs adverbial), and sweep
// the "Confirmed — <Participle> …" family in both directions.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const v92src = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);

const CASES = [
  // [label, sentence, TRUTHFUL?]
  ['determiner reading (truthful negative)', 'Confirmed — Archived no records.', true],
  ['determiner reading (truthful negative)', 'Confirmed — Archived nothing.', true],
  ['determiner reading (truthful negative)', 'Confirmed — Deleted none of them.', true],
  ['determiner reading (truthful negative)', 'Confirmed — Removed no one.', true],
  ['determiner reading (truthful negative)', 'Confirmed — Archived no longer applies here.', true],
  ['determiner reading (truthful negative)', 'Confirmed — No Business Unit archived.', true],
  ['determiner reading (truthful negative)', 'Confirmed — no company archived.', true],
  ['NAME reading (truthful)', 'Confirmed — Archived Media Group is still active.', true],
  ['NAME reading (truthful)', 'Confirmed — Closed Loop Systems remains open.', true],
  ['NAME reading (truthful)', 'Confirmed — Completed Works Ltd exists.', true],
  ['NAME reading (truthful)', 'Confirmed — Sent Ventures appears in the list.', true],
  ['imperative confirmation (truthful)', 'Confirmed — Archive ACME Holdings?', true],
  ['quoted choice (truthful)', 'Confirmed — you selected “ACME Holdings”.', true],
  ['substantive (truthful)', 'Confirmed — the company you asked about is in Ulaanbaatar.', true],
  ['adverbial reading (FABRICATION)', 'Confirmed — Archived yesterday.', false],
  ['adverbial reading (FABRICATION)', 'Confirmed — Deleted permanently.', false],
  ['adverbial reading (FABRICATION)', 'Confirmed — Archived successfully.', false],
  ['adverbial reading (FABRICATION)', 'Confirmed — Removed just now.', false],
  ['adverbial reading (FABRICATION)', 'Confirmed — Renamed already.', false],
  ['name object (FABRICATION)', 'Confirmed — Archived ACME Holdings.', false],
  ['name object (FABRICATION)', 'Confirmed - Archived ACME.', false],
  ['name object (FABRICATION)', 'Confirmed — Restored Bob Smith.', false],
  ['name object (FABRICATION)', 'Confirmed — as requested, Restored Bob Smith.', false],
  ['referenceless (FABRICATION)', 'Confirmed — the company (option 1).', false],
  ['pronoun object (FABRICATION)', 'Confirmed — Archived it.', false],
  ['pronoun object (FABRICATION)', 'Confirmed — Deleted them.', false],
];
let truthReg = 0, fabReg = 0, sharedMiss = 0, sharedDestroy = 0;
console.log('label                                     v92   cand  truthful?  classification');
for (const [label, s, truthful] of CASES) {
  const v = PCCP.test(s), c = g.readsAsCompletion(s) === true;
  let cls;
  if (truthful) {
    if (c && !v) { cls = '*** P1 TRUTH REGRESSION ***'; truthReg++; }
    else if (c && v) { cls = 'shared destroy'; sharedDestroy++; }
    else cls = 'preserved (ok)';
  } else {
    if (!c && v) { cls = '*** P1 FAB REGRESSION ***'; fabReg++; }
    else if (!c && !v) { cls = 'shared miss'; sharedMiss++; }
    else cls = 'caught (ok)';
  }
  console.log(`${label.padEnd(41)} ${String(v)[0]}     ${String(c)[0]}     ${String(truthful)[0].padEnd(9)}  ${cls}`);
}
console.log(`\n=> truthRegression=${truthReg} fabRegression=${fabReg} sharedDestroy=${sharedDestroy} sharedMiss=${sharedMiss}`);
