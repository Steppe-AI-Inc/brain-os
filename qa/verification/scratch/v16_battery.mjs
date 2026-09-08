#!/usr/bin/env node
// VERIFIER #16 own battery runner. Classifies from OUTPUT TEXT, never from exit code.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = 'qa/scenarios-runner';
const suites = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
const rows = [];
for (const s of suites) {
  const p = path.join(dir, s);
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // Parse failure counts from OUTPUT TEXT.
  const summary = [...out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/gi)].map((m) => ({ p: +m[1], f: +m[2] }));
  const failLines = out.split(/\r?\n/).filter((l) => /^\s*(FAIL|FAILED|✗|X )/i.test(l) || /\bFAIL\b/.test(l.slice(0, 12)));
  const okLines = out.split(/\r?\n/).filter((l) => /^\s*(OK|PASS|✓)/i.test(l));
  const capacity = /(capacity|rate.?limit|session limit|overloaded|529|503 Service)/i.test(out);
  rows.push({
    suite: s,
    exit: r.status,
    signal: r.signal || null,
    summary_lines: summary,
    parsed_passed: summary.reduce((a, b) => a + b.p, 0),
    parsed_failed: summary.reduce((a, b) => a + b.f, 0),
    ok_lines: okLines.length,
    fail_lines: failLines.length,
    asserts_nothing: okLines.length === 0 && summary.length === 0,
    provider_capacity_text: capacity,
    out_tail: out.split(/\r?\n/).slice(-6).join('\n'),
  });
}
fs.writeFileSync('qa/verification/scratch/v16_battery_result.json', JSON.stringify(rows, null, 2));
let bad = 0;
for (const r of rows) {
  const verdict = (r.exit === 0 && r.parsed_failed === 0 && r.fail_lines === 0 && !r.asserts_nothing) ? 'PASS'
    : r.asserts_nothing ? 'ASSERTS-NOTHING?' : 'FAIL';
  if (verdict !== 'PASS') bad++;
  console.log(`${verdict.padEnd(16)} exit=${String(r.exit).padEnd(4)} passed=${String(r.parsed_passed).padEnd(4)} failed=${String(r.parsed_failed).padEnd(3)} okLines=${String(r.ok_lines).padEnd(4)} failLines=${r.fail_lines}  ${r.suite}`);
}
console.log(`\nBATTERY: ${rows.length} suites, ${bad} non-PASS`);
