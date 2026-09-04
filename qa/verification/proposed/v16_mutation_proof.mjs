#!/usr/bin/env node
// MUTATION PROOF for the run16 (campaign #76) closures — D123, D124, D125, D126.
//
// Each mutation reintroduces EITHER the defect verifier #16 demonstrated (COVERAGE) OR an
// over-broadening / over-narrowing of its fix (LIMIT). A mutation is PROVEN only when a
// committed suite reports a FAIL line matching `expect` (a whole-suite refusal counts as
// `<suite>:EXIT`). Mutates the REAL source, restores from a pristine byte copy in a finally,
// aborts on a sha mismatch. Stale anchors are UNPROVEN, never silently skipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITES = ['run16', 'run15', 'run14', 'run13', 'run12', 'run10', 'run8']
  .map((n) => join(REPO, 'qa', 'scenarios-runner', `${n}_defect_closure_contract.mjs`));
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  // ---- D123: the clean-selection rule --------------------------------------------------
  { name: 'M01 D123 COVERAGE: the clean-selection check is removed from the single-match path',
    find: /\n\s*if \(matches\.length === 1 && !cleanSelection\(matches\[0\]\)\) return null;/,
    replace: '',
    expect: /D123\.(unlistedNegator|crossClauseNegator|founderSelfCorrection)|D116\./ },
  { name: 'M02 D123 LIMIT: "no" is admitted as selection filler (the allowlist over-broadens)',
    find: /yes yeah yep yup ok okay sure please/,
    replace: 'no yes yeah yep yup ok okay sure please',
    expect: /D123\.crossClauseNegator|D116\.noNotBeta|D116\.hold\.negatorInAnotherClauseDeadEnds/ },
  { name: 'M03 D123 LIMIT: the action verbs leave the filler set (the allowlist over-narrows — "archive acme holdings" dead-ends)',
    find: /option number archive restore delete remove end close assign reassign update rename activate deactivate approve reject /,
    replace: 'option number ',
    expect: /D116\.hold\.plainNameStillBinds|D123\.hold\.selectionFillerStillBinds|D116\.hold\.selectionFillerStillBinds/ },
  { name: 'M04 D123 COVERAGE: the clean-selection check is skipped on the specificity (D106) path',
    find: /\n\s*if \(!cleanSelection\(longest\[0\]\)\) return null;/,
    replace: '',
    expect: /D123\.exclusionOnSpecificityPath/ },
  { name: 'M05 D123 COVERAGE: the clean-selection check is skipped on the raw tie-break (D102) path',
    find: /if \(exact\.length === 1\) return cleanSelection\(exact\[0\]\) \? exact\[0\] : null;/,
    replace: 'if (exact.length === 1) return exact[0];',
    expect: /D123\.exclusionOnTieBreakPath/ },
  { name: 'M06 D123 LIMIT: residual words are compared case-sensitively against the filler (any capitalised filler word dead-ends)',
    find: /\.every\(\(w\) => SELECTION_FILLER\.has\(w\)\);/,
    replace: '.every((w) => SELECTION_FILLER.has(w.toUpperCase()));',
    expect: /D116\.hold\.plainNameStillBinds|selectionFillerStillBinds|D106\./ },

  // ---- D124: canonical alias + "known" decided by the read ------------------------------
  { name: 'M07 D124 COVERAGE: canonicalKnowsIt reverts to comparing two fallback strings (the d724d8c/52e830f shape)',
    find: /&& typeof o\.id === 'string' && o\.id\.length > 0\s*\n\s*&& \(canonicalById\.has\(canonicalType \+ '\|' \+ o\.id\) \|\| lastKnownLabel\(canonicalType, o\.id\) !== null\);/,
    replace: "&& bare(derivedLabel) !== bare(TYPED_FALLBACK[typeof o.entityType === 'string' ? o.entityType : 'record'] || 'the record') && !/^option \\d+$/.test(derivedLabel);",
    expect: /D124\.|unlistedTypeIsDropped/ },
  { name: 'M08 D124 COVERAGE: the employee -> person alias is removed',
    find: /employee: 'person', staff: 'person'/,
    replace: "staff: 'person'",
    expect: /D124\.employee/ },
  { name: 'M09 D124 LIMIT: canonicalKnowsIt ignores lastKnownLabel (a row created THIS turn is dropped)',
    find: /\|\| lastKnownLabel\(canonicalType, o\.id\) !== null\);/,
    replace: ');',
    expect: /D126\.freshCreateLabelStillResolves/ },

  // ---- D125: clause boundaries -----------------------------------------------------------
  { name: 'M10 D125 COVERAGE: the splitter reverts to [.!?,;] only',
    find: /split\(\/\[\.!\?,\\x3b:\(\)\\n\]\+\|\(\?<!\\bconfirmed\\s\*\)\[–—\]\+\|\\s\+\(\?:and\|but\|without\)\\s\+\/i\)/,
    replace: 'split(/[.!?,\\x3b]+/)',
    expect: /D125\.newFalseNegative/ },
  { name: 'M11 D125 LIMIT: the "confirmed —" lookbehind is removed (the lead separator splits the base shape)',
    find: /\(\?<!\\bconfirmed\\s\*\)\[–—\]\+/,
    replace: '[–—]+',
    expect: /D117\.hold\.baseShapeStillCaught|D112\.hold\.realCompletion|D125\.hold\.d117LaterClauseStillCaught/ },

  // ---- D126: the drop is observed where it happens ----------------------------------------
  { name: 'M12 D126 COVERAGE: the drop fires only when EVERY option is unresolvable (verifier #16 mutant C5)',
    find: /if \(unresolvableOptionIndexes\.length > 0\) \{/,
    replace: 'if (unresolvableOptionIndexes.length > 0 && unresolvableOptionIndexes.length === paObj.options.length) {',
    expect: /D126\.mixedDrop/ },
  { name: 'M13 D126 COVERAGE: the drop is removed entirely',
    find: /if \(unresolvableOptionIndexes\.length > 0\) \{/,
    replace: 'if (false) {',
    expect: /D126\.dropObservedInPipeline|D126\.allUnresolvableDropObserved|D113\.hold\.absentId/ },
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
    if (hits !== 1) { console.log(`UNPROVEN      ${m.name}\n              stale anchor: matched ${hits}x, expected 1`); unproven++; continue; }
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
console.log(`v16_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
