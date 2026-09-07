// Run every verifier GATE (v*_regression_additions.mjs) I can find, from the filesystem.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const dirs = [path.join(ROOT, 'qa/verification/proposed')];
const scratch = path.join(ROOT, 'qa/verification/scratch/v92');
for (const d of fs.readdirSync(scratch)) {
  const p = path.join(scratch, d);
  if (fs.statSync(p).isDirectory()) dirs.push(p);
}
const files = [];
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  if (/^v\d+_regression_additions\.mjs$/.test(f)) files.push(path.join(d, f));
}
files.sort((a, b) => (+path.basename(a).match(/\d+/)[0]) - (+path.basename(b).match(/\d+/)[0]));
const only = process.argv[2] ? +process.argv[2] : 0;
for (const f of files) {
  const n = +path.basename(f).match(/\d+/)[0];
  if (only && n < only) continue;
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', cwd: ROOT, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed[,/]?\s*(\d+)\s+failed/i);
  const okC = (out.match(/^OK\s/gm) || []).length, flC = (out.match(/^FAIL\s/gm) || []).length;
  const p = m ? +m[1] : okC, fl = m ? +m[2] : flC;
  console.log((fl > 0 || r.status !== 0 ? 'RED  ' : (p ? 'green' : 'VAC? ')).padEnd(6),
    path.relative(ROOT, f).padEnd(60), String(p).padStart(4) + '/' + String(fl).padStart(3), 'exit=' + r.status);
  if (fl > 0 || r.status !== 0) for (const l of out.split('\n').filter((x) => /^FAIL|Error:/.test(x)).slice(0, 6)) console.log('      ', l.trim().slice(0, 200));
}
