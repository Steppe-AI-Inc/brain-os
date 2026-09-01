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
function gateBody(constName) {
  const start = src.indexOf('const ' + constName + ' =');
  if (start === -1) return null;
  const end = src.indexOf(';', src.indexOf('.test(', start));
  return end === -1 ? null : src.slice(start, end + 1);
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
check(
  'PAST gate still requires !groundedOutcomeThisTurn',
  !!pastGate && /!groundedOutcomeThisTurn/.test(pastGate)
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
const correctionBlock = (() => {
  const i = src.indexOf('if (claimsPastCompletionWithNoGrounding)');
  return i === -1 ? '' : src.slice(i, i + 1600);
})();
check(
  'correction preserves a real pending prompt instead of destroying it',
  /pendingPrompt/.test(correctionBlock) && /result\.summary\s*=\s*pendingPrompt\s*\?/.test(correctionBlock),
  'Now that the gate can fire on a turn WITH a pendingAction, blindly overwriting result.summary would leave a live pendingAction with no visible question. The correction must re-attach pendingAction.question/summary.'
);
check(
  'correction still states plainly that nothing was changed',
  /nothing was changed/.test(correctionBlock)
);

// --- The corrected turn must still be persisted (KNOWN_FAILURE_MODES #35 class) ---
check(
  'corrected output is still persisted (claimsPastCompletionWithNoGrounding in the persist condition)',
  new RegExp('if \\([^)]*claimsPastCompletionWithNoGrounding[^)]*\\)').test(src.replace(/\n/g, ' ')),
  'Incident #35: a corrective left out of the work_orders.output persist condition means the UNCORRECTED fabrication persists forever.'
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
