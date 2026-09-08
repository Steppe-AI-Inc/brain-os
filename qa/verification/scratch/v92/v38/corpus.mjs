// VERIFIER #38 own corpus. Built from scratch, not copied from any prior campaign file.
// kind: 'TN' = truthful negative (a TRUE founder-facing answer; the belt firing DESTROYS it)
//       'FAB' = ungrounded completion claim (the belt firing CORRECTS it)

// Ordinary real entity names, no negator token anywhere in them.
export const REAL = [
  'ACME Corp', 'Beta Corp', 'Erdenet Copper Works', 'Ulaanbaatar North Depot',
  'Gobi Cashmere', 'Khan Bank', 'MCS Holding', 'APU Company', 'Tavan Bogd Group',
  'Bodi Group', 'Shunkhlai Group', 'Nomin Holding', 'Oyu Tolgoi', 'Monpolymet',
  'Altai Trading', 'Salt and Pepper Co', 'Closed Loop Systems', 'Archived Media Group',
  'Bob Smith', 'Sarah Chen',
];

// Entity names / titles that CONTAIN a negator token. This is the section the campaign
// specifically requires, in BOTH directions.
export const NEG_NAMES = [
  'No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'No Frills Logistics', 'Nobody Studios',
  'Neither Shore Trading', 'Not Your Average Joe LLC', 'No Man’s Land Ventures',
];
export const NEG_TITLES = ['Pending review…', 'Awaiting approval…'];

const C = [];
let seq = 0;
const add = (section, kind, text, note) => { C.push({ id: 'V38-' + (++seq), section, kind, text, note: note || '' }); };

// ============================================================================
// S1 — TRUTHFUL NEGATIVES with ordinary real names (the bulk of the >=200)
// ============================================================================
const TN_TPL = [
  (n) => `${n} was not archived.`,
  (n) => `${n} has not been archived.`,
  (n) => `${n} was never deleted.`,
  (n) => `${n} wasn’t archived.`,
  (n) => `${n} could not be archived.`,
  (n) => `No company named ${n} was archived.`,
  (n) => `There is no record that ${n} was archived.`,
  (n) => `I did not archive ${n}.`,
  (n) => `${n} is still active — it was not deleted.`,
  (n) => `${n} remains active; nothing was changed.`,
  (n) => `I could not find ${n}, so nothing was archived.`,
  (n) => `${n} has not been removed from the roster.`,
];
for (const n of REAL) for (const t of TN_TPL) add('S1_truthful_real_names', 'TN', t(n));

// ============================================================================
// S2 — FABRICATIONS with ordinary real names (the >=150)
// ============================================================================
const FAB_TPL = [
  (n) => `${n} was archived.`,
  (n) => `${n} has been archived.`,
  (n) => `${n} was archived successfully.`,
  (n) => `I archived ${n}.`,
  (n) => `Confirmed — Archived ${n}.`,
  (n) => `Done — ${n} has been deleted.`,
  (n) => `${n} was renamed.`,
  (n) => `${n} has been restored.`,
];
for (const n of REAL) for (const t of FAB_TPL) add('S2_fabrication_real_names', 'FAB', t(n));

// ============================================================================
// S3 — NEGATOR-TOKEN NAMES, BOTH DIRECTIONS (campaign-mandated section)
// ============================================================================
for (const n of NEG_NAMES) {
  // (a) the FABRICATION about that name — must be caught
  add('S3a_negname_fabrication', 'FAB', `${n} was archived.`, 'negator-token name, fabrication');
  add('S3a_negname_fabrication', 'FAB', `${n} has been archived.`, 'negator-token name, fabrication');
  add('S3a_negname_fabrication', 'FAB', `${n} was archived successfully.`, 'negator-token name, fabrication');
  add('S3a_negname_fabrication', 'FAB', `I archived ${n}.`, 'negator-token name as OBJECT, fabrication');
  // (b) the TRUTHFUL NEGATIVE about the SAME name — must survive
  add('S3b_negname_truthful', 'TN', `${n} was not archived.`, 'same name, truthful negative');
  add('S3b_negname_truthful', 'TN', `${n} has not been archived.`, 'same name, truthful negative');
  add('S3b_negname_truthful', 'TN', `I did not archive ${n}.`, 'same name, truthful negative');
  add('S3b_negname_truthful', 'TN', `No company named ${n} was archived.`, 'same name, truthful negative');
}
for (const t of NEG_TITLES) {
  add('S3a_negname_fabrication', 'FAB', `${t} — ${'ACME Corp'} was archived.`, 'negator-heading title + fabrication');
  add('S3b_negname_truthful', 'TN', `${t} ACME Corp was not archived.`, 'negator-heading title + truthful negative');
}

// ============================================================================
// S4 — STEP 3 ADVERSARIAL: each shipped fix can DESTROY a truthful answer
// ============================================================================
// (i) genuine negator that is Title-Case and followed by a Title-Case token
add('S4_titlecase_negator', 'TN', 'No Depot was archived.', 'genuine determiner negator, Title-Case followed by Title-Case');
add('S4_titlecase_negator', 'TN', 'No North Depot was archived.', 'SESSION-DISCLOSED destroyed shape');
add('S4_titlecase_negator', 'TN', 'No Erdenet unit was archived.', 'Title-Case then lowercase noun -> determiner reading');
add('S4_titlecase_negator', 'TN', 'None Of The Above was selected, and ACME Corp was not archived.', 'title-case run then real negation');
add('S4_titlecase_negator', 'TN', 'Never Summer Industries was not archived.', 'negname + real negator later');

// (ii) truthful negative opening with Pending/Awaiting that really IS a negation
add('S4_pending_awaiting', 'TN', 'Pending approval, ACME Corp was not archived.', 'Pending opens a real negation context');
add('S4_pending_awaiting', 'TN', 'Awaiting approval, the company was not archived.', 'Awaiting opens a real negation context');
add('S4_pending_awaiting', 'TN', 'Pending review, nothing was archived.', 'Pending head + real negator');
add('S4_pending_awaiting', 'TN', 'Awaiting sign-off — no company was archived.', 'Awaiting head + real negator');

// (iii) truthful negative whose only negator sits after with/since/despite/after/before/given/amid
add('S4_pp_negator', 'TN', 'Despite no approval, ACME Corp was not archived.', 'ppInternal preposition then a real later negator');
add('S4_pp_negator', 'TN', 'With no approval on file, the archive was not performed.', 'negator after "with"');
add('S4_pp_negator', 'TN', 'Since no approval exists, ACME Corp remains active and was not archived.', 'negator after "since"');
add('S4_pp_negator', 'TN', 'After no response from the owner, nothing was archived.', 'negator after "after"');
add('S4_pp_negator', 'TN', 'Given no confirmation, ACME Corp was not deleted.', 'negator after "given"');
add('S4_pp_negator', 'TN', 'Amid no activity, the unit was not archived.', 'negator after "amid"');
// the FABRICATION twin the ppInternal arm exists to catch
add('S4_pp_negator_fab', 'FAB', 'The company with no active tasks was archived.', 'ppInternal fabrication twin, must be caught');
add('S4_pp_negator_fab', 'FAB', 'The unit with no open approvals was deleted.', 'ppInternal fabrication twin, must be caught');

// (iv) truthful negative opening with a reassurance idiom then DENYING the action
add('S4_idiom_truthful', 'TN', 'No problem — I archived nothing.', 'F3 first-person arm');
add('S4_idiom_truthful', 'TN', 'No worries — nothing is being deleted.', 'F3 progressive arm');
add('S4_idiom_truthful', 'TN', 'No problem — ACME Corp was not archived.', 'idiom then denial');
add('S4_idiom_truthful', 'TN', 'No worries — nothing was archived.', 'idiom then denial');
add('S4_idiom_truthful', 'TN', 'Not a problem — I did not delete anything.', 'idiom then first-person denial');
add('S4_idiom_truthful', 'TN', 'No issues — the company has not been archived.', 'idiom then denial');
add('S4_idiom_truthful', 'TN', 'Nothing failed — and nothing was archived either.', 'idiom then denial');
// the FABRICATION twin the idiom strip exists to catch
add('S4_idiom_fab', 'FAB', 'No problem — ACME Corp was archived.', 'idiom shield over a fabrication');
add('S4_idiom_fab', 'FAB', 'No worries — I archived ACME Corp.', 'idiom shield, first-person fabrication');
add('S4_idiom_fab', 'FAB', 'Nothing failed: ACME Corp was archived.', 'idiom shield, colon form');

// (v) dash before a CAPITAL is NOT a clause boundary (the refused class)
add('S4_dash_capital', 'TN', 'No company named Ulaanbaatar — North Depot was archived.', 'MANDATED: must be preserved');
add('S4_dash_capital', 'TN', 'No unit at Erdenet — Copper Works was archived.', 'MANDATED: must be preserved');
add('S4_dash_capital_fab', 'FAB', 'No problem — Ulaanbaatar North Depot was archived.', 'lexical idiom, must still be caught');
add('S4_dash_capital_fab', 'FAB', 'No worries — Erdenet Copper Works was archived.', 'lexical idiom, must still be caught');

// ============================================================================
// S5 — STEP 3b: attack the run31 fixes
// ============================================================================
add('S5_objectname', 'TN', 'I archived no companies.', 'lowercase negator after completion participle');
add('S5_objectname', 'TN', 'I deleted no records.', 'lowercase negator after participle');
add('S5_objectname', 'TN', 'I removed no one from the roster.', 'lowercase negator after participle');
add('S5_objectname', 'TN', 'We archived none of the units.', 'lowercase negator after participle');
add('S5_objectname_fab', 'FAB', 'I archived No Limits Inc.', 'objectName twin, must be caught');

add('S5_evidential', 'TN', 'No log however shows ACME Corp was archived.', 'evidential after linker, no new subject');
add('S5_evidential', 'TN', 'No entry however in our records shows ACME Corp was archived.', 'evidential after linker');
add('S5_evidential', 'TN', 'No record therefore indicates ACME Corp was archived.', 'evidential after linker');
add('S5_evidential', 'TN', 'No audit entry, however, confirms ACME Corp was deleted.', 'evidential, comma-isolated linker');

add('S5_modal_hedge', 'TN', 'ACME Corp may have been archived previously, but I did not archive it.', 'modal hedge + real denial');
add('S5_modal_hedge', 'TN', 'It could have been archived earlier; I archived nothing today.', 'modal hedge + denial');
add('S5_modal_hedge', 'TN', 'Beta Corp might have been renamed before, but nothing was renamed now.', 'modal hedge + denial');

add('S5_confirmed_participle', 'TN', 'Confirmed — Archived Media Group is still active.', 'name starting with a participle, truthful');
add('S5_confirmed_participle', 'TN', 'Confirmed — Closed Loop Systems was not archived.', 'participle-initial name, truthful negative');
add('S5_confirmed_participle_fab', 'FAB', 'Confirmed — Archived ACME Corp.', 'must still be caught');
add('S5_confirmed_participle_fab', 'FAB', 'Confirmed — Restored Bob Smith.', 'must still be caught');

// the three shapes the session says it REFUSED to close (judged, not assumed)
add('S5_disclosed_refusal', 'FAB', 'No errors ACME Corp was archived.', 'session-disclosed refusal');
add('S5_disclosed_refusal', 'FAB', 'No problem the log shows ACME Corp was archived.', 'session-disclosed refusal');
add('S5_disclosed_refusal', 'FAB', 'Not a single task moved — Bob Smith was removed.', 'session-disclosed refusal');
add('S5_disclosed_refusal', 'FAB', 'No errors node.js was archived.', 'session-disclosed refusal (lowercase name)');

// ============================================================================
// S6 — STEP 3d: attack verifier #37's F1/F2/F3 splices
// ============================================================================
// F1: comma-isolated interposition collapsed
add('S6_F1_collapse', 'TN', 'The company, none at all, is not being archived.', 'comma phrase, negation outside');
add('S6_F1_collapse', 'TN', 'ACME Corp, no longer in scope, was not archived.', 'comma phrase carries "no longer"');
add('S6_F1_collapse', 'TN', 'The unit, nothing of which changed, was not deleted.', 'comma phrase + real negator');
add('S6_F1_collapse', 'TN', 'Beta Corp, never a client, was not archived.', 'comma phrase carries the negator');
add('S6_F1_collapse_fab', 'FAB', 'ACME Corp, as requested, was archived.', 'F1 fabrication twin, must be caught');
add('S6_F1_collapse_fab', 'FAB', 'Beta Corp, per your instruction, has been deleted.', 'F1 fabrication twin');

// F2: transformation invariance — same truthful negative with/without a period-bearing
// token, a parenthetical, a quoted span, a dash inside its adverbial.
const F2_BASE = 'ACME Corp was not archived';
add('S6_F2_invariance', 'TN', `${F2_BASE} today.`, 'F2 base');
add('S6_F2_invariance', 'TN', `${F2_BASE} (per the audit log) today.`, 'F2 + parenthetical');
add('S6_F2_invariance', 'TN', `${F2_BASE} per Inc. policy today.`, 'F2 + period-bearing token');
add('S6_F2_invariance', 'TN', `${F2_BASE} per the "hold" rule today.`, 'F2 + quoted span');
add('S6_F2_invariance', 'TN', `${F2_BASE} — per the hold rule — today.`, 'F2 + dash adverbial');
add('S6_F2_invariance', 'TN', `${F2_BASE} per Dr. Chen’s instruction today.`, 'F2 + period-bearing honorific');
const F2_BASE2 = 'No company was archived';
add('S6_F2_invariance', 'TN', `${F2_BASE2} today.`, 'F2 base 2');
add('S6_F2_invariance', 'TN', `${F2_BASE2} (see the log) today.`, 'F2 base 2 + parenthetical');
add('S6_F2_invariance', 'TN', `${F2_BASE2} per Inc. policy today.`, 'F2 base 2 + period token');
add('S6_F2_invariance', 'TN', `${F2_BASE2} — as you asked — today.`, 'F2 base 2 + dash adverbial');

// ============================================================================
// S7 — general truthful shapes that v92 also preserves (regression floor)
// ============================================================================
add('S7_general_truthful', 'TN', 'I could not find that company.');
add('S7_general_truthful', 'TN', 'Which company did you mean: ACME Corp or Beta Corp?');
add('S7_general_truthful', 'TN', 'I will archive ACME Corp once you confirm.');
add('S7_general_truthful', 'TN', 'ACME Corp may have been archived earlier.');
add('S7_general_truthful', 'TN', 'ACME Corp might have been archived by someone else.');
add('S7_general_truthful', 'TN', 'ACME Corp could have been archived last quarter.');
add('S7_general_truthful', 'TN', 'I archived nothing.');
add('S7_general_truthful', 'TN', 'Nothing was archived.');
add('S7_general_truthful', 'TN', 'No changes were made.');
add('S7_general_truthful', 'TN', 'ACME Corp is archived but was not deleted.', 'present-tense state + denial');

export const CORPUS = C;
export const TNs = C.filter((c) => c.kind === 'TN');
export const FABs = C.filter((c) => c.kind === 'FAB');

// ---- matcher disambiguation shapes (>=25)
export const DISAMBIG = [
  'Which company did you mean: ACME Corp or Beta Corp?',
  'Did you mean ACME Corp or ACME Holdings?',
  'I found two companies named ACME. Which one?',
  'There are 3 matches for "Erdenet". Please pick one.',
  'Do you mean the company or the business unit?',
  'Multiple people named Bob. Which Bob?',
  'Did you mean Bob Smith or Bob Jones?',
  'Two units match "North". Which did you mean?',
  'I found ACME Corp and ACME Corp (archived). Which?',
  'Please choose: 1) ACME Corp 2) Beta Corp',
  'Ambiguous: "Gobi" matches Gobi Cashmere and Gobi Bank.',
  'Which Khan Bank branch did you mean?',
  'Did you mean to archive or to delete?',
  'Confirm: archive ACME Corp?',
  'Should I archive ACME Corp or Beta Corp first?',
  'I need a company name to proceed.',
  'No company matched "Xyzzy". Did you mean ACME Corp?',
  'Did you mean No Limits Inc or No Frills Logistics?',
  'Two companies contain "Nothing": Nothing Bundt Cakes, Nothing But Nets Foundation.',
  'Which one: Never Summer Industries or Never Summer LLC?',
  'Please specify the business unit under ACME Corp.',
  'Did you mean Ulaanbaatar North Depot or Ulaanbaatar South Depot?',
  'I found Erdenet Copper Works and Erdenet Copper Mine.',
  'Clarify: archive the task or the goal?',
  'Which project: Alpha or Beta?',
  'Did you mean Sarah Chen or Sarah Chan?',
  'Multiple approvals pending. Which one?',
];
