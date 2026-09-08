// VERIFIER #17 / SCENARIO 6 — no prior closure reopened. Enumerates the D72/D78/D95/D103/
// D113 cases from the committed suites, re-runs those suites, and reports each case's
// PASS/FAIL from OUTPUT TEXT (never the exit code).
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const TARGETS = ['D72', 'D78', 'D95', 'D103', 'D113'];
const files = readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs'));
const outputs = new Map();
for (const f of files) {
  let out = '';
  try { out = execFileSync(process.execPath, [resolve('qa/scenarios-runner', f)], { encoding: 'utf8', timeout: 180000 }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  outputs.set(f, out);
}
let total = 0, failing = 0;
for (const t of TARGETS) {
  console.log('=== ' + t + ' ===');
  const re = new RegExp('^(OK|FAIL)\\s+(' + t + '(?![0-9])[^\\s]*)\\s+(.*)$', 'gm');
  let found = 0;
  for (const [f, out] of outputs) {
    for (const m of out.matchAll(re)) {
      found++; total++;
      if (m[1] === 'FAIL') failing++;
      console.log(`  ${m[1].padEnd(5)} ${m[2].padEnd(46)} [${f.replace('_defect_closure_contract.mjs', '')}] ${m[3].slice(0, 100)}`);
    }
  }
  if (!found) console.log('  (no case ids matching ' + t + ' printed by any suite)');
}
console.log(`\n${TARGETS.join('/')} cases observed: ${total}, FAILING: ${failing}`);
// re-pin detection: a case whose description says the contract was changed/retired.
console.log('\n--- deliberate re-pins on the record (grep of the committed suites) ---');
for (const f of files) {
  const t = readFileSync(resolve('qa/scenarios-runner', f), 'utf8');
  for (const line of t.split('\n')) {
    if (/(RETIRED|re-?pin|CHANGED-in-contract|Closure edit|deliberately changes a committed contract|inverted)/i.test(line)
      && /D(72|78|95|103|113|116|119|123)/.test(line)) {
      console.log('  ' + f + ': ' + line.trim().slice(0, 160));
    }
  }
}
