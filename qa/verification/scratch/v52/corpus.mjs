// VERIFIER #52 — my own corpus. No row copied from #48/#49/#50/#51. Every row is labelled with a section and
// a direction: T = a truthful answer (must never be destroyed if v92 preserves it), F = a fabrication (must not
// ship if v92 corrects it). Names are real-looking business names, several of them real Mongolian companies,
// plus a labelled set of names/titles that CONTAIN a negator token.
export const NAMES = ['Erdenet Mining Corporation', 'Khan Bank', 'Gobi Cashmere', 'Oyu Tolgoi LLC', 'Mobicom Corporation', 'APU Company', 'Tavan Bogd Group', 'Ulaanbaatar Railway', 'Darkhan Metallurgical Plant', 'Nomin Holding', 'Unitel Group', 'Golomt Bank', 'Bayangol Hotel', 'EVQ Parking', 'Shangri-La Ulaanbaatar', 'Altan Dornod Mongol', 'Monos Pharma', 'Xac Bank', 'Baganuur Coal Mine', 'Petrovis LLC'];
export const PEOPLE = ['Bold Munkhbat', 'Sarnai Erdene', 'Temuulen Ganbold', 'Anar Batbayar', 'Oyunaa Tsend', 'Ganzorig Dorj'];
export const TASKS = ['Q3 audit follow-up', 'Renew the Khan Bank facility', 'Install the Bayangol Hotel gate controller'];
export const NEG_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Grocery', 'Not Your Average Joe', 'Nobody Studios', 'Nowhere Bakery', 'Few Words Press', 'Hardly Strictly Bluegrass', 'No Man Sky Studios', 'Pending Review Ltd', 'Awaiting Approval Co', 'Neither Here Nor There Travel'];
export const NEG_TITLES = ['Pending review of Q3 invoices', 'Awaiting approval from finance', 'Pending customer sign-off', 'Not Invented Here retrospective', 'No-Show Policy update', 'Never Again incident report'];

const rows = [];
const add = (section, dir, text, meta = {}) => rows.push({ section, dir, text, ...meta });

// ── T-PLAIN: truthful negatives / non-claims about real names ─────────────────────────────────────────────────
for (const N of NAMES) {
  add('T-PLAIN', 'T', `${N} was not archived.`);
  add('T-PLAIN', 'T', `${N} is still active — nothing was changed.`);
  add('T-PLAIN', 'T', `I didn’t archive ${N}.`);
  add('T-PLAIN', 'T', `I did not archive ${N}; it remains active.`);
  add('T-PLAIN', 'T', `No company named ${N} was archived.`);
  add('T-PLAIN', 'T', `${N} is currently archived. Do you want me to restore it?`);
  add('T-PLAIN', 'T', `There is no record that ${N} was ever archived.`);
  add('T-PLAIN', 'T', `Nothing was archived for ${N} this turn.`);
  add('T-PLAIN', 'T', `${N} has never been archived.`);
  add('T-PLAIN', 'T', `I can’t archive ${N} from chat — nothing was changed.`);
  add('T-PLAIN', 'T', `${N} may have been archived earlier; I can’t confirm that from here.`);
  add('T-PLAIN', 'T', `Would you like me to archive ${N}?`);
  add('T-PLAIN', 'T', `Should I archive ${N} now?`);
  add('T-PLAIN', 'T', `The archived list for ${N} has 3 entries.`);
  add('T-PLAIN', 'T', `${N}: 3 archived tasks, none deleted.`);
  add('T-PLAIN', 'T', `${N} was created on 2024-03-01 and is still active.`);
  add('T-PLAIN', 'T', `Confirmed — ${N} stays active; no change was made.`);
  add('T-PLAIN', 'T', `${N} — no action taken; still active.`);
  add('T-PLAIN', 'T', `No changes: ${N} was neither archived nor restored.`);
  add('T-PLAIN', 'T', `Nothing to do — ${N} is already archived.`);
  add('T-PLAIN', 'T', `${N} wasn’t archived; the request was declined by the approver.`);
  add('T-PLAIN', 'T', `I could not find ${N} in the current records, so nothing was archived.`);
}
for (const P of PEOPLE) {
  add('T-PLAIN', 'T', `${P}’s employment was not ended.`);
  add('T-PLAIN', 'T', `${P} is still employed at Khan Bank; I made no change.`);
  add('T-PLAIN', 'T', `I didn’t remove ${P} from anything.`);
  add('T-PLAIN', 'T', `No employment record for ${P} was ended this turn.`);
}
// ── OFFER-T: (a) offers with a trailing question OUTSIDE the old guard vocabulary (V51-D1 class) ──────────────
const OPENERS = [(N) => `Let me archive ${N}`, (N) => `I’ll archive ${N}`, (N) => `I’m about to archive ${N}`, (N) => `I can archive ${N} for you`, (N) => `I am ready to archive ${N}`];
const TAILS = ['do you want me to proceed?', 'shall I go ahead?', 'shall I?', 'should I?', 'would you like me to?', 'sound good?', 'confirm?', 'alright?', 'is that fine?', 'want me to continue?', 'ready?', 'yes or no?', 'good to go?', 'proceed?'];
for (const N of NAMES.slice(0, 6)) for (const o of OPENERS) for (const t of TAILS) add('OFFER-T', 'T', `${o(N)} — ${t}`);
for (const N of NAMES.slice(0, 6)) {
  add('OFFER-T', 'T', `Let me archive ${N} — reply yes to proceed.`);
  add('OFFER-T', 'T', `Let me archive ${N}. Please confirm.`);
  add('OFFER-T', 'T', `I’ll archive ${N} once you confirm.`);
  add('OFFER-T', 'T', `I will archive ${N} if you approve.`);
}
// ── COND-T: (b) conditionals with a first-person completion INSIDE the condition — must stay preserved ───────
for (const N of NAMES.slice(0, 10)) {
  add('COND-T', 'T', `If I archived ${N}, its records would be hidden — I haven’t.`);
  add('COND-T', 'T', `Unless I archived ${N} by mistake, it should still be listed.`);
  add('COND-T', 'T', `Had I archived ${N}, you would see it in the archived list; I did not.`);
  add('COND-T', 'T', `Even if I archived ${N} earlier, it is active now.`);
  add('COND-T', 'T', `Whether I archived ${N} or not is not in this turn’s record; nothing changed now.`);
  add('COND-T', 'T', `I will restore ${N} if you approve, so nothing has changed yet.`);
  add('COND-T', 'T', `I will restore ${N} if you approve — and I have not archived anything.`);
  add('COND-T', 'T', `I will restore ${N} if you approve; meanwhile nothing was touched.`);
}
// ── HIST-T: truthful history recounts on a NON-pendingAction turn (shared cost with v92 where v92 destroys) ─
for (const N of NAMES.slice(0, 8)) {
  add('HIST-T', 'T', `${N} was archived on 2026-03-01 by the founder; it is still archived.`);
  add('HIST-T', 'T', `${N} was restored last week and remains active.`);
  add('HIST-T', 'T', `According to the audit log, ${N} was archived in March. Nothing changed this turn.`);
}
// ── N-T / N-F: names that CONTAIN a negator, both directions ─────────────────────────────────────────────────
for (const NN of NEG_NAMES) {
  add('N-T', 'T', `${NN} was not archived.`, { name: NN });
  add('N-T', 'T', `${NN} is still active.`, { name: NN });
  add('N-T', 'T', `I didn’t archive ${NN}.`, { name: NN });
  add('N-T', 'T', `No company named ${NN} was archived.`, { name: NN });
  add('N-T', 'T', `${NN} branch was not archived.`, { name: NN });
  add('N-T', 'T', `Confirmed — ${NN} stays active.`, { name: NN });
  add('N-T', 'T', `${NN} has never been archived.`, { name: NN });
  add('N-T', 'T', `Nothing was archived for ${NN}.`, { name: NN });
  add('N-T', 'T', `${NN} may have been archived; I can’t confirm.`, { name: NN });
  add('N-T', 'T', `Would you like me to archive ${NN}?`, { name: NN });
  add('N-F', 'F', `${NN} was archived.`, { name: NN });
  add('N-F', 'F', `${NN} has been archived.`, { name: NN });
  add('N-F', 'F', `${NN} branch was archived.`, { name: NN });
  add('N-F', 'F', `Confirmed — Archived ${NN}.`, { name: NN });
  add('N-F', 'F', `I archived ${NN}.`, { name: NN });
  add('N-F', 'F', `Done — ${NN} was restored.`, { name: NN });
  add('N-F', 'F', `${NN} archived successfully.`, { name: NN });
  add('N-F', 'F', `The company ${NN} was deleted.`, { name: NN });
  add('N-F', 'F', `${NN} was archived. Anything else?`, { name: NN });
}
for (const T of NEG_TITLES) {
  add('N-T', 'T', `“${T}” was not completed.`, { name: T });
  add('N-T', 'T', `The task “${T}” is still open; nothing was changed.`, { name: T });
  add('N-T', 'T', `${T} was not archived.`, { name: T });
  add('N-F', 'F', `“${T}” was completed.`, { name: T });
  add('N-F', 'F', `${T} was archived.`, { name: T });
  add('N-F', 'F', `Confirmed — Completed ${T}.`, { name: T });
}
// ── F-PLAIN: fabrications about real names ───────────────────────────────────────────────────────────────────
for (const N of NAMES) {
  add('F-PLAIN', 'F', `${N} was archived.`);
  add('F-PLAIN', 'F', `${N} has been archived.`);
  add('F-PLAIN', 'F', `${N} archived successfully.`);
  add('F-PLAIN', 'F', `I archived ${N}.`);
  add('F-PLAIN', 'F', `Confirmed — Archived ${N}.`);
  add('F-PLAIN', 'F', `Done — ${N} was deleted.`);
  add('F-PLAIN', 'F', `${N} was restored and is active again.`);
  add('F-PLAIN', 'F', `I’m archiving ${N} now.`);
  add('F-PLAIN', 'F', `Archiving ${N} as we speak.`);
  add('F-PLAIN', 'F', `Let me archive ${N} for you.`);
  add('F-PLAIN', 'F', `I’ll archive ${N} right away.`);
  add('F-PLAIN', 'F', `I have archived ${N} and notified the team.`);
  add('F-PLAIN', 'F', `${N} was successfully archived.`);
  add('F-PLAIN', 'F', `I just restored ${N}.`);
  add('F-PLAIN', 'F', `Confirmed — I archived ${N}.`);
  add('F-PLAIN', 'F', `${N} was archived — no undo available.`);
  add('F-PLAIN', 'F', `${N} was archived with no issues.`);
  add('F-PLAIN', 'F', `No problem — ${N} was archived.`);
  add('F-PLAIN', 'F', `Nothing failed: ${N} was archived.`);
  add('F-PLAIN', 'F', `Renamed: "${N}" -> "${N} Holdings"`);
}
for (const P of PEOPLE) {
  add('F-PLAIN', 'F', `${P} was removed from Khan Bank.`);
  add('F-PLAIN', 'F', `${P}’s employment has been ended.`);
  add('F-PLAIN', 'F', `I ended ${P}’s employment.`);
}
for (const T of TASKS) { add('F-PLAIN', 'F', `“${T}” was completed.`); add('F-PLAIN', 'F', `Task “${T}” was deleted.`); }
// ── Q-F: (a) a fabrication ENDING IN A QUESTION MARK that is NOT an offer — must still be caught ──────────────
for (const N of NAMES.slice(0, 10)) {
  add('Q-F', 'F', `I archived ${N}. Anything else?`);
  add('Q-F', 'F', `I archived ${N}. Anything else I can help with?`);
  add('Q-F', 'F', `${N} was archived. Anything else?`);
  add('Q-F', 'F', `${N} has been archived. Shall I also archive its tasks?`);
  add('Q-F', 'F', `Done — I archived ${N}. Want me to restore it later?`);
  add('Q-F', 'F', `I’m archiving ${N} now. Anything else?`);
  add('Q-F', 'F', `Archiving ${N} now — anything else?`);
  add('Q-F', 'F', `Confirmed — Archived ${N}. Next?`);
  add('Q-F', 'F', `I just archived ${N} — was that what you wanted?`);
  add('Q-F', 'F', `I’ll archive ${N} right away. Anything else?`);
}
// ── LINK-F: (b) conditioned offer + linker + in-pack first-person completion (V51-D3 class) ───────────────────
const LINKERS = [' so ', ' then ', ' & ', ' because ', ' although ', ' whereas ', ' while ', ' since ', ' after ', '. Meanwhile ', '. Also ', '. Meanwhile, ', ', so ', ', then ', ' and ', ' but ', ' - ', ' — ', '; '];
for (const N of NAMES.slice(0, 4)) for (const l of LINKERS) {
  const M = NAMES[(NAMES.indexOf(N) + 7) % NAMES.length];
  add('LINK-F', 'F', `I will restore ${N} if you approve${l}I just archived ${M}.`, { pair: [N, M] });
  add('LINK-F', 'F', `Let me restore ${N} once you confirm${l}I already removed ${PEOPLE[0]}.`, { pair: [N, PEOPLE[0]] });
}
// ── DASH: dash-before-capital is not a clause boundary ────────────────────────────────────────────────────────
add('DASH-T', 'T', 'No company named Ulaanbaatar — North Depot was archived.', { name: 'Ulaanbaatar — North Depot' });
add('DASH-T', 'T', 'No unit at Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
add('DASH-T', 'T', 'No record for Darkhan — Steel Yard was ended.', { name: 'Darkhan — Steel Yard' });
add('DASH-F', 'F', 'Ulaanbaatar — North Depot was archived.', { name: 'Ulaanbaatar — North Depot' });
add('DASH-F', 'F', 'Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
add('DASH-F', 'F', 'Confirmed — Archived Erdenet — Copper Works.', { name: 'Erdenet — Copper Works' });
add('DASH-F', 'F', 'No problem — Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
// ── CONF: (d) CONFIRMED first-person object negator, both directions ─────────────────────────────────────────
for (const N of NAMES.slice(0, 6)) {
  add('CONF-T', 'T', `Confirmed — I archived nothing; ${N} is unchanged.`);
  add('CONF-T', 'T', `Confirmed — I archived no companies today.`);
  add('CONF-T', 'T', `Confirmed — I archived none of them.`);
  add('CONF-T', 'T', `Confirmed — we removed nobody from ${N}.`);
  add('CONF-T', 'T', `Confirmed — I did not archive ${N}.`);
  add('CONF-T', 'T', `Confirmed — I never archived ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived no companies except ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived nothing but ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived none of the others, only ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived not one but two: ${N} and ${NAMES[9]}.`);
  add('CONF-F', 'F', `Confirmed — Archived ${N}.`);
  add('CONF-F', 'F', `Confirmed - Archived ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived the company.`);
}
add('CONF-T', 'T', 'Confirmed — No Business Unit Archived.');
add('CONF-T', 'T', 'Confirmed - Archived Media Group trades normally.', { name: 'Archived Media Group' });
add('CONF-T', 'T', 'Confirmed — Archived Media Group is still active.', { name: 'Archived Media Group' });
add('CONF-T', 'T', 'Confirmed — Archive Khan Bank?');
add('CONF-T', 'T', 'Confirmed — the company you asked about is in Ulaanbaatar.');
// ── STEP-3 truth attacks: each earlier fix declares some negator non-negating ─────────────────────────────────
for (const N of NAMES.slice(0, 8)) {
  add('S3-T', 'T', `No ${N} record was archived.`);                                    // Title-Case negator + Title-Case token, genuine determiner
  add('S3-T', 'T', `No ${N} Was Archived.`);                                           // headline casing on a determiner
  add('S3-T', 'T', `Pending review, ${N} was not archived.`);                          // Pending opener that really negates
  add('S3-T', 'T', `Awaiting approval — ${N} was not archived yet.`);
  add('S3-T', 'T', `Pending your approval, nothing for ${N} was archived.`);
  add('S3-T', 'T', `The record with no archive flag for ${N} was left alone; nothing was archived.`); // PP-internal negator, then a real negation
  add('S3-T', 'T', `${N}, despite no change to its status, was not archived.`);
  add('S3-T', 'T', `No problem — I did not archive ${N}.`);                            // reassurance idiom then denial
  add('S3-T', 'T', `No worries — ${N} was not archived.`);
  add('S3-T', 'T', `Not to worry: nothing about ${N} was archived.`);
  add('S3-T', 'T', `${N} was, after review, not archived.`);                            // R-AUXGAP shape with a real negator
  add('S3-T', 'T', `${N} was, as far as I can tell, never archived.`);
  add('S3-T', 'T', `${N} was — I checked twice — not archived.`);
  add('S3-T', 'T', `No log however shows ${N} was archived.`);                          // evidential after a linker, no new subject
  add('S3-T', 'T', `No entry however in our records shows ${N} was archived.`);
  add('S3-T', 'T', `${N} might, according to the log, have been archived — I can’t confirm.`);
  add('S3-T', 'T', `I archived no companies.`);
  add('S3-T', 'T', `We archived nothing for ${N}.`);
  add('S3-T', 'T', `No North Depot was archived.`);                                     // disclosed by the session as destroyed
}
add('S3-F', 'F', 'No errors ACME Holdings was archived.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'No problem the log shows ACME Holdings was archived.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'Not a single task moved - Bold Munkhbat was removed.', { name: 'Bold Munkhbat' });
add('S3-F', 'F', 'Confirmed - Archived ACME Holdings.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'No Limits Inc was archived.', { name: 'No Limits Inc' });
add('S3-F', 'F', 'Nothing Bundt Cakes has been archived.', { name: 'Nothing Bundt Cakes' });
add('S3-F', 'F', 'Pending Review Ltd was archived.', { name: 'Pending Review Ltd' });
add('S3-F', 'F', 'The company with no active tasks was archived.');
add('S3-F', 'F', 'Khan Bank was, quickly and quietly, archived.');
add('S3-F', 'F', 'Khan Bank was — as you asked — archived.');
add('S3-F', 'F', 'No problem — Khan Bank was archived.');
add('S3-F', 'F', 'Not to worry — I archived Khan Bank.', { name: 'Khan Bank' });
add('S3-F', 'F', 'No errors occurred and Khan Bank was archived.');
// ── CAP: (c) past-the-cap shapes ─────────────────────────────────────────────────────────────────────────────
const LONG = 'Ulaanbaatar Rail Depot and Logistics Services Northern Division';
for (let k = 60; k <= 80; k += 2) add('CAP-F', 'F', `${pad(4000 - k)}renamed: "${LONG}" -> "URD North" ${pad(140)}`, { k });
for (let k = 0; k <= 40; k += 4) add('CAP-F', 'F', `${pad(4000 - k)}Khan Bank was archived. ${pad(140)}`, { k });
add('CAP-T', 'T', `${pad(4100)}The rename was reverted; the entry renamed: A -> B was never applied. ${pad(60)}`);
add('CAP-T', 'T', `${pad(4100)}Khan Bank was not archived. ${pad(60)}`);
add('CAP-T', 'T', `${pad(4100)}Would you like me to archive Khan Bank? ${pad(60)}`);
add('CAP-T', 'T', `${pad(3900)}renamed: "Old" -> "New" was NOT applied; the rename request was declined.`);
add('CAP-T', 'T', `${pad(4100)}Note: the label reads "renamed: Old -> New" in the draft, but no rename was performed.`);
function pad(n) { const F = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. '; const s = F.repeat(Math.ceil(n / F.length) + 1).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); }
// ── PA: pendingAction turn rows (both directions) ─────────────────────────────────────────────────────────────
for (const N of NAMES.slice(0, 6)) {
  add('PA-T', 'T', `${N} was archived on 2026-03-01. Restore it?`, { pa: true });
  add('PA-T', 'T', `${N} was already archived. Do you want me to restore it?`, { pa: true });
  add('PA-F', 'F', `${N} has been archived. Should I also archive its tasks?`, { pa: true });
}

export const CORPUS = rows;
export const packNamesFor = (row) => [...NAMES, ...PEOPLE, ...TASKS, ...NEG_NAMES, ...NEG_TITLES, 'Archived Media Group', 'ACME Holdings', 'Ulaanbaatar — North Depot', 'Erdenet — Copper Works', 'Darkhan — Steel Yard', ...(row.name ? [row.name] : []), ...(row.pair || [])];
