// PERMANENT DRIFT GUARD — added 2026-09-01 by the independent verifier certifying the
// c9dfab5 Edge Function deploy (qa/KNOWN_FAILURE_MODES.md #61).
//
// WHY THIS FILE EXISTS (a real test-quality defect, not a hypothetical):
// The two regressions guarding this deploy —
//   qa/scenarios-runner/issue5_confirmation_action_type_binding.mjs
//   qa/scenarios-runner/sem_ai_command_past_completion_claim_regex.mjs
// are both DETACHED COPIES of logic that actually lives in
// supabase/functions/sem-ai-command/index.ts. The first re-implements the resolver
// locally; the second copy-pastes the regex and relies on a code comment ("keep this
// byte-identical - copy-paste, don't hand-retype") as its only enforcement.
//
// Consequence: BOTH would still report a green 10/10 and 13/13 even if index.ts were
// reverted to the destructive `actionType || 'archive'` default, or its regex silently
// weakened. A green test that cannot fail when the product regresses is not a
// regression test. This file closes that gap by asserting the invariants against the
// REAL source file on disk.
//
// Defect class guarded: REGRESSION TEST DETACHED FROM THE CODE IT CLAIMS TO GUARD.
//
// Run with: node qa/scenarios-runner/sem_ai_command_source_invariants_drift_guard.mjs
// (pure node - no Deno, no DB, no network, no deploy)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const INDEX = join(repoRoot, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const REGEX_TEST = join(here, 'sem_ai_command_past_completion_claim_regex.mjs');
const BINDING_TEST = join(here, 'issue5_confirmation_action_type_binding.mjs');

const norm = (s) => s.replace(/\r/g, '');
const src = norm(readFileSync(INDEX, 'utf8'));
const regexTest = norm(readFileSync(REGEX_TEST, 'utf8'));
const bindingTest = norm(readFileSync(BINDING_TEST, 'utf8'));

// Live code only: drop whole-line comments so a comment that merely QUOTES the old
// destructive pattern (there are legitimately several, documenting the incident) is not
// mistaken for a live code path.
const liveCode = src
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`OK   ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? ` :: ${detail}` : ''}`); }
};

// --- Invariant 1: the fail-closed resolver exists in the real source ---------------
check(
  'index.ts defines resolveClarificationField()',
  /function resolveClarificationField\s*\(/.test(liveCode),
);
check(
  'resolveClarificationField() fails closed on absent entityType OR actionType',
  /function resolveClarificationField[\s\S]{0,400}?if\s*\(!entityType\s*\|\|\s*!actionType\)\s*return undefined;/.test(liveCode),
);

// --- Invariant 2: NO live destructive default anywhere ------------------------------
// The exact issue #5 class-B defect shape. Comments quoting it are excluded above.
const destructiveDefaults = liveCode
  .split('\n')
  .filter((l) => /actionType\s*\|\|\s*['"]archive['"]/.test(l));
// commandContradictsActionType() is a boolean GUARD, not a field resolver: it can never
// select a mutation field, and with the fail-closed resolver downstream an absent
// actionType results in an LLM fallthrough either way. It is the ONE allowed occurrence.
const disallowed = destructiveDefaults.filter((l) => !/const resolvedActionType\s*=/.test(l));
check(
  'no live code resolves a mutation field via an `actionType || archive` default',
  disallowed.length === 0,
  disallowed.join(' | '),
);
check(
  'the only permitted actionType-default occurrence is the non-mutating guard in commandContradictsActionType()',
  destructiveDefaults.length === disallowed.length + 1 || destructiveDefaults.length === 0,
  `found ${destructiveDefaults.length} live occurrence(s)`,
);

// --- Invariant 3: both deterministic call sites go through the resolver -------------
const callSites = liveCode.split('\n').filter((l) => /resolveClarificationField\(/.test(l) && !/^function /.test(l.trim()));
check(
  'both deterministic call sites (single_entity_clarification + disambiguation) use resolveClarificationField()',
  callSites.length >= 2,
  `found ${callSites.length}`,
);
check(
  'no call site indexes CLARIFICATION_ENTITY_ACTION_FIELD directly anymore',
  liveCode.split('\n').filter((l) => /CLARIFICATION_ENTITY_ACTION_FIELD\s*\[/.test(l)).length === 1,
  'exactly one indexed access is expected: the one inside resolveClarificationField() itself',
);

// --- Invariant 4: the copied regex has not drifted from the real one ----------------
const grab = (text) => {
  const m = text.match(/const PAST_COMPLETION_CLAIM_PATTERN = (.*)/);
  return m ? m[1].trim() : null;
};
const srcRe = grab(src);
const testRe = grab(regexTest);
check('PAST_COMPLETION_CLAIM_PATTERN present in index.ts', !!srcRe);
check('PAST_COMPLETION_CLAIM_PATTERN present in its regression test', !!testRe);
check(
  'PAST_COMPLETION_CLAIM_PATTERN is byte-identical between index.ts and its regression test',
  !!srcRe && srcRe === testRe,
  srcRe === testRe ? '' : `index.ts=${srcRe}\n     test=${testRe}`,
);

// --- Invariant 5: the copied entity/action map has not drifted ----------------------
const grabMap = (text) => {
  // Anchor on the real `const ... = {` DECLARATION. Anchoring loosely on the bare
  // identifier also matches an earlier code COMMENT that mentions the map by name and
  // then runs on to an unrelated closing brace (found the hard way writing this guard).
  const m = text.match(/const CLARIFICATION_ENTITY_ACTION_FIELD[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  // Normalise away TS-only annotations and whitespace so a pure-JS copy compares equal.
  return m[1].replace(/\s+/g, '').replace(/'/g, '"');
};
const srcMap = grabMap(src);
const testMap = grabMap(bindingTest);
check('CLARIFICATION_ENTITY_ACTION_FIELD present in index.ts', !!srcMap);
check('CLARIFICATION_ENTITY_ACTION_FIELD present in the binding regression test', !!testMap);
check(
  'CLARIFICATION_ENTITY_ACTION_FIELD has not drifted between index.ts and its regression test',
  !!srcMap && srcMap === testMap,
  srcMap === testMap ? '' : `index.ts=${srcMap}\n     test=${testMap}`,
);
// The destructive mappings the whole fix exists to prevent reaching by accident.
check(
  'company.archive still maps to archiveCompanyIds (the field the issue #5 repro wrongly reached)',
  /company:\s*\{\s*archive:\s*'archiveCompanyIds'/.test(src),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
