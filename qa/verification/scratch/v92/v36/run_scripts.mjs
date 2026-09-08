// v36: run each script given on argv as its own process; print REAL exit code + summary lines.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
let bad = 0;
const env = { ...process.env };
const args = process.argv.slice(2).filter((a) => { const m = a.match(/^--src=(.+)$/); if (m) { env.SEM_INDEX_SRC = join(repo, m[1]); return false; } return true; });
if (env.SEM_INDEX_SRC) console.log('SEM_INDEX_SRC=' + env.SEM_INDEX_SRC);
for (const f of args) {
  const r = spawnSync(process.execPath, [f], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000, env });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(join(here, 'battery', basename(f) + '.log'), out);
  const lines = out.split(/\r?\n/);
  const fails = lines.filter((l) => /^(FAIL|NOT PROVEN|note)/.test(l));
  const summary = lines.filter((l) => /passed|proven|PROOF|residual/.test(l)).pop() || lines.filter(Boolean).pop() || '';
  console.log(`EXIT=${r.status}  ${basename(f)} :: ${summary.slice(0, 160)}`);
  for (const l of fails.slice(0, 12)) console.log('    ' + l.slice(0, 220));
  if (r.status !== 0) bad++;
}
console.log(`\n${process.argv.length - 2} scripts, ${bad} nonzero exits`);
