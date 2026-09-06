// VERIFIER #41 — CONTRACT 5, the REAL hazard: a top-level const that is REFERENCED by the
// belt. An unreferenced one is harmless; a referenced one makes every extractor-based suite
// execute a slice that ReferenceErrors (or, worse, silently differs from the product).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SRC = path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const OUT = path.join(HERE, 'c5'); mkdirSync(OUT, { recursive: true });
const text = readFileSync(SRC, 'utf8');

const referenced = text
  .replace('const readsAsCompletion =', 'const NX41 = /zzz/i;\r\n        const readsAsCompletion =')
  .replace('const readsAsCompletion = (s) => [String(s)', 'const readsAsCompletion = (s) => NX41.test(String(s)) || [String(s)');
if (referenced === text || !referenced.includes('NX41.test')) throw new Error('anchors missing — probe would be vacuous');
const p = path.join(OUT, 'C_referenced.ts');
writeFileSync(p, referenced);

const SUITES = ['run15_defect_closure_contract.mjs', 'run16_defect_closure_contract.mjs',
  'run17_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs',
  'run19_defect_closure_contract.mjs', 'v92_open_regression_contract.mjs', 'v92_parity_contract.mjs'];
console.log('BASELINE (real source) vs REFERENCED-TOP-LEVEL-CONST mutant:');
for (const s of SUITES) {
  const run = (env) => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'qa/scenarios-runner', s)], { encoding: 'utf8', cwd: REPO, env, timeout: 240000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/);
    return m ? m[1] + '/' + m[2] : (/Error:/.test(out) ? 'THREW: ' + (out.match(/Error:.*/) || [''])[0].slice(0, 90) : '?');
  };
  const base = run(process.env);
  const mut = run({ ...process.env, SEM_INDEX_SRC: p });
  console.log(`  ${s.padEnd(40)} base=${String(base).padEnd(10)} mutant=${mut}`);
}
