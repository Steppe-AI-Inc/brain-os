// SCENARIO 0 — attack D130 in BOTH directions, on the REAL belt, across five revisions.
// A `true` on a TRUTHFUL NEGATIVE is a false positive (a destroyed true answer = P1).
// A `false` on a FABRICATION is a false negative (a shipped fabrication).
import { loadBelt, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';

const REVS = {
  candidate: loadFile(fileURLToPath(INDEX_PATH)),
  fbafded: loadFile(new URL('./index_fbafded.ts', import.meta.url).pathname.replace(/^\//, '')),
  a559f8f: loadFile(new URL('./index_a559f8f.ts', import.meta.url).pathname.replace(/^\//, '')),
  '9535f0b': loadFile(new URL('./index_9535f0b.ts', import.meta.url).pathname.replace(/^\//, '')),
  '52e830f': loadFile(new URL('./index_52e830f.ts', import.meta.url).pathname.replace(/^\//, '')),
  d724d8c: loadFile(new URL('./index_d724d8c.ts', import.meta.url).pathname.replace(/^\//, '')),
};
const BELTS = Object.fromEntries(Object.entries(REVS).map(([k, v]) => [k, loadBelt(v).readsAsCompletion]));

// ---------------------------------------------------------------- TRUTHFUL NEGATIVES
// group A: real names whose words are completion vocabulary used as noun/adjective
const A = [
  'Closed Loop Systems was not archived.',
  'Archived Media Group was not deleted.',
  'Completed Works LLC was not renamed.',
  'Restored Furniture Co was not updated.',
  'Moved Mountains Ltd was not created.',
  'Granted Wishes Foundation was not approved.',
  'Sent Mail Services was not removed.',
  'Cleared Path Consulting was not assigned.',
  'Added Value Partners was not activated.',
  'Approved Vendors Ltd was not rejected.',
  'Deleted Scenes Studio was not restored.',
  'Updated Systems Inc was not moved.',
  'Created Spaces Co was not deactivated.',
  'Assigned Seating Ltd was not reassigned.',
  'Removed Barriers NGO was not granted.',
  'Renamed Holdings was not ended.',
  'Activated Carbon Mongolia was not archived.',
  'Reassigned Routes LLC was not deleted.',
  'Declined Offers Ltd was not approved.',
  'Ended Silence Media has not been deleted.',
];
// group B: real names beginning or ending with a negator word
const B = [
  'No Limits Inc was not archived.',
  'Nothing Bundt Cakes was not deleted.',
  'Never Settle Co was not updated.',
  'None The Wiser Ltd was not archived.',
  'Pending Patents Ltd was not archived.',
  'Awaiting Dawn Studio was not deleted.',
  'The company No Limits Inc was not archived.',
  'Say No More Ltd has not been archived.',
  'Nothing To Declare LLC was not restored.',
  'Not Your Average Co was not deleted.',
];
// group C: names with digits, parentheses, colons, dashes, conjunctions
const C = [
  'Acme 2 was not archived.',
  'Depot (North) was not deleted.',
  'Project: Phoenix Ltd was not archived.',
  'Unit 7 Holdings was not updated.',
  'ACME (Mongolia) LLC was not archived.',
  '14:30 Logistics was not archived.',
  'Salt and Pepper Co was not archived.',
  'Ulaanbaatar — North Depot was not archived.',
  'Doctors Without Borders Mongolia was not archived.',
  'Black & Decker Mongolia was not deleted.',
];
// group D: ordinary truthful negatives, no exotic name at all
const D = [
  'No company was archived.',
  'Nothing was deleted.',
  'The company is not archived.',
  'No tasks were completed.',
  'The archived list was not updated.',
  'The 3 archived companies were not deleted.',
  'The assigned tasks were not completed.',
  'The removed person was not reassigned.',
  'I could not find a company by that name; nothing was archived.',
  'No company named Salt and Pepper Co was archived.',
  'The request is still pending — nothing has been approved.',
  "That approval hasn't been approved yet.",
  'ACME is archived but was not deleted.',
  'No goal was archived and no task was deleted.',
  'None of the three companies were archived.',
];
// group E: "Confirmed — …" truthful negatives (the arm this candidate MOVED out of the
// per-clause loop into a whole-string test with a first-clause-only negation check)
const E = [
  'Confirmed — I checked, nothing was archived.',
  'Confirmed — the request came through, but no company was archived.',
  'Confirmed — ACME exists, but it was not archived.',
  'Confirmed — I looked at every company; none were archived.',
  'Confirmed — the report ran, and no task was completed.',
  'Confirmed — the archived list is empty.',
  'Confirmed — you have 3 archived companies.',
];
const TRUE_NEG = [...A.map((s) => ['A.name-as-noun', s]), ...B.map((s) => ['B.negator-in-name', s]),
  ...C.map((s) => ['C.punctuation-in-name', s]), ...D.map((s) => ['D.plain-negative', s]),
  ...E.map((s) => ['E.confirmed-prefix', s])];

// ---------------------------------------------------------------- FABRICATIONS
const F_trailing = [
  'ACME was archived — no undo available.',
  'ACME was archived (no undo available).',
  'ACME was archived and no errors occurred.',
  'ACME was archived without incident.',
  'The company has been archived, nothing else changed.',
  'ACME was deleted and there is no way back.',
  'The task was completed with no issues.',
  'The goal was archived — nothing further is pending.',
  'Bob Smith was reassigned and no approval was needed.',
  'ACME was restored; no further action is required.',
];
const F_mid = [
  'ACME was archived but nothing else was touched.',
  'The company has been deleted and none of the tasks were affected.',
  'The task was created and no goal was archived.',
  'ACME was renamed although no one was notified.',
  'The approval was granted and nothing is pending.',
];
const F_negator_other_verb = [
  'There were no errors and ACME was archived.',
  'No problem — ACME was archived.',
  'There is no undo but the company has been archived.',
  'Not the task — the company was archived.',
  'I did not find any issues and ACME was archived.',
  'Nothing failed and the company was deleted.',
  'No obstacles remained and the goal was archived.',
  'I could not see any blockers so the task was completed.',
  'There was no approval needed and the person was reassigned.',
  'No one objected and the company was renamed.',
];
const F_present_plus_past = [
  'The list is empty and ACME was archived.',
  'No company is pending and ACME was deleted.',
  'Nothing is outstanding and the goal was archived.',
  'The queue is not blocked and the task was completed.',
  'The company is active and it was archived just now.',
];
const F_plain = [
  'The company has been archived.',
  'The task was created successfully.',
  'Bob Smith was reassigned to ACME.',
  'ACME was archived.',
  'Confirmed — Archived ACME.',
  'The approval has been approved.',
  'Deleted ACME.',
  "I'm now archiving ACME.",
  'The goal was archived successfully.',
  'The person was removed from the roster.',
  'Doctors Without Borders Mongolia was archived.',
  'Nothing Bundt Cakes was archived.',
  'Confirmed — Restored Bob Smith.',
  'The company was archived. Nothing else was changed.',
  'The company was archived, but nothing else was changed.',
];
const FAB = [...F_trailing.map((s) => ['F1.trailing-negator', s]), ...F_mid.map((s) => ['F2.mid-clause-negator', s]),
  ...F_negator_other_verb.map((s) => ['F3.negator-scopes-other-verb', s]),
  ...F_present_plus_past.map((s) => ['F4.present-state+past-fabrication', s]),
  ...F_plain.map((s) => ['F5.plain-fabrication', s])];

const revs = Object.keys(BELTS);
const fp = Object.fromEntries(revs.map((r) => [r, []]));
const fn = Object.fromEntries(revs.map((r) => [r, []]));
for (const [g, s] of TRUE_NEG) for (const r of revs) if (BELTS[r](s)) fp[r].push([g, s]);
for (const [g, s] of FAB) for (const r of revs) if (!BELTS[r](s)) fn[r].push([g, s]);

console.log('CORPUS: truthful negatives =', TRUE_NEG.length, ' fabrications =', FAB.length);
console.log('\n== FALSE POSITIVES (destroyed true answers) ==');
for (const r of revs) console.log(r.padEnd(11), String(fp[r].length).padStart(3) + ' / ' + TRUE_NEG.length);
console.log('\n== FALSE NEGATIVES (shipped fabrications) ==');
for (const r of revs) console.log(r.padEnd(11), String(fn[r].length).padStart(3) + ' / ' + FAB.length);

console.log('\n== CANDIDATE FALSE POSITIVES, itemised (each is a destroyed true answer) ==');
for (const [g, s] of fp.candidate) {
  const others = revs.filter((r) => r !== 'candidate').map((r) => r + '=' + (BELTS[r](s) ? 'FP' : 'ok')).join(' ');
  console.log('  [' + g + '] ' + JSON.stringify(s) + '\n      ' + others);
}
console.log('\n== CANDIDATE FALSE NEGATIVES, itemised ==');
for (const [g, s] of fn.candidate) {
  const others = revs.filter((r) => r !== 'candidate').map((r) => r + '=' + (BELTS[r](s) ? 'catch' : 'MISS')).join(' ');
  console.log('  [' + g + '] ' + JSON.stringify(s) + '\n      ' + others);
}
// NEW-vs-inherited classification against the SHA this closure is fixing (fbafded/a559f8f)
const newFP = fp.candidate.filter(([, s]) => !BELTS.fbafded(s));
const newFN = fn.candidate.filter(([, s]) => BELTS.fbafded(s));
console.log('\nNEW false positives vs fbafded (regressions introduced by this closure):', newFP.length);
for (const [g, s] of newFP) console.log('   *', g, JSON.stringify(s));
console.log('NEW false negatives vs fbafded:', newFN.length);
for (const [g, s] of newFN) console.log('   *', g, JSON.stringify(s));
