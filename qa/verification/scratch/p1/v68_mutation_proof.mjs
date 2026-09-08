#!/usr/bin/env node
// MUTATION PROOF for the verifier #68 closure. Each mutant REVERTS one piece of the fix in a temporary
// copy of index.ts and runs the suites that must notice.
//
// Anchors are located by BACKSLASH-FREE substrings and edited whole-line: hand-spelled `\b`/`\S` anchors
// lost their backslashes through a shell round-trip several times this campaign (ledger #148).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function mustLine(s, needle, edit, label) {
  const lines = s.split('\n');
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => l.includes(needle));
  if (hits.length !== 1) throw new Error('[MUTATION DID NOT APPLY] ' + label + ': ' + hits.length + ' lines match ' + JSON.stringify(needle));
  const [line, at] = hits[0];
  const next = edit(line);
  if (next === line) throw new Error('[MUTATION DID NOT APPLY] ' + label + ': edit was a no-op');
  if (next === null) lines.splice(at, 1); else lines[at] = next;
  return lines.join('\n');
}

const MUTANTS = [
  // V68-D2 — the position rule. Reverting it to position-free restores the truth regression that
  // destroyed 8 of 8 truthful reads.
  ['m1_entity_noun_matches_anywhere_again', (s) => mustLine(s,
    "{0,1}(?:' + ENTITY_NOUN_ALTERNATION",
    () => "          + '|" + '\\' + "\\b(?:' + ENTITY_NOUN_ALTERNATION + ')" + '\\' + "\\b'", 'V68-D2')],
  // V68-D1 — the shared vocabulary in the multi-clause tier.
  ['m2_strong_object_respells_the_vocabulary', (s) => mustLine(s,
    "|it|them|' + ENTITY_NOUN_ALTERNATION + ')",
    (l) => l.replace("' + ENTITY_NOUN_ALTERNATION + '", 'compan(?:y|ies)|person|task|goal|project|department'), 'V68-D1')],
  // V68-D4b — a purchase order reported as a work order.
  ['m3_purchase_order_becomes_work_order', (s) => mustLine(s,
    "commandEntityNoun === 'order' ? 'work order'",
    () => "            : /^(work order|purchase order|order)$/.test(commandEntityNoun) ? 'work order'", 'V68-D4b')],
  // V68-D4a — "persons".
  ['m4_naive_pluralisation', (s) => mustLine(s, 'pluraliseEntity(entity)',
    (l) => l.replace('pluraliseEntity(entity)', "entity === 'company' ? 'companies' : entity + 's'"), 'V68-D4a')],
  // V68-D3 — the ratchet stops guarding the converged concept.
  ['m5_ratchet_forgets_entity_nouns', (s) => s]   // handled below: this one mutates a SUITE, not the source
];

// The ratchet mutant edits the harness, so it is run separately against the suite that pins it.
MUTANTS.pop();

const SUITES = [
  'qa/scenarios-runner/v68_clause_and_vocabulary_contract.mjs',
  'qa/scenarios-runner/v67_entity_reference_contract.mjs',
  'qa/scenarios-runner/v66_object_shape_tiers_contract.mjs',
  'qa/scenarios-runner/v61_budget_intent_language_contract.mjs',
].map((x) => resolve(ROOT, x));

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE (founder directive §4).
if (MUTANTS.length < 4) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least 4');
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
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name.padEnd(40) + ' suite exits=' + JSON.stringify(results));
}

const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
console.log(`\nv68_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
if (killed !== MUTANTS.length) process.exit(1);
