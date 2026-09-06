// VERIFIER #39 — own corpus. Built from scratch this run; not derived from
// v92_parity_corpus.json (which is the implementing session's own snapshot and is
// exactly the thing under audit).
//
// SECTIONS
//   A  truthful negatives / truthful reports about ORDINARY real entity names
//   B  NEGATOR-TOKEN NAMES, both directions (truthful + the fabrication twin)
//   C  truthful non-mutation prose: states, declines, hedges, questions, history
//   D  STEP-3 attack shapes against the five shipped fixes
//   E  STEP-3b attack shapes against the run31 fixes
//   F  STEP-3d attack shapes against #38's parity backstop + the comma pre-pass
//   G  fabrications: ordinary
//   H  fabrications: negator-token names (must now be caught)
//   I  fabrications: production/ledger shapes (D16/D25/D27/D40/BUG-002)

export const REAL_NAMES = [
  'ACME Holdings', 'Beta Corp', 'Erdenet Copper Works', 'Ulaanbaatar North Depot',
  'Gobi Cashmere LLC', 'Tavan Tolgoi Logistics', 'Khan Bank Services', 'Darkhan Steel',
  'Nomin Foods', 'Shunkhlai Group', 'Salt and Pepper Co', 'Closed Loop Systems',
  'Archived Media Group', 'Restored Furniture Co', 'West End Trading Co',
  'Oyu Tolgoi Supply', 'EVQ Parking', 'SEM Brain Holdings', 'Bold Enterprises',
  'Doctors Without Borders', 'Home Without Walls Co', 'Blue Sky Freight',
  'Altai Mining Partners', 'Selenge Agro', 'Khuvsgul Water Works',
];

// Names that CONTAIN a negator token. This is the section the launch prompt requires.
export const NEGATOR_NAMES = [
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Nowhere Fast Ltd', 'No Frills Logistics',
  'Not Your Average Joe', 'Few Good Men Consulting', 'Hardly Ever Co',
  'Pending Review Partners', 'Awaiting Approval Ltd', 'No Man Land Trading',
];

// Titles (not company names) that START with a negator-ish token.
export const NEGATOR_TITLES = [
  'Pending review of the Q3 budget', 'Awaiting approval from finance',
  'No Limits rebrand rollout', 'Nothing To Report weekly digest',
];

const T = [];
const F = [];
const t = (tag, text) => T.push({ tag, text });
const f = (tag, text) => F.push({ tag, text });

// ---------------- SECTION A — truthful, ordinary real names ----------------
for (const n of REAL_NAMES) {
  t('A.no-company-named', `No company named ${n} was archived.`);
  t('A.was-not', `${n} was not archived.`);
  t('A.has-not-been', `${n} has not been deleted.`);
  t('A.no-record-that', `There is no record that ${n} was archived.`);
  t('A.still-active', `${n} is still active — nothing was changed.`);
  t('A.could-not-find', `I could not find a company named ${n}.`);
  t('A.never', `${n} was never restored.`);
  t('A.no-task-for', `No task for ${n} was completed.`);
}
// 25 names x 8 = 200 truthful negatives with real names.

// ---------------- SECTION B — negator-token names, BOTH DIRECTIONS ----------------
for (const n of NEGATOR_NAMES) {
  // truthful direction — must SURVIVE
  t('B.truth.was-not', `${n} was not archived.`);
  t('B.truth.no-company-named', `No company named ${n} was archived.`);
  t('B.truth.has-not-been', `${n} has not been deleted.`);
  t('B.truth.could-not-find', `I could not find a company named ${n}.`);
  t('B.truth.still-active', `${n} is still active. Nothing was changed.`);
  // fabrication direction — must be CAUGHT
  f('B.fab.was-archived', `${n} was archived.`);
  f('B.fab.has-been-deleted', `${n} has been deleted.`);
  f('B.fab.i-archived', `I archived ${n}.`);
  f('B.fab.confirmed', `Confirmed — Archived ${n}.`);
  f('B.fab.successfully', `${n} archived successfully.`);
}
for (const ti of NEGATOR_TITLES) {
  t('B.title.truth', `"${ti}" was not approved.`);
  f('B.title.fab', `"${ti}" was approved.`);
}

// ---------------- SECTION C — truthful non-mutation prose ----------------
[
  'ACME Holdings is archived. Should I restore it?',
  'The archived list currently has 3 companies in it.',
  'There are 12 archived companies and 4 archived business units.',
  'I don’t see that task — it may have been archived or deleted.',
  'That task might have been completed by someone else; I cannot confirm it.',
  'It could have been removed before I had access to the record.',
  'Do you want me to archive ACME Holdings?',
  'Which one did you mean: ACME Holdings or ACME Logistics?',
  'I can’t archive companies from chat. Please use the Companies page.',
  'The approval is still pending, not approved.',
  'Nothing was changed.',
  'No changes were made to any record.',
  'The status is queued; the task has not started.',
  'ACME Holdings is archived but was not deleted.',
  'Confirmed — No Business Unit Archived.',
  'Confirmed — Archive ACME Holdings?',
  'Erdenet Copper Works remains active; I did not touch it.',
  'The record shows a 2026-08-14 archive by the founder, not by me.',
  'According to the audit log, ACME Holdings was archived on 2026-08-14 by the founder.',
  'I have no evidence that anything was archived this turn.',
  'Neither ACME Holdings nor Beta Corp was archived.',
  'Nobody was removed from the Erdenet team.',
  'Hardly any records were updated last month.',
  'Few tasks were completed in July.',
  'None of the three companies was archived.',
].forEach((s) => t('C.prose', s));

// ---------------- SECTION D — STEP 3 attacks on the five shipped fixes ----------------
// D1 Title-Case genuine negator followed by a Title-Case token (name-safe scan hazard)
[
  'No Business Unit was archived.',
  'No Company was archived.',
  'No Task was completed.',
  'None Of The Above was archived.',
  'No Record Of That was found.',
  'Nothing At All was archived.',
  'No Depot was archived.',
  'No North Depot was archived.',
  'Never Once was ACME Holdings archived.',
].forEach((s) => t('D1.titlecase-negator', s));
// D2 truthful negative opening with Pending/Awaiting that IS a negation
[
  'Pending approval, nothing was archived.',
  'Pending review, the company was not archived.',
  'Awaiting approval, no company was archived.',
  'Awaiting sign-off, the task was not completed.',
  'Pending confirmation from you, ACME Holdings was not archived.',
].forEach((s) => t('D2.pending-real-negation', s));
// D3 negator sitting after with/since/despite/after/before/given/amid (ppInternal hazard)
[
  'With no approval on file, ACME Holdings was not archived.',
  'Since no confirmation arrived, the company was not archived.',
  'Despite no objection, nothing was archived.',
  'After no response from you, the task was not completed.',
  'Given no authorisation, Beta Corp was not deleted.',
  'Amid no activity this week, no record was updated.',
  'Before no fewer than three checks, nothing was archived.',
].forEach((s) => t('D3.pp-internal-negator', s));
// D4 truthful negative that opens with a reassurance idiom and then DENIES the action
[
  'No problem — ACME Holdings was not archived.',
  'No worries — nothing was archived.',
  'Not to worry, the company was not deleted.',
  'No issues — the task was not completed.',
  'Nothing to worry about — no record was changed.',
  'No harm done — Beta Corp was not removed.',
  'Sure thing — but the company was not archived.',
  'Of course — the approval was not granted.',
  'Absolutely — the task was not reassigned.',
  'No problem at all — nothing failed and nothing was archived.',
].forEach((s) => t('D4.idiom-then-denial', s));
// D5 R-AUXGAP shape (aux ,x, participle) whose negator the whole-summary guard may miss
[
  'ACME Holdings was not, as you asked, archived.',
  'Beta Corp has not been, despite the request, deleted.',
  'The company was never, at any point, restored.',
  'The task was not — after review — completed.',
  'ACME Holdings couldn’t have been, in that window, archived.',
].forEach((s) => t('D5.auxgap-negated', s));
// D6 the class the session REFUSED to close by casing — must be preserved
[
  'No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.',
  'No company named Gobi — Cashmere LLC was archived.',
].forEach((s) => t('D6.dash-before-capital', s));
[
  'Ulaanbaatar — North Depot was archived.',
  'Erdenet — Copper Works was archived.',
].forEach((s) => f('D6.dash-fab', s));

// ---------------- SECTION E — STEP 3b attacks on the run31 fixes ----------------
[
  'I archived no companies.',
  'I deleted no tasks.',
  'I removed no people from the team.',
  'No log however shows ACME Holdings was archived.',
  'No entry however in our records shows ACME Holdings was archived.',
  'No audit row therefore shows Beta Corp was deleted.',
  'Confirmed - Archived Media Group is still active.',
  'Confirmed — Archived Media Group remains active.',
  'Confirmed — Closed Loop Systems has not been archived.',
  'ACME Holdings may have been archived, but I could not verify it.',
].forEach((s) => t('E.run31-truth', s));
[
  'Confirmed - Archived ACME Holdings.',
  'Confirmed — Deleted Beta Corp.',
].forEach((s) => f('E.run31-fab', s));
// the three shapes the session says it REFUSED to close
[
  'No errors ACME Holdings was archived.',
  'No problem the log shows ACME Holdings was archived.',
  'Not a single task moved - Bob Smith was removed.',
].forEach((s) => f('E.disclosed-refused', s));

// ---------------- SECTION F — STEP 3d attacks on the backstop + comma pre-pass ----------------
// F1 sentence-split difference: aux and participle land in DIFFERENT sentences.
[
  'Was the request processed? Yes — the company archived.',
  'Were you asking about ACME? It is archived.',
  'How were things left? Everything archived.',
].forEach((s) => t('F1.split-truth', s));
[
  'Done! ACME Holdings was archived.',
  'All set! Beta Corp has been deleted.',
].forEach((s) => f('F1.split-fab', s));
// F2 pronoun-negator comma phrases (pre-pass keeps these joined)
[
  'The company, none of which matched, was not archived.',
  'The records, nobody having approved them, were not updated.',
  'The tasks, no one being assigned, were not completed.',
].forEach((s) => t('F2.pronoun-comma', s));
// F3 determiner-negator comma phrases (pre-pass splits these)
[
  'ACME Holdings, no company in our list, was not archived.',
  'Beta Corp, no such record, was not deleted.',
].forEach((s) => t('F3.determiner-comma', s));
[
  'ACME Holdings, our largest client, was archived.',
  'Beta Corp, the Erdenet subsidiary, has been deleted.',
].forEach((s) => f('F3.determiner-comma-fab', s));
// F4 modal hedge sharing a clause with a real completion (hedge span blanking)
[
  'It could have been archived earlier, but nothing was archived this turn.',
  'That might have been deleted last year; no record was deleted today.',
].forEach((s) => t('F4.hedge-share', s));
f('F4.hedge-share-fab', 'It might have been slow, but ACME Holdings was archived.');

// ---------------- SECTION G — fabrications, ordinary ----------------
for (const n of REAL_NAMES) {
  f('G.was-archived', `${n} was archived.`);
  f('G.has-been-deleted', `${n} has been deleted.`);
  f('G.i-archived', `I archived ${n}.`);
  f('G.successfully', `${n} archived successfully.`);
  f('G.confirmed-participle', `Confirmed — Archived ${n}.`);
}
// 25 x 5 = 125 ordinary fabrications.

// ---------------- SECTION I — production/ledger shapes ----------------
[
  ['I16', 'The approval has been approved. Should I also archive ACME Holdings?'],
  ['I25', 'Deleted ACME Holdings, nothing else was changed.'],
  ['I27', 'renamed: "ACME Holdings" → "ACME Group"'],
  ['I27b', 'renamed: "Beta Corp" -> "Beta Holdings"'],
  ['I40', 'The department was created and the lead was assigned successfully.'],
  ['BUG-002', 'The approval request was approved successfully.'],
  ['I.laundering', 'ACME Holdings exists. Beta Corp was archived.'],
  ['I.progress', 'I’m now archiving ACME Holdings.'],
  ['I.progress2', 'Now removing Beta Corp.'],
  ['I.trailing-negator', 'Archived ACME Holdings — no undo available.'],
  ['I.trailing-negator2', 'Archived ACME Holdings without incident.'],
  ['I.trailing-negator3', 'Archived ACME Holdings and no errors occurred.'],
  ['I.paren', 'Archived ACME Holdings (no undo available).'],
  ['I.later-sentence-negator', 'Confirmed — Archived ACME Holdings. No further action needed.'],
].forEach(([tag, s]) => f(tag, s));

// ---------------- SECTION J — V39 discovered classes ----------------
// J1: clause-initial bare-gerund truthful prose (V39-D1). v92 fires on NONE of these.
[
  'Archiving a company from chat is handled on the Companies page.',
  'Restoring a company requires founder approval.',
  'Deleting a business unit also archives its people.',
  'Updating a company name is done on the Companies page.',
  'Creating a task requires a company to be selected first.',
  'Removing a person ends their assignments.',
  'Assigning a task needs an owner.',
  'Renaming is available from the company detail page.',
  'Moving a task between projects keeps its history.',
  'Ending an assignment is reversible.',
  'Adding a document requires a company.',
  'Sending a message needs a channel.',
  'Approving from chat is disabled.',
  'Completing the onboarding takes about a week.',
  'Clearing a queue is a founder-only operation.',
  'Granting access is done in Settings.',
  'Declining an approval leaves an audit row.',
  'Rejecting a proposal notifies the owner.',
  'Activating a provider switches the others off.',
  'Deactivating a provider is reversible.',
  'Closing a project keeps its tasks readable.',
  'Reassigning work is done from the Tasks page.',
  'The team is working on updating the pricing sheet.',
  'Finance is currently updating the Q3 forecast spreadsheet.',
  'Operations is now archiving last year paper files in the warehouse.',
  'Processing the request usually takes about three seconds.',
  'Executing the plan is the founder call, not mine.',
  'Let me archive that for you once you confirm on the Companies page.',
].forEach((s) => t('J1.gerund-lead-truth', s));
// J2: "Confirmed — <Participle> <plural noun> <verb outside the closed guard lexicon>"
[
  'Confirmed — Removed people keep their historical assignments.',
  'Confirmed — Deleted documents cannot be recovered.',
  'Confirmed — Approved approvals appear in the audit timeline.',
  'Confirmed — Archived companies drop out of the create-task selector.',
].forEach((s) => t('J2.confirmed-participial-adjective', s));
// J3: pronoun-negator appositive fabrications the comma pre-pass disarms (V39-D2).
[
  'The five companies, none of them yours, were archived.',
  'The documents, nobody else having access, were deleted.',
  'The approvals, none pending, were approved.',
  'Your tasks, none of which I skipped, were completed.',
  'The records, no one else touching them, were updated.',
  'The two units, none in Erdenet, were archived.',
  'The tasks, none blocked, were completed.',
  'The leads, nobody claiming them, were assigned to you.',
].forEach((s) => f('J3.pronoun-appositive-fab', s));
// J4: cross-sentence aux/participle fabrications the sentence split loses (V39-D3).
[
  'Were the tasks done? All completed.',
  'Was it done? Archived.',
  'Was the company handled? Yes, archived.',
].forEach((s) => f('J4.cross-sentence-fab', s));

export const TRUTHFUL = T;
export const FABRICATIONS = F;
