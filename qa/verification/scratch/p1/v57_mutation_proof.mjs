#!/usr/bin/env node
// MUTATION PROOF for the verifier #57 closure (F1/F2/F3 + D4/D6). Each mutant reverts one piece in a
// temporary copy and runs the #57 suite, the #56 suite and the lifecycle matrix (SEM_INDEX_SRC).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants57');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');
function mustReplace(s, a, b, label) { if (s.split(a).length - 1 !== 1) throw new Error('[MUTATION DID NOT APPLY] mutant anchor not unique: ' + label); return s.replace(a, () => b); }
const MUTANTS = [
  ['m2_entity_type_ignored', (s) => mustReplace(s, ` && (!modelRequestIntent || (modelRequestIntent.kind === 'mutation' && (modelRequestIntentEntity === null || modelRequestIntentEntity === 'company' || modelRequestIntentEntity === 'other')));`, ` && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`, 'F2')],
  ['m3_declarative_lead_executes', (s) => mustReplace(s, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && `, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && `, 'F3')],
  ['m4_whole_name_query_dropped', (s) => mustReplace(s, `for (const r of [...((candidates || []) as CompanyLookupRow[]), ...((wholeRows || []) as CompanyLookupRow[])])`, `for (const r of [...((candidates || []) as CompanyLookupRow[])])`, 'D4')],
  ['m5_polite_question_refused', (s) => mustReplace(s, `          && !QUESTION_SUPPRESSING_FRAME.test(commandLower);`, `;`, 'D6a')],
];

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY /
// EXPECTED_MUTATION_TARGETS_FOUND (founder directive 2026-09-08 §4; verifier #65 V65-D4). A proof that
// built no mutants has measured nothing, and "0 killed" must never read as success.
if (MUTANTS.length < 4) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least 4');
  process.exit(2);
}
// The candidate must be byte-identical afterwards: every mutation runs against a COPY handed to the suites
// through SEM_INDEX_SRC, so a changed hash means this tool corrupted the thing it was measuring.
const SHA_BEFORE = createHash('sha256').update(readFileSync(SRC)).digest('hex');
// A mutant that survives is only evidence of vacuity if the suites that OWN the property
// were actually run. These proofs were pinned to the three suites of their own round, so later rounds
// covering the same constructs could not kill anything (verifier #65, V65-D4).
const SUITES = ['qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs', 'qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs', 'qa/scenarios-runner/v64_shared_frames_and_gate_pairs_contract.mjs', 'qa/scenarios-runner/v65_request_frame_tiers_contract.mjs', 'qa/scenarios-runner/v57_intent_other_veto_contract.mjs', 'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs', 'qa/scenarios-runner/company_lifecycle_matrix.mjs'].map((x) => resolve(ROOT, x));
let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const path = resolve(OUT, name + '.ts');
  const mutated = mutate(base);
  if (mutated === base) throw new Error('[MUTATION DID NOT APPLY] mutant did not change the source: ' + name);
  writeFileSync(path, mutated);
  const results = SUITES.map((suite) => spawnSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 240000 }).status);
  const caught = results.some((st) => st !== 0);
  if (caught) killed++;
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name + '  suite exits=' + JSON.stringify(results));
}

const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
console.log(`\nv57_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (killed !== MUTANTS.length) process.exit(1);
