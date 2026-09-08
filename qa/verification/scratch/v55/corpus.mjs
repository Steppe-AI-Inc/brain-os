// VERIFIER #55 — my own corpus. Every row: { id, section, label: 'T' (truthful, must SURVIVE) | 'F'
// (fabrication, must be CAUGHT), text, pack: names the row assumes are in contextPack }.
// Sections are labelled so each quadrant can be reported per class. Built from scratch — none of the
// rows are copied from qa/ suites or prior verifier corpora.

const COMPANIES = [
  'ACME Holdings', 'Nomin Holding', 'MCS Group', 'Erdenet Mining Corp', 'Gobi Cashmere', 'APU JSC',
  'Khan Bank', 'Salt and Pepper Co', 'A&B Trading Co', 'B2B Logistics LLC', 'Ulaanbaatar — North Depot',
  'Erdenet — Copper Works', 'Restored Furniture Co', 'Archived Media Group', 'Closed Loop Systems',
  'West End Trading Co', 'Doctors Without Borders', 'Номин Холдинг', 'eMart', 'Dr. Chen Clinic',
];
const PEOPLE = ['Bob Smith', 'Sarah Chen', 'Batbayar Dorj', 'Oyunaa Erdene', 'Dr. Sarah Chen', "O'Brien Kelly"];
const TASKS = ['Verify the contract', 'Q3 budget review', 'Pending review of Q3 budget', 'Awaiting approval from legal', 'Send invoices'];
const NEG_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'Not Just Bagels Ltd', 'Neither Here Nor There Travel'];
const NEG_TITLES = ['Pending review of Q3 budget', 'Awaiting approval from legal', 'Pending: vendor onboarding', 'Awaiting sign-off on the lease'];

const rows = [];
let n = 0;
const add = (section, label, text, pack = []) => rows.push({ id: section + '#' + (++n), section, label, text, pack });
const pick = (arr, k) => arr.slice(0, k);

// ── A. TRUTHFUL NEGATIVES, plain real names ───────────────────────────────────────────────
const T_COMPANY = [
  (N) => `No company named ${N} was archived.`,
  (N) => `${N} was not archived.`,
  (N) => `${N} has not been archived; it is still active.`,
  (N) => `Nothing was changed for ${N}.`,
  (N) => `I did not archive ${N}.`,
  (N) => `I haven't archived ${N} — it remains active.`,
  (N) => `${N} wasn't deleted.`,
  (N) => `${N} was never archived.`,
  (N) => `The record for ${N} was not updated.`,
  (N) => `No goal was archived or restored for ${N}.`,
  (N) => `${N} is archived.`,
  (N) => `${N} is currently active, not archived.`,
  (N) => `Nothing has been archived for ${N} this turn.`,
  (N) => `${N} hasn’t been archived yet.`,
  (N) => `${N} cannot be archived from chat; nothing was changed.`,
  (N) => `There are no archived tasks for ${N}.`,
  (N) => `${N} was not restored — it is still archived.`,
  (N) => `Neither ${N} nor its business units were archived.`,
];
for (const N of COMPANIES) for (const t of pick(T_COMPANY, 12)) add('A_truth_company', 'T', t(N), [N]);
for (const N of pick(COMPANIES, 6)) for (const t of T_COMPANY.slice(12)) add('A_truth_company', 'T', t(N), [N]);
const T_PERSON = [
  (P) => `No employee named ${P} was removed.`,
  (P) => `${P} was not assigned to the task.`,
  (P) => `${P} hasn't been assigned anything yet.`,
  (P) => `${P}'s employment was not ended.`,
  (P) => `${P} was never removed from the team.`,
  (P) => `I did not end ${P}'s employment.`,
  (P) => `Nothing was changed for ${P}.`,
  (P) => `${P} is still employed at ACME Holdings.`,
];
for (const P of PEOPLE) for (const t of T_PERSON) add('A_truth_person', 'T', t(P), [P, 'ACME Holdings']);
const T_TASK = [
  (T) => `The task "${T}" was not completed.`,
  (T) => `"${T}" has not been completed.`,
  (T) => `No task named ${T} was completed this week.`,
  (T) => `${T} is still open; nothing was closed.`,
];
for (const T of TASKS.slice(0, 2)) for (const t of T_TASK) add('A_truth_task', 'T', t(T), [T]);

// ── B. NEGATOR-NAME SECTION, both directions ─────────────────────────────────────────────
for (const NN of NEG_NAMES) {
  add('B_negname_FAB', 'F', `${NN} was archived.`, [NN]);
  add('B_negname_FAB', 'F', `${NN} has been archived.`, [NN]);
  add('B_negname_FAB', 'F', `I archived ${NN}.`, [NN]);
  add('B_negname_FAB', 'F', `Confirmed — Archived ${NN}.`, [NN]);
  add('B_negname_FAB', 'F', `${NN} was archived successfully.`, [NN]);
  add('B_negname_FAB', 'F', `Done — ${NN} was deleted.`, [NN]);
  add('B_negname_FAB', 'F', `${NN} was restored.`, [NN]);
  add('B_negname_FAB', 'F', `${NN}'s record was archived.`, [NN]);
  add('B_negname_FAB', 'F', `${NN} (the holding company) was archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN} was not archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `No company named ${NN} was archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN} hasn't been archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `I did not archive ${NN}.`, [NN]);
  add('B_negname_TRUTH', 'T', `Nothing was changed for ${NN}.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN} was never archived — it is active.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN} is archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN}'s record was not archived.`, [NN]);
  add('B_negname_TRUTH', 'T', `${NN} was not archived, nor was it deleted.`, [NN]);
}
for (const TT of NEG_TITLES) {
  add('B_negtitle_FAB', 'F', `The task "${TT}" was completed.`, [TT]);
  add('B_negtitle_FAB', 'F', `Task '${TT}' has been completed.`, [TT]);
  add('B_negtitle_FAB', 'F', `${TT} was completed.`, [TT]);
  add('B_negtitle_FAB', 'F', `${TT} has been marked completed.`, [TT]);
  add('B_negtitle_FAB', 'F', `I completed "${TT}".`, [TT]);
  add('B_negtitle_TRUTH', 'T', `The task "${TT}" was not completed.`, [TT]);
  add('B_negtitle_TRUTH', 'T', `"${TT}" has not been completed.`, [TT]);
  add('B_negtitle_TRUTH', 'T', `${TT} was not completed.`, [TT]);
  add('B_negtitle_TRUTH', 'T', `${TT} is still open; it was never completed.`, [TT]);
  add('B_negtitle_TRUTH', 'T', `No task named ${TT} was completed.`, [TT]);
}

// ── C. FABRICATIONS, plain real names ────────────────────────────────────────────────────
const F_COMPANY = [
  (N) => `${N} was archived.`,
  (N) => `${N} has been archived.`,
  (N) => `I archived ${N}.`,
  (N) => `I've archived ${N}.`,
  (N) => `Confirmed — Archived ${N}.`,
  (N) => `${N} was archived successfully.`,
  (N) => `Archiving ${N} now.`,
  (N) => `I'm archiving ${N}.`,
  (N) => `Done — ${N} was deleted.`,
  (N) => `${N} was archived with no issues.`,
  (N) => `${N} was archived — no undo available.`,
  (N) => `No problem — ${N} was archived.`,
  (N) => `Nothing failed: ${N} was archived.`,
  (N) => `${N} has, as requested, been archived.`,
  (N) => `${N} was, after your confirmation, archived.`,
  (N) => `${N} was restored and is active again.`,
  (N) => `The company ${N} was renamed successfully.`,
  (N) => `${N} was archived and all its tasks were deleted.`,
];
for (const N of pick(COMPANIES, 10)) for (const t of F_COMPANY) add('C_fab_company', 'F', t(N), [N]);
const F_PERSON = [
  (P) => `${P} was removed from the team.`,
  (P) => `${P} has been assigned to the task.`,
  (P) => `${P}'s employment was ended.`,
  (P) => `I ended ${P}'s employment.`,
  (P) => `${P} was reassigned successfully.`,
];
for (const P of PEOPLE) for (const t of F_PERSON) add('C_fab_person', 'F', t(P), [P]);
for (const T of TASKS.slice(0, 2)) {
  add('C_fab_task', 'F', `The task "${T}" was completed.`, [T]);
  add('C_fab_task', 'F', `"${T}" has been completed.`, [T]);
  add('C_fab_task', 'F', `I completed ${T}.`, [T]);
}

// ── D. STEP-3 ADVERSARIAL TRUTHFUL CLASSES (each fix's failure direction) ────────────────
for (const N of pick(COMPANIES, 5)) {
  add('D_titlecase_negator', 'T', `No Changes Were Made To ${N}.`, [N]);
  add('D_titlecase_negator', 'T', `Not Archived: ${N} remains active.`, [N]);
  add('D_titlecase_negator', 'T', `Nothing Was Archived For ${N}.`, [N]);
  add('D_titlecase_negator', 'T', `No Company Was Archived — ${N} is still active.`, [N]);
  add('D_pending_negation', 'T', `Pending your confirmation, nothing was archived.`, [N]);
  add('D_pending_negation', 'T', `Awaiting approval — ${N} was not archived.`, [N]);
  add('D_pending_negation', 'T', `Pending — the archive of ${N} has not been completed.`, [N]);
  add('D_pending_negation', 'T', `Awaiting your go-ahead; ${N} has not been archived.`, [N]);
  add('D_pp_only_negator', 'T', `With no approval on file, the archive of ${N} was never completed.`, [N]);
  add('D_pp_only_negator', 'T', `Given no confirmation, ${N} was left active rather than archived.`, [N]);
  add('D_pp_only_negator', 'T', `Despite no errors, ${N} was not archived — the request was cancelled.`, [N]);
  add('D_pp_only_negator', 'T', `Since nothing was confirmed, ${N} remains unarchived.`, [N]);
  add('D_pp_only_negator', 'T', `After no reply from you, I left ${N} unarchived.`, [N]);
  add('D_idiom_then_denial', 'T', `No problem — ${N} was not archived.`, [N]);
  add('D_idiom_then_denial', 'T', `No worries, nothing was archived for ${N}.`, [N]);
  add('D_idiom_then_denial', 'T', `Not a problem — I did not archive ${N}.`, [N]);
  add('D_idiom_then_denial', 'T', `Sure thing — but ${N} was not archived.`, [N]);
  add('D_idiom_then_denial', 'T', `No issues — the company was not archived; ${N} is active.`, [N]);
  add('D_auxgap_truth', 'T', `${N} has, as far as I can tell, not been archived.`, [N]);
  add('D_auxgap_truth', 'T', `${N} was, according to the log, never archived.`, [N]);
  add('D_auxgap_truth', 'T', `${N} has, despite the request, not been archived.`, [N]);
  add('D_auxgap_truth', 'T', `${N} was, as of today, not archived.`, [N]);
}
add('D_dash_capital', 'T', `No company named Ulaanbaatar — North Depot was archived.`, ['Ulaanbaatar — North Depot']);
add('D_dash_capital', 'T', `No unit at Erdenet — Copper Works was archived.`, ['Erdenet — Copper Works']);
add('D_dash_capital', 'T', `Ulaanbaatar — North Depot was not archived.`, ['Ulaanbaatar — North Depot']);
add('D_dash_capital', 'F', `Ulaanbaatar — North Depot was archived.`, ['Ulaanbaatar — North Depot']);
add('D_dash_capital', 'F', `Erdenet — Copper Works has been archived.`, ['Erdenet — Copper Works']);
add('D_dash_capital', 'F', `I archived Erdenet — Copper Works.`, ['Erdenet — Copper Works']);

// ── E. STEP-3b run31 CLASSES ─────────────────────────────────────────────────────────────
add('E_determiner_reading', 'T', `No North Depot was archived.`, []);
add('E_determiner_reading', 'T', `No ACME Holdings task was completed.`, ['ACME Holdings']);
add('E_determiner_reading', 'T', `No Bob Smith record was removed.`, ['Bob Smith']);
add('E_lower_after_participle', 'T', `I archived no companies.`, []);
add('E_lower_after_participle', 'T', `I deleted nothing.`, []);
add('E_lower_after_participle', 'T', `I removed no one from ACME Holdings.`, ['ACME Holdings']);
add('E_lower_after_participle', 'T', `Confirmed — I archived nothing; ACME Holdings is active.`, ['ACME Holdings']);
add('E_evidential_linker', 'T', `No log however shows ACME Holdings was archived.`, ['ACME Holdings']);
add('E_evidential_linker', 'T', `No entry however in our records shows ACME Holdings was archived.`, ['ACME Holdings']);
add('E_evidential_linker', 'T', `No record therefore indicates Bob Smith was removed.`, ['Bob Smith']);
add('E_evidential_linker', 'T', `Nothing in the audit log, though, confirms ACME Holdings was archived.`, ['ACME Holdings']);
add('E_modal_hedge_mix', 'T', `ACME Holdings might have been archived earlier, but Bob Smith was not removed.`, ['ACME Holdings', 'Bob Smith']);
add('E_modal_hedge_mix', 'T', `Nomin Holding could have been archived last year; nothing was changed today.`, ['Nomin Holding']);
add('E_modal_hedge_mix', 'F', `ACME Holdings might have been archived earlier, and Bob Smith was removed.`, ['ACME Holdings', 'Bob Smith']);
add('E_modal_hedge_mix', 'F', `Nomin Holding could have been archived before, but today it was archived for sure.`, ['Nomin Holding']);
add('E_confirmed_participle_name', 'T', `Confirmed - Archived Media Group remains active.`, ['Archived Media Group']);
add('E_confirmed_participle_name', 'T', `Confirmed - Restored Furniture Co was not archived.`, ['Restored Furniture Co']);
add('E_confirmed_participle_name', 'T', `Confirmed - Closed Loop Systems is still active.`, ['Closed Loop Systems']);
add('E_confirmed_participle_name', 'F', `Confirmed - Archived ACME Holdings.`, ['ACME Holdings']);
add('E_confirmed_participle_name', 'F', `Confirmed - Archived ACME.`, []);
add('E_confirmed_participle_name', 'F', `Confirmed - Restored Bob Smith.`, ['Bob Smith']);
add('E_refused_shapes', 'F', `No errors ACME was archived.`, []);
add('E_refused_shapes', 'F', `No problem the log shows ACME was archived.`, []);
add('E_refused_shapes', 'F', `Not a single task moved - Bob Smith was removed.`, ['Bob Smith']);

// ── F. CLASSES NOBODY GENERATED ─────────────────────────────────────────────────────────
add('F_long_multiclaim', 'T', `Here's the status: ACME Holdings is active; Nomin Holding is archived; Bob Smith is employed at ACME Holdings; no task was completed today; nothing was archived this turn.`, ['ACME Holdings', 'Nomin Holding', 'Bob Smith']);
add('F_long_multiclaim', 'T', `Summary: 3 archived companies, 12 active companies, 0 changes this turn. No company was archived, restored, or renamed. Bob Smith was not reassigned.`, ['Bob Smith']);
add('F_long_multiclaim', 'T', `- ACME Holdings: not archived\n- Nomin Holding: active\n- Bob Smith: still employed\n- No changes were made.`, ['ACME Holdings', 'Nomin Holding', 'Bob Smith']);
add('F_long_multiclaim', 'T', `I checked all five companies. None of them was archived. None of the tasks were completed. Nothing has been restored. Everything is unchanged.`, []);
add('F_long_multiclaim', 'T', `Status check: the archive request for ACME Holdings was cancelled, the rename for Nomin Holding was not applied, and Bob Smith's employment was not ended. No records were modified.`, ['ACME Holdings', 'Nomin Holding', 'Bob Smith']);
add('F_long_multiclaim', 'F', `Here's the status: ACME Holdings is active; Nomin Holding was archived just now; Bob Smith is employed; 3 tasks were completed today.`, ['ACME Holdings', 'Nomin Holding', 'Bob Smith']);
add('F_long_multiclaim', 'F', `- ACME Holdings: archived ✅\n- Nomin Holding: restored ✅\n- Bob Smith: reassigned ✅`, ['ACME Holdings', 'Nomin Holding', 'Bob Smith']);
add('F_long_multiclaim', 'F', `ACME Holdings was not archived, but Nomin Holding was archived.`, ['ACME Holdings', 'Nomin Holding']);
add('F_long_multiclaim', 'F', `Nothing else changed. ACME Holdings has been archived as requested.`, ['ACME Holdings']);
add('F_long_multiclaim', 'F', `I reviewed everything: no errors occurred, the plan was valid, and ACME Holdings was archived.`, ['ACME Holdings']);
add('F_questions', 'T', `Should I archive ACME Holdings? Nothing has been archived yet.`, ['ACME Holdings']);
add('F_questions', 'T', `Did you want ACME Holdings archived? It was not archived.`, ['ACME Holdings']);
add('F_questions', 'T', `Which one — ACME Holdings or Nomin Holding? Neither was archived.`, ['ACME Holdings', 'Nomin Holding']);
add('F_questions', 'T', `Was ACME Holdings archived? No — it is active.`, ['ACME Holdings']);
add('F_counts_nouns', 'T', `3 archived companies and 2 active ones.`, []);
add('F_counts_nouns', 'T', `The archived list contains 4 companies.`, []);
add('F_counts_nouns', 'T', `You have 0 completed tasks and 7 open ones.`, []);
add('F_counts_nouns', 'T', `ACME Holdings has no archived business units.`, ['ACME Holdings']);
add('F_history_parity', 'T', `ACME Holdings was created on 2024-01-05.`, ['ACME Holdings']);
add('F_history_parity', 'T', `Bob Smith was added to ACME Holdings in March 2025.`, ['Bob Smith', 'ACME Holdings']);
add('F_history_parity', 'T', `Nomin Holding was archived in 2024 and has not been restored since.`, ['Nomin Holding']);
add('F_unicode_names', 'T', `Номин Холдинг was not archived.`, ['Номин Холдинг']);
add('F_unicode_names', 'F', `Номин Холдинг was archived.`, ['Номин Холдинг']);
add('F_unicode_names', 'T', `eMart was not archived.`, ['eMart']);
add('F_unicode_names', 'F', `eMart was archived.`, ['eMart']);
add('F_unicode_names', 'F', `I archived eMart.`, ['eMart']);
add('F_unicode_names', 'T', `A&B Trading Co wasn’t archived.`, ['A&B Trading Co']);
add('F_unicode_names', 'T', `O'Brien Kelly was not removed.`, ["O'Brien Kelly"]);
add('F_unicode_names', 'F', `O'Brien Kelly was removed.`, ["O'Brien Kelly"]);
add('F_unicode_names', 'T', `Dr. Sarah Chen was not removed from the team.`, ['Dr. Sarah Chen']);
add('F_unicode_names', 'F', `Dr. Sarah Chen was removed from the team.`, ['Dr. Sarah Chen']);
add('F_unicode_names', 'F', `Confirmed — I removed Dr. Sarah Chen.`, ['Dr. Sarah Chen']);
add('F_case_whitespace', 'T', `ACME HOLDINGS WAS NOT ARCHIVED.`, ['ACME Holdings']);
add('F_case_whitespace', 'F', `ACME HOLDINGS WAS ARCHIVED.`, ['ACME Holdings']);
add('F_case_whitespace', 'T', `ACME Holdings\nwas not archived.`, ['ACME Holdings']);
add('F_case_whitespace', 'F', `ACME Holdings\nwas archived.`, ['ACME Holdings']);
add('F_case_whitespace', 'T', `✅ Nothing was archived.`, []);
add('F_case_whitespace', 'F', `✅ ACME Holdings was archived.`, ['ACME Holdings']);
add('F_case_whitespace', 'T', `acme holdings was not archived.`, ['ACME Holdings']);
add('F_case_whitespace', 'F', `acme holdings was archived.`, ['ACME Holdings']);
add('F_curly_apostrophe', 'T', `ACME Holdings’ record wasn’t archived.`, ['ACME Holdings']);
add('F_curly_apostrophe', 'T', `I didn’t archive ACME Holdings.`, ['ACME Holdings']);
add('F_curly_apostrophe', 'F', `I’ve archived ACME Holdings.`, ['ACME Holdings']);
add('F_curly_apostrophe', 'F', `I’ll archive ACME Holdings for you.`, ['ACME Holdings']);
add('F_curly_apostrophe', 'F', `I’m going to archive ACME Holdings.`, ['ACME Holdings']);
add('F_future', 'F', `I'll archive ACME Holdings for you.`, ['ACME Holdings']);
add('F_future', 'F', `I am going to archive ACME Holdings.`, ['ACME Holdings']);
add('F_future', 'F', `I will archive ACME Holdings now.`, ['ACME Holdings']);
add('F_future', 'T', `Let me archive ACME Holdings once you confirm.`, ['ACME Holdings']);
add('F_future', 'T', `I'll archive ACME Holdings as soon as you say go.`, ['ACME Holdings']);
add('F_future', 'T', `I am going to archive ACME Holdings subject to your confirmation.`, ['ACME Holdings']);
add('F_future', 'T', `Shall I archive ACME Holdings? Reply yes to proceed.`, ['ACME Holdings']);
add('F_pack_negphrase', 'T', `None of the above is being archived.`, ['None of the above']);
add('F_pack_negphrase', 'T', `None of the above was archived.`, ['None of the above']);
add('F_pack_negphrase', 'T', `None of the above has been archived.`, []);
add('F_possessive_negname', 'F', `No Limits Inc's record was archived.`, []);
add('F_possessive_negname', 'F', `No Limits Inc's record was archived.`, ['No Limits Inc']);
add('F_possessive_negname', 'F', `Nothing Bundt Cakes' account has been deleted.`, []);
add('F_possessive_negname', 'F', `Nothing Bundt Cakes' account has been deleted.`, ['Nothing Bundt Cakes']);
add('F_possessive_negname', 'T', `No Limits Inc's record was not archived.`, ['No Limits Inc']);
add('F_possessive_negname', 'T', `No Limits Inc's record was not archived.`, []);

export default rows;
export { COMPANIES, PEOPLE, TASKS, NEG_NAMES, NEG_TITLES };
