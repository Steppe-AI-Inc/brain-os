// VERIFIER #19 — full .mjs battery, enumerated FROM THE FILESYSTEM (not from a count in a
// postscript). Verdict per suite comes from OUTPUT TEXT, never from the exit code, and
// stubs (SUPERSEDED files that exit 0 without asserting anything) are reported separately.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'qa/scenarios-runner';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
const rows = [];
for (const f of files) {
  const p = DIR + '/' + f;
  let out = '', code = 0;
  try { out = execFileSync(process.execPath, [p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 }); }
  catch (e) { code = e.status ?? -1; out = String(e.stdout || '') + String(e.stderr || ''); }
  const text = out;
  const okMarks = (text.match(/^OK\b/gm) || []).length + (text.match(/^\s*(?:PASS|ok)\b/gm) || []).length;
  // failure counted from OUTPUT TEXT: any line starting FAIL/✗/ERROR, or an "N failed" tally with N>0
  const failLines = (text.match(/^(?:FAIL|FAILED|✗|ERROR)\b.*$/gm) || []);
  const tallies = [...text.matchAll(/(\d+)\s+failed/g)].map((m) => parseInt(m[1], 10));
  // "N/M passed" (issue5 style) contributes M-N failures and N passes.
  const ratios = [...text.matchAll(/(\d+)\/(\d+)\s+passed/g)].map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  const ratioFail = ratios.reduce((a, [n, m]) => a + (m - n), 0);
  const ratioPass = ratios.reduce((a, [n]) => Math.max(a, n), 0);
  const tallyFail = tallies.reduce((a, b) => a + b, 0) + ratioFail;
  const okAll = okMarks + (okMarks === 0 ? ratioPass : 0);
  const isStub = /SUPERSEDED/i.test(text) && okAll === 0 && failLines.length === 0 && tallies.length === 0 && ratios.length === 0;
  const library = /^_/.test(f);
  rows.push({ f, code, okMarks: okAll, failText: failLines.length, tallyFail, isStub, library, bytes: text.length,
    head: text.split('\n').filter((l) => l.trim()).slice(-2).join(' | ').slice(0, 120) });
}
const assertion = rows.filter((r) => !r.isStub && !r.library);
const totalOK = assertion.reduce((a, r) => a + r.okMarks, 0);
const totalFail = assertion.reduce((a, r) => a + r.failText + r.tallyFail, 0);
for (const r of rows) {
  console.log([r.isStub ? 'STUB' : r.library ? 'LIB ' : 'RUN ', 'exit=' + String(r.code).padStart(2),
    'ok=' + String(r.okMarks).padStart(4), 'failTXT=' + String(r.failText + r.tallyFail).padStart(3), r.f].join(' '));
  if (r.failText + r.tallyFail > 0 || (r.code !== 0 && !r.isStub)) console.log('        ' + r.head);
}
console.log('\nFILES=' + files.length, 'LIBRARY=' + rows.filter((r) => r.library).length,
  'STUBS=' + rows.filter((r) => r.isStub).length, 'ASSERTION-BEARING=' + assertion.length);
console.log('OK MARKS=' + totalOK, ' FAILURES FROM OUTPUT TEXT=' + totalFail,
  ' NONZERO EXITS=' + rows.filter((r) => r.code !== 0).length);
process.exitCode = 0;
