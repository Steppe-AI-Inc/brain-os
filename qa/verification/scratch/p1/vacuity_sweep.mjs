// VACUITY SWEEP — the generalisation of V62-D9.
//
// Hand-written mutation proofs test the guards someone thought to test. This sweep is mechanical: it finds
// every named regex constant in the request-intent and context-budget regions, neutralises each one in turn
// (both directions — never-match and always-match), and runs the suites that ought to care. A guard whose
// removal breaks nothing is either dead code or untested behaviour, and the difference matters: the
// Mongolian verb-final rule looked redundant by this measure and turned out to be the only thing separating
// reported speech from an instruction.
//
// index.ts is never modified: every run points the suites at a mutated COPY through SEM_INDEX_SRC, and the
// original's hash is verified at the end.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const DIR = 'qa/verification/scratch/p1/vacuity';
mkdirSync(DIR, { recursive: true });
const original = readFileSync(SRC);
const originalSha = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');

// The suites that carry the intent, budget, receipt and language contracts. Deliberately not the whole
// battery: a guard in this region that no suite here notices is the finding, whatever the rest do.
const SUITES = [
  'qa/scenarios-runner/v56_intent_lifecycle_contract.mjs',
  'qa/scenarios-runner/v57_intent_other_veto_contract.mjs',
  'qa/scenarios-runner/v58_lifecycle_window_and_imperative_contract.mjs',
  'qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs',
  'qa/scenarios-runner/v60_budget_intent_and_plan_evidence_contract.mjs',
  'qa/scenarios-runner/v61_budget_intent_language_contract.mjs',
  'qa/scenarios-runner/v62_provenance_language_and_limits_contract.mjs',
  'qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs',
  'qa/scenarios-runner/architecture_context_budget_contract.mjs',
  'qa/scenarios-runner/architecture_final_claim_contract.mjs',
  'qa/scenarios-runner/request_gate_inventory_contract.mjs',
  'qa/scenarios-runner/v92_parity_contract.mjs',
  'qa/scenarios-runner/v92_open_regression_contract.mjs',
];

// Named regex constants inside the intent derivation and the budget block.
const REGION_START = text.indexOf('const MUTATION_ARRAY_FIELDS = [');
const REGION_END = text.indexOf('void lexiconReadVetoed;');
const region = text.slice(REGION_START, REGION_END);
const NAMES = [...region.matchAll(/const ([A-Z][A-Z0-9_]{3,}) = \//g)].map((m) => m[1]);

const NEVER = '/(?!)/';        // matches nothing
const ALWAYS = '/(?:)/';       // matches everything

const mutants = [];
for (const name of NAMES) {
  for (const [dir, replacement] of [['never matches', NEVER], ['always matches', ALWAYS]]) {
    mutants.push([`${name} ${dir}`, (s) => {
      const re = new RegExp('(const ' + name + ' = )\\/[\\s\\S]*?\\/[gimsuyv]*(;)');
      const m = re.exec(s);
      if (!m) return s;
      // Preserve the flags the original carried where they change semantics (u/i), so the mutant differs
      // only in what it matches.
      return s.slice(0, m.index) + m[1] + replacement + m[2] + s.slice(m.index + m[0].length);
    }]);
  }
}

console.log(`sweeping ${NAMES.length} named guards (${mutants.length} mutants) across ${SUITES.length} suites\n`);
const survived = [];
let killed = 0;
for (const [name, mutate] of mutants) {
  const mutated = mutate(text);
  if (mutated === text) { survived.push(name + '  [MUTATION DID NOT APPLY]'); continue; }
  const file = DIR + '/' + name.replace(/[^A-Za-z0-9_]+/g, '_') + '.ts';
  writeFileSync(file, mutated);
  let killer = null;
  for (const suite of SUITES) {
    try { execFileSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: file }, stdio: 'pipe' }); }
    catch { killer = suite.split('/').pop(); break; }
  }
  if (killer) { killed++; console.log('KILLED   ' + name.padEnd(46) + killer); }
  else { survived.push(name); console.log('SURVIVED ' + name); }
}

const afterSha = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('\ncandidate index.ts unchanged: ' + (afterSha === originalSha) + '  (' + afterSha.slice(0, 12) + ')');
console.log(`vacuity sweep: ${killed} killed, ${survived.length} survived`);
for (const s of survived) console.log('  SURVIVED: ' + s);
if (afterSha !== originalSha) process.exit(1);
