// STRUCTURED-CLAIM VERIFICATION — adversarial acceptance suite.
//
// Architecture under test (2026-09-01): truth is derived from STRUCTURED CLAIMS verified
// against BACKEND-GENERATED execution evidence keyed by EXACT resource id. Prose is an
// output of verified structure, never an input to determining truth.
//
// Three prose generations were independently rejected before this (#62, #64, #65). The
// clause none of them could satisfy is the one this suite exists to prove:
//
//     SAME RESOURCE TYPE BUT WRONG UUID MUST NOT SUPPORT THE CLAIM.
//
// Executes the REAL block extracted from supabase/functions/sem-ai-command/index.ts. A
// reimplementation cannot catch a false positive, which is the vacuous-regression class
// this project has now logged five times.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// Extract from the structured-claim header through the verifiedResponse envelope.
function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found — update this harness');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found — update this harness');
  const end = source.indexOf('};', anchor) + 2;
  return stripTS(source.slice(start, end));
}

const slice = extractStructuredBlock(src);
// index.ts derives knownEntityNames (line ~3423) from the four name maps ABOVE the extracted window,
// and after V48-D3 the belt inside the window consults it. Mirror the derivation exactly from the
// same injected maps so the harness never invents a pack the code under test would not have had.
const KNOWN_ENTITY_NAMES_PREAMBLE = 'const knownEntityNames = new Set([...companyNameById.values(), ...personNameById.values(), ...taskTitleById.values(), ...runtimeLabels.values()]'
  + '.filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().toLowerCase()));';
const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById',
  // run7/D50-D51: the deterministic report state is computed above the window in
  // index.ts and only its two derived values are referenced inside — injected here.
  'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  KNOWN_ENTITY_NAMES_PREAMBLE + slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding };'
);
// The block reads Deno.env for the authorized debug-id flag. Stub it so tests exercise
// the PRODUCTION default (debug OFF) rather than whatever the host happens to have set.
const DENO_STUB = { env: { get: () => undefined } };
// The four lifecycle name maps live far earlier in index.ts, outside the extracted window,
// so the harness supplies them. They are the 'last known safe label' source that lets a
// resource this turn archived still be named instead of falling back to a typed reference.
const mk = (o) => new Map(Object.entries(o || {}));
const mkRuntime = (o) => new Map(Object.entries(o || {}));
const run = ({ claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, fullyDeterministic = false, deterministicPrefix = '' }) =>
  fn({ claims, summary, pendingAction, questions, proposedActions }, evidence, context, model, grounded, false, DENO_STUB, mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mkRuntime(labels.runtime));

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const ev = (resourceType, action, id, postconditionPassed = true) => ({ resourceType, action, id, postconditionPassed });
const mut = (resourceType, id, action) => ({ type: 'mutation_result', resourceType, resourceId: id, action });
const rejected = (r) => r.envelope.rejectedClaims.length > 0;
const supportedCount = (r) => r.envelope.verifiedClaims.filter((v) => v.verdict === 'supported').length;

// =======================================================================================
// SECTION A — RESOURCE IDENTITY. The clause every prose generation failed.
// =======================================================================================
check('A1 correct id + correct action -> SUPPORTED',
  !rejected(run({ claims: [mut('project', A, 'rename')], evidence: [ev('project', 'rename', A)] })));

check('A2 WRONG UUID, same resource type -> REJECTED (CLAIM_WRONG_RESOURCE_ID_CANNOT_BE_GROUNDED)',
  rejected(run({ claims: [mut('project', A, 'rename')], evidence: [ev('project', 'rename', B)] })),
  'Evidence for a DIFFERENT project must never support a claim about project A.');

check('A3 correct id, WRONG ACTION -> REJECTED',
  rejected(run({ claims: [mut('project', A, 'rename')], evidence: [ev('project', 'archive', A)] })),
  'Archiving a project does not prove it was renamed.');

check('A4 CROSS-RESOURCE fact cannot support a mutation (CLAIM_CROSS_RESOURCE_FACT_CANNOT_SUPPORT_MUTATION)',
  rejected(run({ claims: [mut('approval', A, 'approve')], evidence: [ev('company', 'archive', A)] })),
  'Company evidence must never ground an approval claim, even on an identical id.');

// A5 asserts the REASON, not just the verdict. Mutation testing showed that deleting the
// no-id guard did not change the verdict (the evidence lookup keys on 'type|null' and
// misses anyway), so a verdict-only assertion could not detect its removal. Asserting the
// audit reason makes the guard load-bearing: the envelope must say WHY it was rejected.
{
  const r = run({ claims: [{ type: 'mutation_result', resourceType: 'project', action: 'rename' }], evidence: [ev('project', 'rename', A)] });
  check('A5 mutation claim with NO id -> REJECTED (fails closed)', rejected(r));
  check('A5b the rejection reason names the missing canonical id',
    /no canonical resource id/i.test(r.envelope.rejectedClaims[0].reason),
    'The audit trail must explain that the claim carried no id, not merely that evidence was missing.');
}

check('A6 evidence WITHOUT a passing postcondition -> REJECTED',
  rejected(run({ claims: [mut('company', A, 'archive')], evidence: [ev('company', 'archive', A, false)] })),
  'An attempted mutation whose re-read did not confirm must not support a success claim.');

check('A7 entity resolved but nothing executed -> REJECTED',
  rejected(run({ claims: [mut('approval', A, 'approve')], evidence: [], context: { approvals: [{ id: A, status: 'pending' }] } })),
  'Entity resolution is never execution — the original BUG-002 invariant.');

// =======================================================================================
// SECTION B — CLAIM TYPE AUTHORITY. Different claims, different evidence sources.
// =======================================================================================
check('B1 current_state verified against the fresh canonical read',
  supportedCount(run({ claims: [{ type: 'current_state', resourceType: 'company', resourceId: A, predicate: 'status', expectedValue: 'archived' }],
    context: { companies: [{ id: A, status: 'archived' }] } })) === 1);

check('B2 current_state CONTRADICTED by the canonical read -> REJECTED',
  rejected(run({ claims: [{ type: 'current_state', resourceType: 'company', resourceId: A, predicate: 'status', expectedValue: 'archived' }],
    context: { companies: [{ id: A, status: 'active' }] } })),
  'The canonical read is authoritative over the model\'s assertion.');

check('B3 approval_state verified against the canonical approval row',
  supportedCount(run({ claims: [{ type: 'approval_state', resourceType: 'approval', resourceId: A, predicate: 'status', expectedValue: 'pending' }],
    context: { approvals: [{ id: A, status: 'pending' }] } })) === 1);

check('B4 CURRENT STATE does not prove a HISTORICAL event',
  run({ claims: [{ type: 'historical_event', resourceType: 'company', resourceId: A, action: 'archive' }],
    context: { companies: [{ id: A, status: 'archived' }] } }).envelope.verifiedClaims[0].verdict === 'unknown',
  'A company being archived NOW does not prove it was archived in a prior turn. Must be unknown, not supported.');

// UPDATED 2026-09-01 (#66/D43): a resource this turn MUTATED now yields 'unknown' for
// state claims, because contextPack predates the change. Previously the stale read was
// treated as authoritative in BOTH directions - contradicting the true post-mutation state
// and supporting the now-false pre-mutation one.
check('B5 a state claim about a resource mutated this turn is UNKNOWN, not judged on a stale read',
  run({ claims: [{ type: 'current_state', resourceType: 'company', resourceId: A, predicate: 'status', expectedValue: 'active' }],
    evidence: [ev('company', 'archive', A)], context: { companies: [{ id: A, status: 'archived' }] } }).envelope.verifiedClaims[0].verdict === 'unknown',
  'contextPack is read at the START of the turn. For a resource this turn mutated it is stale, and judging on it inverted the truth: the correct post-mutation claim was contradicted while the now-false pre-mutation one was supported.');

// =======================================================================================
// SECTION C — QUESTIONS AND FUTURE ACTIONS ARE NOT EXECUTION CLAIMS.
// =======================================================================================
{
  const r = run({ claims: [mut('project', A, 'rename')], evidence: [], questions: ['Would you like me to notify the team?'] });
  check('C1 a question survives a rejected claim', r.envelope.questions.length === 1 && /notify the team/.test(r.summary));
  check('C2 the question is not itself treated as a claim', r.envelope.rejectedClaims.length === 1);
}
{
  const r = run({ claims: [], evidence: [], proposedActions: ['I could archive it next.'] });
  check('C3 a proposed action is not an execution claim', !rejected(r) && r.envelope.proposedActions.length === 1);
}

// =======================================================================================
// SECTION D — MIXED CLAIMS. A false claim must not discard a truthful reply, and a true
// claim must not launder a false one. This is the founder's worked example.
// =======================================================================================
{
  const r = run({
    claims: [
      { type: 'approval_state', resourceType: 'approval', resourceId: A, predicate: 'status', expectedValue: 'pending' },
      mut('project', B, 'rename'),
    ],
    evidence: [],
    context: { approvals: [{ id: A, status: 'pending' }] },
    questions: ['Would you like me to notify the team?'],
  });
  // UPDATED (#66/D46): identity is now conveyed by a safe LABEL, never a raw uuid.
  check('D1 supported approval state is retained (identified safely, no uuid)',
    supportedCount(r) === 1 && /the approval|status is pending/i.test(r.summary) && !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(r.summary));
  check('D2 unsupported rename is rejected', r.envelope.rejectedClaims.length === 1);
  check('D3 the rename is NOT rendered as success', !/rename confirmed/i.test(r.summary));
  check('D4 the question still survives', /notify the team/.test(r.summary));
}
{
  // one true + one false on the SAME resource type, different ids
  const r = run({ claims: [mut('company', A, 'archive'), mut('company', B, 'archive')], evidence: [ev('company', 'archive', A)],
    labels: { company: { [A]: 'ACME Corp', [B]: 'Globex Ltd' } } });
  check('D5 same-type mixed ids: only the evidenced id is supported', supportedCount(r) === 1 && r.envelope.rejectedClaims.length === 1);
  // UPDATED (#66/D46): the rejected resource must still be identifiable to the founder, but
  // by its safe LABEL — never by leaking either raw uuid.
  check('D6 the rejected resource is named by label, not uuid',
    /Globex Ltd/.test(r.summary) && !new RegExp(B).test(r.summary) && !new RegExp(A).test(r.summary));
}

// =======================================================================================
// SECTION E — ENVELOPE IS THE SINGLE SOURCE OF OUTPUT TRUTH.
// VERIFIED_RESPONSE_ENVELOPE_IS_SINGLE_SOURCE_OF_OUTPUT_TRUTH
// LIVE_RESPONSE_EQUALS_PERSISTED_VERIFIED_RESPONSE
// =======================================================================================
{
  const r = run({ claims: [mut('project', A, 'rename')], evidence: [], summary: 'The project has been renamed.' });
  check('E1 envelope exists and carries both claim sets',
    !!r.envelope && Array.isArray(r.envelope.verifiedClaims) && Array.isArray(r.envelope.rejectedClaims));
  check('E2 envelope.summary IS the rendered summary (live == persisted)', r.envelope.summary === r.summary);
  check('E3 the model\'s false prose is NOT what survives', !/The project has been renamed\./.test(r.summary),
    'The unverified model sentence must not be the thing rendered or persisted.');
  check('E4 execution evidence is carried in the envelope', Array.isArray(r.envelope.executionEvidence));
}

// =======================================================================================
// SECTION F — PROSE IS NOT RE-PARSED AS AUTHORITY once structured claims exist.
//
// run7/D52 CONTRACT CHANGE (intentional, recorded in the same commit as the fix): this
// case previously asserted the raw prose SURVIVED when every claim verified — which was
// itself the D52 laundering shape: pair one real supported claim with fabricated
// completion prose about anything else and the whole sentence shipped. A mutation-claim
// turn is now re-rendered from verified structure: no prose parser decides truth
// (#65 item 8 still holds — nothing is parsed), the supported claim IS stated, and the
// unverified fabrications are simply never rendered.
// =======================================================================================
{
  const r = run({
    claims: [mut('company', A, 'archive')],
    evidence: [ev('company', 'archive', A)],
    summary: 'The company has been archived and the approval has been archived and everything was deleted successfully.',
  });
  check('F1 a supported mutation claim IS stated after the structural re-render', !rejected(r) && /archived — confirmed/.test(r.summary),
    'The verified structure, not the raw prose, is what the founder reads on a mutation turn.');
  check('F1b unverified fabrications in the same prose do NOT survive the re-render (run7/D52)',
    !/approval has been archived/.test(r.summary) && !/deleted successfully/.test(r.summary),
    'One real claim must not carry unrelated fabricated completions into the reply.');
}
{
  // No structured claims at all -> legacy v92 behaviour, so this build is never worse.
  const r = run({ claims: null, evidence: [], summary: 'The approval has been approved.' });
  check('F2 legacy fallback still catches an unstructured fabrication', r.corrected === true,
    'With no structured claims the build must be no worse than deployed v92.');
  const ok = run({ claims: null, evidence: [], summary: 'Here are your companies.' });
  check('F3 legacy fallback does not fire on an ordinary answer', ok.corrected === false);
}

// =======================================================================================
// SECTION G - LEGACY PROSE FALLBACK. Preserves the fabrication corpus from the three
// superseded prose generations (#62/#64/#65). That fallback is still a LIVE code path: it
// runs only when the model emits NO structured claims, and its sole job is to keep this
// build from being WORSE than deployed v92 on an unstructured response. It is never
// consulted when structured claims exist.
// =======================================================================================
for (const summary of [
  'The approval has been approved.',
  'The company was archived successfully.',
  'The task has been completed.',
]) {
  check('G legacy fallback catches unstructured fabrication - ' + summary.slice(0, 38),
    run({ claims: null, evidence: [], summary }).corrected === true,
    'With no structured claims this must be at least as good as deployed v92.');
}
for (const summary of [
  'Here are your companies.',
  'I do not see that task - it may have been archived or deleted.',
]) {
  check('G legacy fallback leaves a truthful reply alone - ' + summary.slice(0, 38),
    run({ claims: null, evidence: [], summary }).corrected === false);
}
// run7/D52 CONTRACT CHANGE (intentional, same commit as the fix): 'corrected' is now
// TRUE here because a mutation-claim turn is re-rendered from verified structure and the
// re-rendered summary must persist. The load-bearing assertion is that the fabricated
// approval sentence does not survive - prose is re-rendered, never re-parsed (#65 item 8).
{
  const g = run({ claims: [mut('company', A, 'archive')], evidence: [ev('company', 'archive', A)], summary: 'The approval has been approved.' });
  check('G a mutation-claim turn is re-rendered; the fabricated sentence does not survive (run7/D52)',
    g.corrected === true && !/approval has been approved/.test(g.summary),
    'One supported claim must not disarm the truth gate for unrelated fabricated prose.');
}

// =======================================================================================
// SECTION H - FOUNDER-FACING RESOURCE REFERENCES. Treated as a correctness/privacy
// defect (#66/D46), not cosmetic: internal UUIDs mean nothing to the founder and leak
// internal identifiers into text that may be read, forwarded or persisted.
// =======================================================================================
check('H1 FOUNDER_RESPONSE_NEVER_LEAKS_RAW_RESOURCE_UUID (entity absent from every label source)',
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(run({ claims: [mut('company', A, 'archive')], evidence: [], summary: 'I archived ACME.' }).summary),
  'A raw canonical UUID must never appear in founder-facing prose.');
check('H2 MISSING_ENTITY_LABEL_USES_SAFE_TYPED_FALLBACK',
  /the company/i.test(run({ claims: [mut('company', A, 'archive')], evidence: [], summary: 'x' }).summary),
  'With no resolvable label the reply must say "the company", not an id and not a guess.');
check('H3 HISTORICAL_ENTITY_CAN_USE_LAST_KNOWN_SAFE_LABEL (canonical read has it)',
  /ACME Corp/.test(run({ claims: [mut('company', A, 'archive')], evidence: [], context: { companies: [{ id: A, name: 'ACME Corp' }] }, summary: 'x' }).summary),
  'A known label must be used in preference to a typed fallback.');
check('H4 UNKNOWN_RESOURCE_NAME_IS_NOT_INVENTED',
  (() => { const s = run({ claims: [mut('project', B, 'rename')], evidence: [], summary: 'x' }).summary; return /the project/i.test(s) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s); })(),
  'No name exists, so the reply must fall back to a neutral typed reference and invent nothing.');
check('H5 DEBUG_ONLY_UUID_OUTPUT_REQUIRES_EXPLICIT_AUTHORIZED_MODE',
  src.includes("Deno.env.get('SEM_AI_DEBUG_RESOURCE_IDS')") && src.includes('DEBUG_RESOURCE_IDS ?'),
  'Ids may only ever be emitted behind an explicit, deliberately-set developer flag - never something a caller or the model can influence.');
check('H6 a SUPPORTED claim is also rendered without a raw uuid',
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(run({ claims: [mut('company', A, 'archive')], evidence: [ev('company', 'archive', A)], context: { companies: [{ id: A, name: 'ACME Corp' }] }, summary: 'x' }).summary));

console.log('\nstructured_claim_verification: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
