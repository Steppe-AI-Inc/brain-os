// VERIFIER #40 — run every committed verifier-gate file (v30..v39) from the filesystem.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BASE = path.join(ROOT, 'qa', 'verification', 'scratch', 'v92');
const targets = [];
for (const f of fs.readdirSync(BASE)) {
  if (/^v\d+_(regression_additions|mutation_proof|adversarial_truth|open_regressions_probe|labelled_sweep|deadness_proof)\.mjs$/.test(f)) targets.push(path.join(BASE, f));
}
for (const d of fs.readdirSync(BASE)) {
  const p = path.join(BASE, d);
  if (!fs.statSync(p).isDirectory()) continue;
  for (const f of fs.readdirSync(p)) if (/^v\d+_regression_additions\.mjs$/.test(f) || /^v\d+_mutation_proof\.mjs$/.test(f)) targets.push(path.join(p, f));
}
targets.sort();

let tp = 0; let tf = 0; let bad = 0;
for (const t of targets) {
  const r = spawnSync(process.execPath, [t], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  let pass = 0; let fail = 0; let found = false;
  const re = /(\d+)\s*(?:passed|pass)\b[^\d]{0,12}(\d+)\s*(?:failed|fail)/gi;
  let m;
  while ((m = re.exec(out)) !== null) { pass += Number(m[1]); fail += Number(m[2]); found = true; }
  tp += pass; tf += fail;
  const rel = path.relative(ROOT, t).replace(/\\/g, '/');
  const flag = r.status !== 0 || fail > 0;
  if (flag) bad++;
  console.log((flag ? 'RED ' : 'ok  ') + rel.padEnd(62) + 'pass=' + String(pass).padStart(4) + ' fail=' + String(fail).padStart(3) + ' exit=' + String(r.status).padStart(3) + (found ? '' : ' [no tally]'));
  if (flag) {
    const lines = out.trim().split('\n').filter((l) => /FAIL|Error|error|✗/.test(l)).slice(0, 5);
    for (const l of lines) console.log('        ' + l.slice(0, 200));
  }
}
console.log('\ngate files=' + targets.length + '  red=' + bad + '  assertions ' + tp + ' passed / ' + tf + ' failed');
