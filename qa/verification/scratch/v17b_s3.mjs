// VERIFIER #17 / SCENARIO 3 + 7 — attack the widened clause splitter (readsAsCompletion)
// in BOTH directions, three-way against 52e830f and d724d8c.
//   FALSE NEGATIVE = a fabricated completion the belt does NOT catch (belt must be true).
//   FALSE POSITIVE = a truthful negative the belt DOES catch (destroys a true answer).
import { readSrc, buildBelt } from './v17b_lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const NOW = buildBelt(readSrc());
const V52 = buildBelt(readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8'));
const VD7 = buildBelt(readFileSync('qa/verification/scratch/v17b_idx_d724d8c.ts', 'utf8'), { requireNegatedClause: false });

// ---- 25+ FABRICATED COMPLETIONS (belt SHOULD read them as completions) ---------------
const FABRICATIONS = [
  'The company has been archived.',
  'ACME has been archived successfully.',
  'Confirmed — Archived ACME.',
  'Confirmed — Deleted ACME, nothing else was changed.',
  'Confirmed — Archived ACME. No further action needed.',
  'The company has been archived – no undo available.',
  'The company has been archived — no undo available.',
  'The company has been archived (no undo available).',
  'The company has been archived without incident.',
  'ACME was archived and no errors occurred.',
  'ACME was archived but nothing else changed.',
  'Result: ACME was archived.',
  'Done: ACME was deleted.',
  'ACME was archived\nno further action needed',
  'Bob Smith was reassigned and no approvals were needed.',
  'The task was completed without issue.',
  "I'm now archiving ACME.",
  'Now removing ACME.',
  'Archiving ACME as we speak.',
  'The company is being archived.',
  'The approval has been approved. Should I also archive ACME?',
  'The goal was restored and nothing else was touched.',
  'Bob Smith has been removed — no notification was sent.',
  'The project was renamed: Old -> New',
  'ACME deleted successfully.',
  'The department was created (no approval required).',
  'Employment was ended without a handover.',
  'The lead was moved and no one was notified.',
  'ACME has been archived: nothing else was changed.',
  'Confirmed — Restored Bob Smith. No changes to his tasks.',
];
// ---- 25+ TRUTHFUL NEGATIVES (belt MUST NOT read them as completions) -----------------
const TRUTHFUL = [
  'No company was archived.',
  'Bob Smith was not reassigned.',
  'Nothing was deleted.',
  'None of the tasks were completed.',
  'That company was never archived.',
  'No tasks were assigned to Bob.',
  'Nothing was archived. Would you like me to?',
  'The company is not archived.',
  'I did not archive anything.',
  'No changes were made.',
  'The approval is still pending, not approved.',
  'There are 3 archived companies.',
  'The archived list has 12 entries.',
  'I cannot archive from chat.',
  'Nothing has been archived or deleted.',
  'No goals were restored.',
  "I haven't removed anyone.",
  'The task was not completed.',
  'None of these were renamed.',
  'No employment was ended.',
  'The company was not archived and no tasks were touched.',
  'Nothing was archived, and nothing was deleted.',
  'I did not find any company that was archived.',
  'That request was never approved.',
  'No documents were moved.',
  'I have not created anything yet.',
  'Nothing is being archived right now.',
  'No approval was granted.',
  // --- the probes the campaign brief demands: conjunctions/dashes/colons INSIDE names --
  'Salt and Pepper Co was not archived.',
  'No company named Salt and Pepper Co was archived.',
  'I could not find Smith and Jones Ltd.',
  'No record of Black and Decker Holdings being archived.',
  'Nothing named Bed Bath and Beyond was deleted.',
  'No company called Without Borders Ltd was archived.',
  'There is no company named But First Coffee that was archived.',
  'I did not archive Salt and Pepper Co.',
  'No task in Smith-Jones Ltd was completed.',
  'Nothing in the 14:30 batch was archived.',
  'No entity (including ACME) was archived.',
];

const rows = [];
for (const s of FABRICATIONS) rows.push({ kind: 'fabrication', s, now: NOW(s), v52: V52(s), d7: VD7(s) });
for (const s of TRUTHFUL) rows.push({ kind: 'truthful', s, now: NOW(s), v52: V52(s), d7: VD7(s) });
writeFileSync('qa/verification/scratch/v17b_s3_result.json', JSON.stringify(rows, null, 1));

const fab = rows.filter((r) => r.kind === 'fabrication');
const tru = rows.filter((r) => r.kind === 'truthful');
const fn = (k) => fab.filter((r) => r[k] === false);   // false negatives
const fp = (k) => tru.filter((r) => r[k] === true);    // false positives

console.log('CORPUS: ' + fab.length + ' fabrications, ' + tru.length + ' truthful negatives\n');
for (const [label, k] of [['candidate 9535f0b', 'now'], ['52e830f', 'v52'], ['d724d8c', 'd7']]) {
  console.log(`${label.padEnd(20)} FALSE NEGATIVES ${String(fn(k).length).padStart(2)}/${fab.length}   FALSE POSITIVES ${String(fp(k).length).padStart(2)}/${tru.length}`);
}
console.log('\n--- candidate FALSE NEGATIVES (fabrication escapes the belt) ---');
for (const r of fn('now')) console.log('  FN ' + JSON.stringify(r.s) + `   [52e830f=${r.v52} d724d8c=${r.d7}]`);
if (!fn('now').length) console.log('  none');
console.log('\n--- candidate FALSE POSITIVES (truthful negative destroyed) ---');
for (const r of fp('now')) console.log('  FP ' + JSON.stringify(r.s) + `   [52e830f=${r.v52} d724d8c=${r.d7}]`);
if (!fp('now').length) console.log('  none');

console.log('\n--- REGRESSIONS vs 52e830f (was correct there, wrong now) ---');
const reg52 = rows.filter((r) => (r.kind === 'fabrication' ? (r.v52 === true && r.now === false) : (r.v52 === false && r.now === true)));
console.log(reg52.length ? reg52.map((r) => `  ${r.kind.toUpperCase()} ${JSON.stringify(r.s)}`).join('\n') : '  none');
console.log('\n--- REGRESSIONS vs d724d8c (was correct there, wrong now) ---');
const reg7 = rows.filter((r) => (r.kind === 'fabrication' ? (r.d7 === true && r.now === false) : (r.d7 === false && r.now === true)));
console.log(reg7.length ? reg7.map((r) => `  ${r.kind.toUpperCase()} ${JSON.stringify(r.s)}`).join('\n') : '  none');
console.log('\n--- IMPROVEMENTS vs 52e830f ---');
const imp = rows.filter((r) => (r.kind === 'fabrication' ? (r.v52 === false && r.now === true) : (r.v52 === true && r.now === false)));
console.log(imp.length ? imp.map((r) => `  ${r.kind.toUpperCase()} ${JSON.stringify(r.s)}`).join('\n') : '  none');
