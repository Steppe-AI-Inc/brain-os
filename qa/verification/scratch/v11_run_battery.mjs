// verifier #11 battery runner — runs EVERY .mjs suite in qa/scenarios-runner (not a
// hand-picked list), captures exit code + OK/FAIL counts + tail, binds the result to the
// index.ts sha256 measured immediately before and after the run.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = () => createHash('sha256').update(readFileSync('supabase/functions/sem-ai-command/index.ts')).digest('hex');
const before = sha();
const SUITES = readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const results = [];
for (const f of SUITES) {
  const s = f.replace(/\.mjs$/, '');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + f], { encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync('qa/verification/scratch/v11_battery_' + s + '.log', out);
  const lines = out.trim().split('\n');
  const okCount = lines.filter((l) => /^OK\b/.test(l)).length;
  const failCount = lines.filter((l) => /^(FAIL|DRIFT)\b/.test(l)).length;
  const tail = lines.filter((l) => /passed|DEPLOY GATE|GATE|\d+\/\d+|Error|pass,/.test(l)).slice(-3);
  results.push({ suite: s, exit: r.status, signal: r.signal, ok: okCount, fail: failCount, ms: Date.now() - t0, tail });
  console.log(`${String(r.status).padStart(4)}  ${s.padEnd(58)} OK=${okCount} FAIL=${failCount} (${Date.now() - t0}ms)`);
  for (const l of tail) console.log('        ' + l);
}
const after = sha();
const summary = { index_ts_sha256_before: before, index_ts_sha256_after: after, untouched: before === after, ran_at: new Date().toISOString(), node: process.version, suites: SUITES.length, results };
writeFileSync('qa/verification/scratch/v11_battery_summary.json', JSON.stringify(summary, null, 1));
console.log('\nindex.ts sha256 before ' + before + '\nindex.ts sha256 after  ' + after + '\nUNTOUCHED: ' + (before === after));
console.log('ALL EXIT ZERO: ' + results.every((r) => r.exit === 0) + '  (' + results.filter((r) => r.exit !== 0).map((r) => r.suite).join(', ') + ')');
