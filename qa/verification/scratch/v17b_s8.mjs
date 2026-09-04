// VERIFIER #17 / SCENARIO 8 — the founder-directed lexical-branch scenario.
// Each string is run through BOTH branches: as an OPTION LABEL (with and without a
// canonical row) and as SUMMARY PROSE (the completion belt). Reports, per branch,
// REAL NAMES DESTROYED and ASSERTIONS SURVIVING.
import { readSrc, buildGate, buildBelt, opt, canonMap, ID_A } from './v17b_lib.mjs';
import { readFileSync } from 'node:fs';

const src = readSrc();
const gate = buildGate(src);
const belt = buildBelt(src);
const belt52 = buildBelt(readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8'));
const L = (r) => r.options.map((o) => o.label);

// kind: 'name'      = a REAL entity name. Destroyed if the label is not shown / prose killed.
//       'assertion' = a model-authored completion claim. Escapes if shown verbatim / prose ships.
const CASES = [
  ['Terminated Bob Smith', 'assertion'],
  ['Closed Loop Systems', 'name'],
  ['Confirmed — the company is not archived', 'assertion'],
  ['ACME Deleted', 'assertion'],
  ['Deleted ACME', 'assertion'],
  ['I archived ACME, ok?', 'assertion'],
  ['Now removing ACME.', 'assertion'],
  ["I'm now removing ACME.", 'assertion'],
  // real names containing each completion word
  ['Archived Records Ltd', 'name'],
  ['Deleted Scenes Studio', 'name'],
  ['Closed Circuit Media', 'name'],
  ['Terminated Cable Co', 'name'],
  ['Completed Works LLC', 'name'],
  ['Assigned Seating Inc', 'name'],
  ['Removed Barriers Foundation', 'name'],
  ['Restored Timber Works', 'name'],
  ['Approved Vendors Group', 'name'],
  ['Confirmed Logistics', 'name'],
  ['Ended Chapters Publishing', 'name'],
  ['Cleared Skies Aviation', 'name'],
  ['Granted Wishes Charity', 'name'],
  ['Moved Mountains Co', 'name'],
  ['Renamed Streets Ltd', 'name'],
  ['Declined Offers LLC', 'name'],
  ['Sent Packing Couriers', 'name'],
  ['Done Deal Holdings', 'name'],
];

console.log('=== BRANCH 1: OPTION LABEL ===');
console.log('string'.padEnd(42) + 'kind'.padEnd(11) + 'no canonical row'.padEnd(22) + 'canonical row IS that name');
let nameDestroyedNoRow = 0, nameDestroyedWithRow = 0, assertionShippedNoRow = 0, assertionShippedWithRow = 0;
for (const [s, kind] of CASES) {
  const noRow = L(gate([opt(ID_A, s)]));
  const withRow = L(gate([opt(ID_A, s)], { canonical: canonMap([['company', ID_A, s]]) }));
  const shownNoRow = noRow.length > 0;
  const shownWithRow = withRow.length > 0;
  if (kind === 'name') { if (!shownNoRow) nameDestroyedNoRow++; if (!shownWithRow) nameDestroyedWithRow++; }
  else { if (shownNoRow) assertionShippedNoRow++; if (shownWithRow) assertionShippedWithRow++; }
  console.log(JSON.stringify(s).slice(0, 41).padEnd(42) + kind.padEnd(11)
    + (shownNoRow ? JSON.stringify(noRow[0]).slice(0, 20) : 'DROPPED').padEnd(22)
    + (shownWithRow ? JSON.stringify(withRow[0]) : 'DROPPED'));
}
const names = CASES.filter((c) => c[1] === 'name').length;
const asserts = CASES.length - names;
console.log(`\nLABEL BRANCH  | real names ${names}: destroyed ${nameDestroyedNoRow}/${names} with NO canonical row, `
  + `${nameDestroyedWithRow}/${names} when the row EXISTS`);
console.log(`LABEL BRANCH  | assertions ${asserts}: shipped verbatim ${assertionShippedNoRow}/${asserts} with no row, `
  + `${assertionShippedWithRow}/${asserts} when the DATABASE says that IS the name`);

console.log('\n=== BRANCH 2: SUMMARY PROSE (completion belt) ===');
console.log('string'.padEnd(42) + 'kind'.padEnd(11) + 'candidate'.padEnd(12) + '52e830f');
let proseNameDestroyed = 0, proseAssertionEscaped = 0, proseNameDestroyed52 = 0, proseAssertionEscaped52 = 0;
// A real NAME becomes prose in a truthful sentence about it; an ASSERTION is the prose itself.
for (const [s, kind] of CASES) {
  const text = kind === 'name' ? `No company named ${s} was archived.` : s;
  const now = belt(text), old = belt52(text);
  if (kind === 'name') { if (now) proseNameDestroyed++; if (old) proseNameDestroyed52++; }
  else { if (!now) proseAssertionEscaped++; if (!old) proseAssertionEscaped52++; }
  console.log(JSON.stringify(s).slice(0, 41).padEnd(42) + kind.padEnd(11) + String(now).padEnd(12) + String(old)
    + (kind === 'name' && now && !old ? '   <-- NEWLY DESTROYED' : ''));
}
console.log(`\nPROSE BRANCH  | real names ${names}: truthful sentence DESTROYED  candidate ${proseNameDestroyed}/${names}   52e830f ${proseNameDestroyed52}/${names}`);
console.log(`PROSE BRANCH  | assertions ${asserts}: ESCAPED the belt          candidate ${proseAssertionEscaped}/${asserts}   52e830f ${proseAssertionEscaped52}/${asserts}`);
