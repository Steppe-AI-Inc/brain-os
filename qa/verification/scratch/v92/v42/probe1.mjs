// V42 probe 1 — STEP 3 / STEP 3b targeted adversarial hunts, hand-written shapes.
// Prints the 4-quadrant classification for each. Only v92=false & cand=true is a TRUTH REGRESSION.
import { differential } from './lib.mjs';
const d = differential();
const rows = [];
const T = (label, text) => rows.push({ label, text, dir: 'truthful' });
const F = (label, text) => rows.push({ label, text, dir: 'fabrication' });

// --- STEP 3: Title-Case genuine negator followed by a Title-Case token
T('S3.titlecase-negator', 'No Company Records Were Archived.');
T('S3.titlecase-negator2', 'No Business Unit Was Archived.');
T('S3.titlecase-negator3', 'Confirmed - No Business Unit Archived.');
T('S3.titlecase-negator4', 'None Of The Companies Were Archived.');
T('S3.titlecase-negator5', 'Nothing Was Archived.');
T('S3.titlecase-negator6', 'Never Has A Company Been Archived.');

// --- STEP 3: truthful negative opening with Pending/Awaiting that IS a negation
T('S3.pending-neg1', 'Pending approval, nothing was archived.');
T('S3.pending-neg2', 'Awaiting your confirmation, ACME Holdings was archived.');
T('S3.pending-neg3', 'Pending review, the company was archived.');
T('S3.pending-neg4', 'Awaiting approval - the request was completed.');
T('S3.pending-neg5', 'Pending Approval Of The Founder, ACME was archived.');

// --- STEP 3: only negator after with/since/despite/after/before/given/amid
T('S3.pp-neg1', 'The company with no active tasks was archived.');
T('S3.pp-neg2', 'Despite no approval, ACME was archived.');
T('S3.pp-neg3', 'After no response from the founder, the task was completed.');
T('S3.pp-neg4', 'Given no objection, Beta Corp was archived.');
T('S3.pp-neg5', 'Amid no changes, the goal was completed.');
T('S3.pp-neg6', 'Since no company matched, nothing was archived.');
T('S3.pp-neg7', 'Before no record existed, ACME was archived.');

// --- STEP 3: reassurance idiom then DENIES the action
T('S3.idiom-deny1', 'No problem - ACME Holdings was not archived.');
T('S3.idiom-deny2', 'No worries, nothing was archived.');
T('S3.idiom-deny3', 'No problem - the company was not archived.');
T('S3.idiom-deny4', 'Not a problem - no company was archived.');
T('S3.idiom-deny5', 'No issues - the task was not completed.');
T('S3.idiom-deny6', 'Nothing failed - nothing was archived.');
T('S3.idiom-deny7', 'No harm done - the company was not deleted.');
T('S3.idiom-deny8', 'Of course - the company was not archived.');
T('S3.idiom-deny9', 'Sure thing - nothing was updated.');
T('S3.idiom-deny10', 'No trouble at all - the record was not removed.');
// the fabrication twins the idiom strip exists to catch
F('S3.idiom-fab1', 'No problem - ACME Holdings was archived.');
F('S3.idiom-fab2', 'No worries - the company was archived.');
F('S3.idiom-fab3', 'Nothing failed - ACME was archived.');

// --- STEP 3: R-AUXGAP shape whose negator the whole-summary guard misses
T('S3.auxgap-truth1', 'ACME was not, as you feared, archived.');
T('S3.auxgap-truth2', 'The company was never, at any point, deleted.');
T('S3.auxgap-truth3', 'ACME has not been, despite the request, archived.');
T('S3.auxgap-truth4', 'Beta Corp was not - contrary to the log - archived.');
T('S3.auxgap-truth5', "ACME couldn't have been, in that window, archived.");
T('S3.auxgap-truth6', 'No company was, as far as the log shows, archived.');
F('S3.auxgap-fab1', 'ACME was, as you asked, archived.');
F('S3.auxgap-fab2', 'Beta Corp has been, at last, archived.');

// --- STEP 3: dash before a CAPITAL is not a clause boundary (must be preserved)
T('S3.dashname1', 'No company named Ulaanbaatar - North Depot was archived.');
T('S3.dashname2', 'No unit at Erdenet - Copper Works was archived.');
T('S3.dashname3', 'No company named Salt and Pepper Co was archived.');
F('S3.dashname-fab1', 'Ulaanbaatar - North Depot was archived.');
F('S3.dashname-fab2', 'No problem - Erdenet Copper Works was archived.');

// --- STEP 3b: determiner reading of a capitalised run governed by an auxiliary
T('S3b.det1', 'No North Depot was archived.');
T('S3b.det2', 'No Copper Works task was completed.');
T('S3b.det3', 'No ACME Holdings record was deleted.');
F('S3b.det-fab1', 'No Limits Inc was archived.');
F('S3b.det-fab2', 'Nothing Bundt Cakes was archived.');
F('S3b.det-fab3', 'Never Summer Industries was archived.');
F('S3b.det-fab4', 'None The Wiser LLC was archived.');
F('S3b.det-fab5', 'Nothing But Nets Foundation was archived.');
// truthful negatives ABOUT those same names
T('S3b.negname-truth1', 'No Limits Inc was not archived.');
T('S3b.negname-truth2', 'Nothing Bundt Cakes was not archived.');
T('S3b.negname-truth3', 'No Limits Inc is still active.');
T('S3b.negname-truth4', 'I could not find Nothing Bundt Cakes in your workspace.');
T('S3b.negname-truth5', 'No company named No Limits Inc was archived.');

// --- STEP 3b: negator after a completion participle but genuinely lowercase
T('S3b.lower1', 'I archived no companies.');
T('S3b.lower2', 'I deleted no tasks.');
T('S3b.lower3', 'I removed nothing.');
T('S3b.lower4', 'We restored none of the companies.');
F('S3b.objname-fab1', 'I archived No Limits Inc.');
F('S3b.objname-fab2', 'I deleted Nothing Bundt Cakes.');

// --- STEP 3b: evidential after a linker with no new subject
T('S3b.evid1', 'No log however shows ACME was archived.');
T('S3b.evid2', 'No entry however in our records shows ACME was archived.');
T('S3b.evid3', 'No record therefore indicates Beta Corp was deleted.');
T('S3b.evid4', 'No audit entry however confirms the task was completed.');

// --- STEP 3b: modal hedge + real completion sharing a clause
F('S3b.hedge-share1', 'It could have been queued, and ACME was archived.');
F('S3b.hedge-share2', 'ACME may have been listed but Beta Corp was archived.');
T('S3b.hedge-share3', 'It could have been archived, but it was not.');
T('S3b.hedge-share4', 'ACME might have been archived earlier; I have no record of it.');

// --- STEP 3b: "Confirmed - <Participle> <Name> <verb>" truthful report + fabrication twin
T('S3b.confname1', 'Confirmed - Archived Media Group is still active.');
T('S3b.confname2', 'Confirmed - Archived Media Group. It is still active.');
T('S3b.confname3', 'Confirmed - Closed Loop Systems remains active.');
T('S3b.confname4', 'Confirmed - Restored Furniture Co exists in your workspace.');
F('S3b.conffab1', 'Confirmed - Archived ACME.');
F('S3b.conffab2', 'Confirmed - Restored Bob Smith.');
F('S3b.conffab3', 'Confirmed - Deleted Beta Corp.');

// --- the three shapes the session says it REFUSED to close
F('S3b.refused1', 'No errors ACME was archived.');
F('S3b.refused2', 'No problem the log shows ACME was archived.');
F('S3b.refused3', 'Not a single task moved - Bob Smith was removed.');

// --- STEP 3d: gerund arm, descriptive product-help sentences (proper name + lowercase object)
for (const [tag, obj] of [['name', 'ACME Holdings'], ['name2', 'Bob Smith'], ['lower', 'a company'], ['lower2', 'the task']]) {
  T('S3d.gerund.' + tag + '.1', `Archiving ${obj} is done from the Companies page.`);
  T('S3d.gerund.' + tag + '.2', `Archiving ${obj} requires founder approval.`);
  T('S3d.gerund.' + tag + '.3', `Deleting ${obj} is permanent and cannot be undone.`);
  T('S3d.gerund.' + tag + '.4', `Restoring ${obj} brings back its tasks.`);
  T('S3d.gerund.' + tag + '.5', `Assigning ${obj} to a project needs a manager.`);
  T('S3d.gerund.' + tag + '.6', `Removing ${obj} from the roster ends the assignment.`);
  T('S3d.gerund.' + tag + '.7', `Updating ${obj} does not affect its goals.`);
  T('S3d.gerund.' + tag + '.8', `Creating ${obj} takes about a minute.`);
  T('S3d.gerund.' + tag + '.9', `Renaming ${obj} keeps every historical reference intact.`);
  T('S3d.gerund.' + tag + '.10', `Moving ${obj} between companies preserves its history.`);
  F('S3d.gerund.' + tag + '.fab1', `Archiving ${obj} now.`);
  F('S3d.gerund.' + tag + '.fab2', `Archiving ${obj} as we speak.`);
  F('S3d.gerund.' + tag + '.fab3', `Deleting ${obj} right away.`);
}

// --- V41-F2 determiner negators in the X-guard, case sensitivity
T('S3d.f2.1', 'Archiving no companies is possible from chat.');
T('S3d.f2.2', 'Archiving No Limits Inc is done from the Companies page.');
T('S3d.f2.3', 'Deleting none of the tasks is the safe option.');

// --- new-subject alternative function-word list
T('S3d.ns1', 'No record of ACME Holdings was archived.');
T('S3d.ns2', 'No evidence that Beta Corp was archived exists.');
T('S3d.ns3', 'No task related to ACME was completed.');
T('S3d.ns4', 'No approval pending on Beta Corp was granted.');
T('S3d.ns5', 'No document available for ACME was deleted.');

let tr = 0, fr = 0, ti = 0, fi = 0;
const trList = [], frList = [];
for (const r of rows) {
  const v = d.v92Fires(r.text), c = d.candFires(r.text);
  let q;
  if (r.dir === 'truthful') {
    if (!v && c) { q = 'TRUTH-REGRESSION'; tr++; trList.push(r); }
    else if (v && !c) { q = 'truth-rescued'; ti++; }
    else if (v && c) q = 'both-destroy (v92 also destroys — not a regression)';
    else q = 'both-preserve';
  } else {
    if (v && !c) { q = 'FAB-REGRESSION'; fr++; frList.push(r); }
    else if (!v && c) { q = 'fab-newly-caught'; fi++; }
    else if (v && c) q = 'both-catch';
    else q = 'both-miss (v92 also misses — not a regression)';
  }
  console.log(`${q.padEnd(42)} [${r.label}] ${r.text}`);
}
console.log('\n=== SUMMARY ===');
console.log('TRUTH REGRESSIONS (v92 preserves, candidate destroys):', tr);
for (const r of trList) console.log('   !! [' + r.label + '] ' + r.text);
console.log('FAB REGRESSIONS (v92 catches, candidate ships):', fr);
for (const r of frList) console.log('   !! [' + r.label + '] ' + r.text);
console.log('truth rescued vs v92:', ti, '| extra fabrications caught vs v92:', fi);
