// VACUITY SWEEP, SECOND GENERATION — beyond named regexes.
//
// The first sweep covered named regex guards in two regions and found five untested rules. Verifier #63's
// V63-D4 showed the class is wider than that: three P1 fixes were pinned by substring presence, and none of
// them was a regex. So this sweep neuters the other two kinds of guard the source actually relies on:
//
//   FUNCTIONS  — every named helper in the request path, stubbed to return a constant in both directions.
//                A helper whose answer never matters is either dead or untested.
//   CONSTANTS  — every numeric cap, floor and row limit, moved to 1 and to a very large value. A cap nobody
//                notices moving is a cap nothing depends on, or a cap nothing measures.
//
// index.ts is never modified: every run points the suites at a mutated COPY through SEM_INDEX_SRC, and the
// original's hash is verified at the end.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const DIR = 'qa/verification/scratch/p1/vacuity2';
mkdirSync(DIR, { recursive: true });
const original = readFileSync(SRC);
const originalSha = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');

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
  'qa/scenarios-runner/architecture_collection_envelope_contract.mjs',
  'qa/scenarios-runner/architecture_mutation_envelope_contract.mjs',
  'qa/scenarios-runner/architecture_final_claim_contract.mjs',
  'qa/scenarios-runner/request_gate_inventory_contract.mjs',
  'qa/scenarios-runner/lifecycle_evidence_and_output_persistence_contract.mjs',
  'qa/scenarios-runner/grounding_precedence_canonical_over_history.mjs',
  'qa/scenarios-runner/v92_parity_contract.mjs',
  'qa/scenarios-runner/v92_open_regression_contract.mjs',
];

// ---- FUNCTION HELPERS. Named, single-purpose, inside the request path.
const FUNCTIONS = [
  ['objectRefers', ['() => true', '() => false'], 'arrow'],
  ['headHasObject', ['function headHasObject(clause: string): boolean { void clause; return true; }',
    'function headHasObject(clause: string): boolean { void clause; return false; }'], 'decl'],
  ['imperativeObjectOf', ['(clause: string) => clause', '(clause: string) => { void clause; return null; }'], 'arrow'],
  ['mnIsCommandForm', ['(w: string) => { void w; return true; }', '(w: string) => { void w; return false; }'], 'arrow'],
  ['rpcPostcondition', ['function rpcPostcondition(r: Record<string, unknown>): boolean { void r; return true; }'], 'decl'],
  ['imageBytes', ['function imageBytes(base64: string): number { void base64; return 0; }'], 'decl'],
  ['stripFrames', ['(t: string) => t'], 'arrow'],
];

// ---- NUMERIC CONSTANTS. A cap nobody notices moving is a cap nothing measures.
const CONSTANTS = [
  ['NAMED_LOOKUP_ROW_CAP', ['1', '9999']],
  ['HISTORY_FIELD_CAP', ['1', '9999999']],
  ['IMAGE_BYTES_MAX default', null],
];

const mutants = [];
for (const [name, replacements, kind] of FUNCTIONS) {
  replacements.forEach((rep, i) => {
    mutants.push([`${name} stub #${i + 1}`, (s) => {
      if (kind === 'decl') {
        const start = s.indexOf('function ' + name + '(');
        if (start < 0) return s;
        const end = s.indexOf('\n' + ' '.repeat(s.slice(0, start).length - s.lastIndexOf('\n', start) - 1) + '}', start);
        const close = end < 0 ? s.indexOf('\n}', start) + 2 : end + 2 + (s.slice(0, start).length - s.lastIndexOf('\n', start) - 1);
        return s.slice(0, start) + rep + s.slice(close);
      }
      const at = s.indexOf('const ' + name + ' = ');
      if (at < 0) return s;
      // End the declaration at the first ';' AT BRACE DEPTH ZERO. The first version used a non-greedy
      // [^;]*? and stopped at the first ';' inside a multi-line arrow body, so six of these silently did
      // not apply — a mutator that fails open measures nothing, which is the finding this sweep is about.
      let depth = 0, end = -1;
      for (let i = at; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
        else if (ch === ';' && depth === 0) { end = i + 1; break; }
      }
      if (end < 0) return s;
      return s.slice(0, at) + 'const ' + name + ' = ' + rep + ';' + s.slice(end);
    }]);
  });
}
for (const [name, values] of CONSTANTS) {
  if (!values) continue;
  for (const v of values) {
    mutants.push([`${name} = ${v}`, (s) => {
      const re = new RegExp('(const ' + name + ' = )\\d+(;)');
      const m = re.exec(s);
      return m ? s.slice(0, m.index) + m[1] + v + m[2] + s.slice(m.index + m[0].length) : s;
    }]);
  }
}
// the trim floors, which decide how far degradation goes
mutants.push(['hard trim passes weakened to [2] only', (s) => s.replace('for (const floor of [2, 0]) {', 'for (const floor of [2]) {')]);
mutants.push(['hard trim passes strengthened to [0] only', (s) => s.replace('for (const floor of [2, 0]) {', 'for (const floor of [0]) {')]);
mutants.push(['pack budget reserve removed', (s) => s.replace("envPositiveInt('SEM_AI_MAX_TOKENS', 12000) - 600", "envPositiveInt('SEM_AI_MAX_TOKENS', 12000)")]);
mutants.push(['model context window raised 100x', (s) => s.replace("envPositiveInt('SEM_AI_MODEL_CONTEXT_TOKENS', 180000)", "envPositiveInt('SEM_AI_MODEL_CONTEXT_TOKENS', 18000000)")]);

console.log(`sweeping ${mutants.length} function/constant mutants across ${SUITES.length} suites\n`);
const survived = [];
let killed = 0;
for (const [name, mutate] of mutants) {
  let mutated;
  try { mutated = mutate(text); } catch { mutated = text; }
  if (mutated === text) { survived.push(name + '  [MUTATION DID NOT APPLY]'); console.log('SKIP     ' + name); continue; }
  const file = DIR + '/' + name.replace(/[^A-Za-z0-9_]+/g, '_') + '.ts';
  writeFileSync(file, mutated);
  let killer = null;
  for (const suite of SUITES) {
    try { execFileSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: file }, stdio: 'pipe' }); }
    catch { killer = suite.split('/').pop(); break; }
  }
  if (killer) { killed++; console.log('KILLED   ' + name.padEnd(44) + killer); }
  else { survived.push(name); console.log('SURVIVED ' + name); }
}

const afterSha = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('\ncandidate index.ts unchanged: ' + (afterSha === originalSha) + '  (' + afterSha.slice(0, 12) + ')');
console.log(`vacuity sweep 2: ${killed} killed, ${survived.length} survived`);
for (const s of survived) console.log('  SURVIVED: ' + s);
if (afterSha !== originalSha) process.exit(1);
