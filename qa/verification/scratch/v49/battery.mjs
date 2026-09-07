// VERIFIER #49 — run every qa/scenarios-runner/*.mjs suite as its OWN child process. The exit
// status is the child's, never a pipeline's. Also records whether a suite printed any pass/fail
// counts at all (vacuity screen: a suite that asserts nothing cannot be red).
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = 'qa/scenarios-runner';
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(DIR, f)], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const counts = out.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i) || out.match(/PASS(?:ED)?[=: ]+(\d+)[^\d]+FAIL(?:ED)?[=: ]+(\d+)/i);
  const superseded = /SUPERSEDED/i.test(out);
  const tail = out.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
  results.push({ file: f, exit: r.status, ms: Date.now() - t0, passed: counts ? Number(counts[1]) : null, failed: counts ? Number(counts[2]) : null, superseded, tail });
  console.log(`${String(r.status).padStart(3)}  ${f.padEnd(62)} ${counts ? counts[1] + '/' + counts[2] : (superseded ? 'SUPERSEDED' : 'no-count')}`);
}
const nonzero = results.filter((r) => r.exit !== 0);
console.log(`\nsuites=${results.length} exit0=${results.length - nonzero.length} nonzero=${nonzero.length}`);
for (const r of nonzero) console.log('  NONZERO ' + r.file + ' :: ' + r.tail);
const noCount = results.filter((r) => r.passed === null && !r.superseded);
console.log(`no pass/fail count printed (screen for vacuity): ${noCount.map((r) => r.file).join(', ') || 'none'}`);
writeFileSync('qa/verification/scratch/v49/battery.json', JSON.stringify(results, null, 2));
