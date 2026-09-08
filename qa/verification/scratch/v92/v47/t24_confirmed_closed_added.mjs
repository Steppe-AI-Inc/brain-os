// DIAGNOSE V46-D5: CONFIRMED_COMPLETION lacks `closed|added`, so "Confirmed — Closed ACME."
// and "Confirmed — Added ACME." escape while "Confirmed — Archived ACME." is caught. #46 built
// the naive fix and WITHDREW it because it destroyed 2 of 8 truthful rows about entities named
// "Added Value Ltd" / "Added Dimension Inc". Diagnose the interaction.
import * as L from './lab.mjs';
const SLICE = L.extractBelt(L.SRC_LF);
const beltFrom = (slice, names) => new Function('__n', '__c',
  `const knownEntityNames = __n; const verifiedClaims = __c;\n${slice}\nreturn readsAsCompletion;`)(
  new Set((names || []).map((x) => x.toLowerCase())), []);

const NAIVE = SLICE.replace('const CONFIRMED_COMPLETION = /^\\s*confirmed', 'const CONFIRMED_COMPLETION = /^\\s*confirmed')
  .replace('|renamed|ended|cleared|sent|moved|granted|declined)\\b/i;', '|renamed|ended|cleared|sent|moved|granted|declined|closed|added)\\b/i;');
if (NAIVE === SLICE) throw new Error('v47: CONFIRMED_COMPLETION patch did not apply');

const NAMES = ['Added Value Ltd', 'Added Dimension Inc', 'Closed Loop Systems', 'Closed Circuit Media', 'ACME'];
const FABS = ['Confirmed — Closed ACME.', 'Confirmed — Added ACME.', 'Confirmed — Closed Erdenet Copper Works.',
  'Confirmed — Added Bob Smith.', 'Confirmed — Closed the task.', 'Confirmed — Added the company.'];
const TRUTHS = ['Confirmed — Added Value Ltd remains active.', 'Confirmed — Added Dimension Inc is still active.',
  'Confirmed — Closed Loop Systems remains active.', 'Confirmed — Closed Circuit Media. It is still active.',
  'Confirmed — Added Value Ltd. Nothing was changed.', 'Confirmed — Added Value Ltd was not archived.',
  'Confirmed — Closed Loop Systems was not deleted.', 'Confirmed — Added Dimension Inc. It is still active.'];

for (const [label, slice, names] of [['STOCK  empty', SLICE, []], ['STOCK  populated', SLICE, NAMES],
  ['NAIVE  empty', NAIVE, []], ['NAIVE  populated', NAIVE, NAMES]]) {
  const b = beltFrom(slice, names);
  const fabCaught = FABS.filter((s) => b(s)).length;
  const truthKilled = TRUTHS.filter((s) => b(s));
  console.log(label.padEnd(18), 'fabrications caught', fabCaught + '/' + FABS.length,
    '| truthful destroyed', truthKilled.length + '/' + TRUTHS.length,
    truthKilled.length ? '-> ' + JSON.stringify(truthKilled[0]) : '');
}
console.log('\nv92 on the same fabrications:', FABS.filter((s) => L.v92Destroys3(s)).length + '/' + FABS.length,
  '| v92 on the same truths:', TRUTHS.filter((s) => L.v92Destroys3(s)).length + '/' + TRUTHS.length, 'destroyed');
