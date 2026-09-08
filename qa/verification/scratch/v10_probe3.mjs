// verifier #10 attempt 2 — additional seam probes (ASCII '?' inside the head, '…' labels,
// D71 false-refusal path, CRLF, tag questions). Same extractor as run8_defect_closure_contract.
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
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, paChanged: typeof pendingActionGatingChanged === "undefined" ? "n/a" : pendingActionGatingChanged, sqf: safeQuestionFragment, sol: safeOptionLabel, sps: safePendingSummary };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '', runtime = {} }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(runtime));
const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const show = (id, title, value) => console.log(`[${id}] ${title}\n   -> ${JSON.stringify(value)}`);
const p = run({ claims: null, summary: 'x' });

// ASCII '?' inside the head is NOT in the terminator set — a tag question shields the assertion
for (const [id, q] of [
  ['Q01', 'I archived ACME, right? Continue?'],
  ['Q02', 'ACME deleted, ok? Anything else?'],
  ['Q03', 'Done? ACME archived? Next?'],
  ['Q04', 'ACME deleted.\r\nContinue?'],
  ['Q05', 'ACME deleted.  continue?'],
  ['Q06', 'ACME deleted.\tContinue?'],
  ['Q07', 'ACME deleted (3 tasks). anything else?'],
  ['Q08', 'ACME deleted. ACME Services archived. Next?'],
]) show(id, JSON.stringify(q), { safeQuestionFragment: p.sqf(q), rendered: run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).summary });

// labels
for (const [id, l] of [['L01', 'ACME Services…'], ['L02', 'ACME Services...'], ['L03', 'A'.repeat(80) + '.'], ['L04', 'A'.repeat(80) + ' '], ['L05', 'ACME Services!!'], ['L06', 'ACME, deleted'], ['L07', 'ACME — deleted']])
  show(id, 'safeOptionLabel ' + JSON.stringify(l.length > 30 ? l.slice(0, 20) + '…(' + l.length + ')' : l), { out: p.sol(l), len: (p.sol(l) || '').length });

// D71 false-refusal path: a legit bulk summary with 'done'/'sent'/'closed'/'moved'
for (const [id, s] of [['S01', 'Mark 3 tasks as done'], ['S02', 'Archive ACME (currently closed)'], ['S03', 'Move 2 tasks to the Sales goal'], ['S04', 'Send the proposal to the client'], ['S05', 'Archive ACME and end employment for 2 people']])
  show(id, 'safePendingSummary ' + JSON.stringify(s), { persisted: p.sps(s), rendered: run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'bulk_confirmation', summary: s, action: { archiveCompanyIds: [ACME] } } }).summary });

// gating flag false-positive breadth: what fraction of ordinary pendingActions re-persist?
for (const [id, pa] of [
  ['F01', { kind: 'disambiguation', question: 'Which one?', options: [{ label: 'ACME', id: ID, entityType: 'company' }] }],
  ['F02', { kind: 'disambiguation', question: 'Which one?', summary: null, options: [{ label: 'ACME', id: ID, entityType: 'company' }] }],
  ['F03', { kind: 'bulk_confirmation', summary: 'Archive ACME', action: {} }],
  ['F04', { kind: 'bulk_confirmation', summary: 'Archive ACME', question: null, action: {} }],
  ['F05', { kind: 'open_question', question: 'Which company?' }],
  ['F06', { kind: 'open_question', question: 'Which company?', summary: null }],
]) show(id, 'flag for ' + JSON.stringify(pa), run({ claims: null, summary: 'ok', pendingAction: pa }).paChanged);
