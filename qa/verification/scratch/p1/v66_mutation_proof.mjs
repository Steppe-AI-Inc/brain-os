#!/usr/bin/env node
// MUTATION PROOF for the verifier #66 closure. Each mutant REVERTS one piece of the fix in a temporary
// copy of index.ts and runs the suites that are supposed to notice. A mutant that leaves every suite green
// means the piece is not load-bearing and the round's evidence is vacuous for it.
//
// Runnable with plain node; writes only under qa/verification/scratch/p1/mutants.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
// The source is CRLF; the multi-line anchors below are written LF, so normalise for matching and restore
// CRLF when the mutant is written. A mutant with different line endings would be a second variable.
const base = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function mustReplace(s, a, b, label) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('[MUTATION DID NOT APPLY] anchor x' + n + ': ' + label);
  return s.replace(a, () => b);
}

const MUTANTS = [
  // F2 — the structural repair itself. Reverting it restores the two-spellings arrangement that let the
  // executor archive rows the receipt tier could not see.
  ['m1_executor_outcome_never_computed', (s) => mustReplace(s,
    `            ? (archiveCompanyIds.length > 0 ? 'archive' : restoreCompanyIds.length > 0 ? 'restore' : null)`,
    '            ? null', 'F2 declaration')],
  ['m2_no_fallback_branch', (s) => mustReplace(s,
    `                : commandFallbackResolvedVerb !== null
                  ? { verb: commandFallbackResolvedVerb, field: null }
                  : null;`, '                : null;', 'F2 branch')],
  // F1 — the object test's boundary, which could not match after a closing quote.
  ['m3_strong_object_word_boundary', (s) => mustReplace(s,
    '|assignment|employment)(?![A-Za-z0-9_])/;', '|assignment|employment)\\b/;', 'F1')],
  // F4 — the AUTHORIZED IS NOT COMPLETED net.
  ['m4_authorised_net_narrowed', (s) => mustReplace(s,
    `if ((model === 'deterministic-confirmation' || model === 'deterministic-clarification'
          || model === 'deterministic-disambiguation') && !groundedOutcomeThisTurn) {`,
    `if (model === 'deterministic-confirmation' && !groundedOutcomeThisTurn) {`, 'F4')],
  // The asymmetry ruling — modal interrogatives back to DIRECTIVE, i.e. executing again.
  ['m5_modal_interrogatives_execute_again', (s) => mustReplace(s,
    '  + "|could we|can we|shall we|shall i"\n', '', 'asymmetry')],
];

const SUITES = [
  'qa/scenarios-runner/v66_object_shape_tiers_contract.mjs',
  'qa/scenarios-runner/v65_request_frame_tiers_contract.mjs',
  'qa/scenarios-runner/structured_claim_laundering_contract.mjs',
  'qa/scenarios-runner/architecture_final_claim_contract.mjs',
].map((x) => resolve(ROOT, x));

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE (founder directive §4): a proof that built no mutants has
// measured nothing, and "0 killed" must never read as success.
if (MUTANTS.length < 5) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least 5');
  process.exit(2);
}
const SHA_BEFORE = createHash('sha256').update(readFileSync(SRC)).digest('hex');

let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const path = resolve(OUT, name + '.ts');
  const mutated = mutate(base);
  if (mutated === base) throw new Error('[MUTATION DID NOT APPLY] mutant did not change the source: ' + name);
  writeFileSync(path, mutated.replace(/\n/g, '\r\n'));
  const results = SUITES.map((suite) => spawnSync(process.execPath, [suite],
    { env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 300000 }).status);
  const caught = results.some((st) => st !== 0);
  if (caught) killed++;
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name.padEnd(44) + ' suite exits=' + JSON.stringify(results));
}

// The candidate must be byte-identical afterwards: every mutation runs against a COPY handed to the suites
// through SEM_INDEX_SRC, so a changed hash means this tool corrupted the thing it was measuring.
const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
console.log(`\nv66_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
if (killed !== MUTANTS.length) process.exit(1);
