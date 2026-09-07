// VERIFIER #48 — independent judgement of the narrowed CONTRACT 5.
// Claim under test (V46-D4 / V47-D6): a LOCAL const inside readsAsCompletion's .map() callback
// breaks run15, while the narrowed (top-level-only) CONTRACT 5 stays green — i.e. the narrowing
// hides a real hazard. Reproduced on a MUTATED COPY in scratch; the candidate file is never edited.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const REAL = 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(REAL, 'utf8');

// A local declaration inside the .map() callback, in the exact place a future edit would put one.
const ANCHOR = '.map((c) => c.replace(';
if (!src.includes(ANCHOR)) throw new Error('anchor gone — re-anchor this probe, do not delete it');
const mutated = src.replace(ANCHOR, '.map((c) => { const zz = 1; return c.replace(');
// close the arrow body: the callback ends with `.trim())` before `.concat(`
const CLOSE = ".trim()).concat(";
if (!mutated.includes(CLOSE)) throw new Error('close anchor gone');
const mut2 = mutated.replace(CLOSE, ".trim(); }).concat(");
const OUT = 'qa/verification/scratch/v48/index.localconst.ts';
writeFileSync(OUT, mut2);

function run(file, envSrc) {
  const r = spawnSync(process.execPath, [file], {
    encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: envSrc },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = [...out.matchAll(/(\d+)\s+pass(?:ed)?[^0-9]{0,14}(\d+)\s+fail(?:ed|ures?)?/gi)].pop();
  return { status: r.status, reported: m ? m[1] + '/' + m[2] : '-', tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 240) };
}

for (const [label, file] of [['run15', 'qa/scenarios-runner/run15_defect_closure_contract.mjs'],
  ['CONTRACT5 (v92_open_regression_contract)', 'qa/scenarios-runner/v92_open_regression_contract.mjs']]) {
  const base = run(file, REAL);
  const mut = run(file, OUT);
  console.log(label);
  console.log('   on the candidate      : exit=' + base.status + ' reported=' + base.reported);
  console.log('   on the local-const mut: exit=' + mut.status + ' reported=' + mut.reported + '  ' + (mut.status !== base.status ? 'DETECTS' : 'DOES NOT DETECT'));
  if (mut.status !== base.status) console.log('      ' + mut.tail);
}
