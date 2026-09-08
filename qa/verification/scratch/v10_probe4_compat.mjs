// verifier #10 attempt 2 — version-tolerant probes (run on 65ade7c AND the 6ed3834 copy)
// for the T08 / T13b / T09e comparisons that v10_attacks.mjs cannot do on 6ed3834.
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
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '', runtime = {} }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(runtime));
const ID = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
const show = (id, title, value) => console.log(`[${id}] ${title}\n   -> ${JSON.stringify(value)}`);
console.log('SRC=' + SRC);
for (const [id, label] of [['T08a', 'ACME deleted'], ['T08b', 'I archived ACME'], ['T08c', 'Done: ACME deleted'], ['T08e', 'ACME is now archived']]) {
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x',
    pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label, id: ACME, entityType: 'company', actionType: 'archive' }, { label: 'ACME Services', id: ID, entityType: 'company', actionType: 'archive' }] } });
  show(id, 'option label ' + JSON.stringify(label), { persistedLabel: r.envelope.pendingAction.options[0].label, summary: r.summary });
}
show('T13b', 'grounded, claims:null, truthful historical prose', run({ claims: null, grounded: true, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' }).summary);
show('T13d', 'grounded, claims:null, truthful STATE prose (present tense)', run({ claims: null, grounded: true, summary: 'ACME is archived. Should I restore it?' }).summary);
show('T09e', 'runtime label "Verify the contract was approved by legal"', run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: 'Verify the contract was approved by legal' } }).summary);
show('T09a', 'canonical company "Was Archived Holdings", supported archive', run({ claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME)], context: { companies: [{ id: ACME, name: 'Was Archived Holdings', status: 'active' }] }, summary: 'x' }).summary);
show('T02', 'questions ["I archived ACME. ok?"]', run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['I archived ACME. ok?'] }).envelope.questions);
show('T05', 'questions ["ACME deleted. 3 tasks remain?"]', run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['ACME deleted. 3 tasks remain?'] }).envelope.questions);
show('T07', 'pendingAction.question "I archived ACME. ok?" persisted', run({ claims: null, summary: 'Which one?', pendingAction: { kind: 'single_entity_clarification', question: 'I archived ACME. ok?', candidateIds: [ACME] } }).envelope.pendingAction.question);
show('D70', 'questions ["Is Acme Inc. still interested?"]', run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: ['Is Acme Inc. still interested?'] }).envelope.questions);
