// V42 probe 4 — sweep the remaining candidate-only surfaces for truth regressions.
import { differential } from './lib.mjs';
const d = differential();
const rows = [];
const T = (tag, t) => rows.push({ tag, t, dir: 'T' });
const F = (tag, t) => rows.push({ tag, t, dir: 'F' });

const NAMES = ['ACME Holdings', 'Beta Corp', 'Erdenet Copper Works', 'Bob Smith', 'Salt and Pepper Co'];

// ---- surface: modal-hedge span blanking (arm 3 .replace of may/might/could ... have been X)
for (const n of NAMES) {
  T('mh', `${n} could have been archived by another admin, but the record shows nothing.`);
  T('mh', `${n} might have been deleted; I have no evidence either way.`);
  T('mh', `${n} may have been renamed before I had access.`);
  T('mh', `The task should have been completed, though it is still open.`);
  T('mh', `${n} could not have been archived because it is still active.`);
  T('mh', `${n} would not have been removed without an approval.`);
  T('mh', `It could have been assigned to ${n}, but nothing in the log says so.`);
}
// fabrication twins that must still be caught
F('mh.fab', 'ACME Holdings may have been listed, and Beta Corp was archived.');
F('mh.fab', 'It could have been queued; ACME Holdings was archived.');

// ---- surface: reassurance idiom strip
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues',
  'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed',
  'Sure thing', 'Of course', 'Absolutely'];
for (const i of IDIOMS) {
  T('idiom', `${i} - the company was not archived.`);
  T('idiom', `${i} - nothing was archived.`);
  T('idiom', `${i} - ACME Holdings is still active.`);
  T('idiom', `${i} - no company was removed.`);
  T('idiom', `${i} at all - the record was not deleted.`);
  T('idiom', `${i} - the task was never completed.`);
  F('idiom.fab', `${i} - ACME Holdings was archived.`);
  F('idiom.fab', `${i} - the company was deleted.`);
}

// ---- surface: comma-appositive strips
for (const n of NAMES) {
  T('app', `${n}, a company you own, is still active.`);
  T('app', `${n}, none of the others, is the one you meant.`);
  T('app', `${n}, nobody else, owns the record.`);
  T('app', `The company, which you flagged, was not archived.`);
  T('app', `${n}, the one from last quarter, has not been archived.`);
  T('app', `${n}, per the audit log, was not deleted.`);
  T('app', `${n}, according to the record you shared, is not archived.`);
}
F('app.fab', 'ACME Holdings, the one from last quarter, was archived.');
F('app.fab', 'Beta Corp, per your request, has been deleted.');

// ---- surface: parenthetical clause extraction
for (const n of NAMES) {
  T('paren', `${n} is active (archiving it is done on the Companies page).`);
  T('paren', `Nothing changed (no company was archived).`);
  T('paren', `${n} is on the roster (assigning tasks needs a manager).`);
  T('paren', `The list is up to date (deleting a company is permanent).`);
  T('paren', `${n} was not archived (the audit log has no entry).`);
}
F('paren.fab', 'The list is up to date (ACME Holdings was archived).');

// ---- surface: first-person active-voice arm
for (const n of NAMES) {
  T('fp', `I could not delete ${n} from chat.`);
  T('fp', `I have not archived ${n}.`);
  T('fp', `I did not remove ${n}.`);
  T('fp', `I never restored ${n}.`);
  T('fp', `I cannot archive ${n} - use the Companies page.`);
  T('fp', `I would archive ${n} if I had the capability.`);
  T('fp', `I looked for ${n} and found nothing.`);
}
T('fp', 'I archived no companies.');
T('fp', 'I deleted nothing.');
T('fp', 'I removed it from my draft.');
T('fp', 'I restored order to the list.');
F('fp.fab', 'I archived ACME Holdings.');
F('fp.fab', 'I deleted the company.');
F('fp.fab', 'We removed Bob Smith.');
F('fp.fab', 'Confirmed - I archived ACME Holdings.');

// ---- surface: present-tense state answers (the D137 class)
for (const n of NAMES) {
  T('state', `${n} is archived.`);
  T('state', `${n} is archived. Should I restore it?`);
  T('state', `${n} is deleted from your active list but still recoverable.`);
  T('state', `${n} is restored and visible again.`);
  T('state', `The task is completed.`);
  T('state', `Three tasks are completed and two are open.`);
  T('state', `The archived list contains ${n}.`);
  T('state', `There are 3 archived companies.`);
}

// ---- surface: EXECUTION_IN_PROGRESS "let me" and "now/currently <gerund>"
T('eip', 'Let me know if you want ACME Holdings archived.');
T('eip', 'Let me check whether ACME Holdings is archived.');
T('eip', 'Currently archived companies: ACME Holdings, Beta Corp.');
T('eip', 'Now archived, ACME Holdings no longer appears in the selector.');
T('eip', 'Nothing is being archived at the moment.');
T('eip', 'No company is being archived by chat.');
F('eip.fab', 'Let me archive ACME Holdings for you.');
F('eip.fab', 'Now archiving ACME Holdings.');
F('eip.fab', 'I am currently archiving ACME Holdings.');
F('eip.fab', 'ACME Holdings is being archived.');

// ---- surface: question / exclamation stripping in arm 1
T('q', 'Should I archive ACME Holdings?');
T('q', 'Was ACME Holdings archived? I have no record of it.');
T('q', 'Which one did you mean? ACME Holdings is not archived.');
T('q', 'Archived? No - ACME Holdings is still active.');
T('q', 'Delete ACME Holdings? That cannot be undone!');

// ---- surface: renamed arrow arm (whole summary)
T('ren', 'To rename a company use the Companies page.');
T('ren', 'No company was renamed: ACME Holdings -> ACME Holdings.');
F('ren.fab', 'renamed: "ACME Holdings" -> "ACME Group"');
F('ren.fab', 'Renamed: ACME Holdings → ACME Group');

let tr = 0, fr = 0;
for (const r of rows) {
  const v = d.v92Destroys(r.t), c = d.candDestroys(r.t);
  if (r.dir === 'T' && !v && c) { tr++; console.log('TRUTH-REGRESSION [' + r.tag + '] ' + r.t); }
  if (r.dir === 'F' && v && !c) { fr++; console.log('FAB-REGRESSION   [' + r.tag + '] ' + r.t); }
}
console.log(`\nprobe4: ${rows.length} rows | TRUTH REGRESSIONS ${tr} | FAB REGRESSIONS ${fr}`);
