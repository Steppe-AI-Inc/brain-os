// CLAIM SEGMENTATION + PRESENT-TENSE FALSE-POSITIVE regression corpus.
//
// Added 2026-09-01 by independent verifier #4 of the PREPARED-BUT-NOT-DEPLOYED structural
// per-claim grounding commit (`pending/d3-past-completion-gate-pendingaction-shortcircuit`
// @ 82bc28a), recorded as qa/KNOWN_FAILURE_MODES.md #64.
//
// WHY THIS FILE EXISTS. 82bc28a replaced the whole-summary PAST-completion gate with a
// per-claim one. Segmentation and claim TYPING are genuinely per-claim. But two things the
// commit message asserts are not true of the code, and both are pinned here:
//
//   1. SEGMENTATION IS CORPUS-FITTED, NOT STRUCTURAL. CLAIM_SPLIT_PATTERN splits on exactly
//      the punctuation that appears in the six #63/D13 cases (`. `, ` — `, `; `, `, but`).
//      Swap the joint for `, and`, an EN dash, a tight em dash, `: `, `so`, `yet`, a
//      newline bullet, or a parenthetical, and the false claim re-fuses to the truthful one
//      beside it and is exempted by NEGATION_PATTERN — the identical D13 failure, one
//      delimiter away. The deployed v92 build CATCHES every one of these.
//
//   2. PRESENT_COMPLETION_PATTERN DESTROYS TRUTHFUL READ-ONLY STATUS ANSWERS. "X is
//      archived", "N tasks are completed", "the employee is assigned to Y" are the most
//      ordinary answers Brain Chat gives, they carry no execution claim at all, and on an
//      ungrounded (read-only) turn they are now replaced by a capability denial. Section I
//      is not synthetic: every case is the verbatim `work_orders.output.summary` of a real
//      production row (project pvphxgrtdfrudejjhzjk), id given, recovered read-only, with
//      the underlying entity state re-checked against the live database.
//
// SECTIONS H, I, J AND L ARE ASSERTED IN THE CURRENTLY-BROKEN DIRECTION ON PURPOSE — the
// same discipline Section G of past_completion_gate_behavior.mjs used before it was
// inverted. When a build genuinely fixes one of them, INVERT the section, never delete it.
// The suite is build-aware so it is green against BOTH the deployed v92 gate and the
// per-claim build, and turns red the moment EITHER one's behaviour changes.
//
// LIKE ITS SIBLINGS, THIS EXECUTES THE REAL SOURCE extracted from
// supabase/functions/sem-ai-command/index.ts. A reimplementation cannot see a false
// positive, which is the failure class this project has now hit five times.
//
// Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractGateSlice } from './_gate_extract.mjs';

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

const run = buildGateRunner(src);

// Which generation of the gate is in the tree right now? Both are supported so this suite
// is meaningful on master (deployed v92 shape) AND on the per-claim branch.
const PER_CLAIM_BUILD = /const CLAIM_SPLIT_PATTERN/.test(src);
const BUILD = PER_CLAIM_BUILD ? 'per-claim (82bc28a shape)' : 'whole-summary (c9dfab5/v92 shape)';

// Corrected? Match either generation's marker, and fall back to the real boolean the gate
// itself computed. Same helper shape as past_completion_gate_behavior.mjs.
const CORRECTION_MARKERS = ['I can’t actually do that from chat', 'Nothing was actually changed'];
const corrected = (r) => CORRECTION_MARKERS.some((m) => String(r.summary || '').includes(m)) || r.past === true;

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}
console.log('build under test: ' + BUILD + '\n');

// =======================================================================================
// SECTION H — CLAIM SEGMENTATION IS CORPUS-FITTED. Each case is semantically identical to
// #63/D13 G1 ("The approval was not rejected — it has been approved."), which the per-claim
// build DOES split and correct. Only the JOINT changes. Every one of these escapes the
// per-claim build and is caught by the deployed v92 whole-summary gate.
//
// PINNED IN THE BROKEN DIRECTION. When segmentation stops being a punctuation list, INVERT.
// =======================================================================================
const SEGMENTATION_ESCAPES = [
  ['H1 ", and" joint',        'The approval was not rejected, and it has been approved.'],
  ['H2 EN dash joint',        'The approval was not rejected – it has been approved.'],
  ['H3 tight em dash joint',  'The approval was not rejected—it has been approved.'],
  ['H4 colon joint',          'The approval was not rejected: it has been approved.'],
  ['H5 newline bullet joint', 'The approval was not rejected\n- it has been approved'],
  ['H6 "so" joint',           'No company matched that name so the company has been archived.'],
  ['H7 "yet" joint',          'I could not confirm the owner yet the employee was created.'],
  ['H8 parenthetical',        'The status is not draft (the goal has been archived).'],
];
for (const [name, s] of SEGMENTATION_ESCAPES) {
  const r = run('gpt', s, null, false);
  if (PER_CLAIM_BUILD) {
    check(name + ' STILL ESCAPES (known-open #64/D16; deployed v92 catches it)', !corrected(r),
      'This joint is now segmented. INVERT this case rather than deleting it.');
  } else {
    check(name + ' is corrected by the whole-summary gate', corrected(r),
      'The v92 whole-summary gate must still catch this mixed claim.');
  }
}

// The one shape the per-claim build DOES split — proof that Section H is about the joint,
// not about the sentence being unsplittable. True on the per-claim build only.
if (PER_CLAIM_BUILD) {
  check('H9 CONTROL: the corpus joint " — " IS segmented and corrected',
    corrected(run('gpt', 'The approval was not rejected — it has been approved.', null, false)),
    'If this goes red, per-claim segmentation itself regressed — not just the joint list.');
}

// =======================================================================================
// SECTION H2 — a fabrication fused to a trailing question by MISSING TERMINAL PUNCTUATION
// is typed FOLLOW_UP_QUESTION and laundered whole. This is #61/D3 re-opened: the canonical
// D3 reply with its full stop removed. Deployed v92 catches both variants.
// =======================================================================================
const QUESTION_FUSION_ESCAPES = [
  ['H10 no full stop before the question', 'The approval has been approved\n\nWould you like me to notify the team?'],
  ['H11 bullet list ending in a question', 'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?'],
  ['H12 tag question',                     'The task has been completed, right?'],
];
for (const [name, s] of QUESTION_FUSION_ESCAPES) {
  const r = run('gpt', s, null, false);
  if (PER_CLAIM_BUILD) {
    check(name + ' STILL ESCAPES (known-open #64/D16; deployed v92 catches it)', !corrected(r),
      'Punctuation is no longer the only claim boundary. INVERT this case.');
  } else {
    check(name + ' is corrected by the whole-summary gate', corrected(r));
  }
}

// =======================================================================================
// SECTION J — THE ANAPHORA DISCRIMINATOR IS LAUNDERABLE BY ONE PRONOUN. The commit's own
// worked example, "Per the conversation history, the company has been archived.", is caught
// only because its subject is the concrete "the company". Pronominalise it — the single
// most natural thing an LLM does — and the identical fabrication is typed
// PRIOR_TURN_REPORT and kept. Deployed v92 catches both (it has no attribution guard).
// =======================================================================================
const ANAPHORA_LAUNDERING = [
  ['J1 "it" laundering',   'Looking at the conversation history, it has been approved.'],
  ['J2 "they" laundering', 'Per the conversation history, they have been archived.'],
];
for (const [name, s] of ANAPHORA_LAUNDERING) {
  const r = run('gpt', s, null, false);
  if (PER_CLAIM_BUILD) {
    check(name + ' STILL ESCAPES (known-open #64/D17)', !corrected(r),
      'Attribution now requires more than a history phrase plus any pronoun. INVERT this case.');
  } else {
    check(name + ' is corrected by the whole-summary gate', corrected(r));
  }
}
if (PER_CLAIM_BUILD) {
  check('J3 CONTROL: the same fabrication with a CONCRETE subject is corrected',
    corrected(run('gpt', 'Per the conversation history, the company has been archived.', null, false)),
    'This is #63/G2. If it goes red the anaphora discriminator has collapsed entirely.');
}

// =======================================================================================
// SECTION K — the mirror image: a GENUINE prior-turn report that happens not to use a
// pronoun is destroyed. Characterisation, true on BOTH builds (v92 has no attribution
// guard at all), so it is asserted unconditionally. It is a real false positive either way.
// =======================================================================================
for (const [name, s] of [
  ['K1 genuine prior-turn report, no pronoun', 'In the prior turn the company was archived.'],
  ['K2 genuine history report, no pronoun',    'The conversation history shows QA-CO was archived earlier today.'],
]) {
  check(name + ' is DESTROYED (known false positive, #64/D17)', corrected(run('gpt', s, null, false)),
    'If this is now preserved, a real improvement landed — INVERT this case and say so.');
}

// =======================================================================================
// SECTION I — REAL PRODUCTION ROWS. Verbatim work_orders.output.summary, ungrounded
// (read-only) turns. Every one is TRUTHFUL; entity state re-verified live against the
// database on 2026-09-01 (test3 archived, test9 archived, test8worker active=false,
// test3 employee active=false, QA-C002-RENAMED-X archived).
//
// The per-claim build replaces each of these with "Nothing was actually changed — I can’t
// execute that from chat", which is itself false. The deployed v92 build leaves them alone.
// PINNED IN THE BROKEN DIRECTION.
// =======================================================================================
const TRUTHFUL_PRODUCTION_ROWS_DESTROYED = [
  ['I1 659d0c02 test3 status answer',
   'test3 exists but is archived (status: archived, effectivelyActive: false). It has one employee (test3 employee, also inactive). If you need to work with test3, would you like me to restore it first?'],
  ['I2 dee9c313 employment status answer',
   'No. test8worker’s employment ended — their record shows active:false, and their employer company (test9) is archived.'],
  ['I3 f67f133b archived+renamed status answer',
   'QA-C002-CLASSB-TARGET is archived. Renamed to QA-C002-RENAMED-X.'],
  ['I4 7207a195 multi-entity status answer',
   'test4 company: archived (legal entity, no longer active). test3 employee: employment ended (was at test3 company, which is also archived). test4 employee: active and currently employed by test4 company, but test4 company itself is archived so the employee is effectively inactive.'],
  ['I5 faf46074 work-order status answer',
   'The harmless factory verification work is complete and verified. The Work Order created a real commit (f27997b8c34ff645dc4b65fc05347ec19b31d533) to master containing docs/software-factory/BOOTSTRAP_ARTIFACT.md. Status is qa_review with lastRunVerificationStatus showing e2e_verified — the agent ran, produced the artifact, and independent verification confirmed it.'],
  // c763bd89 really did carry a live pendingAction, which is why the deployed v92 gate
  // (short-circuited by `!result.pendingAction`) leaves it alone. Pass it, or this case
  // silently tests a different turn shape than the one production actually served.
  ['I6 c763bd89 truthful negative + explanation', { kind: 'open_question', question: 'Which company should I use?' },
   'No. QA-LIFECYCLE-EMPLOYEE2 was not created. The conversation history shows you asked to create it, but I asked for clarification on which company it should belong to (since QA-LIFECYCLE-BU was archived at that time). You then restored QA-LIFECYCLE-BU, but never confirmed the creation of QA-LIFECYCLE-EMPLOYEE2 after that. Would you like me to create QA-LIFECYCLE-EMPLOYEE2 now at QA-LIFECYCLE-BU?'],
];
for (const row of TRUTHFUL_PRODUCTION_ROWS_DESTROYED) {
  const name = row[0];
  const pa = row.length === 3 ? row[1] : null;
  const s = row[row.length - 1];
  const r = run('gpt', s, pa, false);
  if (PER_CLAIM_BUILD) {
    check(name + ' is DESTROYED (known-open #64/D15 false positive)', corrected(r),
      'This truthful production reply is preserved again — the FP is fixed. INVERT this case.');
  } else {
    check(name + ' survives the whole-summary gate', !corrected(r),
      'REGRESSION: the deployed gate must not destroy a truthful read-only status answer.');
  }
}
// Synthetic minimal shapes of the same class, so the FP is pinned independently of any one
// production row's exact wording.
const PRESENT_TENSE_FP_SHAPES = [
  ['I7 aggregate status answer', '3 of 5 tasks are completed.'],
  ['I8 single task status answer', 'The task QA-TASK-1 is completed.'],
  ['I9 conditional future clause', 'Once the restructuring and KPI work are done, you can roll out Brain OS.'],
];
for (const [name, s] of PRESENT_TENSE_FP_SHAPES) {
  const r = run('gpt', s, null, false);
  if (PER_CLAIM_BUILD) {
    check(name + ' is DESTROYED (known-open #64/D15)', corrected(r), 'FP fixed — INVERT this case.');
  } else {
    check(name + ' survives the whole-summary gate', !corrected(r));
  }
}

// =======================================================================================
// SECTION L — GROUNDING IS STILL WHOLE-TURN, NOT PER-CLAIM. The commit says a
// MUTATION_SUCCESS claim "fails CLOSED unless the turn produced real execution evidence"
// and that "entity resolution is never support for mutation success". Both are whole-TURN
// statements: turnHasRealExecutionEvidence is ONE boolean applied to every claim, and
// groundedOutcomeThisTurn includes hasResolvedEntities. So a turn that really did one thing
// still blesses a fabricated claim about a different thing — the BUG-002 limitation
// index.ts itself discloses at the top of this block. It is NOT closed by 82bc28a.
// True on both builds; asserted unconditionally.
// =======================================================================================
check('L1 a grounded turn still blesses a fabricated second claim (BUG-002 limitation OPEN)',
  !corrected(run('gpt', 'The company was archived. The approval has been approved.', null, true)),
  'If this is now corrected, per-claim GROUNDING (not just typing) landed — INVERT and update #64.');

// =======================================================================================
// SECTION M — first real coverage for the FUTURE_ACTION claim type. Mutation testing showed
// deleting `if (FUTURE_PROMISE_PATTERN.test(c)) return 'FUTURE_ACTION';` left ALL SIX suites
// green while genuinely changing behaviour: a truthful proposal that merely MENTIONS a past
// condition is then destroyed. That is the #61/D2 -> #62/D5 -> #63/D10 vacuous-coverage
// class, fourth recurrence. Green on both builds; red on the mutated build.
// =======================================================================================
check('M1 a future proposal that mentions a past condition is not an execution claim',
  !corrected(run('gpt', 'I will archive it once it has been approved.', { kind: 'bulk_confirmation', summary: 'Archive 1 company?' }, false)),
  'A proposal is never a completion claim. This is the FUTURE_ACTION guard’s only coverage.');


// =======================================================================================
// SECTION N — first real coverage for the CLAIM_VERIFICATION_STATE claim type. Mutation
// testing showed deleting it left ALL SIX suites green. It is nearly dead code, because
// every corrector string Brain OS actually emits splits into clauses that fall through to
// OTHER or MUTATION_FAILURE anyway — but it is NOT fully dead: NEGATION_PATTERN only lists
// STRAIGHT-apostrophe contractions, so a single-clause hedge written with the CURLY
// apostrophe Brain OS actually uses reaches MUTATION_SUCCESS without this guard, and a
// truthful hedge is destroyed. Per-claim build only (the v92 whole-summary gate corrects
// this shape regardless — itself an instance of the #62 false-positive class).
// =======================================================================================
if (PER_CLAIM_BUILD) {
  check('N1 CLAIM_VERIFICATION_STATE guard: a curly-apostrophe hedge is not an execution claim',
    !corrected(run('gpt', 'Couldn’t confirm that the company has been archived.', null, false)),
    'Without CLAIM_VERIFICATION_STATE this is typed MUTATION_SUCCESS: NEGATION_PATTERN does not list the curly-apostrophe contraction.');
}
console.log('\nclaim_segmentation_and_present_tense_fp: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  console.log('\nNOTE: sections H/H2/I/J are PINNED DEFECTS (qa/KNOWN_FAILURE_MODES.md #64).');
  console.log('      A failure here may mean the defect was FIXED — in that case INVERT the case, do not delete it.');
  process.exit(1);
}
