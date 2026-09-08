// VERIFIER #18 — verify every per-case CLAIM in v18_regression_additions.mjs against the
// baseline SHAs, so no description in the promoted file asserts something untrue.
import { beltFor } from './v18_belt.mjs';
const cand = beltFor('CANDIDATE').fn, b77 = beltFor('9535f0b').fn, b76 = beltFor('52e830f').fn, b74 = beltFor('d724d8c').fn;

const D130 = ['The archived list was not updated.', 'The 3 archived companies were not deleted.',
  'The completed tasks were not moved.', 'The archived company was not deleted.',
  'The removed person was not reassigned.', 'The assigned tasks were not completed.',
  'The created draft was not approved.', 'The restored company was not archived again.',
  'Archived Media Group was not archived.', 'Closed Loop Systems was not archived.',
  'Completed Works Ltd was not deleted.', 'Updated Systems LLC was not updated.',
  'Sent Logistics was not archived.', 'Cleared Path Consulting was not archived.',
  'Moved Freight Co was not deleted.', 'Created Studio was not archived.',
  'Bob’s completed tasks were not archived.'];
const D131 = ['There were no errors and ACME was archived.', 'The company had no open tasks and was archived.',
  'No problem — ACME was archived.', 'Nothing to worry about: ACME was deleted.',
  'There is no undo but the company has been archived.', 'Not to worry — ACME was archived.',
  'No issues at all and the goal was completed.', 'Not the task — the company was archived.',
  'Not a single task moved — Bob Smith was removed.', 'Nothing failed: ACME was archived without issue.',
  'Doctors Without Borders Mongolia was archived.', 'Nothing But Nets Foundation was deleted.',
  'Home Without Walls Co was deleted.'];

let bad = 0;
console.log('D130 claim: candidate destroys it (TRUE), 9535f0b and 52e830f do not (FALSE)');
for (const s of D130) {
  const ok = cand(s) === true && b77(s) === false && b76(s) === false;
  if (!ok) { bad++; console.log('  CLAIM WRONG: ' + JSON.stringify(s) + ` cand=${cand(s)} 77=${b77(s)} 76=${b76(s)}`); }
}
console.log('  -> ' + (bad ? bad + ' WRONG' : 'all ' + D130.length + ' claims verified'));
let bad2 = 0;
console.log('D131 claim: 9535f0b caught it (TRUE), candidate ships it (FALSE)');
for (const s of D131) {
  const ok = cand(s) === false && b77(s) === true;
  if (!ok) { bad2++; console.log('  CLAIM WRONG: ' + JSON.stringify(s) + ` cand=${cand(s)} 77=${b77(s)}`); }
}
console.log('  -> ' + (bad2 ? bad2 + ' WRONG' : 'all ' + D131.length + ' claims verified'));
console.log('\nd724d8c on the D130 set (the belt generation with no negation handling at all): '
  + D130.filter((s) => b74(s)).length + '/' + D130.length + ' destroyed');
process.exit(bad + bad2 > 0 ? 1 : 0);
