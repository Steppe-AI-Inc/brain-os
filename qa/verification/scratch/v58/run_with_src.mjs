// VERIFIER #58 — run suites against an alternate index.ts via SEM_INDEX_SRC. usage: node run_with_src.mjs <src> <suite...>
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = resolve(HERE, '../../../..');
const [src, ...suites] = process.argv.slice(2);
let bad = 0;
for (const s of suites) {
  const f = s.includes('/') || s.includes('\\') ? resolve(ROOT, s) : resolve(HERE, s);
  const r = spawnSync(process.execPath, [f], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: resolve(ROOT, src) }, encoding: 'utf8', timeout: 600000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const tail = text.trim().split('\n').filter((l) => /passed|failed|pass|fail|EXEC|controls|non-imperative|CONTROL DID NOT/.test(l)).slice(-6).join(' | ').replace(/\s+/g, ' ').slice(0, 400);
  if (r.status !== 0) bad++;
  console.log(`exit=${r.status}  ${s}  :: ${tail}`);
}
process.exit(bad ? 1 : 0);
