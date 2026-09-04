#!/usr/bin/env node
// MUTATION PROOF for the run19 (campaign #79) closures — D134, D135, D136, D137, D138, and
// the D131/R9b refinement. COVERAGE reintroduces the verifier's defect; LIMIT over-/under-
// broadens the fix. PROVEN only when a committed suite prints a FAIL line matching `expect`
// (a whole-suite refusal is <suite>:EXIT). Mutates the REAL source, restores from a pristine
// byte copy, aborts on a sha mismatch. A stale anchor is UNPROVEN.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITES = ['run19', 'run18', 'run17', 'run16', 'run15', 'run14', 'run13', 'run12', 'run10', 'run8']
  .map((n) => join(REPO, 'qa', 'scenarios-runner', `${n}_defect_closure_contract.mjs`));
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  // ---- D134: CONFIRMED negation scoped to the clause containing the matched participle -----
  { name: 'M01 D134 COVERAGE: the CONFIRMED negation reverts to clause[0], so a later-clause negator is ignored',
    find: /!completionIsNegated\(String\(s\)\.slice\(0, \(String\(s\)\.match\(CONFIRMED_COMPLETION\)\?\.index \?\? 0\)[\s\S]*?\.pop\(\) \?\? ''\)/,
    replace: "!completionIsNegated(String(s).split(/[.!?,\\x3b\\n]/)[0])",
    expect: /D134\.confirmedNegativeDestroyed/ },
  { name: 'M02 D134 LIMIT: the CONFIRMED negation checks the WHOLE string, so a real "Confirmed — as requested, Restored X" fabrication is disarmed by an unrelated later negator',
    find: /!completionIsNegated\(String\(s\)\.slice\(0, \(String\(s\)\.match\(CONFIRMED_COMPLETION\)\?\.index \?\? 0\)[\s\S]*?\.pop\(\) \?\? ''\)/,
    replace: "!completionIsNegated(String(s))",
    expect: /D134\.hold\.confirmedFabricationsStillCaught|D117\./ },

  // ---- D135: "no" is not ordinal filler ---------------------------------------------------
  { name: 'M03 D135 COVERAGE: "no" is put back into ORD_FILLER, so a negated ordinal reply binds',
    find: /const ORD_FILLER = new Set\('the a an one it that this these those option options number yes/,
    replace: "const ORD_FILLER = new Set('the a an one it that this these those option options number no yes",
    expect: /D135\.negatedOrdinalBinds/ },

  // ---- D136: an ordinal that is also a whole name dead-ends -------------------------------
  { name: 'M04 D136 COVERAGE: the ambiguous-with-a-name dead-end is removed, so "option 2" arms the ordinal even when a company is named "Option 2 Ltd"',
    find: /\n\s*if \(ambiguousWithAName\) return null;/,
    replace: '',
    expect: /D136\.ordinalBeatsRealName|D136\.numberedNameBeatsOrdinal/ },
  { name: 'M05 D136 LIMIT: the ambiguity guard over-broadens (drops the .includes anchor), so a plain ordinal against ordinary names also dead-ends',
    find: /forMatching\(o\.label\.replace\(\/\\s\*\\\(option \\d\+\\\)\$\/, ''\)\)\.includes\(normalizedCommand\)/,
    replace: 'true',
    expect: /D133\.|D136\.hold/ },

  // ---- D137: present-tense state is not a completion in EIP -------------------------------
  { name: 'M06 D137 COVERAGE: bare present-tense "is/are <participle>" re-enters EIP, so a truthful state answer is destroyed',
    find: /'\|\(\?:was\|were\) \(\?:being \|getting \)\?\(\?:archived\|deleted/,
    replace: "'|(?:is|are|was|were) (?:being |getting )?(?:archived|deleted",
    expect: /D137\.presentTenseStateDestroyed/ },
  { name: 'M07 D137 LIMIT: the progressive present arm is dropped, so "is being archived" (a real progress fabrication) is no longer caught',
    find: /\n\s*'\|\(\?:is\|are\) \(\?:being\|getting\) \(\?:archived\|deleted\|updated\|created\|restored\|activated\|deactivated\|assigned\|reassigned\|approved\|rejected\|removed\|completed\|renamed\|ended\|closed\|cleared\|sent\|moved\|granted\|declined\)' \+/,
    replace: '',
    expect: /D137\.hold|EIP|isBeingArchived/ },

  // ---- D138: the matched label is removed before the contradiction check -------------------
  { name: 'M08 D138 COVERAGE: the label is NOT removed before the contradiction check, so a lifecycle verb in a company NAME dead-ends the option',
    find: /const contradicted = !!matchedOption && commandContradictsActionType\(commandForContradiction, matchedOption\.actionType\);/,
    replace: 'const contradicted = !!matchedOption && commandContradictsActionType(command, matchedOption.actionType);',
    expect: /D138\.source\.callSiteStripsMatchedLabel|D138\.nameTripsContradictionGuard/ },

  // ---- D131 / R9b: the widened splitter and the relative-clause-aware negation -------------
  { name: 'M09 D131/R9b COVERAGE: the and/but/dash boundaries are removed again, so the 5 separable fabrications escape',
    find: /\|\\s\(\?:and\|but\)\\s\+\(\?=\(\?!\(\?:was\|were\|is\|are\|has\|have\|had\|been\|being\|not\)\\b\)\[a-z\]\)\|\\s\[—–-\]\\s\+\(\?=\(\?!\(\?:was\|were\|is\|are\|has\|have\|had\|been\|being\|not\)\\b\)\[a-z\]\)/,
    replace: '',
    expect: /D131\.separableResidual/ },
  { name: 'M10 D131/R9b LIMIT: the boundary fires before a CAPITALISED token too (drops the [a-z] lookahead), destroying a real name',
    find: /\(\?=\(\?!\(\?:was\|were\|is\|are\|has\|have\|had\|been\|being\|not\)\\b\)\[a-z\]\)\|\\s\[—–-\]/,
    replace: '(?=(?!(?:was|were|is|are|has|have|had|been|being|not)\\b))|\\s[—–-]',
    expect: /D131\.hold|D128\.hold\.nounPhraseNegativesSurvive|D131\.separableResidual/ },
  { name: 'M11 D131/R9b COVERAGE: the relative-clause / no-auxiliary refinement is dropped (revert to plain n<=participle), reopening the over-catch that keeps run17/D128 "record that X was archived"',
    find: /if \(n > p\) return false;\r?\n\s*return n >= m\.index \|\| \/\\b\(\?:that\|which\|who\|whom\)\\b\/i\.test\(c\.slice\(n, m\.index\)\) \|\| !NEGATION_AUX\.test\(c\.slice\(0, n\)\);/,
    replace: 'return n <= p;',
    expect: /D131\.separableResidual|D131\.hold/ },
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

let unproven = 0;
try {
  const base = failing(runSuites());
  if (base.length) { console.log('BASELINE NOT CLEAN — the suites fail on unmutated source:\n  ' + base.join('\n  ')); process.exit(1); }
  console.log('baseline: all ' + SUITES.length + ' suites green on unmutated source\n');
  for (const m of MUTATIONS) {
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
console.log(`v19_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
