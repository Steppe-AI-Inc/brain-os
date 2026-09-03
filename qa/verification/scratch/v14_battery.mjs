#!/usr/bin/env node
// Verifier #14 independent battery runner.
// Enumerates .mjs suites FROM THE FILESYSTEM (no hardcoded list), runs each,
// records exit code AND failure counts parsed from OUTPUT TEXT.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = 'qa/scenarios-runner';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.mjs')).sort();
const outDir = 'qa/verification/scratch/v14_battery_out';
fs.mkdirSync(outDir, { recursive: true });

const CAPACITY_RE = /(provider capacity|capacity limit|session limit|rate.?limit|overloaded_error|429|quota exceeded|usage limit)/i;

const results = [];
for (const f of files) {
  const p = path.join(DIR, f);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 300000, env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(outDir, f + '.log'), out);
  // Parse failures from OUTPUT TEXT (never trust exit code)
  const failLines = out.split(/\r?\n/).filter(l => /^\s*(FAIL|✗|✘|×|\[FAIL\]|FAILED)\b/i.test(l) || /\bFAIL\b(?!URE MODE)/.test(l) && /^\s*(FAIL|.*?FAIL:)/.test(l));
  const strictFail = out.split(/\r?\n/).filter(l => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
  // summary-line parse e.g. "60 passed, 0 failed"
  const summaries = out.split(/\r?\n/).filter(l => /\d+\s+fail/i.test(l) || /fail(ed|ures)?\s*[:=]\s*\d+/i.test(l));
  let summaryFailNum = null;
  for (const s of summaries) {
    let m = s.match(/(\d+)\s+fail/i) || s.match(/fail(?:ed|ures)?\s*[:=]\s*(\d+)/i);
    if (m) summaryFailNum = summaryFailNum === null ? Number(m[1]) : Math.max(summaryFailNum, Number(m[1]));
  }
  const passLines = out.split(/\r?\n/).filter(l => /(^|\s)(PASS|OK|✓|✔)(\s|:|$)/.test(l));
  results.push({
    suite: f,
    exit: r.status,
    signal: r.signal,
    ms: Date.now() - t0,
    bytes: out.length,
    lines: out.split(/\r?\n/).length,
    fail_lines_count: strictFail.length,
    fail_lines_sample: strictFail.slice(0, 12),
    summary_fail_num: summaryFailNum,
    summary_lines: summaries.slice(-6),
    pass_lines_count: passLines.length,
    capacity_text: CAPACITY_RE.test(out) ? out.split(/\r?\n/).filter(l => CAPACITY_RE.test(l)).slice(0, 5) : null,
    asserts_nothing_suspect: passLines.length === 0 && strictFail.length === 0,
  });
  console.log(`${f}  exit=${r.status}  failLines=${strictFail.length}  summaryFail=${summaryFailNum}  passLines=${passLines.length}  ${r.signal ? 'SIGNAL=' + r.signal : ''}`);
}
fs.writeFileSync('qa/verification/scratch/v14_battery_results.json', JSON.stringify(results, null, 1));
console.log('\n=== SUITES WITH NONZERO EXIT OR OUTPUT FAILURES ===');
for (const r of results) {
  if (r.exit !== 0 || r.fail_lines_count > 0 || (r.summary_fail_num || 0) > 0) {
    console.log(`${r.suite}: exit=${r.exit} failLines=${r.fail_lines_count} summaryFail=${r.summary_fail_num}`);
    r.fail_lines_sample.forEach(l => console.log('    | ' + l.slice(0, 200)));
  }
}
console.log('\n=== SUITES THAT MAY ASSERT NOTHING ===');
results.filter(r => r.asserts_nothing_suspect).forEach(r => console.log(`${r.suite}: no PASS/FAIL lines at all (${r.lines} output lines)`));
console.log('\n=== CAPACITY TEXT ===');
results.filter(r => r.capacity_text).forEach(r => console.log(r.suite, JSON.stringify(r.capacity_text)));
