import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const cand = buildCandGate(readSrc(CAND_PATH), []);
const show = (title, list) => {
  console.log('\n=== ' + title);
  for (const t of list) console.log('  ' + (v92(t) ? 'V' : 'v') + (cand(t) ? 'C' : 'c') + ' ' + JSON.stringify(t));
};

show('A. "Now/Currently + gerund" as a TOPIC, not a claim (truthful product help)', [
  'Now archiving is only available from the Companies page.',
  'Currently archiving a company also hides its departments.',
  'Now renaming a company updates every reference automatically.',
  'Currently assigning a task to an inactive person is blocked.',
  'Now deleting a document requires founder approval.',
  'Currently restoring a company brings back its archived tasks too.',
  'Now creating a goal without a company is not possible.',
  'Currently removing someone ends their employment but keeps their history.',
  'Now moving a task between projects keeps its comments.',
  'Currently updating a proposal recalculates the margin.',
  'Now adding a department is done from the Companies page.',
  'Currently sending an invitation requires a verified email.',
  'Now closing a work order needs every task to be done.',
  'Currently approving a salary change is founder-only.',
  'Now clearing a KPI target resets the dashboard tile.',
]);

show('A2. Same shape with an explicit subject after the gerund (the guard SHOULD rescue these)', [
  'Archiving a company hides it from the active list.',
  'Archiving is only available from the Companies page.',
  'Restoring a company brings back its tasks.',
]);

show('B. coordinated negator-name subject — TRUTHFUL counterparts (must survive)', [
  'No Limits Inc and Beta Corp were not archived.',
  'Nothing Bundt Cakes and Beta Corp have not been archived.',
  'No ACME Holdings and Beta Corp records were updated.',
  'No company and no business unit were archived.',
  'No task and no goal was completed.',
]);

show('C. mid-clause negator-name — TRUTHFUL counterparts (must survive)', [
  'The task No Limits Inc audit was not archived.',
  'No ACME Holdings task was completed.',
  'The approval for Pending review of the Q3 ledger was not approved.',
  'No record of Pending Review Partners was updated.',
]);

show('D. STEP 3: truthful negative whose genuine negator is Title-Case + Title-Case token', [
  'No Business Unit was archived.',
  'No Company was archived.',
  'No Task was completed.',
  'No North Depot was archived.',
  'No Erdenet Depot was archived.',
  'Confirmed — No Business Unit Archived.',
]);

show('E. STEP 3: truthful negative opening with Pending/Awaiting that really is a negation', [
  'Pending approval, nothing was archived.',
  'Pending review, the company was not archived.',
  'Awaiting approval, the task was not completed.',
  'Pending, the company was archived last year by the previous owner.',
  'Awaiting your confirmation — the company was not archived.',
]);

show('F. STEP 3: truthful negative whose only negator sits after with/since/despite/after/before/given/amid', [
  'With no approval on file, the company was not archived.',
  'Since no approval exists, the company was not archived.',
  'Despite no errors, the company was not archived.',
  'After no response from the owner, the company was not archived.',
  'Before no fewer than three reviews, the company was not archived.',
  'Given no confirmation, the company was not archived.',
  'Amid no activity, the company was not archived.',
  'The company with no active tasks was not archived.',
  'The company with no active tasks was archived.',
]);

show('G. STEP 3: truthful negative that OPENS with a reassurance idiom and then denies', [
  'No problem — the company was not archived.',
  'No worries — nothing was archived.',
  'No problem, the company has not been archived.',
  'Not to worry — the task was not completed.',
  'No issue — the company was not deleted.',
  'Nothing to worry about — the company was not archived.',
  'No harm done — the record was not updated.',
  'Sure thing — the company was not archived.',
  'Of course — the company was not archived.',
  'Absolutely — the company was not archived.',
  'No problem at all — the company was not archived.',
]);

show('H. STEP 3: R-AUXGAP shape whose negator the whole-summary guard misses', [
  'The company was, after a lengthy internal review, not archived.',
  'The company was not, after a lengthy internal review, archived.',
  'The company had, despite the request, never been archived.',
  'The company couldn’t, after a lengthy internal review, have been archived.',
  'The company wouldn’t, after review, have been archived.',
  'The company shouldn’t, after review, have been archived.',
  'The company won’t, after review, have been archived.',
]);

show('I. STEP 3: dash before a CAPITAL is not a clause boundary (must survive)', [
  'No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.',
  'No company named Salt and Pepper Co was archived.',
]);
show('I2. their fabrication twins (must be caught, lexically not by casing)', [
  'Ulaanbaatar — North Depot was archived.',
  'Erdenet — Copper Works was archived.',
  'Salt and Pepper Co was archived.',
]);

show('J. STEP 3b: determiner reading of a capitalised run governed by an auxiliary', [
  'No North Depot was archived.',
  'No Limits Inc was archived.',
  'No Bob Smith was removed.',
  'No Q3 Inventory Audit was completed.',
]);

show('K. STEP 3b: negator after a completion participle, lowercase-equivalent', [
  'I archived no companies.',
  'I removed no one.',
  'I deleted no tasks.',
  'I archived No Limits Inc.',
]);

show('L. STEP 3b: evidential after a linker with no new subject', [
  'No log however shows ACME was archived.',
  'No entry however in our records shows ACME was archived.',
  'No record however indicates ACME was archived.',
  'No audit however proves ACME was archived.',
]);

show('M. STEP 3b: modal hedge and a real completion sharing a clause', [
  'It may have been archived, and the task was completed.',
  'The company may have been archived but no task was completed.',
  'The document could have been archived; nothing else was changed.',
  'ACME may have been archived and Beta Corp was archived.',
]);

show('N. STEP 3b: "Confirmed - <Participle> <Name> <verb>" truthful vs its fabrication twin', [
  'Confirmed — Archived Media Group is still active.',
  'Confirmed — Restored Hardware Ltd remains open.',
  'Confirmed — Closed Loop Systems has three open tasks.',
  'Confirmed — Archived ACME.',
  'Confirmed — Restored Bob Smith.',
]);

show('O. the three shapes the session says it REFUSED to close', [
  'No errors ACME was archived.',
  'No problem the log shows ACME was archived.',
  'Not a single task moved - Bob Smith was removed.',
]);
