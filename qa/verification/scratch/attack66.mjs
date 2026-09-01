import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractWide(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('block not found');
  const anchor = source.indexOf("if (model === 'deterministic-confirmation' && !groundedOutcomeThisTurn) {", start);
  if (anchor === -1) throw new Error('confirmation override not found');
  let depth = 0, end = -1;
  for (let k = source.indexOf('{', anchor); k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  return stripTS(source.slice(start, end));
}
const wide = extractWide(src);
if (/\btype\s+\w+\s*=/.test(wide)) throw new Error('TS survived');
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan',
  wide + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };'
);
export const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, futureNoPlan = false }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, futureNoPlan);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const ev = (resourceType, action, id, ok = true) => ({ resourceType, action, id, postconditionPassed: ok });
const rows = [];
function t(id, desc, r, expectation) {
  rows.push({ id, desc, corrected: r.corrected,
    supported: r.envelope.verifiedClaims.filter(v => v.verdict === 'supported').length,
    unknown: r.envelope.verifiedClaims.filter(v => v.verdict === 'unknown').length,
    rejected: r.envelope.rejectedClaims.length,
    envMatches: r.envelope.summary === r.summary,
    expectation, summary: r.summary });
}
const FAB = 'The approval has been approved and the company was archived successfully.';

t('X1', 'claims:null + fabricated prose (v92 baseline shape)', run({ claims: null, summary: FAB }), 'MUST correct');
t('X2', 'claims:[] empty array + same fabricated prose', run({ claims: [], summary: FAB }), 'MUST correct');
t('X3', 'claims:[{}] garbage object + same prose', run({ claims: [{}], summary: FAB }), 'MUST correct');
t('X4', 'claims:[null,null] + same prose', run({ claims: [null, null], summary: FAB }), 'MUST correct');
t('X5', 'claims:[nonsense-string] + same prose', run({ claims: ['nonsense'], summary: FAB }), 'MUST correct');
t('X6', 'claims:[{type:note}] unrecognised type + same prose', run({ claims: [{ type: 'note' }], summary: FAB }), 'MUST correct');
t('X7', 'claims:{} object not array', run({ claims: {}, summary: FAB }), 'MUST correct');
t('X8', 'one trivially-true existence claim launders fabricated prose', run({ claims: [{ type: 'existence', resourceType: 'company', resourceId: A }], context: { companies: [{ id: A, status: 'active' }] }, summary: FAB }), 'MUST correct');
t('X9', 'self-referential predicate id==id launders prose', run({ claims: [{ type: 'current_state', resourceType: 'company', resourceId: A, predicate: 'id', expectedValue: A }], context: { companies: [{ id: A }] }, summary: FAB }), 'MUST correct');
t('X10', 'verification_state claim always supported, zero evidence', run({ claims: [{ type: 'verification_state', resourceType: 'company', resourceId: A }], summary: FAB }), 'MUST correct');
t('X11', 'historical_event unknown launders prose', run({ claims: [{ type: 'historical_event', resourceType: 'approval', resourceId: A, action: 'approve' }], summary: FAB }), 'MUST correct');

const M = (rt, id, action) => { const c = { type: 'mutation_result', resourceType: rt, resourceId: id }; if (action !== undefined) c.action = action; return c; };
t('Y1', 'mutation action ABSENT + unrelated-action evidence same id', run({ claims: [M('company', A)], evidence: [ev('company', 'archive', A)], summary: 'Company A was permanently deleted with all its data.' }), 'SHOULD reject');
t('Y2', 'mutation action null explicit', run({ claims: [M('company', A, null)], evidence: [ev('company', 'archive', A)], summary: 'x' }), 'SHOULD reject');
t('Y3', 'mutation action NUMBER 123', run({ claims: [M('company', A, 123)], evidence: [ev('company', 'archive', A)], summary: 'x' }), 'SHOULD reject');
t('Y4', 'action casing mismatch', run({ claims: [M('company', A, 'Archive')], evidence: [ev('company', 'archive', A)], summary: 'x' }), 'reject = fail closed');
t('Y5', 'id whitespace padding', run({ claims: [M('company', ' ' + A + ' ', 'archive')], evidence: [ev('company', 'archive', A)], summary: 'x' }), 'reject = fail closed');
t('Y6', 'id uppercase uuid', run({ claims: [M('company', A.toUpperCase(), 'archive')], evidence: [ev('company', 'archive', A)], summary: 'x' }), 'reject = fail closed');
t('Y7', 'delimiter injection in resourceId', run({ claims: [M('company', 'x|' + A, 'archive')], evidence: [ev('company', 'x', A)], summary: 'x' }), 'reject expected');
t('Y8', 'evidence postconditionPassed=false only', run({ claims: [M('company', A, 'archive')], evidence: [ev('company', 'archive', A, false)], summary: 'x' }), 'MUST reject');
t('Y9', 'duplicate evidence rows false+true', run({ claims: [M('company', A, 'archive')], evidence: [ev('company', 'archive', A, false), ev('company', 'archive', A, true)], summary: 'x' }), 'support OK');
t('Y10', 'cross-type same id', run({ claims: [M('company', A, 'archive')], evidence: [ev('task', 'archive', A)], summary: 'x' }), 'MUST reject');
t('Z1', 'TRUTHFUL task-archive claim, no evidence recorded by build', run({ claims: [M('task', A, 'archive')], evidence: [], grounded: true, summary: 'I archived the task Q3 audit.' }), 'FALSE NEGATIVE if rejected');
t('Z2', 'TRUTHFUL goal-archive claim', run({ claims: [M('goal', A, 'archive')], evidence: [], grounded: true, summary: 'I archived the goal.' }), 'FALSE NEGATIVE if rejected');
t('Z3', 'TRUTHFUL end_employment claim', run({ claims: [M('person', A, 'end_employment')], evidence: [], grounded: true, summary: 'I ended that employment.' }), 'FALSE NEGATIVE if rejected');

const S = (type, rt, id, pred, val) => ({ type, resourceType: rt, resourceId: id, predicate: pred, expectedValue: val });
t('W1', 'current_state about a company NOT in truncated pack', run({ claims: [S('current_state', 'company', B, 'status', 'active')], context: { companies: [{ id: A, status: 'active' }] }, summary: 'Company B is active.' }), 'unknown -> uncorrected');
t('W2', 'approval_state about a DECIDED approval, pack holds only pending', run({ claims: [S('approval_state', 'approval', A, 'status', 'approved')], context: { approvals: [] }, summary: 'The approval has been approved.' }), 'BUG-002 shape');
t('W3', 'STALE pack: truthful post-archive state claim', run({ claims: [S('current_state', 'company', A, 'status', 'archived')], evidence: [ev('company', 'archive', A)], context: { companies: [{ id: A, status: 'active' }] }, summary: 'The company is now archived.' }), 'FALSE CONTRADICTION if rejected');
t('W4', 'STALE pack: false still-active claim after archiving', run({ claims: [S('current_state', 'company', A, 'status', 'active')], evidence: [ev('company', 'archive', A)], context: { companies: [{ id: A, status: 'active' }] }, summary: 'The company is still active.' }), 'FALSE SUPPORT if supported');
t('W5', 'archived TASK state claim, tasks bucket excludes archived', run({ claims: [S('current_state', 'task', A, 'status', 'archived')], context: { tasks: [] }, summary: 'That task is archived.' }), 'unknown');
t('V1', 'deterministic-confirmation override AFTER envelope built', run({ claims: [{ type: 'existence', resourceType: 'company', resourceId: A }], context: { companies: [{ id: A }] }, model: 'deterministic-confirmation', grounded: false, summary: 'Confirmed - Permanently delete ACME and all of its data.' }), 'envMatches MUST be true');
t('V2', 'deterministic-confirmation with claims:null', run({ claims: null, model: 'deterministic-confirmation', grounded: false, summary: 'Confirmed - Permanently delete ACME.' }), 'envMatches MUST be true');
t('U1', 'rejection prose content', run({ claims: [M('company', A, 'archive')], evidence: [], summary: 'I archived ACME.' }), 'inspect');
for (const r of rows) {
  console.log(r.id.padEnd(4) + ' corrected=' + String(r.corrected).padEnd(5) + ' sup=' + r.supported + ' unk=' + r.unknown + ' rej=' + r.rejected + ' envMatch=' + String(r.envMatches).padEnd(5) + ' | ' + r.desc);
  console.log('        expect: ' + r.expectation + '  |  out: ' + JSON.stringify(r.summary).slice(0, 150));
}
