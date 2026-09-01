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
  const start = source.indexOf('const FUTURE_PROMISE_PATTERN');
  if (start === -1) throw new Error('FUTURE_PROMISE_PATTERN not found — update this harness');
  const anchor = source.indexOf('(result).claimAudit = claimAudit;', start) !== -1
    ? source.indexOf('(result).claimAudit = claimAudit;', start)
    : source.indexOf('claimAudit = claimAudit;', start);
  if (anchor === -1) throw new Error('claim-grounding block not found — update this harness');
  const end = source.indexOf('}', source.indexOf('\n', anchor)) + 1;
  // Normalize to LF FIRST. The working tree is CRLF, and every strip pattern below that
  // anchors on a line end would silently fail to match against \r\n — the harness would
  // then hand un-stripped TypeScript to new Function() and throw. Normalizing once here
  // makes all of them line-ending agnostic.
  let slice = source.slice(start, end).replace(/\r\n/g, '\n');
  // Drop the TS type alias and the typed annotations node cannot parse.
  slice = slice.replace(/^\s*type ClaimType =[\s\S]*?;\s*$/m, '');
  // Signature-agnostic: strip param type annotations and the return type whatever the
  // parameter list is. Pinning the exact signature broke the moment classifyClaim gained
  // its second parameter, and a harness that cannot parse the source it executes must not
  // be the thing that blocks a correct change.
  slice = slice.replace(/function classifyClaim\(([^)]*)\):\s*ClaimType/, (_m, params) =>
    'function classifyClaim(' + params.replace(/:\s*[A-Za-z_][\w.<>[\]]*/g, '') + ')');
  slice = slice.replace(/const claimAudit: Array<[\s\S]*?> =/, 'const claimAudit =');
  slice = slice.replace(/const rebuiltClaims: string\[\] =/, 'const rebuiltClaims =');
  slice = stripTypeAssertions(slice);
  if (/\btype ClaimType\b|: ClaimType\b/.test(slice)) {
    throw new Error('TypeScript type syntax survived stripping — update this harness rather than letting it throw opaquely');
  }
  const fn = new Function(
    'model', 'result', 'groundedOutcomeThisTurn', 'factLines',
    slice + '\n; return { summary: result.summary, claimAudit: result.claimAudit || null, corrected: claimsPastCompletionWithNoGrounding };'
  );
  return (model, summary, pendingAction, grounded, factLines = []) =>
    fn(model, { summary, pendingAction }, grounded, factLines);
}

const run = buildRunner(src);

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
  const r = run('gpt', s, null, false);
  check(name + ' — untouched', !r.corrected,
    'A truthful reply must not be corrected. Got corrected=' + r.corrected + ' summary=' + JSON.stringify(String(r.summary || '').slice(0, 160)));
}

// =======================================================================================
// SECTION D — grounded turns. Real execution evidence must let a success claim stand.
// =======================================================================================
check('D1 grounded (groundedOutcomeThisTurn) success claim survives',
  !run('gpt', 'The company was archived successfully.', null, true).corrected);
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
  const r = run('gpt', 'The task has been completed. The project has been renamed.', null, true);
  check('E8 all-supported grounded reply untouched', !r.corrected);
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
    Array.isArray(r.claimAudit) && r.claimAudit.some((c) => c.verdict === 'contradicted' && /has been approved/i.test(c.claim)));
  check('G3 claimAudit keeps the truthful claim',
    Array.isArray(r.claimAudit) && r.claimAudit.some((c) => c.verdict === 'kept' && /was not rejected/i.test(c.claim)));
}

console.log('\nmixed_claim_grounding: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
