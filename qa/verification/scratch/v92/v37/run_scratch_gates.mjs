// Runs the prior verifiers' committed scratch gates (#30 probe, #31..#36 regression additions, deadness proof,
// generative suite) against a given index.ts via SEM_INDEX_SRC, reporting each suite's own summary line + exit code.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..', '..');
const src = resolve(process.argv[2]);
const V = resolve(repo, 'qa/verification/scratch/v92');
const suites = ['v30_open_regressions_probe.mjs', 'v31_regression_additions.mjs', 'v32_regression_additions.mjs', 'v33_regression_additions.mjs',
  'v34/v34_regression_additions.mjs', 'v35/v35_regression_additions.mjs', 'v36/v36_regression_additions.mjs', 'v39_deadness_proof.mjs'];
for (const s of suites) {
  const r = spawnSync(process.execPath, [resolve(V, s)], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: src } });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split(/\r?\n/).filter(Boolean);
  const summary = lines.filter((l) => /passed|failed|PASS|FAIL|DEAD|mismatch/i.test(l)).pop() || lines.pop() || '';
  const fails = lines.filter((l) => /^(FAIL|✗|NOT OK|\s*\[FAIL)/.test(l) || /\bFAIL\b/.test(l) && !/PASS/.test(l)).slice(0, 4);
  console.log(`EXIT=${r.status} ${s} :: ${summary.slice(0, 150)}`);
  for (const f of fails) console.log('     ' + f.slice(0, 170));
}
