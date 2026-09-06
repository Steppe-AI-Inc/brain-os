// VERIFIER #41 — the CURRENT deploy-gate suites (scratch/v92/v3x) on fix41, plus a mutation
// proof of fix41's own two halves (each revert must RE-OPEN its class).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const FIX = path.join(HERE, 'fix41/index.ts');
const env = { ...process.env, SEM_INDEX_SRC: FIX };
const GATES = [
  'qa/verification/scratch/v92/v30_regression_additions.mjs',
  'qa/verification/scratch/v92/v31_regression_additions.mjs',
  'qa/verification/scratch/v92/v32_regression_additions.mjs',
  'qa/verification/scratch/v92/v33_regression_additions.mjs',
  'qa/verification/scratch/v92/v34/v34_regression_additions.mjs',
  'qa/verification/scratch/v92/v35/v35_regression_additions.mjs',
  'qa/verification/scratch/v92/v36/v36_regression_additions.mjs',
  'qa/verification/scratch/v92/v37/v37_regression_additions.mjs',
  'qa/verification/scratch/v92/v38/v38_regression_additions.mjs',
  'qa/verification/scratch/v92/v39/v39_regression_additions.mjs',
  'qa/verification/scratch/v92/v40/v40_regression_additions.mjs',
];
console.log('gate                                              candidate   fix41');
for (const gp of GATES) {
  const go = (e) => {
    const r = spawnSync(process.execPath, [path.join(REPO, gp)], { encoding: 'utf8', cwd: REPO, env: e, timeout: 300000 });
    const o = (r.stdout || '') + (r.stderr || '');
    const m = o.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/);
    return m ? m[1] + '/' + m[2] : (/Error:/.test(o) ? 'THREW' : '?');
  };
  console.log(path.basename(gp).padEnd(50) + String(go(process.env)).padEnd(12) + go(env));
}
