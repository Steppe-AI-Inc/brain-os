// verifier #12 INDEPENDENT battery runner (campaign #72, sha f4763ef).
// Written fresh rather than reusing #11's runner. Enumerates every non-underscore *.mjs
// suite from the filesystem so no suite can be omitted by a stale hand-maintained list.
// Also asserts the index.ts sha256 baseline BEFORE running anything and refuses to run
// on a moved baseline.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REQUIRED_SHA = '1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec';
const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const dir = 'qa/scenarios-runner';
const tag = process.env.V12_TAG || 'v12';

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const before = sha(INDEX);
console.log('index.ts sha256 (pre-run)  ' + before);
if (before !== REQUIRED_SHA) {
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
    encoding: 'utf8',
    env: { ...process.env, DEPLOY_GATE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(`qa/verification/scratch/${tag}_battery_${s}.log`, out);
  const lines = out.trim().split('\n');
  const ok = lines.filter((l) => /^(OK|PASS)\b/.test(l)).length;
  const fail = lines.filter((l) => /^(FAIL|NOT OK)\b/.test(l)).length;
  results.push({ suite: s, exit: r.status, ok, fail, ms: Date.now() - t0, tail: lines.slice(-3) });
  console.log(`${String(r.status).padStart(3)}  ${s.padEnd(58)} OK=${String(ok).padStart(3)} FAIL=${fail}`);
  if (r.status !== 0 || fail) for (const l of lines.slice(-6)) console.log('        | ' + l);
}

const after = sha(INDEX);
const summary = {
  verifier: 12,
  campaign: 72,
  index_ts_sha256_before: before,
  index_ts_sha256_after: after,
  unchanged_during_run: before === after,
  ran_at: new Date().toISOString(),
  node: process.version,
  suites: SUITES.length,
  total_ok: results.reduce((a, r) => a + r.ok, 0),
  total_fail: results.reduce((a, r) => a + r.fail, 0),
  all_exit_zero: results.every((r) => r.exit === 0),
  results,
};
writeFileSync(`qa/verification/scratch/${tag}_battery_summary.json`, JSON.stringify(summary, null, 1));
console.log('\nindex.ts sha256 (post-run) ' + after + '  unchanged=' + (before === after));
console.log('TOTAL OK=' + summary.total_ok + ' FAIL=' + summary.total_fail);
console.log('ALL EXIT ZERO: ' + summary.all_exit_zero);
const nz = results.filter((r) => r.exit !== 0);
if (nz.length) console.log('NONZERO EXITS: ' + nz.map((r) => r.suite + '=' + r.exit).join(', '));
