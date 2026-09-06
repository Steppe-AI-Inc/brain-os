import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const SUITE = path.join(ROOT, 'qa', 'verification', 'proposed', 'v40_regression_additions.mjs');
const FIXED = path.join(HERE, 'index.PREPARED_FIX.not-for-deploy.ts');

const go = (label, env, cwd) => {
  const r = spawnSync(process.execPath, [SUITE], { cwd, encoding: 'utf8', env, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const t = out.match(/(\d+) passed, (\d+) failed/);
  console.log(label.padEnd(52) + (t ? t[1] + ' passed / ' + t[2] + ' failed' : 'NO TALLY') + '   exit=' + r.status);
  if (!t) console.log(out.slice(0, 500));
};
go('shipped candidate, cwd=repo root', { ...process.env }, ROOT);
go('shipped candidate, cwd=os.tmpdir()', { ...process.env }, os.tmpdir());
go('shipped candidate, cwd=qa/scenarios-runner', { ...process.env }, path.join(ROOT, 'qa', 'scenarios-runner'));
go('PREPARED FIX applied (SEM_INDEX_SRC)', { ...process.env, SEM_INDEX_SRC: FIXED }, ROOT);
go('deployed v92 source (must be RED both ways)', { ...process.env, SEM_INDEX_SRC: path.join(HERE, 'index.v92.git.ts') }, ROOT);
