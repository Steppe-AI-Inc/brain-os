#!/usr/bin/env node
// MUTATION PROOF for the verifier #57 closure (F1/F2/F3 + D4/D6). Each mutant reverts one piece in a
// temporary copy and runs the #57 suite, the #56 suite and the lifecycle matrix (SEM_INDEX_SRC).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants57');
mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');
function mustReplace(s, a, b, label) { if (s.split(a).length - 1 !== 1) throw new Error('mutant anchor not unique: ' + label); return s.replace(a, () => b); }
const MUTANTS = [
  ['m1_other_does_not_veto', (s) => mustReplace(s, `modelIntentKind === 'read' || modelIntentKind === 'other');`, `modelIntentKind === 'read');`, 'F1')],
  ['m2_entity_type_ignored', (s) => mustReplace(s, ` && (!modelRequestIntent || (modelRequestIntent.kind === 'mutation' && (modelRequestIntentEntity === null || modelRequestIntentEntity === 'company' || modelRequestIntentEntity === 'other')));`, ` && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`, 'F2')],
  ['m3_declarative_lead_executes', (s) => mustReplace(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && `, 'F3')],
  ['m4_whole_name_query_dropped', (s) => mustReplace(s, `for (const r of [...((candidates || []) as CompanyLookupRow[]), ...((wholeRows || []) as CompanyLookupRow[])])`, `for (const r of [...((candidates || []) as CompanyLookupRow[])])`, 'D4')],
  ['m5_polite_question_refused', (s) => mustReplace(s, `          && !/^\\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|please)\\b/.test(commandLower);`, `;`, 'D6a')],
];
const SUITES = ['qa/scenarios-runner/v57_intent_other_veto_contract.mjs', 'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs', 'qa/scenarios-runner/company_lifecycle_matrix.mjs'].map((x) => resolve(ROOT, x));
let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const path = resolve(OUT, name + '.ts');
  const mutated = mutate(base);
  if (mutated === base) throw new Error('mutant did not change the source: ' + name);
  writeFileSync(path, mutated);
  const results = SUITES.map((suite) => spawnSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 240000 }).status);
  const caught = results.some((st) => st !== 0);
  if (caught) killed++;
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name + '  suite exits=' + JSON.stringify(results));
}
console.log(`\nv57_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
process.exit(killed === MUTANTS.length ? 0 : 1);
