// Verifier #14 mutation runner.
// Mutates the REAL source (so every suite sees it, not only ones honouring SEM_INDEX_SRC),
// runs the FULL .mjs battery enumerated from the filesystem, restores byte-identically and
// asserts the sha256 after EVERY cycle. A restore failure aborts the whole run loudly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MUTATIONS } from './v14_mutations.mjs';

const TARGET = 'supabase/functions/sem-ai-command/index.ts';
const PRISTINE = 'qa/verification/scratch/v14_pristine_index.ts';
const REQUIRED = '10db58385071d8f07fcd96ed65929be6b15bbeda3d197f4dae92327acba70d2a';
const DIR = 'qa/scenarios-runner';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

if (sha(PRISTINE) !== REQUIRED) throw new Error('pristine copy does not match the required sha256');
if (sha(TARGET) !== REQUIRED) throw new Error('target does not match the required sha256 at start');
const PRISTINE_TEXT = fs.readFileSync(PRISTINE, 'utf8');
const suites = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();

function battery() {
  const failures = [];
  for (const f of suites) {
    const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const failLines = out.split(/\r?\n/).filter((l) => /(^|\s)(FAIL|FAILED|✗|✘)(\s|:|$)/.test(l));
    if (r.status !== 0 || failLines.length > 0) {
      failures.push({ suite: f, exit: r.status, n: failLines.length, sample: failLines.slice(0, 6).map((l) => l.trim().slice(0, 140)) });
    }
  }
  return failures;
}

const only = process.argv[2] ? new Set(process.argv.slice(2)) : null;
const results = [];
try {
  for (const m of MUTATIONS) {
    if (only && !only.has(m.id)) continue;
    const count = PRISTINE_TEXT.split(m.from).length - 1;
    if (count !== 1) {
      results.push({ ...m, applied: false, note: `anchor matched ${count} times — mutation NOT applied` });
      console.log(`SKIP  ${m.id.padEnd(34)} anchor matched ${count} times`);
      continue;
    }
    fs.writeFileSync(TARGET, PRISTINE_TEXT.replace(m.from, m.to));
    let fails;
    try { fails = battery(); } finally {
      fs.writeFileSync(TARGET, PRISTINE_TEXT);
      const s = sha(TARGET);
      if (s !== REQUIRED) { console.error('RESTORE FAILED after ' + m.id + ' sha=' + s); process.exit(2); }
    }
    const killed = fails.length > 0;
    results.push({ id: m.id, guard: m.guard, kind: m.kind, what: m.what, applied: true, killed, killers: fails });
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} [${m.kind}] ${m.id.padEnd(34)} ${killed ? fails.map((f) => f.suite.replace('.mjs', '') + '(' + f.n + ')').join(' ') : '<<< NO COMMITTED CASE OBSERVES THIS >>>'}`);
    if (killed) fails.forEach((f) => f.sample.forEach((l) => console.log('        | ' + l)));
  }
} finally {
  fs.writeFileSync(TARGET, PRISTINE_TEXT);
  const s = sha(TARGET);
  console.log('\nFINAL index.ts sha256 = ' + s + (s === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
fs.writeFileSync('qa/verification/scratch/v14_mutation_results.json', JSON.stringify(results, null, 1));
const surv = results.filter((r) => r.applied && !r.killed);
console.log(`\nmutants: ${results.filter((r) => r.applied).length} applied, ${results.filter((r) => r.killed).length} killed, ${surv.length} SURVIVED, ${results.filter((r) => r.applied === false).length} skipped`);
surv.forEach((r) => console.log(`  SURVIVOR [${r.kind}] ${r.id} — ${r.what}`));
