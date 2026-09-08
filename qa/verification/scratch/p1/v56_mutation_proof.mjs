#!/usr/bin/env node
// MUTATION PROOF for the verifier #56 closure. Each mutant reverts ONE structural piece of the fix in a
// temporary copy of index.ts and runs verifier #56's own suite (SEM_INDEX_SRC) plus, where relevant, the
// company lifecycle matrix. A mutant that leaves every suite green would mean the piece is not load-bearing
// and the suites are vacuous for it. Runnable with plain node; writes only under qa/verification/scratch/p1.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');

function mustReplace(s, a, b, label) { if (s.split(a).length - 1 !== 1) throw new Error('[MUTATION DID NOT APPLY] mutant anchor not unique: ' + label); return s.replace(a, () => b); }
const MUTANTS = [
  ['m1_polite_question_is_read', (s) => mustReplace(s, `          && !QUESTION_SUPPRESSING_FRAME.test(commandLower);`, `;`, 'polite')],
  ['m2_belt_decides_intent', (s) => mustReplace(s, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary;`, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary ?? ((lexiconVerb !== null) ? { verb: lexiconVerb, field: null } : null);`, 'belt')],
  ['m3_fallback_ignores_other_target', (s) => mustReplace(s, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && `, `const commandFallbackAllowed = commandImperativePosition && `, 'other target')],
  ['m4_fallback_on_questions', (s) => mustReplace(s, ` && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && `, ` && `, 'question gate')],
  ['m5_command_fuzzy_executes', (s) => mustReplace(s, `            if (isCommandGuess && fuzzy && pick.length > 0) { commandGuessDone = true;`, `            if (false) { commandGuessDone = true;`, 'fuzzy asks')],
  ['m6_direction_by_any_verb', (s) => mustReplace(s, `commandFallbackAllowed && headLifecycleAction === 'archive' ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null`, `commandFallbackAllowed && ARCHIVE_VERB_PATTERN.test(String(command || '')) ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null`, 'direction')],
  ['m7_cyrillic_word_boundary', (s) => mustReplace(s, `|(?<!\\p{L})(архивл`, `|\\b(архивл`, 'cyrillic')],
  ['m8_punctuation_not_normalised', (s) => mustReplace(s, `function normaliseName(v: unknown): string { return String(v || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim(); }`, `function normaliseName(v: unknown): string { return String(v || '').toLowerCase().trim(); }`, 'normalise')],
];

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY /
// EXPECTED_MUTATION_TARGETS_FOUND (founder directive 2026-09-08 §4; verifier #65 V65-D4). A proof that
// built no mutants has measured nothing, and "0 killed" must never read as success.
if (MUTANTS.length < 8) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least 8');
  process.exit(2);
}
// The candidate must be byte-identical afterwards: every mutation runs against a COPY handed to the suites
// through SEM_INDEX_SRC, so a changed hash means this tool corrupted the thing it was measuring.
const SHA_BEFORE = createHash('sha256').update(readFileSync(SRC)).digest('hex');
// A mutant that survives is only evidence of vacuity if the suites that OWN the property
// were actually run. These proofs were pinned to the three suites of their own round, so later rounds
// covering the same constructs could not kill anything (verifier #65, V65-D4).
const SUITES = ['qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs', 'qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs', 'qa/scenarios-runner/v64_shared_frames_and_gate_pairs_contract.mjs', 'qa/scenarios-runner/v65_request_frame_tiers_contract.mjs', resolve(ROOT, 'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs'), resolve(ROOT, 'qa/scenarios-runner/company_lifecycle_matrix.mjs'), resolve(ROOT, 'qa/scenarios-runner/architecture_final_claim_contract.mjs')];
let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const path = resolve(OUT, name + '.ts');
  const mutated = mutate(base);
  if (mutated === base) throw new Error('[MUTATION DID NOT APPLY] mutant did not change the source: ' + name);
  writeFileSync(path, mutated);
  const results = SUITES.map((suite) => { const r = spawnSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 240000 }); return r.status; });
  const caught = results.some((st) => st !== 0);
  if (caught) killed++;
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name + '  suite exits=' + JSON.stringify(results));
}

const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
console.log(`\nv56_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (killed !== MUTANTS.length) process.exit(1);
