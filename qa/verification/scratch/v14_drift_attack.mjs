import { build, ACME, ID2, M } from './v14_lib.mjs';
const { run } = build();

const corrected = (s, extra = {}) => run({ summary: s, ...extra }).corrected === true;
const outSummary = (s, extra = {}) => run({ summary: s, ...extra }).summary;

// ---------------------------------------------------------------------------
// PROBE A — WHICH ARM actually protects the real replay path?
// The replay site emits its summary with model = 'deterministic-disambiguation'.
// Arm 1 (legacyProseFallback) EXPLICITLY excludes every deterministic-* model.
// Arm 2 (structuredProseDrift) additionally requires structure to be present.
// run13's committed D100.replay / D103.falseConfirmation cases run with model='gpt'.
// ---------------------------------------------------------------------------
console.log('=== PROBE A: model sensitivity of the two new belts ===');
const REPLAY_SHAPES = ['Confirmed — Restored Bob Smith.', 'Confirmed — the company (option 1).'];
for (const s of REPLAY_SHAPES) {
  for (const model of ['gpt', 'deterministic-disambiguation', 'deterministic-clarification', 'deterministic-confirmation']) {
    const noStruct = run({ summary: s, model }).corrected === true;
    const withClaims = run({ summary: s, model, claims: [] }).corrected === true;
    console.log(`${JSON.stringify(s).padEnd(40)} model=${model.padEnd(28)} corrected(noStructure)=${String(noStruct).padEnd(5)} corrected(claims:[])=${withClaims}`);
  }
}

// ---------------------------------------------------------------------------
// PROBE B — FALSE NEGATIVES: completion-shaped summaries that still ship
// ---------------------------------------------------------------------------
const COMPLETION_SHAPED = [
  'Confirmed — Restored Bob Smith.',
  'Confirmed — the company (option 1).',
  'Confirmed — Archived ACME Holdings.',
  'Confirmed — Deleted the migration task.',
  'Confirmed - Removed Bob from ACME.',
  'Confirmed – Completed the onboarding.',
  'Confirmed — the task.',
  'Confirmed — the goal (option 2).',
  'Done — Restored Bob Smith.',
  'All set — ACME is archived.',
  'ACME has been archived.',
  'The company was deleted.',
  'Bob Smith was reassigned to ACME.',
  'Archived successfully.',
  'I archived ACME for you.',
  'I have deleted the three tasks.',
  'We removed Bob from the roster.',
  'ACME archived.',
  'Task deleted.',
  'Everything is now cleared.',
  'Your request has been completed.',
  'The goal was closed yesterday.',
  'Bob has been granted access.',
  'The migration finished.',
  'ACME was wiped from the system.',
  'The lead was converted.',
  'I terminated the contractor.',
  'All three companies are gone now.',
  'Confirmed — you selected “Restored Bob Smith”.',
  'Confirmed — proceeding: ACME archived.',
  'Right — that is handled.',
  'ACME Holdings: archived.',
];

// ---------------------------------------------------------------------------
// PROBE C — FALSE POSITIVES: legitimate, founder-useful, non-completion summaries
// ---------------------------------------------------------------------------
const LEGITIMATE = [
  'Confirmed — the company you asked about is in Ulaanbaatar.',
  'Confirmed — Archive ACME?',
  'Confirmed — you selected “ACME Holdings”.',
  'Confirmed — proceeding with the option you selected.',
  'ACME has 12 active tasks and 3 open goals.',
  'There are 4 archived companies in your workspace.',
  'Bob Smith is a team lead at ACME Holdings.',
  'I can archive ACME once you confirm.',
  'Which of the archived companies did you mean?',
  'The report covers Q3 revenue for three business units.',
  'Do you want the closed leads included?',
  'ACME Holdings was founded in 2019 and has 40 employees.',
  'Nothing was changed — I need you to pick a company first.',
  'I could not find a company named Foo.',
  'Two tasks are assigned to Bob; both are still open.',
  'This would archive 3 companies. Shall I proceed?',
  'The archived company list is available under Companies → Archived.',
  'Bob completed his onboarding checklist last quarter, per the HR record.',
  'You asked about the deleted task; it is still in the audit log.',
  'Here is a summary of the restored backup policy document.',
  'Access was requested but not granted — it is awaiting approval.',
  'The approval is pending; nothing has been executed.',
  'I have not made any changes yet.',
  'Confirmed — the goal you asked about belongs to ACME Holdings.',
  'Confirmed — Restore Bob Smith?',
  'Three of your companies have the word "Closed" in their names.',
  'The task titled "Verify the contract was approved by legal" is still open.',
  'Nothing to report: no mutations were attempted this turn.',
];

console.log('\n=== PROBE B: FALSE NEGATIVES (completion-shaped prose that ships uncorrected) ===');
let fn = 0;
for (const s of COMPLETION_SHAPED) {
  const gpt = corrected(s, { model: 'gpt' });
  const det = corrected(s, { model: 'deterministic-disambiguation' });
  if (!gpt || !det) { fn++; console.log(`FN  gpt=${String(gpt).padEnd(5)} detDisamb=${String(det).padEnd(5)}  ${JSON.stringify(s)}`); }
}
console.log(`false negatives: ${fn} / ${COMPLETION_SHAPED.length} (counting either model arm shipping it)`);

console.log('\n=== PROBE C: FALSE POSITIVES (legitimate replies destroyed) ===');
let fp = 0;
for (const s of LEGITIMATE) {
  const gpt = corrected(s, { model: 'gpt' });
  if (gpt) { fp++; console.log(`FP  ${JSON.stringify(s)}  -> rewritten to: ${JSON.stringify(outSummary(s, { model: 'gpt' }))}`); }
}
console.log(`false positives: ${fp} / ${LEGITIMATE.length}`);
