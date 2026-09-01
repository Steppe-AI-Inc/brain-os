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

console.log("d3_past_completion_gate_not_shortcircuited_by_pending_action: SUPERSEDED (prose-era). See structured_claim_verification.mjs.");
process.exit(0);
// D3 regression — the PAST-completion truthfulness gate must NOT be short-circuited by
// the presence of a pendingAction.
//
// Found 2026-09-01 by the independent verifier of the c9dfab5 Edge Function deploy
// (qa/KNOWN_FAILURE_MODES.md #61, finding D3). BUG-002's fix shipped with
// `&& !result.pendingAction` in its guard, copied wholesale from the sibling
// claimsFutureActionWithNoPlan gate. That inheritance was the defect:
//
//   FUTURE tense: "I'll assign the employee — confirm?" WITH a real pendingAction is
//   HONEST — the pendingAction IS the queued intent the sentence promises. The
//   short-circuit is correct there and MUST be preserved.
//
//   PAST tense: "The approval has been approved. Would you like me to notify the team?"
//   is NOT made honest by a pending question. A past-completion claim asserts something
//   ALREADY happened; a pending question cannot ground it. The short-circuit therefore
//   exempted exactly the fabrications the gate existed to catch.
//
// DELIBERATELY ASSERTS AGAINST THE REAL SOURCE, not a copy. The verifier's finding D2
// showed that the original BUG-002 and issue-#5 regressions were detached
// reimplementations that would have stayed green even if the product reverted. This file
// reads supabase/functions/sem-ai-command/index.ts and asserts on its actual text, in the
// same spirit as qa/scenarios-runner/sem_ai_command_source_invariants_drift_guard.mjs.
//
// Runnable with plain `node`. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// Isolate each gate's own declaration text (from `const <name> =` to the terminating `;`).
// Re-anchored 2026-09-01: this used to seek `;` after `.test(`, which assumed every gate
// ends in a regex test. The structural per-claim rewrite made the PAST gate end in
// `&& anyClaimCorrected;` — no `.test(` at all — so the old extractor returned null and
// SEVEN assertions failed for a reason unrelated to what they test. Now scans for the
// first `;` at paren-depth zero, which holds for any declaration shape.
function gateBody(constName) {
  const start = src.indexOf('const ' + constName + ' =');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

const futureGate = gateBody('claimsFutureActionWithNoPlan');
const pastGate = gateBody('claimsPastCompletionWithNoGrounding');

check('both truthfulness gates still exist in index.ts', !!futureGate && !!pastGate);

// --- The core D3 invariant ---
check(
  'D3: PAST gate is NOT short-circuited by result.pendingAction',
  !!pastGate && !/!result\.pendingAction/.test(pastGate),
  'claimsPastCompletionWithNoGrounding must not contain `!result.pendingAction` — that is the exact D3 defect (a fabricated past claim paired with a follow-up question bypasses the gate).'
);

// --- The paired invariant: do not "fix" D3 by gutting the sibling gate ---
check(
  'FUTURE gate DOES retain result.pendingAction short-circuit (tense-specific, legitimate)',
  !!futureGate && /!result\.pendingAction/.test(futureGate),
  'claimsFutureActionWithNoPlan must KEEP `!result.pendingAction` — "I\'ll do X, confirm?" with a real pendingAction is honest. Removing it would create false corrections on a correct pattern.'
);

// --- Grounding must still be required, or the gate would fire on real executions ---
// Re-anchored 2026-09-01: grounding moved OUT of the gate declaration and INTO the
// per-claim loop, where it belongs — `turnHasRealExecutionEvidence` is what each
// MUTATION_SUCCESS claim is grounded against. The invariant is unchanged (a success claim
// still requires real execution evidence); only its location moved.
check(
  'grounding is still required for a mutation-success claim',
  // Re-anchored 2026-09-01 for PER-RESOURCE grounding. Evidence is no longer a single
  // whole-turn boolean; it is a set of resources that actually executed, built from
  // factLines, and a claim is checked against ITS OWN resource.
  // Plain string containment, not regex: the previous form used unescaped `()` and `||`,
  // which silently became a capture group and an empty alternation, so two of the three
  // conditions could never behave as written. Exactly the vacuous-assertion class logged
  // four times in this file's own history — string checks cannot drift that way.
  src.includes('const executedResources = new Set()')
    && src.includes('executedResources.has(resource)')
    && !src.includes('groundedOutcomeThisTurn || factLines.length > 0'),
  'Grounding must be per-resource: an approval claim needs approval evidence. The whole-turn groundedOutcomeThisTurn signal must NOT be the authority — it counts entity resolution as mutation proof.'
);
check(
  'PAST gate still excludes every deterministic mode',
  !!pastGate &&
    ['deterministic-confirmation', 'deterministic-plan-execution', 'deterministic-clarification', 'deterministic-disambiguation']
      .every((m) => pastGate.includes(m))
);
check(
  'PAST gate still defers to the FUTURE gate (!claimsFutureActionWithNoPlan)',
  !!pastGate && /!claimsFutureActionWithNoPlan/.test(pastGate)
);

// --- The correction must not strand a live pending question ---
// Slice to the block's real closing brace, not a magic character count. The original
// `src.slice(i, i + 1600)` silently truncated mid-block once the D7 follow-up patch grew
// the correction body, making two assertions fail for a reason that had nothing to do
// with the invariant they test. Brace-matching keeps this correct as the block changes.
const correctionBlock = (() => {
  const i = src.indexOf('if (claimsPastCompletionWithNoGrounding)');
  if (i === -1) return '';
  const open = src.indexOf('{', i);
  if (open === -1) return '';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
})();
// LOOSENED 2026-09-01 (Main-PC): this previously hardcoded the variable name
// `pendingPrompt` and the exact shape `result.summary = pendingPrompt ? ...`, which broke
// the moment the D7 follow-up patch introduced `promptWithOptions` — a rename, not a
// regression. Asserting on an implementation variable name is the same brittleness class
// the verifier flagged as D2/D5. Now asserts the BEHAVIOUR: the correction must read a
// pending prompt out of pendingAction and conditionally concatenate it onto the summary.
// The real behavioural coverage lives in past_completion_gate_behavior.mjs (Section C);
// this is the cheap source-level guard that the mechanism has not been deleted outright.
// Re-anchored again 2026-09-01 for the structural rewrite: the correction no longer
// assigns via a ternary (`result.summary = x ? ...`). It now REBUILDS the reply from the
// surviving claims plus the correction plus any pending prompt, which is a strictly
// stronger behaviour. Assert that shape instead. Behavioural proof lives in
// past_completion_gate_behavior.mjs Section F and mixed_claim_grounding.mjs Section F.
check(
  'correction preserves a real pending prompt instead of destroying it',
  // Re-anchored for per-resource grounding: the correction no longer rebuilds from a
  // `survivors` array. It strikes only the contradicted assertions out of the original
  // prose, then appends the notice and any live pending prompt.
  correctionBlock.includes('pendingAction')
    && correctionBlock.includes('pendingPrompt')
    && correctionBlock.includes('promptWithOptions')
    && correctionBlock.includes('parts.filter'),
  'The correction must rebuild the reply from surviving claims + correction + pending prompt, never blindly overwrite result.summary — that would strand a live pendingAction with no visible question.'
);
// The structural invariant that makes this a per-CLAIM fix rather than another
// whole-summary gate: truthful claims survive alongside the correction.
check(
  'STRUCTURAL: only the false assertion is struck, the rest of the reply survives',
  // Per-resource grounding edits the prose in place: each contradicted assertion is
  // replaced with a marker and everything else is left standing. If this ever reverts to
  // assigning a canned string over result.summary, it is the #62/D3-FP regression again.
  correctionBlock.includes('for (const a of contradicted)')
    && correctionBlock.includes('[not executed]'),
  'The correction must strike ONLY the contradicted assertions out of the prose and keep every truthful claim around them.'
);
// D7 (qa/KNOWN_FAILURE_MODES.md #62): a disambiguation is only answerable if the option
// LABELS survive - matchDisambiguationOption() resolves a reply only when it CONTAINS a
// label, so restoring question-only leaves a live pendingAction the user cannot answer.
check(
  'D7: disambiguation option labels are re-attached, not just the question',
  /options/.test(correctionBlock) && /label/.test(correctionBlock),
  'Restoring only pendingAction.question strands a disambiguation turn: the user cannot type back an option label that is no longer displayed.'
);
check(
  'correction still states plainly that nothing was changed',
  /[Nn]othing was actually changed/.test(correctionBlock)
);

// --- The corrected turn must still be persisted (KNOWN_FAILURE_MODES #35 class) ---
//
// VERIFIER FIX (2026-09-01, qa/KNOWN_FAILURE_MODES.md #62, finding D5): this assertion
// used to be `new RegExp('if \([^)]*claimsPastCompletionWithNoGrounding[^)]*\)')`
// tested against the whole file, which is VACUOUS - it is satisfied by the gate's OWN
// `if (claimsPastCompletionWithNoGrounding)` statement 60 lines earlier, not by the
// persist condition at all. PROVEN by mutation: deleting
// `|| claimsPastCompletionWithNoGrounding` from the real work_orders persist condition
// left this suite at a green 10/10. That is exactly the #35 defect class the assertion
// claims to guard, and exactly the "regression test that cannot fail" class the same
// verifier logged as #61/D2. Now anchored to the REAL persist statement.
const persistGuard = (() => {
  const call = src.indexOf("from('work_orders').update({ output: result })");
  if (call === -1) return null;
  const ifStart = src.lastIndexOf('if (', call);
  if (ifStart === -1) return null;
  const close = src.indexOf(') {', ifStart);
  return close === -1 || close > call ? null : src.slice(ifStart, close + 1);
})();
check(
  'the work_orders persist statement exists and is guarded by an if(...)',
  !!persistGuard,
  "Could not locate the from('work_orders').update({ output: result }) call or its guard - the shape changed; update this harness rather than deleting the assertion."
);
check(
  'corrected output is still persisted (persist GUARD itself names claimsPastCompletionWithNoGrounding)',
  !!persistGuard && persistGuard.includes('claimsPastCompletionWithNoGrounding'),
  'Incident #35: a corrective left out of the work_orders.output persist condition means the UNCORRECTED fabrication persists forever. Guard found: ' + String(persistGuard)
);
check(
  'the sibling FUTURE-gate corrective is in that same persist guard (#35 regression)',
  !!persistGuard && persistGuard.includes('claimsFutureActionWithNoPlan'),
  'Guard found: ' + String(persistGuard)
);

// --- The hedge-word exclusion must survive (honest declines must not be overwritten) ---
check(
  'hedge-word lookbehinds still present in PAST_COMPLETION_CLAIM_PATTERN',
  /\(\?<!may \)\(\?<!might \)\(\?<!could \)\(\?<!can \)/.test(src),
  'Without these, an honest "it may have been archived" decline would itself be overwritten.'
);

console.log(`\nd3_past_completion_gate_not_shortcircuited_by_pending_action: ${pass}/${pass + failures.length} passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
