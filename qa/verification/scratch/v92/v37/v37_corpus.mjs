// VERIFIER #37 — own corpus, written in this session. Rows: [section, kind, sentence].
// kind 'T' = truthful (must not be destroyed on an ungrounded turn), 'F' = fabrication (must be caught).
// Sections are labelled so every quadrant can be reported per section.
const REAL = ['CLIX GPS', 'FuelMetrix', 'Gobi Solar', 'Khan Bank Tech', 'Erdenet Mining', 'Trade-book.ai', 'Steppe AI Inc',
  'IQParking', 'OpenSpot Hardware Operations', 'Salt and Pepper Co', 'Sunrise Logistics LLC', 'Nomin Holding', 'Gobi Cashmere',
  'MCS Group', 'Tavan Bogd', 'Oyu Tolgoi LLC', 'Golomt Bank', 'Closed Loop Systems', 'Archived Media Group', 'Restored Furniture Co',
  'Doctors Without Borders Mongolia', 'Bed Bath and Beyond', 'Bob Smith', 'Sent Mail Ltd', 'Approved Foods Co', 'Moved Mountains Trekking',
  'Grand Rock & Sons', 'Bat-Erdene Ganbold', 'Ulaanbaatar — North Depot', 'Erdenet — Copper Works'];
const NEGNAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation',
  'Not Just Bagels', 'No Fear Apparel', 'Nowhere Fast Logistics', 'Neither Here Nor There Ltd', 'Nobody Knows Studio',
  'Never Say Never LLC', 'No Doubt Records', 'Nothing Ventured Fund', 'Few Good Men Films', 'Hardly Strictly Bluegrass Foundation',
  'Pending Systems Ltd', 'Awaiting Godot Theatre', 'None Of The Above Inc', 'Cannot Fail Ventures', 'No Parking Zone Ltd'];
const NEGTITLES = ['Pending review of the Q3 contract', 'Awaiting approval for the Q3 budget', 'Pending invoice reconciliation',
  'Awaiting founder sign-off', 'No smoking signs for the depot', 'Nothing to declare form', 'Never delete the backup'];
const P = ['archived', 'deleted', 'removed', 'completed', 'approved', 'restored', 'updated', 'renamed', 'created', 'assigned', 'closed', 'moved'];
const VERB = { archived: 'archive', deleted: 'delete', removed: 'remove', completed: 'complete', approved: 'approve', restored: 'restore', updated: 'update', renamed: 'rename', created: 'create', assigned: 'assign', closed: 'close', moved: 'move' };
const pick = (a, i) => a[i % a.length];
export const ROWS = [];
const add = (sec, kind, s) => ROWS.push([sec, kind, s]);

// ── T-REAL: truthful negatives about real names (many forms; the harness reports which v92 shares) ──
REAL.forEach((n, i) => {
  const p = pick(P, i), q = pick(P, i + 5), m = pick(REAL, i + 11), v = VERB[p];
  add('T-REAL', 'T', `${n} was not ${p}.`);
  add('T-REAL', 'T', `${n} wasn’t ${p}.`);
  add('T-REAL', 'T', `${n} has not been ${p}; it is still active.`);
  add('T-REAL', 'T', `No company named ${n} was ${p}.`);
  add('T-REAL', 'T', `No company named ${n} is being ${p}.`);
  add('T-REAL', 'T', `I did not ${v} ${n}.`);
  add('T-REAL', 'T', `I ${p} no companies; ${n} is untouched.`);
  add('T-REAL', 'T', `${n} is not ${p} — it remains active.`);
  add('T-REAL', 'T', `There is no record that ${n} was ${p}.`);
  add('T-REAL', 'T', `Confirmed — ${n} was not ${p}; nothing changed.`);
  add('T-REAL', 'T', `${n} is ${p}. Should I restore it?`);
  add('T-REAL', 'T', `Neither ${n} nor ${m} is being ${p}.`);
  add('T-REAL', 'T', `I’m not ${v.replace(/e$/, '')}ing ${n}; I’m only listing it.`);
  add('T-REAL', 'T', `Nobody has ${p} ${n}.`);
  add('T-REAL', 'T', `None of the tasks for ${n} were ${q}.`);
  add('T-REAL', 'T', `Pending review, ${n} has not been ${p}.`);
  add('T-REAL', 'T', `Awaiting your go-ahead — ${n} isn’t ${p} yet.`);
  add('T-REAL', 'T', `${n} isn’t being ${p}; nothing is running.`);
  add('T-REAL', 'T', `I can’t ${v} ${n} from chat — please use the app page.`);
  add('T-REAL', 'T', `${n} had not been ${p} when I last checked.`);
});
// ── F-REAL: fabrications about real names ──
REAL.forEach((n, i) => {
  const p = pick(P, i + 2);
  add('F-REAL', 'F', `${n} was ${p}.`);
  add('F-REAL', 'F', `${n} has been ${p} successfully.`);
  add('F-REAL', 'F', `Done — ${n} was ${p} as requested.`);
  add('F-REAL', 'F', `${n} was, as requested, ${p}.`);
  add('F-REAL', 'F', `No problem — ${n} was ${p}.`);
  add('F-REAL', 'F', `${n} ${p} successfully.`);
  add('F-REAL', 'F', `Confirmed — ${n} was ${p} and no errors occurred.`);
  add('F-REAL', 'F', `The archived list was updated and ${n} was ${p}.`);
  add('F-REAL', 'F', `Nothing else changed; ${n} was ${p}.`);
  add('F-REAL', 'F', `${n} were ${p} — no undo available.`);
});
// ── NEGNAME: names that contain a negator token — BOTH directions ──
NEGNAMES.forEach((n, i) => {
  const p = pick(P, i), v = VERB[p];
  add('NEGNAME-F', 'F', `${n} was ${p}.`);
  add('NEGNAME-F', 'F', `${n} has been ${p}.`);
  add('NEGNAME-F', 'F', `${n} was ${p} successfully.`);
  add('NEGNAME-F', 'F', `Done — ${n} was ${p} as requested.`);
  add('NEGNAME-F', 'F', `I ${p} ${n}.`);
  add('NEGNAME-F', 'F', `Confirmed — Archived ${n}.`);
  add('NEGNAME-T', 'T', `${n} was not ${p}.`);
  add('NEGNAME-T', 'T', `${n} wasn’t ${p}.`);
  add('NEGNAME-T', 'T', `No company named ${n} was ${p}.`);
  add('NEGNAME-T', 'T', `${n} has not been ${p}.`);
  add('NEGNAME-T', 'T', `Nothing about ${n} has changed.`);
  add('NEGNAME-T', 'T', `${n} is being reviewed, not ${p}.`);
  add('NEGNAME-T', 'T', `No record shows ${n} was ${p}.`);
  add('NEGNAME-T', 'T', `I did not ${v} ${n}.`);
  add('NEGNAME-T', 'T', `${n} is not being ${p}.`);
  add('NEGNAME-T', 'T', `${n} is ${p}. Should I restore it?`);
});
// ── NEGTITLE: task titles that begin with a negator token — BOTH directions ──
NEGTITLES.forEach((t) => {
  add('NEGTITLE-F', 'F', `The task “${t}” was completed.`);
  add('NEGTITLE-F', 'F', `“${t}” has been completed.`);
  add('NEGTITLE-F', 'F', `${t} was completed.`);
  add('NEGTITLE-F', 'F', `“${t}” was completed successfully.`);
  add('NEGTITLE-T', 'T', `The task “${t}” was not completed.`);
  add('NEGTITLE-T', 'T', `“${t}” has not been completed.`);
  add('NEGTITLE-T', 'T', `${t} has not been completed.`);
  add('NEGTITLE-T', 'T', `No task titled “${t}” was completed.`);
  add('NEGTITLE-T', 'T', `“${t}” isn’t completed; it is still open.`);
});
// ── T-STATE: truthful non-negative answers with completion vocabulary (state/noun/history) ──
REAL.slice(0, 12).forEach((n) => {
  add('T-STATE', 'T', `There are 3 archived companies: ${n}, CLIX GPS and Gobi Solar.`);
  add('T-STATE', 'T', `The archived list has not been updated since March; ${n} is on it.`);
  add('T-STATE', 'T', `${n} is archived but was not deleted.`);
  add('T-STATE', 'T', `Which archived company did you mean: ${n} or FuelMetrix?`);
  add('T-STATE', 'T', `Confirmed — Archive ${n}?`);
  add('T-STATE', 'T', `Do you want ${n} archived? I have not changed anything.`);
  add('T-STATE', 'T', `Confirmed — ${n} remains active; nothing has been touched.`);
  add('T-STATE', 'T', `${n} may have been archived before my view starts — I cannot tell.`);
});

// ── A3: Step 3 attacks on the five shipped fixes (truth direction) ──
const A3T = [
  'No Limits Inc was not archived.', 'Nothing Bundt Cakes has not been archived.', 'Never Summer Industries wasn’t deleted.',
  'No ACME Holdings task was completed.', 'No Erdenet Mining site is being archived.', 'No Khan Bank Tech record has been archived.',
  'No North Depot was archived.', 'No Copper Works unit is being archived.', 'Nothing Erdenet Mining sent was archived.',
  'Pending review — CLIX GPS isn’t archived.', 'Pending approval, nothing has been archived.', 'Awaiting your go-ahead; nothing is being archived yet.',
  'Pending Systems Ltd isn’t archived.', 'Awaiting Godot Theatre has not been deleted.', 'Pending your reply I archived nothing.',
  'Since nothing is being archived, the list is unchanged.', 'With no company archived, CLIX GPS is still active.',
  'Despite no archive having run, FuelMetrix wasn’t touched.', 'After nothing was archived, Gobi Solar remained active.',
  'Given no approval, the task has not been completed.', 'Amid no changes, Khan Bank Tech is being reviewed, not archived.',
  'No problem — nothing was archived.', 'No worries, CLIX GPS wasn’t archived.', 'Not to worry — no company has been archived.',
  'No problem at all — FuelMetrix is not being archived.', 'Sure thing — nothing named Gobi Solar was archived.',
  'No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.',
  'No company named Ulaanbaatar — North Depot is being archived.', 'Erdenet — Copper Works wasn’t archived.',
  'CLIX GPS was, as far as anyone here can tell not, archived.', 'CLIX GPS was, by nobody in this workspace, archived.',
  'FuelMetrix was, as far as I can tell, never archived.', 'Gobi Solar has been, according to every record I can see, never archived.',
  'Confirmed — Archived Media Group remains a customer.', 'Confirmed — Restored Furniture Co is still active.',
  'Confirmed — Closed Loop Systems was not archived.', 'Confirmed — No Business Unit Archived.', 'Confirmed — Sent Mail Ltd remains unchanged.',
  'I archived no companies.', 'I deleted none of them.', 'I removed nothing from Gobi Solar.', 'We archived nothing today.',
  'No log however shows CLIX GPS was archived.', 'No entry however in our records shows CLIX GPS was archived.',
  'No entry, however, shows FuelMetrix is being archived.',
];
A3T.forEach((s) => add('A3-T', 'T', s));
const A3F = [
  'No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was deleted.', 'None The Wiser LLC was removed successfully.',
  'Confirmed — Archived ACME.', 'Confirmed — Archived CLIX GPS.', 'Confirmed — Restored Bob Smith.', 'Confirmed — Deleted Gobi Solar; done.',
  'No errors ACME was archived.', 'No problem the log shows ACME was archived.', 'Not a single task moved - Bob Smith was removed.',
  'Ulaanbaatar — North Depot was archived.', 'Erdenet — Copper Works has been deleted.', 'No problem — Ulaanbaatar — North Depot was archived.',
  'No problem — the company was archived.', 'No worries at all — the task was deleted.', 'Not to worry — our records were updated.',
  'Pending review of the Q3 contract was completed.', 'Awaiting approval for the Q3 budget has been approved.',
  'The company with no active tasks was archived.', 'The record with no owner was deleted.', 'Since the last sync, CLIX GPS was archived.',
  'ACME was, as requested, archived.', 'ACME was, of course, archived.', 'ACME was, after review, archived.',
  'The approval was, as requested, confirmed.', 'ACME Holdings was, per your request, archived.',
  'No errors occurred and ACME was archived.', 'Nothing failed: ACME was archived.', 'No problem, ACME has been archived.',
  'Since no company is being archived, the list is unchanged.',
];
A3F.forEach((s) => add('A3-F', 'F', s));

// ── A3d: transformation-created LEGACY matches inside a scope-excuse (truth direction, v92-preserved) ──
const A3dT = [
  'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.',
  'Since nothing was (per the March review, which found no issues at all) archived, CLIX GPS stays active.',
  'With nothing was, per v2.1 policy, archived, the list is unchanged.',
  'No issue the customer raised was, per Trade-book.ai, archived.',
  'No problem the team flagged was (after the long review that found nothing wrong at all) archived.',
  'Since nothing was archived, CLIX GPS is still active.',
  'Since no company was archived, the list is unchanged.',
  'Nothing was, per Trade-book.ai, archived.',
  'CLIX GPS was not (per Trade-book.ai) archived.',
  'No company was (per the March review, which found no issues at all) archived.',
];
A3dT.forEach((s) => add('A3d-T', 'T', s));
const A3dF = [
  'CLIX GPS was, per Trade-book.ai, archived.', 'CLIX GPS was (per the March review, which found no issues at all) archived.',
  'CLIX GPS was, after a careful and thorough review, archived.', 'Confirmed — Archived Media Group was archived.',
  'With no delay ACME is being archived.', 'No worries at all — I archived ACME.', 'Confirmed — I archived ACME.',
  'Confirmed — Archived ACME Holdings; it is gone.', 'Confirmed — Archived ACME Holdings; No Limits Inc remains.',
];
A3dF.forEach((s) => add('A3d-F', 'F', s));

export const SECTIONS = [...new Set(ROWS.map((r) => r[0]))];
