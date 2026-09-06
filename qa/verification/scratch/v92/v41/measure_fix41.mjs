// VERIFIER #41 — measure the prepared fix: my own corpus + the round-2 probe + the whole
// class generator + the whole scenarios-runner battery, candidate vs fix41.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const FIX = path.join(HERE, 'fix41/index.ts');
const env = { ...process.env, SEM_INDEX_SRC: FIX };

const run = (script, e) => {
  const r = spawnSync(process.execPath, [path.join(HERE, script)], { encoding: 'utf8', cwd: REPO, env: e, timeout: 300000 });
  return (r.stdout || '') + (r.stderr || '');
};
for (const s of ['belt_diff.mjs', 'probe2.mjs', 'class_v41_gerund.mjs', 'probe7.mjs']) {
  const out = run(s, env);
  console.log('\n########## ' + s + ' ON fix41 ##########');
  const keep = out.split('\n').filter((l) => /SUMMARY|regressions|DESTROYS|CONTROL|MISSED|=>|truthRegression|fabRegression|preserves|generated|P1 TRUTH REGRESSION|P1 FAB REGRESSION|MUST BE 0|not caught/.test(l));
  console.log(keep.join('\n'));
}

console.log('\n########## FULL scenarios-runner BATTERY ON fix41 ##########');
const DIR = path.join(REPO, 'qa/scenarios-runner');
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
let tp = 0, tf = 0, broken = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', cwd: REPO, env, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/) || out.match(/(\d+)\/(\d+)\s+passed/) && (() => { const x = out.match(/(\d+)\/(\d+)\s+passed/); return [x[0], x[1], String(+x[2] - +x[1])]; })();
  if (m) { tp += +m[1]; tf += +m[2]; if (+m[2] > 0) broken.push(f + ' -> ' + m[1] + '/' + m[2]); }
  else if (/Error:/.test(out) && !/SUPERSEDED/.test(out)) broken.push(f + ' -> THREW');
}
console.log(`battery on fix41: ${tp} passed, ${tf} failed`);
for (const b of broken) console.log('   ' + b);
