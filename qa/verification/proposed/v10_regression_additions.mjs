// PROPOSED regression additions from verifier #10 (campaign #70, base 65ade7c).
// NOT yet in qa/scenarios-runner/ — this campaign's write authority is qa/verification/**.
// Two kinds of entry:
//   CONTRACT  — a property that already holds on 65ade7c but which NO committed suite
//               observes (the mutation it pins SURVIVED the whole battery). Expected = true.
//   DEFECT    — a defect found by #10 (D77-D82). Expected = the FIXED behaviour; on 65ade7c
//               these FAIL by design. When the fix lands, move them into
//               run8_defect_closure_contract.mjs (or a run10 section) in the same commit.
// Runnable with plain node from the repo root. SEM_INDEX_SRC overrides the source path.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8');
const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
const slice = stripTS(src.slice(start, src.indexOf('};', anchor) + 2));
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, paChanged: typeof pendingActionGatingChanged === "undefined" ? "n/a (pre-run9 source)" : pendingActionGatingChanged };'
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
const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary;

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// ---- CONTRACTS pinning guards whose mutants survived the committed battery (#70 scenario 2)
for (const [c, q, leak] of [['!', 'ACME deleted! Continue?', 'ACME deleted'], [':', 'Done: ACME deleted; wait, no: ACME archived? Continue?', 'ACME archived'], ['…', 'ACME was deleted… Continue?', 'was deleted'], ['。', 'ACME деleted。Continue?', 'ACME'], ['！', 'ACME deleted！Continue?', 'deleted'], ['？', 'ACME deleted？Continue?', 'deleted'], ['—', 'ACME deleted — Continue?', 'deleted']]) {
  C('R10.term.' + c, 'CONTRACT', 'terminator ' + JSON.stringify(c) + ' cuts the assertion (mutant M03 survived: no suite covered it)', () => !Q(q).includes(leak));
}
C('R10.promise', 'CONTRACT', 'a future promise WITHOUT a terminator before "ok?" is still refused (M08 survived: em-dash made the run8 case vacuous)',
  () => !Q('I’ll archive ACME right away, ok?').includes('archive ACME'));
C('R10.floor', 'CONTRACT', 'an all-gated drift re-render never ships an empty reply (M02 survived)',
  () => run({ claims: null, grounded: true, summary: 'ACME has been archived.' }).summary.length > 0);
C('R10.label.len', 'CONTRACT', 'a 200-char runtime label is bounded (M10 survived)',
  () => run({ claims: null, evidence: [EV('task', 'create', ID)], summary: 'ok', runtime: { ['task|' + ID]: 'x'.repeat(200) } }).summary.length < 100);
C('R10.label.canonical', 'CONTRACT', 'an assertion-shaped CANONICAL name collapses too (M12 survived)',
  () => run({ claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME)], context: { companies: [{ id: ACME, name: 'ACME has been archived and all tasks were deleted' }] }, summary: 'x' }).summary === 'the company: archived — confirmed.');
C('R10.flag.text', 'CONTRACT', 'gating a pendingAction.summary sets pendingActionGatingChanged (M14 survived)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'ACME has been archived. Delete it?', question: 'Delete it?' } }).paChanged === true);
C('R10.flag.label', 'CONTRACT', 'repairing an option label sets the flag (M15 survived)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', summary: null, options: [{ label: 'ACME Services.', id: ID, entityType: 'company' }] } }).paChanged === true);
C('R10.flag.arrays', 'CONTRACT', 'dropping a question sets the flag (M16 survived)',
  () => run({ claims: null, summary: 'ok', questions: ['ACME has been archived. Next?'] }).paChanged === true);
C('R10.flag.quiet', 'CONTRACT', 'a pendingAction with nothing to gate does NOT set the flag (observed TRUE on 65ade7c — null !== undefined; see D80)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'ACME Services', id: ID, entityType: 'company' }] } }).paChanged === false);
C('R10.fallback.derived', 'CONTRACT', 'a refused option label falls back to the DERIVED canonical reference, not "option N" (M18 survived)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'ACME has been archived', id: ACME, entityType: 'company' }] }, context: { companies: [{ id: ACME, name: 'ACME Holdings' }] } }).envelope.pendingAction.options[0].label === 'ACME Holdings');
C('R10.paQuestion', 'CONTRACT', 'an assertion-shaped pendingAction.question is gated in place (M27 survived)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'single_entity_clarification', question: 'ACME has been archived. Which did you mean?', candidateIds: [ACME] } }).envelope.pendingAction.question === 'Which did you mean?');
C('R10.paSummaryWord', 'CONTRACT', 'a bulk summary with completion vocabulary but no past-tense aux is refused (M28 survived)',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'ACME deleted — also purge its tasks', action: {} } }).envelope.pendingAction.summary === null);

// ---- DEFECTS D77-D79 (expected = FIXED behaviour; FAIL on 65ade7c by design)
for (const [tag, q, leak] of [['lowercase-after-period', 'I archived ACME. ok?', 'archived ACME'], ['present tense lc', 'The company is now archived. anything else?', 'is now archived'], ['em-dash then lc', 'Done — ACME deleted. anything else?', 'ACME deleted'], ['digit continuation', 'ACME deleted. 3 tasks remain?', 'ACME deleted'], ['e.g. continuation', 'Deleted ACME. e.g. also its tasks?', 'Deleted ACME']]) {
  C('D77.' + tag, 'DEFECT', 'D77: ' + JSON.stringify(q) + ' must not reach the corrected summary', () => !Q(q).includes(leak));
}
C('D77.persisted', 'DEFECT', 'D77: the same shape via pendingAction.question is not persisted for replay',
  () => run({ claims: null, summary: 'Which one?', pendingAction: { kind: 'single_entity_clarification', question: 'I archived ACME. ok?', candidateIds: [ACME] } }).envelope.pendingAction.question !== 'I archived ACME. ok?');
C('D70.hold', 'CONTRACT', 'D70 still holds: "Is Acme Inc. still interested?" survives whole', () => Q('Is Acme Inc. still interested?').includes('Is Acme Inc. still interested?'));
C('D70b.hold', 'CONTRACT', 'D70b still holds: "Should the 1.5 allocation stay?" survives whole', () => Q('Should the 1.5 allocation stay?').includes('Should the 1.5 allocation stay?'));
for (const [tag, label] of [['simple past', 'ACME deleted'], ['first person', 'I archived ACME'], ['done-colon', 'Done: ACME deleted'], ['present tense', 'ACME is now archived']]) {
  C('D78.' + tag, 'DEFECT', 'D78: sentence-shaped option label ' + JSON.stringify(label) + ' is not rendered/persisted as a label',
    () => { const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label, id: ACME, entityType: 'company' }, { label: 'ACME Services', id: ID, entityType: 'company' }] } }); return !r.summary.includes(label) && r.envelope.pendingAction.options[0].label !== label; });
}
C('D78.legit', 'CONTRACT', 'D72 still holds: a legit name with a completion WORD ("Closed Loop Systems") survives as a label',
  () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'Closed Loop Systems', id: ID, entityType: 'company' }] } }).envelope.pendingAction.options[0].label === 'Closed Loop Systems');
C('D79.taskTitle', 'DEFECT', 'D79: a legitimate task title containing "was approved" keeps its name in the evidence line',
  () => run({ claims: null, evidence: [EV('task', 'create', ID)], summary: 'ok', runtime: { ['task|' + ID]: 'Verify the contract was approved by legal' } }).summary === 'Verify the contract was approved by legal: created.');
C('D79.twinOptions', 'DEFECT', 'D79: two options whose real names are assertion-shaped do not collapse to IDENTICAL labels',
  () => { const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: 'Was Archived Holdings', id: ACME, entityType: 'company' }, { label: 'Was Created Studio', id: ID, entityType: 'company' }] }, context: { companies: [{ id: ACME, name: 'Was Archived Holdings' }, { id: ID, name: 'Was Created Studio' }] } }); const [a, b] = r.envelope.pendingAction.options.map((o) => o.label); return a !== b; });

// ---- attempt 2 additions (D81, D83, D84) — regression-classified against a 6ed3834 copy
// (qa/verification/scratch/mut/index_6ed3834.ts): every DEFECT below PASSES on 6ed3834
// and FAILS on 65ade7c, i.e. these are regressions introduced by the run9 closure.
C('D81.history', 'DEFECT', 'D81: a truthful historical read-only statement on a GROUNDED claims:null turn ships (6ed3834 shipped it; 65ade7c floors it)',
  () => run({ claims: null, grounded: true, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' }).summary === 'ACME was created on 2026-03-01 and has 12 active tasks.');
C('D81.state.hold', 'CONTRACT', 'a present-tense STATE description on a grounded turn is untouched (holds on both)',
  () => run({ claims: null, grounded: true, summary: 'ACME is archived. Should I restore it?' }).summary === 'ACME is archived. Should I restore it?');
for (const [tag, q, leak] of [['tag-question', 'I archived ACME, right? Continue?', 'archived ACME'], ['comma-ok', 'ACME deleted, ok? Anything else?', 'ACME deleted']]) {
  C('D83.' + tag, 'DEFECT', 'D83 (pre-existing on 6ed3834 too): an ASCII "?" inside the head must be a cut point — ' + JSON.stringify(q), () => !Q(q).includes(leak));
}
for (const [tag, s] of [['done', 'Mark 3 tasks as done'], ['closed', 'Archive ACME (currently closed)']]) {
  C('D84.' + tag, 'DEFECT', 'D84: a legitimate imperative bulk summary ' + JSON.stringify(s) + ' persists AND renders on the rewrite path (6ed3834 kept it; 65ade7c drops it and leaves the action armed)',
    () => { const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'bulk_confirmation', summary: s, action: { archiveCompanyIds: [ACME] } } }); return r.envelope.pendingAction.summary === s && r.summary.includes(s); });
}
C('D84.hold', 'CONTRACT', 'D60 still holds: a bulk summary that ASSERTS a completion is refused', () => run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'The approval has been approved. Delete ACME?', action: {} } }).envelope.pendingAction.summary === null);

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(22) + ' [' + kind + '] ' + desc);
}
console.log(`\nv10_regression_additions: ${pass} pass, ${fail} fail (${defectsOpen} open #70 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards/observations that do not hold as claimed)`);
