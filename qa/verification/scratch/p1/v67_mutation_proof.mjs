#!/usr/bin/env node
// MUTATION PROOF for the verifier #67 closure. Each mutant REVERTS one piece of the fix in a temporary
// copy of index.ts and runs the suites that must notice. A mutant that leaves every suite green means the
// piece is not load-bearing and this round's evidence is vacuous for it.
//
// ANCHORS ARE BACKSLASH-FREE ON PURPOSE. The pieces being reverted are regex-building strings full of
// `\\b` and `\\S`, and hand-spelling those through this file plus a shell round-trip lost the backslashes
// three separate times this session. So each mutant names a line by a distinctive substring that contains
// no backslash at all, and edits whole lines. `mustLine` fails closed if the substring is missing or
// matches more than one line.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

/** Replace the ONE line containing `needle`; `edit` receives that line and returns its replacement. */
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
  // The position-free entity-noun reading: the whole of V67-D1.
  ['m1_object_reads_only_token_zero', (s) => mustLine(s,
    "+ '|" + '\\' + "\\b(?:' + ENTITY_NOUN_ALTERNATION + ')", () => null, 'V67-D1 anywhere')],
  // The identifier-anywhere reading was REMOVED from the fix rather than registered: this proof could not
  // kill it, because every case it would catch already carries an entity noun. Nothing left to mutate.
  // An entity NAME read as a sentence — the last piece of V67-D1.
  ['m3_entity_name_read_as_statement', (s) => mustLine(s,
    'STATEMENT_FINITE_VERB.test(rest.replace(ENTITY_NOUN_PHRASE',
    () => '          && !STATEMENT_FINITE_VERB.test(rest);', 'V67-D1 statement')],
  // The receipt naming the entity the founder named — V67-D3.
  ['m4_receipt_says_company_again', (s) => mustLine(s,
    ': commandEntityNoun ? commandEntityNoun.replace(', () => null, 'V67-D3')],
  // The idiom must END the phrase — V67-D2.
  ['m5_idiom_matches_mid_phrase', (s) => mustLine(s,
    'please|now|thanks|already|for me',
    (l) => l.replace(/s\?\(\?=[^/]*?for me\)\\b\)/, 's?\\b'), 'V67-D2')],
  // The receipt's honest reason for a deliberative frame — V67-D4.
  ['m6_deliberative_gets_could_not_resolve', (s) => mustLine(s,
    "REQUEST_FRAME_DELIBERATIVE + ')", () => null, 'V67-D4')],
];

const SUITES = [
  'qa/scenarios-runner/v67_entity_reference_contract.mjs',
  'qa/scenarios-runner/v66_object_shape_tiers_contract.mjs',
  'qa/scenarios-runner/v65_request_frame_tiers_contract.mjs',
  'qa/scenarios-runner/v61_budget_intent_language_contract.mjs',
].map((x) => resolve(ROOT, x));

// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE (founder directive §4).
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
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name.padEnd(38) + ' suite exits=' + JSON.stringify(results));
}

const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
console.log(`\nv67_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
if (killed !== MUTANTS.length) process.exit(1);
