// v43: mutation proof, strongest form. Revert each shipped fix in a SCRATCH copy and run the WHOLE
// battery against it. A load-bearing fix must turn at least one suite red.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const SRC = readFileSync(IDX, 'utf8');
const REASSURANCE = '(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)';
const MUTANTS = [
  ['M1.nameInternal', 'const nameInternal = capLead', 'const nameInternal = false && capLead'],
  ['M2.titleHead', 'const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/'],
  ['M3.ppInternal', 'const ppInternal = /', 'const ppInternal = false && /'],
  ['M4.reassuranceStrip', REASSURANCE, '(?:zzzzNEVERMATCHzzzz)'],
  ['M5.rAuxGap', "'(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)", "'zzzzNEVERMATCHzzzz(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)"],
  ['M6.entitySignal', 'knownEntityNames.has(__p.toLowerCase())', 'false && knownEntityNames.has(__p.toLowerCase())'],
];
const SUITES = ['v92_parity_contract.mjs', 'v92_open_regression_contract.mjs', 'standing_reds_classification_contract.mjs',
  'entity_signal_positive_contract.mjs', 'belt_generative_adversarial_contract.mjs', 'run28_defect_closure_contract.mjs',
  'run15_defect_closure_contract.mjs', 'run16_defect_closure_contract.mjs', 'run17_defect_closure_contract.mjs',
  'run18_defect_closure_contract.mjs', 'run19_defect_closure_contract.mjs', 'run13_defect_closure_contract.mjs',
  'run14_defect_closure_contract.mjs', 'lifecycle_evidence_and_output_persistence_contract.mjs',
  'structured_claim_laundering_contract.mjs', 'structured_claim_verification.mjs'];
let bad = 0;
for (const [id, find, repl] of MUTANTS) {
  const n = SRC.split(find).length - 1;
  if (n === 0) { console.log(`FAIL ${id} — anchor not found`); bad++; continue; }
  const mutated = SRC.split(find).join(repl);
  if (mutated === SRC) { console.log(`FAIL ${id} — no-op`); bad++; continue; }
  const out = resolve(HERE, 'mut_' + id.replace(/\W/g, '_') + '.ts');
  writeFileSync(out, mutated);
  const reds = [];
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [resolve(ROOT, 'qa/scenarios-runner', s)], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: out }, encoding: 'utf8', timeout: 300000 });
    if (r.status !== 0) reds.push(s.replace('_contract.mjs', '').replace('.mjs', ''));
  }
  const ok = reds.length > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(20)} anchors=${n}  suites turned RED: ${reds.length ? reds.join(', ') : 'NONE — NOT LOAD-BEARING against the pinned estate'}`);
}
console.log(`\nv43_mutation_battery: ${MUTANTS.length - bad}/${MUTANTS.length} load-bearing`);
process.exit(0);
