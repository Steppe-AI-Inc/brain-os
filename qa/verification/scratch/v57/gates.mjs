// VERIFIER #57 — run the historical gates (qa/verification/proposed/v*_regression_additions.mjs) from the filesystem.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const out = [];
for (const v of [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56]) {
  const f = resolve(ROOT, `qa/verification/proposed/v${v}_regression_additions.mjs`);
  if (!existsSync(f)) { out.push({ v, missing: true }); console.log(`v${v} missing`); continue; }
  const r = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const tail = text.trim().split('\n').slice(-2).join(' | ').slice(0, 220);
  writeFileSync(resolve(ROOT, `qa/verification/scratch/v57/gate_v${v}.log`), text);
  out.push({ v, exit: r.status, tail });
  console.log(`v${v} exit=${r.status} :: ${tail}`);
}
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/gates.json'), JSON.stringify(out, null, 1));
