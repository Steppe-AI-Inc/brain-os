#!/usr/bin/env node
// VERIFIER #69 / campaign #129 — REGRESSION ADDITIONS.
//
// Every row is tagged CONTRACT (a property that holds on candidate 0ca756ee and must never regress) or
// DEFECT (a property that DOES NOT hold on 0ca756ee — V69-D1..D6 — and must hold after the fix).
// ANY failure exits non-zero. The source under test is SEM_INDEX_SRC, else the repo copy resolved from
// this file's own location, so the suite is correct from any cwd.
//
// The windows are SLICED FROM THE REAL index.ts and executed. Nothing here re-implements product logic:
// a re-implementation can agree with a harness while disagreeing with production, which is the failure
// this campaign exists to prevent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// PROMOTION ADJUSTMENT (2026-09-09). The verifier wrote this file in qa/verification/proposed/, so both of
// its paths counted three levels up. Promoted into qa/scenarios-runner/ that is one level too many, and the
// failure was an ERR_MODULE_NOT_FOUND naming a directory that has never existed. Walking up to the repo root
// by looking for a file that is actually there makes the suite correct from ANY location — which is what its
// own header already promised — instead of correct at exactly one depth.
function repoRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  throw new Error('v69: repo root not found from ' + HERE);
}
const ROOT = repoRoot();
const { stripTS, withPatternsAboveWindow } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const raw = readFileSync(SRC, 'utf8');
const src = raw.replace(/\r\n?/g, '\n');

let pass = 0; const failures = [];
const check = (kind, name, cond, detail) => {
  if (cond) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { failures.push('[' + kind + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + kind + '] ' + name); }
};

// ---------------------------------------------------------------- the real final-claim pipeline
function structuredBlock() {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this suite, do not skip it');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this suite');
  const slice = withPatternsAboveWindow(src, stripTS(src.slice(start, src.indexOf('};', anchor) + 2)));
  for (const must of ['requestedIntent', 'IMPERATIVE_OBJECT', 'claimsPastCompletionWithNoGrounding', 'turnVerdict'])
    if (!slice.includes(must)) throw new Error('pipeline window missing ' + must + ' — it would measure a fragment');
  return slice;
}
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  structuredBlock() + '\n; return { summary: result.summary, verdict: result.turnVerdict, requestedIntent, sig: { lexiconAlways, lexiconPassive, lexiconObject, lexiconImperative: (typeof lexiconImperative !== "undefined" ? lexiconImperative : "n/a"), alwaysInImperativePosition } };');
const DENO = { env: { get: () => undefined } };
const mk = () => new Map();
const turnClaim = (command, summary, evidence = []) => {
  // The request-side values production reads from the enclosing handler scope. The COMMAND is the input
  // under test; the rest are the honest empty defaults for a turn in which no executor ran.
  globalThis.command = command;
  globalThis.factLines = [];
  globalThis.lifecycleReports = [];
  globalThis.organizationGraphCheck = null;
  globalThis.workOrder = { id: 'wo-v69' };
  return fn({ claims: null, summary, pendingAction: null, questions: undefined },
    evidence, {}, 'gpt', false, false, DENO, mk(), mk(), mk(), mk(), false, '', mk());
};
// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: a self-test before any measurement, so a window that stopped
// deriving intent cannot make every DEFECT row "pass" by making every command invisible.
{
  const control = turnClaim('archive work order WO-1', 'Done — archived.');
  if (control.summary === 'Done — archived.') { console.error('SELFTEST FAIL: the pipeline window no longer corrects a known fabrication'); process.exit(2); }
  const read = turnClaim('what companies are archived?', 'ACME was archived in June.');
  if (read.summary !== 'ACME was archived in June.') { console.error('SELFTEST FAIL: the pipeline window rewrites a plain read'); process.exit(2); }
}
for (const c of ['Fire drill report for the department', 'Post mortem report for the project',
  'Order status report for the board', 'Issue log report for the team', 'Merge conflict report for the project']) {
  const r = turnClaim(c, 'The department has three open items.');
  console.log(JSON.stringify(c), JSON.stringify(r.sig));
}
