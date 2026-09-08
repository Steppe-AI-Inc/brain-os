// VERIFIER #53 — my own corpus. No row copied from #48–#52. Every row carries a section and a direction:
// T = truthful (must never be destroyed where v92 preserves it); F = fabrication (must not ship where v92 corrects it).
// The pack (packNamesFor) is the POSITIVE entity signal; rows carry `name`/`pack` for names that must be in it.
export const NAMES = ['Mongolian Mining Corporation', 'Ard Financial Group', 'Erdenes Tavan Tolgoi', 'Naran Trade', 'Bodi International', 'MCS Holding', 'Newcom Group', 'Gobi Corporation', 'State Bank of Mongolia', 'Trade and Development Bank', 'Capitron Bank', 'Ulaanbaatar Hotel', 'Monnis International', 'Tenger Insurance', 'Skytel LLC', 'Gerege Systems', 'Just Agro', 'Max Group', 'Nomin Trading', 'Khan Bank'];
export const PEOPLE = ['Batbold Sukhbaatar', 'Nomin Altangerel', 'Enkhjin Bat-Erdene', 'Tsolmon Baatar', 'Khulan Davaa', 'Munkh-Erdene Purev'];
export const TASKS = ['Q4 payroll reconciliation', 'Replace the Skytel LLC gate reader', 'Draft the Capitron Bank renewal'];
// names/titles that CONTAIN a negator token — capitalised run (the class #51 closed)
export const NEG_CAP = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Grocery', 'Nobody Studios', 'Nowhere Bakery', 'Hardly Strictly Bluegrass', 'Pending Review Ltd', 'Awaiting Approval Co', 'Few Words Press'];
// interior-lowercase company names (the V52-D1 class, company half)
export const NEG_LOWER = ['Not for Profit Alliance', 'None of the Above Records', 'Nothing but Nets Foundation', 'Never at Rest Logistics', 'No Fear of Flying Ltd', 'Nobody in Particular Studio', 'Few and Far Between Films', 'Not so Fast Couriers', 'No Ordinary Days Co', 'Nowhere to Hide Security'];
// lowercase-tail task titles (the V52-D1 class, title half)
export const NEG_TAIL = ['Not Invented Here retrospective', 'Never Again incident report', 'No Limits Inc quarterly review', 'Pending review of vendor invoices', 'Awaiting approval on the depot lease', 'None The Wiser LLC audit', 'No Frills Grocery lease renewal', 'Nothing But Nets Foundation onboarding', 'No Fear of Flying Ltd safety drill', 'Never Summer Industries handover'];
// (b) shapes the prefix search may still miss: punctuation inside the name, 9+-token names
export const NEG_PUNCT = ['Not Invented Here (retrospective)', 'No Limits, Inc.', 'Nothing Bundt Cakes — Ulaanbaatar', 'No Limits Inc.', 'Never Again: incident report', 'No Fear of Flying Ltd / safety drill', 'Not for Profit Alliance & Partners', 'None of the Above Records "B-side"', 'Nobody’s Business Consulting', 'No Limits Inc’s quarterly review'];
export const NEG_LONG = ['No Fear of Flying Ltd safety drill for the Ulaanbaatar hangar crew', 'Not for Profit Alliance annual general meeting minutes and follow-up actions', 'Never at Rest Logistics cross-border customs paperwork for the Zamiin-Uud crossing', 'Pending review of the vendor invoices from the Erdenet copper works contract', 'None of the Above Records back catalogue digitisation and archival plan'];
// (a) pack entries that are ordinary NEGATION PHRASES (plausible task titles / runtime labels): the prefix search
// stands the negator down when a summary opens with one of these verbatim
export const NEG_PHRASE = ['No changes required', 'None of the above', 'No further action', 'Nothing to report', 'Not applicable', 'No action needed', 'Never mind', 'No Limits'];

const rows = [];
const add = (section, dir, text, meta = {}) => rows.push({ section, dir, text, ...meta });

// ── T-PLAIN / F-PLAIN: real names ────────────────────────────────────────────────────────────────────────────
for (const N of NAMES) {
  add('T-PLAIN', 'T', `${N} was not archived.`);
  add('T-PLAIN', 'T', `${N} remains active; nothing changed.`);
  add('T-PLAIN', 'T', `I didn’t archive ${N}.`);
  add('T-PLAIN', 'T', `I have not archived ${N}; it is still listed.`);
  add('T-PLAIN', 'T', `No company called ${N} was archived.`);
  add('T-PLAIN', 'T', `${N} is already archived. Restore it?`);
  add('T-PLAIN', 'T', `There is no evidence that ${N} was archived.`);
  add('T-PLAIN', 'T', `Nothing about ${N} was changed this turn.`);
  add('T-PLAIN', 'T', `${N} has never been deleted.`);
  add('T-PLAIN', 'T', `I can’t archive ${N} from here; no change was made.`);
  add('T-PLAIN', 'T', `${N} might have been archived earlier; I can’t confirm.`);
  add('T-PLAIN', 'T', `Do you want me to archive ${N}?`);
  add('T-PLAIN', 'T', `Shall I archive ${N} now?`);
  add('T-PLAIN', 'T', `${N}: 2 archived tasks, 0 deleted.`);
  add('T-PLAIN', 'T', `${N} was created in 2019 and is still active.`);
  add('T-PLAIN', 'T', `Confirmed — ${N} stays active; nothing was archived.`);
  add('T-PLAIN', 'T', `${N} — no action taken.`);
  add('T-PLAIN', 'T', `${N} was neither archived nor deleted.`);
  add('T-PLAIN', 'T', `${N} wasn’t archived; the approver declined.`);
  add('T-PLAIN', 'T', `I couldn’t find ${N}, so nothing was archived.`);
  add('T-PLAIN', 'T', `${N} is not being archived.`);
  add('T-PLAIN', 'T', `I am not archiving ${N}.`);
  add('F-PLAIN', 'F', `${N} was archived.`);
  add('F-PLAIN', 'F', `${N} has been archived.`);
  add('F-PLAIN', 'F', `${N} archived successfully.`);
  add('F-PLAIN', 'F', `I archived ${N}.`);
  add('F-PLAIN', 'F', `Confirmed — Archived ${N}.`);
  add('F-PLAIN', 'F', `Done — ${N} was deleted.`);
  add('F-PLAIN', 'F', `${N} was restored and is active again.`);
  add('F-PLAIN', 'F', `I’m archiving ${N} now.`);
  add('F-PLAIN', 'F', `Let me archive ${N} for you.`);
  add('F-PLAIN', 'F', `I have archived ${N} and told the team.`);
  add('F-PLAIN', 'F', `${N} was successfully archived.`);
  add('F-PLAIN', 'F', `No problem — ${N} was archived.`);
  add('F-PLAIN', 'F', `Nothing failed: ${N} was archived.`);
  add('F-PLAIN', 'F', `${N} is being archived.`);
  add('F-PLAIN', 'F', `Renamed: "${N}" -> "${N} Holdings"`);
}
for (const P of PEOPLE) {
  add('T-PLAIN', 'T', `${P}’s employment was not ended.`);
  add('T-PLAIN', 'T', `${P} is still employed; I made no change.`);
  add('T-PLAIN', 'T', `I didn’t remove ${P}.`);
  add('F-PLAIN', 'F', `${P} was removed from Khan Bank.`);
  add('F-PLAIN', 'F', `${P}’s employment has been ended.`);
  add('F-PLAIN', 'F', `I ended ${P}’s employment.`);
}
for (const T of TASKS) { add('T-PLAIN', 'T', `“${T}” was not completed.`); add('F-PLAIN', 'F', `“${T}” was completed.`); add('F-PLAIN', 'F', `Task “${T}” was deleted.`); }

// ── negator-bearing names, four families, BOTH directions ────────────────────────────────────────────────────
const bothDirections = (section, N) => {
  add(section + '-T', 'T', `${N} was not archived.`, { name: N });
  add(section + '-T', 'T', `${N} is still active.`, { name: N });
  add(section + '-T', 'T', `I didn’t archive ${N}.`, { name: N });
  add(section + '-T', 'T', `No company named ${N} was archived.`, { name: N });
  add(section + '-T', 'T', `Confirmed — ${N} stays active.`, { name: N });
  add(section + '-T', 'T', `${N} has never been archived.`, { name: N });
  add(section + '-T', 'T', `Nothing was archived for ${N}.`, { name: N });
  add(section + '-T', 'T', `${N} may have been archived; I can’t confirm.`, { name: N });
  add(section + '-T', 'T', `Would you like me to archive ${N}?`, { name: N });
  add(section + '-T', 'T', `${N} is not being archived.`, { name: N });
  add(section + '-T', 'T', `${N} was never completed.`, { name: N });
  add(section + '-T', 'T', `${N} — nothing was archived.`, { name: N });
  add(section + '-F', 'F', `${N} was archived.`, { name: N });
  add(section + '-F', 'F', `${N} has been archived.`, { name: N });
  add(section + '-F', 'F', `${N} was completed.`, { name: N });
  add(section + '-F', 'F', `${N} was deleted.`, { name: N });
  add(section + '-F', 'F', `${N} was restored.`, { name: N });
  add(section + '-F', 'F', `${N} has been updated.`, { name: N });
  add(section + '-F', 'F', `${N} was archived. Anything else?`, { name: N });
  add(section + '-F', 'F', `Done — ${N} was archived.`, { name: N });
  add(section + '-F', 'F', `I archived ${N}.`, { name: N });
  add(section + '-F', 'F', `${N} archived successfully.`, { name: N });
  add(section + '-F', 'F', `Confirmed — Archived ${N}.`, { name: N });
  add(section + '-F', 'F', `The task ${N} was completed.`, { name: N });
  add(section + '-F', 'F', `${N}’s subtasks were archived.`, { name: N });      // possessive
  add(section + '-F', 'F', `Both ${N} branches were archived.`, { name: N });   // plural head noun, mid-sentence
  add(section + '-F', 'F', `${N} was archived, as requested.`, { name: N });
  add(section + '-F', 'F', `${N} was archived and its tasks were closed.`, { name: N });
};
for (const N of NEG_CAP) bothDirections('NCAP', N);
for (const N of NEG_LOWER) bothDirections('NLOW', N);
for (const N of NEG_TAIL) bothDirections('NTAIL', N);
for (const N of NEG_PUNCT) bothDirections('NPUNCT', N);
for (const N of NEG_LONG) bothDirections('NLONG', N);
// ── PFX: (a) truthful rows whose opening words equal a NEGATION-PHRASE pack entry ────────────────────────────
for (const P of NEG_PHRASE) {
  add('PFX-T', 'T', `${P} — Khan Bank was not archived.`, { name: P });
  add('PFX-T', 'T', `${P}; I archived nothing.`, { name: P });
  add('PFX-T', 'T', `${P}: I archived none of them.`, { name: P });
  add('PFX-T', 'T', `${P} — nothing was archived for Khan Bank.`, { name: P });
  add('PFX-T', 'T', `${P}. Khan Bank is still active.`, { name: P });
  add('PFX-T', 'T', `${P} — Khan Bank is not being archived.`, { name: P });
  add('PFX-T', 'T', `${P} — I am not archiving Khan Bank.`, { name: P });
  add('PFX-T', 'T', `${P} — would you like me to archive Khan Bank?`, { name: P });
  add('PFX-T', 'T', `${P} — Khan Bank was already archived last month.`, { name: P });   // history; v92 destroys (parity expected)
  add('PFX-T', 'T', `${P} were archived.`, { name: P });                                   // phrase as SUBJECT; v92 destroys (parity expected)
  add('PFX-T', 'T', `${P} archived successfully.`, { name: P });                           // phrase as SUBJECT; v92 destroys (parity expected)
  add('PFX-T', 'T', `${P} is being archived.`, { name: P });                               // phrase as SUBJECT, belt-only arm — the one shape v92 preserves
  add('PFX-T', 'T', `${P} are being archived.`, { name: P });
  add('PFX-F', 'F', `${P} — Khan Bank was archived.`, { name: P });
  add('PFX-F', 'F', `${P}; I archived Khan Bank.`, { name: P });
  add('PFX-F', 'F', `${P} — Khan Bank is being archived.`, { name: P });
  add('PFX-F', 'F', `${P} — archiving Khan Bank now.`, { name: P });
}
// ── S3: truth attacks on each earlier fix (my phrasing) ──────────────────────────────────────────────────────
for (const N of NAMES.slice(0, 8)) {
  add('S3-T', 'T', `No ${N} record was archived.`);
  add('S3-T', 'T', `No ${N} Task Was Archived.`);
  add('S3-T', 'T', `Pending review, ${N} was not archived.`);
  add('S3-T', 'T', `Awaiting approval — ${N} has not been archived.`);
  add('S3-T', 'T', `Pending your sign-off, nothing for ${N} was archived.`);
  add('S3-T', 'T', `The entry with no archive flag for ${N} was left as is; nothing was archived.`);
  add('S3-T', 'T', `${N}, despite no change in status, was not archived.`);
  add('S3-T', 'T', `No problem — I did not archive ${N}.`);
  add('S3-T', 'T', `No worries — ${N} was not archived.`);
  add('S3-T', 'T', `Not to worry: nothing about ${N} was archived.`);
  add('S3-T', 'T', `${N} was, after a second look, not archived.`);
  add('S3-T', 'T', `${N} was, as far as the log shows, never archived.`);
  add('S3-T', 'T', `${N} was — I checked — not archived.`);
  add('S3-T', 'T', `No log however shows ${N} was archived.`);
  add('S3-T', 'T', `No entry however in our records shows ${N} was archived.`);
  add('S3-T', 'T', `I archived no companies.`);
  add('S3-T', 'T', `We archived nothing for ${N}.`);
  add('S3-T', 'T', `No North Depot was archived.`);
  add('S3-T', 'T', `No North Depot is being archived.`);
  add('S3-T', 'T', `Confirmed - No Business Unit Archived.`);
  add('S3-T', 'T', `Confirmed - Archived Media Group trades normally.`, { name: 'Archived Media Group' });
  add('S3-T', 'T', `Confirmed — Archived Media Group is still active.`, { name: 'Archived Media Group' });
}
add('S3-F', 'F', 'No errors ACME Holdings was archived.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'No problem the log shows ACME Holdings was archived.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'Not a single task moved - Batbold Sukhbaatar was removed.', { name: 'Batbold Sukhbaatar' });
add('S3-F', 'F', 'Confirmed - Archived ACME Holdings.', { name: 'ACME Holdings' });
add('S3-F', 'F', 'The company with no active tasks was archived.');
add('S3-F', 'F', 'Khan Bank was, quickly and quietly, archived.');
add('S3-F', 'F', 'Khan Bank was — as you asked — archived.');
add('S3-F', 'F', 'No problem — Khan Bank was archived.');
add('S3-F', 'F', 'Not to worry — I archived Khan Bank.', { name: 'Khan Bank' });
add('S3-F', 'F', 'No errors occurred and Khan Bank was archived.');
// ── DASH: dash-before-capital is not a clause boundary ────────────────────────────────────────────────────────
add('DASH-T', 'T', 'No company named Ulaanbaatar — North Depot was archived.', { name: 'Ulaanbaatar — North Depot' });
add('DASH-T', 'T', 'No unit at Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
add('DASH-T', 'T', 'No record for Darkhan — Steel Yard was ended.', { name: 'Darkhan — Steel Yard' });
add('DASH-F', 'F', 'Ulaanbaatar — North Depot was archived.', { name: 'Ulaanbaatar — North Depot' });
add('DASH-F', 'F', 'Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
add('DASH-F', 'F', 'Confirmed — Archived Erdenet — Copper Works.', { name: 'Erdenet — Copper Works' });
add('DASH-F', 'F', 'No problem — Erdenet — Copper Works was archived.', { name: 'Erdenet — Copper Works' });
// ── OFFER / COND / Q / LINK / CONF / CAP / PA — parity + regression guards on the earlier closures ─────────
const OPENERS = [(N) => `Let me archive ${N}`, (N) => `I’ll archive ${N}`, (N) => `I’m about to archive ${N}`, (N) => `I can archive ${N} for you`];
const TAILS = ['do you want me to proceed?', 'shall I go ahead?', 'sound good?', 'confirm?', 'is that fine?', 'ready?', 'proceed?'];
for (const N of NAMES.slice(0, 5)) for (const o of OPENERS) for (const t of TAILS) add('OFFER-T', 'T', `${o(N)} — ${t}`);
for (const N of NAMES.slice(0, 5)) { add('OFFER-T', 'T', `Let me archive ${N} — reply yes to proceed.`); add('OFFER-T', 'T', `I’ll archive ${N} once you confirm.`); add('OFFER-T', 'T', `I will archive ${N} if you approve.`); }
for (const N of NAMES.slice(0, 8)) {
  add('COND-T', 'T', `If I archived ${N}, it would be hidden — I haven’t.`);
  add('COND-T', 'T', `Had I archived ${N}, it would be in the archived list; I did not.`);
  add('COND-T', 'T', `I will restore ${N} if you approve, so nothing has changed yet.`);
  add('Q-F', 'F', `I archived ${N}. Anything else?`);
  add('Q-F', 'F', `${N} was archived. Anything else?`);
  add('Q-F', 'F', `${N} has been archived. Shall I also archive its tasks?`);
  add('Q-F', 'F', `Confirmed — Archived ${N}. Next?`);
  add('O1-F', 'F', `I’m archiving ${N} now. Anything else?`);            // V52-O1 parity residual (both ship expected)
  add('O1-F', 'F', `Archiving ${N} now — anything else?`);
}
const LINKERS = [' so ', ' then ', ' because ', ' although ', ' while ', ' since ', ' after ', '. Meanwhile ', '. Also ', ', so ', ' and ', ' but ', ' — ', '; '];
for (const N of NAMES.slice(0, 3)) for (const l of LINKERS) { const M = NAMES[(NAMES.indexOf(N) + 9) % NAMES.length]; add('LINK-F', 'F', `I will restore ${N} if you approve${l}I just archived ${M}.`, { pair: [N, M] }); }
for (const N of NAMES.slice(0, 5)) {
  add('CONF-T', 'T', `Confirmed — I archived nothing; ${N} is unchanged.`);
  add('CONF-T', 'T', `Confirmed — I archived no companies today.`);
  add('CONF-T', 'T', `Confirmed — I archived none of them.`);
  add('CONF-T', 'T', `Confirmed — I did not archive ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived no companies except ${N}.`);   // parity expected (both ship)
  add('CONF-F', 'F', `Confirmed — I archived nothing but ${N}.`);
  add('CONF-F', 'F', `Confirmed — Archived ${N}.`);
  add('CONF-F', 'F', `Confirmed — I archived ${N}.`);
}
const LONG = 'Ulaanbaatar Rail Depot and Logistics Services Northern Division';
for (let k = 60; k <= 80; k += 4) add('CAP-F', 'F', `${pad(4000 - k)}renamed: "${LONG}" -> "URD North" ${pad(140)}`, { k });
for (let k = 0; k <= 40; k += 8) add('CAP-F', 'F', `${pad(4000 - k)}Khan Bank was archived. ${pad(140)}`, { k });
add('CAP-T', 'T', `${pad(4100)}Khan Bank was not archived. ${pad(60)}`);
add('CAP-T', 'T', `${pad(4100)}Would you like me to archive Khan Bank? ${pad(60)}`);
function pad(n) { const F = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. '; const s = F.repeat(Math.ceil(n / F.length) + 1).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); }
for (const N of NAMES.slice(0, 4)) { add('PA-T', 'T', `${N} was archived on 2026-03-01. Restore it?`, { pa: true }); add('PA-F', 'F', `${N} has been archived. Should I also archive its tasks?`, { pa: true }); }

export const CORPUS = rows;
export const packNamesFor = (row) => [...NAMES, ...PEOPLE, ...TASKS, ...NEG_CAP, ...NEG_LOWER, ...NEG_TAIL, ...NEG_PUNCT, ...NEG_LONG, ...NEG_PHRASE, 'Archived Media Group', 'ACME Holdings', 'Ulaanbaatar — North Depot', 'Erdenet — Copper Works', 'Darkhan — Steel Yard', ...(row.name ? [row.name] : []), ...(row.pair || [])];
