// verifier #10 — seam attacks on the run9 fixes. Executes the REAL structured-claim window
// extracted from index.ts (same extractor as run8_defect_closure_contract.mjs) but returns
// extra internals (pendingActionGatingChanged, the LEGACY regex) so the flag can be observed.
// Prints ACTUAL outputs; classification is done by the verifier, not by expectations baked in.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8');
function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start === -1 || anchor === -1) throw new Error('window not found');
  const end = source.indexOf('};', anchor) + 2;
  return stripTS(source.slice(start, end));
}
const slice = extractStructuredBlock(src);
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, paChanged: pendingActionGatingChanged, LEGACY: LEGACY_PAST_COMPLETION, PCP: PAST_COMPLETION_CLAIM_PATTERN, safeQuestionFragment, safeOptionLabel, safeDisplayLabel, displayName, rewrite: rewriteFromStructure, legacy: legacyProseFallback, drift: structuredProseDrift };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '', runtime = {} }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(runtime));

// also extract matchDisambiguationOption (outside the window) to test the label-collision consequence
const mdStart = src.indexOf('function matchDisambiguationOption(');
const mdEnd = src.indexOf('\n}', mdStart) + 2;
const matchDisambiguationOption = new Function(stripTS(src.slice(mdStart, mdEnd)) + '\n; return matchDisambiguationOption;')();

const ID = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok });
const out = [];
const show = (id, title, value) => { out.push({ id, title, value }); console.log(`\n[${id}] ${title}\n   -> ${JSON.stringify(value)}`); };

// ---- T01-T06: lowercase/digit after a period vs the abbreviation guard (question channel)
for (const [id, q] of [
  ['T01', 'ACME was archived. and now?'],
  ['T02', 'I archived ACME. ok?'],
  ['T03', 'The company is now archived. anything else?'],
  ['T04', 'Done — ACME deleted. anything else?'],
  ['T05', 'ACME deleted. 3 tasks remain?'],
  ['T06', 'I archived ACME… anything else?'],
  ['T06b', 'Deleted ACME. e.g. also its tasks?'],
  ['T06c', 'ACME archived. next?'],
]) {
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] });
  show(id, 'questions[] = ' + JSON.stringify(q), { safeQuestionFragment: r.safeQuestionFragment(q), summary: r.summary, envelopeQuestions: r.envelope.questions });
}
// ---- T07: same via pendingAction.question (persisted + replayed channel)
{
  const r = run({ claims: null, grounded: false, summary: 'Which one?', pendingAction: { kind: 'single_entity_clarification', question: 'I archived ACME. ok?', candidateIds: [ACME] } });
  show('T07', 'pendingAction.question = "I archived ACME. ok?" (claims null, ungrounded)', { persistedQuestion: r.envelope.pendingAction.question, summary: r.summary, paChanged: r.paChanged, corrected: r.corrected });
}
// ---- T08: option labels — COMPLETION_WORD no longer applied to labels after D72
for (const [id, label] of [['T08a', 'ACME deleted'], ['T08b', 'I archived ACME'], ['T08c', 'Done: ACME deleted'], ['T08d', 'ACME (archived)'], ['T08e', 'ACME is now archived'], ['T08f', 'ACME компанийг архивласан']]) {
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x',
    pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label, id: ACME, entityType: 'company', actionType: 'archive' }, { label: 'ACME Services', id: ID, entityType: 'company', actionType: 'archive' }] } });
  show(id, 'option label = ' + JSON.stringify(label), { persistedLabel: r.envelope.pendingAction.options[0].label, summaryHasLabel: r.summary.includes(label), summary: r.summary });
}
// ---- T09: PAST_COMPLETION-shaped CANONICAL company name
{
  const ctx = { companies: [{ id: ACME, name: 'Was Archived Holdings', status: 'active' }, { id: ID, name: 'Was Created Studio', status: 'active' }] };
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME)], context: ctx, summary: 'x' });
  show('T09a', 'supported archive claim on canonical name "Was Archived Holdings"', r.summary);
  const r2 = run({ claims: [M('company', ACME, 'archive')], evidence: [], context: ctx, summary: 'x',
    pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label: 'Was Archived Holdings', id: ACME, entityType: 'company', actionType: 'archive' }, { label: 'Was Created Studio', id: ID, entityType: 'company', actionType: 'archive' }] } });
  const labels = r2.envelope.pendingAction.options.map((o) => o.label);
  show('T09b', 'two disambiguation options whose real names are assertion-shaped', { labels, summary: r2.summary, matchByTypingLabel: matchDisambiguationOption('the company', r2.envelope.pendingAction.options), matchByTypingRealName: matchDisambiguationOption('Was Archived Holdings', r2.envelope.pendingAction.options) });
  const r3 = run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: 'Restored Furniture Co follow-up' } });
  show('T09c', 'runtime label with a bare completion word (no aux) "Restored Furniture Co follow-up"', r3.summary);
  const r4 = run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: 'Check if invoice was sent' } });
  show('T09d', 'runtime label "Check if invoice was sent" (task title, legit)', r4.summary);
  const r5 = run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: 'Verify the contract was approved by legal' } });
  show('T09e', 'runtime label "Verify the contract was approved by legal" (task title, legit)', r5.summary);
}
// ---- T10: 80/81-char labels; assertion beyond the truncation point
{
  const L80 = 'A'.repeat(80), L81 = 'A'.repeat(81);
  show('T10a', 'runtime label exactly 80 chars', run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: L80 } }).summary.length);
  const s81 = run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: L81 } }).summary;
  show('T10b', 'runtime label 81 chars -> rendered label length / ends with …', { len: s81.length, text: s81 });
  const hidden = 'B'.repeat(70) + ' ACME has been archived';
  show('T10c', 'assertion positioned after char 77 (truncated before the assertion test)', run({ claims: null, evidence: [EV('task', 'create', ID2)], summary: 'ok', runtime: { ['task|' + ID2]: hidden } }).summary);
  const r = run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: L81 + '.', id: ACME, entityType: 'company' }, { label: 'ACME Services…', id: ID, entityType: 'company' }] } });
  show('T10d', 'option labels: 81 chars + trailing "." / name ending in "…"', r.envelope.pendingAction.options.map((o) => [o.label.length, o.label.slice(-3)]));
}
// ---- T12: the D68 honest floor vs LEGACY / loop risk
{
  const FLOOR = 'I can’t confirm the completion my draft described from this turn’s execution record — nothing verifiable was changed. Please ask again or use the relevant page in the app.';
  const probe = run({ claims: null, summary: 'x' });
  show('T12a', 'LEGACY_PAST_COMPLETION.test(FLOOR) / PAST_COMPLETION_CLAIM_PATTERN.test(FLOOR)', [probe.LEGACY.test(FLOOR), probe.PCP.test(FLOOR)]);
  const r = run({ claims: null, grounded: true, summary: FLOOR });
  show('T12b', 'floor text fed back as a grounded claims:null summary (loop check)', { unchanged: r.summary === FLOOR, corrected: r.corrected });
  const r2 = run({ claims: null, grounded: true, evidence: [], summary: 'ACME has been archived.' });
  show('T12c', 'grounded (entity-resolution only), claims:null, fabricated completion -> floor?', r2.summary);
  const r3 = run({ claims: null, grounded: true, evidence: [], summary: 'ACME has been archived.', pendingAction: { kind: 'open_question', question: 'Shall I also archive Beta?' } });
  show('T12d', 'same + pendingAction open_question -> question survives?', r3.summary);
}
// ---- T13: truthful historical fact (read-only) — parity check
{
  const r = run({ claims: null, grounded: false, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' });
  show('T13a', 'read-only historical fact, ungrounded, claims:null (v92 legacy path)', r.summary);
  const r2 = run({ claims: null, grounded: true, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' });
  show('T13b', 'same sentence on a grounded turn with nothing structural (post-D68)', r2.summary);
  const r3 = run({ claims: [{ type: 'existence', resourceType: 'company', resourceId: ACME }], context: { companies: [{ id: ACME, name: 'ACME', status: 'active', created_at: '2026-03-01' }] }, grounded: false, summary: 'ACME was created on 2026-03-01.' });
  show('T13c', 'same sentence with an existence claim (structured mode) — 6ed3834 behaviour', r3.summary);
}
// ---- T15: deterministic-clarification / disambiguation models
{
  const r = run({ model: 'deterministic-clarification', claims: null, grounded: true, fullyDeterministic: true, deterministicPrefix: 'ACME: archived.', summary: 'ACME: archived.' });
  show('T15a', 'deterministic-clarification, archive executed (lifecycle report prefix)', { summary: r.summary, rewrite: r.rewrite, legacy: r.legacy });
  const r2 = run({ model: 'deterministic-disambiguation', claims: null, grounded: false, summary: 'Confirmed — ACME deleted.' });
  show('T15b', 'deterministic-disambiguation, nothing grounded, replayed option label "ACME deleted"', { summary: r2.summary, rewrite: r2.rewrite, legacy: r2.legacy, drift: r2.drift });
  const r3 = run({ model: 'deterministic-clarification', claims: null, grounded: false, summary: 'Confirmed — Did you mean ACME (it was archived last week).' });
  show('T15c', 'deterministic-clarification, nothing grounded, replayed question w/ completion wording', { summary: r3.summary, rewrite: r3.rewrite, legacy: r3.legacy, drift: r3.drift });
}
// ---- T16: pendingActionGatingChanged observability
{
  const a = run({ claims: null, summary: 'Which?', pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label: 'ACME Services.', id: ID, entityType: 'company' }] } });
  show('T16a', 'label repaired (trailing period) -> flag', a.paChanged);
  const b = run({ claims: null, summary: 'Which?', pendingAction: { kind: 'disambiguation', question: 'Which one?', options: [{ label: 'ACME Services', id: ID, entityType: 'company' }] } });
  show('T16b', 'nothing gated -> flag', b.paChanged);
  const c = run({ claims: null, summary: 'ok', proposedActions: ['  Archive ACME next  '] });
  show('T16c', 'proposedAction whitespace-trimmed only (text changed, length same) -> flag / persisted', { flag: c.paChanged, persisted: c.envelope.proposedActions });
  const d = run({ claims: null, summary: 'ok', questions: ['Which company?', 'ACME has been archived. Next?'] });
  show('T16d', 'one of two questions reduced -> flag / persisted', { flag: d.paChanged, persisted: d.envelope.questions });
  const e = run({ claims: null, summary: 'ok', pendingAction: { kind: 'bulk_confirmation', summary: 'Archive ACME (currently closed)', action: { archiveCompanyIds: [ACME] } } });
  show('T16e', 'bulk summary with a lexical completion word inside a legit name ("closed")', { persistedSummary: e.envelope.pendingAction.summary, flag: e.paChanged, summary: e.summary });
}
// ---- T18/T19: truthful questions lost
{
  const r = run({ claims: null, summary: 'x', pendingAction: { kind: 'single_entity_clarification', question: 'Was ACME archived?', candidateIds: [ACME] } });
  show('T18', 'legit clarifying question "Was ACME archived?"', { persistedQuestion: r.envelope.pendingAction.question });
  const r2 = run({ claims: null, summary: 'x', pendingAction: { kind: 'single_entity_clarification', question: 'Did you mean ACME? It was created last year.', candidateIds: [ACME] } });
  show('T18b', '"Did you mean ACME? It was created last year." (trailing statement after last ?)', { persistedQuestion: r2.envelope.pendingAction.question });
  const r3 = run({ claims: null, summary: 'x', questions: ['Tell me which company you meant.'] });
  show('T19', 'question without ? mark', r3.envelope.questions);
}
// ---- T20: safeDisplayLabel clause-by-clause direct probes
{
  const p = run({ claims: null, summary: 'x' });
  show('T20', 'safeDisplayLabel probes', {
    empty: p.safeDisplayLabel('   '), uuid: p.safeDisplayLabel('task ' + ACME), upperUuid: p.safeDisplayLabel('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE co'),
    assertion: p.safeDisplayLabel('ACME has been archived'), lc: p.safeDisplayLabel('ACME'), long: p.safeDisplayLabel('x'.repeat(100)).length, nonString: p.safeDisplayLabel(42),
  });
  show('T20b', 'displayName for id absent everywhere with weird types', [p.displayName('company', ID), p.displayName('record', ID), p.displayName('Company|' + ID, ID), p.displayName('', ID)]);
}
console.log('\nDONE ' + out.length + ' probes');
