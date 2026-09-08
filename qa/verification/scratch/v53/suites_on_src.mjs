// VERIFIER #53 — run the extractor-based suites + standing gates against an arbitrary index.ts (SEM_INDEX_SRC), child exits.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const SRC = resolve(process.argv[2]);
const SUITES = ['run14_defect_closure_contract', 'run15_defect_closure_contract', 'run16_defect_closure_contract', 'run17_defect_closure_contract', 'run18_defect_closure_contract', 'run19_defect_closure_contract', 'run28_defect_closure_contract', 'v92_open_regression_contract', 'v92_parity_contract', 'entity_signal_positive_contract', 'belt_generative_adversarial_contract', 'standing_reds_classification_contract', 'sem_ai_command_source_invariants_drift_guard'].map((s) => 'qa/scenarios-runner/' + s + '.mjs').concat(['qa/verification/proposed/v52_regression_additions.mjs', 'qa/verification/proposed/v51_regression_additions.mjs', 'qa/verification/proposed/v50_regression_additions.mjs', 'qa/verification/proposed/v49_regression_additions.mjs', 'qa/verification/proposed/v48_regression_additions.mjs']);
let nz = 0;
for (const f of SUITES) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26, env: { ...process.env, SEM_INDEX_SRC: SRC } });
  const out = (r.stdout || '') + (r.stderr || '');
  const counts = out.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i) || out.match(/(\d+)\s+pass(?:ed)?[,\s/]+(\d+)\s+fail/i) || out.match(/(\d+)\/(\d+)\s+(?:passed|ok|cases|contract checks)/i);
  const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok)/i.test(l)).slice(0, 4).map((l) => l.trim().slice(0, 200));
  if (r.status !== 0) nz++;
  console.log(`${String(r.status).padStart(3)}  ${f.padEnd(70)} ${counts ? counts[1] + '/' + counts[2] : 'no-count'}  ${out.trim().split('\n').pop().slice(0, 110)}`);
  for (const l of fails) console.log('        ' + l);
}
console.log(`\nSUITES=${SUITES.length} nonzero=${nz} on ${SRC}`);
