// VERIFIER #15 — SCENARIO 2. MY OWN mutation battery, written from scratch.
// I deliberately do NOT run qa/verification/proposed/v14_mutation_proof.mjs: running the
// implementing session's harness and reporting its result is self-certification by proxy.
//
// METHOD. Only run10..run14 honour SEM_INDEX_SRC; the other 15 live suites read
// supabase/functions/sem-ai-command/index.ts directly. So a mutant that is only written to
// a temp copy would be scored against a fifth of the battery and would over-report
// survival. Each mutant is therefore written to the REAL file, the WHOLE battery is run,
// and the file is restored from a pristine byte buffer in a finally block. The sha256 is
// asserted before the run, after EVERY restore, and at the end.
//
// TWO MUTANT KINDS, and the second is the one that matters here:
//   COVERAGE — disable/weaken the guard. A committed case must fail. A survivor means the
//              guard does nothing observable.
//   LIMIT    — OVER-BROADEN the guard (drop an anchor, widen a class, delete a negation)
//              so it fires on input it must leave alone. A committed case must fail. A
//              survivor means the guard's NARROWNESS is unobserved — which is exactly how
//              the tenth vacuous-guard recurrence was found, and this project has now
//              shipped eleven.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '1b291f370d285ae79844c7f363a3959d2c668ab5d368a69805b0c9a16227ef64';
const PRISTINE = fs.readFileSync(SRC);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

if (sha(PRISTINE) !== REQUIRED) {
  console.error('ABORT: baseline sha mismatch', sha(PRISTINE));
  process.exit(2);
}
console.log('baseline sha OK:', sha(PRISTINE));

const SUITES = fs.readdirSync('qa/scenarios-runner')
  .filter((f) => f.endsWith('.mjs') && f !== '_gate_extract.mjs').sort();

function runBattery() {
  const failed = [];
  for (const f of SUITES) {
    let out = '', code = 0;
    try {
      out = execFileSync(process.execPath, [`qa/scenarios-runner/${f}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    } catch (e) {
      code = typeof e.status === 'number' ? e.status : -1;
      out = (e.stdout || '') + (e.stderr || '');
    }
    const failLines = (out.match(/^(FAIL|FAILED|✗|not ok)\b/gmi) || []).length;
    // Anchored on the real summary shape ("N pass, M fail"). A bare /\d+\s+fail/ matched
    // the prose "action a1 fails on its own real outcome" and reported a green suite red —
    // caught on the pristine baseline, which is exactly what the baseline gate is for.
    const m = out.match(/(\d+)\s+pass[a-z]*,\s*(\d+)\s+fail/i);
    const summaryFail = m ? Number(m[2]) : 0;
    const nPassOfN = out.match(/(\d+)\/(\d+)\s+passed/i);
    const shortfall = nPassOfN ? Number(nPassOfN[2]) - Number(nPassOfN[1]) : 0;
    if (code !== 0 || failLines > 0 || summaryFail > 0 || shortfall > 0) {
      failed.push(`${f}(exit${code},fail${Math.max(failLines, summaryFail, shortfall)})`);
    }
  }
  return failed;
}

// --- exact single-line source strings (verified present before use) ------------------
const S = {
  maxLen: '    const maxLen = Math.max(...matches.map(specificity));',
  longestIsOne: '    if (longest.length === 1) {',
  residual: '      return matches.some((o) => o !== longest[0] && rest.includes(forMatching(o.label))) ? null : longest[0];',
  rest: "      const rest = normalizedCommand.split(forMatching(longest[0].label)).join(' ');",
  exactConfined: '    const exact = longest.filter((o) => o.label.trim().length > 0',
  negLookahead: "(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|hasn['’]?t|haven['’]?t|didn['’]?t|don['’]?t)\\b)",
  lbThe: '(?<!\\bthe )',
  lbDigit: '(?<!\\d )',
  lbChain: '(?<!\\bthe )(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )',
  fpTest: '          if (FIRST_PERSON_MAIN_CLAUSE_COMPLETION.test(q)) return null;',
  fpLookbehind: '/(?<!\\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\\s\\w{1,24}\\s)',
  interrog: '          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;',
  d113: '                : (canonicalKnowsIt || !safeLabel || COMPLETION_WORD.test(safeLabel))',
  agrees: '              const agrees = !!safeLabel && bare(safeLabel) === bare(derivedLabel);',
  knowsIt2: '                && bare(derivedLabel) !== bare(typedFallback)',
  resolveField: '  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType];',
  resolveGuard: '  if (!entityType || !actionType) return undefined;',
  contradictDefault: "  const resolvedActionType = actionType || 'archive';",
};

const MUTANTS = [
  // ---- GUARD 1: D106 specificity (longest matched label wins) --------------------
  { id: 'M01', guard: 'D106-specificity', kind: 'COVERAGE',
    desc: 'longest-wins inverted to shortest-wins (the original D106 P1 shape)',
    from: S.maxLen, to: '    const maxLen = Math.min(...matches.map(specificity));' },
  { id: 'M02', guard: 'D106-specificity', kind: 'LIMIT',
    desc: 'a REMAINING TIE now silently picks longest[0] instead of dead-ending',
    from: S.longestIsOne, to: '    if (longest.length >= 1) {' },
  { id: 'M03', guard: 'D106-specificity', kind: 'LIMIT',
    desc: 'specificity measured on the RAW label, so presentation chars inflate rank',
    from: '    const specificity = (o: PendingActionOption) => forMatching(o.label).length;',
    to: '    const specificity = (o: PendingActionOption) => o.label.length;' },

  // ---- GUARD 2: D106 residual-mention guard --------------------------------------
  { id: 'M04', guard: 'D106-residual', kind: 'COVERAGE',
    desc: 'residual-mention guard deleted — a reply naming several options binds the longest',
    from: S.residual, to: '      return longest[0];' },
  { id: 'M05', guard: 'D106-residual', kind: 'LIMIT',
    desc: 'residual computed over the FULL reply, so any nested label always dead-ends',
    from: S.residual,
    to: '      return matches.some((o) => o !== longest[0] && normalizedCommand.includes(forMatching(o.label))) ? null : longest[0];' },
  { id: 'M06', guard: 'D106-residual', kind: 'LIMIT',
    desc: 'winner text blanked instead of space-joined, so adjacent words fuse',
    from: S.rest, to: "      const rest = normalizedCommand.split(forMatching(longest[0].label)).join('');" },

  // ---- GUARD 3: D106 raw tie-break confined to the tied set ----------------------
  { id: 'M07', guard: 'D106-rawTieBreak', kind: 'COVERAGE',
    desc: 'raw tie-break widened back to ALL options (the D102 shape D106 removed)',
    from: S.exactConfined, to: '    const exact = options.filter((o) => o.label.trim().length > 0' },
  { id: 'M08', guard: 'D106-rawTieBreak', kind: 'LIMIT',
    desc: 'raw tie-break widened to the whole matched set rather than the tied set',
    from: S.exactConfined, to: '    const exact = matches.filter((o) => o.label.trim().length > 0' },

  // ---- GUARD 4: D112 negation lookahead ------------------------------------------
  { id: 'M09', guard: 'D112-negationLookahead', kind: 'COVERAGE',
    desc: 'negation lookahead deleted — "Confirmed — the company is not archived" destroyed again',
    from: S.negLookahead, to: '' },
  { id: 'M10', guard: 'D112-negationLookahead', kind: 'LIMIT',
    desc: 'negation lookahead over-broadened with "now", so real completions escape the belt',
    from: "(?:not|never|no|nothing|none|without|pending|awaiting", to: "(?:not|never|no|nothing|none|now|without|pending|awaiting" },

  // ---- GUARD 5: D112 determiner / cardinal lookbehinds ---------------------------
  { id: 'M11', guard: 'D112-lookbehinds', kind: 'LIMIT',
    desc: 'the "the" lookbehind dropped — belt fires on truthful determiner prose',
    from: S.lbChain, to: '(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )' },
  { id: 'M12', guard: 'D112-lookbehinds', kind: 'LIMIT',
    desc: 'the CARDINAL lookbehind dropped — "you have 3 archived companies" destroyed',
    from: S.lbChain, to: '(?<!\\bthe )(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )' },
  { id: 'M13', guard: 'D112-lookbehinds', kind: 'LIMIT',
    desc: 'the WHOLE lookbehind chain dropped',
    from: S.lbChain, to: '' },

  // ---- GUARD 6: D114 first-person belt + its clause-position lookbehind ----------
  { id: 'M14', guard: 'D114-firstPerson', kind: 'COVERAGE',
    desc: 'first-person belt deleted — exactly the D114 swap that reopened run12s class',
    from: S.fpTest, to: '' },
  { id: 'M15', guard: 'D114-clausePosition', kind: 'LIMIT',
    desc: 'clause-position lookbehind dropped — "the company I archived" destroyed (D98 class)',
    from: S.fpLookbehind, to: '/' },
  { id: 'M16', guard: 'D114-interrogativeLead', kind: 'LIMIT',
    desc: 'INTERROGATIVE_LEAD exemption dropped — run12/D92 blanket belt restored',
    from: S.interrog, to: '          if (COMPLETION_WORD.test(q)) return null;' },
  { id: 'M17', guard: 'D114-interrogativeLead', kind: 'COVERAGE',
    desc: 'interrogative belt disabled entirely',
    from: S.interrog, to: '' },

  // ---- GUARD 7: D113 two-rule corroboration --------------------------------------
  { id: 'M18', guard: 'D113-rule1-canonical', kind: 'COVERAGE',
    desc: 'rule 1 dropped — canonical disagreement no longer replaces the label (pre-D113)',
    from: S.d113, to: '                : (!safeLabel || COMPLETION_WORD.test(safeLabel))' },
  { id: 'M19', guard: 'D113-rule2-lexical', kind: 'COVERAGE',
    desc: 'rule 2 lexical test dropped — assertion-shaped labels survive the ABSENT branch',
    from: S.d113, to: '                : (canonicalKnowsIt || !safeLabel)' },
  { id: 'M20', guard: 'D113-rule2-lexical', kind: 'LIMIT',
    desc: 'rule 2 made unconditional — every absent-branch label replaced (run8/D72b class)',
    from: S.d113, to: '                : (canonicalKnowsIt || !safeLabel || true)' },
  { id: 'M21', guard: 'D113-agrees', kind: 'LIMIT',
    desc: 'agreement widened from equality to CONTAINMENT — a label that merely contains the canonical name survives verbatim',
    from: S.agrees,
    to: '              const agrees = !!safeLabel && bare(safeLabel).includes(bare(derivedLabel));' },
  { id: 'M22', guard: 'D113-canonicalKnowsIt', kind: 'LIMIT',
    desc: 'typed-fallback exclusion dropped — "the company" counts as canonical knowledge',
    from: S.knowsIt2, to: '                && true' },

  // ---- issue #5 class-B fail-closed resolution (cited BY NAME in the source) -----
  { id: 'M23', guard: 'issue5-failClosed', kind: 'COVERAGE',
    desc: 'resolveClarificationField reverted to the P1 form: absent actionType coerced to ARCHIVE',
    from: S.resolveGuard, to: '  if (false) return undefined;' },
  { id: 'M24', guard: 'issue5-failClosed', kind: 'COVERAGE',
    desc: 'destructive default restored explicitly (entityType||"" / actionType||"archive")',
    from: S.resolveField,
    to: "  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType || '']?.[actionType || 'archive'];" },

  // ---- the stale-actionType hijack guard (#32) ------------------------------------
  { id: 'M25', guard: 'D32-contradictActionType', kind: 'COVERAGE',
    desc: 'contradiction default flipped so an absent actionType is treated as restore',
    from: S.contradictDefault, to: "  const resolvedActionType = actionType || 'restore';" },
];

// Verify every `from` is present and unique BEFORE mutating anything.
const srcText = PRISTINE.toString('utf8');
let setupError = false;
for (const m of MUTANTS) {
  const n = srcText.split(m.from).length - 1;
  if (n !== 1) { console.error(`SETUP ERROR ${m.id}: anchor occurs ${n} times: ${JSON.stringify(m.from.slice(0, 70))}`); setupError = true; }
}
if (setupError) { console.error('\nRefusing to run: a mutant anchor is missing or ambiguous.'); process.exit(2); }
console.log(`all ${MUTANTS.length} mutant anchors present and unique\n`);

const baselineFailures = runBattery();
if (baselineFailures.length) {
  console.error('ABORT: the battery is not green on the pristine source:', baselineFailures);
  process.exit(2);
}
console.log('battery green on pristine source\n');

const results = [];
for (const m of MUTANTS) {
  let failed;
  try {
    fs.writeFileSync(SRC, srcText.split(m.from).join(m.to), 'utf8');
    failed = runBattery();
  } finally {
    fs.writeFileSync(SRC, PRISTINE);
    const s = sha(fs.readFileSync(SRC));
    if (s !== REQUIRED) { console.error(`FATAL: restore failed after ${m.id}, sha=${s}`); process.exit(3); }
  }
  const killed = failed.length > 0;
  results.push({ ...m, killed, killers: failed });
  console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${m.id} [${m.kind}] ${m.guard}: ${m.desc}`);
  if (killed) console.log(`         killed by: ${failed.join(', ')}`);
}

fs.writeFileSync('qa/verification/scratch/v15_mutation_result.json', JSON.stringify(results, null, 1));

const survived = results.filter((r) => !r.killed);
console.log(`\n=== ${results.length} mutants: ${results.length - survived.length} killed, ${survived.length} SURVIVED ===`);
for (const s of survived) console.log(`  SURVIVOR ${s.id} [${s.kind}] ${s.guard}: ${s.desc}`);
console.log('\nfinal sha:', sha(fs.readFileSync(SRC)));
