// VERIFIER #18 / SCENARIO 7 — the FOUNDER-DIRECTED LEXICAL-BRANCH SCENARIO, as in
// campaigns #75-#77. Every string is run through BOTH canonical branches:
//   BRANCH 1 (LABEL)  — as an option label, with and without a canonical row.
//   BRANCH 2 (PROSE)  — through the completion belt, in the frames a founder really sees.
// Real names must SURVIVE; model-authored completion assertions must NOT.
// This campaign adds a THIRD prose frame ("<Name> was not archived."), because that is the
// frame the candidate's new ORDER rule actually changes.
import { buildGate, ID_A, canonMap } from './v18_gate.mjs';
import { beltFor } from './v18_belt.mjs';

const gate = buildGate(new URL('../../../../supabase/functions/sem-ai-command/index.ts', import.meta.url));
const belt = beltFor('CANDIDATE').fn;
const belt77 = beltFor('9535f0b').fn;
const belt76 = beltFor('52e830f').fn;
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });

const CASES = [
  // model-authored completion assertions dressed as labels/prose
  ['Terminated Bob Smith', 'assertion'],
  ['Confirmed — the company is not archived', 'assertion'],
  ['ACME Deleted', 'assertion'],
  ['Deleted ACME', 'assertion'],
  ['I archived ACME, ok?', 'assertion'],
  ['Now removing ACME.', 'assertion'],
  ["I'm now removing ACME.", 'assertion'],
  ['The company has been archived', 'assertion'],
  // REAL names containing each completion word in COMPLETION_VOCAB
  ['Archived Records Ltd', 'name'], ['Deleted Scenes Studio', 'name'], ['Updated Systems LLC', 'name'],
  ['Created Studio', 'name'], ['Restored Timber Works', 'name'], ['Activated Carbon Co', 'name'],
  ['Deactivated Assets Ltd', 'name'], ['Assigned Seating Inc', 'name'], ['Reassigned Freight Co', 'name'],
  ['Approved Vendors Group', 'name'], ['Rejected Goods Ltd', 'name'], ['Declined Offers LLC', 'name'],
  ['Removed Barriers Foundation', 'name'], ['Completed Works LLC', 'name'], ['Renamed Streets Ltd', 'name'],
  ['Ended Chapters Publishing', 'name'], ['Closed Loop Systems', 'name'], ['Cleared Skies Aviation', 'name'],
  ['Sent Packing Couriers', 'name'], ['Moved Mountains Co', 'name'], ['Granted Wishes Charity', 'name'],
  ['Added Value Partners', 'name'], ['Processing Plant Ltd', 'name'], ['Executing Partners LLP', 'name'],
  ['Confirmed Logistics', 'name'], ['Done Deal Holdings', 'name'],
];
const names = CASES.filter((c) => c[1] === 'name').length;
const asserts = CASES.length - names;

console.log('=== BRANCH 1: OPTION LABEL ===');
console.log('string'.padEnd(40) + 'kind'.padEnd(11) + 'no canonical row'.padEnd(24) + 'canonical row IS that name');
let nD0 = 0, nD1 = 0, aS0 = 0, aS1 = 0;
for (const [s, kind] of CASES) {
  const noRow = gate([opt(ID_A, s)]).map((o) => o.label);
  const withRow = gate([opt(ID_A, s)], { canonical: canonMap([['company', ID_A, s]]) }).map((o) => o.label);
  if (kind === 'name') { if (!noRow.length) nD0++; if (!withRow.length) nD1++; }
  else { if (noRow.length) aS0++; if (withRow.length) aS1++; }
  console.log(JSON.stringify(s).slice(0, 39).padEnd(40) + kind.padEnd(11)
    + (noRow.length ? JSON.stringify(noRow[0]).slice(0, 22) : 'DROPPED').padEnd(24)
    + (withRow.length ? JSON.stringify(withRow[0]).slice(0, 30) : 'DROPPED'));
}
console.log(`\nLABEL BRANCH | real names ${names}: destroyed ${nD0}/${names} with NO canonical row, ${nD1}/${names} when the row EXISTS`);
console.log(`LABEL BRANCH | assertions ${asserts}: shipped verbatim ${aS0}/${asserts} with no row, ${aS1}/${asserts} when the DATABASE says that IS the name`);

console.log('\n=== BRANCH 2: SUMMARY PROSE (completion belt), three frames ===');
const FRAMES = [
  ['F1 "No company named X was archived."', (n) => `No company named ${n} was archived.`],
  ['F2 "Nothing named X was deleted."', (n) => `Nothing named ${n} was deleted.`],
  ['F3 "X was not archived."  <-- the frame this candidate changes', (n) => `${n} was not archived.`],
];
for (const [title, f] of FRAMES) {
  let d = 0, d77 = 0, d76 = 0;
  const newly = [];
  for (const [s, kind] of CASES) {
    if (kind !== 'name') continue;
    const t = f(s);
    const a = belt(t), b = belt77(t), c = belt76(t);
    if (a) d++; if (b) d77++; if (c) d76++;
    if (a && !c) newly.push(s);
  }
  console.log(`${title}`);
  console.log(`   real names DESTROYED: candidate ${d}/${names}   9535f0b ${d77}/${names}   52e830f ${d76}/${names}`);
  if (newly.length) console.log(`   NEWLY destroyed vs 52e830f (${newly.length}): ` + JSON.stringify(newly));
}
let esc = 0, esc77 = 0, esc76 = 0;
for (const [s, kind] of CASES) {
  if (kind !== 'assertion') continue;
  if (!belt(s)) esc++; if (!belt77(s)) esc77++; if (!belt76(s)) esc76++;
}
console.log(`\nPROSE BRANCH | assertions ${asserts}: ESCAPED the belt  candidate ${esc}/${asserts}   9535f0b ${esc77}/${asserts}   52e830f ${esc76}/${asserts}`);
