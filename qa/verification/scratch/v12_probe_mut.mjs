// Same probe, but builds the gate from an IN-MEMORY mutated copy of index.ts (the file on
// disk is never touched). Used to classify surviving mutants: a mutant is EQUIVALENT only
// if no input distinguishes mutated from unmutated behaviour.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const RAW = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');

export function build(transform = (s) => s) {
  const src = transform(RAW);
  const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
  if (gStart === -1 || gAnchor === -1) throw new Error('anchors not found');
  const slice = stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2));
  const fn = new Function(
    'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
    'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
    slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');
  const DENO = { env: { get: () => undefined } };
  const mk = (o) => new Map(Object.entries(o || {}));
  const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
  const PRE = 'I can’t confirm from this turn’s execution record that the company was archived.';
  const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, grounded = false, deterministicPrefix = '' }) =>
    fn({ claims, summary, pendingAction, questions }, evidence, context, 'gpt', grounded, false, DENO,
      mk(), mk(), mk(), mk(), false, deterministicPrefix, mk());
  return {
    run,
    question: (q) => { const o = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary;
      return o.startsWith(PRE) ? o.slice(PRE.length).trim() : o; },
    label: (l, ctxName) => run({ claims: null, summary: 'ok',
      pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
      context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label,
    corrected: (s) => run({ claims: null, evidence: [], grounded: false, summary: s }).corrected === true,
  };
}
