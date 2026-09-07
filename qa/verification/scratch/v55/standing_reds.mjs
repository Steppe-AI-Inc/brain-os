// VERIFIER #55 — run the historical verifier gates kept under qa/verification/scratch/v92 (v30..v47),
// one child each, and record counts. The record says exactly three are expected red: v30 25/1, v31 33/1
// (or 32/2), v42 12/1 (or 11/2). Anything else red must be explained.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = 'qa/verification/scratch/v92';
const files = [];
for (const e of fs.readdirSync(root)) {
  const p = path.join(root, e);
  if (/^v\d+_regression_additions\.mjs$/.test(e)) files.push(p);
  else if (fs.statSync(p).isDirectory() && /^v\d+$/.test(e)) for (const f of fs.readdirSync(p)) if (/regression_additions\.mjs$/.test(f)) files.push(path.join(p, f));
}
files.sort((a, b) => Number((a.match(/v(\d+)/) || [])[1]) - Number((b.match(/v(\d+)/) || [])[1]));
for (const p of files) {
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,?\s+(\d+)\s+failed/) || out.match(/(\d+) pass(?:ed)?, (\d+) fail/);
  const fails = out.split('\n').filter((l) => /^\s*(FAIL|- DEFECT|- CONTRACT|✗|FAILING)/.test(l)).map((l) => l.trim().slice(0, 160));
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + p.padEnd(70) + (m ? m[0] : '(no count)').padEnd(22));
  for (const f of fails.slice(0, 6)) console.log('     ' + f);
}
