#!/usr/bin/env node
// MUTATION PROOF for the verifier #58 closure (F1 imperative-position allow-list, F2 archivedTasks in the pack +
// task/goal server-side re-read, F3 entity-aware receipt). Each mutant reverts one piece in a temporary copy and
// runs the #58 suite, the #57 suite and the lifecycle matrix via SEM_INDEX_SRC.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants58');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');
function mustReplace(s, a, b, label) { if (s.split(a).length - 1 !== 1) throw new Error('[MUTATION DID NOT APPLY] mutant anchor not unique: ' + label); return s.replace(a, () => b); }
const MUTANTS = [
  ['m1_allow_list_dropped', (s) => mustReplace(s, `const commandFallbackAllowed = commandImperativePosition && `, `const commandFallbackAllowed = `, 'F1')],
  ['m2_archivedTasks_not_in_pack', (s) => mustReplace(s, `archivedTasks:archivedTasks.data||[], pendingAction, recentlyResolvedEntities,`, `pendingAction, recentlyResolvedEntities,`, 'F2a')],
  ['m3_task_ids_window_gated', (s) => mustReplace(s, `const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && taskLifecycleById.has(id)))];`, `const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && contextArchivedTaskIds.has(id)))];`, 'F2b')],
  ['m5_goal_ids_window_gated', (s) => mustReplace(s, "const restoreGoalIds = [...new Set(requestedRestoreGoalIds.filter((id): id is string => typeof id === 'string' && goalLifecycleById.has(id)))];", "const restoreGoalIds = [...new Set(requestedRestoreGoalIds.filter((id): id is string => typeof id === 'string' && contextGoalIds.has(id)))];", 'F2 goal')],
  ['m6_receipt_always_company', (s) => mustReplace(s, 'I could not resolve which ${entity} you meant', 'I could not resolve which company you meant', 'F3')],
  ['m4_task_unresolved_silent', (s) => mustReplace(s, `        for (const id of requestedTaskLifecycleIds) if (!taskLifecycleById.has(id)) taskArchiveRestoreLines.push(`, `        for (const id of []) if (!taskLifecycleById.has(id)) taskArchiveRestoreLines.push(`, 'F2c')],
];

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY /
// EXPECTED_MUTATION_TARGETS_FOUND (founder directive 2026-09-08 §4; verifier #65 V65-D4). A proof that
// built no mutants has measured nothing, and "0 killed" must never read as success.
if (MUTANTS.length < 5) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least 5');
  process.exit(2);
}
// The candidate must be byte-identical afterwards: every mutation runs against a COPY handed to the suites
// through SEM_INDEX_SRC, so a changed hash means this tool corrupted the thing it was measuring.
const SHA_BEFORE = createHash('sha256').update(readFileSync(SRC)).digest('hex');
const SUITES = ['qa/scenarios-runner/v58_lifecycle_window_and_imperative_contract.mjs', 'qa/scenarios-runner/v57_intent_other_veto_contract.mjs', 'qa/scenarios-runner/company_lifecycle_matrix.mjs', 'qa/scenarios-runner/architecture_lifecycle_rpc_only_contract.mjs'].map((x) => resolve(ROOT, x));
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
console.log(`\nv58_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (killed !== MUTANTS.length) process.exit(1);
