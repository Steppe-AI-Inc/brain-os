#!/usr/bin/env node
// MUTATION PROOF for the verifier #56 closure. Each mutant reverts ONE structural piece of the fix in a
// temporary copy of index.ts and runs verifier #56's own suite (SEM_INDEX_SRC) plus, where relevant, the
// company lifecycle matrix. A mutant that leaves every suite green would mean the piece is not load-bearing
// and the suites are vacuous for it. Runnable with plain node; writes only under qa/verification/scratch/p1.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');

function mustReplace(s, a, b, label) { if (s.split(a).length - 1 !== 1) throw new Error('mutant anchor not unique: ' + label); return s.replace(a, () => b); }
const MUTANTS = [
  ['m1_polite_question_is_read', (s) => mustReplace(s, ` && !POLITE_REQUEST.test(commandText);`, `;`, 'polite')],
  ['m2_belt_decides_intent', (s) => mustReplace(s, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary;`, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary ?? ((lexiconVerb !== null) ? { verb: lexiconVerb, field: null } : null);`, 'belt')],
  ['m3_fallback_ignores_other_target', (s) => mustReplace(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && `, `const commandFallbackAllowed = `, 'other target')],
  ['m4_fallback_on_questions', (s) => mustReplace(s, ` && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `, ` && `, 'question gate')],
  ['m5_command_fuzzy_executes', (s) => mustReplace(s, `            if (isCommandGuess && fuzzy && pick.length > 0) { commandGuessDone = true;`, `            if (false) { commandGuessDone = true;`, 'fuzzy asks')],
  ['m6_direction_by_any_verb', (s) => mustReplace(s, `commandFallbackAllowed && headLifecycleAction === 'archive' ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null`, `commandFallbackAllowed && ARCHIVE_VERB_PATTERN.test(String(command || '')) ? lifecycleCommandName(ARCHIVE_VERB_PATTERN) : null`, 'direction')],
  ['m7_cyrillic_word_boundary', (s) => mustReplace(s, `|(?<!\\p{L})(архивл`, `|\\b(архивл`, 'cyrillic')],
  ['m8_punctuation_not_normalised', (s) => mustReplace(s, `function normaliseName(v: unknown): string { return String(v || '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim(); }`, `function normaliseName(v: unknown): string { return String(v || '').toLowerCase().trim(); }`, 'normalise')],
];
const SUITES = [resolve(ROOT, 'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs'), resolve(ROOT, 'qa/scenarios-runner/company_lifecycle_matrix.mjs'), resolve(ROOT, 'qa/scenarios-runner/architecture_final_claim_contract.mjs')];
let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const path = resolve(OUT, name + '.ts');
  const mutated = mutate(base);
  if (mutated === base) throw new Error('mutant did not change the source: ' + name);
  writeFileSync(path, mutated);
  const results = SUITES.map((suite) => { const r = spawnSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 240000 }); return r.status; });
  const caught = results.some((st) => st !== 0);
  if (caught) killed++;
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name + '  suite exits=' + JSON.stringify(results));
}
console.log(`\nv56_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
process.exit(killed === MUTANTS.length ? 0 : 1);
