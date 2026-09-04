#!/usr/bin/env node
// MUTATION PROOF for the run17 (campaign #77) closures — D127, D128, D129.
// COVERAGE reintroduces the verifier's defect; LIMIT over-broadens or over-narrows the fix.
// PROVEN only when a committed suite reports a FAIL line matching `expect`. Mutates the REAL
// source, restores from a pristine byte copy in a finally, aborts on a sha mismatch.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITES = ['run17', 'run16', 'run15', 'run14', 'run13', 'run12', 'run10', 'run8']
  .map((n) => join(REPO, 'qa', 'scenarios-runner', `${n}_defect_closure_contract.mjs`));
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');
const text = pristine.toString('utf8');

const MUTATIONS = [
  // ---- D128: negation decided by ORDER, splitter back to sentence punctuation -------------
  { name: 'M01 D128 COVERAGE: the conjunction/dash/paren boundaries come back (the f232975 splitter)',
    find: /split\(\/\[\.!\?,\\x3b\\n\]\+\/\)/,
    replace: 'split(/[.!?,\\x3b:()\\n]+|(?<!\\bconfirmed\\s*)[–—]+|\\s+(?:and|but|without)\\s+/i)',
    expect: /D128\.truthfulNegativeDestroyed|D128\.rateVsPrior/ },
  { name: 'M02 D128 LIMIT: order is ignored — a negator ANYWHERE in the clause disarms it (the f232975 rule; the four D125 fabrications escape)',
    find: /!\(NEGATED_CLAUSE\.test\(c\) && \(c\.search\(COMPLETION_VOCAB\) < 0 \|\| c\.search\(NEGATED_CLAUSE\) < c\.search\(COMPLETION_VOCAB\)\)\)/,
    replace: '!NEGATED_CLAUSE.test(c)',
    expect: /D128\.hold\.newFabricationsStillCaught|D125\.newFalseNegative/ },
  { name: 'M03 D128 LIMIT: order is inverted — a negator disarms only when it FOLLOWS the verb (truthful negatives destroyed, fabrications with trailing negators survive)',
    find: /c\.search\(NEGATED_CLAUSE\) < c\.search\(COMPLETION_VOCAB\)/,
    replace: 'c.search(NEGATED_CLAUSE) > c.search(COMPLETION_VOCAB)',
    expect: /D118\.truthfulNegativeDestroyed|D128\.hold\.plainTruthfulNegativesSurvive|D112\./ },
  { name: 'M04 D128 COVERAGE: "confirmed" re-enters the completion vocabulary (the lead word sits before every negator)',
    find: /\|granted\|added\|'\r?\n\s*\+ PROGRESS_VERBS/,
    replace: "|granted|added|confirmed|'\n          + PROGRESS_VERBS",
    expect: /D112\.negated|D118\.truthfulNegativeDestroyed|D117\.hold\.d112ExamplesStillSurvive/ },
  { name: 'M05 D128 COVERAGE: "or" is added as a boundary (the verifier\'s surviving mutant M28)',
    find: /split\(\/\[\.!\?,\\x3b\\n\]\+\/\)/,
    replace: 'split(/[.!?,\\x3b\\n]+|\\s+or\\s+/)',
    expect: /D128\.coverage\.orIsNotYetABoundary/ },

  // ---- D127: filler verbs/nouns scoped to the winning option -----------------------------
  { name: 'M06 D127 COVERAGE: the restore family\'s verbs are admitted for an ARCHIVE option ("activate acme" arms an archive again)',
    find: /archive: 'archive archiving archived delete deleting remove removing end ending close closing deactivate deactivating',/,
    replace: "archive: 'archive archiving archived delete deleting remove removing end ending close closing deactivate deactivating activate reject approve',",
    expect: /D127\.activateArmsArchive|D127\.rejectArms/ },
  { name: 'M07 D127 COVERAGE: every entity noun is admitted regardless of the option\'s type ("archive acme tasks" flips the target again)',
    find: /company: 'company companies', person:/,
    replace: "company: 'company companies task tasks employee employees', person:",
    expect: /D127\.entityNounTargetFlip/ },
  { name: 'M08 D127 LIMIT: the option\'s OWN action verbs leave the filler ("archive acme" dead-ends)',
    find: /archive: 'archive archiving archived delete deleting remove removing end ending close closing deactivate deactivating',/,
    replace: "archive: '',",
    expect: /D127\.hold\.plainSelectionStillArms|D116\.hold\.plainNameStillBinds|selectionFillerStillBinds/ },
  { name: 'M09 D127 COVERAGE: plain "activate" leaves RESTORE_VERB_PATTERN again',
    find: /\(\?:re\)\?activat\(e\|ed\|ing\)/,
    replace: 'reactivat(e|ed|ing)',
    // The deterministic path is already refused by the scoped filler; the contradiction guard's own vocabulary is observed directly.
    expect: /D127\.hold\.activateIsRestoreFamily|D127\.activateArmsArchive/ },

  // ---- D129: the option's own number is filler; a bare digit is not ----------------------
  { name: 'M10 D129 COVERAGE: the option-number filler is removed ("acme (option 1)" dead-ends again)',
    find: /\n\s*residual = residual\.replace\(new RegExp\('\(\?:\\\\boption\\\\s\*#\?\|#\)' \+ ownNumber \+ '\\\\b', 'g'\), ' '\);/,
    replace: '',
    expect: /D129\.numberedReplyDeadEnds/ },
  { name: 'M11 D129 LIMIT: a bare digit becomes filler ("acme 2" binds)',
    find: /residual = residual\.replace\(new RegExp\('\(\?:\\\\boption\\\\s\*#\?\|#\)' \+ ownNumber \+ '\\\\b', 'g'\), ' '\);/,
    replace: "residual = residual.replace(/\\b\\d+\\b/g, ' ');",
    expect: /D129\.hold\.bareDigitStillDeadEnds/ },
  { name: 'M12 D129 LIMIT: ANY option number is filler, not only the winner\'s own ("acme (option 2)" binds Acme)',
    find: /'\(\?:\\\\boption\\\\s\*#\?\|#\)' \+ ownNumber \+ '\\\\b'/,
    replace: "'(?:\\\\boption\\\\s*#?|#)\\\\d+\\\\b'",
    expect: /D129\.hold\.otherOptionsNumberDeadEnds/ },
  { name: 'M13 D117 COVERAGE (re-observed under the order rule): the clause split is removed — a truthful negative in sentence 1 disarms a fabrication in sentence 2',
    find: /String\(s\)\.split\(\/\[\.!\?,\\x3b\\n\]\+\/\)\.map\(\(c\) => c\.trim\(\)\)/,
    replace: '[String(s)]',
    expect: /D117\.hold\.splitStillMatters/ },
  { name: 'M14 D117 COVERAGE (re-observed): the comma stops being a clause boundary',
    find: /split\(\/\[\.!\?,\\x3b\\n\]\+\/\)/,
    replace: 'split(/[.!?\\x3b\\n]+/)',
    expect: /D117\.hold\.commaStillMatters/ },
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
console.log(`v17_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} proven, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
