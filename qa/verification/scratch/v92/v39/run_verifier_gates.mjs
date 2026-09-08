// VERIFIER #39 — run the committed verifier-authored gates (#33..#38) myself.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const OUT = resolve(HERE, 'gates'); mkdirSync(OUT, { recursive: true });
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
  'qa/verification/scratch/v92/v30_open_regressions_probe.mjs',
  'qa/verification/scratch/v92/v31_mutation_proof.mjs',
];
for (const g of GATES) {
  const p = resolve(ROOT, g);
  if (!existsSync(p)) { console.log('MISSING  ' + g); continue; }
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(resolve(OUT, g.split('/').pop() + '.log'), out);
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i) || out.match(/(\d+)\/(\d+)/);
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + 'rc=' + String(r.status).padEnd(4)
    + g.split('/').pop().padEnd(34) + (out.trim().split('\n').filter(Boolean).slice(-2).join(' ⏎ ').slice(0, 150)));
}
