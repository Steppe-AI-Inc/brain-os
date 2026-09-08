#!/usr/bin/env node
// MUTATION PROOF for the run18 (campaign #78) closures — D130, D131, D132, D133 — and the
// belt/matcher properties earlier proofs pinned that this campaign REDESIGNED (D118
// negation, D122 fail-closed), which move here because their old anchors no longer exist.
// COVERAGE reintroduces the verifier's defect; LIMIT over-/under-broadens the fix. PROVEN
// only when a committed suite prints a FAIL line matching `expect` (a whole-suite refusal is
// <suite>:EXIT). Mutates the REAL source, restores from a pristine byte copy, aborts on a
// sha mismatch. A stale anchor is UNPROVEN, never silently skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITES = ['run18', 'run17', 'run16', 'run15', 'run14', 'run13', 'run12', 'run10', 'run8']
  .map((n) => join(REPO, 'qa', 'scenarios-runner', `${n}_defect_closure_contract.mjs`))
  .concat([join(REPO, 'qa', 'scenarios-runner', 'issue5_confirmation_action_type_binding.mjs')]);
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  // ---- D130: negation decided against the VERBAL completion, not any completion word ------
  { name: 'M01 D130 COVERAGE: negation is compared to ANY participle (COMPLETION_PARTICIPLE) instead of the VERBAL completion — the noun/name confusion reopens',
    find: /const m = COMPLETION_VERB\.exec\(c\);/,
    replace: 'const m = COMPLETION_PARTICIPLE.exec(c);',
    expect: /D130\.truthfulNegativeDestroyed|D130\.rateOnRealNames/ },
  { name: 'M02 D130 COVERAGE: the "verbal completion" requirement is dropped — a negator with no verbal completion is no longer treated as negated',
    find: /if \(m === null\) return true;/,
    replace: 'if (m === null) return false;',
    expect: /D130\.|D118\.hold|D112\.hold/ },
  { name: 'M03 D130 LIMIT: the position test is inverted (<= becomes >), so a trailing negator disarms and D128 fabrications escape', superseded: 'run19/D134+R9b: the belt was redesigned (CONFIRMED negation scoped to the matched clause; splitter gained and/but/dash-before-lowercase boundaries; completionIsNegated is relative-clause-aware); this region is mutation-proven in v19_mutation_proof',
    find: /return n <= m\.index \+ \(rel < 0 \? 0 : rel\);/,
    replace: 'return n > m.index + (rel < 0 ? 0 : rel);',
    expect: /D128\.hold\.d125FourShapesStillCaught|D131\.fabricationCaught/ },
  { name: 'M04 D130 COVERAGE: present-tense "is/are" re-enters COMPLETION_VERB, so "ACME is archived but was not deleted" is destroyed',
    find: /const COMPLETION_VERB = \/\\b\(\?:has\|have\|had\|was\|were\)/,
    replace: 'const COMPLETION_VERB = /\\b(?:has|have|had|was|were|is|are)',
    expect: /D130\.stateThenNegation/ },

  // ---- D131: boundaries are punctuation only; and/but/dash stay inside names --------------
  { name: 'M05 D131 COVERAGE: the colon-space boundary is removed, so a colon-separated fabrication escapes', superseded: 'run19/D134+R9b: the belt was redesigned (CONFIRMED negation scoped to the matched clause; splitter gained and/but/dash-before-lowercase boundaries; completionIsNegated is relative-clause-aware); this region is mutation-proven in v19_mutation_proof',
    find: /String\(s\)\.split\(\/\[\.!\?,\\x3b\\n\]\+\|:\\s\/\)/,
    replace: 'String(s).split(/[.!?,\\x3b\\n]+/)',
    expect: /D131\.fabricationCaught/ },
  { name: 'M06 D131 LIMIT: a spaced dash becomes a boundary again — it destroys the paired real name in the irreducible-residual proof', superseded: 'run19/D134+R9b: the belt was redesigned (CONFIRMED negation scoped to the matched clause; splitter gained and/but/dash-before-lowercase boundaries; completionIsNegated is relative-clause-aware); this region is mutation-proven in v19_mutation_proof',
    find: /String\(s\)\.split\(\/\[\.!\?,\\x3b\\n\]\+\|:\\s\/\)/,
    replace: 'String(s).split(/[.!?,\\x3b\\n]+|:\\s|\\s[–—]+\\s/)',
    expect: /D131\.irreducibleResidual/ },
  { name: 'M07 D131 LIMIT: "without" goes back into the negator list — it destroys "Doctors Without Borders … was archived"',
    find: /const NEGATED_CLAUSE = \/\\b\(\?:not\|never\|no\|nothing\|none\|/,
    replace: 'const NEGATED_CLAUSE = /\\b(?:not|never|no|nothing|none|without|',
    expect: /D131\.fabricationCaught|D128\.hold\.nounPhraseNegativesSurvive/ },

  // ---- D118 (negation still consulted, now via completionIsNegated) — moved from v15 ------
  { name: 'M08 D118 COVERAGE: completionIsNegated stops consulting the negator (negation blindness) — truthful negatives are destroyed',
    find: /const n = c\.search\(NEGATED_CLAUSE\);/,
    replace: 'const n = -1;',
    expect: /truthfulNegativeDestroyed|D118\.hold\.plainTruthfulNegativesSurvive/ },

  // ---- D132: prototype-key actionType/entityType fail closed, in BOTH sites ---------------
  { name: 'M09 D132 COVERAGE (matcher): the hasOwnProperty guard on ACTION_FAMILY_VERBS is dropped — a prototype-key actionType crashes the matcher',
    find: /const ownVerbs = Object\.prototype\.hasOwnProperty\.call\(ACTION_FAMILY_VERBS, at\);/,
    replace: 'const ownVerbs = at !== undefined;',
    expect: /D132\.prototypeKeyMustFailClosed/ },
  { name: 'M10 D132 COVERAGE (resolver): resolveClarificationField reverts to a plain indexed access — a prototype-key actionType returns an inherited function',
    find: /if \(!Object\.prototype\.hasOwnProperty\.call\(CLARIFICATION_ENTITY_ACTION_FIELD, entityType\)\) return undefined;\r?\n\s*const row = CLARIFICATION_ENTITY_ACTION_FIELD\[entityType\];\r?\n\s*return Object\.prototype\.hasOwnProperty\.call\(row, actionType\) \? row\[actionType\] : undefined;/,
    replace: 'return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType];',
    expect: /D132\.prototypeKeyMustFailClosed|issue5/ },

  // ---- D133: the option's own ordinal binds; a bare digit / other option's number does not -
  { name: 'M11 D133 COVERAGE: the ordinal-only path is disabled — "option 1"/"#1"/"the first one" dead-end again',
    find: /if \(ordN >= 1\) \{/,
    replace: 'if (false) {',
    expect: /D133\.numberedFallbackStillDeadEnds/ },
  { name: 'M12 D133 LIMIT: the range check is dropped, so an out-of-range ordinal ("option 3" on a 2-option list) no longer binds nothing',
    find: /return \(ordN <= options\.length && options\[ordN - 1\] && typeof options\[ordN - 1\]\.id === 'string'\) \? options\[ordN - 1\] : null;/,
    replace: 'return options[ordN - 1] ? options[ordN - 1] : options[0];',
    expect: /D133\.hold\.outOfRangeNumberBindsNothing/ },
  // (No single-mutation exists for "acme 1 dead-ends": the ordN restriction and the residue
  // check are belt-and-suspenders, and cleanSelection dead-ends it a third way. run17's
  // D129.hold + its own proof pin that invariant; it is not re-proven here.)
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
    if (m.superseded) { console.log(`SUPERSEDED    ${m.name}
              ${m.superseded}`); superseded++; continue; }
    const hits = (text.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
    if (hits < 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched 0x`); unproven++; continue; }
    const mutated = text.replace(m.find, () => m.replace);
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
console.log(`v18_mutation_proof: ${MUTATIONS.length - unproven - superseded}/${MUTATIONS.length - superseded} proven, ${unproven} unproven, ${superseded} superseded by run19 (historical record: 12/12 at be9d94f)`);
process.exit(unproven === 0 ? 0 : 1);
