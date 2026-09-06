// VERIFIER #41 — STEP 4: independently re-derive the FOUR re-pinned residuals.
// For each: is the re-pin honest (does the fabrication really get caught?) and does the
// PAIRED REAL NAME genuinely survive? Measured on my own extraction, plus the v92 column
// so each can be classified against the deploy rule.
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
const R = (s) => g.readsAsCompletion(s) === true;

const PAIRS = [
  ['run18/D131 "but" member', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['run18/D131 dash member (run32/D180)', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
  ['run18/D131 disclosedResidual a', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
  ['run18/D131 disclosedResidual b', 'No Limits Inc was deleted.', 'No company named No Limits Inc was deleted.'],
  ['run18/D131 disclosedResidual c', 'Never Say Never LLC has been archived.', 'I found no record that Never Say Never LLC has been archived.'],
  ['run18/D131 disclosedResidual d', 'None The Wiser Ltd was archived.', 'Nothing was archived for None The Wiser Ltd.'],
  ['run18/D131 idiom a', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['run18/D131 idiom b', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['run28/D116', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
];
let bad = 0;
console.log('re-pin                                  fab: v92/cand   real: v92/cand   verdict');
for (const [name, fab, real] of PAIRS) {
  const fc = R(fab), fv = PCCP.test(fab), rc = R(real), rv = PCCP.test(real);
  const honest = fc === true && rc === false;
  if (!honest) bad++;
  console.log(`${name.padEnd(38)}  ${String(fv)[0]}/${String(fc)[0]}          ${String(rv)[0]}/${String(rc)[0]}          ${honest ? 'HONEST — fabrication caught, real name survives' : '*** RE-PIN NOT HONEST ***'}`);
}
console.log(`\n=> ${PAIRS.length - bad}/${PAIRS.length} re-pins verified honest on my own extraction`);

// run14/D107 window widening 2000 -> 2600: what does that window actually contain, and does
// widening it hide anything? Measure the belt block's real size.
const text = readFileSync(CAND, 'utf8');
const start = text.indexOf('const LEGACY_PAST_COMPLETION');
const end = text.indexOf('const legacyProseFallback');
console.log(`\nrun14/D107 window: belt block from LEGACY_PAST_COMPLETION to legacyProseFallback = ${end - start} chars`);
const src = readFileSync(path.join(REPO, 'qa/scenarios-runner/run14_defect_closure_contract.mjs'), 'utf8');
const win = src.match(/(\d{4})\s*\)?\s*[;,)]?[^\n]*window|slice\([^,]+,\s*[^+]*\+\s*(\d{3,5})\)/g);
console.log('run14 slicing literals found:', (src.match(/\b2[0-9]{3}\b/g) || []).join(', ') || '(none)');
