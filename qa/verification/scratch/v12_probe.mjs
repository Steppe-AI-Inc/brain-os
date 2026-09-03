// verifier #12 probe harness: executes the REAL gate slice out of index.ts (same
// extraction the committed run11 suite uses) and exposes label / question behaviour so
// mutants can be classified and the new rules attacked with arbitrary inputs.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8');
const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found');
const gateSlice = stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', grounded = false, deterministicPrefix = '', runtime = {} }) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO,
    mk(), mk(), mk(), mk(), false, deterministicPrefix, mk(runtime));

export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const ID = '11111111-1111-1111-1111-111111111111';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const PREAMBLE = 'I can’t confirm from this turn’s execution record that the company was archived.';

/** Feed one question through the real question-sanitiser; returns the SURVIVING text ('' = dropped). */
export const question = (q) => {
  const out = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary;
  return out.startsWith(PREAMBLE) ? out.slice(PREAMBLE.length).trim() : out;
};

/** Feed one disambiguation option label through the real label gate; returns the RENDERED label. */
export const label = (l, ctxName) => {
  const r = run({ claims: null, summary: 'ok',
    pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
    context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} });
  return r.envelope?.pendingAction?.options?.[0]?.label;
};

/** True when the summary was corrected (progressive/completion fabrication caught). */
export const corrected = (summary) => run({ claims: null, evidence: [], grounded: false, summary }).corrected === true;
