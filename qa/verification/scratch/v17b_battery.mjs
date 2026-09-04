// VERIFIER #17 — my own battery runner. Enumerates .mjs suites FROM THE FILESYSTEM,
// runs each, records exit code AND the failure count parsed from OUTPUT TEXT, and flags
// suites with zero assertions (stubs) / zero output.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'qa/scenarios-runner');
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
const results = [];
for (const f of files) {
  const p = resolve(DIR, f);
  const text = readFileSync(p, 'utf8');
  const looksLikeStub = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length <= 3;
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : -1;
    out = (e.stdout || '') + (e.stderr || '');
  }
  // Count failures from OUTPUT TEXT, never from the exit code.
  const failLines = (out.match(/^FAIL\b.*$/gm) || []).length;
  const summary = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail/i);
  const summaryFail = summary ? Number(summary[2]) : null;
  const summaryPass = summary ? Number(summary[1]) : null;
  const okLines = (out.match(/^OK\b/gm) || []).length;
  results.push({
    file: f, exitCode: code, failLinesInOutput: failLines,
    summaryPass, summaryFail, okLines,
    assertionBearing: !looksLikeStub && (okLines > 0 || failLines > 0 || summary !== null),
    stubShape: looksLikeStub,
    outputBytes: out.length,
    tail: out.trim().split('\n').slice(-3).join(' | '),
  });
}
const assertionBearing = results.filter((r) => r.assertionBearing);
const stubs = results.filter((r) => !r.assertionBearing);
const failing = results.filter((r) => r.failLinesInOutput > 0 || (r.summaryFail || 0) > 0 || r.exitCode !== 0);
const report = {
  generated_at: new Date().toISOString(),
  total_mjs_files: files.length,
  assertion_bearing: assertionBearing.length,
  non_assertion_bearing: stubs.map((s) => s.file),
  total_OK_lines: results.reduce((a, r) => a + r.okLines, 0),
  total_FAIL_lines_in_output: results.reduce((a, r) => a + r.failLinesInOutput, 0),
  suites_with_any_failure_signal: failing.map((f) => ({ file: f.file, exitCode: f.exitCode, failLines: f.failLinesInOutput, summaryFail: f.summaryFail })),
  results,
};
writeFileSync(resolve(process.cwd(), 'qa/verification/scratch/v17b_battery_result.json'), JSON.stringify(report, null, 1));
console.log(`files=${files.length} assertion_bearing=${assertionBearing.length} non_assertion_bearing=${stubs.length}`);
console.log(`OK lines=${report.total_OK_lines}  FAIL lines=${report.total_FAIL_lines_in_output}`);
console.log('non-assertion-bearing: ' + stubs.map((s) => s.file).join(', '));
console.log('failure signals: ' + (failing.length ? JSON.stringify(report.suites_with_any_failure_signal) : 'NONE'));
