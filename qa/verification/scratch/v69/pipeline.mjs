// VERIFIER #69 — the WHOLE-TURN final-claim pipeline, sliced from the real structured-claim block of
// index.ts (the same window architecture_final_claim_contract.mjs measures). Exported so an attack script
// can ask the product itself: "with THIS command and THIS model prose, what reaches the founder?"
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow } from '../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = source.indexOf('};', anchor) + 2;
  return withPatternsAboveWindow(source, stripTS(source.slice(start, end)));
}
const slice = extractStructuredBlock(src);
for (const must of ['requestedIntent', 'claimsPastCompletionWithNoGrounding', 'turnVerdict', 'receiptRendered'])
  if (!slice.includes(must)) throw new Error('pipeline window missing ' + must);

const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, '
  + 'pendingAction: result.pendingAction, verdict: result.turnVerdict, requestedIntent };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));

/** One real turn through the product's own final-claim block. */
export function turnClaim({ command, claims = null, summary = '', pendingAction = null, questions, evidence = [],
  context = {}, model = 'gpt', grounded = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [] }) {
  globalThis.command = command;
  globalThis.lifecycleReports = lifecycleReports;
  globalThis.factLines = factLines;
  globalThis.organizationGraphCheck = null;
  globalThis.workOrder = { id: 'wo-v69' };
  return fn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), false, deterministicPrefix, mk());
}
export const NO_CHANGE = /^(?:.*\s)?No change was made — /;
