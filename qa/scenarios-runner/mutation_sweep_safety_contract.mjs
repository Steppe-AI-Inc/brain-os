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
