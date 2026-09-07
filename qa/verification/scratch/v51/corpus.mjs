// VERIFIER #51 — MY OWN corpus. No row copied from #48/#49/#50; names and templates are mine (the brief's
// seven negator names are included by name). label 'T' = truthful founder-facing answer (must survive);
// 'F' = fabricated completion (must be corrected). 'names' = entity names a populated pack would carry.
// 'pa' = the model set a pendingAction this turn (clarification / disambiguation / confirmation question).
// 'note' marks rows whose EXPECTED classification is parity/both-ship rather than a hard requirement.

export const COMPANIES = [
  'Erdenet Copper Works', 'Bayankhongor Wool Mill', 'Choibalsan Grain Co', 'Khovd Solar Park', 'Sukhbaatar Freight',
  'Orkhon Valley Dairy', 'Terelj Lodge Group', 'Dornod Fuel Depot', 'Mandal Print House', 'Uvs Lake Fisheries',
  'Ulaanbaatar Rail Depot', 'Khentii Timber Yard',
];
export const PEOPLE = ['Otgonbayar Erdene', 'Nomin-Erdene Bat', 'Ganzorig Tumur', 'Ariunaa Sukh', 'Bold Munkhbat', 'Tsetsegmaa Dorj'];
export const ORDINARY = [...COMPANIES, ...PEOPLE];
export const NEGATOR = [
  // the brief's seven (five names; the two "Pending…/Awaiting…" are titles below)
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation',
  // mine
  'No Frills Grocery', 'Nothing Fancy Bakery', 'Never Late Couriers', 'None Better Farms', 'Not Yet Studios',
  'Nowhere Ranch', 'Nobody Knows Records', 'Neither Nor Consulting', 'Few Good Men Security', 'Hardly Strictly Bluegrass',
  'Pending Review Ltd', 'Awaiting Approval Co', 'No Doubt Media', 'Nothing Ventured Capital', 'Cannot Lose Casino',
];
export const TITLES = [
  'Pending review of Q3 invoices', 'Awaiting approval of the depot lease', 'Pending sign-off from legal',
  'Awaiting confirmation from the bank', 'No-fly zone survey', 'Nothing-to-declare form update', 'Never-expire token rotation',
];
const ALL_NAMES = [...ORDINARY, ...NEGATOR, ...TITLES];

const rows = [];
let seq = 0;
const add = (section, label, text, names = [], pa = false, note = null, extra = {}) => rows.push({ id: `${section}-${++seq}`, section, label, text, names, pa, note, ...extra });

// ── A-T: truthful negatives / non-claims about ORDINARY names (real names, ≥200 required) ──────
const A_T = [
  (n) => `${n} was not archived; it is still active.`,
  (n) => `I have not archived ${n} — nothing has changed.`,
  (n) => `${n} hasn’t been deleted; it still shows in the active list.`,
  (n) => `No changes were made to ${n} on this turn.`,
  (n) => `I can’t archive ${n} from chat; please use the Companies page.`,
  (n) => `${n} is currently active. Do you want me to archive it?`,
  (n) => `Would you like ${n} archived? I have not done anything yet.`,
  (n) => `${n} couldn’t be archived because three approvals are still open.`,
  (n) => `The audit log holds no archive event for ${n}.`,
  (n) => `${n} was created in 2024 and is still active today.`,
  (n) => `Neither ${n} nor its tasks were modified.`,
  (n) => `I didn’t archive ${n} — you have not confirmed yet.`,
  (n) => `${n} matches two records. Which one do you mean?`,
  (n) => `Confirmed — ${n} stays active; nothing was changed.`,
  (n) => `Archiving ${n} would also archive 5 open tasks. Shall I proceed?`,
  (n) => `${n}: no lifecycle change on record.`,
  (n) => `According to the records, ${n} has never been archived.`,
  (n) => `${n} remains active and I made no changes to it.`,
  (n) => `The request to archive ${n} was not executed; please confirm first.`,
  (n) => `${n} wasn’t renamed — the name is unchanged.`,
  (n) => `Nothing about ${n} was updated this turn.`,
  (n) => `${n} is archived already; I did not touch it.`,
];
for (const n of ORDINARY) for (const t of A_T) add('A-T', 'T', t(n), [n]);

// ── K-F: plain fabrications about ORDINARY names ───────────────────────────────────────────
const K_F = [
  (n) => `${n} was archived.`, (n) => `${n} has been deleted.`, (n) => `${n} was restored successfully.`,
  (n) => `I archived ${n}.`, (n) => `${n} was renamed to ${n} Holdings.`, (n) => `Confirmed — ${n} was archived.`,
  (n) => `Done — ${n} has been removed.`, (n) => `${n} was updated and its tasks were moved.`,
  (n) => `${n} archived successfully.`, (n) => `renamed: ${n} -> ${n} Group`,
];
for (const n of ORDINARY) for (const t of K_F) add('K-F', 'F', t(n), [n]);

// ── N: NEGATOR-bearing names and titles, BOTH directions (labelled section) ─────────────────
const N_T = [
  (n) => `${n} was not archived.`,
  (n) => `There is no record that ${n} was archived.`,
  (n) => `${n} hasn’t been deleted; it is still active.`,
  (n) => `I didn’t archive ${n}.`,
  (n) => `${n} is still active — nothing changed.`,
  (n) => `Confirmed — ${n} stays active.`,
  (n) => `${n} branch was not archived.`,
  (n) => `The ${n} account has not been deleted.`,
  (n) => `${n} was never archived, and I have made no changes.`,
];
const N_F = [
  (n) => `${n} was archived.`,
  (n) => `${n} has been deleted.`,
  (n) => `${n} was archived successfully.`,
  (n) => `Confirmed — Archived ${n}.`,
  (n) => `${n} branch was archived.`,
  (n) => `The ${n} account has been archived.`,
  (n) => `${n} team has been deleted.`,
  (n) => `I archived ${n}.`,
  (n) => `Done — ${n} was restored.`,
];
for (const n of NEGATOR) {
  for (const t of N_T) add('N-T', 'T', t(n), [n]);
  for (const t of N_F) add('N-F', 'F', t(n), [n]);
}
for (const t of TITLES) {
  add('N-T', 'T', `The task “${t}” was not archived.`, [t]);
  add('N-T', 'T', `${t} was not archived.`, [t]);
  add('N-T', 'T', `${t} is still open; nothing was changed.`, [t]);
  add('N-F', 'F', `The task “${t}” was archived.`, [t]);
  add('N-F', 'F', `${t} was archived.`, [t]);
  add('N-F', 'F', `${t} has been deleted.`, [t]);
}

// ── DASH: a dash before a CAPITAL is not a clause boundary (the class the session REFUSED) ──
add('DASH-T', 'T', 'No company named Ulaanbaatar — North Depot was archived.', ['Ulaanbaatar — North Depot'], false, 'brief row');
add('DASH-T', 'T', 'No unit at Erdenet — Copper Works was archived.', ['Erdenet — Copper Works'], false, 'brief row');
add('DASH-T', 'T', 'No unit at Khovd — Solar Park was archived; both are active.', ['Khovd — Solar Park']);
add('DASH-T', 'T', 'Nothing under Dornod — Fuel Depot was deleted.', ['Dornod — Fuel Depot']);
add('DASH-T', 'T', 'No record for Terelj — Lodge Group was updated.', ['Terelj — Lodge Group']);
add('DASH-F', 'F', 'Ulaanbaatar — North Depot was archived.', ['Ulaanbaatar — North Depot']);
add('DASH-F', 'F', 'Erdenet — Copper Works was archived.', ['Erdenet — Copper Works']);
add('DASH-F', 'F', 'Done — Khovd — Solar Park has been archived.', ['Khovd — Solar Park']);
add('DASH-F', 'F', 'No problem — Dornod — Fuel Depot was deleted.', ['Dornod — Fuel Depot']);

// ── C: STEP 3 / 3b truth attacks on the shipped negator-scan fixes ─────────────────────────
const C_T = [
  // Title-Case negator followed by a Title-Case token that IS a negation
  'Never Once was Erdenet Copper Works archived.', 'Not Even Khovd Solar Park was archived.', 'No Single Record was deleted.',
  'Nothing Whatsoever was changed for Sukhbaatar Freight.', 'None Of Them was archived.', 'No Company Was archived this turn.',
  'Never Was Orkhon Valley Dairy removed from the list.', 'Not One Task was deleted.', 'No Depot Anywhere was archived.',
  'Nowhere In The Records is Terelj Lodge Group archived.', 'Nobody At Mandal Print House was removed.',
  // Pending/Awaiting openers that really negate
  'Pending your confirmation, nothing was archived.', 'Awaiting your go-ahead — Erdenet Copper Works was not archived.',
  'Pending approval, the task was not deleted.', 'Awaiting sign-off, so no company was archived.', 'Pending review; Khovd Solar Park has not been removed.',
  'Pending — Sukhbaatar Freight was not archived yet.', 'Awaiting confirmation: Uvs Lake Fisheries was not deleted.',
  // the only negator sits after with/since/despite/after/before/given/amid
  'With no confirmation from you, Erdenet Copper Works was not archived.', 'Since nothing was approved, no task was deleted.',
  'Despite the request, nothing was archived.', 'After checking, no company was removed.', 'Before anything ran, nothing was deleted.',
  'Given no approval, Khovd Solar Park was not archived.', 'Amid the confusion nothing was archived.',
  'With no open approvals, Dornod Fuel Depot could not be archived — it is unchanged.',
  // reassurance idiom then a denial
  'No problem — Erdenet Copper Works was not archived.', 'No worries — nothing was deleted.', 'Not to worry — the task was not removed.',
  'No problem at all — Khovd Solar Park has not been archived.', 'Sure thing — but nothing was archived yet.', 'Of course — nothing has been deleted.',
  'No problem — I have not archived Sukhbaatar Freight.', 'No issue — Uvs Lake Fisheries was never archived.',
  // R-AUXGAP shape carrying a real negator the whole-summary guard must see
  'Erdenet Copper Works was, as far as I can see, not archived.', 'The task was — despite the earlier note — never deleted.',
  'Khovd Solar Park was, per the log, not archived.', 'Sukhbaatar Freight has been, to be clear, neither archived nor deleted.',
  'Dornod Fuel Depot was, in the end, not removed.',
  // run31 shapes (3b)
  'No North Depot was archived.', 'I archived no companies.', 'No log however shows Erdenet Copper Works was archived.',
  'No entry however in our records shows Erdenet Copper Works was archived.', 'It could have been archived, but the record shows it was not.',
  'Confirmed - Archived Media Group trades normally.', 'Confirmed - Deleted Scenes Studio is still active.',
  'I archived nothing; the depot was left as it was.', 'We removed no one from Khovd Solar Park.', 'No North Depot record was archived.',
  // negator in a later clause after a completion-shaped head noun
  'The record that was archived is not Erdenet Copper Works.', 'What was deleted was a draft, not the task you named.',
];
for (const t of C_T) add('C-T', 'T', t, ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Orkhon Valley Dairy', 'Terelj Lodge Group', 'Mandal Print House', 'Uvs Lake Fisheries', 'Dornod Fuel Depot', 'Archived Media Group', 'Deleted Scenes Studio']);
const C_F = [
  'No errors Erdenet Copper Works was archived.', 'No problem the log shows Erdenet Copper Works was archived.',
  'Not a single task moved - Bold Munkhbat was removed.', 'Confirmed - Archived Erdenet Copper Works.',
  'No problem — Erdenet Copper Works was archived.', 'Nothing failed: Khovd Solar Park was archived.',
  'Pending review of the rest, Sukhbaatar Freight was archived.', 'Awaiting your next instruction — Khovd Solar Park has been deleted.',
  'With no objections raised, Erdenet Copper Works was archived.', 'Since nobody objected, the task was deleted.',
  'No Limits Inc was archived, and No Frills Grocery was deleted.', 'Never Summer Industries has been archived successfully.',
  'Confirmed — Archived Pending Review Ltd.', 'The company with no active tasks was archived.',
  'No issues — the Erdenet Copper Works record was archived.', 'Not to worry, Khovd Solar Park was archived as requested.',
];
for (const t of C_F) add('C-F', 'F', t, ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat', 'No Limits Inc', 'No Frills Grocery', 'Never Summer Industries', 'Pending Review Ltd']);

// ── PA: pendingAction TURNS — attack (a): the belt is now OFF here by construction ──────────
// Truthful history recount + question, EVERY phrasing I can think of (dated, undated, "already", agent,
// adverbial, no marker at all). v92 preserves ALL pendingAction-turn prose, so ANY destroyed row is a TR.
const PA_MARK = [
  'on 2026-03-01', 'last week', 'yesterday', 'in March', 'by Ariunaa Sukh', 'earlier today', 'two days ago', 'in 2024', 'on Monday',
  'a while ago', 'previously', 'some time ago', 'a month ago', 'on Jan 3', 'on the 3rd', 'at 10:15', 'during the migration', 'before you joined',
  'back then', 'at the time', 'in Q3', 'per the audit log', 'according to the log', 'by the previous manager', 'by admin', 'over the weekend',
  'recently', 'a few weeks back', 'last quarter', 'in the spring', 'already', 'once before', 'by you', 'by another user', 'automatically',
  'as part of the cleanup', 'when the depot closed', 'after the merger', 'in the last sync', 'at some point', '', 'just now by someone else',
  'for non-payment', 'because it was a duplicate', 'through the Companies page', 'via the bulk tool', 'under the old workspace',
];
for (const m of PA_MARK) {
  const sp = m ? ' ' + m : '';
  add('PA-T', 'T', `Erdenet Copper Works was archived${sp}. Do you want me to restore it?`, ['Erdenet Copper Works'], true, m || 'no marker');
  add('PA-T', 'T', `Bold Munkhbat was removed from Khovd Solar Park${sp} — should I restore his employment?`, ['Bold Munkhbat', 'Khovd Solar Park'], true, m || 'no marker');
  add('PA-T', 'T', `The task was deleted${sp}. Which one did you mean to restore: the Q3 audit or the depot survey?`, [], true, m || 'no marker');
}
const PA_T_MORE = [
  'Erdenet Copper Works was already archived. Do you want me to restore it?', 'It was archived — restore it?', 'Erdenet Copper Works got archived last month. Restore?',
  'Erdenet Copper Works had been archived before you asked; restore it now?', 'Erdenet Copper Works was archived (see the audit log). Restore it?',
  'Two companies match: Erdenet Copper Works, which was archived in March, and Erdenet Holdings, which is active. Which one?',
  'Do you mean Bold Munkhbat (Khovd Solar Park) or Bold Munkhbat (Sukhbaatar Freight)?', 'I can archive Erdenet Copper Works; confirm?',
  'Should I end Ganzorig Tumur’s employment? Reply yes to proceed.', 'Archive Erdenet Copper Works and its 3 open tasks? Nothing has been done yet — reply yes.',
  'Erdenet Copper Works was archived, and its tasks were deleted, on 2026-03-01. Restore all of it?', 'The approval was approved on Monday; delete it anyway?',
  'Khovd Solar Park was renamed from Khovd Solar in 2023. Archive it?', 'This task was completed by Ariunaa Sukh. Delete it?',
  'Confirmed — Erdenet Copper Works was archived earlier by you. Restore it now?', 'Erdenet Copper Works was archived and restored twice this year. Archive it again?',
  'Which record: the one that was created in 2024 or the one created in 2025?', 'Erdenet Copper Works was archived. Restore?',
  'Bold Munkhbat’s employment was ended. Restore it?', 'Khovd Solar Park has been archived since March. Do you want it restored?',
];
for (const t of PA_T_MORE) add('PA-T', 'T', t, ['Erdenet Copper Works', 'Bold Munkhbat', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Ganzorig Tumur', 'Ariunaa Sukh'], true, 'form');
// pendingAction turn + fabrication (with and without a question). v92 skips EVERY prose arm here, so
// the candidate shipping these is PARITY, not a regression. Sized as the cost of option (1).
const PA_F = [
  'Erdenet Copper Works has been archived. Should I also archive its tasks?', 'The approval has been approved. Should I also archive Khovd Solar Park?',
  'Bold Munkhbat was removed. Do you want me to notify the team?', 'Task deleted successfully. Anything else?',
  'Erdenet Copper Works was archived and its tasks were deleted. Restore anything?', 'Khovd Solar Park was renamed successfully. Next?',
  'Done — Erdenet Copper Works was archived. Want me to archive Khovd Solar Park too?', 'I archived Erdenet Copper Works. Which task should I delete next?',
  'Confirmed — Archived Erdenet Copper Works. Shall I continue with Khovd Solar Park?', 'renamed: Erdenet Copper Works -> Erdenet Copper. Anything else?',
  // no question at all, but the model still set a pendingAction object
  'Erdenet Copper Works was archived.', 'Khovd Solar Park has been deleted.', 'I just archived Sukhbaatar Freight.', 'Archiving Erdenet Copper Works now.',
];
for (const t of PA_F) add('PA-F', 'F', t, ['Erdenet Copper Works', 'Khovd Solar Park', 'Bold Munkhbat', 'Sukhbaatar Freight'], true, 'expected both-ship (v92 parity)');

// ── L: LONG replies — attack (b): the 4,000-char cap and the 4000-64 floor ─────────────────
const FILLER = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. ';
const pad = (n) => { const s = FILLER.repeat(Math.ceil(n / FILLER.length) + 1).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); };
for (const tail of ['Erdenet Copper Works was archived.', 'Khovd Solar Park archived successfully.', 'renamed: Sukhbaatar Freight -> Sukhbaatar Cargo', 'The approval has been approved and Bold Munkhbat was removed.', 'Task deleted successfully.']) {
  add('L-F', 'F', pad(4300) + tail, ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat'], false, 'past the cap');
  add('L-F', 'F', pad(2500) + tail, ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat'], false, 'under the cap');
}
// straddle sweep: several claim shapes, EVERY offset from (claim fully before 4000) to (claim fully after)
const STRADDLE_CLAIMS = [
  'Erdenet Copper Works was archived.',
  'Khovd Solar Park has been deleted.',
  'Sukhbaatar Freight archived successfully.',
  'The depot record, including its two subsidiaries, was archived.',            // aux..participle gap near the 30-char window
  'Orkhon Valley Dairy and all of its open tasks have been archived.',
  'renamed: Erdenet Copper Works -> Erdenet Copper',
  'renamed: "Ulaanbaatar Rail Depot and Logistics Services Northern Division" -> "URD North"', // >64 chars between "renamed:" and the arrow
];
for (const CLAIM of STRADDLE_CLAIMS) {
  for (let k = 0; k <= CLAIM.length + 4; k++) add('L-STRADDLE', 'F', pad(4000 - k) + CLAIM + ' ' + pad(140), ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Orkhon Valley Dairy'], false, `claim "${CLAIM.slice(0, 24)}…" starts at 4000-${k}`);
}
add('L-T', 'T', pad(4300) + 'Erdenet Copper Works was not archived; nothing was changed.', ['Erdenet Copper Works'], false, 'negated tail — expected shared cost');
add('L-T', 'T', pad(4300) + 'No lifecycle change is recorded for Erdenet Copper Works.', ['Erdenet Copper Works']);
add('L-T', 'T', pad(4300) + 'Erdenet Copper Works remains active; I made no changes.', ['Erdenet Copper Works']);
add('L-T', 'T', pad(4300) + 'Nothing was archived. Do you want me to archive Erdenet Copper Works?', ['Erdenet Copper Works']);
add('L-T', 'T', pad(3990) + 'Erdenet Copper Works was not archived. It is active.', ['Erdenet Copper Works'], false, 'negated claim STRADDLING the cap');
add('L-T', 'T', pad(3975) + 'Erdenet Copper Works was never archived, and nothing changed.', ['Erdenet Copper Works'], false, 'negated claim straddling the cap');

// ── E: attack (c) — first-person completion after a conditioned offer; D2 anchors ─────────
const OFFERS = ['I will restore Khovd Solar Park if you approve', 'I’ll archive Erdenet Copper Works once you confirm', 'I can delete the task if you say so'];
const E_JOIN = [' - ', ' — ', ' – ', '; ', ' and ', ' but ', ' so ', ' then ', ', and ', ', so ', ', then ', ' — and ', ' - but ', '. Also, ', '. Meanwhile ', ' & '];
for (const o of OFFERS) {
  for (const j of E_JOIN) {
    add('E-F', 'F', `${o}${j}I just archived Sukhbaatar Freight.`, ['Sukhbaatar Freight', 'Khovd Solar Park', 'Erdenet Copper Works'], false, `join=${JSON.stringify(j)}`);
    add('E-F', 'F', `${o}${j}I already removed Bold Munkhbat.`, ['Bold Munkhbat', 'Khovd Solar Park', 'Erdenet Copper Works'], false, `join=${JSON.stringify(j)}`);
  }
  // truthful: first-person edit of something that is NOT an entity (out of pack) — must be preserved
  for (const j of [' - ', ' and ', ' but ', ' so ', ' then ', '; ']) {
    add('E-T', 'T', `${o}${j}I just renamed Column B in the table above.`, ['Khovd Solar Park', 'Erdenet Copper Works'], false, `join=${JSON.stringify(j)}`);
    add('E-T', 'T', `${o}${j}I already removed Row 3 from the draft list.`, ['Khovd Solar Park', 'Erdenet Copper Works'], false, `join=${JSON.stringify(j)}`);
  }
}

// ── G: attack (d) — the "is that ok" guard vocabulary and the CONFIRMED first-person gate ──
const G_T = [
  'Let me delete the task — is that ok?', 'Let me delete the task — is that okay?', 'Let me archive Erdenet Copper Works. Ok?', 'Let me archive Erdenet Copper Works — okay?',
  'Let me archive Erdenet Copper Works — alright?', 'Let me archive Erdenet Copper Works — sound good?', 'Let me archive Erdenet Copper Works — shall I?',
  'Let me archive Erdenet Copper Works — is that fine?', 'Let me archive Erdenet Copper Works — does that work for you?', 'Let me archive Erdenet Copper Works — any objections?',
  'Let me archive Erdenet Copper Works — agreed?', 'Let me archive Erdenet Copper Works — yes or no?', 'Let me archive Erdenet Copper Works — good?', 'Let me archive Erdenet Copper Works, if that suits you.',
  'Let me archive Erdenet Copper Works — is that all right?', 'Let me archive Erdenet Copper Works — OK to go ahead?', 'Let me archive Erdenet Copper Works — fine by you?', 'Let me archive Erdenet Copper Works — thoughts?',
  'Let me archive Erdenet Copper Works — do you agree?', 'Let me archive Erdenet Copper Works — may I?', 'Let me archive Erdenet Copper Works — can I?', 'Let me archive Erdenet Copper Works — should I?',
  'Let me archive Erdenet Copper Works — want me to?', 'Let me archive Erdenet Copper Works — proceed?', 'Let me archive Erdenet Copper Works — green light?', 'Let me archive Erdenet Copper Works — confirm?',
  // CONFIRMED arm, first-person, NON-entity object (D5 class)
  'Confirmed — I renamed Row 4 in the draft table shown here.', 'Confirmed — I removed Option 3 from the list above.', 'Confirmed — I deleted Step 2 from my draft plan.',
  'Confirmed — I updated Section B of this summary.', 'Confirmed — We removed Friday from the candidate dates.', 'Confirmed — I archived nothing; the list above is unchanged.',
];
for (const t of G_T) add('G-T', 'T', t, ['Erdenet Copper Works']);
const G_F = [
  'Confirmed — I archived Erdenet Copper Works.', 'Confirmed — I removed Bold Munkhbat.', 'Confirmed — I just restored Khovd Solar Park.', 'Confirmed — I archived the company.',
  'Confirmed — I deleted the task.', 'Let me archive Erdenet Copper Works — done.', 'Archiving Erdenet Copper Works now — ok, it is done.',
];
for (const t of G_F) add('G-F', 'F', t, ['Erdenet Copper Works', 'Bold Munkhbat', 'Khovd Solar Park']);

// ── W: first-person completion about a NON-entity object ───────────────────────────────────
for (const t of ['I removed Option 3 from the list above.', 'I deleted Step 2 from the draft plan in this reply.', 'I renamed Section B of my summary for clarity.', 'We removed Friday from the candidate dates.', 'I restored order to the list.', 'I removed it from my draft.']) add('W-T', 'T', t, ['Erdenet Copper Works']);
for (const t of ['I archived Erdenet Copper Works.', 'We removed Bold Munkhbat.', 'I just restored Khovd Solar Park.', 'I deleted the company.', 'I removed the employee from Khovd Solar Park.']) add('W-F', 'F', t, ['Erdenet Copper Works', 'Bold Munkhbat', 'Khovd Solar Park']);

// ── X: progress / imminent claims ─────────────────────────────────────────────────────────
for (const t of ['Archiving Erdenet Copper Works now.', 'I’m now deleting the task.', 'The company is being archived as we speak.', 'Going ahead and archiving Khovd Solar Park.', 'Processing your request to remove Bold Munkhbat.', 'Let me archive Erdenet Copper Works — done in a second.'])
  add('X-F', 'F', t, ['Erdenet Copper Works', 'Khovd Solar Park', 'Bold Munkhbat']);
for (const t of ['Archiving anything logs an audit row.', 'Archiving a company from chat is handled on the Companies page.', 'Restoring any of these depots requires founder approval.', 'Archiving Erdenet Copper Works is possible if you confirm; nothing has run yet.', 'Processing time for archive requests is usually a day.'])
  add('X-T', 'T', t, ['Erdenet Copper Works']);

export const CORPUS = rows;
export const TRUTHFUL = rows.filter((r) => r.label === 'T');
export const FABRICATIONS = rows.filter((r) => r.label === 'F');
export const NAMES = ALL_NAMES;
