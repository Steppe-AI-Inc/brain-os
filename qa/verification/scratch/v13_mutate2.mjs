// verifier #13 mutation follow-ups: (a) the M2 anchor that failed on CRLF,
// (b) an independent confirm/refute of #12's ONE disclosed equivalent mutant.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const INDEX = 'supabase/functions/sem-ai-command/index.ts';
const CONT = 'qa/scenarios-runner/current_turn_and_continuity_contract.mjs';
const BASE = '021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(INDEX) !== BASE) { console.log('BASELINE MISMATCH'); process.exit(2); }
const run1 = (suite) => spawnSync(process.execPath, ['qa/scenarios-runner/' + suite + '.mjs'], { encoding: 'utf8', maxBuffer: 32e6 });
const battery = () => spawnSync(process.execPath, ['qa/verification/scratch/v13_run_battery.mjs'],
  { encoding: 'utf8', env: { ...process.env, V13_ALLOW_MUTATED: '1', V13_QUIET: '1', V13_TAG: 'm2' }, maxBuffer: 64e6 });

const results = [];
// ---- M2 retry: neutralise the D91 determiner/ALL-CAPS second-word refusal ----
{
  const orig = readFileSync(INDEX, 'utf8');
  const find = `        const DETERMINER_OR_PRONOUN = /^(the|a|an|all|any|every|each|both|its|his|her|their|our|your|my|this|that|these|those|everything|everyone|anyone|nothing|it|them|us|me|him|files?|data)$/i;`;
  const repl = `        const DETERMINER_OR_PRONOUN = /^(zzzz_never_matches)$/i;`;
  const present = orig.includes(find);
  if (present) {
    writeFileSync(INDEX, orig.replace(find, repl));
    const out = battery().stdout || '';
    writeFileSync(INDEX, orig);
    const green = /ALL EXIT ZERO: true/.test(out);
    results.push({ id: 'M2.d91.determinerRule', applied: true, verdict: green ? 'SURVIVED' : 'KILLED',
      restore_byte_identical: sha(INDEX) === BASE, tail: out.split('\n').filter((l) => /FAIL=[1-9]|TOTAL|ALL EXIT/.test(l)) });
  } else results.push({ id: 'M2.d91.determinerRule', applied: false, note: 'anchor not found' });
  console.log('M2 ->', JSON.stringify(results[results.length - 1].verdict || results[results.length - 1].note));
}
// ---- M15: combined — move the index.ts anchor AND remove the continuity guard ----
{
  const origI = readFileSync(INDEX, 'utf8');
  const origC = readFileSync(CONT, 'utf8');
  const findI = `const ctx = await buildContext(`;
  const replI = `const ctx = await buildContextRenamedByMutation(`;
  const findC = `iCtx >= 0 && iPending >= 0 && `;
  const okI = origI.includes(findI), okC = origC.includes(findC);
  if (okI && okC) {
    // (a) anchor moved ONLY — does the continuity suite fail closed on its own?
    writeFileSync(INDEX, origI.replace(findI, replI));
    const aCont = run1('current_turn_and_continuity_contract');
    const aRun11 = run1('run11_defect_closure_contract');
    // (b) anchor moved AND guard removed — the fail-OPEN case
    writeFileSync(CONT, origC.replace(findC, ''));
    const bCont = run1('current_turn_and_continuity_contract');
    const bRun11 = run1('run11_defect_closure_contract');
    writeFileSync(INDEX, origI); writeFileSync(CONT, origC);
    results.push({ id: 'M15.combined.anchorMoved', anchor_moved_only: { continuity_exit: aCont.status, run11_exit: aRun11.status },
      anchor_moved_plus_guard_removed: { continuity_exit: bCont.status, run11_exit: bRun11.status },
      restore_index_identical: sha(INDEX) === BASE, restore_cont_identical: sha(CONT) === 'c76eecb12c3f4077884bc83b804f4b9f1fdbdd1b121c90f1ad47cfba5e6393be' });
    console.log('M15 anchor-moved-only:   continuity=' + aCont.status + ' run11=' + aRun11.status);
    console.log('M15 anchor+guard-removed: continuity=' + bCont.status + ' run11=' + bRun11.status);
  } else results.push({ id: 'M15.combined.anchorMoved', applied: false, note: 'anchors not found ' + okI + '/' + okC });
}
writeFileSync('qa/verification/scratch/v13/v13_mutation_report2.json', JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 1));
console.log('FINAL index sha ' + sha(INDEX) + ' identical=' + (sha(INDEX) === BASE));
console.log('FINAL cont  sha ' + sha(CONT));
