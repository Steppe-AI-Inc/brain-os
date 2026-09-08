// Apply the four prepared fixes to a SCRATCH copy of index.ts (supabase/ is never written)
// and run the whole committed battery + verifier gates against it via SEM_INDEX_SRC.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FIXES } from './prepared_fix.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const SRC = path.join(ROOT, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const before = fs.readFileSync(SRC);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
console.log('index.ts sha256 BEFORE: ' + sha(before));

let text = before.toString('utf8');
for (const k of ['A', 'B', 'C', 'D']) text = FIXES[k](text);
const OUT = path.join(HERE, 'index.PREPARED_FIX.not-for-deploy.ts');
fs.writeFileSync(OUT, text);
console.log('patched copy: ' + OUT + '  (' + Buffer.byteLength(text) + ' bytes)');

const DIR = path.join(ROOT, 'qa', 'scenarios-runner');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const V92DIR = path.join(ROOT, 'qa', 'verification', 'scratch', 'v92');
const gates = [];
for (const d of fs.readdirSync(V92DIR)) {
  const p = path.join(V92DIR, d);
  if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) if (/^v\d+_regression_additions\.mjs$/.test(f)) gates.push(path.join(p, f));
  else if (/^v\d+_regression_additions\.mjs$/.test(d)) gates.push(p);
}
gates.sort();

const run = (file, env) => {
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: 'utf8', env, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  let pass = 0; let fail = 0;
  const re = /(\d+)\s*(?:passed|pass)\b[^\d]{0,12}(\d+)\s*(?:failed|fail)/gi;
  let m; while ((m = re.exec(out)) !== null) { pass += Number(m[1]); fail += Number(m[2]); }
  return { pass, fail, status: r.status, out };
};

const envBase = { ...process.env, SEM_INDEX_SRC: OUT };
let deltas = 0;
console.log('\n== committed battery, patched vs shipped ==');
for (const f of files) {
  const a = run(path.join(DIR, f), { ...process.env });
  const b = run(path.join(DIR, f), envBase);
  const same = a.pass === b.pass && a.fail === b.fail && a.status === b.status;
  if (!same) deltas++;
  console.log((same ? 'same ' : 'DELTA') + ' ' + f.padEnd(58) + 'shipped ' + a.pass + '/' + a.fail + ' exit' + a.status
    + '   patched ' + b.pass + '/' + b.fail + ' exit' + b.status);
  if (!same) {
    const bl = b.out.split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 6);
    for (const l of bl) console.log('        ' + l.slice(0, 190));
  }
}
console.log('\n== verifier gates, patched vs shipped ==');
for (const g of gates) {
  const a = run(g, { ...process.env });
  const b = run(g, envBase);
  const same = a.pass === b.pass && a.fail === b.fail && a.status === b.status;
  if (!same) deltas++;
  console.log((same ? 'same ' : 'DELTA') + ' ' + path.basename(g).padEnd(58) + 'shipped ' + a.pass + '/' + a.fail + ' exit' + a.status
    + '   patched ' + b.pass + '/' + b.fail + ' exit' + b.status);
  if (!same) {
    const bl = b.out.split('\n').filter((l) => /^FAIL/.test(l)).slice(0, 6);
    for (const l of bl) console.log('        ' + l.slice(0, 190));
  }
}
const after = fs.readFileSync(SRC);
console.log('\nindex.ts sha256 AFTER : ' + sha(after));
console.log('index.ts UNTOUCHED: ' + before.equals(after));
console.log('suites/gates whose result changed: ' + deltas);
