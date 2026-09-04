// SCENARIO 1c — R9b: same idea, two corrections after 1b's evidence.
//  * the relative/complement-clause exception is POSITIONAL: a `that/which/who` anywhere
//    BETWEEN the negator and the completion verb means the verb sits inside the negated
//    complement ("I did not find any record THAT Black and Decker Holdings was archived",
//    "no company called Barnes and Noble THAT was archived") — run17/D128's own case.
//  * the whole rule stays ONE statement on ONE line, so the source-slicing suites
//    (run14/D107) can still extract the predicate.
import { withMutant, runBattery, assertPristine } from './mutate.mjs';
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const NOAUX = '(?:was|were|is|are|has|have|had|been|being|not)';
const AUX = '(?:is|are|am|was|were|has|have|had|do|does|did|can|could|will|would|should|may|might|must)';
export const EDITS = [
  ['String(s).split(/[.!?,\\x3b\\n]+|:\\s/)',
   'String(s).split(/[.!?,\\x3b\\n]+|:\\s|\\s(?:and|but)\\s+(?=(?!' + NOAUX + '\\b)[a-z])|\\s[\\u2014\\u2013-]\\s+(?=(?!' + NOAUX + '\\b)[a-z])/)'],
  ['          return n <= m.index + (rel < 0 ? 0 : rel);',
   '          return n > m.index + (rel < 0 ? 0 : rel) ? false : (n >= m.index || /\\b(?:that|which|who|whom)\\b/i.test(c.slice(n, m.index)) || !/\\b' + AUX + '\\b/i.test(c.slice(0, n)));'],
];

const PAIRS = [
  ['and', 'There were no errors and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
  ['and', 'The company had no open tasks and was archived.', 'Nothing named Bed Bath and Beyond was deleted.'],
  ['and', 'No issues at all and the goal was completed.', 'There is no company called Barnes and Noble that was archived.'],
  ['but', 'There is no undo but the company has been archived.', 'No company called But First Coffee was archived.'],
  ['but', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['dash', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['dash', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['dash', 'Not the task — the company was archived.', 'No unit at Erdenet — Copper Works was archived.'],
  ['dash', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
];
const corpusSrc = fs.readFileSync('qa/verification/scratch/v19/s0_d130_both_directions.mjs', 'utf8');
const grab = (name) => {
  const m = corpusSrc.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];'));
  return [...m[1].matchAll(/^\s*'((?:[^'\\]|\\.)*)',?$/gm)].map((x) => x[1].replace(/\\'/g, "'"));
};
const TRUE_NEG = ['A', 'B', 'C', 'D', 'E'].flatMap(grab);
const FAB = ['F_trailing', 'F_mid', 'F_negator_other_verb', 'F_present_plus_past', 'F_plain'].flatMap(grab);

console.log('pristine sha: ' + assertPristine('start'));
const baseBelt = loadBelt(loadFile(fileURLToPath(INDEX_PATH))).readsAsCompletion;
const baseFP = TRUE_NEG.filter((s) => baseBelt(s));
console.log('candidate: FP ' + baseFP.length + '/' + TRUE_NEG.length + '  FN ' + FAB.filter((s) => !baseBelt(s)).length + '/' + FAB.length);

withMutant('R9b', EDITS, () => {
  const belt = loadBelt(loadFile(fileURLToPath(INDEX_PATH))).readsAsCompletion;
  const fp = TRUE_NEG.filter((s) => belt(s));
  const fn = FAB.filter((s) => !belt(s));
  console.log('R9b      : FP ' + fp.length + '/' + TRUE_NEG.length + '  FN ' + fn.length + '/' + FAB.length);
  console.log('  new FP vs candidate: ' + JSON.stringify(fp.filter((s) => !baseFP.includes(s))));
  console.log('  pinned residuals caught: ' + PAIRS.filter(([, f]) => belt(f)).length + '/9   paired real names destroyed: '
    + PAIRS.filter(([, , r]) => belt(r)).length + '/9');
  for (const [tok, f, r] of PAIRS) console.log('   ' + (belt(f) ? 'CAUGHT    ' : 'still miss') + ' [' + tok + '] ' + JSON.stringify(f)
    + (belt(r) ? '  <-- REAL NAME DESTROYED ' + JSON.stringify(r) : ''));
  const bat = runBattery();
  console.log('  BATTERY under R9b: ok=' + bat.ok + ' failuresFromText=' + bat.fail + ' nonzeroExits=' + bat.exits);
  for (const s of bat.perSuite.filter((x) => x.fail > 0 || x.code !== 0)) console.log('    suite ' + s.f + ' exit=' + s.code + ' fail=' + s.fail);
  for (const s of ['run14_defect_closure_contract.mjs', 'run17_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs']) {
    let out = '';
    try { out = execFileSync(process.execPath, ['qa/scenarios-runner/' + s], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || ''); }
    for (const line of out.split('\n')) if (/^FAIL/.test(line)) console.log('    ' + s.slice(0, 6) + ' ' + line.trim().slice(0, 160));
  }
});
console.log('restored sha: ' + assertPristine('end'));
