// verifier #11 (attempt 2) INDEPENDENT battery runner.
// Enumerates every *.mjs suite in qa/scenarios-runner (excluding the _-prefixed shared
// helper) from the filesystem rather than a hand-maintained list, so a suite cannot be
// silently omitted from the deploy gate by being left out of a runner array.
// Writes one log per suite under qa/verification/scratch/v11a_*.log + a JSON summary.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = 'qa/scenarios-runner';
const SUITES = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();

const indexSha = createHash('sha256')
  .update(readFileSync('supabase/functions/sem-ai-command/index.ts'))
  .digest('hex');
console.log('index.ts sha256 (pre-run) ' + indexSha);
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
  writeFileSync('qa/verification/scratch/v11a_battery_' + s + '.log', out);
  const lines = out.trim().split('\n');
  const okCount = lines.filter((l) => /^(OK|PASS)\b/.test(l)).length;
  const failCount = lines.filter((l) => /^(FAIL|NOT OK)\b/.test(l)).length;
  const tail = lines.slice(-4);
  results.push({ suite: s, exit: r.status, ok: okCount, fail: failCount, ms: Date.now() - t0, tail });
  console.log(`${String(r.status).padStart(3)}  ${s}  OK=${okCount} FAIL=${failCount}`);
  for (const l of tail) console.log('        | ' + l);
}
const shaAfter = createHash('sha256')
  .update(readFileSync('supabase/functions/sem-ai-command/index.ts'))
  .digest('hex');
const summary = {
  index_ts_sha256_before: indexSha,
  index_ts_sha256_after: shaAfter,
  unchanged_during_run: indexSha === shaAfter,
  ran_at: new Date().toISOString(),
  node: process.version,
  suites: SUITES.length,
  results,
};
writeFileSync('qa/verification/scratch/v11a_battery_summary.json', JSON.stringify(summary, null, 1));
console.log('\nindex.ts sha256 (post-run) ' + shaAfter + '  unchanged=' + (indexSha === shaAfter));
console.log('TOTAL OK=' + results.reduce((a, r) => a + r.ok, 0) + ' FAIL=' + results.reduce((a, r) => a + r.fail, 0));
console.log('ALL EXIT ZERO: ' + results.every((r) => r.exit === 0));
const nonzero = results.filter((r) => r.exit !== 0);
if (nonzero.length) console.log('NONZERO EXITS: ' + nonzero.map((r) => r.suite + '=' + r.exit).join(', '));
