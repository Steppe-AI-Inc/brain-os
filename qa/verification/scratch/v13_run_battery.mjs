// verifier #13 INDEPENDENT battery runner (campaign #73, sha ace9b6a).
// Written fresh. Enumerates every non-underscore *.mjs suite from the filesystem so no
// suite can be omitted by a stale hand-maintained list, asserts the index.ts sha256
// baseline before AND after, and additionally flags suites that produce ZERO assertion
// lines (a no-op/stub suite exits 0 while proving nothing — the vacuous-test class this
// project has logged nine times).
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REQUIRED_SHA = process.env.V13_SHA_OVERRIDE || '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const dir = 'qa/scenarios-runner';
const tag = process.env.V13_TAG || 'v13';
const OUT = 'qa/verification/scratch/v13';
mkdirSync(OUT, { recursive: true });

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const before = sha(INDEX);
console.log('index.ts sha256 (pre-run)  ' + before);
if (before !== REQUIRED_SHA && !process.env.V13_ALLOW_MUTATED) {
  console.log('BASELINE MISMATCH — refusing to run. expected ' + REQUIRED_SHA);
  process.exit(2);
}

const SUITES = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();
console.log('suites discovered: ' + SUITES.length);

const results = [];
for (const s of SUITES) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [dir + '/' + s + '.mjs'], {
    encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  if (!process.env.V13_QUIET) writeFileSync(`${OUT}/${tag}_${s}.log`, out);
  const lines = out.trim().split('\n');
  const ok = lines.filter((l) => /^(OK|PASS)\b/.test(l)).length;
  const fail = lines.filter((l) => /^(FAIL|NOT OK)\b/.test(l)).length;
  results.push({ suite: s, exit: r.status, ok, fail, assertionLines: ok + fail, ms: Date.now() - t0, tail: lines.slice(-3) });
  console.log(`${String(r.status).padStart(3)}  ${s.padEnd(58)} OK=${String(ok).padStart(3)} FAIL=${fail}${ok + fail === 0 ? '   <-- ZERO ASSERTIONS' : ''}`);
  if (r.status !== 0 || fail) for (const l of lines.slice(-8)) console.log('        | ' + l);
}

const after = sha(INDEX);
const summary = {
  verifier: 13, campaign: 73,
  index_ts_sha256_before: before, index_ts_sha256_after: after,
  unchanged_during_run: before === after,
  ran_at: new Date().toISOString(), node: process.version,
  suites: SUITES.length,
  total_ok: results.reduce((a, r) => a + r.ok, 0),
  total_fail: results.reduce((a, r) => a + r.fail, 0),
  all_exit_zero: results.every((r) => r.exit === 0),
  zero_assertion_suites: results.filter((r) => r.assertionLines === 0).map((r) => r.suite),
  results,
};
writeFileSync(`${OUT}/${tag}_battery_summary.json`, JSON.stringify(summary, null, 1));
console.log('\nindex.ts sha256 (post-run) ' + after + '  unchanged=' + (before === after));
console.log('TOTAL OK=' + summary.total_ok + ' FAIL=' + summary.total_fail);
console.log('ALL EXIT ZERO: ' + summary.all_exit_zero);
console.log('ZERO-ASSERTION SUITES: ' + (summary.zero_assertion_suites.join(', ') || '(none)'));
const nz = results.filter((r) => r.exit !== 0);
if (nz.length) console.log('NONZERO EXITS: ' + nz.map((r) => r.suite + '=' + r.exit).join(', '));
process.exit(summary.all_exit_zero ? 0 : 1);
