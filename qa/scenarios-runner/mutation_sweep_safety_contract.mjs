#!/usr/bin/env node
// MUTATION / VACUITY SWEEP SAFETY — permanent regressions, founder directive 2026-09-08 §4.
//
//   MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE
//   VACUITY_SWEEP_CANNOT_PASS_EMPTY
//   EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE
//
// WHY. Verifier #64 (V64-D0) found that both vacuity sweeps FAILED OPEN: `text.indexOf(marker)` returning
// -1 produced an empty guard list and a cheerful "0 killed, 0 survived" — a tool that measured nothing while
// reporting success. That is the same shape as the slice markers ledger #138 fixed and the assertions
// ledger #138b fixed: a check whose failure mode is "match nothing and pass".
//
// The rule this pins: ANY sweep, proof or extractor that intends to mutate N sites must assert N > 0 BEFORE
// it evaluates kill/survival, and must exit non-zero when it cannot find its targets. A harness that cannot
// find the thing it is testing has failed; it has not passed.
//
// This suite reads the sweep scripts themselves. It is deliberately about the TOOLS, because the tools are
// what the deploy decision rests on.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

// Every sweep / mutation-proof tool the deploy decision depends on.
// EVERY sweep the deploy decision rests on, not a subset. The four added here sat outside the contract for
// a whole round, and the cost was exactly what the contract exists to prevent: vacuity_sweep_extended
// reported 33 survivors and exited 0, while v56 and v57 threw on their first stale anchor and measured
// nothing at all — all three still cited as evidence (verifier #65, V65-D4).
const TOOLS = [
  'qa/verification/scratch/p1/vacuity_sweep.mjs',
  'qa/verification/scratch/p1/vacuity_sweep2.mjs',
  'qa/verification/scratch/p1/mutation_proof_v60_v61.mjs',
  'qa/verification/scratch/p1/vacuity_sweep_extended.mjs',
  'qa/verification/scratch/p1/v56_mutation_proof.mjs',
  'qa/verification/scratch/p1/v57_mutation_proof.mjs',
  'qa/verification/scratch/p1/v58_mutation_proof.mjs',
  'qa/verification/scratch/p1/v66_mutation_proof.mjs',
];

for (const rel of TOOLS) {
  const p = resolve(ROOT, rel);
  const name = rel.split('/').pop();
  if (!existsSync(p)) { check('sweep tool present: ' + name, false, 'a tool the deploy decision rests on is missing'); continue; }
  const src = readFileSync(p, 'utf8');

  // MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY:
  // the tool must refuse to report a result when it built no mutants.
  const guardsEmpty = /mutants\.length\s*<\s*\d+/.test(src) || /MUTANTS\.length\s*<\s*\d+/.test(src);
  const exitsNonZero = /process\.exit\((?:1|2)\)/.test(src);

  // A SURVIVOR MUST ALSO EXIT NON-ZERO, and this contract could not see that it did not: it grepped for
  // ANY `process.exit(1)` and both vacuity sweeps had one — gated purely on a sha mismatch, so a run with
  // 33 survivors reported them and exited 0 (verifier #66, V66-D3). The exit condition must name the
  // survivor count, not merely exist somewhere in the file.
  // Two equivalent spellings are accepted, because both really are gated on the survivor relationship:
  // an explicit `survived.length > 0`, or `killed !== MUTANTS.length` (every mutant killed, or exit).
  // What is NOT accepted is an exit gated only on a sha mismatch, which is what let 33 survivors pass.
  const exitsOnSurvivors = /(?:survived|survivors)(?:\.length)?\s*(?:>\s*0\s*)?\)?[^\n]{0,120}process\.exit\(/i.test(src)
    || /if\s*\([^\n]*(?:survived|survivors)[^\n]*\)\s*\{[^}]{0,200}process\.exit\(/i.test(src)
    || /killed\s*!==?\s*(?:MUTANTS|mutants)\.length[^\n]{0,80}process\.exit\(/i.test(src);
  check(name + ': A SURVIVOR EXITS NON-ZERO — a mutant nothing caught is a finding, not a pass',
    exitsOnSurvivors,
    'the exit condition must be gated on the survivor count; a sha-mismatch-only exit reports survivors '
    + 'and returns 0, which is the fail-open shape this contract exists to prevent');

  // THE FLOOR'S VALUE, NOT ONLY ITS EXISTENCE. Pinning that a floor exists lets it be lowered to match
  // whatever survived a refactor: v57 went 5 mutants to 4 with its floor edited down, green throughout,
  // and the ratchet could not tell "superseded on purpose" from "quietly dropped" (verifier #66, V66-D3).
  // These values are the recorded floors. Raising one is free; LOWERING one has to be a deliberate edit
  // here, with a reason, which is exactly the conversation that did not happen last time.
  const RECORDED_FLOOR = {
    'vacuity_sweep.mjs': 10, 'vacuity_sweep2.mjs': 10, 'mutation_proof_v60_v61.mjs': 5,
    'vacuity_sweep_extended.mjs': 120, 'v56_mutation_proof.mjs': 8,
    // v57 is 4 because m1_other_does_not_veto was RETIRED with a written reason: the construct it reverted
    // was deliberately deleted by a later closure, so there is nothing left to mutate (ledger #143).
    'v57_mutation_proof.mjs': 4, 'v58_mutation_proof.mjs': 5, 'v66_mutation_proof.mjs': 5,
  };
  const floorMatch = src.match(/(?:mutants|MUTANTS)\.length\s*<\s*(\d+)/);
  const floor = floorMatch ? Number(floorMatch[1]) : 0;
  check(name + ': the mutant floor has not been lowered below its recorded value',
    name in RECORDED_FLOOR && floor >= RECORDED_FLOOR[name],
    'floor is ' + floor + ', recorded ' + (RECORDED_FLOOR[name] ?? '(unregistered tool)')
    + ' — a floor edited down to match a shrunken mutant list hides exactly what it should report');

  // MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY (continued):
  check(name + ': MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE — an empty mutant list aborts, it does not pass',
    guardsEmpty && exitsNonZero,
    'guardsEmptyList=' + guardsEmpty + ' exitsNonZero=' + exitsNonZero
    + ' — indexOf returning -1 must not yield "0 killed, 0 survived" (verifier #64, V64-D0)');

  // EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: a mutation that did not apply is reported, never counted as a
  // kill. Both sweeps do this by pushing a "[MUTATION DID NOT APPLY]" survivor rather than skipping.
  check(name + ': EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE — a mutation that did not apply is surfaced',
    /MUTATION DID NOT APPLY/.test(src),
    'a mutant whose anchor is gone must be reported, not silently treated as killed');

  // The candidate under test must be byte-identical after the run: a sweep that leaves the source mutated
  // would poison every later measurement in the session.
  check(name + ': the candidate is verified byte-identical after the run',
    /candidate index\.ts unchanged/.test(src) && /createHash\('sha256'\)/.test(src),
    'every mutation runs against a COPY through SEM_INDEX_SRC; the original hash is checked at the end');
}

// The same rule for the extractor the suites share: a window it cannot find must throw, never return empty.
{
  const p = resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs');
  const src = readFileSync(p, 'utf8');
  check('_gate_extract: a shared constant a window reads must be found or throw',
    /throw new Error\(name \+ ' is read by this window but was not found in the source under test'\)/.test(src),
    'returning the slice unchanged would leave a ReferenceError far from the cause, or worse, a silent pass');
  check('_gate_extract: a missing hoistable helper throws rather than being skipped',
    /throw new Error\(name \+ ' not found in the source under test'\)/.test(src));
}

console.log(`\nmutation_sweep_safety_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
