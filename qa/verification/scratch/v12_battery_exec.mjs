// Quiet battery executor for the mutation harness: runs every committed *.mjs suite and
// prints ONE line of JSON as the last line. Does NOT assert the index.ts sha (the mutation
// harness deliberately mutates it and restores + sha-verifies afterwards).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const dir = 'qa/scenarios-runner';
const SUITES = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.replace(/\.mjs$/, '')).sort();
const results = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [dir + '/' + s + '.mjs'], {
    encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n');
  results.push({ suite: s, exit: r.status, fail: lines.filter((l) => /^(FAIL|NOT OK)\b/.test(l)).length });
}
console.log(JSON.stringify({ suites: SUITES.length, all_exit_zero: results.every((r) => r.exit === 0), results }));
