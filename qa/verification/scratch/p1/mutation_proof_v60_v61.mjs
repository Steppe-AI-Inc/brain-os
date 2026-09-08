// MUTATION PROOF for the verifier #60 closures. Each mutant reintroduces one defect into a COPY of
// index.ts; the named suite must fail on it and pass on the real bytes. A mutant that survives means the
// suite asserts nothing. The candidate's own file is never modified: every run points the suites at the
// mutated copy through SEM_INDEX_SRC.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const DIR = 'qa/verification/scratch/p1/mutants';
mkdirSync(DIR, { recursive: true });
const original = readFileSync(SRC);
const originalSha = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');

const MUTANTS = [
  ['M1 V60-D8 an array added to the pack as an expression carries no envelope',
    'qa/scenarios-runner/architecture_collection_envelope_contract.mjs',
    (s) => s.replace('  const pack = { continuity,', '  const pack = { continuity, salaryBands: (approvals.data||[]).slice(0,20),')],
  ['M2 V60-D2 the row named this turn is merged at the tail again',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace('return [...extra, ...(companies.data || [])];', 'return [...(companies.data || []), ...extra];')],
  ['M3 V60-D1 the harder trim passes are removed',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace('for (const floor of [2, 0]) {', 'for (const floor of []) {')],
  ['M4 V60-D5 the loop measures a different object shape than the preflight',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace('JSON.stringify({ command, contextPack: pack }).length / 4)', 'JSON.stringify({ command, pack }).length / 4)')],
  ['M5 V60-D3 the model can veto the request lexicon again',
    'qa/verification/proposed/v60_regression_additions.mjs',
    (s) => s.replace('const lexiconReadVetoed = lexiconVerb !== null && readShaped;',
      "const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read' || modelIntentKind === 'other');")],
  ['M6 V60-D4 the imperative-position tier is removed',
    'qa/verification/proposed/v60_regression_additions.mjs',
    (s) => s.replace('|| lexiconObject || lexiconImperative) ? String(lexiconAlways || lexiconPassive || lexiconObject || lexiconImperative)',
      '|| lexiconObject) ? String(lexiconAlways || lexiconPassive || lexiconObject)')],
  ['M7 V60-D7 the plan path records a verified envelope from its own status word',
    'qa/scenarios-runner/architecture_mutation_envelope_contract.mjs',
    (s) => s.replace('if (mapping) recordExecution(mapping[0], mapping[1], (a.targetIds || {})[mapping[2]], planPostcondition);',
      'if (mapping) recordExecution(mapping[0], mapping[1], (a.targetIds || {})[mapping[2]], true);')],
  ['M8 V60-D1 residual: the whole-request refusal goes back to an opaque hard stop',
    'qa/scenarios-runner/request_gate_inventory_contract.mjs',
    (s) => s.replace("error: 'Request too large',", "error: 'Token preflight hard stop',")],
  ['M9 the minimum safe context loses its post-trim assertion',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace("throw new Error('context budget trimmed the minimum safe context — refusing to build this turn');", 'void 0;')],
  ['M10 V61-D1 conversationHistory is pinned above zero again',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace("key === 'conversationHistory' && floor > 0 ? Math.max(1, floor) : floor", "key === 'conversationHistory' ? Math.max(1, floor) : floor")],
  ['M11 V61-D1 the history row is unbounded again',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace('command: shorten(r.command), summary: shorten(summary)', 'command: r.command, summary')],
  ['M12 V61-D2 the named-this-turn rows lose their protection',
    'qa/scenarios-runner/architecture_context_budget_contract.mjs',
    (s) => s.replace("'activeChannelId', 'namedTargets']", "'activeChannelId']")],
  ['M13 V61-D6 the Mongolian tier drops its verb-final requirement',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace('!MN_NOT_A_COMMAND.test(w) && mnFinalWindow.includes(w)', '!MN_NOT_A_COMMAND.test(w)')],
  ['M14 V61-D6 the Mongolian tier drops its morphology test',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace('!MN_NOT_A_COMMAND.test(w) && mnFinalWindow.includes(w)', 'mnFinalWindow.includes(w)')],
  ['M15 V61-D7 the imperative tier drops its object test',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace('const objectRefers = (rest: string) => IMPERATIVE_OBJECT.test(rest) && !STATEMENT_FINITE_VERB.test(rest);',
      'const objectRefers = (rest: string) => rest.length > 0;')],
  ['M16 V61-D7 the imperative tier drops only its finite-verb test',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace('IMPERATIVE_OBJECT.test(rest) && !STATEMENT_FINITE_VERB.test(rest)', 'IMPERATIVE_OBJECT.test(rest)')],
  ['M17 V61-D8 a postcondition read fails open again',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace("if (r.changed === true && r.postconditionPassed === true) recordExecution('task', 'archive'",
      "if (r.changed === true && r.postconditionPassed !== false) recordExecution('task', 'archive'")],
  ['M18 V61-D9 the plan postcondition comes from the write own return again',
    'qa/scenarios-runner/architecture_mutation_envelope_contract.mjs',
    (s) => s.replace('postconditionPassed: assigned };', 'postconditionPassed: typeof data[0]?.id === "string" };')],
  ['M19 V61-D3 counts emits a second shown envelope again',
    'qa/verification/proposed/v61_regression_additions.mjs',
    (s) => s.replace('    tasksTotal: tasksCount.count', '    tasksShown: (tasks.data||[]).length, tasksTotal: tasksCount.count')],
];

let killed = 0; const survived = [];
for (const [name, suite, mutate] of MUTANTS) {
  const mutated = mutate(text);
  if (mutated === text) { survived.push(name + ' [MUTATION DID NOT APPLY — anchor missing]'); console.log('SURVIVED (no-op) ' + name); continue; }
  const file = DIR + '/' + name.split(' ')[0] + '.ts';
  writeFileSync(file, mutated);
  let failed = false;
  try {
    execFileSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: file }, stdio: 'pipe' });
  } catch { failed = true; }
  if (failed) { killed++; console.log('KILLED   ' + name + '  [' + suite.split('/').pop() + ']'); }
  else { survived.push(name + ' [' + suite.split('/').pop() + ' passed on the mutant]'); console.log('SURVIVED ' + name); }
}

const afterSha = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('\ncandidate index.ts unchanged: ' + (afterSha === originalSha) + '  (' + afterSha.slice(0, 12) + ')');
console.log(`mutation proof: ${killed} killed, ${survived.length} survived`);
for (const s of survived) console.log('  SURVIVED: ' + s);
if (afterSha !== originalSha || survived.length) process.exit(1);
