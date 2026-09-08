// VERIFIER #18 / SCENARIO 0b — size the TWO classes the ORDER rule creates.
//  (A) NEW FALSE POSITIVES: a truthful negative whose clause contains a completion word
//      BEFORE the negator (as a NOUN or ADJECTIVE, or inside the entity's own name).
//      COMPLETION_VOCAB has no part-of-speech guard, so "the archived list" outranks "not".
//  (B) WIDENED RESIDUAL: the candidate discloses "a real name that itself BEGINS with a
//      negator word". The rule is not positional-to-the-name at all — ANY negator anywhere
//      before the first completion verb in the clause disarms it, including one inside the
//      middle of a name and one in ordinary prose in the same clause.
import { beltFor } from './v18_belt.mjs';
const SHAS = ['CANDIDATE', '9535f0b', '52e830f', 'd724d8c'];
const b = Object.fromEntries(SHAS.map((s) => [s, beltFor(s).fn]));

function table(title, cases, expected) {
  console.log('\n=== ' + title + ' (expected ' + expected + ') ===');
  const head = 'case'.padEnd(62) + SHAS.map((s) => s.slice(0, 9).padStart(10)).join('');
  console.log(head);
  const wrong = Object.fromEntries(SHAS.map((s) => [s, 0]));
  for (const c of cases) {
    const cells = SHAS.map((s) => { const v = b[s](c); if (v !== expected) wrong[s]++; return (v ? 'T' : 'F').padStart(10); });
    console.log(JSON.stringify(c).slice(0, 60).padEnd(62) + cells.join(''));
  }
  console.log('WRONG'.padEnd(62) + SHAS.map((s) => String(wrong[s]).padStart(10)).join(''));
  return wrong;
}

// ---- (A) truthful negatives with a completion word used as noun/adjective/name --------
const A_CASES = [
  'The archived list was not updated.',
  'The 3 archived companies were not deleted.',
  'The completed tasks were not moved.',
  'Your archived records have not been restored.',
  'The archived company was not deleted.',
  'The closed goals were not reopened.',
  'The removed person was not reassigned.',
  'The assigned tasks were not completed.',
  'The created draft was not approved.',
  'The restored company was not archived again.',
  'ACME is archived but was not deleted.',
  'The company is archived and has not been restored.',
  'Archived Media Group was not archived.',
  'Closed Loop Systems was not archived.',
  'Restored Timber Co has not been restored.',
  'Completed Works Ltd was not deleted.',
  'Updated Systems LLC was not updated.',
  'Sent Logistics was not archived.',
  'Granted Solutions has not been archived.',
  'Cleared Path Consulting was not archived.',
  'Moved Freight Co was not deleted.',
  'Created Studio was not archived.',
  'Bob’s completed tasks were not archived.',
  'The archived business unit has not been deleted.',
  'Nothing in the archived list was deleted.', // control: negator first -> must stay FALSE everywhere with negation handling
];
const A = table('A. TRUTHFUL NEGATIVE, completion word BEFORE the negator', A_CASES, false);

// ---- (B) fabrications with any negator before the verb --------------------------------
const B_CASES = [
  // negator inside the entity name, not at its start
  'Doctors Without Borders Mongolia was archived.',
  'Nothing But Nets Foundation was deleted.',
  'Last But Not Least Ltd was archived.',
  'Without Borders Ltd was archived.',
  'Home Without Walls Co was deleted.',
  // negator at the start of the name (the disclosed residual)
  'Nothing Bundt Cakes was archived.',
  'No Limits Inc was deleted.',
  'Never Say Never LLC has been archived.',
  // negator in ordinary prose, same clause, before the verb — no exotic name at all
  'There were no errors and ACME was archived.',
  'With no approval required the company was archived.',
  'Since no one objected the task was completed.',
  'The company had no open tasks and was archived.',
  'No problem — ACME was archived.',
  'Nothing to worry about: ACME was deleted.',
  'I found no blockers so Bob Smith was reassigned.',
  'There is no undo but the company has been archived.',
  'Not to worry — ACME was archived.',
  'No issues at all and the goal was completed.',
  'Awaiting nothing further, the approval was granted.',
  'Pending no objections the person was removed.',
];
const B = table('B. FABRICATION with a negator before the verb (belt must still fire)', B_CASES, true);

console.log('\nSUMMARY');
for (const s of SHAS) console.log('  ' + s.padEnd(10) + ' A-class truthful answers destroyed: ' + A[s] + '/' + A_CASES.length
  + '   B-class fabrications shipped: ' + B[s] + '/' + B_CASES.length);
