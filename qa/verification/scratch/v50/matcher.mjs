// VERIFIER #50 — matchDisambiguationOption: deployed v92 vs candidate on MY disambiguation shapes.
// Each row: [reply, options, expectedCandidateBind]; also reports where v92 and the candidate differ.
import { buildMatcher } from '../../lib/belt_extract.mjs';
import { CAND_PATH, V92_PATH } from './harness.mjs';
const cand = buildMatcher(CAND_PATH);
const v92 = buildMatcher(V92_PATH);
const o = (label, id) => ({ label, id, entityType: 'company', actionType: 'archive' });
const O = [o('Khangai Cement', 'c1'), o('Khangai Holdings', 'c2'), o('Khangai Cement Asia', 'c3')];
const N = [o('No Limits Inc', 'n1'), o('Nothing Bundt Cakes', 'n2'), o('Altai Motors', 'n3')];
const Q = [o('“Advanced Closed Systems”', 'q1'), o('Open Door Ltd', 'q2')];
const D = [o('Ulaanbaatar — Rail Depot', 'd1'), o('Darkhan — Steel Plant', 'd2')];
const F = [o('the company', 'f1'), o('the company (option 2)', 'f2')];
const ROWS = [
  ['khangai holdings', O, 'c2'], ['Khangai Cement', O, 'c1'], ['khangai cement asia', O, 'c3'], ['the first one', O, 'c1'], ['option 2', O, 'c2'],
  ['2', O, 'c2'], ['the second', O, 'c2'], ['third', O, 'c3'], ['option 1, option 2', O, null], ['both', O, null], ['khangai', O, null],
  ["don't archive khangai cement", O, null], ['not khangai cement', O, null], ['restore khangai cement', O, null], ['archive khangai holdings', O, 'c2'],
  ['yes, khangai holdings', O, 'c2'], ['Khangai Holdings please', O, 'c2'], ['no, the other one', O, null], ['neither', O, null], ['none of them', O, null],
  ['no limits inc', N, 'n1'], ['not no limits inc', N, null], ['nothing bundt cakes', N, 'n2'], ['nothing', N, null], ['no', N, null],
  ['advanced closed systems', Q, 'q1'], ['"advanced closed systems"', Q, 'q1'], ['open door', Q, null], ['Open Door Ltd', Q, 'q2'],
  ['ulaanbaatar - rail depot', D, null], ['Ulaanbaatar — Rail Depot', D, 'd1'], ['darkhan — steel plant', D, 'd2'],
  ['the company (option 2)', F, 'f2'], ['the company', F, null], ['option 1', F, 'f1'],
  ['constructor', O, null], ['__proto__', O, null], ['toString', O, null], ['', O, null], ['   ', O, null],
];
let ok = 0, bad = [], diff = [];
for (const [reply, opts, exp] of ROWS) {
  const c = (cand(reply, opts) || {}).id ?? null;
  const v = (v92(reply, opts) || {}).id ?? null;
  if (c === exp) ok++; else bad.push({ reply, exp, c, v });
  if (c !== v) diff.push({ reply, cand: c, v92: v });
}
console.log(`=== VERIFIER #50 matcher — ${ROWS.length} shapes: ${ok} as expected, ${bad.length} not ===`);
for (const b of bad) console.log('  UNEXPECTED  ' + JSON.stringify(b));
console.log(`candidate differs from v92 on ${diff.length}:`);
for (const d of diff) console.log('  ' + JSON.stringify(d.reply).padEnd(34) + ' cand=' + d.cand + '  v92=' + d.v92 + (d.cand === null ? '  (candidate dead-ends where v92 binds)' : (d.v92 === null ? '  (candidate binds where v92 dead-ends)' : '  (DIFFERENT bind)')));
process.exitCode = bad.length ? 1 : 0;
