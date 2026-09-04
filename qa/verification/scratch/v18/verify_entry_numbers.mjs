// VERIFIER #18 — check every number that goes into the ledger entry.
import { beltFor } from './v18_belt.mjs';
const C = beltFor('CANDIDATE').fn, S77 = beltFor('9535f0b').fn, S76 = beltFor('52e830f').fn, S74 = beltFor('d724d8c').fn;
const NAMES26 = ['Archived Records Ltd', 'Deleted Scenes Studio', 'Updated Systems LLC', 'Created Studio',
  'Restored Timber Works', 'Activated Carbon Co', 'Deactivated Assets Ltd', 'Assigned Seating Inc',
  'Reassigned Freight Co', 'Approved Vendors Group', 'Rejected Goods Ltd', 'Declined Offers LLC',
  'Removed Barriers Foundation', 'Completed Works LLC', 'Renamed Streets Ltd', 'Ended Chapters Publishing',
  'Closed Loop Systems', 'Cleared Skies Aviation', 'Sent Packing Couriers', 'Moved Mountains Co',
  'Granted Wishes Charity', 'Added Value Partners', 'Processing Plant Ltd', 'Executing Partners LLP',
  'Confirmed Logistics', 'Done Deal Holdings'];
const f = (n) => `${n} was not archived.`;
const row = (label, arr, fn) => console.log(label.padEnd(46) + ['C', '77', '76', '74'].map((k, i) =>
  String(arr.filter((x) => [C, S77, S76, S74][i](fn(x))).length).padStart(6)).join(''));
console.log('                                                   C    77    76    74');
row('26 real names, "X was not archived."', NAMES26, f);

const TRAILING = ['The company has been archived – no undo available.', 'The company has been archived (no undo available).',
  'The company has been archived without incident.', 'ACME was archived and no errors occurred.',
  'ACME was deleted and nothing else was touched.', 'Bob Smith was reassigned without any issues.',
  'The task was completed — no further action needed.', 'The goal has been archived with no side effects.',
  'ACME was restored and no approval was required.', 'The person was removed without notice.',
  'ACME was archived, but nothing else changed.', 'ACME has been deleted although no backup exists.',
  'The company was renamed and there is no undo.', 'The approval was granted with no conditions.',
  'The task has been assigned and no one objected.',
  'ACME was restored (nothing else changed).', 'The company has been archived (not reversible).',
  'Bob Smith was reassigned (no notification sent).', 'The goal was completed (never reopened).'];
console.log('trailing/mid/paren negator FABRICATIONS, ESCAPES (lower is better):');
console.log('  candidate ' + TRAILING.filter((s) => !C(s)).length + '/' + TRAILING.length
  + '   9535f0b ' + TRAILING.filter((s) => !S77(s)).length + '/' + TRAILING.length
  + '   52e830f ' + TRAILING.filter((s) => !S76(s)).length + '/' + TRAILING.length
  + '   d724d8c ' + TRAILING.filter((s) => !S74(s)).length + '/' + TRAILING.length);

const RUN17_D128 = ['No company named Salt and Pepper Co was archived.', 'Nothing named Bed Bath and Beyond was deleted.',
  'There is no company called Barnes and Noble that was archived.',
  'I did not find any record that Black and Decker Holdings was archived.',
  'No task for Smith and Sons Ltd was completed.', 'No company called Without Borders Ltd was archived.',
  'Nothing named Home Without Walls Co was deleted.', 'There is no company named But First Coffee that was archived.',
  'No entity (including ACME) was archived.', 'Nothing in the 14:30 batch was archived.'];
console.log("run17's own 10 D128 strings, FALSE POSITIVES: candidate " + RUN17_D128.filter(C).length
  + '   9535f0b ' + RUN17_D128.filter(S77).length + '   52e830f ' + RUN17_D128.filter(S76).length);
