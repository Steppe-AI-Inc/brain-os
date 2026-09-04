#!/usr/bin/env node
// v14 MUTATION PROOF — the four fixes applied for campaign #74.
//
// Verifier #14's own battery found ELEVEN unobserved guards (D107–D111), so this proof
// covers each fix's LIMITS as well as its coverage: over-broadening a belt must fail a
// CONTRACT case, not just under-broadening it. A guard that cannot be loosened without a
// test failing is only half-proven.
//
// Mutates the REAL source (not a copy behind an env var — not every suite honours one, so
// a copy-based battery silently under-reports), restores from a pristine byte copy in a
// finally, and aborts the whole run on a sha mismatch.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const RUN14 = join(REPO, 'qa', 'scenarios-runner', 'run14_defect_closure_contract.mjs');
const pristine = readFileSync(SRC);
const pristineSha = createHash('sha256').update(pristine).digest('hex');

const MUTATIONS = [
  // ---- FIX-C2 / D106: the P1 wrong-entity binding -------------------------------------
  { name: 'D106 COVERAGE: the fallback filters `options` again instead of the tied set',
    find: /const longest = matches\.filter\(\(o\) => specificity\(o\) === maxLen\);/,
    replace: 'const longest = options.filter((o) => usable(o) && specificity(o) === maxLen);',
    expect: /D106/ },
  { name: 'D106 LIMIT: specificity drops the residual-mention guard (guesses on multi-mention replies)',
    find: /return matches\.some\(\(o\) => o !== longest\[0\] && rest\.includes\(forMatching\(o\.label\)\)\) \? null : longest\[0\];/,
    replace: 'return longest[0];',
    expect: /D106\.hold/ },
  { name: 'D106 LIMIT: the raw tie-break escapes the tied set again',
    find: /const exact = longest\.filter\(\(o\) => o\.label\.trim\(\)\.length > 0/,
    replace: 'const exact = matches.filter((o) => o.label.trim().length > 0',
    expect: /D10[26]/ },

  // ---- FIX-B / D112: negation blindness ------------------------------------------------
  { name: 'D112 COVERAGE: CONFIRMED_COMPLETION loses its negation lookahead', superseded: 'run15/D117 removed that lookahead (it was the whole-summary defect); see v15_mutation_proof M5/M6',
    find: /\(\?!\[\^\]\*\\b\(\?:not\|never\|no\|nothing\|none\|without\|pending\|awaiting\|isn\['’\]\?t\|aren\['’\]\?t\|wasn\['’\]\?t\|weren\['’\]\?t\|hasn\['’\]\?t\|haven\['’\]\?t\|didn\['’\]\?t\|don\['’\]\?t\)\\b\)/,
    replace: '',
    expect: /D112/ },
  { name: 'D112 COVERAGE: the determiner lookbehinds go, so a completion NOUN fires the belt',
    find: /\(\?<!\\bthe \)\(\?<!\\ba \)\(\?<!\\ban \)\(\?<!\\bany \)\(\?<!\\byour \)\(\?<!\\bmy \)\(\?<!\\bour \)\(\?<!\\d \)/,
    replace: '',
    expect: /D112/ },

  // ---- FIX-A2 / D114: the reopened first-person class ----------------------------------
  { name: 'D114 COVERAGE: the first-person belt is removed again (the f1722f2 state)',
    find: /\n\s*if \(FIRST_PERSON_MAIN_CLAUSE_COMPLETION\.test\(q\)\) return null;/,
    replace: '',
    expect: /D114/ },
  { name: 'D114 LIMIT: the blanket re-add without the clause-position lookbehind (the swap that caught three campaigns)',
    find: /\/\(\?<!\\b\(\?:the\|a\|an\|all\|any\|some\|those\|these\|our\|your\|my\|their\|both\|each\|every\)\\s\\w\{1,24\}\\s\)/,
    replace: '/',
    expect: /D98|D114\.hold/ },

  // ---- D113: the decision that de-lexicalised the corroboration gate -------------------
  { name: 'D113 COVERAGE: corroboration is gated on COMPLETION_WORD again', superseded: 'run15/D119 removed the lexical fallback entirely; see v15_mutation_proof M10',
    find: /\(canonicalKnowsIt \|\| !safeLabel \|\| COMPLETION_WORD\.test\(safeLabel\)\)/,
    replace: '(!safeLabel || COMPLETION_WORD.test(safeLabel))',
    expect: /D113/ },
  { name: 'D113 LIMIT: corroboration by CONTAINMENT rather than equality',
    find: /const agrees = !!safeLabel && bare\(safeLabel\) === bare\(derivedLabel\);/,
    replace: 'const agrees = !!safeLabel && bare(derivedLabel).includes(bare(safeLabel));',
    expect: /D113\.hold/ },
  { name: 'D113 LIMIT: the ABSENT branch also drops its lexical test (destroys benign labels — run8/D72b)', superseded: 'run15/D119 RETIRED run8/D72b on the record; the absent branch is now dropped',
    find: /\(canonicalKnowsIt \|\| !safeLabel \|\| COMPLETION_WORD\.test\(safeLabel\)\)/,
    replace: '(true)',
    expect: /D72b|D100|D113\.hold/ },
];

const runSuites = () => {
  const out = [];
  for (const s of [RUN14,
    join(REPO, 'qa', 'scenarios-runner', 'run8_defect_closure_contract.mjs'),
    join(REPO, 'qa', 'scenarios-runner', 'run10_defect_closure_contract.mjs'),
    join(REPO, 'qa', 'scenarios-runner', 'run12_defect_closure_contract.mjs'),
    join(REPO, 'qa', 'scenarios-runner', 'run13_defect_closure_contract.mjs')]) {
    try { out.push(execFileSync(process.execPath, [s], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
    catch (e) { out.push(String(e.stdout || '') + String(e.stderr || '')); }
  }
  return out.join('\n');
};
const failedIds = (o) => o.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.split(/\s+/)[1]);

let unproven = 0, superseded = 0;
try {
  const base = failedIds(runSuites());
  if (base.length > 0) { console.log('BASELINE NOT CLEAN:', base.join(', ')); process.exit(1); }
  console.log('baseline: 0 failures across run8/10/12/13/14\n');
  const text = pristine.toString('utf8');

  for (const m of MUTATIONS) {
    if (m.superseded) { console.log(`SUPERSEDED    ${m.name}\n              ${m.superseded}`); superseded++; continue; }
    const hits = (text.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
    if (hits !== 1) {
      console.log(`STALE ANCHOR  ${m.name}\n              matched ${hits}x, expected 1`); unproven++; continue;
    }
    // Replacement via function: `$$`/`$1` in a string replacement are escapes and silently
    // corrupt the mutant (this cost two false "unproven" results on the migration proofs).
    const mutated = text.replace(m.find, () => m.replace);
    writeFileSync(SRC, mutated, 'utf8');
    const ids = failedIds(runSuites());
    const hit = ids.filter((id) => m.expect.test(id));
    if (hit.length === 0) {
      console.log(`UNPROVEN      ${m.name}\n              expected a failure matching ${m.expect} — none. Failures: ${ids.join(', ') || '(none at all)'}`);
      unproven++;
    } else {
      console.log(`PROVEN        ${m.name}\n              caught by: ${[...new Set(hit)].slice(0, 4).join(', ')}`);
    }
  }
} finally {
  writeFileSync(SRC, pristine);
  const after = createHash('sha256').update(readFileSync(SRC)).digest('hex');
  if (after !== pristineSha) {
    console.log(`\n*** SOURCE NOT RESTORED *** expected ${pristineSha}, got ${after}`);
    process.exit(2);
  }
  console.log(`\nsource restored byte-identically (sha256 ${after.slice(0, 16)}…)`);
}
console.log(`v14_mutation_proof: ${MUTATIONS.length - unproven - superseded}/${MUTATIONS.length - superseded} proven, ${unproven} unproven, ${superseded} superseded by run15 (historical record: 10/10 at d724d8c)`);
process.exit(unproven === 0 ? 0 : 1);
