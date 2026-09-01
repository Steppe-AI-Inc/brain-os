// Independent verifier #7 attack harness — executes the REAL block from index.ts.
// Written from scratch (not derived from the implementer's suite) to avoid inheriting
// its assumptions. Wide window: STRUCTURED-CLAIM VERIFICATION -> end of the envelope.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = new URL('../../../supabase/functions/sem-ai-command/index.ts', import.meta.url);
const src = readFileSync(SRC, 'utf8');

function wide(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('no structured-claim block');
  const envIdx = source.indexOf('result.verifiedResponse = {', start);
  if (envIdx === -1) throw new Error('no envelope');
  const envEnd = source.indexOf('};', envIdx);
  if (envEnd === -1) throw new Error('unterminated envelope');
  return stripTS(source.slice(start, envEnd + 2));
}
const slice = wide(src);
if (/\btype\s+\w+\s*=/.test(slice) || /\b(const|let|var)\s+\w+\s*:\s*[A-Za-z_]/.test(slice)) throw new Error('TS survived');

export const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, legacy: legacyProseFallback, hasRejected: hasRejectedClaims, hasSupportedMut: hasSupportedMutationClaim };'
);
const DENO_OFF = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [],
  context = {}, model = 'gpt', grounded = false, future = false, labels = {}, deno = DENO_OFF }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, future,
     deno, mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal));

export const ev = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
export const A = '11111111-1111-1111-1111-111111111111';
export const B = '22222222-2222-2222-2222-222222222222';
export const APPROVAL_FAB = 'Approval 358eddeb-c6ac-4a85-ab26-77dc3960fcba has been approved.';
