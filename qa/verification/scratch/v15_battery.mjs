// VERIFIER #15 — SCENARIO 1. Enumerate every .mjs suite in qa/scenarios-runner FROM THE
// FILESYSTEM (never a hardcoded list — a suite that silently stops being run is how
// coverage dies here) and run all of them.
//
// Classification is from OUTPUT TEXT, not exit code. A suite that prints failures and
// exits 0 is recorded as a FAIL. A suite that prints no pass/fail markers at all is
// flagged ASSERTS-NOTHING.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'qa/scenarios-runner';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
console.log(`enumerated ${files.length} .mjs files from ${DIR}\n`);

const rows = [];
for (const f of files) {
  const p = `${DIR}/${f}`;
  let out = '', code = 0;
  const t0 = Date.now();
  try {
    out = execFileSync(process.execPath, [p], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
      env: { ...process.env },
    });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : -1;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const ms = Date.now() - t0;

  // Count from OUTPUT TEXT.
  const failLines = (out.match(/^(FAIL|FAILED|✗|not ok)\b/gmi) || []).length
    + (out.match(/^FAIL /gm) || []).length * 0; // FAIL-prefixed lines already counted
  const okLines = (out.match(/^(OK|PASS|✓|ok)\b/gmi) || []).length;
  const summary = (out.match(/^.*?(\d+) pass,\s*(\d+) fail.*$/mi) || [])[0] || '';
  const summaryFail = summary ? Number((summary.match(/(\d+) fail/i) || [])[1]) : null;
  const capacity = /session limit|rate limit|capacity|quota|overloaded|429/i.test(out);
  const assertsNothing = okLines === 0 && failLines === 0 && !summary;

  rows.push({ f, code, ms, okLines, failLines, summaryFail, summary: summary.trim(), capacity, assertsNothing, out });
}

console.log('SUITE'.padEnd(56) + 'EXIT'.padEnd(6) + 'OK'.padEnd(6) + 'FAILTXT'.padEnd(9) + 'SUMMARY');
for (const r of rows) {
  console.log(
    r.f.padEnd(56) + String(r.code).padEnd(6) + String(r.okLines).padEnd(6)
    + String(r.failLines).padEnd(9) + (r.summary || (r.assertsNothing ? '*** ASSERTS NOTHING ***' : '')));
}

const bad = rows.filter((r) => r.code !== 0 || r.failLines > 0 || (r.summaryFail ?? 0) > 0);
console.log(`\n=== ${rows.length} suites; ${bad.length} with a nonzero exit or textual failures ===`);
for (const r of bad) {
  console.log(`\n----- ${r.f} (exit ${r.code}, ${r.failLines} FAIL lines) -----`);
  const lines = r.out.split('\n').filter((l) => /^(FAIL|FAILED|✗|not ok)/i.test(l) || /\d+ pass,\s*\d+ fail/i.test(l) || /Error:/.test(l));
  console.log(lines.slice(0, 25).join('\n'));
}

const nothing = rows.filter((r) => r.assertsNothing);
if (nothing.length) console.log(`\n=== SUITES ASSERTING NOTHING: ${nothing.map((r) => r.f).join(', ')} ===`);
const cap = rows.filter((r) => r.capacity);
if (cap.length) console.log(`\n=== PROVIDER-CAPACITY TEXT DETECTED IN: ${cap.map((r) => r.f).join(', ')} ===`);

fs.writeFileSync('qa/verification/scratch/v15_battery_result.json',
  JSON.stringify(rows.map(({ out, ...r }) => ({ ...r, outTail: out.split('\n').slice(-6).join('\n') })), null, 1));
