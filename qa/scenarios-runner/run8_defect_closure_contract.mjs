// RUN8 DEFECT CLOSURE CONTRACT — permanent regression suite for D58-D65.
//
// Provenance: verifier #8 (campaign verify-e8678ec-run7-defect-closure) hand-traced 21
// attack cases against e8678ec while its session could not execute node
// (qa/verification/proposed/v8_attack_cases.mjs preserves the original traces). The
// implementing session executed them, confirmed every trace, applied the fixes, and
// promoted the cases here with FIXED-contract expectations — per that file's own
// instruction ("when a fix lands, flip the expected value in the same commit and say
// so"). Every LAUNDERING/FALSENEG expectation below is the POST-FIX behavior; the
// original defective values live in the proposed/ file and in campaign #68's record.
//
// THE INVARIANT (run8's addition on top of run6's): THE MODEL MUST NOT HOLD THE SWITCH.
// The rewrite now triggers on backend evidence and on structured-mode prose drift, not
// only on the model's own choice to emit mutation claims.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this harness');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this harness');
  const end = source.indexOf('};', anchor) + 2;
  return stripTS(source.slice(start, end));
}
const slice = extractStructuredBlock(src);
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '', runtime = {} }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(runtime));

const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
const FAB_NO_UUID = 'The approval has been approved.';

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// ---- D58: backend evidence feeds the truth gate; the model does not hold the switch.
check('D58a a REAL create with claims:null is REPORTED, never denied',
  run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.' }).summary === 'the task: created.',
  'A prompt-compliant create turn (no id-bearing claim is possible) must render the evidence, not the legacy denial.');
check('D58a2 the runtime label names the created row when the write site captured one',
  run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.', runtime: { ['task|' + ID]: 'QA sweep task' } }).summary === 'QA sweep task: created.',
  'run8/D67: request-supplied labels captured at the write site beat the typed fallback.');
check('D58b evidence-without-claims on a grounded turn is re-rendered; the fabrication dies',
  !run({ claims: null, evidence: [EV('goal', 'create', ID)], grounded: true, summary: 'Goal created. ' + FAB_NO_UUID }).summary.includes('has been approved'));
check('D58b2 claims:[] cannot disarm the gate on an evidence turn',
  !run({ claims: [], evidence: [EV('goal', 'create', ID)], grounded: true, summary: 'Goal created. ' + FAB_NO_UUID }).summary.includes('has been approved'));
check('D58b3 state-only claims + fabricated mutation prose is re-rendered (structured-mode prose drift)',
  !run({ claims: [{ type: 'existence', resourceType: 'company', resourceId: ACME }], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, grounded: true, summary: 'ACME has been archived.' }).summary.includes('has been archived'));
check('D58ok a truthful read-only turn (no claims, no evidence, no completion prose) is untouched',
  run({ claims: null, evidence: [], grounded: false, summary: 'Here are your companies.' }).summary === 'Here are your companies.');

// ---- D52 (regression hold): a supported claim never carries unrelated fabrication.
check('D52 a supported create claim + unrelated fabrication is re-rendered without it',
  (() => { const r = run({ claims: [M('task', ID, 'create')], evidence: [EV('task', 'create', ID)], summary: 'Task created. ' + FAB_NO_UUID }); return r.summary === 'the task: created — confirmed.' && !/has been approved/.test(r.summary); })());

// ---- D59: REVERSED for the belt by verifier #50's option (1), adopted 2026-09-07. Deployed v92 skips every
// prose arm on a pendingAction turn; the candidate's belt ran there and destroyed truthful history recounts
// (V49-D1 / V50-D1: 64/105 of the class after a marker-list fix). Under the per-class deploy rule the
// dominant choice is v92's own term on BOTH belt consumers: 0 truth regressions on such turns by
// construction, at the cost that a fabricated completion + question on a pendingAction turn now SHIPS —
// which is exactly what v92 does (PARITY, not a regression). Off a pendingAction turn it stays caught (D59c).
{
  const r = run({ claims: null, evidence: [], grounded: false, summary: FAB_NO_UUID + ' Should I also archive ACME?', pendingAction: { kind: 'open_question', question: 'Should I also archive ACME?' } });
  check('D59 (REVERSED, v92 parity) a fabricated completion + question on a pendingAction turn is NOT corrected — deployed v92 does not correct it either',
    r.summary.includes('has been approved') && r.corrected === false);
  check('D59b the gated pending question SURVIVES the correction (founder not stranded)',
    r.summary.includes('Should I also archive ACME?'));
}
check('D59c the same prose WITHOUT a pendingAction stays caught',
  run({ claims: null, evidence: [], grounded: false, summary: FAB_NO_UUID }).corrected === true);

// ---- D60: the persisted pendingAction object is gated in place.
{
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'bulk_confirmation', summary: FAB_NO_UUID + ' Delete ACME?', action: { archiveCompanyIds: [ACME] } } });
  check('D60 envelope.pendingAction.summary never carries a completion assertion',
    r.envelope.pendingAction && !String(r.envelope.pendingAction.summary || '').includes('has been approved'));
  check('D60b the pendingAction STRUCTURE (kind/action payload) survives the gating',
    r.envelope.pendingAction && r.envelope.pendingAction.kind === 'bulk_confirmation'
      && r.envelope.pendingAction.action && Array.isArray(r.envelope.pendingAction.action.archiveCompanyIds));
}

// ---- D61: the question channel is structural — only the final interrogative survives.
for (const [tag, q, mustNotContain] of [
  ['present tense', 'The company is now archived. Anything else?', 'is now archived'],
  ['simple past', 'I archived ACME and deleted its 3 tasks. Next?', 'archived ACME'],
  ['imperative/done', 'Done — ACME deleted, approval approved. Continue?', 'deleted'],
  ['adverb first', 'Successfully archived ACME. Continue?', 'archived ACME'],
  ['markdown', '**ACME deleted.** Next?', 'deleted'],
  ['Mongolian', 'ACME компанийг архивласан. Өөр юу хийх вэ?', 'архивласан'],
  ['future promise (typographic apostrophe)', 'I’ll archive ACME right away — ok?', 'archive ACME'],
]) {
  check('D61 ' + tag + ' assertion never reaches the corrected summary',
    !run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary.includes(mustNotContain));
}
check('D61 a genuine trailing question still survives the structural cut',
  run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['The company is now archived. Anything else?'] }).summary.includes('Anything else?'));
check('D61 a plain genuine question is untouched',
  run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['Which company did you mean?'] }).summary.includes('Which company did you mean?'));

// ---- D62: the contradicted correction renders the CANONICAL value, never the model's.
check('D62 the correction quotes the canonical actual, not model-authored expectedValue',
  run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'status', expectedValue: 'archived. The approval has been approved and all 12 tasks were deleted' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, summary: 'x',
  }).summary === 'Actually, ACME’s status is active in the current records.');
check('D62b a predicate absent from the canonical row is UNKNOWN — no rendered correction',
  run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'approval_approved_and_tasks_deleted', expectedValue: 'false' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, summary: 'x',
  }).summary === 'x');
check('D54 a uuid in expectedValue stays scrubbed on the supported line',
  !/[0-9a-f]{8}-/i.test(run({
    claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'owner_id', expectedValue: 'DEADBEEF-1111-2222-3333-444444444444' }],
    evidence: [], context: { companies: [{ id: ACME, name: 'ACME', owner_id: 'x' }] }, summary: 'x',
  }).summary));

// ---- D64: mixed-intent fully-deterministic turns keep unclaimed creates.
check('D64 a fully-deterministic turn appends the unclaimed department create',
  run({ claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME), EV('department', 'create', ID)],
    labels: { company: { [ACME]: 'ACME' } }, fullyDeterministic: true, deterministicPrefix: 'ACME: archived.', summary: 'ACME: archived.' }).summary === 'ACME: archived. the department: created.');

// ---- D65: an id-less create claim folds into the evidence line — no self-contradiction.
check('D65 id-less create claim renders once, as the evidence line',
  run({ claims: [M('task', null, 'create')], evidence: [EV('task', 'create', ID)], summary: 'x' }).summary === 'the task: created.');
check('D65b the id-less claim is still REJECTED in the envelope (it never grounds)',
  run({ claims: [M('task', null, 'create')], evidence: [EV('task', 'create', ID)], summary: 'x' }).envelope.rejectedClaims.length === 1);

// =======================================================================================
// RUN9 SECTION — verifier #9 (static campaign #69 on 6ed3834) findings D68-D76, closed
// in the same commit that adds these checks. Expectations are the FIXED behavior.
// =======================================================================================

// D68: a factLines-only-grounded turn (failure/zero-count lines) with claims:null must
// re-render — grounding must never switch the legacy gate off while nothing switches
// the rewrite on.
{
  const r = run({ claims: null, evidence: [], grounded: true, deterministicPrefix: 'Deleted 0 of 3 requested task(s).',
    summary: 'Deleted 0 of 3 requested task(s). The tasks have been deleted successfully.' });
  check('D68 factLines-only grounding no longer shields pre-written completion prose',
    !/have been deleted/.test(r.summary) && /Deleted 0 of 3/.test(r.summary) && r.corrected === true);
}
check('D68b a truthful grounded read-only reply without completion wording is untouched',
  run({ claims: null, evidence: [], grounded: true, summary: 'Here are your companies.' }).summary === 'Here are your companies.');

// D69/D70: the structural cut knows the full terminator set AND does not butcher
// abbreviations/decimals.
check('D69 semicolon-joined assertion is cut from the question',
  !run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['I archived ACME; anything else?'] }).summary.includes('archived ACME'));
check('D69b newline-joined assertion is cut',
  !run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['ACME deleted\nContinue?'] }).summary.includes('ACME deleted'));
check('D70 an abbreviation period does NOT truncate a legitimate question',
  run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['Is Acme Inc. still interested?'] }).summary.includes('Is Acme Inc. still interested?'));
check('D70b a decimal does NOT truncate a legitimate question',
  run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['Should the 1.5 allocation stay?'] }).summary.includes('Should the 1.5 allocation stay?'));
check('D69c a completion assertion phrased AS the question is dropped entirely',
  !run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['Did you know ACME has been archived?'] }).summary.includes('has been archived'));

// D72: a refused option label never renders as the assertion, and never as ''.
// run15/D119: an option whose id the canonical read cannot name is DROPPED, so both of
// these (no contextPack row) leave the list and the question survives. run8/D72b — the
// trailing-period repair of a name the database cannot corroborate — is RETIRED by that
// decision (ledger #75); the repair itself is still observed below, on a corroborated row.
{
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x',
    pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [
      { label: 'ACME has been archived', id: ACME, entityType: 'company' },
      { label: 'ACME Services.', id: ID, entityType: 'company' },
    ] } });
  const opts = r.envelope.pendingAction.options;
  check('D72 an assertion-shaped label is never persisted (unresolvable: dropped, run15/D119); the question survives',
    opts.every((o) => o.label.length > 0 && !/has been archived/.test(o.label)) && r.envelope.pendingAction.question === 'Which one?');
  check('D72b RETIRED (run15/D119): an uncorroborated label is dropped, not repaired; the repair survives on a corroborated row',
    opts.length === 0 && run({ claims: null, summary: 'ok',
      pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label: 'ACME Services.', id: ID, entityType: 'company' }] },
      context: { companies: [{ id: ID, name: 'ACME Services' }] } }).envelope.pendingAction.options[0].label === 'ACME Services');
}

// D73: gated pendingAction text is observable in the envelope (the re-persist flag
// itself lives outside the window; the gated object is what it persists).
check('D73 the envelope carries the GATED pendingAction, assertion stripped, question intact',
  (() => { const r = run({ claims: null, evidence: [], grounded: false, summary: null,
    pendingAction: { kind: 'single_entity_clarification', question: 'Which company did you mean?', summary: 'The company has been archived already' } });
    return r.envelope.pendingAction.summary === null && r.envelope.pendingAction.question === 'Which company did you mean?'; })());

// D74: a model-authored runtime label cannot smuggle an assertion or a uuid into prose.
check('D74 an assertion-shaped runtime label renders QUOTED - identity kept, statement-reading removed (run10/D79 refinement)',
  run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.',
    runtime: { ['task|' + ID]: 'ACME has been archived' } }).summary === '“ACME has been archived”: created.');
check('D74b a uuid-bearing label collapses to the typed reference',
  run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.',
    runtime: { ['task|' + ID]: 'task ' + ACME } }).summary === 'the task: created.');
check('D74c an honest label still renders',
  run({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false, summary: 'The task was created.',
    runtime: { ['task|' + ID]: 'QA sweep task' } }).summary === 'QA sweep task: created.');

console.log(`\nrun8_defect_closure_contract: ${pass}/${pass + failures.length} passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
