// VERIFIER #49 — run the standing verifier gates from the filesystem, each as its own child.
import { spawnSync } from 'node:child_process';
const GATES = [
  'qa/verification/scratch/v92/v30_regression_additions.mjs',
  'qa/verification/scratch/v92/v31_regression_additions.mjs',
  'qa/verification/scratch/v92/v42/v42_regression_additions.mjs',
  'qa/verification/scratch/v92/v46/v46_regression_additions.mjs',
  'qa/verification/scratch/v92/v47/v47_regression_additions.mjs',
  'qa/verification/proposed/v48_regression_additions.mjs',
  'qa/verification/proposed/v46_regression_additions.mjs',
];
for (const g of GATES) {
  const r = spawnSync(process.execPath, [g], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const counts = out.match(/(\d+)\s+pass(?:ed)?[,\s]+(\d+)\s+fail(?:ed)?/i);
  const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok|✗|✘|\*\*\* FAIL)/i.test(l)).slice(0, 12);
  console.log(`exit=${r.status} ${counts ? counts[1] + '/' + counts[2] : 'no-count'}  ${g}`);
  for (const f of fails) console.log('    ' + f.trim().slice(0, 200));
}
