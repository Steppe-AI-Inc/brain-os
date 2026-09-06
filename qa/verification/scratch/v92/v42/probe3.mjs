// V42 probe 3 — GENERATE the two new classes found by probe 2, do not sample them.
// CLASS V42-D1: EXECUTION_IN_PROGRESS "imminent" arms (about to / going to / proceeding to /
//   starting to / starting the / in the process of / going ahead and / kicking off) carry NO
//   subject guard, so a truthful 2nd/3rd-person or descriptive sentence is destroyed.
// CLASS V42-D2: "Confirmed - ..." arms destroy truthful reports whose ENTITY NAME begins with a
//   completion participle, in shapes wider than the single disclosed blocker row.
import { differential } from './lib.mjs';
const d = differential();

const out = { d1name: [], d1lower: [], d2: [], other: [] };
const tot = { d1name: 0, d1lower: 0, d2: 0, other: 0 };
const test = (bucket, text) => {
  tot[bucket]++;
  const v = d.v92Fires(text), c = d.candFires(text);
  if (!v && c) out[bucket].push(text);
  return { v, c };
};

// ---------- CLASS V42-D1 ----------
const SUBJ = ['You are', 'You were', 'The founder is', 'Bob Smith is', 'Your manager is',
  'The Companies page is', 'The system is', 'Anyone with access is', 'A company manager is'];
const IMMINENT = [
  ['about to', ['archive', 'restore', 'delete', 'remove', 'assign', 'update', 'create', 'move', 'rename', 'approve', 'reject', 'complete']],
  ['going to', ['archive', 'restore', 'delete', 'remove', 'assign', 'approve']],
  ['proceeding to', ['archive', 'delete', 'approve']],
  ['starting to', ['archive', 'delete', 'assign']],
];
for (const s of SUBJ) for (const [ph, verbs] of IMMINENT) for (const v of verbs) {
  test('d1name', `${s} ${ph} ${v} ACME Holdings - please confirm on the Companies page.`);
  test('d1lower', `${s} ${ph} ${v} the company - please confirm on the Companies page.`);
}
// descriptive / conditional / interrogative uses with no actor claim at all
const DESCR_NAME = [
  'If you are about to archive ACME Holdings, use the Companies page.',
  'Are you about to archive ACME Holdings?',
  'When you are about to delete ACME Holdings, the app asks for confirmation.',
  'Nobody is about to archive ACME Holdings.',
  'No one is going to delete ACME Holdings without approval.',
  'Nothing is about to be archived.',
  'Starting the archive of ACME Holdings requires founder approval.',
  'Starting the restore of ACME Holdings is done from the Companies page.',
  'Starting the delete flow for ACME Holdings shows a confirmation dialog.',
  'You are in the process of archiving ACME Holdings in the app.',
  'The founder is in the process of approving the ACME Holdings request.',
  'Nobody is in the process of deleting ACME Holdings.',
  'The founder is going ahead and archiving ACME Holdings in the app.',
  'Your manager is kicking off the archive of ACME Holdings.',
  'My colleague is working on archiving the ACME Holdings backlog.',
];
for (const t of DESCR_NAME) test('d1name', t);
for (const t of DESCR_NAME) test('d1lower', t.replace(/ACME Holdings/g, 'the company').replace(/the the company/g, 'the company'));

// ---------- CLASS V42-D2 ----------
// Entity names that legitimately BEGIN with a completion participle. These are real-world
// plausible business names, and Brain OS resolves whatever the founder actually named things.
const PARTNAMES = ['Archived Media Group', 'Restored Furniture Co', 'Closed Loop Systems',
  'Completed Works Ltd', 'Cleared Sky Aviation', 'Sent Mail Studio', 'Moved Mountains LLC',
  'Granted Wishes Foundation', 'Renamed Records Inc', 'Updated Designs Co', 'Created Space Studio',
  'Removed Barriers NGO', 'Added Value Partners', 'Approved Vendors Ltd', 'Deleted Scenes Media',
  'Assigned Seating Co', 'Ended Days Brewing', 'Activated Carbon Ltd', 'Declined Offers Inc',
  'Rejected Prints Studio', 'Reassigned Routes Co', 'Deactivated Devices Ltd'];
const CONF_SHAPES = [
  (n) => `Confirmed - ${n}. It is still active.`,
  (n) => `Confirmed - the company you asked about is ${n}.`,
  (n) => `Confirmed - Archive ${n}?`,
  (n) => `Confirmed - Restore ${n}?`,
  (n) => `Confirmed - Delete ${n}?`,
  (n) => `Confirmed - ${n}. Nothing was changed.`,
  (n) => `Confirmed - you meant ${n}, not the other one.`,
  (n) => `Confirmed - ${n}. Should I archive it?`,
];
for (const n of PARTNAMES) for (const f of CONF_SHAPES) test('d2', f(n));

// control: the same shapes with an ordinary name must be preserved (they are, but prove it)
for (const n of ['ACME Holdings', 'Beta Corp']) for (const f of CONF_SHAPES) test('other', f(n));

for (const k of ['d1name', 'd1lower', 'd2', 'other']) {
  console.log(`\n--- ${k}: ${out[k].length} truth regressions of ${tot[k]} generated`);
  for (const t of out[k].slice(0, 40)) console.log('   !! ' + t);
}
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
console.log('\nTOTAL TRUTH REGRESSIONS:', total, 'of', Object.values(tot).reduce((a, b) => a + b, 0));
