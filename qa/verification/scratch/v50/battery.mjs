// VERIFIER #50 — run every qa/scenarios-runner/*.mjs suite AND every standing verifier gate as its
// OWN child process; the recorded status is the child's exit status (never a pipeline's). Records
// printed pass/fail counts so a suite that asserts nothing (vacuity) is visible, and screens each
// suite's output for a "0 rows"/"0 cases" generator that would make a green meaningless.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = 'qa/scenarios-runner';
const suites = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort().map((f) => join(DIR, f));
const GATES = [
  'qa/verification/scratch/v92/v30_regression_additions.mjs',
  'qa/verification/scratch/v92/v31_regression_additions.mjs',
  'qa/verification/scratch/v92/v42/v42_regression_additions.mjs',
  'qa/verification/scratch/v92/v46/v46_regression_additions.mjs',
  'qa/verification/scratch/v92/v47/v47_regression_additions.mjs',
  'qa/verification/proposed/v46_regression_additions.mjs',
  'qa/verification/proposed/v48_regression_additions.mjs',
  'qa/verification/proposed/v49_regression_additions.mjs',
].filter((g) => existsSync(g));

const results = [];
function run(kind, f) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const counts = out.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i) || out.match(/PASS(?:ED)?[=: ]+(\d+)[^\d]+FAIL(?:ED)?[=: ]+(\d+)/i) || out.match(/(\d+)\s+pass(?:ed)?\s*\/\s*(\d+)\s+fail(?:ed)?/i);
  const superseded = /SUPERSEDED/i.test(out);
  const zeroGen = /\b0 (?:rows|cases|shapes|corpus rows|inputs)\b/i.test(out);
  const tail = out.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
  const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok|✗|✘|\*\*\* FAIL)/i.test(l)).slice(0, 8).map((l) => l.trim().slice(0, 220));
  results.push({ kind, file: f, exit: r.status, ms: Date.now() - t0, passed: counts ? Number(counts[1]) : null, failed: counts ? Number(counts[2]) : null, superseded, zeroGen, tail, fails });
  console.log(`${String(r.status).padStart(3)}  ${kind.padEnd(5)} ${f.padEnd(78)} ${counts ? counts[1] + '/' + counts[2] : (superseded ? 'SUPERSEDED' : 'no-count')}${zeroGen ? '  [ZERO-GEN?]' : ''}`);
  for (const l of fails) console.log('        ' + l);
}
for (const s of suites) run('suite', s);
for (const g of GATES) run('gate', g);
const su = results.filter((r) => r.kind === 'suite');
const nz = su.filter((r) => r.exit !== 0);
console.log(`\nSUITES=${su.length} exit0=${su.length - nz.length} nonzero=${nz.length}`);
for (const r of nz) console.log('  NONZERO ' + r.file + ' :: ' + r.tail);
console.log('suites printing no pass/fail count (vacuity screen): ' + (su.filter((r) => r.passed === null && !r.superseded).map((r) => r.file).join(', ') || 'none'));
console.log('suites declared SUPERSEDED: ' + (su.filter((r) => r.superseded).map((r) => r.file).join(', ') || 'none'));
console.log('GATES: ' + results.filter((r) => r.kind === 'gate').map((r) => `${r.file.split('/').pop()}=${r.passed}/${r.failed}(exit ${r.exit})`).join('  '));
writeFileSync('qa/verification/scratch/v50/battery.json', JSON.stringify(results, null, 2));
