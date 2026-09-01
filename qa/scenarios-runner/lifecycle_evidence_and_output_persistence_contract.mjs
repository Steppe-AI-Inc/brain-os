// LIFECYCLE EVIDENCE + OUTPUT PERSISTENCE CONTRACT — behavioural regression suite.
//
// Added 2026-09-01 by independent verifier #7 (qa/KNOWN_FAILURE_MODES.md #67) while
// verifying `pending/d3-past-completion-gate-pendingaction-shortcircuit` @ 25af3b0.
//
// WHY IT EXISTS. Mutation testing of that build found 8 guards with ZERO coverage — the
// SEVENTH recurrence of the missing-coverage class (#61/D2, #63/D10, #63/D12, #64/D19,
// #65/D28, #66/D42, now #67/D51). The uncovered guards were:
//
//   * the six `changed === true` evidence gates in the company/task/goal archive+restore
//     loops. Deleting any one of them lets an 'already archived' / 'denied' / 'not_found'
//     RPC result support a mutation_result claim — i.e. the AI telling the founder it
//     archived something it did not. NO existing suite could see them, because every
//     structured-claim harness extracts a window that starts AFTER these loops and feeds
//     synthetic evidence in. structured_claim_laundering_contract.mjs F1/F2 assert they
//     "test the fix" but structurally cannot reach it.
//   * the pendingAction prompt/option preservation inside the claim-rewrite path.
//   * the work_orders.output persist condition. Dropping
//     `claimsPastCompletionWithNoGrounding` from it means the CORRECTED summary is shown
//     live and the ORIGINAL fabricated text is what a reload and the next turn's context
//     actually read back — the exact #35/#45 durability class.
//
// Every section executes the REAL code sliced out of
// supabase/functions/sem-ai-command/index.ts. Reimplementations cannot catch a false
// positive and are the vacuous-regression class this project has logged six times.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function slice(startMarker, endMarker, what) {
  const s = src.indexOf(startMarker);
  if (s === -1) throw new Error('could not find the start of ' + what + ' — update this harness, do not let it pass');
  const e = src.indexOf(endMarker, s);
  if (e === -1) throw new Error('could not find the end of ' + what + ' — update this harness, do not let it pass');
  const out = stripTS(src.slice(s, e + endMarker.length));
  if (!/recordExecution\(/.test(out) && what !== 'the work_orders.output persist condition') {
    throw new Error(what + ' no longer contains a recordExecution call — update this harness, do not let it pass');
  }
  return out;
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// A stubbed supabase.rpc that returns whatever the scenario says the real RPC returned.
// The payload shapes are LIVE-VERIFIED against production pg_get_functiondef for
// archive_task / restore_task / archive_goal / restore_goal / archive_company /
// restore_company (2026-09-01, project pvphxgrtdfrudejjhzjk).
const rpcStub = (byName) => ({ rpc: async (name) => byName[name] ?? { data: null, error: { message: 'unstubbed ' + name } } });
const ok = (extra) => ({ data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', ...extra }, error: null });
const alreadyArchived = { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null };
const alreadyActive = { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null };
const denied = { data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null };
const notFound = { data: { changed: false, authorized: false, postconditionPassed: false, reason: 'not_found' }, error: null };
const unconfirmed = { data: { changed: true, authorized: true, postconditionPassed: false, reason: 'archived' }, error: null };
const rpcError = { data: null, error: { message: 'boom' } };
const ID = 'abcd1234-ab12-cd34-ef56-abcdef123456';
const mkMap = (o) => new Map(Object.entries(o));

export { pass };

// =======================================================================================
// SECTION E — THE SIX `changed === true` EVIDENCE GATES, executed for real.
// EVIDENCE_ONLY_FOR_A_GENUINE_POSTCONDITION_CONFIRMED_STATE_CHANGE
// =======================================================================================
const TASK_SLICE = slice(
  'const lifecycleReasonText: Record<string, string> = {',
  'const taskArchiveRestoreReport = taskArchiveRestoreLines.length > 0 ? taskArchiveRestoreLines.join(\' \') : null;',
  'the task archive/restore loops');
const COMPANY_SLICE = slice(
  'const archiveRestoreLines: string[] = [];',
  'const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(\' \') : null;',
  'the company archive/restore loops');
const GOAL_SLICE = slice(
  'const goalArchiveRestoreLines: string[] = [];',
  'const goalArchiveRestoreReport = goalArchiveRestoreLines.length > 0 ? goalArchiveRestoreLines.join(\' \') : null;',
  'the goal archive/restore loops');

const runTask = new AsyncFunction('supabase', 'archiveTaskIds', 'restoreTaskIds', 'taskTitleById', 'recordExecution',
  TASK_SLICE + '\n; return taskArchiveRestoreReport;');
const runCompany = new AsyncFunction('supabase', 'archiveCompanyIds', 'restoreCompanyIds', 'companyNameById', 'recordExecution',
  COMPANY_SLICE + '\n; return archiveRestoreReport;');
const runGoal = new AsyncFunction('supabase', 'archiveGoalIds', 'restoreGoalIds', 'goalTitleById', 'lifecycleReasonText', 'recordExecution',
  GOAL_SLICE + '\n; return goalArchiveRestoreReport;');

const GOAL_REASON_TEXT = { archived: 'archived', restored: 'restored', already_archived: 'was already archived', already_active: 'was already active', denied: 'no permission', not_found: 'could not be found' };

async function evidenceFor(kind, rpcName, rpcResult) {
  const seen = [];
  const rec = (resourceType, action, id, postconditionPassed) => { if (typeof id === 'string' && id.length > 0) seen.push({ resourceType, action, id, postconditionPassed }); };
  const sb = rpcStub({ [rpcName]: rpcResult });
  const names = mkMap({ [ID]: 'QA fixture' });
  if (kind === 'task-archive') await runTask(sb, [ID], [], names, rec);
  else if (kind === 'task-restore') await runTask(sb, [], [ID], names, rec);
  else if (kind === 'company-archive') await runCompany(sb, [ID], [], names, rec);
  else if (kind === 'company-restore') await runCompany(sb, [], [ID], names, rec);
  else if (kind === 'goal-archive') await runGoal(sb, [ID], [], names, GOAL_REASON_TEXT, rec);
  else if (kind === 'goal-restore') await runGoal(sb, [], [ID], names, GOAL_REASON_TEXT, rec);
  else throw new Error('unknown kind ' + kind);
  return seen;
}

const SITES = [
  ['task-archive', 'archive_task', 'task', 'archive'],
  ['task-restore', 'restore_task', 'task', 'restore'],
  ['goal-archive', 'archive_goal', 'goal', 'archive'],
  ['goal-restore', 'restore_goal', 'goal', 'restore'],
  ['company-archive', 'archive_company', 'company', 'archive'],
  ['company-restore', 'restore_company', 'company', 'restore'],
];

for (const [kind, rpcName, resourceType, action] of SITES) {
  const good = await evidenceFor(kind, rpcName, ok({ reason: action === 'archive' ? 'archived' : 'restored', newStatus: 'queued' }));
  check('E ' + kind + ': a REAL confirmed change RECORDS evidence',
    good.length === 1 && good[0].resourceType === resourceType && good[0].action === action && good[0].id === ID && good[0].postconditionPassed === true,
    'A truthful mutation claim can only be supported if this site records evidence. Measured: ' + JSON.stringify(good));

  for (const [label, result] of [
    ['already in that state', action === 'archive' ? alreadyArchived : alreadyActive],
    ['denied', denied],
    ['not_found', notFound],
    ['changed but postcondition NOT confirmed', unconfirmed],
    ['rpc error', rpcError],
  ]) {
    const seen = await evidenceFor(kind, rpcName, result);
    check('E ' + kind + ': "' + label + '" records NO evidence',
      seen.length === 0,
      'This is not a mutation performed this turn, so it must never be able to support a mutation_result claim. Measured: ' + JSON.stringify(seen));
  }
}

// =======================================================================================
// SECTION P — work_orders.output PERSIST CONDITION, executed for real.
// CORRECTED_SUMMARY_IS_PERSISTED_NOT_ONLY_STREAMED
//
// The UI reads result.summary live and work_orders.output.summary on reload
// (web/app/(app)/chat/chat-client.tsx:119/758, web/lib/data/chat-history.ts). If a turn
// whose summary was CORRECTED is not persisted, the founder sees the correction once and
// the ORIGINAL fabricated text forever after — and the next turn's buildContext() reads
// that same stored text back as conversation history.
// =======================================================================================
// Line endings in the working tree are CRLF, so the closing brace is appended separately
// rather than embedded in the end marker.
const PERSIST_SLICE = slice(
  'if (groundedOutcomeThisTurn || lifecycleMismatchCorrections.length > 0',
  "await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);",
  'the work_orders.output persist condition') + '\n}';

const runPersist = new AsyncFunction('supabase', 'result', 'workOrder', 'groundedOutcomeThisTurn',
  'lifecycleMismatchCorrections', 'model', 'claimsFutureActionWithNoPlan', 'claimsPastCompletionWithNoGrounding',
  PERSIST_SLICE);

async function persisted(opts) {
  let wrote = null;
  const sb = { from: () => ({ update: (payload) => ({ eq: async () => { wrote = payload; } }) }) };
  await runPersist(sb, { summary: opts.summary ?? 'corrected text' }, { id: 'wo-1' },
    opts.grounded ?? false, opts.mismatch ?? [], opts.model ?? 'gpt',
    opts.future ?? false, opts.pastCompletion ?? false);
  return wrote;
}

check('P1 a CORRECTED past-completion turn is persisted',
  (await persisted({ pastCompletion: true })) !== null,
  'claimsPastCompletionWithNoGrounding must be part of the persist condition, or the correction is streamed-only.');
check('P2 a CORRECTED future-promise turn is persisted',
  (await persisted({ future: true })) !== null);
check('P3 a grounded turn is persisted',
  (await persisted({ grounded: true })) !== null);
check('P4 a lifecycle-mismatch correction is persisted',
  (await persisted({ mismatch: ['Couldn’t confirm that.'] })) !== null);
check('P5 a deterministic-confirmation turn is persisted',
  (await persisted({ model: 'deterministic-confirmation' })) !== null);
check('P6 an ordinary uncorrected turn is NOT re-persisted',
  (await persisted({})) === null,
  'Nothing changed, so the RPC-written p_output already is the truth. Re-writing it would be pointless traffic, not a correctness fix.');
check('P7 what is persisted is the whole result object, i.e. the SAME summary the founder saw',
  (await persisted({ pastCompletion: true, summary: 'the exact corrected sentence' })).output.summary === 'the exact corrected sentence',
  'LIVE_RESPONSE_EQUALS_PERSISTED_RESPONSE. If these can differ, a reload shows a different answer than the chat did.');

// =======================================================================================
// SECTIONS R and X — the claim-verification/rewrite block itself.
// =======================================================================================
const CLAIM_SLICE = (() => {
  const s = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (s === -1) throw new Error('structured-claim block not found — update this harness, do not let it pass');
  const envIdx = src.indexOf('result.verifiedResponse = {', s);
  if (envIdx === -1) throw new Error('verifiedResponse envelope not found — update this harness, do not let it pass');
  const envEnd = src.indexOf('};', envIdx);
  if (envEnd === -1) throw new Error('unterminated verifiedResponse envelope');
  const out = stripTS(src.slice(s, envEnd + 2));
  if (/\btype\s+\w+\s*=/.test(out) || /\b(const|let|var)\s+\w+\s*:\s*[A-Za-z_]/.test(out)) {
    throw new Error('TypeScript survived stripping — fix _gate_extract.mjs rather than letting this pass');
  }
  return out;
})();
const runClaims = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model',
  'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById',
  CLAIM_SLICE + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');
const DENO_OFF = { env: { get: () => undefined } };
const claims = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {} }) =>
  runClaims({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO_OFF,
    mkMap(labels.company || {}), mkMap(labels.task || {}), mkMap(labels.person || {}), mkMap(labels.goal || {}));

const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, okFlag = true) => ({ resourceType: rt, action, id, postconditionPassed: okFlag });
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// SECTION R — a rejected claim must never silently swallow the rest of a truthful reply.
{
  const r = claims({ claims: [M('company', ID, 'archive')], evidence: [],
    questions: ['Should I also notify the team?'],
    pendingAction: { question: 'Which company did you mean?', options: [{ label: 'ACME Holdings' }, { label: 'ACME Services' }] } });
  check('R1 the pendingAction PROMPT survives the claim rewrite', /Which company did you mean\?/.test(r.summary),
    'Losing the prompt strands the founder mid-clarification with no way to answer.');
  check('R2 the pendingAction OPTIONS survive the claim rewrite', /ACME Holdings/.test(r.summary) && /ACME Services/.test(r.summary));
  check('R3 questions survive the claim rewrite', /notify the team/.test(r.summary));
  check('R4 the rejected claim is still stated', /couldn.t confirm/i.test(r.summary));
}

// R5 closes the last uncovered guard found by mutation testing: dropping
// hasRejectedClaims from claimsPastCompletionWithNoGrounding leaves the rewrite working
// but stops the CORRECTED summary being written to work_orders.output, so the founder
// sees the correction once and the original fabricated text on every later read.
check('R5 a rejected-claim turn is FLAGGED as needing persistence (claimsPastCompletionWithNoGrounding)',
  claims({ claims: [M('company', ID, 'archive')], evidence: [], grounded: false, summary: 'x' }).corrected === true,
  'Without this the correction is streamed-only and a reload restores the uncorrected text.');

// R6 makes the explicit no-action guard load-bearing. Verdict alone cannot see it: with
// the guard deleted an action-less claim is still rejected by the action-mismatch branch,
// so only the audit REASON distinguishes the two. Same technique as A5b in
// structured_claim_verification.mjs.
{
  const r6 = claims({ claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ID }],
    evidence: [EV('company', 'archive', ID)], summary: 'x' });
  check('R6 an action-less mutation claim is rejected FOR CARRYING NO ACTION',
    r6.envelope.rejectedClaims.length === 1 && /no action to verify/i.test(r6.envelope.rejectedClaims[0].reason),
    'The action is half the claim identity; the audit trail must say that is what was missing.');
}

// =======================================================================================
// SECTION X — DEFECTS MEASURED ON 25af3b0 (#67). Same two-way-drift discipline as
// structured_claim_laundering_contract.mjs: the expected value is what the build ACTUALLY
// does today, so a silent regression fails AND a silent fix nobody recorded fails.
// DEFECT entries additionally drive the DEPLOY GATE below.
// =======================================================================================
const X = [];
const defect = (id, desc, thunk, measured) => X.push([id, 'DEFECT', desc, thunk, measured]);
const contract = (id, desc, thunk, expected) => X.push([id, 'CONTRACT', desc, thunk, expected]);

const APPROVAL_FABRICATION = 'Approval 358eddeb-c6ac-4a85-ab26-77dc3960fcba has been approved.';
const PERSON = 'aaaa1111-bb22-cc33-dd44-eeeeeeee5555';

// X1. The #66 additive drift check closed `claims: []`, but the ARMING condition is now
// "any supported mutation claim", which is a whole-TURN signal. A successful task/approval/
// project CREATE records evidence yet sets no grounding flag (factLines only report
// shortfalls; resolvedEntities covers companies/people/goals only) - so in that specific
// window deployed v92 catches an unrelated fabrication and this build does not.
defect('X1', 'one supported task-create claim disarms the drift check for an UNRELATED fabricated completion (regression vs v92 in the ungrounded-execution window)',
  () => claims({ claims: [M('task', ID, 'create')], evidence: [EV('task', 'create', ID)], grounded: false,
    summary: 'Task created. ' + APPROVAL_FABRICATION }).corrected, false);
contract('X1b', 'the same prose with NO claims is still caught, exactly as deployed v92 does',
  () => claims({ claims: null, evidence: [EV('task', 'create', ID)], grounded: false,
    summary: 'Task created. ' + APPROVAL_FABRICATION }).corrected, true);

// X2. recordExecution is wired at 13 sites. Person end/restore employment, permanent
// fixture delete, company field updates, department/lead/product/proposal/document/
// drawing/provider/connector/memory/assignment writes all really mutate and record
// nothing - so a TRUTHFUL, contract-compliant mutation_result claim about them is
// REJECTED and the founder is told "nothing was changed for it" about a real change.
defect('X2', 'a TRUTHFUL end_employment claim is rejected and the founder is told nothing changed (no evidence site exists for person lifecycle)',
  () => /nothing was changed/.test(claims({ claims: [M('person', PERSON, 'end_employment')], evidence: [], grounded: true,
    labels: { person: { [PERSON]: 'QA Person' } },
    summary: 'Employment ended for QA Person. Assignment closed.' }).summary), true);

// X3. On a real lifecycle turn result.summary is ALREADY the deterministic, backend-built
// report (index.ts: result.summary = lifecycleReports.join(' ')). The claim rewrite
// discards it wholesale and re-renders from claims only, so every real outcome the model
// did not happen to claim disappears from the founder's reply.
defect('X3', 'the deterministic lifecycle report is discarded by the claim rewrite; real archives the model did not claim vanish',
  () => {
    const B1 = '11111111-aaaa-bbbb-cccc-111111111111';
    const B2 = '22222222-aaaa-bbbb-cccc-222222222222';
    const r = claims({ claims: [M('company', B1, 'archive'), M('company', 'deadbeef-0000-0000-0000-000000000000', 'archive')],
      evidence: [EV('company', 'archive', B1), EV('company', 'archive', B2)], grounded: true,
      labels: { company: { [B1]: 'ACME', [B2]: 'Beta Co' } },
      summary: 'Company "ACME": archived. Company "Beta Co": archived.' });
    return !/Beta Co/.test(r.summary);
  }, true);

// X4. questions[], pendingAction.summary/question and option labels are model-authored
// strings that the rewrite splices verbatim into the founder-facing summary. The drift
// check ran earlier, against the ORIGINAL summary only, so nothing ever inspects them.
// Preserving them is right (see Section R); leaving them ungated is the defect.
defect('X4', 'a fabricated completion routed through questions[] reaches the founder through the CORRECTION path, ungated',
  () => /has been approved/.test(claims({ claims: [M('approval', ID, 'approve')], evidence: [], summary: 'ok',
    questions: [APPROVAL_FABRICATION + ' Anything else?'] }).summary), true);
defect('X4b', 'the same fabrication routed through pendingAction.summary',
  () => /has been approved/.test(claims({ claims: [M('approval', ID, 'approve')], evidence: [], summary: 'ok',
    pendingAction: { summary: APPROVAL_FABRICATION } }).summary), true);

// X5-X7. #66/D46 states the invariant FOUNDER_RESPONSE_NEVER_LEAKS_RAW_RESOURCE_UUID and
// routes labels through one formatter. Three sibling interpolations in the same two render
// paths were not routed through it, and all three are model-controlled strings.
defect('X5', 'resourceType is interpolated RAW into the typed fallback, so a uuid smuggled in it reaches founder prose',
  () => UUID_RE.test(claims({ claims: [{ type: 'mutation_result', resourceType: 'company|' + ID, resourceId: '', action: 'archive' }],
    evidence: [], summary: 'x' }).summary), true);
defect('X6', 'action is interpolated RAW into the rejection sentence, so a uuid smuggled in it reaches founder prose',
  () => UUID_RE.test(claims({ claims: [M('company', ID, 'archive ' + ID)], evidence: [], summary: 'x' }).summary), true);
defect('X7', 'predicate/expectedValue are interpolated RAW into a SUPPORTED state line, leaking a real canonical uuid',
  () => UUID_RE.test(claims({
    claims: [M('company', ID, 'archive'),
      { type: 'current_state', resourceType: 'company', resourceId: ID, predicate: 'owner_id', expectedValue: 'deadbeef-1111-2222-3333-444444444444' }],
    evidence: [], context: { companies: [{ id: ID, name: 'ACME', owner_id: 'deadbeef-1111-2222-3333-444444444444' }] },
    summary: 'x' }).summary), true);

let drift = 0, openDefects = 0;
for (const [id, kind, desc, thunk, expected] of X) {
  let actual;
  try { actual = thunk(); } catch (e) { actual = 'THREW: ' + e.message; }
  const okNow = actual === expected;
  if (!okNow) drift++;
  // A DEFECT entry is "still open" while it still reproduces exactly as recorded.
  if (kind === 'DEFECT' && actual === expected) openDefects++;
  console.log((okNow ? 'OK   ' : 'DRIFT') + ' ' + id.padEnd(4) + ' [' + kind + '] ' + desc);
  if (!okNow) console.log('        expected ' + JSON.stringify(expected) + ', measured ' + JSON.stringify(actual));
}

console.log('');
console.log('lifecycle_evidence_and_output_persistence_contract: ' + pass + '/' + (pass + failures.length)
  + ' contract checks passed, ' + (X.length - drift) + '/' + X.length + ' section-X cases match the recorded baseline');
console.log('DEPLOY GATE: ' + openDefects + ' open #67 defect(s) still reproduce on this source.');
if (openDefects > 0) console.log('DEPLOY GATE: see qa/KNOWN_FAILURE_MODES.md #67.');
if (failures.length) {
  console.log('');
  console.log('FAILURES:');
  for (const f of failures) console.log('  - ' + f);
}
if (drift > 0) {
  console.log('');
  console.log('BASELINE DRIFT in ' + drift + ' section-X case(s). If this was an intentional FIX, update the');
  console.log('expected value here in the SAME commit and say so in the report.');
}
if (failures.length || drift > 0) process.exit(1);
if (process.env.DEPLOY_GATE === '1' && openDefects > 0) process.exit(1);
