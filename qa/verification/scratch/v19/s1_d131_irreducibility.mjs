// SCENARIO 1 — try to DISPROVE the D131 "proven irreducible" claim.
// The candidate's ledger says each of the 9 surviving fabrications is inseparable from a
// required-survive real name, and that "no regex separates the two". This builds ONE
// alternative rule (R9) and measures it on: the 9 pinned pairs, my 62-case truthful-negative
// corpus, my 45-case fabrication corpus, and the ENTIRE committed battery.
//
// R9 = two independent, cheap changes to the SAME two lines the candidate already owns:
//   (a) SCOPE: a negator that PRECEDES the completion verb only disarms it when no finite
//       auxiliary/modal already occurred before the negator (i.e. the negator is not part of
//       an EARLIER predicate) — with an explicit exception for a relative clause
//       ("...that was archived"), which is inside the negated noun phrase.
//   (b) BOUNDARY: `and` / `but` / a spaced dash is a clause boundary ONLY when the token to
//       its right is lowercase and is not an auxiliary — i.e. a new ordinary-word subject
//       follows. Inside a real NAME the right neighbour is capitalised ("Salt and PEPPER Co",
//       "Ulaanbaatar — NORTH Depot", "But FIRST Coffee"); in a VP coordination it is an
//       auxiliary ("ACME is archived but WAS not deleted"). Both required-survive shapes are
//       therefore untouched by construction, not by luck.
import { withMutant, runBattery, assertPristine } from './mutate.mjs';
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const PAIRS = [ // exactly the 9 pinned in qa/scenarios-runner/run18_defect_closure_contract.mjs
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

const NOAUX = '(?:was|were|is|are|has|have|had|been|being|not)';
const EDITS = [
  ['String(s).split(/[.!?,\\x3b\\n]+|:\\s/)',
   'String(s).split(/[.!?,\\x3b\\n]+|:\\s|\\s(?:and|but)\\s+(?=(?!' + NOAUX + '\\b)[a-z])|\\s[\\u2014\\u2013-]\\s+(?=(?!' + NOAUX + '\\b)[a-z])/)'],
  ['          return n <= m.index + (rel < 0 ? 0 : rel);',
   ['          const p = m.index + (rel < 0 ? 0 : rel);',
    '          if (n > p) return false;',
    '          if (n >= m.index) return true;',
    '          const pre = c.slice(0, m.index);',
    '          if (/\\b(?:that|which|who|whom)\\s+$/i.test(pre)) return true;',
    '          return !/\\b(?:is|are|am|was|were|has|have|had|do|does|did|can|could|will|would|should|may|might|must)\\b/i.test(pre.slice(0, n));'].join('\r\n')],
];

const corpusSrc = fs.readFileSync('qa/verification/scratch/v19/s0_d130_both_directions.mjs', 'utf8');
const grab = (name) => {
  const m = corpusSrc.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];'));
  return [...m[1].matchAll(/^\s*'((?:[^'\\]|\\.)*)',?$/gm)].map((x) => x[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
};
const TRUE_NEG = ['A', 'B', 'C', 'D', 'E'].flatMap(grab);
const FAB = ['F_trailing', 'F_mid', 'F_negator_other_verb', 'F_present_plus_past', 'F_plain'].flatMap(grab);
const dq = [...corpusSrc.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?$/gm)].map((x) => x[1].replace(/\\"/g, '"'));
TRUE_NEG.push(...dq.filter((s) => /approval/.test(s)));

function measure(readsAsCompletion, label) {
  const fp = TRUE_NEG.filter((s) => readsAsCompletion(s));
  const fn = FAB.filter((s) => !readsAsCompletion(s));
  const caught = PAIRS.filter(([, f]) => readsAsCompletion(f)).map(([, f]) => f);
  const destroyed = PAIRS.filter(([, , r]) => readsAsCompletion(r)).map(([, , r]) => r);
  console.log('\n[' + label + ']  corpus: FP ' + fp.length + '/' + TRUE_NEG.length + '   FN ' + fn.length + '/' + FAB.length
    + '   pinned residuals CAUGHT ' + caught.length + '/9   paired real names DESTROYED ' + destroyed.length + '/9');
  return { fp, fn, caught, destroyed };
}

console.log('index sha256 (pristine, before any mutation): ' + assertPristine('start'));
const base = measure(loadBelt(loadFile(fileURLToPath(INDEX_PATH))).readsAsCompletion, 'CANDIDATE (pristine)');

const res = withMutant('R9', EDITS, () => {
  const belt = loadBelt(loadFile(fileURLToPath(INDEX_PATH))).readsAsCompletion;
  const m = measure(belt, 'R9 alternative rule');
  console.log('  residuals R9 now CATCHES:');
  for (const [tok, f, r] of PAIRS) console.log('   ' + (belt(f) ? 'CAUGHT ' : 'still miss ').padEnd(12) + '[' + tok + '] ' + JSON.stringify(f)
    + (belt(r) ? '   <-- PAIRED REAL NAME DESTROYED: ' + JSON.stringify(r) : ''));
  console.log('  NEW false positives vs pristine candidate:');
  const newFP = m.fp.filter((s) => !base.fp.includes(s));
  if (newFP.length === 0) console.log('    none');
  for (const s of newFP) console.log('    * ' + JSON.stringify(s));
  console.log('  false positives R9 FIXES vs pristine candidate:');
  for (const s of base.fp.filter((x) => !m.fp.includes(x))) console.log('    + ' + JSON.stringify(s));
  const bat = runBattery();
  console.log('  BATTERY under R9: ok=' + bat.ok + ' failuresFromText=' + bat.fail + ' nonzeroExits=' + bat.exits);
  for (const s of bat.perSuite.filter((x) => x.fail > 0 || x.code !== 0)) console.log('    suite ' + s.f + ' exit=' + s.code + ' fail=' + s.fail);
  return { m, bat };
});
console.log('\nindex sha256 (restored): ' + assertPristine('end'));
