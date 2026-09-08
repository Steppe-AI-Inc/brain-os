// VERIFIER #51 — matchDisambiguationOption: deployed v92 vs candidate on MY disambiguation shapes.
// [reply, options, expectedCandidateBind]. Reports where the two builds differ and classifies each difference.
import { buildMatcher } from '../../lib/belt_extract.mjs';
import { CAND_PATH, V92_PATH } from './harness.mjs';
const cand = buildMatcher(CAND_PATH);
const v92 = buildMatcher(V92_PATH);
const o = (label, id, actionType = 'archive', entityType = 'company') => ({ label, id, entityType, actionType });
const O = [o('Erdenet Copper Works', 'c1'), o('Erdenet Holdings', 'c2'), o('Erdenet Copper Works Asia', 'c3')];
const N = [o('No Limits Inc', 'n1'), o('Nothing Bundt Cakes', 'n2'), o('Khovd Solar Park', 'n3')];
const Q = [o('“Advanced Closed Systems”', 'q1'), o('Open Door Ltd', 'q2')];
const D = [o('Ulaanbaatar — North Depot', 'd1'), o('Erdenet — Copper Works', 'd2')];
const F = [o('the company', 'f1'), o('the company (option 2)', 'f2')];
const R = [o('Erdenet Copper Works', 'r1', 'restore'), o('Erdenet Holdings', 'r2', 'restore')];
const P = [o('Bold Munkhbat', 'p1', 'archive', 'person'), o('Bold Munkhbat (Sukhbaatar Freight)', 'p2', 'archive', 'person')];
const S = [o("Smith's Bakery", 's1'), o('Smith', 's2')];
const T = [o('Option 2 Ltd', 't1'), o('Erdenet Holdings', 't2')];
const ROWS = [
  ['erdenet holdings', O, 'c2'], ['Erdenet Copper Works', O, 'c1'], ['erdenet copper works asia', O, 'c3'], ['the first one', O, 'c1'], ['option 2', O, 'c2'],
  ['2', O, 'c2'], ['the second', O, 'c2'], ['third', O, 'c3'], ['option 1, option 2', O, null], ['option 1 #2', O, null], ['#2 the first one', O, null],
  ['both', O, null], ['erdenet', O, null], ["don't archive erdenet copper works", O, null], ['not erdenet copper works', O, null],
  ['restore erdenet copper works', O, null], ['archive erdenet holdings', O, 'c2'], ['yes, erdenet holdings', O, 'c2'], ['Erdenet Holdings please', O, 'c2'],
  ['no, the other one', O, null], ['neither', O, null], ['none of them', O, null], ['erdenet holdings, not the copper one', O, null],
  ['archive erdenet holdings tasks', O, null], ['activate erdenet holdings', O, null], ['erdenet holdings and erdenet copper works', O, null],
  ['no limits inc', N, 'n1'], ['not no limits inc', N, null], ['nothing bundt cakes', N, 'n2'], ['nothing', N, null], ['no', N, null], ['no limits', N, null],
  ['advanced closed systems', Q, 'q1'], ['"advanced closed systems"', Q, 'q1'], ['open door', Q, null], ['Open Door Ltd', Q, 'q2'],
  ['ulaanbaatar - north depot', D, null], ['Ulaanbaatar — North Depot', D, 'd1'], ['erdenet — copper works', D, 'd2'],
  ['the company (option 2)', F, 'f2'], ['the company', F, null], ['option 1', F, 'f1'],
  ['restore erdenet holdings', R, 'r2'], ['reactivate erdenet holdings', R, 'r2'], ['archive erdenet holdings', R, null],
  ['bold munkhbat', P, null], ['bold munkhbat (sukhbaatar freight)', P, 'p2'], ['the employee bold munkhbat (sukhbaatar freight)', P, 'p2'],
  ["smith's bakery", S, 's1'], ['smiths bakery', S, 's1'], ['smith', S, 's2'],
  ['option 2', T, null], ['option 2 ltd', T, 't1'], ['erdenet holdings', T, 't2'], ['2', T, 't2'],
  ['constructor', O, null], ['__proto__', O, null], ['toString', O, null], ['', O, null], ['   ', O, null],
];
let ok = 0; const bad = [], diff = [];
for (const [reply, opts, exp] of ROWS) {
  let c = null, v = null, cErr = null, vErr = null;
  try { c = (cand(reply, opts) || {}).id ?? null; } catch (e) { cErr = e.message; }
  try { v = (v92(reply, opts) || {}).id ?? null; } catch (e) { vErr = e.message; }
  if (c === exp && !cErr) ok++; else bad.push({ reply, exp, c, cErr });
  if (c !== v || cErr || vErr) diff.push({ reply, cand: cErr ? 'THROWS' : c, v92: vErr ? 'THROWS' : v });
}
console.log(`=== VERIFIER #51 matcher — ${ROWS.length} shapes: ${ok} as intended, ${bad.length} not ===`);
for (const b of bad) console.log('  UNEXPECTED  ' + JSON.stringify(b));
console.log(`candidate differs from v92 on ${diff.length}:`);
for (const d of diff) console.log('  ' + JSON.stringify(d.reply).padEnd(48) + ' cand=' + d.cand + '  v92=' + d.v92 + (d.cand === null ? '  (candidate dead-ends where v92 binds)' : (d.v92 === null ? '  (candidate binds where v92 dead-ends)' : '  (DIFFERENT bind)')));
process.exitCode = bad.length ? 1 : 0;
