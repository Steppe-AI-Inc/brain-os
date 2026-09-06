// Run v41_regression_additions.mjs against an arbitrary source, and from an arbitrary cwd,
// to prove (a) it goes GREEN on the prepared fix and (b) it is cwd-independent (V30-F2).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const GATE = path.join(REPO, 'qa/verification/proposed/v41_regression_additions.mjs');
const FIX = path.join(HERE, 'fix41/index.ts');
const runs = [
  ['candidate, cwd=repo root', REPO, process.env],
  ['candidate, cwd=qa/scenarios-runner (cwd-independence)', path.join(REPO, 'qa/scenarios-runner'), process.env],
  ['candidate, cwd=os tmp-ish (deep)', path.join(REPO, 'qa/verification/scratch/v41'), process.env],
  ['fix41,     cwd=repo root', REPO, { ...process.env, SEM_INDEX_SRC: FIX }],
  ['fix41,     cwd=qa/verification', path.join(REPO, 'qa/verification'), { ...process.env, SEM_INDEX_SRC: FIX }],
];
for (const [label, cwd, env] of runs) {
  const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd, env, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s*(\d+)\s+failed/);
  console.log(`${label.padEnd(52)} ${m ? m[1] + '/' + m[2] : 'UNPARSED'}  exit=${r.status}`);
  if (!m) console.log('   ' + out.trim().split('\n').slice(-4).join(' | ').slice(0, 300));
  else if (+m[2] > 0) for (const l of out.split('\n').filter((x) => x.startsWith('  - '))) console.log('   ' + l.trim().slice(0, 170));
}
