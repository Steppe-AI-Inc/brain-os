// v43: M5 — neutralise the R-AUXGAP whole-summary arm. Anchor chosen to contain NO backslashes so
// no shell/JS escaping layer can silently miss it: `new RegExp('(?<!` occurs exactly once.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const SRC = readFileSync(IDX, 'utf8');
const ANCHOR = "new RegExp('(?<!";
const n = SRC.split(ANCHOR).length - 1;
console.log('anchor occurrences: ' + n);
if (n !== 1) { console.log('FAIL — expected exactly 1'); process.exit(1); }
const mutated = SRC.replace(ANCHOR, "new RegExp('zzzzNEVERMATCHzzzz(?<!");
const OUT = resolve(HERE, 'mut_M5_rAuxGap.ts');
writeFileSync(OUT, mutated);
console.log('mutant written, differs: ' + (mutated !== SRC));
const SUITES = ['v92_parity_contract.mjs', 'v92_open_regression_contract.mjs', 'belt_generative_adversarial_contract.mjs',
  'run28_defect_closure_contract.mjs', 'run15_defect_closure_contract.mjs', 'run16_defect_closure_contract.mjs',
  'run17_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs', 'run19_defect_closure_contract.mjs',
  'run13_defect_closure_contract.mjs', 'run14_defect_closure_contract.mjs',
  'lifecycle_evidence_and_output_persistence_contract.mjs', 'structured_claim_laundering_contract.mjs',
  'structured_claim_verification.mjs', 'entity_signal_positive_contract.mjs'];
const reds = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [resolve(ROOT, 'qa/scenarios-runner', s)], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: OUT }, encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0) reds.push(s);
}
console.log('M5 suites RED: ' + (reds.length ? reds.join(', ') : 'NONE — the R-AUXGAP arm is not load-bearing against the pinned estate'));
