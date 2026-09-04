#!/usr/bin/env node
// MUTATION PROOF for the run15 (campaign #75) closures — D116, D117, D118, D119, D122.
//
// Each mutation reintroduces EITHER the defect verifier #15 demonstrated (COVERAGE) OR an
// over-broadening of its fix (LIMIT). The standing rule, applied to the fix that states it:
// a guard that cannot be over-broadened without a test failing is only half-proven.
// A mutation is PROVEN only when a committed suite reports a FAIL line matching `expect`
// (or, for the issue5 suite which has no case ids, when its exit code goes non-zero).
//
// Mutates the REAL source, restores from a pristine byte copy in a finally, and aborts on a
// sha mismatch. Anchors are regexes that must match EXACTLY ONCE; a stale anchor is
// reported as UNPROVEN, never silently skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITES = ['run15', 'run14', 'run13', 'run12', 'run10', 'run8'].map((n) => join(REPO, 'qa', 'scenarios-runner', `${n}_defect_closure_contract.mjs`))
  .concat([join(REPO, 'qa', 'scenarios-runner', 'issue5_confirmation_action_type_binding.mjs'),
    join(REPO, 'qa', 'scenarios-runner', 'sem_ai_command_source_invariants_drift_guard.mjs')]);
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  // ---- D116: the P1 negated-mention bind ---------------------------------------------
  // run16/D123 SUPERSEDED M01/M02/M04: the NEGATED_MENTION word list is gone — the matcher
  // binds only a CLEAN SELECTION (label + selection filler), which subsumes every
  // negation case. Their coverage lives in v16_mutation_proof (M01-M05).
  { name: 'M01 D116 COVERAGE: the negation dead-end is removed (the d724d8c state)', superseded: 'run16/D123 replaced NEGATED_MENTION with the clean-selection allowlist; see v16_mutation_proof M01',
    find: /\n\s*if \(matches\.some\(\(o\) => clauses\.some\(\(c\) => c\.includes\(forMatching\(o\.label\)\)\s*\n\s*&& NEGATED_MENTION\.test\(c\.split\(forMatching\(o\.label\)\)\.join\(' '\)\)\)\)\) return null;/,
    replace: '',
    expect: /D116\./ },
  { name: 'M02 D116 LIMIT: the negator test runs on the WHOLE command instead of the clause', superseded: 'run16/D123: clause scoping no longer exists; the LIMIT is now the selection-filler allowlist (v16_mutation_proof M02/M03)',
    find: /clauses\.some\(\(c\) => c\.includes\(forMatching\(o\.label\)\)\s*\n\s*&& NEGATED_MENTION\.test\(c\.split\(forMatching\(o\.label\)\)\.join\(' '\)\)\)/,
    replace: "NEGATED_MENTION.test(normalizedCommand.split(forMatching(o.label)).join(' '))",
    expect: /D116\.hold\.negatorInAnotherClause/ },
  { name: "M03 D116 LIMIT: the option's own label is NOT removed before the negator test (a real name can disarm itself)", superseded: 'run16/D123: NEGATED_MENTION no longer exists; the self-label removal now lives in cleanSelection (v16_mutation_proof M03/M06, D123.hold.legitimateRepliesStillBind)',
    find: /NEGATED_MENTION\.test\(c\.split\(forMatching\(o\.label\)\)\.join\(' '\)\)/,
    replace: 'NEGATED_MENTION.test(c)',
    expect: /D116\.hold\.nameContainingNegator/ },
  { name: 'M04 D116 COVERAGE: the contraction arm ("dont", "cannot") is dropped from NEGATED_MENTION', superseded: 'run16/D123: NEGATED_MENTION no longer exists',
    find: /\|\(\?:do\|does\|did\|is\|are\|was\|were\|wo\|ca\|could\|would\|should\|must\|has\|have\|had\|need\)n'\?t\|cannot/,
    replace: '',
    expect: /D116\.dontArchive/ },

  // ---- D117 / D118: negation once, per clause, every arm -------------------------------
  { name: 'M05 D117 COVERAGE: readsAsCompletion loses the clause split and tests the whole summary',
    // run16/D125 widened the splitter; the anchor follows it (the mutation is the same: no split at all).
    find: /String\(s\)\.split\(\/[^\n]*?\/i\)\.map\(\(c\) => c\.trim\(\)\)/,
    replace: '[String(s)]',
    expect: /D117\.suffixDisarms/ },
  { name: 'M06 D118 COVERAGE: NEGATED_CLAUSE is no longer consulted (negation blindness on every arm)',
    find: /!NEGATED_CLAUSE\.test\(c\)\s*\n\s*&& /,
    replace: '',
    // run15's belt-slice guard REFUSES to report on a predicate that no longer consults
    // NEGATED_CLAUSE (the whole suite exits), and run14's D112 cases fail behaviourally.
    expect: /D118\.truthfulNegativeDestroyed|D112\.negated|run15:EXIT/ },
  { name: 'M07 D117 COVERAGE: the comma stops being a clause boundary',
    find: /split\(\/\[\.!\?,\\x3b:\(\)\\n\]\+\|/,
    replace: 'split(/[.!?\\x3b:()\\n]+|',
    expect: /D117\.suffixDisarms\.1/ },
  { name: 'M08 D118 LIMIT: NEGATED_CLAUSE over-broadened to any word (every clause reads as negated)',
    // Appended at the END of the list so run15's extraction guard (which pins the head of
    // the negator list) still admits the slice and the LIMIT is observed by CASES.
    find: /didn\['’\]\?t\|don\['’\]\?t\)\\b\/i;/,
    replace: "didn['’]?t|don['’]?t|\\w+)\\b/i;",
    expect: /D117\.hold\.baseShapeStillCaught|D118\.hold\.realCompletionsStillCaught|D112\.hold\.realCompletion/ },

  // ---- D119: the absent branch is dropped, not lexically gated --------------------------
  { name: 'M09 D119 COVERAGE: the drop is removed (unresolvable options are shown again)',
    find: /if \(unresolvableOptionIndexes\.length > 0\) \{/,
    replace: 'if (false) {',
    expect: /D113\.hold\.absentId|D95\.distinctOutOfContext|D103\.hold\.numbered|D72b/ },
  { name: 'M10 D119 COVERAGE: the absent-branch lexical fallback is restored (the D113 shape)',
    find: /o\.label = agrees \? safeLabel : derivedLabel;/,
    replace: 'o.label = agrees ? safeLabel : (canonicalKnowsIt || !safeLabel || COMPLETION_WORD.test(safeLabel)) ? derivedLabel : safeLabel;',
    expect: /D119\.absentBranchAssertionSurvives|V15\.absentBranchNeverShowsModelText/ },
  { name: 'M11 D119 LIMIT: the drop is over-broad — resolvable options are dropped too',
    find: /if \(!canonicalKnowsIt\) unresolvableOptionIndexes\.push\(oi\);/,
    replace: 'unresolvableOptionIndexes.push(oi);',
    expect: /R10\.flag\.quiet|D78\.|D113\.hold\.corroborated|D95\.distinctOutOfContext/ },
  { name: 'M12 D119 LIMIT: a label that AGREES with the canonical name is no longer allowed to keep its presentation',
    find: /o\.label = agrees \? safeLabel : derivedLabel;/,
    replace: 'o.label = derivedLabel;',
    expect: /D113\.hold\.corroborated|D78\.legit|V15\.canonicalPresentKeepsRealNames|D93\./ },

  // ---- D122: the citation now points at something that observes the product -----------
  // The guard line and the un-coerced indexed access each defend issue #5 ALONE (either one
  // returns undefined for an absent actionType), so the behavioural defect needs BOTH
  // reintroduced at once — a single-line mutant here is inert, and reporting it as "proven"
  // would be exactly the vacuous evidence this file exists to rule out.
  { name: 'M13 D122 COVERAGE (behavioural): the issue #5 defect returns — guard removed AND absent actionType coerced to archive',
    find: /if \(!entityType \|\| !actionType\) return undefined;\r?\n(\s*)return CLARIFICATION_ENTITY_ACTION_FIELD\[entityType\]\?\.\[actionType\];/,
    replace: "$1return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType || 'archive'];",
    expect: /issue5:EXIT|^REAL$/ },
  { name: 'M14 D122 COVERAGE (structural): the fail-closed guard line alone is removed — the source-invariant guard must refuse it',
    find: /\n\s*if \(!entityType \|\| !actionType\) return undefined;(\r?\n\s*return CLARIFICATION_ENTITY_ACTION_FIELD)/,
    replace: '$1',
    expect: /sem:EXIT/ },
];

const runSuites = () => {
  let out = '';
  for (const s of SUITES) {
    const tag = s.split(/[\\/]/).pop().replace(/_.*$/, '');
    try { out += execFileSync(process.execPath, [s], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO }); }
    catch (e) { out += String(e.stdout || '') + String(e.stderr || '') + `\nFAIL ${tag}:EXIT ${e.status}\n`; }
  }
  return out;
};
const failing = (out) => out.split(/\r?\n/).filter((l) => /^FAIL /.test(l)).map((l) => l.replace(/^FAIL /, '').split(/\s+/)[0]);

let unproven = 0, superseded = 0;
try {
  const base = failing(runSuites());
  if (base.length) { console.log('BASELINE NOT CLEAN — the suites fail on unmutated source:\n  ' + base.join('\n  ')); process.exit(1); }
  console.log('baseline: all ' + SUITES.length + ' suites green on unmutated source\n');
  for (const m of MUTATIONS) {
    if (m.superseded) { console.log(`SUPERSEDED    ${m.name}\n              ${m.superseded}`); superseded++; continue; }
    const hits = (text.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
    if (hits !== 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched ${hits}x, expected 1`); unproven++; continue; }
    // A replacement function, never a string: a `$` in the replacement would otherwise
    // be interpreted as a group reference and corrupt the mutant.
    const mutated = text.replace(m.find, (...args) => m.replace.replace(/\$1/g, args[1] ?? ''));
    if (mutated === text) { console.log(`UNPROVEN      ${m.name}\n              replacement produced identical source`); unproven++; continue; }
    writeFileSync(SRC, mutated, 'utf8');
    const out = runSuites();
    const caught = failing(out).filter((id) => m.expect.test(id));
    const others = failing(out).filter((id) => !m.expect.test(id));
    if (caught.length === 0) {
      console.log(`UNPROVEN      ${m.name}\n              no expected case failed (${others.length} other failures: ${others.slice(0, 4).join(', ')})`);
      unproven++;
    } else {
      console.log(`PROVEN        ${m.name}\n              caught by: ${caught.slice(0, 5).join(', ')}${others.length ? ` (+${others.length} collateral)` : ''}`);
    }
  }
} finally {
  writeFileSync(SRC, pristine);
  const after = createHash('sha256').update(readFileSync(SRC)).digest('hex');
  if (after !== pristineSha) { console.log(`\n*** SOURCE NOT RESTORED *** ${after}`); process.exit(2); }
  console.log(`\nsource restored byte-identically (sha256 ${after.slice(0, 16)}…)`);
}
console.log(`v15_mutation_proof: ${MUTATIONS.length - unproven - superseded}/${MUTATIONS.length - superseded} proven, ${unproven} unproven, ${superseded} superseded by run16 (historical record: 14/14 at 52e830f)`);
process.exit(unproven === 0 ? 0 : 1);
