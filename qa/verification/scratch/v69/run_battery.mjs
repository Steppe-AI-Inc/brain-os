// VERIFIER #69 — run every suite in qa/scenarios-runner from the filesystem, independently.
// Verdict is read from OUTPUT TEXT as well as exit code; a suite that prints nothing is a HARNESS FAILURE.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = 'qa/scenarios-runner';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
const results = [];
for (const f of files) {
  const p = path.join(dir, f);
  let out = '', code = 0, err = '';
  const t0 = Date.now();
  try {
    out = execFileSync(process.execPath, [p], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : -1;
    out = (e.stdout || '') + '';
    err = (e.stderr || '') + '';
  }
  const ms = Date.now() - t0;
  const text = out + '\n' + err;
  // parse "N passed, M failed" style totals wherever they appear
  const tot = [...text.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/gi)].map((m) => [Number(m[1]), Number(m[2])]);
  const passed = tot.reduce((a, x) => a + x[0], 0);
  const failed = tot.reduce((a, x) => a + x[1], 0);
  const failLines = text.split('\n').filter((l) => /^\s*(FAIL|✗|XX|NOT OK|ERROR)\b/i.test(l)).length;
  const zeroTargets = /\b0\s+(?:targets|cases|mutants|checks)\b/i.test(text);
  results.push({ f, code, ms, passed, failed, failLines, empty: text.trim().length === 0, zeroTargets, tail: text.trim().split('\n').slice(-3).join(' | ').slice(0, 300) });
}
let bad = 0;
console.log('SUITE'.padEnd(62) + 'EXIT  PASS  FAIL  MS');
for (const r of results) {
  const flag = (r.code !== 0 || r.failed > 0 || r.empty) ? '  <<< PROBLEM' : '';
  if (flag) bad++;
  console.log(r.f.padEnd(62) + String(r.code).padEnd(6) + String(r.passed).padEnd(6) + String(r.failed).padEnd(6) + String(r.ms).padEnd(7) + flag);
}
console.log('\nTOTAL SUITES=' + results.length + '  PROBLEM=' + bad);
console.log('\n=== PROBLEM DETAIL ===');
for (const r of results.filter((x) => x.code !== 0 || x.failed > 0 || x.empty)) {
  console.log('--- ' + r.f + ' exit=' + r.code + ' empty=' + r.empty);
  console.log('    ' + r.tail);
}
console.log('\n=== SUITES PRINTING NO PASS TOTALS (possible vacuity) ===');
for (const r of results.filter((x) => x.passed === 0 && x.failed === 0)) console.log('  ' + r.f + ' exit=' + r.code + '  tail: ' + r.tail.slice(0, 160));
fs.writeFileSync('qa/verification/scratch/v69/battery.json', JSON.stringify(results, null, 2));
