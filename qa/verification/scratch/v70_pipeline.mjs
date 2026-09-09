// VERIFIER #70 — the REAL final-claim pipeline, sliced from index.ts and executed.
// Shared module used by every #70 behavioural probe. Nothing here re-implements product logic.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v70: repo root not found from ' + HERE);
}
export const ROOT = repoRoot();
const { stripTS, withPatternsAboveWindow } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));
export const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
export const src = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

function structuredBlock() {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const slice = withPatternsAboveWindow(src, stripTS(src.slice(start, src.indexOf('};', anchor) + 2)));
  for (const must of ['requestedIntent', 'IMPERATIVE_OBJECT', 'claimsPastCompletionWithNoGrounding', 'turnVerdict'])
    if (!slice.includes(must)) throw new Error('pipeline window missing ' + must);
  return slice;
}
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredBlock() + '\n; return { summary: result.summary, verdict: result.turnVerdict, requestedIntent, rejectedClaims, verifiedClaims };');
const DENO = { env: { get: () => undefined } };
const mk = () => new Map();

/** Run one turn through the real pipeline. */
export function turn(command, summary, opts = {}) {
  globalThis.command = command;
  globalThis.factLines = opts.factLines || [];
  globalThis.lifecycleReports = opts.lifecycleReports || [];
  globalThis.organizationGraphCheck = null;
  globalThis.workOrder = { id: 'wo-v70' };
  globalThis.knownEntityNames = opts.knownEntityNames || new Set();
  return fn({ claims: opts.claims === undefined ? null : opts.claims, summary,
              pendingAction: opts.pendingAction || null, questions: opts.questions,
              ...(opts.resultExtra || {}) },
            opts.evidence || [], opts.contextPack || {}, 'gpt', !!opts.grounded, false, DENO,
            mk(), mk(), mk(), mk(), false, opts.deterministicPrefix || '', mk());
}

// SELF-TEST — a window that stopped deriving intent would make every DEFECT row "pass".
{
  const c = turn('archive work order WO-1', 'Done — archived.');
  if (c.summary === 'Done — archived.') { console.error('v70 SELFTEST FAIL: pipeline no longer corrects a known fabrication'); process.exit(2); }
  const r = turn('what companies are archived?', 'ACME was archived in June.');
  if (r.summary !== 'ACME was archived in June.') { console.error('v70 SELFTEST FAIL: pipeline rewrites a plain read'); process.exit(2); }
}
export const RECEIPT = /No change was made —/;
