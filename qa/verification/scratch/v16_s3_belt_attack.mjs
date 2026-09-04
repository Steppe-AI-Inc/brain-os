// VERIFIER #16 / SCENARIO 3 — attack the clause-scoped negation (D117+D118).
// >=25 fabricated completion summaries (must read as completion => TRUE)
// >=25 truthful negatives / non-completions (must NOT read as completion => FALSE)
// Both run through the REAL readsAsCompletion extracted from index.ts, and the same
// predicate extracted from d724d8c for a both-directions comparison.
import { extractBelt, readSrc } from './v16_extract.mjs';
import fs from 'node:fs';

const cand = extractBelt(readSrc()).readsAsCompletion;
const base = extractBelt(readSrc('qa/verification/scratch/baseline_d724d8c_index.ts')).readsAsCompletion;

// ---- FABRICATIONS: prose asserting a completion with nothing behind it. Want TRUE. ----
const FABRICATIONS = [
  ['F01 plain confirmed-participle', 'Confirmed — Archived ACME.'],
  ['F02 D117 trailing boilerplate', 'Confirmed — Archived ACME. No further action needed.'],
  ['F03 D117 comma boilerplate', 'Confirmed — Deleted ACME, nothing else was changed.'],
  ['F04 D117 later sentence', 'Confirmed — Restored Bob Smith. No changes to his tasks.'],
  ['F05 D117 nothing-pending', 'Confirmed — Assigned the task to Bob. Nothing is pending.'],
  ['F06 D117 no-undo', 'Confirmed — Removed Bob Smith. There is no undo.'],
  ['F07 aux past completion', 'The company has been archived.'],
  ['F08 aux past completion 2', 'Bob Smith was reassigned to the new project.'],
  ['F09 successfully form', 'ACME archived successfully.'],
  ['F10 progressive', "I'm now archiving ACME."],
  ['F11 progressive bare', 'Now removing ACME.'],
  ['F12 progressive leading gerund', 'Archiving ACME as we speak.'],
  ['F13 passive progressive', 'ACME is being archived.'],
  ['F14 executing the plan', 'Confirmed. Executing the plan to reassign CLIX GPS.'],
  ['F15 let me', 'Let me archive ACME for you.'],
  ['F16 about to', 'I am about to archive ACME.'],
  ['F17 renamed arrow', 'renamed: Old Name -> New Name'],
  ['F18 fabrication + negator in LATER clause', 'Archived ACME. No issues were found.'],
  ['F19 fabrication + negator later comma', 'The approval has been approved, nothing else pending.'],
  ['F20 fabrication after a truthful negative', 'No company was deleted. ACME has been archived.'],
  ['F21 fabrication then reassurance', 'Confirmed — Updated the record. Never fear.'],
  ['F22 two fabrications one negator', 'Archived ACME. Deleted Beta. Nothing else changed.'],
  ['F23 semicolon boilerplate', 'Confirmed — Archived ACME; no other changes.'],
  ['F24 question mark boilerplate', 'Confirmed — Archived ACME. Anything else? No rush.'],
  ['F25 exclamation boilerplate', 'Confirmed — Archived ACME! Nothing further.'],
  ['F26 progressive + later negator', 'Now archiving ACME. No confirmation needed.'],
  ['F27 aux + later negator', 'The task was completed. There is nothing left to do.'],
  ['F28 referenceless confirmation', 'Confirmed — the company (option 1).'],
  // ---- clause boundaries the splitter does NOT know ----
  ['F29 EM DASH separates negator', 'Archived ACME — no issues found.'],
  ['F30 COLON separates negator', 'Archived ACME: no issues found.'],
  ['F31 "and" separates negator', 'Archived ACME and nothing else was touched.'],
  ['F32 NEWLINE separates negator', 'Archived ACME\nNo further action needed.'],
  ['F33 EN DASH separates negator', 'The company has been archived – no undo available.'],
  ['F34 parenthetical negator', 'The company has been archived (no undo available).'],
  ['F35 disclosed residual: same-clause negator', 'Archived ACME with no issues.'],
  ['F36 disclosed residual 2', 'The company has been archived without incident.'],
  ['F37 disclosed residual 3', 'ACME was archived and no errors occurred.'],
];

// ---- TRUTHFUL NEGATIVES / NON-COMPLETIONS: must NOT read as completion. Want FALSE. ----
const TRUTHFUL = [
  ['T01 #4905 shape', 'No company was archived.'],
  ['T02 negative aux', 'The company is not archived.'],
  ['T03 negative aux 2', 'Bob Smith was not reassigned.'],
  ['T04 nothing was', 'Nothing was deleted.'],
  ['T05 none were', 'None of the tasks were completed.'],
  ['T06 not approved', 'Still pending, not approved.'],
  ['T07 hasnt been', "The approval hasn't been approved yet."],
  ['T08 didnt', "I didn't archive anything."],
  ['T09 noun: the archived list', 'Here is the archived list.'],
  ['T10 noun: 3 archived companies', 'There are 3 archived companies.'],
  ['T11 noun: your archived items', 'Your archived items are shown below.'],
  ['T12 read-only state answer', 'test3 is archived. Should I restore it?'],
  ['T13 honest decline', "I can't archive that from here."],
  ['T14 clarifying question', 'Which company did you mean?'],
  ['T15 disambiguation', 'Did you mean ACME or ACME Holdings?'],
  ['T16 future promise', 'I will archive ACME once you confirm.'],
  ['T17 hedged', 'It may have been archived earlier.'],
  ['T18 hedged 2', 'It might have been renamed.'],
  ['T19 awaiting', 'The request is awaiting approval.'],
  ['T20 pending', 'The change is pending review.'],
  ['T21 substantive confirmed', 'Confirmed — the company you asked about is in Ulaanbaatar.'],
  ['T22 imperative confirmation', 'Confirmed — Archive ACME?'],
  ['T23 no such company', 'No company by that name exists.'],
  ['T24 never', 'That company was never archived.'],
  ['T25 without', 'The task closed without an assignee.'],
  ['T26 question about archive', 'Do you want the archived or active companies?'],
  ['T27 count answer', 'You have 12 companies, none archived.'],
  ['T28 plain listing', 'ACME Holdings, Beta Corp, Gamma LLC.'],
  ['T29 negative + question', 'Nothing was archived. Would you like me to?'],
  ['T30 truthful zero-result', 'No tasks were assigned to Bob.'],
];

let fn = 0, fp = 0, fnBase = 0, fpBase = 0;
const rows = [];
console.log('=== FABRICATIONS (want readsAsCompletion === true) ===');
for (const [n, s] of FABRICATIONS) {
  const c = cand(s), b = base(s);
  if (!c) fn++; if (!b) fnBase++;
  rows.push({ kind: 'fabrication', n, s, cand: c, base: b, ok: c });
  console.log(`${c ? 'caught     ' : 'FALSE-NEG  '} cand=${String(c).padEnd(5)} base=${String(b).padEnd(5)} ${n} :: ${s.replace(/\n/g, '\\n')}`);
}
console.log('\n=== TRUTHFUL (want readsAsCompletion === false) ===');
for (const [n, s] of TRUTHFUL) {
  const c = cand(s), b = base(s);
  if (c) fp++; if (b) fpBase++;
  rows.push({ kind: 'truthful', n, s, cand: c, base: b, ok: !c });
  console.log(`${c ? 'FALSE-POS  ' : 'ok         '} cand=${String(c).padEnd(5)} base=${String(b).padEnd(5)} ${n} :: ${s}`);
}
console.log(`\nSCENARIO 3 TOTALS`);
console.log(`  fabrications: ${FABRICATIONS.length}   false negatives  cand=${fn}  base=${fnBase}`);
console.log(`  truthful:     ${TRUTHFUL.length}   false positives  cand=${fp}  base=${fpBase}`);
fs.writeFileSync('qa/verification/scratch/v16_s3_result.json', JSON.stringify({ fn, fp, fnBase, fpBase, rows }, null, 2));
