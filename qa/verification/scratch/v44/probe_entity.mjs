// V44 — the entity signal's actual reach, measured, not assumed.
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const src = readSrc(CAND_PATH);
const off = buildCandGate(src, []);

// The shape the signal exists for: "Confirmed — <Participle> <Capitalised Name>" where the
// capitalised run IS the entity's name, so the participle is part of the NAME, not a claim.
const NAMES = [
  'Archived Media Group', 'Restored Hardware Ltd', 'Closed Loop Systems', 'Confirmed Logistics LLC',
  'Updated Systems Inc', 'Created Ventures', 'Renamed Holdings', 'Completed Works Ltd',
  'Removed Metals Co', 'Granted Capital', 'Sent Freight Group', 'Added Value Partners',
  'Cleared Path Advisers', 'Moved Mountain Mining', 'Ended Era Trading', 'Assigned Assets LLC',
  'Approved Motors', 'Rejected Goods Co', 'Declined Ventures', 'Activated Networks',
];
const SUFFIX = ['.', ' — nothing else was touched.', ' (option 1).'];

const rows = [];
for (const n of NAMES) for (const s of SUFFIX) rows.push({ n, text: 'Confirmed — ' + n + s });

console.log('== A. the signal target: "Confirmed — <Name-with-participle-head>" (a TRUTHFUL echo of a name)');
let rescuedBySignal = 0, alreadyOk = 0, stillDestroyed = 0;
for (const r of rows) {
  const on = buildCandGate(src, [r.n]);
  const a = off(r.text), b = on(r.text);
  if (a && !b) rescuedBySignal++;
  else if (!a) alreadyOk++;
  else stillDestroyed++;
}
console.log(`   rows ${rows.length}: rescued ONLY by the signal ${rescuedBySignal}; already preserved with an EMPTY pack ${alreadyOk}; still destroyed with the name IN the pack ${stillDestroyed}`);

console.log('\n== B. per-row detail (empty pack -> populated pack)');
for (const r of rows.slice(0, 12)) {
  const on = buildCandGate(src, [r.n]);
  console.log('   ' + (v92(r.text) ? 'V' : 'v') + (off(r.text) ? 'C' : 'c') + '->' + (on(r.text) ? 'C' : 'c') + ' ' + JSON.stringify(r.text));
}

console.log('\n== C. does the signal ever RE-OPEN a fabrication (a real name that is also a claim)?');
const FAB = [
  ['ACME Holdings', 'Confirmed — Archived ACME Holdings.'],
  ['Bob Smith', 'Confirmed — Restored Bob Smith.'],
  ['Q3 Inventory Audit', 'Confirmed — Completed Q3 Inventory Audit.'],
  ['Archived Media Group', 'Confirmed — Archived Media Group and Beta Corp.'],
  ['Archived Media Group', 'Confirmed — Archived Media Group. Beta Corp was archived too.'],
];
for (const [name, text] of FAB) {
  const on = buildCandGate(src, [name]);
  console.log('   pack=[' + name + ']  ' + (v92(text) ? 'V' : 'v') + (off(text) ? 'C' : 'c') + '->' + (on(text) ? 'C' : 'c') + ' ' + JSON.stringify(text));
}

console.log('\n== D. resources the signal does NOT cover (project/goal/department/approval/document/proposal)');
console.log('   knownEntityNames is built from companyNameById + personNameById + taskTitleById + runtimeLabels ONLY.');
const UNCOVERED = ['Archived Systems Rollout', 'Restored Depot Programme', 'Closed Loop Initiative'];
for (const n of UNCOVERED) {
  const t = 'Confirmed — ' + n + '.';
  const on = buildCandGate(src, [n]);
  console.log('   ' + (off(t) ? 'C' : 'c') + '->' + (on(t) ? 'C' : 'c') + ' ' + JSON.stringify(t)
    + '   (a PROJECT/GOAL by this name is never in the set, so the right column is unreachable in production)');
}

console.log('\n== E. pack caps in the shipped source');
for (const m of src.matchAll(/(companies|people|tasks)[^\n]{0,80}?slice\(0,\s*(\d+)\)/g)) {
  console.log('   ' + m[0].trim().slice(0, 110));
}
