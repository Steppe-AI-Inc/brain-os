// MUTATION PROOF for the verifier #69 closure and the confirmed Codex findings A and C.
//
// Each mutant reintroduces ONE defect into a COPY of index.ts; the named suite must FAIL on it. A surviving
// mutant means the suite asserts nothing about that path — the vacuity class this campaign has logged
// repeatedly. The candidate's own file is never modified: every run points the suite at the mutated copy via
// SEM_INDEX_SRC, and the sha256 is asserted around the whole run.
//
// MUTATION_SWEEP_MUST_FAIL_ON_ZERO_TARGETS: a mutant whose anchor no longer exists is reported as a
// SURVIVOR, never silently skipped. A sweep that finds nothing to mutate is a broken sweep, not a clean one.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const V69 = 'qa/scenarios-runner/v69_shape_vocabulary_and_boundary_contract.mjs';
const CODEX = 'qa/scenarios-runner/codex_release_blocker_witnesses.mjs';
const V61 = 'qa/scenarios-runner/v61_budget_intent_language_contract.mjs';
const DIR = 'qa/verification/scratch/p1/v69-codex-mutants';
mkdirSync(DIR, { recursive: true });
const original = readFileSync(SRC);
const originalSha = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8').replace(/\r\n/g, '\n');

const MUTANTS = [
  // ── verifier #69: the boundary, both directions ────────────────────────────────────────────
  ['M1  the head region goes back to a modifier COUNT alone (fabrications ship again)', V69,
    (s) => s.replace("          + '|(?:^|\\\\s)' + NAMED_TARGET_AFTER_ENTITY_SRC", '')],
  ['M2  the headline veto is removed (truthful reads destroyed again)', V69,
    (s) => s.replace('          && !isHeadlineObject(rest)\n', '')],
  ['M3  the headline veto ignores whether the phrase names anything', V69,
    (s) => s.replace('          && !OBJECT_NAMES_SOMETHING.test(rest);', '          && true;')],
  ['M4  a determiner no longer immunises the object ("the task for the marketing team" vetoed)', V69,
    (s) => s.replace('const isHeadlineObject = (rest: string) => !OBJECT_OPENS_WITH_A_REFERENCE.test(rest)',
      'const isHeadlineObject = (rest: string) => !(false && OBJECT_OPENS_WITH_A_REFERENCE.test(rest))')],
  ['M5  the named-target test goes case-insensitive (every lowercase word becomes a name)', V69,
    (s) => s.replace("const NAMED_TARGET_AFTER_ENTITY = new RegExp(NAMED_TARGET_AFTER_ENTITY_SRC, 'u');",
      "const NAMED_TARGET_AFTER_ENTITY = new RegExp(NAMED_TARGET_AFTER_ENTITY_SRC, 'iu');")],
  ['M6  an adjectival participle is a finite verb again ("archive expired work order WO-1")', V69,
    (s) => s.replace('.replace(ADJECTIVAL_PARTICIPLE_BEFORE_ENTITY, \' \')', '')],
  ['M7  a verb must be followed by whitespace again ("Archive: the work order WO-1")', V69,
    // The anchor is matched by SHAPE, not by retyping a string full of escapes: the previous version of
    // this mutant retyped it and matched nothing, and reported itself as a survivor rather than pretending
    // to pass. Matching the declaration and rewriting its value is immune to that.
    (s) => s.replace(/const AFTER_IMPERATIVE_VERB = '[^']*';/, "const AFTER_IMPERATIVE_VERB = '\\\\s+';")],
  ['M8  a non-leading negation is invisible again ("make sure you do not archive ACME")', V69,
    (s) => s.replace(' || (negatedMutationVerb ? negatedMutationVerb.toLowerCase() : null)', '')],
  ['M9  the singulariser produces non-words again ("statu")', V69,
    (s) => s.replace('SINGULAR_IS_ITSELF.test(commandEntityNoun)', 'false')],
  // ── Codex A: the negation gate ─────────────────────────────────────────────────────────────
  ['M10 the negation gate is removed entirely (the model action overrides the founder)', CODEX,
    (s) => s.replace('        if (requestIsNegated && result && typeof result === \'object\') {', '        if (false) {')],
  ['M11 the gate only strips the company lifecycle fields (an assignment still executes)', CODEX,
    (s) => s.replace("for (const field of MUTATION_RESULT_FIELDS.concat(['activateAiProviderId']))",
      "for (const field of ['archiveCompanyIds','restoreCompanyIds'])")],
  ['M12 the gate runs but records nothing (the refusal becomes invisible)', CODEX,
    (s) => s.replace("event_type: 'negated_request_refused'", "event_type: 'ai_command_note'")],
  ['M13 a mixed turn is swallowed whole ("archive ACME, but do not delete it" archives nothing)', CODEX,
    (s) => s.replace('          return !clauses.some((c) => !negatedClause.test(c) && imperative.test(c.trim()));', '          return true;')],
  ['M14 the two mutating-field lists are allowed to drift apart', CODEX,
    (s) => s.replace("const MUTATION_RESULT_FIELDS = ['tasks','deleteTaskIds'", "const MUTATION_RESULT_FIELDS = ['tasks'")],
  // ── Codex C: the persistence contract ──────────────────────────────────────────────────────
  ['M15 the final persist discards its error again', CODEX,
    (s) => s.replace('const finalPersistFailed = !!(finalPersist && finalPersist.error);', 'const finalPersistFailed = false;')],
  ['M16 a failed persist is reported as an ordinary completion', CODEX,
    (s) => s.replace("? (turnExecutedSomething ? 'EXECUTION_SUCCEEDED_PERSISTENCE_FAILED' : 'READ_SUCCEEDED_PERSISTENCE_FAILED')",
      "? (turnExecutedSomething ? 'EXECUTION_SUCCEEDED_AND_PERSISTED' : 'READ_SUCCEEDED_AND_PERSISTED')")],
  ['M17 the done payload stops carrying the persistence outcome', CODEX,
    (s) => s.replace("send({ type: 'done', persistenceOutcome, persistenceFailed: finalPersistFailed, result,", "send({ type: 'done', result,")],
  ['M18 a failed persist loses its recovery information', CODEX,
    (s) => s.replace("event_type: 'final_persistence_failed'", "event_type: 'ai_command_note_2'")],
];

let killed = 0; const survivors = [];
for (const [name, suite, mutate] of MUTANTS) {
  const mutated = mutate(text);
  if (mutated === text) { survivors.push(name + '  [ZERO TARGETS — the anchor no longer exists]'); console.log('SURVIVED (0 targets)  ' + name); continue; }
  const file = DIR + '/' + name.split(' ')[0] + '.ts';
  writeFileSync(file, mutated);
  let failed = false, out = '';
  try {
    out = execFileSync(process.execPath, [suite], { encoding: 'utf8', timeout: 180000, env: { ...process.env, SEM_INDEX_SRC: file }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { failed = true; out = (e.stdout || '') + (e.stderr || ''); }
  if (failed) { killed++; console.log('KILLED   ' + name); }
  else { survivors.push(name + '  [' + suite.split('/').pop() + ' stayed green]'); console.log('SURVIVED ' + name); }
}

const afterSha = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('\n' + killed + '/' + MUTANTS.length + ' mutants killed');
console.log('candidate sha256 before ' + originalSha);
console.log('candidate sha256 after  ' + afterSha);
if (originalSha !== afterSha) { console.error('THE CANDIDATE WAS MODIFIED BY THIS RUN'); process.exit(2); }
if (survivors.length) { console.error('\nSURVIVORS:\n  ' + survivors.join('\n  ')); process.exit(1); }
console.log('every mutant killed, candidate byte-identical');
