// verifier #8 (campaign verify-e8678ec-run7-defect-closure) — ATTACK CASES AGAINST THE
// REAL STRUCTURED-CLAIM WINDOW OF supabase/functions/sem-ai-command/index.ts @ e8678ec.
//
// STATUS: UNEXECUTED. The verifier's session could not run node scripts (permission layer
// refused every `node <file>` / `node -e` / `node --test` form). Every case below carries
// the output the verifier TRACED by hand through the window (the window is pure — no I/O,
// no async — so a trace is exact if the reading is right). Running this file is the
// first thing a resumed attempt must do: a case whose measured value differs from its
// traced value means the trace was wrong and the corresponding defect record in
// qa/verification/CURRENT_CAMPAIGN.json must be corrected.
//
// Same two-way-drift discipline as structured_claim_laundering_contract.mjs: `expected`
// is what e8678ec is TRACED to do, not what it should do. LAUNDERING/FALSENEG rows are
// defects when their expected value is the "bad" one; when a fix lands, flip the expected
// value in the same commit and say so.
//
// Runs with plain node from qa/scenarios-runner (it reuses that directory's extractor).
//   node qa/verification/proposed/v8_attack_cases.mjs
// Move to qa/scenarios-runner/ once executed and confirmed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.V8_INDEX_TS || resolve(here, '../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = source.indexOf('};', anchor) + 2;
  return stripTS(source.slice(start, end));
}
const slice = extractStructuredBlock(src);
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '' }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix);

const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
const FAB = 'Approval 358eddeb-c6ac-4a85-ab26-77dc3960fcba has been approved.';
const FAB_NO_UUID = 'The approval has been approved.';

const CASES = [];
const C = (id, kind, desc, thunk, expected) => CASES.push([id, kind, desc, thunk, expected]);

// ---------------------------------------------------------------- D58 (P0) ---------------
// (a) real create, prompt-compliant no-id claim => claims:null, ungrounded turn (task creates
//     never ground the turn in index.ts), prose says "was created" => legacy blanket DENIAL.
C('V8-D58a', 'FALSENEG', 'a REAL task create with claims:null is denied as "nothing was changed" (legacy path)',
  () => run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.' }).summary,
  'I can’t actually do that from chat — nothing was changed. Please use the relevant page in the app for this action, or rephrase using an action I can execute.');
// (b) real create on a GROUNDED turn (e.g. a goal create resolves an entity), claims:null,
//     prose carries an unrelated fabrication => nothing rewrites, nothing corrects.
C('V8-D58b', 'LAUNDERING', 'evidence-without-claims on a grounded turn ships the raw fabrication',
  () => run({ claims: null, evidence: [EV('goal', 'create', ID)], grounded: true, summary: 'Goal created. ' + FAB_NO_UUID }).summary.includes('has been approved'), true);
C('V8-D58b2', 'LAUNDERING', 'claims:[] (schema-valid) on a grounded evidence turn ships the raw fabrication',
  () => run({ claims: [], evidence: [EV('goal', 'create', ID)], grounded: true, summary: 'Goal created. ' + FAB_NO_UUID }).summary.includes('has been approved'), true);
C('V8-D58b3', 'LAUNDERING', 'state-only claims + fabricated mutation prose on a grounded turn ships',
  () => run({ claims: [{ type: 'existence', resourceType: 'company', resourceId: ACME }], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, grounded: true, summary: 'ACME has been archived.' }).summary.includes('has been archived'), true);
// (d) the D52 fix itself works for the claimed shape
C('V8-D52ok', 'CONTRACT', 'a supported create claim + unrelated fabrication is re-rendered without the fabrication',
  () => { const r = run({ claims: [M('task', ID, 'create')], evidence: [EV('task', 'create', ID)], summary: 'Task created. ' + FAB_NO_UUID }); return r.summary === 'the task: created — confirmed.' && !/has been approved/.test(r.summary); }, true);

// ---------------------------------------------------------------- D59 (P1) ---------------
C('V8-D59', 'LAUNDERING', 'pendingAction present + fabricated past completion + no claims ships (D3 short-circuit inside legacyProseFallback)',
  () => run({ claims: null, evidence: [], grounded: false, summary: FAB_NO_UUID + ' Should I also archive ACME?', pendingAction: { kind: 'open_question', question: 'Should I also archive ACME?' } }).summary.includes('has been approved'), true);
C('V8-D59b', 'CONTRACT', 'the same prose WITHOUT a pendingAction IS caught by the legacy gate',
  () => run({ claims: null, evidence: [], grounded: false, summary: FAB_NO_UUID }).corrected, true);

// ---------------------------------------------------------------- D60 (P1) ---------------
C('V8-D60', 'LAUNDERING', 'the persisted envelope.pendingAction is the RAW object (summary/question/options ungated)',
  () => { const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'bulk_confirmation', summary: FAB_NO_UUID + ' Delete ACME?', action: { archiveCompanyIds: [ACME] } } }); return r.envelope.pendingAction.summary.includes('has been approved') && !r.summary.includes('has been approved'); }, true);

// ---------------------------------------------------------------- D61 (P1) ---------------
for (const [tag, q] of [
  ['present tense', 'The company is now archived. Anything else?'],
  ['simple past', 'I archived ACME and deleted its 3 tasks. Next?'],
  ['imperative/done', 'Done — ACME deleted, approval approved. Continue?'],
  ['adverb first', 'Successfully archived ACME. Continue?'],
  ['markdown', '**ACME deleted.** Next?'],
  ['Mongolian', 'ACME компанийг архивласан. Өөр юу хийх вэ?'],
  ['future promise', 'I’ll archive ACME right away — ok?'],
]) {
  C('V8-D61 ' + tag, 'LAUNDERING', 'questions[] fragment passes safeProseFragment and is spliced into the corrected summary: ' + JSON.stringify(q),
    () => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary.includes(q), true);
}
C('V8-D61 caught', 'CONTRACT', 'a has-been fragment IS dropped by safeProseFragment',
  () => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [FAB_NO_UUID + ' Anything else?'] }).summary.includes('has been approved'), false);

// ---------------------------------------------------------------- D62 (P1) ---------------
C('V8-D62', 'LAUNDERING', 'model-authored expectedValue is rendered raw through the CONTRADICTED correction line',
  () => run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'status', expectedValue: 'archived. The approval has been approved and all 12 tasks were deleted' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, summary: 'x',
  }).summary, 'Actually, ACME’s status is not archived. The approval has been approved and all 12 tasks were deleted in the current records.');
C('V8-D62b', 'LAUNDERING', 'a garbage predicate (row[p] undefined) is ALWAYS contradicted and rendered raw',
  () => run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'approval_approved_and_tasks_deleted', expectedValue: 'false' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, summary: 'x',
  }).summary, 'Actually, ACME’s approval_approved_and_tasks_deleted is not false in the current records.');
C('V8-D54ok', 'CONTRACT', 'a uuid in expectedValue is scrubbed on the same line',
  () => /[0-9a-f]{8}-/i.test(run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'owner_id', expectedValue: 'DEADBEEF-1111-2222-3333-444444444444' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', owner_id: 'x' }] }, summary: 'x',
  }).summary), false);

// ---------------------------------------------------------------- D64 (P2) ---------------
C('V8-D64', 'FALSENEG', 'fully-deterministic turn drops an unclaimed department create',
  () => run({ claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME), EV('department', 'create', ID)],
    labels: { company: { [ACME]: 'ACME' } }, fullyDeterministic: true, deterministicPrefix: 'ACME: archived.', summary: 'ACME: archived.' }).summary, 'ACME: archived.');

// ---------------------------------------------------------------- D65 (P2) ---------------
C('V8-D65', 'FALSENEG', 'an id-less create claim renders as a self-contradiction next to the evidence line',
  () => run({ claims: [M('task', null, 'create')], evidence: [EV('task', 'create', ID)], summary: 'x' }).summary,
  // order: unclaimedLines precede rejectedLines in claimParts (index.ts 4697)
  'the task: created. I can’t confirm from this turn’s execution record that the task was created.');

let drift = 0;
for (const [id, kind, desc, thunk, expected] of CASES) {
  let actual;
  try { actual = thunk(); } catch (e) { actual = 'THREW: ' + e.message; }
  const ok = actual === expected;
  if (!ok) drift++;
  console.log((ok ? 'OK   ' : 'DRIFT') + ' ' + id.padEnd(22) + ' [' + kind.padEnd(10) + '] ' + desc);
  if (!ok) console.log('        traced ' + JSON.stringify(expected) + '\n        measured ' + JSON.stringify(actual));
}
console.log('\nv8_attack_cases: ' + (CASES.length - drift) + '/' + CASES.length + ' match the verifier’s hand trace of e8678ec');
if (drift > 0) { console.log('TRACE DRIFT — correct qa/verification/CURRENT_CAMPAIGN.json before trusting its defect list.'); process.exit(1); }
