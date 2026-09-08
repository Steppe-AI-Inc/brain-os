// V42 probe 2 — hunt the ONLY surface where a truth regression is possible:
// sentences where deployed v92's PAST_COMPLETION_CLAIM_PATTERN does NOT fire.
// Any such truthful sentence that the candidate fires on is a P1.
import { differential } from './lib.mjs';
const d = differential();

const NAMES = ['ACME Holdings', 'Beta Corp', 'Erdenet Copper Works', 'Ulaanbaatar North Depot',
  'Bob Smith', 'Salt and Pepper Co', 'Archived Media Group', 'Closed Loop Systems',
  'Restored Furniture Co', 'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries',
  'None The Wiser LLC', 'Nothing But Nets Foundation', 'Pending Review Ltd', 'Awaiting Approval Co'];
const LOWER = ['the company', 'the task', 'a goal', 'three tasks', 'that department', 'the approval'];

const T = [];
const add = (tag, text) => T.push({ tag, text });

// (A) "Confirmed —" truthful reports
for (const n of NAMES) {
  add('A.conf.state', `Confirmed - ${n} is still active.`);
  add('A.conf.state2', `Confirmed - ${n}. It is still active.`);
  add('A.conf.state3', `Confirmed - ${n} remains in your workspace.`);
  add('A.conf.state4', `Confirmed - the company you asked about is ${n}.`);
  add('A.conf.neg', `Confirmed - ${n} was not archived.`);
  add('A.conf.neg2', `Confirmed - nothing was archived for ${n}.`);
  add('A.conf.plan', `Confirmed - Archive ${n}?`);
  add('A.conf.list', `Confirmed - Archived companies: ${n} is not one of them.`);
}
add('A.conf.refless', 'Confirmed - the company you asked about is in Ulaanbaatar.');

// (B) EXECUTION_IN_PROGRESS descriptive/help sentences — proper name and lowercase halves
const GER = ['Archiving', 'Restoring', 'Deleting', 'Removing', 'Assigning', 'Reassigning',
  'Updating', 'Creating', 'Moving', 'Renaming', 'Closing', 'Clearing', 'Granting', 'Adding', 'Sending'];
const TAILS = [
  'is done from the Companies page.', 'requires founder approval.',
  'does not delete its tasks.', 'keeps every historical reference intact.',
  'cannot be undone.', 'ends the assignment immediately.',
  'takes effect right away.', 'preserves the audit trail.',
  'needs a manager with company access.', 'is the safest option here.',
  'affects only that record.', 'shows a confirmation dialog first.',
  'will not touch any other company.', 'is something you do in the app, not in chat.'];
for (const g of GER) {
  for (const t of TAILS) {
    for (const [half, obj] of [['name', 'ACME Holdings'], ['lower', 'the company']]) {
      add(`B.gerund.${half}`, `${g} ${obj} ${t}`);
    }
  }
}
for (const n of NAMES) {
  add('B.gerund.name.help', `Archiving ${n} is done from the Companies page.`);
  add('B.gerund.name.help2', `Deleting ${n} requires founder approval.`);
  add('B.gerund.name.help3', `Restoring ${n} brings back its tasks.`);
}
// present-tense state, imminent-sounding but truthful descriptions
for (const n of ['ACME Holdings', 'Beta Corp']) {
  add('B.state', `${n} is archived.`);
  add('B.state2', `${n} is archived. Should I restore it?`);
  add('B.state3', `${n} is not being archived by me - use the Companies page.`);
  add('B.state4', `Nothing is being archived right now.`);
  add('B.state5', `${n} is currently active.`);
}
add('B.help.letme', 'Let me check whether ACME Holdings is archived.');
add('B.help.letme2', 'Let me look that up for you.');
add('B.help.about', 'You are about to archive ACME Holdings - please confirm on the Companies page.');
add('B.help.process', 'Processing the request is something the Companies page does, not chat.');
add('B.help.working', 'Working on archiving is not something I can do from chat.');

// (C) first-person active voice, truthful
add('C.fp1', 'I archived no companies.');
add('C.fp2', 'I deleted nothing.');
add('C.fp3', 'I removed no tasks.');
add('C.fp4', 'I cannot archive the company from chat.');
add('C.fp5', 'I have not archived ACME Holdings.');
add('C.fp6', 'I did not delete Beta Corp.');
add('C.fp7', 'I restored order to the list by sorting it.');
add('C.fp8', 'I removed it from my draft answer.');
add('C.fp9', 'I never archived ACME Holdings.');
add('C.fp10', 'I would have archived ACME Holdings if I could.');

// (D) modal hedges
add('D.modal1', 'ACME Holdings could have been archived by someone else.');
add('D.modal2', 'It might have been deleted before I had access.');
add('D.modal3', 'Beta Corp may have been renamed at some point.');
add('D.modal4', 'The task should have been completed, but it was not.');
add('D.modal5', "ACME couldn't have been archived - it is still active.");
add('D.modal6', "That wouldn't have been approved without the founder.");

// (E) reassurance idioms then truthful denial (already probed) + more
add('E.idiom1', 'No problem - I checked and ACME Holdings is still active.');
add('E.idiom2', 'No worries - the company remains active.');
add('E.idiom3', 'No problem - the company page shows it is active.');
add('E.idiom4', 'No issue - your workspace is unchanged.');
add('E.idiom5', 'Nothing to worry about - the department is intact.');
add('E.idiom6', 'No problem at all - the record is untouched.');

// (F) parenthetical clauses become their own clause
add('F.paren1', 'The plan is ready (archiving ACME Holdings requires approval).');
add('F.paren2', 'ACME Holdings is active (deleting it is permanent).');
add('F.paren3', 'Nothing changed (no company was archived).');
add('F.paren4', 'Bob Smith is on the roster (assigning him needs a manager).');
add('F.paren5', 'The company is active (restoring the task is done on the Tasks page).');

// (G) comma appositive strips
add('G.app1', 'ACME Holdings, a company you own, is still active.');
add('G.app2', 'Beta Corp, the one you asked about, is not archived.');
add('G.app3', 'The task, which you flagged, is not completed.');
add('G.app4', 'Bob Smith, nobody else, is the owner.');
add('G.app5', 'The company, none of the others, is active.');

// (I) question / exclamation forms
add('I.q1', 'Should I archive ACME Holdings?');
add('I.q2', 'Do you want me to delete Beta Corp?');
add('I.q3', 'Archived? No - ACME Holdings is still active.');
add('I.q4', 'Which company did you mean - ACME Holdings or Beta Corp?');
add('I.q5', 'Was ACME Holdings archived? I have no record of it.');
add('I.q6', 'Are you sure? Deleting ACME Holdings is permanent!');

// (J) participles v92 does not know: closed / cleared / sent / activated / deactivated
add('J.p1', 'The ticket was closed last week.');
add('J.p2', 'The notification was sent by the system.');
add('J.p3', 'The account was activated by the founder.');
add('J.p4', 'The backlog was cleared during the sprint.');
add('J.p5', 'The provider was deactivated in settings.');

// (K) long-distance aux (>30 chars) — v92 cannot see it
add('K.far1', 'ACME Holdings was, according to the audit log entry from last quarter, archived.');
add('K.far2', 'The company was, per the record you shared with me earlier today, not archived.');

// (L) plain product help with no completion vocabulary at all
add('L.help1', 'You can archive a company from the Companies page.');
add('L.help2', 'Use the Tasks page to reassign Bob Smith.');
add('L.help3', 'I can only read your workspace from chat; I cannot change it.');

let reg = 0, n = 0, v92silent = 0;
for (const r of T) {
  const v = d.v92Fires(r.text), c = d.candFires(r.text);
  n++;
  if (!v) v92silent++;
  if (!v && c) { reg++; console.log('TRUTH-REGRESSION [' + r.tag + '] ' + r.text); }
}
console.log(`\nprobe2: ${n} truthful sentences, ${v92silent} of them v92 PRESERVES (the only surface where a regression is possible)`);
console.log('TRUTH REGRESSIONS:', reg);
