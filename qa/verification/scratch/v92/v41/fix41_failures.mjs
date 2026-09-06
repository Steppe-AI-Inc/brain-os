import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const env = { ...process.env, SEM_INDEX_SRC: path.join(HERE, 'fix41/index.ts') };
for (const f of ['run12_defect_closure_contract.mjs', 'run19_defect_closure_contract.mjs', 'run28_defect_closure_contract.mjs']) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'qa/scenarios-runner', f)], { encoding: 'utf8', cwd: REPO, env, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log('##### ' + f);
  for (const l of out.split('\n')) if (/^\s*(FAIL|fail)/.test(l) || /FAILURES|failures:/.test(l)) console.log('   ' + l.trim().slice(0, 260));
}
// which fabrication moved from "candidate catches" to "shared miss"?
const runDiff = (src) => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'belt_diff.mjs')], { encoding: 'utf8', cwd: REPO, env: src ? { ...process.env, SEM_INDEX_SRC: src } : process.env, timeout: 300000 });
  const out = r.stdout || '';
  const i = out.indexOf('BOTH-MISS');
  return out.slice(i, out.indexOf('same-and-correct'));
};
console.log('\n##### BOTH-MISS on the CANDIDATE');
console.log(runDiff(null));
console.log('##### BOTH-MISS on fix41');
console.log(runDiff(path.join(HERE, 'fix41/index.ts')));
