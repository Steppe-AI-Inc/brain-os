import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';
const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
const slice = stripTS(src.slice(start, src.indexOf('};', anchor) + 2));
const fn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, safeQuestionFragment, paChanged: pendingActionGatingChanged };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', grounded = false }) =>
  fn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO, mk(), mk(), mk(), mk(), false, '', mk());
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const p = run({});
const show = (t, v) => console.log(t + '\n   -> ' + JSON.stringify(v));
show('P1 inner ASCII "?" not a boundary: "I archived ACME? Continue?"', p.safeQuestionFragment('I archived ACME? Continue?'));
show('P1b "ACME deleted? Continue?"', p.safeQuestionFragment('ACME deleted? Continue?'));
show('P1c fullwidth: "ACME deleted？ Continue?"', p.safeQuestionFragment('ACME deleted？ Continue?'));
show('P2 lexical match drops WHOLE entry (no cut): "ACME has been archived. Which did you mean?"', p.safeQuestionFragment('ACME has been archived. Which did you mean?'));
show('P2b non-lexical is cut: "ACME is now archived. Which did you mean?"', p.safeQuestionFragment('ACME is now archived. Which did you mean?'));
const r = run({ claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], summary: 'x',
  pendingAction: { kind: 'single_entity_clarification', question: 'ACME has been archived. Which did you mean?', candidateIds: [ACME], actionType: 'archive' } });
show('P2c rewrite turn with that pa.question: summary / persisted question', { summary: r.summary, persistedQuestion: r.envelope.pendingAction.question });
show('P3 flag on a pendingAction that HAS summary:null and question present (nothing to gate)', run({ pendingAction: { kind: 'x', summary: null, question: 'Which?' } }).paChanged);
show('P3b flag on a pendingAction with no summary key at all', run({ pendingAction: { kind: 'x', question: 'Which?' } }).paChanged);
show('P4 model=deterministic-disambiguation, ungrounded, summary "Confirmed — ACME deleted." (label channel replay)', run({ model: 'deterministic-disambiguation', summary: 'Confirmed — ACME deleted.' }));
show('P5 model=deterministic-clarification, ungrounded, "Confirmed — Did you mean ACME."', run({ model: 'deterministic-clarification', summary: 'Confirmed — Did you mean ACME.' }).summary);
