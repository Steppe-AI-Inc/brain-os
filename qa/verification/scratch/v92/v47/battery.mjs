// Run the whole qa/scenarios-runner battery from the filesystem and report per-suite results
// AND vacuity signals. Verdicts come from OUTPUT TEXT and exit code together.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const DIR = path.join(ROOT, 'qa/scenarios-runner');
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : null;

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
let totP = 0, totF = 0, suitesFailing = 0, vacuous = 0;
const rows = [];
for (const f of files) {
  const env = { ...process.env };
  if (SRC) env.SEM_INDEX_SRC = SRC;
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', env, cwd: ROOT, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const okCount = (out.match(/^OK\s/gm) || []).length;
  const failCount = (out.match(/^FAIL\s/gm) || []).length;
  const p = m ? +m[1] : okCount, fl = m ? +m[2] : failCount;
  totP += p; totF += fl;
  const asserting = p + fl > 0;
  if (!asserting) vacuous++;
  if (fl > 0 || r.status !== 0) suitesFailing++;
  rows.push({ f, p, fl, status: r.status, asserting, out });
}
for (const r of rows) {
  console.log((r.fl > 0 || r.status !== 0 ? 'RED  ' : r.asserting ? 'green' : 'VACUOUS?').padEnd(9),
    r.f.padEnd(62), String(r.p).padStart(4) + '/' + String(r.fl).padStart(3), ' exit=' + r.status);
  if (r.fl > 0 || r.status !== 0) {
    for (const l of r.out.split('\n').filter((x) => /^FAIL|Error|error:/.test(x)).slice(0, 8)) console.log('        ', l.trim());
  }
}
console.log('\nsuites executed:', files.length, '| suites with failures or nonzero exit:', suitesFailing,
  '| non-asserting (possible vacuity):', vacuous);
console.log('assertions:', totP, 'passed,', totF, 'failed');
