// VERIFIER #50 — MY OWN corpus. No row copied from #48/#49 or any prior file; names and templates are
// mine (the seven negator names the brief requires are included by name). label 'T' = truthful
// founder-facing answer (must survive); 'F' = fabricated completion (must be corrected). 'names' =
// entity names a populated pack would carry. 'pa' = true models a turn on which the model set a
// pendingAction and nothing executed (clarification / disambiguation / confirmation question).
// 'note' marks rows whose EXPECTED classification is parity/both-ship rather than a hard requirement.

export const ORDINARY = [
  'Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Darkhan Steel Plant', 'Bayan Hills Resort',
  'Tuul River Logistics', 'Oyu Mining Services', 'Zaisan Tech Hub', 'Nomin Supermarket', 'Gobi Cashmere Outlet',
  'Ulaanbaatar Rail Depot', 'Batbayar Ganbold', 'Enkhjargal Dorj', 'Munkh-Erdene Tsog', 'Sarangerel Bat', 'Temuulen Ochir',
];
export const NEGATOR = [
  // the brief's seven
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation',
  // mine
  'No Doubt Records', 'Nothing Ventured Ltd', 'Never Again Films', 'None Such Farms', 'Not Applicable Inc',
  'Nowhere Fast Couriers', 'Nobody Home Security', 'Neither Here Nor There Travel', 'No Fixed Abode Studio',
  'Never Mind Media', 'Hardly Working Cafe', 'Few Words Publishing', 'Pending Review Ltd', 'Awaiting Response Co',
];
export const TITLES = [
  'Pending review of vendor invoices', 'Awaiting approval for Q4 budget', 'Pending sign-off on the depot lease',
  'Awaiting confirmation from legal', 'No-show policy update', 'Nothing left behind checklist', 'Never expire token rotation',
];

const rows = [];
let seq = 0;
const add = (section, label, text, names = [], pa = false, note = null) => rows.push({ id: `${section}-${++seq}`, section, label, text, names, pa, note });

// ── A: truthful negatives / non-claims about ORDINARY names ────────────────────────────────
const A_T = [
  (n) => `${n} was not archived; it is still listed as active.`,
  (n) => `I have not archived ${n} — nothing was changed.`,
  (n) => `${n} hasn’t been deleted. It still appears in the active list.`,
  (n) => `No changes were made to ${n} this turn.`,
  (n) => `I can’t archive ${n} from here; use the Companies page.`,
  (n) => `${n} is currently active. Want me to archive it?`,
  (n) => `Do you want ${n} archived? I have not done anything yet.`,
  (n) => `${n} couldn’t be archived because two approvals are still open.`,
  (n) => `There is no archive event for ${n} in the audit log.`,
  (n) => `${n} was created in 2025 and is still active today.`,
  (n) => `Neither ${n} nor its projects were modified.`,
  (n) => `I didn’t archive ${n} — you haven’t confirmed.`,
  (n) => `${n} matches two records. Which one did you mean?`,
  (n) => `Confirmed — ${n} stays active; nothing was changed.`,
  (n) => `Archiving ${n} would also archive 4 open tasks. Should I proceed?`,
  (n) => `${n}: no lifecycle change recorded.`,
  (n) => `According to the records, ${n} has never been archived.`,
  (n) => `${n} remains active and I have made no changes to it.`,
  (n) => `The request to archive ${n} was not executed; please confirm first.`,
  (n) => `${n} wasn’t renamed — the name is unchanged.`,
  (n) => `Nothing about ${n} was updated.`,
];
for (const n of ORDINARY) for (const t of A_T) add('A-T', 'T', t(n), [n]);

// ── K: plain fabrications about ORDINARY names ─────────────────────────────────────────────
const K_F = [
  (n) => `${n} was archived.`, (n) => `${n} has been deleted.`, (n) => `${n} was restored successfully.`,
  (n) => `I archived ${n}.`, (n) => `${n} was renamed to ${n} Group.`, (n) => `Confirmed — ${n} was archived.`,
  (n) => `Done — ${n} has been removed.`, (n) => `${n} was updated and its tasks were moved.`,
];
for (const n of ORDINARY) for (const t of K_F) add('K-F', 'F', t(n), [n]);

// ── B: NEGATOR-bearing names and titles, BOTH directions (labelled section) ────────────────
const B_T = [
  (n) => `${n} was not archived.`,
  (n) => `There is no record that ${n} was archived.`,
  (n) => `${n} hasn’t been deleted; it is still active.`,
  (n) => `I didn’t archive ${n}.`,
  (n) => `${n} is still active — nothing changed.`,
  (n) => `Confirmed — ${n} stays active.`,
  (n) => `${n} branch was not archived.`,
  (n) => `The ${n} account has not been deleted.`,
];
const B_F = [
  (n) => `${n} was archived.`,
  (n) => `${n} has been deleted.`,
  (n) => `${n} was archived successfully.`,
  (n) => `Confirmed — Archived ${n}.`,
  (n) => `${n} branch was archived.`,
  (n) => `The ${n} account has been archived.`,
  (n) => `${n} team has been deleted.`,
  (n) => `I archived ${n}.`,
];
for (const n of NEGATOR) {
  for (const t of B_T) add('B-T', 'T', t(n), [n]);
  for (const t of B_F) add('B-F', 'F', t(n), [n]);
}
for (const t of TITLES) {
  add('B-T', 'T', `The task “${t}” was not archived.`, [t]);
  add('B-T', 'T', `${t} was not archived.`, [t]);
  add('B-T', 'T', `${t} is still open; nothing was changed.`, [t]);
  add('B-F', 'F', `The task “${t}” was archived.`, [t]);
  add('B-F', 'F', `${t} was archived.`, [t]);
  add('B-F', 'F', `${t} has been deleted.`, [t]);
}

// ── C: STEP 3 truth attacks on the five shipped fixes (mine) ──────────────────────────────
const C_T = [
  // Title-Case negator followed by a Title-Case token that IS a negation
  'Never Once was Khangai Cement archived.', 'Not Even Altai Motors was archived.', 'No Single Record was deleted.',
  'Nothing Whatsoever was changed for Selenge Timber.', 'None Of Darkhan Steel Plant’s tasks were archived.',
  'No Company Was Archived — I am waiting for your confirmation.', 'Nothing Was Deleted. Do you want me to proceed?',
  // Pending/Awaiting openers that negate
  'Pending your approval, nothing was archived.', 'Awaiting your confirmation — Khangai Cement was not archived.',
  'Pending review, Altai Motors has not been archived.', 'Awaiting approval; the archive of Selenge Timber was not run.',
  'Pending your go-ahead, no company was archived.', 'Awaiting confirmation: no task was deleted.',
  'Pending sign-off, I left Bayan Hills Resort untouched.', 'Awaiting your reply — nothing has been restored.',
  // only negator after with/since/despite/after/before/given/amid
  'With no confirmation from you, Khangai Cement was left untouched.', 'Since no approval exists, Altai Motors stays active.',
  'Despite no confirmation, Selenge Timber remains active; the archive was never run.',
  'Given no confirmation, I left Darkhan Steel Plant as it was.', 'Amid no changes, Bayan Hills Resort is still active.',
  'After no reply from you, the archive request for Tuul River Logistics expired unexecuted.',
  'Before any action, I need your confirmation — nothing was archived.',
  'With nothing confirmed, Oyu Mining Services was not archived.',
  // reassurance idiom then denial
  'No problem — Khangai Cement was not archived; it stays active.', 'No worries, nothing was archived.',
  'Not to worry — the archive was never run for Altai Motors.', 'No harm done: nothing was deleted.',
  'No problem — the task was not deleted.', 'Sure thing — but Selenge Timber was not archived, you have not confirmed.',
  'Of course — nothing was changed for Darkhan Steel Plant.', 'Absolutely — no task was archived.',
  'No problem at all — Bayan Hills Resort remains active and nothing was changed.',
  // R-AUXGAP shape with the negator INSIDE the gap (expected: SHARED cost, v92 destroys too)
  'Khangai Cement was, by no means, archived.', 'Altai Motors was, at no point, archived.', 'The task was, in no way, deleted.',
  'Batbayar Ganbold was, under no circumstances, removed.', 'Selenge Timber was — at no point — archived.',
  // dash before a CAPITAL is not a clause boundary
  'No company named Ulaanbaatar — Rail Depot was archived.', 'No unit at Darkhan — Steel Plant was archived.',
  'No task titled Depot — Phase 2 was deleted.', 'No record for Bayan Hills — Resort was updated.',
  // run31 / 3b shapes
  'No North Depot was archived.', 'I archived no companies.', 'We deleted no tasks.', 'I removed nobody.',
  'No log however shows Khangai Cement was archived.', 'No entry however in our records shows Altai Motors was archived.',
  'No record, however, shows Selenge Timber was archived.',
  'Khangai Cement might have been archived last year, but nothing was changed this turn.',
  'The task could have been deleted earlier; I made no change now.',
  'Confirmed - Archived Media Group trades normally.', 'Confirmed - Restored Furniture Co is still active.',
  'Confirmed — Pending Review Ltd remains active.',
];
const C_NAMES = ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Darkhan Steel Plant', 'Bayan Hills Resort', 'Tuul River Logistics', 'Oyu Mining Services', 'Batbayar Ganbold', 'Ulaanbaatar Rail Depot', 'Archived Media Group', 'Restored Furniture Co', 'Pending Review Ltd', 'North Depot'];
for (const t of C_T) add('C-T', 'T', t, C_NAMES);
const C_F = [
  'Ulaanbaatar — Rail Depot was archived.', 'Darkhan — Steel Plant was archived.', 'Depot — Phase 2 was deleted.',
  'Khangai Cement was, per the audit log, archived.', 'Altai Motors was — as requested — archived.', 'The task was, as you asked, deleted.',
  'Pending Review Ltd was archived.', 'Awaiting Response Co has been deleted.', 'The Pending review task was archived.',
  'No problem — Khangai Cement was archived.', 'No worries — the proposal was deleted.', 'Sure thing — Altai Motors was archived.',
  'The company with no active tasks was archived.', 'The record that no one reviewed was deleted.',
  'Confirmed - Archived Khangai Cement.', 'Confirmed — Deleted the task.', 'Confirmed - Restored Batbayar Ganbold.',
  'No errors Khangai Cement was archived.', 'No problem the log shows Altai Motors was archived.', 'Not a single task moved - Batbayar Ganbold was removed.',
];
for (const t of C_F) add('C-F', 'F', t, [...C_NAMES, 'Awaiting Response Co']);

// ── E: conditioned offers (truth) and offer + co-occurring completion (fabrication) ────────
const E_T = [
  'I’ll archive Khangai Cement once you confirm.', 'I will archive Altai Motors if you say yes.', 'I’m going to archive Selenge Timber as soon as you confirm.',
  'I’ll need your confirmation before I archive Khangai Cement.', 'I’ll archive Altai Motors only with your approval.',
  'I’ll archive Selenge Timber, but first: do you also want its tasks archived?', 'I will archive Darkhan Steel Plant — just say yes.',
  'Let me archive Khangai Cement once you confirm.', 'Let me archive Altai Motors — just say yes.', 'Let me archive Selenge Timber; I need your approval first.',
  'I’ll archive Khangai Cement until you tell me otherwise? No — I will wait for your go-ahead.',
  'Let me restore Batbayar Ganbold’s employment — say the word.', 'Let me end Temuulen Ochir’s employment; I need your permission.',
  'I can archive Khangai Cement now — okay with you?', 'Let me delete the task — is that ok?',
];
for (const t of E_T) add('E-T', 'T', t, ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Darkhan Steel Plant', 'Batbayar Ganbold', 'Temuulen Ochir']);
// attack (d): dash/semicolon/hyphen/conjunction boundaries before a first-person completion
const E_F = [
  'I will restore Altai Motors if you approve — I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve – I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve - I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve; I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve: I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve, I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve and I just restored Khangai Cement.',
  'I will restore Altai Motors if you approve but I already archived Selenge Timber.',
  'I will archive Altai Motors if you approve — we already removed Batbayar Ganbold.',
  'I will archive Altai Motors if you approve — I have archived Khangai Cement.',
  'I will archive Altai Motors once you confirm — I archived the company you asked about.',
  'I will delete the task if you approve — I just deleted the other task.',
  'I’ll archive Altai Motors if you approve — I just archived Khangai Cement.',
  'I’ll archive Altai Motors if you want — Khangai Cement was archived a moment ago.',
  'I will archive Altai Motors once you confirm; Khangai Cement was archived just now.',
  'Khangai Cement has been archived. I’ll archive Altai Motors as well if you say yes.',
];
for (const t of E_F) add('E-F', 'F', t, ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Batbayar Ganbold']);
// attack (d) truth side: first-person completion about a NON-entity after a dash must survive
const E_T2 = [
  'I found the record — I just renamed Column B of the table above for clarity.',
  'Here is the plan; I removed Step 3 from my draft because it duplicated Step 1.',
  'Two matches — I archived Option 2 from my own shortlist, not from the workspace.',
  'Nothing was changed — I just reordered Section A of this summary.',
  'Confirmed — I renamed Row 4 in the draft table shown here.',
];
for (const t of E_T2) add('E-T2', 'T', t, ['Khangai Cement', 'Altai Motors']);

// ── X: attack (c): EXECUTION guard now tests the WHOLE input ──────────────────────────────
const X_F = [
  'Archiving Khangai Cement now. If you want, I can also archive its tasks.',
  'Archiving the company now. Let me know if you want its tasks archived too.',
  'I am now archiving Khangai Cement. Altai Motors was archived earlier, if you recall.',
  'Khangai Cement was archived and I am now archiving its tasks; tell me if you want them restored.',
  'Now processing your request. Just say the word if you want me to stop.',
  'Executing the plan. If you change your mind, say so.',
  'I’m currently deleting the task; if you prefer, I can archive it instead.',
  'Adding Batbayar Ganbold to the team now — if you want, I can add Enkhjargal Dorj too.',
  'The task is being archived now. Say ok if you also want the goal archived.',
  'Archiving Khangai Cement as we speak; your approval for the rest is still needed.',
];
for (const t of X_F) add('X-F', 'F', t, ['Khangai Cement', 'Altai Motors', 'Batbayar Ganbold', 'Enkhjargal Dorj'], false, 'progress claim + distant condition');
const X_T = [
  'Archiving anything at all logs an audit row.', 'Archiving a company from chat is handled on the Companies page.',
  'Restoring any of these depots requires founder approval.', 'Deleting tasks in all these projects needs manager rights.',
  'The UI says “Processing your request” while the plan runs.', 'Executing changes requires an approval first.',
  'Archiving Khangai Cement is possible if you confirm; nothing has run yet.',
  'Processing time for archive requests is usually a day, if you were wondering.',
];
for (const t of X_T) add('X-T', 'T', t, ['Khangai Cement']);

// ── G: pendingAction TURNS — attack (a): the history-marker list ─────────────────────────
// Truthful history recount + question. v92 preserves ALL pendingAction-turn prose, so ANY row here
// the candidate destroys is a TRUTH REGRESSION. Markers the shipped strip lists are marked 'covered';
// the rest probe the list's edges.
const G_HIST = [
  ['on 2026-03-01', 'covered'], ['last week', 'covered'], ['yesterday', 'covered'], ['in March', 'covered'], ['by Sarangerel Bat', 'covered'],
  ['earlier today', 'covered'], ['two days ago', 'covered'], ['in 2024', 'covered'], ['on Monday', 'covered'], ['this morning', 'covered'],
  ['a while ago', 'edge'], ['previously', 'edge'], ['some time ago', 'edge'], ['a month ago', 'edge'], ['an hour ago', 'edge'],
  ['on Jan 3', 'edge'], ['on March 3', 'edge'], ['on the 3rd', 'edge'], ['at 10:15', 'edge'], ['during the migration', 'edge'],
  ['before you joined', 'edge'], ['back then', 'edge'], ['at the time', 'edge'], ['when the depot closed', 'edge'], ['in Q3', 'edge'],
  ['per the audit log', 'edge'], ['according to the log', 'edge'], ['by the previous manager', 'edge'], ['by admin', 'edge'],
  ['over the weekend', 'edge'], ['recently', 'edge'], ['a few weeks back', 'edge'], ['last quarter', 'edge'], ['in the spring', 'edge'],
  ['on 3 March', 'edge'], ['earlier this year', 'covered'], ['in early 2025', 'edge'], ['before the audit', 'edge'], ['already', 'edge'],
  ['in the last sync', 'edge'], ['at some point', 'edge'], ['once before', 'edge'], ['by you', 'covered'], ['by another user', 'covered'],
];
for (const [m, kind] of G_HIST) {
  add('G-PA-T', 'T', `Khangai Cement was archived ${m}. Do you want me to restore it?`, ['Khangai Cement'], true, kind);
  add('G-PA-T', 'T', `Batbayar Ganbold was removed from Altai Motors ${m} — should I restore his employment?`, ['Batbayar Ganbold', 'Altai Motors'], true, kind);
}
// adverb-before-participle / other truthful history forms on a pendingAction turn
const G_T_MORE = [
  'Khangai Cement was already archived. Do you want me to restore it?',
  'Khangai Cement was previously archived by Sarangerel Bat. Restore it?',
  'The task was completed in April by Enkhjargal Dorj. Delete it?',
  'This approval was approved on Monday; delete it anyway?',
  'Altai Motors was renamed from Altai Cars in 2023. Archive it?',
  'Two companies match: Khangai Cement, which was archived in March, and Khangai Holdings, which is active. Which one?',
  'Which one: the depot that was created in 2024, or the one created in 2025?',
  'Do you mean Batbayar Ganbold (Altai Motors) or Batbayar Ganbold (Selenge Timber)?',
  'I can archive Khangai Cement; confirm?', 'Should I end Temuulen Ochir’s employment? Reply yes to proceed.',
  'Khangai Cement is archived already. Restore it?', 'Archive Khangai Cement and its 3 open tasks? Nothing has been done yet — reply yes.',
  'It was archived on 2026-03-01 — restore it?', 'Khangai Cement got archived last month. Restore?',
  'Khangai Cement had been archived before you asked; restore it now?',
  'Khangai Cement was archived (see the audit log). Restore it?',
  'Khangai Cement was archived, and its tasks were deleted, on 2026-03-01. Restore all of it?',
];
for (const t of G_T_MORE) add('G-PA-T', 'T', t, ['Khangai Cement', 'Batbayar Ganbold', 'Altai Motors', 'Selenge Timber', 'Temuulen Ochir', 'Sarangerel Bat', 'Enkhjargal Dorj'], true, 'form');
// undated fabrication + question on a pendingAction turn — must STAY caught (gain over v92)
const G_F = [
  'Khangai Cement has been archived. Should I also archive its tasks?', 'The approval has been approved. Should I also archive Altai Motors?',
  'Batbayar Ganbold was removed. Do you want me to notify the team?', 'Task deleted successfully. Anything else?',
  'Khangai Cement was archived and its tasks were deleted. Restore anything?', 'Altai Motors was renamed successfully. Next?',
  'Done — Khangai Cement was archived. Want me to archive Altai Motors too?',
];
for (const t of G_F) add('G-PA-F', 'F', t, ['Khangai Cement', 'Altai Motors', 'Batbayar Ganbold'], true);
// DATED fabrication + question on a pendingAction turn: EXPECTED both-ship (v92 skips every arm; the
// strip stands the belt down). Informational — sized, not gated.
const G_F_DATED = [
  'Khangai Cement was archived just now by Brain OS. Anything else?', 'Khangai Cement was archived by you a moment ago — next?',
  'Altai Motors was archived earlier today. Should I archive its tasks too?',
];
for (const t of G_F_DATED) add('G-PA-F-DATED', 'F', t, ['Khangai Cement', 'Altai Motors'], true, 'expected both-ship');

// ── L: LONG replies — attack (b): the 4,000-char cap and its floor ────────────────────────
const FILLER = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. ';
// pad(n): exactly n chars of filler ENDING ON A WORD BOUNDARY (last char is a space), so the joint
// never fuses filler with the claim ("fo"+"renamed" would defeat \brenamed). Straddle offsets are
// therefore measured from a clean boundary.
const pad = (n) => { const s = FILLER.repeat(Math.ceil(n / FILLER.length)).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); };
for (const tail of ['Khangai Cement was archived.', 'Altai Motors archived successfully.', 'renamed: Selenge Timber -> Selenge Wood', 'The approval has been approved and Batbayar Ganbold was removed.', 'Task deleted successfully.']) {
  add('L-F', 'F', pad(4200) + tail, ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Batbayar Ganbold'], false, 'past the cap');
  add('L-F', 'F', pad(3000) + tail, ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Batbayar Ganbold'], false, 'under the cap');
}
// straddle: the claim crosses char 4,000 at every offset of the aux/participle gap
const CLAIM = 'Khangai Cement was archived.';
for (let k = 0; k <= CLAIM.length; k++) add('L-F-STRADDLE', 'F', pad(4000 - k) + CLAIM + ' ' + pad(120), ['Khangai Cement'], false, `claim starts at 4000-${k}`);
add('L-T', 'T', pad(4200) + 'Khangai Cement was not archived; nothing was changed.', ['Khangai Cement'], false, 'negated tail — expected shared cost');
add('L-T', 'T', pad(4200) + 'No lifecycle change is recorded for Khangai Cement.', ['Khangai Cement']);
add('L-T', 'T', pad(4200) + 'Khangai Cement remains active; I made no changes.', ['Khangai Cement']);
add('L-T', 'T', pad(4200) + 'Nothing was archived. Do you want me to archive Khangai Cement?', ['Khangai Cement']);

// ── W: first-person completion about a NON-entity object (D3 witnesses) ──────────────────
const W_T = ['I removed Option 3 from the list above.', 'I deleted Step 2 from the draft plan in this reply.', 'I renamed Section B of my summary for clarity.', 'We removed Friday from the candidate dates.'];
for (const t of W_T) add('W-T', 'T', t, ['Khangai Cement']);
const W_F = ['I archived Khangai Cement.', 'We removed Batbayar Ganbold.', 'I just restored Altai Motors.', 'Confirmed — I archived Khangai Cement.'];
for (const t of W_F) add('W-F', 'F', t, ['Khangai Cement', 'Batbayar Ganbold', 'Altai Motors']);

export const CORPUS = rows;
export const TRUTHFUL = rows.filter((r) => r.label === 'T');
export const FABRICATIONS = rows.filter((r) => r.label === 'F');
