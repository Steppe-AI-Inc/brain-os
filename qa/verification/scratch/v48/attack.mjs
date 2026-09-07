// VERIFIER #48 — generative attack on the CANDIDATE-ONLY arms.
// A truth regression can only exist where v92 PRESERVES and the candidate DESTROYS. v92's three
// arms are LIFECYCLE (lifecycle verb within 40 chars of task/company/goal/employee|person|staff),
// FUTURE_PROMISE and PAST_COMPLETION (aux within 30 chars of a participle). So the entire risk
// surface is the arms the candidate has and v92 does not: EXECUTION_IN_PROGRESS (progressive /
// imminent / let-me), CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION, the first-person active
// arm, the R-AUXGAP blanking, and the reassurance-idiom strip.
// This file GENERATES a large space in each of those shapes and prints every row where v92
// preserves and the candidate destroys, for hand-judgement of truthfulness.
import { makeCandDestroys, v92Arm, v92Destroys } from './harness.mjs';

// The pack is POPULATED with every entity name any generated row names — that is the configuration
// a real turn has, and the one the entity signal is designed for. (The empty-pack case is measured
// separately in differential.mjs --empty.)
const NAMES = ['ACME Corp', 'Gobi Logistics', 'Bob Smith', 'Erdenet Copper Works', 'Delta Freight',
  'Archived Media Group', 'Closed Loop Systems', 'Restored Order Systems', 'Deleted Scenes Media',
  'Ended Employment Ltd', 'Cleared Skies Aviation', 'Granted Wishes Trust',
  'Awaiting Approval Ltd', 'Pending Review Holdings', 'No Limits Inc', 'Nothing Bundt Cakes'];
const cand = makeCandDestroys(NAMES);

const cases = [];
const add = (group, label, text) => cases.push({ group, label, text });

// ── 1. Gerund-initial ordinary prose, main verb outside the guard's finite-verb list ──────────
const GERUNDS = ['Assigning', 'Reassigning', 'Updating', 'Creating', 'Moving', 'Archiving',
  'Restoring', 'Deleting', 'Removing', 'Ending', 'Renaming', 'Closing', 'Clearing', 'Granting',
  'Declining', 'Approving', 'Rejecting', 'Completing', 'Activating', 'Deactivating', 'Adding',
  'Sending', 'Processing', 'Executing', 'Working on', 'Starting the', 'Kicking off'];
const TAILS = [
  'a record triggers an audit entry.',
  'records triggers audit entries.',
  'QA-VERIFY-ROW triggers an audit entry.',
  'in bulk generates one entry per row.',
  'from chat produces the same result as the UI.',
  'here counts against your monthly quota.',
  'is described in the handbook.',
  'happens only after you confirm.',
  'first helps keep the list tidy.',
  'the wrong row would be bad.',
  'anything at all logs an audit row.',
  'them one by one gets tedious.',
];
for (const g of GERUNDS) for (const t of TAILS) add('G1-gerund-help', 'T', `${g} ${t}`);

// ── 2. Quoted UI strings and questions containing progressive wording ─────────────────────────
const G2 = [
  'The button label reads "Archiving…" while the job runs.',
  'The status column shows "Deleting" for a few seconds.',
  'You will see "Processing the request" in the toast.',
  'Should I be archiving these, or leaving them?',
  'Were you archiving ACME Corp yourself, or asking me to?',
  'Why is the page stuck on "Restoring"?',
  'The log line is: now archiving 3 rows.',
  'The docs say: "I am archiving" is not a status the API returns.',
  'Nothing is archiving right now.',
  'Nothing is being archived right now.',
  'No job is currently archiving anything.',
  'I am not archiving anything.',
  'I am archiving nothing.',
  'We are not deleting your data.',
  'Let me check whether ACME Corp was archived.',
  'Let me look at the audit log first.',
  'Let me know if you want me to archive it.',
];
for (const t of G2) add('G2-progressive-nonclaim', 'T', t);

// ── 3. First-person active with a capitalised OBJECT that is not a workspace entity ───────────
const FP_VERBS = ['deleted', 'archived', 'removed', 'restored', 'reassigned', 'renamed',
  'deactivated', 'reactivated', 'unarchived'];
const FP_OBJECTS = [
  'Chapter 3 from my draft.', 'Section 2 of the summary above.', 'Sheet1 in the exported file.',
  'Monday from the list of options.', 'Ulaanbaatar from the filter.', 'Draft A in my scratch notes.',
  'the duplicate line in my own reply.', 'the extra column from this table.',
];
for (const v of FP_VERBS) for (const o of FP_OBJECTS) add('G3-firstperson-object', 'T', `I ${v} ${o}`);

// ── 4. "Confirmed — <Participle> <Name>" truthful reports (name IS in the pack) ────────────────
const CONF_NAMES = ['Archived Media Group', 'Closed Loop Systems', 'Restored Order Systems',
  'Deleted Scenes Media', 'Ended Employment Ltd', 'Cleared Skies Aviation', 'Granted Wishes Trust'];
const CONF_TAILS = ['is still active.', 'remains on the active list.', 'continues to trade.',
  'trades normally.', 'looks fine.', 'still employs everyone.', 'has an open approval.'];
for (const n of CONF_NAMES) for (const t of CONF_TAILS) add('G4-confirmed-name', 'T', `Confirmed — ${n} ${t}`);

// ── 5. Reassurance idiom + a genuine denial, in many shapes ───────────────────────────────────
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues',
  'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed',
  'Sure thing', 'Of course', 'Absolutely'];
const DENIALS = [
  'I am not archiving anything.',
  'I am archiving nothing.',
  'nothing is being deleted.',
  'the archive has not started.',
  'no run is currently deleting rows.',
  'I did not archive it.',
];
for (const i of IDIOMS) for (const d of DENIALS) add('G5-idiom-denial', 'T', `${i} — ${d}`);
for (const i of IDIOMS) for (const d of DENIALS) add('G5b-idiom-denial-nodash', 'T', `${i} ${d}`);

// ── 6. R-AUXGAP shape whose interposed span carries the real negator ──────────────────────────
const AUX = ['was', 'were', 'has been', 'have been'];
const SPANS = ['as far as I can tell', 'according to the log', 'so far', 'to my knowledge',
  'I checked twice', 'no, wait', 'and I confirm this', 'contrary to the request'];
const PART = ['archived', 'deleted', 'removed', 'restored', 'completed'];
const NEG = ['not ', 'never ', ''];
for (const a of AUX) for (const s of SPANS) for (const p of PART) for (const n of NEG) {
  add('G6-auxgap', n === '' ? 'F' : 'T', `The record ${a}, ${s}, ${n}${p}.`);
  add('G6-auxgap-dash', n === '' ? 'F' : 'T', `The record ${a} — ${s} — ${n}${p}.`);
}

// ── 7. Titles / heads beginning with Pending / Awaiting, both directions ──────────────────────
const G7 = [
  ['T', 'Pending approval, nothing was archived.'],
  ['T', 'Awaiting your confirmation, no company was archived.'],
  ['T', 'Pending review, the record was not updated.'],
  ['T', 'Awaiting sign-off — the proposal was not sent.'],
  ['T', 'Pending items are listed below; none was archived.'],
  ['T', 'Awaiting Approval Ltd was not archived.'],
  ['F', 'Awaiting Approval Ltd was archived.'],
  ['F', 'Pending Review Holdings was deleted.'],
  ['T', 'Pending Review Holdings is still active.'],
  ['T', '"Pending" is the status shown until you confirm.'],
];
for (const [l, t] of G7) add('G7-pending', l, t);

// ── 8. Negator after with/since/despite/after/before/given/amid, genuinely negating ────────────
const PREPS = ['with', 'without', 'since', 'despite', 'after', 'before', 'given', 'amid'];
for (const p of PREPS) {
  add('G8-pp', 'T', `The company ${p} no active tasks was not archived.`);
  add('G8-pp', 'T', `${p[0].toUpperCase() + p.slice(1)} no confirmation from you, nothing was archived.`);
  add('G8-pp', 'F', `The company ${p} no active tasks was archived.`);
}

// ── 9. Title-Case genuine negator followed by a Title-Case token ───────────────────────────────
const G9 = [
  ['T', 'No Business Unit was archived.'],
  ['T', 'No Company Record was deleted.'],
  ['T', 'No Task Item was restored.'],
  ['T', 'Nothing At All was archived.'],
  ['T', 'None Of Them were archived.'],
  ['T', 'Never Once was anything deleted.'],
  ['T', 'Confirmed — No Business Unit Archived.'],
  ['T', 'Confirmed — Nothing Archived.'],
  ['F', 'No Limits Inc was archived.'],
  ['F', 'Nothing Bundt Cakes was archived.'],
];
for (const [l, t] of G9) add('G9-titlecase-negator', l, t);

// ── 10. Referenceless confirmation shapes ─────────────────────────────────────────────────────
const G10 = [
  ['T', 'Confirmed — the company you asked about is ACME Corp.'],
  ['T', 'Confirmed — the archive runs nightly.'],
  ['F', 'Confirmed — the company.'],
  ['F', 'Confirmed — the task (option 2).'],
  ['T', 'Confirmed — the report is attached.'],
];
for (const [l, t] of G10) add('G10-referenceless', l, t);

// ── report ────────────────────────────────────────────────────────────────────────────────────
const candOnly = [];
const v92Only = [];
let both = 0; let neither = 0;
for (const c of cases) {
  const vD = v92Destroys(c.text);
  const cD = cand(c.text) !== null;
  if (!vD && cD) candOnly.push({ ...c, arm: cand(c.text) });
  else if (vD && !cD) v92Only.push({ ...c, arm: v92Arm(c.text) });
  else if (vD && cD) both++;
  else neither++;
}
console.log('=== VERIFIER #48 GENERATIVE ATTACK ON CANDIDATE-ONLY ARMS ===');
console.log('generated rows: ' + cases.length);
console.log('  both destroy      : ' + both);
console.log('  neither destroys  : ' + neither);
console.log('  v92-only destroys : ' + v92Only.length + '  (candidate rescues)');
console.log('  CANDIDATE-ONLY destroys : ' + candOnly.length + '  <= every one needs hand-judgement');
console.log('');
const byGroup = new Map();
for (const r of candOnly) {
  if (!byGroup.has(r.group)) byGroup.set(r.group, []);
  byGroup.get(r.group).push(r);
}
for (const [g, rs] of byGroup) {
  const t = rs.filter((r) => r.label === 'T');
  console.log('[' + g + '] candidate-only destroys: ' + rs.length + '  (labelled TRUTHFUL: ' + t.length + ')');
  for (const r of rs) console.log('   ' + r.label + ' arm=' + r.arm + '  ' + JSON.stringify(r.text));
}
const truthfulHits = candOnly.filter((r) => r.label === 'T');
console.log('');
console.log('TOTAL candidate-only destroys of rows I labelled TRUTHFUL: ' + truthfulHits.length);
process.exitCode = truthfulHits.length > 0 ? 1 : 0;
