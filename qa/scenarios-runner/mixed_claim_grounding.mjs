// ===================================================================================
// SUPERSEDED 2026-09-01 — DOES NOT RUN. Kept as evidence, not deleted.
//
// This suite executed a PROSE-BASED truthfulness gate that no longer exists. Truth is
// now derived from STRUCTURED CLAIMS verified against backend execution evidence keyed
// by exact resource id (see qa/scenarios-runner/structured_claim_verification.mjs).
// Three prose generations were independently rejected — #62, #64 and #65 — and the
// ceiling was intrinsic: resource identity misattributes, instance identity is not
// recoverable from prose at all, and intent read from command text is vocabulary- and
// language-bound.
//
// It is retained because its CORPUS is real evidence: verbatim production
// work_orders.output rows and the D13/G-series escape shapes. The fabrication and
// truthful-reply corpora were carried forward into Section G of
// structured_claim_verification.mjs, which covers the legacy prose fallback that still
// runs when the model emits no structured claims.
//
// Do not re-point this at the new block: it asserts a per-claim/per-resource prose
// mechanism that was deliberately removed. Read it for history, not for coverage.
// ===================================================================================

console.log("mixed_claim_grounding: SUPERSEDED (prose-era). See structured_claim_verification.mjs.");
process.exit(0);
// STRUCTURAL per-claim grounding — behavioral regression corpus.
//
// This is the acceptance suite for the 2026-09-01 structural fix that replaced the
// whole-summary PAST-completion gate. The core invariant under test:
//
//     THE UNIT OF EXECUTION TRUTH IS A CLAIM, NOT THE WHOLE REPLY.
//
// A reply may contain several independent claims. One truthful clause, a pendingAction,
// or a trailing question must never launder a false success claim beside it. Equally, a
// false claim must never destroy the truthful claims around it.
//
// Every prior gate failed because it matched the whole summary:
//   #61/D3    fabricated claim escaped because the reply also carried a question
//   #62/D3-FP truthful replies destroyed wholesale to catch the fabrication
//   #63/D13   six mixed-claim escapes ("not rejected — it has been approved")
//
// LIKE past_completion_gate_behavior.mjs, THIS EXECUTES THE REAL SOURCE. It extracts the
// live claim-grounding block out of supabase/functions/sem-ai-command/index.ts and runs
// it. It is not a reimplementation — a reimplementation cannot catch a false positive,
// which is the #61/D2 + #63/D10/D12 "vacuous regression" failure class this project has
// now hit four times.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractGateSlice } from './_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// --- Extract and execute the REAL block ------------------------------------------------
// Strip TypeScript-only syntax (type aliases, `x as T` assertions, typed declarations)
// with balanced scanning so plain node can run the shipped statements verbatim. If the
// shape ever changes such that extraction fails, THROW — a harness that cannot parse what
// it is meant to execute must never quietly pass.
function stripTypeAssertions(text) {
  let out = '', i = 0;
  while (i < text.length) {
    if (text.startsWith(' as ', i)) {
      let j = i + 4;
      const d = { '{': 0, '<': 0, '[': 0, '(': 0 };
      const zero = () => !d['{'] && !d['<'] && !d['['] && !d['('];
      while (j < text.length) {
        const c = text[j];
        if (c === '{' || c === '<' || c === '[' || c === '(') { d[c]++; j++; continue; }
        if (c === '}') { d['{']--; j++; continue; }
        if (c === '>') { d['<']--; j++; continue; }
        if (c === ']') { d['[']--; j++; continue; }
        if (c === ')') { if (zero()) break; d['(']--; j++; continue; }
        if (zero() && (c === ';' || c === ',' || c === '?' || c === ':')) break;
        j++;
      }
      i = j; continue;
    }
    out += text[i]; i++;
  }
  return out;
}

function buildRunner(source) {
  // Uses the SHARED extractor in qa/scenarios-runner/_gate_extract.mjs.
  // Each harness previously carried its own hand-written TypeScript stripper naming
  // specific symbols, so every product change broke all three in a different way. One of
  // those private copies also had a latent bug that silently consumed 6,700 characters of
  // real code whenever a product comment happened to contain the words " as " - the
  // harness then failed with a ReferenceError far from the cause.
  const slice = extractGateSlice(source);
  const fn = new Function(
    'model', 'result', 'groundedOutcomeThisTurn', 'factLines', 'hasExecutionEvidence', 'proposedPlan', 'lifecycleMismatchCorrections', 'command',
    slice + '\n; return { summary: result.summary, pendingAction: result.pendingAction, claimAudit: result.claimAudit || null, corrected: claimsPastCompletionWithNoGrounding, past: claimsPastCompletionWithNoGrounding, future: claimsFutureActionWithNoPlan };'
  );
  return (model, summary, pendingAction, grounded, a, b) => {
    // Older call sites pass (…, lifecycleMismatchCorrections, factLines); newer ones pass
    // (…, factLines). Accept both: whichever array carries fact lines is used as evidence.
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const factLines = arrB.length > 0 ? arrB : arrA;
    // A string in either trailing slot is the founder COMMAND for this turn. Default is a
    // mutation request, because that is what the fabrication corpus represents; read-only
    // cases pass an explicit query so the gate correctly treats the reply as a report.
    const cmd = typeof b === 'string' ? b : (typeof a === 'string' ? a : 'archive the company');
    return fn(model, { summary, pendingAction }, grounded, factLines, factLines.length > 0, null, arrA, cmd);
  };
}

const runRaw = buildRunner(src);
const run = (model, summary, pendingAction, grounded, factLines) => runRaw(model, summary, pendingAction, grounded, factLines);
// Read-only variant: the founder ASKED a question rather than requesting a mutation, so a
// past-tense sentence in the answer is a report about history, not a claim about this turn.
const runReadOnly = (model, summary, pendingAction) => runRaw(model, summary, pendingAction, false, [], "what happened in this channel?");

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}
const has = (r, s) => String(r.summary || '').toLowerCase().includes(s.toLowerCase());
const saysNothingChanged = (r) => /nothing was actually changed/i.test(String(r.summary || ''));

// =======================================================================================
// SECTION A — the D13 mixed-claim escapes (verifier #63) and the founder's named variants.
// In every case the FALSE success claim must be removed and the reply must say nothing
// was changed. Ungrounded turn (no execution evidence) throughout.
// =======================================================================================
const D13_ESCAPES = [
  'The approval was not rejected — it has been approved.',
  'The approval is still pending, but it has been approved.',
  'I couldn’t approve it, but the approval has been approved.',
  'The project wasn’t updated. The project is now renamed.',
  'The employee wasn’t assigned, but they’re now assigned to SEM LLC.',
  'Nothing was changed. The task has been completed.',
  'I haven’t done it yet. It’s done.',
];
for (const s of D13_ESCAPES) {
  const r = run('gpt', s, null, false);
  check('A: mixed-claim escape corrected — ' + s.slice(0, 52), r.corrected && saysNothingChanged(r),
    'The false success half must be removed and the correction stated. Got: ' + JSON.stringify(String(r.summary || '').slice(0, 160)));
}

// The archived+active contradiction: a state claim that cannot be true is not a mutation
// success claim, but must not be silently blessed either.
check('A: "archived and active" contradiction does not assert a false execution',
  !/has been (archived|restored)\b/i.test(String(run('gpt', 'The company is archived and active.', null, false).summary || '')),
  'Should not emit a bare completion assertion for a self-contradictory state claim.');

// =======================================================================================
// SECTION B — the #61/D3 shape: fabrication + trailing question. Both must be handled:
// the false claim removed, AND the question preserved (that is what #62/D3-FP broke).
// =======================================================================================
{
  const r = run('gpt', 'The approval has been approved. Would you like me to notify the team?', null, false);
  check('B1 D3 fabrication+question: false claim removed', r.corrected && !/has been approved/i.test(String(r.summary || '')));
  check('B2 D3 fabrication+question: the QUESTION SURVIVES', has(r, 'would you like me to notify the team'),
    'Destroying the question was #62/D3-FP. Got: ' + JSON.stringify(String(r.summary || '').slice(0, 200)));
  check('B3 D3 fabrication+question: correction is stated', saysNothingChanged(r));
}

// =======================================================================================
// SECTION B2 — a QUESTION is not an execution claim, even when it contains completion
// wording. Added after mutation testing: deleting the FOLLOW_UP_QUESTION classification
// was NOT caught by any suite, because every question in the corpus happened to lack
// completion words and fell through to OTHER anyway. "Was the task completed?" matches
// PAST_COMPLETION_CLAIM_PATTERN outright — asking whether something happened is not
// claiming it did, and without the guard the assistant would "correct" a plain question.
// =======================================================================================
const QUESTIONS_WITH_COMPLETION_WORDING = [
  'Was the task completed?',
  'Was the company archived?',
  'Were the employees assigned?',
];
for (const q of QUESTIONS_WITH_COMPLETION_WORDING) {
  const r = run('gpt', q, null, false);
  check('B2 question is not an execution claim — ' + q, !r.corrected,
    'A question must never be treated as a mutation-success claim. Got: ' + JSON.stringify(String(r.summary || '').slice(0, 140)));
}
{
  // And a question must not launder a real fabrication sitting beside it.
  const r = run('gpt', 'Was the task completed? The task has been completed.', null, false);
  check('B2 question does NOT launder an adjacent fabrication', r.corrected && !/the task has been completed/i.test(String(r.summary || '')));
  check('B2 the question itself survives that correction', has(r, 'was the task completed'));
}

// =======================================================================================
// SECTION B3 — ZERO-SUCCESS fact lines are NOT evidence. Added after mutation testing:
// changing the evidence builder to add a resource regardless of its success count was NOT
// caught by any suite. A batch that ran and succeeded ZERO times is proof the mutation did
// NOT happen — treating it as support would resurrect BUG-002 through the evidence path
// rather than the prose path.
// =======================================================================================
check('B3 Succeeded: 0 is not evidence',
  run('gpt', 'The task has been completed.', null, false, ['Task batch — Requested: 1. Succeeded: 0. Failed: 1.']).corrected,
  'A batch with zero successes must not support a completion claim.');
check('B3 "0 of 3" is not evidence',
  run('gpt', 'The tasks have been deleted.', null, false, ['Deleted 0 of 3 requested task(s).']).corrected,
  'Zero executed out of three requested must not support a completion claim.');
check('B3 a genuine non-zero success IS evidence (control)',
  !run('gpt', 'The task has been completed.', null, false, ['Task batch — Requested: 1. Succeeded: 1. Failed: 0.']).corrected);
// =======================================================================================
// SECTION C — #62/D3-FP: truthful replies must SURVIVE. These are the real production
// shapes the previous fix destroyed. None may be replaced by a capability denial.
// =======================================================================================
const TRUTHFUL_SURVIVORS = [
  ['C1 truthful NEGATIVE + question', 'QA-LIFECYCLE-EMPLOYEE2 was not created. Which company should I use?'],
  ['C2 truthful prior-turn report', 'They were just restored in the prior turn. Anything else?'],
  ['C3 truthful failure report', 'Nothing was changed.'],
  ['C4 Brain OS own corrector output', 'Couldn’t confirm that. No company was actually archived or restored this turn.'],
  ['C5 honest hedged decline', 'I don’t see that task — it may have been archived or deleted.'],
];
for (const [name, s] of TRUTHFUL_SURVIVORS) {
  // Read-only runner: these are reports and declines answering a QUESTION, not replies to a
  // mutation request. Under per-resource grounding that distinction is what protects them,
  // rather than any pronoun heuristic (#64/D17).
  const r = runReadOnly('gpt', s, null);
  check(name + ' — untouched', !r.corrected,
    'A truthful reply must not be corrected. Got corrected=' + r.corrected + ' summary=' + JSON.stringify(String(r.summary || '').slice(0, 160)));
}

// =======================================================================================
// SECTION D — grounded turns. Real execution evidence must let a success claim stand.
// =======================================================================================
// Grounding is now PER-RESOURCE: a matching factLine, not the whole-turn
// groundedOutcomeThisTurn signal (which counted mere entity resolution as mutation proof —
// the exact thing the contract says to stop doing).
check('D1 grounded success claim survives when SAME-RESOURCE evidence exists',
  !run('gpt', 'The company was archived successfully.', null, true, ['Archived 1 of 1 requested company(s).']).corrected);
check('D2 grounded via factLines evidence survives',
  !run('gpt', 'The company was archived successfully.', null, false, ['Archived 1 of 1 requested company(s).']).corrected);
check('D3 ungrounded success claim is corrected',
  run('gpt', 'The company was archived successfully.', null, false).corrected);
for (const m of ['deterministic-confirmation', 'deterministic-plan-execution', 'deterministic-clarification', 'deterministic-disambiguation']) {
  check('D4 ' + m + ' exempt', !run(m, 'The company has been archived.', null, false).corrected);
}

// =======================================================================================
// SECTION E — multi-claim combinations required by the founder.
// =======================================================================================
{
  // one supported / one false, ungrounded: the false one goes, prose survives.
  const r = run('gpt', 'The task is still open. The task has been completed.', null, false);
  check('E1 one true + one false: false removed', r.corrected && !/has been completed/i.test(String(r.summary || '')));
  check('E2 one true + one false: TRUE CLAIM SURVIVES', has(r, 'the task is still open'),
    'Per-claim correction must keep the truthful clause. Got: ' + JSON.stringify(String(r.summary || '').slice(0, 200)));
}
{
  // state claim + mutation claim + question
  const r = run('gpt', 'The approval is pending. It has been approved. Shall I continue?', null, false);
  check('E3 state+mutation+question: mutation removed', r.corrected && !/it has been approved/i.test(String(r.summary || '')));
  check('E4 state+mutation+question: state survives', has(r, 'the approval is pending'));
  check('E5 state+mutation+question: question survives', has(r, 'shall i continue'));
}
{
  // current state + future action — a proposal is not an execution claim.
  //
  // STRENGTHENED 2026-09-01 by independent verifier #4 (qa/KNOWN_FAILURE_MODES.md #64/D19).
  // The original assertion was "!saysNothingChanged(r) || has(r, 'the company is active')"
  // — a disjunction whose second half is true whenever survivors are re-emitted, so it
  // could not fail. Worse, neither of its two claims matches ANY completion pattern, so it
  // never reached the FUTURE_ACTION branch it names. Mutation-proven: deleting
  // "if (FUTURE_PROMISE_PATTERN.test(c)) return 'FUTURE_ACTION';" from index.ts left ALL SIX
  // suites green. This is the fourth recurrence of the vacuous-assertion class
  // (#61/D2 -> #62/D5 -> #63/D10 -> here), so it is fixed with a real input, not a reworded
  // one: E6b's proposal MENTIONS a past condition, which is what forces the guard to matter.
  const r = run('gpt', 'The company is active. I’ll archive it next.', null, false);
  check('E6 state claim + plain proposal is untouched', !r.corrected,
    'A FUTURE_ACTION claim must not be treated as a past execution claim. Got: ' + JSON.stringify(String(r.summary || '').slice(0, 200)));
  const r2 = run('gpt', 'I will archive it once it has been approved.', { kind: 'bulk_confirmation', summary: 'Archive 1 company?' }, false);
  check('E6b FUTURE_ACTION guard: a proposal that mentions a past condition is not an execution claim', !r2.corrected,
    'Without the FUTURE_ACTION classification this is typed MUTATION_SUCCESS and a truthful proposal is destroyed. Got: ' + JSON.stringify(String(r2.summary || '').slice(0, 200)));
}
{
  // all false
  const r = run('gpt', 'The task has been completed. The project has been renamed.', null, false);
  check('E7 all-false reply corrected', r.corrected && !/has been (completed|renamed)/i.test(String(r.summary || '')));
}
{
  // all supported, grounded
  const r = run('gpt', 'The task has been completed. The project has been renamed.', null, true, ['Task batch — Requested: 1. Succeeded: 1. Failed: 0.', 'Project batch — Requested: 1. Succeeded: 1. Failed: 0.']);
  check('E8 all-supported reply untouched when every resource has evidence', !r.corrected);
}

// =======================================================================================
// SECTION F — pending prompt / disambiguation options must survive a correction (#62/D7).
// =======================================================================================
{
  const r = run('gpt', 'The company has been archived.', { kind: 'disambiguation', question: 'Which one did you mean?', options: [{ label: 'CLIX GPS' }, { label: 'CLIX GPS 2' }] }, false);
  check('F1 corrected disambiguation keeps its question', has(r, 'which one did you mean'));
  check('F2 corrected disambiguation keeps OPTION LABELS', has(r, 'CLIX GPS') && has(r, 'CLIX GPS 2'),
    'matchDisambiguationOption() only resolves a reply containing a label — without labels the turn is unanswerable.');
}
{
  const r = run('gpt', 'The company has been archived.', { kind: 'open_question', question: 'Which company did you mean?' }, false);
  check('F3 corrected open_question keeps its prompt', has(r, 'which company did you mean'));
}

// =======================================================================================
// SECTION G — claim audit must be machine-readable, so the same truth survives reload and
// is recoverable from persisted history rather than only from prose.
// =======================================================================================
{
  const r = run('gpt', 'The approval was not rejected — it has been approved.', null, false);
  check('G1 claimAudit emitted on correction', Array.isArray(r.claimAudit) && r.claimAudit.length >= 2);
  check('G2 claimAudit marks the false claim contradicted',
    Array.isArray(r.claimAudit) && r.claimAudit.some((c) => c.verdict === 'contradicted' && /has been approved/i.test(c.text)));
  // Verdict vocabulary is now supported | contradicted | not_a_claim, and each entry
  // records the assertion span in .text with the reason it was classified that way.
  check('G3 claimAudit records the truthful claim as not-a-claim with a reason',
    Array.isArray(r.claimAudit) && r.claimAudit.some((c) => c.verdict === 'not_a_claim' && /negated/i.test(c.reason)));
}

console.log('\nmixed_claim_grounding: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
