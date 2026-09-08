// verifier #11 attempt 2 — A/B the three new defect shapes on the PRIOR certified SHA
// (65ade7c, verifier #10's DO-NOT-DEPLOY baseline) vs the SHA under test (fdb4564), to
// classify each finding as REGRESSION or PRE-EXISTING. Read-only.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

function mk(src) {
  const s = readFileSync(src, 'utf8');
  const a = s.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const b = s.indexOf('executionEvidence: claimExecutionEvidence,', a);
  const slice = stripTS(s.slice(a, s.indexOf('};', b) + 2));
  const fn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
    'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
    slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };');
  const M = (o) => new Map(Object.entries(o || {}));
  return (o) => fn({ claims: o.claims ?? null, summary: o.summary ?? '', pendingAction: o.pendingAction ?? null, questions: o.questions },
    o.evidence ?? [], o.context ?? {}, 'gpt', o.grounded ?? false, false, { env: { get: () => undefined } },
    M(), M(), M(), M(), false, '', M());
}
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PRE = 'I can’t confirm from this turn’s execution record that the company was archived.';
for (const [tag, path] of [['65ade7c (prior certified SHA)', 'qa/verification/scratch/mut/index_65ade7c.ts'], ['fdb4564 (UNDER TEST)', 'supabase/functions/sem-ai-command/index.ts']]) {
  const run = mk(path);
  const Q = (q) => { const o = run({ claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], summary: 'x', questions: [q] }).summary;
    return o.startsWith(PRE) ? o.slice(PRE.length).trim() : o; };
  const lab = (l) => run({ summary: 'ok', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id: ACME, entityType: 'company' }] },
    context: { companies: [{ id: ACME, name: 'ACME Holdings' }] } }).envelope.pendingAction.options[0].label;
  console.log('=== ' + tag);
  console.log('  D88  "I archived ACME, ok?"         -> ' + JSON.stringify(Q('I archived ACME, ok?')));
  console.log('  D88  "ACME deleted everything, ok?" -> ' + JSON.stringify(Q('ACME deleted everything, ok?')));
  console.log('  D77  "I archived ACME. ok?"         -> ' + JSON.stringify(Q('I archived ACME. ok?')));
  console.log('  D83  "ACME deleted, ok? Next?"      -> ' + JSON.stringify(Q('ACME deleted, ok? Next?')));
  console.log('  D86  label "ACME Deleted"           -> ' + JSON.stringify(lab('ACME Deleted')));
  console.log('  D78  label "ACME deleted"           -> ' + JSON.stringify(lab('ACME deleted')));
  console.log('  D87  "Now removing ACME."  corrected= ' + run({ summary: 'Confirmed. Now removing ACME.' }).corrected);
  console.log('  Emul "Executing the plan…" corrected= ' + run({ summary: 'Confirmed. Executing the plan to reassign X.' }).corrected);
}
