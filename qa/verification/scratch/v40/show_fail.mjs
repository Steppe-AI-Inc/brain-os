import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const OUT = path.join(HERE, 'index.PREPARED_FIX.not-for-deploy.ts');
for (const f of process.argv.slice(2)) {
  const r = spawnSync(process.execPath, [path.resolve(ROOT, f)], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: OUT }, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n');
  console.log('=== ' + f + ' ===');
  lines.forEach((l, i) => { if (/^FAIL/.test(l)) console.log(lines.slice(i, i + 4).join('\n')); });
}
