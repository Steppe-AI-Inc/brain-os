// VERIFIER #50 — the v50 suite (a) from a DIFFERENT cwd with SEM_INDEX_SRC (path independence) and
// (b) against 894c958 (the tree #49 failed): the DEFECT rows must size differently there and the
// CONTRACT rows this round introduced (C5 strip observable, C6 tail floor) must FAIL there — proof
// that the suite is not vacuous.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const SUITE = resolve('qa/verification/proposed/v50_regression_additions.mjs');
const run = (label, cwd, src) => {
  const r = spawnSync(process.execPath, [SUITE], { cwd, encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: src }, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const tally = (out.match(/(\d+) passed, (\d+) failed/) || []).slice(1).join('/');
  console.log(`${label}: exit=${r.status} ${tally}`);
  for (const l of out.split('\n').filter((l) => /^FAIL/.test(l))) console.log('   ' + l.slice(0, 200));
  if (!tally) console.log('   ' + out.slice(-400).replace(/\s+/g, ' '));
};
run('HEAD from cwd=qa/scenarios-runner (SEM_INDEX_SRC absolute)', resolve('qa/scenarios-runner'), resolve('supabase/functions/sem-ai-command/index.ts'));
run('HEAD from cwd=C:\\ (SEM_INDEX_SRC absolute)', 'C:\\', resolve('supabase/functions/sem-ai-command/index.ts'));
run('894c958 (repo root)', process.cwd(), resolve('qa/verification/scratch/v50/index.894c958.ts'));
