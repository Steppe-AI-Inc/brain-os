#!/usr/bin/env node
// ARCHITECTURE CONTRACT — the final-claim rule (governance/OPERATING_TRUTH_MODEL.md §3, §5).
//
// Product invariants, executed against the REAL structured-claim window of
// supabase/functions/sem-ai-command/index.ts with explicit REQUEST commands:
//   * a mutation-intent turn with an empty ledger never ends with a current-turn success claim,
//     whatever the tense, the trailing question, the pendingAction or the claims array — the
//     deterministic "No change was made" receipt is the answer (BUG-002 / BUG-010 matrix);
//   * a bare confirmation ("yes") is mutation intent (the live E-multi shape);
//   * a verified envelope on the claimed id lets the truthful claim through;
//   * a read-only request (no intent) is never rewritten on text shape alone — the truthful
//     history recount survives, and so does a plain read answer;
//   * a turn whose model claims a mutation the ledger does not hold is re-rendered from structure.
//
// Runnable with plain node. No deploy, no DB, no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this harness');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this harness');
  const end = source.indexOf('};', anchor) + 2;
  return withPatternsAboveWindow(source, stripTS(source.slice(start, end)));
}
const slice = extractStructuredBlock(src);
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, verdict: result.turnVerdict };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const run = ({ command, claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [] }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-contract' };
  return fn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), false, deterministicPrefix, mk());
};
const ID = '11111111-1111-1111-1111-111111111111';
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EV = (rt, action, id, ok = true) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now' });
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const NO_CHANGE = /^(?:.*\s)?No change was made — /;
const SUCCESS_WORDS = /\b(renamed|archived|deleted|approved|assigned|updated|restored|created)\b/i;

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---- A. The Work-PC phrasing matrix (BUG-002 / BUG-010): intent + empty ledger => receipt, never a success claim.
// [command, fabricated summary, the fabrication's own words that must not survive]
const MATRIX = [
  ['Rename project Alpha to Beta', 'Done. Project renamed to Beta. What next?', /renamed to Beta|^Done\./i],
  ['Rename project Alpha to Beta', 'Project renamed to Beta.', /Project renamed to Beta/i],
  ['rename project Alpha to Beta', 'I have renamed the project to Beta — anything else?', /I have renamed/i],
  ['Please rename the project Alpha to Beta', 'Renamed. Do you want me to notify the team?', /^Renamed\./i],
  ['Approve approval 123 now. Confirm when done.', 'The approval has been approved.', /has been approved/i],
  ['Delete department Sales permanently', 'Department Sales has been deleted successfully.', /has been deleted/i],
  ['archive company ACME', 'ACME has been archived. Should I also archive its projects?', /has been archived/i],
  ['Archive ACME', 'Done — ACME archived.', /ACME archived/i],
  ['assign task QA-1 to Bob', 'Assigned. Bob now owns QA-1.', /Bob now owns|^Assigned\./i],
  ['set the manager of Alice to Bob', 'Alice now reports to Bob.', /now reports to/i],
];
for (const [command, summary, leak] of MATRIX) {
  for (const variant of [
    { label: 'claims:null', claims: null },
    { label: 'claims:[]', claims: [] },
    { label: 'claims:state-only', claims: [{ type: 'existence', resourceType: 'company', resourceId: ACME }] },
  ]) {
    const r = run({ command, summary, claims: variant.claims, context: { companies: [{ id: ACME, name: 'ACME', status: 'active' }] } });
    check(`A ${JSON.stringify(command)} / ${JSON.stringify(summary)} [${variant.label}] -> receipt, no success claim`,
      NO_CHANGE.test(r.summary) && !leak.test(r.summary) && r.verdict && r.verdict.executedOperationCount === 0 && r.verdict.receiptRendered === true,
      'measured: ' + JSON.stringify(r.summary));
  }
  // The trailing-question / pendingAction variant: a pending question never exempts the claim.
  const rp = run({ command, summary: summary + ' Should I continue?', pendingAction: { kind: 'open_question', question: 'Should I continue?' } });
  check(`A pendingAction never exempts: ${JSON.stringify(command)}`, NO_CHANGE.test(rp.summary) && !leak.test(rp.summary) && /Should I continue\?/.test(rp.summary),
    'measured: ' + JSON.stringify(rp.summary));
}

// ---- B. A bare confirmation is mutation intent (E-multi live shape).
{
  const r = run({ command: 'yes', summary: 'Confirmed. Executing the plan to reassign CLIX GPS projects and people to SEM LLC.' });
  check('B bare "yes" + fabricated execution -> receipt', NO_CHANGE.test(r.summary) && !/Executing the plan/.test(r.summary), 'measured: ' + JSON.stringify(r.summary));
  const r2 = run({ command: 'option 2', summary: 'Restored ACME.' });
  check('B "option 2" + fabricated completion -> receipt', NO_CHANGE.test(r2.summary), 'measured: ' + JSON.stringify(r2.summary));
}

// ---- C. A verified envelope on the claimed id lets the truthful claim through.
{
  const r = run({ command: 'archive company ACME', claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME)], summary: 'ACME archived.', labels: { company: { [ACME]: 'ACME' } } });
  check('C verified archive claim survives (rendered from structure)', !NO_CHANGE.test(r.summary) && /archiv/i.test(r.summary) && r.verdict.executedOperationCount === 1, 'measured: ' + JSON.stringify(r.summary));
  const rf = run({ command: 'archive company ACME', claims: [M('company', ACME, 'archive')], evidence: [EV('company', 'archive', ACME, false)], summary: 'ACME archived.', labels: { company: { [ACME]: 'ACME' } } });
  check('C an UNVERIFIED postcondition never supports the claim', !/ACME archived\.$/.test(rf.summary) && rf.verdict.executedOperationCount === 0, 'measured: ' + JSON.stringify(rf.summary));
}

// ---- D. Read-only requests are never rewritten on text shape alone.
{
  const recount = 'Earlier in this channel I archived ACME and restored Beta. Anything else you need?';
  const r = run({ command: 'what did we do earlier in this channel?', summary: recount, pendingAction: { kind: 'open_question', question: 'Anything else you need?' } });
  check('D truthful history recount + question on a READ request survives verbatim', r.summary === recount, 'measured: ' + JSON.stringify(r.summary));
  const r2 = run({ command: 'is ACME archived?', summary: 'ACME is archived. Should I restore it?', context: { companies: [{ id: ACME, name: 'ACME', status: 'archived' }] } });
  check('D state answer on a read request survives', r2.summary === 'ACME is archived. Should I restore it?', 'measured: ' + JSON.stringify(r2.summary));
  const r3 = run({ command: 'list my companies', summary: 'Here are your companies.' });
  check('D plain read answer untouched', r3.summary === 'Here are your companies.');
}

// ---- E. A lifecycle report outranks the receipt (the resolver already explained the outcome).
{
  const r = run({ command: 'restore company Nowhere Inc', summary: 'Nowhere Inc restored.', lifecycleReports: ['Nowhere Inc: no company by that name (searched the active and archived companies you can access) — nothing was restored.'] });
  check('E with a lifecycle report present the receipt does not double up', !NO_CHANGE.test(r.summary), 'measured: ' + JSON.stringify(r.summary));
}

// ---- F. Static: the belt consumers are gated on request intent, never on pendingAction.
{
  const s = src.replace(/\r\n/g, '\n');
  const legacy = s.slice(s.indexOf('const legacyProseFallback ='), s.indexOf('readsAsCompletion(String(result.summary', s.indexOf('const legacyProseFallback =')));
  const unacc = s.slice(s.indexOf('const unaccountedCompletionProse ='), s.indexOf('readsAsCompletion(String(result.summary', s.indexOf('const unaccountedCompletionProse =')));
  check('F legacyProseFallback requires request intent and carries no pendingAction term', /requestedIntent !== null/.test(legacy) && !/!result\.pendingAction/.test(legacy));
  check('F unaccountedCompletionProse requires request intent and carries no pendingAction term', /requestedIntent !== null/.test(unacc) && !/!result\.pendingAction/.test(unacc));
  const derivation = s.slice(s.indexOf('const MUTATION_ARRAY_FIELDS'), s.indexOf('const executedVerifiedCount'));
  const finalIntent = s.slice(s.indexOf('const requestedIntent: MutationIntent | null = requestedIntentPrimary'), s.indexOf('const executedVerifiedCount'));
  check('F request intent is derived from the request (model requestIntent, model action fields, request lexicon), never the response text', /MUTATION_VERB_ALWAYS/.test(derivation) && /MUTATION_ARRAY_FIELDS/.test(derivation) && /CONFIRMATION_COMMAND/.test(derivation) && /modelIntentKind/.test(derivation) && !/result.summary|readsAsCompletion|pendingAction/.test(derivation) && !/readsAsCompletion|result.summary/.test(finalIntent));
}

console.log(`\narchitecture_final_claim_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
