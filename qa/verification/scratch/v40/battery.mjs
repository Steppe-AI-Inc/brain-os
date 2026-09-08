// VERIFIER #40 — run every .mjs suite under qa/scenarios-runner from the filesystem and
// report BOTH the exit code and the parsed OUTPUT TEXT. Exit status is recorded but the
// verdict is taken from the text, per this campaign's own rule.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DIR = path.join(ROOT, 'qa', 'scenarios-runner');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();

let totalPass = 0; let totalFail = 0; let suitesFailing = 0; let suitesErr = 0;
const rows = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // parse "N passed, M failed" style tallies (several formats used across suites)
  let pass = 0; let fail = 0; let found = false;
  const re = /(\d+)\s*(?:passed|pass)\b[^\d]{0,12}(\d+)\s*(?:failed|fail)/gi;
  let m;
  while ((m = re.exec(out)) !== null) { pass += Number(m[1]); fail += Number(m[2]); found = true; }
  if (!found) {
    const okc = (out.match(/^\s*(OK|PASS)\b/gim) || []).length;
    const failc = (out.match(/^\s*(FAIL|ERROR|✗)\b/gim) || []).length;
    if (okc || failc) { pass = okc; fail = failc; found = true; }
  }
  const exitOk = r.status === 0;
  if (fail > 0) suitesFailing++;
  if (!found && !exitOk) suitesErr++;
  totalPass += pass; totalFail += fail;
  rows.push({ f, pass, fail, found, status: r.status, tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 160) });
}

for (const r of rows) {
  console.log((r.fail > 0 ? 'FAILING ' : r.status === 0 ? 'ok      ' : 'EXIT!=0 ')
    + r.f.padEnd(58) + 'pass=' + String(r.pass).padStart(4) + ' fail=' + String(r.fail).padStart(3)
    + ' exit=' + String(r.status).padStart(3) + (r.found ? '' : '  [no tally parsed]'));
  if (r.fail > 0 || r.status !== 0) console.log('        ' + r.tail);
}
console.log('\nSUITES=' + files.length + '  suites with a failing assertion=' + suitesFailing
  + '  suites with nonzero exit and no tally=' + suitesErr
  + '  assertions: ' + totalPass + ' passed / ' + totalFail + ' failed');
