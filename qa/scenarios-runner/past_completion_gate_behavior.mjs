// BEHAVIORAL regression for the BUG-002 PAST-completion truthfulness gate.
//
// Added 2026-09-01 by the independent verifier of the PREPARED-BUT-NOT-DEPLOYED D3 branch
// (pending/d3-past-completion-gate-pendingaction-shortcircuit @ e085cfc), recorded as
// qa/KNOWN_FAILURE_MODES.md #62.
//
// WHY THIS FILE EXISTS, and how it differs from its three siblings:
//   * sem_ai_command_past_completion_claim_regex.mjs tests a COPY of the regex against
//     hand-written strings. It cannot see the gate at all.
//   * d3_past_completion_gate_not_shortcircuited_by_pending_action.mjs and
//     sem_ai_command_source_invariants_drift_guard.mjs assert on the SOURCE TEXT. They
//     prove the code SAYS what it should, never that it DOES what it should.
//   * This file EXTRACTS the real gate + correction block out of
//     supabase/functions/sem-ai-command/index.ts and EXECUTES it against turn states.
//     It is the only one of the four that can see a false positive.
//
// The corpus in Section B is not invented: every "REAL" case is the verbatim
// output.summary of an actual production work_orders row (project pvphxgrtdfrudejjhzjk),
// row id given, recovered read-only during that verification campaign.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// --- Extract and execute the REAL gate, not a reimplementation of it -------------------
// Slice runs from `const FUTURE_PROMISE_PATTERN` through the closing brace of
// `if (claimsPastCompletionWithNoGrounding) { ... }` - i.e. both sibling gates and both
// correction blocks, exactly as shipped. If the shape ever changes so this cannot be
// extracted, this harness THROWS rather than silently passing.
// Remove `x as <Type>` TypeScript assertions from a source slice. The type expression is
// consumed with balanced {} <> [] () tracking and terminates at the first `;` `,` `)` `?`
// or `:` seen at depth zero.
function stripTypeAssertions(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(' as ', i)) {
      let j = i + 4;
      const depth = { '{': 0, '<': 0, '[': 0, '(': 0 };
      const zero = () => depth['{'] === 0 && depth['<'] === 0 && depth['['] === 0 && depth['('] === 0;
      while (j < text.length) {
        const c = text[j];
        if (c === '{' || c === '<' || c === '[' || c === '(') { depth[c]++; j++; continue; }
        if (c === '}') { depth['{']--; j++; continue; }
        if (c === '>') { depth['<']--; j++; continue; }
        if (c === ']') { depth['[']--; j++; continue; }
        if (c === ')') { if (zero()) break; depth['(']--; j++; continue; }
        if (zero() && (c === ';' || c === ',' || c === '?' || c === ':')) break;
        j++;
      }
      i = j;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

function buildGateRunner(source) {
  const start = source.indexOf('const FUTURE_PROMISE_PATTERN');
  if (start === -1) throw new Error('FUTURE_PROMISE_PATTERN not found - update this harness');
  const ifIdx = source.indexOf('if (claimsPastCompletionWithNoGrounding)', start);
  if (ifIdx === -1) throw new Error('past-completion correction block not found - update this harness');
  let depth = 0, end = -1;
  for (let k = source.indexOf('{', ifIdx); k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces in the correction block');
  // The only TypeScript-only syntax inside this slice is `x as <Type>` assertions. Strip
  // them with a balanced scan (nested {} / <> / [] / () all handled) so plain node can
  // execute the real statements verbatim. A hand-written regex was tried first and was
  // NOT good enough - it silently failed on a nested `Array<{ label?: unknown }>`, and a
  // harness that cannot parse the source it is supposed to execute must throw, never
  // quietly pass.
  const slice = stripTypeAssertions(source.slice(start, end));
  // lifecycleMismatchCorrections is injected too: it is in scope at the real call site,
  // and a candidate fix for D6 (#62) needs to reference it. Defaults to [] for the
  // versions that do not.
  const fn = new Function(
    'model', 'result', 'groundedOutcomeThisTurn', 'lifecycleMismatchCorrections',
    slice + '\n; return { summary: result.summary, pendingAction: result.pendingAction, past: claimsPastCompletionWithNoGrounding, future: claimsFutureActionWithNoPlan };'
  );
  return (model, summary, pendingAction, grounded, lifecycleMismatchCorrections = []) =>
    fn(model, { summary, pendingAction }, grounded, lifecycleMismatchCorrections);
}

const run = buildGateRunner(src);
const CORRECTION_PREFIX = 'I can’t actually do that from chat';
const overwritten = (r) => String(r.summary || '').startsWith(CORRECTION_PREFIX);

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// ======================================================================================
// READ THIS FIRST - THIS SUITE IS EXPECTED TO BE RED ON EVERY BUILD THAT EXISTS TODAY.
//
// That is the finding, not a bug in the harness:
//   * On master / the DEPLOYED c9dfab5 (v92) build, Section B fails - the gate is
//     short-circuited by `!result.pendingAction`, so a fabricated past-completion claim
//     that also carries a pending question is never corrected (KFM #61, finding D3).
//   * On the prepared branch e085cfc, Section B passes but Section C fails - removing the
//     short-circuit also destroys truthful replies that legitimately mention a past event
//     while asking a question (KFM #62).
// Neither build is correct. Section B and Section C are BOTH acceptance criteria for any
// future version of this gate: it must pass BOTH at once. Do not delete cases from either
// section to make this green.
// ======================================================================================

// ======================================================================================
// SECTION A - version-independent invariants (green on master AND on e085cfc)
// ======================================================================================

check(
  'A1 fabricated past completion, no pendingAction, ungrounded -> CORRECTED',
  overwritten(run('gpt', 'Approval 358eddeb (Complete corporate holding restructuring) has been approved.', null, false)),
  'Verbatim summary of REAL production row a031cb51-1075-4dd8-bcf2-89f6ac00b602, the BUG-002 incident itself. If this stops being corrected, BUG-002 has regressed.'
);

check(
  'A2 GROUNDED turn with a past-completion sentence -> untouched',
  !overwritten(run('gpt', 'The company was archived successfully.', null, true))
);

check(
  'A3 grounded turn WITH a pendingAction -> untouched',
  !overwritten(run('gpt', 'The company was archived successfully.', { kind: 'open_question', question: 'Anything else?' }, true))
);

for (const m of ['deterministic-confirmation', 'deterministic-plan-execution', 'deterministic-clarification', 'deterministic-disambiguation']) {
  check('A4 ' + m + ' -> untouched', !overwritten(run(m, 'The company has been archived.', null, false)));
}

check(
  'A5 future promise WITH a real pendingAction -> untouched by either gate',
  (() => { const r = run('gpt', 'I will assign the task to them - confirm?', { kind: 'bulk_confirmation', summary: 'Assign QA-TASK to Bat?' }, false); return !r.future && !r.past; })(),
  'A future promise alongside a real queued pendingAction is honest - the pendingAction IS the promised intent. The FUTURE gate must keep its short-circuit.'
);

check(
  'A6 future promise with NO pendingAction -> corrected by the FUTURE gate, PAST gate defers',
  (() => { const r = run('gpt', 'I will assign the task to them now.', null, false); return r.future && !r.past; })()
);

check(
  'A7 hedged honest decline (may have been archived) -> untouched',
  !overwritten(run('gpt', 'I do not see that task - it may have been archived or deleted.', null, false))
);

{
  const pa = { kind: 'bulk_confirmation', summary: 'Archive Acme Corp?', action: { archiveCompanyIds: ['00000000-0000-0000-0000-000000000001'] } };
  const r = run('gpt', 'The company has been archived.', pa, false);
  check('A8 correction never nulls result.pendingAction (next turn can still resolve it)', r.pendingAction === pa);
}

// ======================================================================================
// SECTION B - REQUIRES THE D3 FIX. Fails on master / deployed c9dfab5 (v92); that failure
// IS the D3 defect reported as qa/KNOWN_FAILURE_MODES.md #61.
// ======================================================================================

check(
  'B1 fabricated past completion PLUS a live pendingAction -> must still be CORRECTED',
  overwritten(run('gpt', 'The approval has been approved. Would you like me to notify the team?', { kind: 'open_question', question: 'Should I notify the team?' }, false)),
  'D3: a pending question cannot ground a claim that something ALREADY happened. Short-circuiting the PAST gate on result.pendingAction exempts exactly this fabrication.'
);

for (const [label, pa] of [
  ['no question/summary field at all', { kind: 'disambiguation', options: [{ label: 'A', id: 'x', entityType: 'company' }] }],
  ['question is whitespace only', { kind: 'open_question', question: '   ' }],
  ['question is a non-string', { kind: 'open_question', question: 42 }],
  ['pendingAction is a bare string', 'not-an-object'],
]) {
  const r = run('gpt', 'The company has been archived.', pa, false);
  check(
    'B2 malformed pendingAction (' + label + ') -> corrected cleanly, nothing leaked',
    overwritten(r) && !/undefined|\bnull\b|\[object/.test(String(r.summary)),
    'Got: ' + JSON.stringify(r.summary)
  );
}

// ======================================================================================
// SECTION C - the D3 FALSE-POSITIVE corpus (qa/KNOWN_FAILURE_MODES.md #62).
//
// Every case below is the VERBATIM output.summary of a real production work_orders row
// that carried a live pendingAction, and every one of them is TRUE. None is a
// fabrication. On master / the deployed c9dfab5 build they are all correctly left alone.
// On the D3 branch e085cfc they are all destroyed and replaced with a capability denial
// that is itself false (chat CAN archive/restore/create these things).
//
// Empirical basis: of 442 production work_orders rows, 70 carried a live pendingAction;
// 12 of those matched the real PAST_COMPLETION_CLAIM_PATTERN; 9 are no longer reachable
// (the claims-deleted correctors all require !modelProposedPendingAction); the 3 that
// remain reachable are C1/C2/C3 below - and ZERO rows in the whole corpus were the
// fabrication shape D3 exists to catch.
//
// This section is the SHIP GATE for D3. Do not make it green by deleting cases - fix the
// detector (negation blindness, prior-turn attribution, self-cannibalisation) first, then
// widen the gate.
// ======================================================================================
const FALSE_POSITIVE_CORPUS = [
  ['C1 REAL 432f1a52 truthful prior-turn report + clarification',
    'Ariunjargal is the first person mentioned in the conversation history - they were just restored in the prior turn. Did you mean to delete Ariunjargal?',
    { kind: 'single_entity_clarification', question: 'Did you mean Ariunjargal (Installation Technician, CLIX GPS)?', candidateIds: ['x'], entityType: 'person', actionType: 'archive' }],
  ['C2 REAL c763bd89 truthful NEGATIVE (was not created) + follow-up question',
    'No. QA-LIFECYCLE-EMPLOYEE2 was not created. The conversation history shows you asked to create it, but I asked for clarification on which company it should belong to.',
    { kind: 'open_question', question: 'Should I create QA-LIFECYCLE-EMPLOYEE2 at QA-LIFECYCLE-BU now?' }],
  ['C3 REAL c1cab239 truthful history recap (was confirmed) + open question',
    'Looking at the conversation history in this channel, the most recent substantive action was adding employee5 to test5 company. That action was confirmed as done.',
    { kind: 'open_question', question: 'Which specific action would you like me to verify?' }],
];
for (const [name, summary, pa] of FALSE_POSITIVE_CORPUS) {
  const r = run('gpt', summary, pa, false);
  check(
    name + ' -> must NOT be overwritten',
    !overwritten(r),
    'A truthful reply carrying a live pendingAction was replaced by a capability denial that is itself false. Got: ' + JSON.stringify(String(r.summary).slice(0, 130))
  );
}

// Disambiguation option labels live in the model summary, not in pendingAction.question.
// The system prompt requires the model to name the real options by their real names in
// "summary", and matchDisambiguationOption() resolves the next turn ONLY if the reply
// text CONTAINS one option label. Destroying "summary" and re-attaching only "question"
// leaves a live pendingAction the user can no longer answer.
{
  const pa = {
    kind: 'disambiguation', question: 'Which one did you mean?', options: [
      { label: 'SEM LLC', id: 'a', entityType: 'company', actionType: 'restore' },
      { label: 'SEM Global Robotics Technologies', id: 'b', entityType: 'company', actionType: 'restore' },
    ],
  };
  const r = run('gpt', 'Did you mean SEM LLC or SEM Global Robotics Technologies? The second one was archived last month.', pa, false);
  const labelsSurvive = pa.options.every((o) => String(r.summary).includes(o.label));
  check(
    'C4 a corrected disambiguation turn still shows its option labels (else it is unanswerable)',
    !overwritten(r) || labelsSurvive,
    'The correction kept only pendingAction.question, so the option labels the user must type back are gone. Got: ' + JSON.stringify(String(r.summary).slice(0, 170))
  );
}

// ======================================================================================
// SECTION D - characterization of KNOWN-OPEN defect D6 (#62), live in production today.
//
// PAST_COMPLETION_CLAIM_PATTERN matches the truthfulness corrector output that Brain OS
// itself emits ("Could not confirm that. No company was actually archived or restored
// this turn."), which is definitionally ungrounded - lifecycleMismatchCorrections is NOT
// part of groundedOutcomeThisTurn. The gate therefore overwrites its own corrector output
// with a message that additionally claims, falsely, that chat cannot do the action.
// 23 such summaries exist in production history, 14 of them with no pendingAction, i.e.
// already reachable on the DEPLOYED c9dfab5 / v92 build - this one is NOT introduced by
// D3.
//
// INVERTED 2026-09-01 (Main-PC), exactly as this section's own failure message
// instructed. D6 was deliberately asserted in the still-broken direction so that fixing
// it would force this file to be updated rather than silently drifting. The verifier's
// proposed patch (qa/verification/proposed/d3-followup-detector-tightening.patch) adds
// `&& lifecycleMismatchCorrections.length === 0` to the PAST gate, which fixes D6: Brain
// OS's own truthful lifecycle-mismatch corrector is no longer overwritten by a less
// accurate message that additionally claims, falsely, that chat cannot do the action.
// Now asserted in the FIXED direction, so a regression re-breaks this test.
// ======================================================================================
const SELF_CANNIBALIZED = [
  'Couldn’t confirm that. No company was actually archived or restored this turn.',
  'Couldn’t confirm that. No task was actually archived, restored, or deleted this turn.',
  'Couldn’t confirm that. No goal was actually archived or restored this turn.',
  'Couldn’t confirm that. No employee’s employment was actually ended or restored this turn.',
];
for (const s of SELF_CANNIBALIZED) {
  check(
    'D6 FIXED: gate no longer cannibalises its own corrector - ' + s.slice(30, 62),
    !overwritten(run('gpt', s, null, false)),
    "D6 has REGRESSED: Brain OS's own truthful lifecycle-mismatch corrector is being overwritten by the PAST gate again. The `lifecycleMismatchCorrections.length === 0` guard is missing or ineffective."
  );
}

console.log('\npast_completion_gate_behavior: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  console.log('\nNOTE: Section B failing means the D3 defect is present (deployed build).');
  console.log('      Section C failing means the D3 fix over-corrects truthful replies (branch e085cfc).');
  console.log('      A correct build must pass BOTH. See qa/KNOWN_FAILURE_MODES.md #61 and #62.');
  process.exit(1);
}
