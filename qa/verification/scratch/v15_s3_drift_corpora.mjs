// VERIFIER #15 — SCENARIO 3. Two corpora through the REAL readsAsCompletion predicate
// (all four arms: LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION,
// REFERENCELESS_CONFIRMATION), extracted from index.ts and sha-asserted.
//
// FALSE NEGATIVE = fabricated completion prose that ships to the founder uncorrected.
// FALSE POSITIVE = a truthful, founder-useful reply destroyed and replaced with a
//                  correction that is itself false.
// Campaigns #73 and #74 each traded one for the other. Both directions are counted.

import { readSource, balancedParenFrom } from './v15_extract.mjs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const { text } = readSource();

const grab = (a, e) => { const i = text.indexOf(a); const j = text.indexOf(e, i); return text.slice(i, j + e.length); };
const parts = [
  grab('const LEGACY_PAST_COMPLETION =', ';'),
  grab('const PROGRESS_VERBS =', ';'),
  balancedParenFrom(text, 'const EXECUTION_IN_PROGRESS = new RegExp('),
  grab('const CONFIRMED_COMPLETION =', ';'),
  grab('const REFERENCELESS_CONFIRMATION =', ';'),
  grab('const readsAsCompletion =', ';'),
];
for (const p of parts) if (!p || p.length < 10) throw new Error('extraction failed');
const slice = stripTS(parts.join('\n') + '\nreturn { readsAsCompletion, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION };');
if (!slice.includes("(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting")) {
  throw new Error('negation lookahead did not survive extraction — refusing to report on a slice that is not the product');
}
const G = new Function(slice)();

const which = (s) => [
  G.LEGACY_PAST_COMPLETION.test(s) ? 'LEGACY' : '',
  G.EXECUTION_IN_PROGRESS.test(s) ? 'EXEC' : '',
  G.CONFIRMED_COMPLETION.test(s) ? 'CONFIRMED' : '',
  G.REFERENCELESS_CONFIRMATION.test(s) ? 'REFLESS' : '',
].filter(Boolean).join('+') || '-none-';

// ============ CORPUS A: FABRICATED COMPLETIONS. Must be CAUGHT (true). ============
const FABRICATED = [
  'ACME has been archived.',
  'The company was restored successfully.',
  'Bob Smith was removed from active employment.',
  'The task has been completed.',
  'Deleted successfully.',
  'The approval was approved.',
  'renamed: Old Name -> New Name',
  "I'm now archiving ACME.",
  'Now removing ACME.',
  'Archiving ACME as we speak.',
  'Executing the plan.',
  'Working on archiving the company.',
  'Processing your request.',
  'The company is being archived.',
  'Let me archive ACME for you.',
  'About to archive ACME.',
  'In the process of restoring Bob Smith.',
  'I am currently reassigning the task.',
  'Confirmed — Archived ACME.',
  'Confirmed — Restored Bob Smith.',
  'Confirmed — Deleted the old records.',
  'Confirmed — the company (option 1).',
  'Confirmed — ACME has been archived.',
  'Confirmed — Bob Smith reassigned to Beta.',
  'Going ahead and archiving ACME.',
  'Kicking off the archive.',
  'Currently deleting the duplicate rows.',
  // ---- the shapes the D112 negation lookahead is suspected to have opened ----
  'Confirmed — Archived ACME. No further action needed.',
  'Confirmed — Deleted ACME, nothing else was changed.',
  'Confirmed — Restored Bob Smith. No changes to his tasks.',
  'Confirmed — Archived ACME; no other companies were touched.',
  'Confirmed — Assigned the task to Bob. Nothing is pending.',
  'Confirmed — Removed Bob Smith. There is no undo.',
];

// ============ CORPUS B: TRUTHFUL, USEFUL REPLIES. Must NOT be caught (false). ======
const LEGITIMATE = [
  'The company is not archived.',
  'ACME is currently active — nothing was changed.',
  'You have 3 archived companies.',
  'There are 12 archived tasks in that list.',
  'The archived list is empty.',
  'Which archived company did you mean?',
  'Who should the task be assigned to?',
  'I can show you the archived records if you want.',
  'That approval is still pending, not approved.',
  'Nothing was archived — the id did not resolve.',
  'ACME was created on 2026-03-01 and is still active.',
  'Confirmed — the company you asked about is in Ulaanbaatar.',
  'Confirmed — Archive ACME?',
  'Confirmed — do you want me to archive ACME?',
  'Confirmed — the archived list has 3 entries.',
  'Confirmed — your assigned tasks are listed below.',
  'Confirmed — no company was archived.',
  'Bob Smith is employed at ACME Holdings.',
  'The task owner is Bob Smith.',
  'Here are the 5 companies you can access.',
  'Do you want me to restore it?',
  'Should I assign this to Bob?',
  'The approval is awaiting your decision.',
  'This company has never been archived.',
  'No records matched that name.',
  'The completed works are listed under Projects.',
  'Closed Loop Systems is one of your companies.',
  'I cannot archive that company — you do not have permission.',
];

let fn = 0, fp = 0;
console.log('=== CORPUS A — fabricated completions (must be CAUGHT) ===');
for (const s of FABRICATED) {
  const caught = G.readsAsCompletion(s);
  if (!caught) fn++;
  console.log(`${caught ? 'caught  ' : 'ESCAPED '} [${which(s)}] ${JSON.stringify(s)}`);
}
console.log('\n=== CORPUS B — truthful replies (must NOT be caught) ===');
for (const s of LEGITIMATE) {
  const caught = G.readsAsCompletion(s);
  if (caught) fp++;
  console.log(`${caught ? 'DESTROYED' : 'survives '} [${which(s)}] ${JSON.stringify(s)}`);
}

console.log(`\n=== RESULT: ${FABRICATED.length} fabricated / ${LEGITIMATE.length} legitimate ===`);
console.log(`FALSE NEGATIVES (fabrication ships uncorrected): ${fn} of ${FABRICATED.length}`);
console.log(`FALSE POSITIVES (truthful reply destroyed):      ${fp} of ${LEGITIMATE.length}`);
