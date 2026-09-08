// verifier #13 probe harness (campaign #73, sha ace9b6a). Executes the REAL gate slice
// and the REAL matchDisambiguationOption out of index.ts — no reimplementation.
// Exports: Q (question fragment), label (option label), labels (multi-option render),
// match (disambiguation matcher), corrected (drift/progressive correction), run (raw).
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8');

const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found');
const gateSlice = stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, questions: result.questions };');

const mStart = src.indexOf('function matchDisambiguationOption');
const mEnd = src.indexOf('\n}', mStart);
if (mStart === -1 || mEnd === -1) throw new Error('matchDisambiguationOption not found');
export const match = new Function('command', 'options',
  stripTS(src.slice(mStart, mEnd + 2)) + '\n; return matchDisambiguationOption(command, options);');

const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const ID2 = '11111111-1111-1111-1111-111111111111';
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });

export const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, grounded = false, deterministicPrefix = '' }) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, 'gpt', grounded, false, DENO,
    mk(), mk(), mk(), mk(), false, deterministicPrefix, mk());

const PREAMBLE = 'I can’t confirm from this turn’s execution record that the company was archived.';
export const surviving = (out) => (out.startsWith(PREAMBLE) ? out.slice(PREAMBLE.length).trim() : out);

// A question fragment as it survives the gate on a correction turn.
export const Q = (q) => surviving(run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary);
// The raw envelope questions array (distinguishes "dropped entirely" from "reduced").
export const Qarr = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions;

// A single option label as rendered to the founder. ctxName seeds the canonical read.
export const label = (l, ctxName) => run({ claims: null, summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
  context: ctxName ? { companies: [{ id: ACME, name: ctxName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label;

// Multi-option render: opts = [{label,id,entityType}], ctx = {companies:[...]}
export const labels = (opts, context = {}) => run({ claims: null, summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: opts }, context })
  .envelope?.pendingAction?.options?.map((o) => o.label);

// A pendingAction question as it survives the gate on an ORDINARY turn.
export const paQ = (q, action = { archiveCompanyIds: [ACME] }) => {
  const r = run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', question: q, summary: 'Archive ACME', action } });
  return r.envelope?.pendingAction?.question;
};

export const corrected = (s) => run({ claims: null, evidence: [], grounded: false, summary: s }).corrected === true;
