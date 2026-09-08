// STEP 4 — judge the CONTRACT 5 narrowing independently, and test V46-D4's claim that a local
// const inside the readsAsCompletion .map() callback breaks run15 while CONTRACT 5 stays green.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const IDX = path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const SRC = fs.readFileSync(IDX, 'utf8');

const MUTANTS = {
  // (a) the case CONTRACT 5 exists for: a NEW TOP-LEVEL const in the belt block.
  topLevel: SRC.replace('        const readsAsCompletion = (s) =>', '        const nx = 1;\n        const readsAsCompletion = (s) =>'),
  // (b) V46-D4's claim: a local const inside readsAsCompletion's .map() callback.
  mapLocal: SRC.replace('.map((c) => c.replace(/\\([^()]*\\)/g,', '.map((c) => { const nyLocal = 1; return c; }).map((c) => c.replace(/\\([^()]*\\)/g,'),
  // (c) a local inside completionIsNegated — the case the narrowing deliberately allows.
  fnLocal: SRC.replace('          let n = -1;', '          let n = -1;\n          const nzLocal = 1;'),
};
const SUITES = ['v92_open_regression_contract.mjs', 'run15_defect_closure_contract.mjs',
  'run16_defect_closure_contract.mjs', 'run17_defect_closure_contract.mjs',
  'run18_defect_closure_contract.mjs', 'run19_defect_closure_contract.mjs',
  'v92_parity_contract.mjs', 'belt_generative_adversarial_contract.mjs'];
for (const [name, text] of Object.entries(MUTANTS)) {
  if (text === SRC) { console.log(name, ': MUTATION DID NOT APPLY'); continue; }
  const tmp = path.join(HERE, 'mut_' + name + '.ts');
  fs.writeFileSync(tmp, text);
  const results = [];
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'qa/scenarios-runner', s)],
      { encoding: 'utf8', cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: tmp }, timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const broke = r.status !== 0;
    const c5 = /belt declares exactly the known TOP-LEVEL const list/.test(out)
      ? (/FAIL.*belt declares exactly the known TOP-LEVEL/.test(out) ? 'C5-RED' : 'C5-green') : '';
    results.push(s.replace('_defect_closure_contract.mjs', '').replace('.mjs', '') + '=' + (broke ? 'BROKEN' : 'ok') + (c5 ? '/' + c5 : ''));
  }
  console.log(name.padEnd(10), results.join('  '));
  fs.unlinkSync(tmp);
}
console.log('\nindex.ts unchanged:', fs.readFileSync(IDX, 'utf8') === SRC);
