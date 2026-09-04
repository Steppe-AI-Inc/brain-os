// =====================================================================================
// VERIFIER #20 (campaign #80) — regression additions for the run19 D134–D138 + D131/R9b
// closure (closure commit `f27f6b7`, candidate `b32e0e48566934741093ad3407f093fc1aa8b01b`,
// index.ts sha256 6407d95cc846e638d1229559b2622323072028876c8844ce2b1045eade050a6c).
//
// CONVENTION (same as v13..v19, deliberately):
//   CONTRACT — must pass TODAY. A CONTRACT failure means something that was true has been
//              broken, and is the more serious result of the two.
//   DEFECT   — reproduces a defect this verifier found. It FAILS on the candidate by design
//              and turns green when the defect is fixed.
// ANY failure — CONTRACT or DEFECT — exits nonzero, so this file can never be "passed" by
// ignoring its own output.
//
// It drives the REAL shipped predicates extracted from
// ../../../supabase/functions/sem-ai-command/index.ts with its OWN extractor — not
// _gate_extract.mjs, not any run8..run19 harness, not any v13..v19 verifier harness.
//
// FINDINGS PINNED HERE
//   D139 (P1, NEW in this candidate) — R9b's third disjunct
//        `!NEGATION_AUX.test(c.slice(0, n))` decides that a negator preceded by ANY finite
//        auxiliary belongs to a subordinate clause and does NOT scope over the completion
//        verb. English disagrees: "There is no record ACME was archived." is the ordinary
//        zero-relativizer complement, and its negator scopes over the whole thing. The belt
//        now fires on the TRUE answer and `legacyProseFallback` (index.ts:5739) replaces it
//        with "I can't actually do that from chat — nothing was changed." — a read-only
//        question answered with a mutation refusal. Survives at d34af15, fbafded, a559f8f,
//        9535f0b and 52e830f; destroyed only here and at pre-negation d724d8c.
//   D142 (P1, NEW) — D138's `commandForContradiction` strips the matched option's label from
//        the command UNCONDITIONALLY. When the label IS an opposite-family command verb (a
//        company named "Restore"/"ReStore"/"Archive"/"Delete"), the strip removes the
//        founder's own verb, `commandContradictsActionType` sees nothing, and the reply
//        BINDS — arming the DESTRUCTIVE field on the opposite intent. Prior SHAs dead-ended.
//        The same commit's D136 already applies the correct rule (genuine ambiguity between
//        a reference and a name => dead-end to the LLM) on the ordinal path only.
//   D141 (P2, PRE-EXISTING at every SHA — not a regression) — NEGATED_CLAUSE's lexicon has
//        no `nobody`, `neither`, `nowhere`, `nor`, `few`, `hardly`, so truthful negatives
//        built on them are destroyed, including "The company was not archived, nor was it
//        deleted." (the comma splits off a clause whose negator is not in the list).
//   D144 (P3, NEW) — a fabrication d34af15 CAUGHT is now missed: "ACME is archived, and I
//        also deleted Beta Corp." The R9b splitter only breaks at and/but before a LOWERCASE
//        non-auxiliary token, and D137 removed bare present-tense from the progressive arm,
//        so neither clause fires.
//   VACUOUS GUARD (observation, harmless) — `ordN <= options.length` at index.ts:457 is
//        fully subsumed by the `options[ordN - 1]` truthiness test beside it.
//
// CONFIRMED CLOSED / STILL HOLDING (pinned as CONTRACT below): D132 (the hasOwnProperty
// guard is load-bearing — removing it throws TypeError on 15 prototype-key probes), D133
// (ordinal selection), D134, D135, D136, D137, D138's own shape, and the D112/D116/D123/
// D127/D129 belt+matcher contracts.
// =====================================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// ---------------------------------------------------------------- own extractor
const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function scanStatement(s, start, mode) {
  let i = start, depth = 0, prev = '', sawBody = false;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two === '//') { const nl = s.indexOf('\n', i); i = nl < 0 ? s.length : nl + 1; continue; }
    if (two === '/*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === c) break; j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1, inClass = false;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') inClass = true;
        else if (s[j] === ']') inClass = false;
        else if (s[j] === '/' && !inClass) break;
        else if (s[j] === '\n') break;
        j++;
      }
      j++;
      while (j < s.length && /[gimsuyvd]/.test(s[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '(' || c === '[' || c === '{') { if (c === '{' && depth === 0 && mode === 'fn') sawBody = true; depth++; }
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0 && mode === 'fn' && c === '}' && sawBody) return i + 1; }
    else if (c === ';' && depth === 0 && mode === 'stmt') return i + 1;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('v20 extractor: unterminated statement at ' + start);
}
function grabConst(name) {
  const m = new RegExp('(^|\\n)\\s*const\\s+' + name + '\\b').exec(src);
  if (!m) throw new Error('v20 extractor: const not found: ' + name);
  const a = src.indexOf('const', m.index);
  return src.slice(a, scanStatement(src, a, 'stmt'));
}
function grabFn(name) {
  const m = new RegExp('(^|\\n)function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('v20 extractor: function not found: ' + name);
  const a = src.indexOf('function', m.index);
  return src.slice(a, scanStatement(src, a, 'fn'));
}
const detype = (code) => code
  .replace(/: Record<string, Record<string, string>>/g, '')
  .replace(/: Record<string, string>/g, '')
  .replace(/\(c: string\): boolean/g, '(c)')
  .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/g, '(command, options)')
  .replace(/\((\w+): PendingActionOption\)/g, '($1)')
  .replace(/\(command: string, actionType: string \| undefined\): boolean/g, '(command, actionType)')
  .replace(/\(entityType: string \| undefined \| null, actionType: string \| undefined \| null\): string \| undefined/g, '(entityType, actionType)')
  .replace(/\((\w+): string\)/g, '($1)');

// the completion-drift belt, built from the shipped declarations
const GATE_NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX',
  'completionIsNegated', 'readsAsCompletion'];
const gateSrc = GATE_NAMES.map((n) => detype(grabConst(n))).join('\n');
const { readsAsCompletion } = new Function(gateSrc + '\nreturn { readsAsCompletion };')();

// the REAL disambiguation-resolution branch, re-composed from the shipped statements
const grabStmt = (marker) => {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('v20 extractor: marker not found: ' + marker);
  return src.slice(i, scanStatement(src, i, 'stmt'));
};
const decideSrc = [
  grabConst('CLARIFICATION_ENTITY_ACTION_FIELD'), grabConst('ARCHIVE_VERB_PATTERN'), grabConst('RESTORE_VERB_PATTERN'),
  grabFn('resolveClarificationField'), grabFn('commandContradictsActionType'), grabFn('matchDisambiguationOption'),
].map(detype).join('\n');
const decide = new Function(decideSrc + '\nreturn function decide(command, options) {\n'
  + 'const matchedOption = matchDisambiguationOption(command, options);\n'
  + detype(grabStmt('const commandForContradiction = matchedOption')) + '\n'
  + detype(grabStmt('const contradicted = !!matchedOption')) + '\n'
  + detype(grabStmt('const field = matchedOption && !contradicted')) + '\n'
  + "return (matchedOption && !contradicted && field) ? field + ':' + matchedOption.id : null;\n};")();
const matchOption = new Function(detype(grabFn('matchDisambiguationOption')) + '\nreturn matchDisambiguationOption;')();

// ---------------------------------------------------------------- runner
let pass = 0; const failures = [];
function check(kind, name, ok, detail) {
  if (ok) { pass++; console.log(`OK   [${kind}] ${name}`); }
  else { failures.push(`[${kind}] ${name} — ${detail}`); console.log(`FAIL [${kind}] ${name} — ${detail}`); }
}
const belt = (kind, name, text, expected, why) =>
  check(kind, name, readsAsCompletion(text) === expected,
    `${JSON.stringify(text)} readsAsCompletion=${readsAsCompletion(text)} expected=${expected}${why ? ' :: ' + why : ''}`);
const opt = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
const bind = (kind, name, reply, options, expected, why) => {
  let got; try { got = decide(reply, options); } catch (e) { got = 'THROW:' + (e && e.constructor ? e.constructor.name : '?'); }
  check(kind, name, got === expected, `reply=${JSON.stringify(reply)} armed=${got} expected=${expected}${why ? ' :: ' + why : ''}`);
};

// =====================================================================================
// D139 (P1, DEFECT) — zero-relativizer truthful negatives
// =====================================================================================
console.log('\n--- D139 (P1): zero-relativizer truthful negatives must SURVIVE (belt must not fire)');
for (const t of [
  'There is no evidence ACME Holding was archived.',
  'There is no record the Fleet unit was deleted.',
  'There are no records ACME Holding was archived.',
  'We have no indication the Fleet business unit was archived.',
  'I have no record ACME Holding was restored.',
  'There was no confirmation the parking unit was restored.',
  'There is nothing showing the goal was completed.',
  'There has been no request the contract was approved.',
  'It is not true ACME Holding was archived.',
  'There is no sign the task was reassigned.',
  'The system has no record ACME Holding was archived.',
  'The audit log has no entry ACME Holding was archived.',
  'We have no record Salt and Pepper Co was archived.',
  'There is no evidence Bed Bath and Beyond was deleted.',
  'There is no record But First Coffee was deleted.',
  'We have no proof the Ulaanbaatar — North Depot unit was archived.',
]) belt('DEFECT', 'D139.zeroRelativizer.' + JSON.stringify(t.slice(0, 42)), t, false,
  'a TRUE read-only answer; firing here replaces it with a mutation refusal (index.ts:5739)');

console.log('\n--- D139 limits: the shapes that must KEEP working either way');
for (const t of ['There is no evidence that ACME Holding was archived.', 'There is no record that the Fleet unit was deleted.',
  'There is no company which was archived.']) {
  belt('CONTRACT', 'D139.limit.relativizerStillSurvives.' + JSON.stringify(t.slice(0, 40)), t, false,
    'the relative-marker arm — must not be collateral of any D139 fix');
}
for (const t of ['I found no evidence ACME Holding was archived.', 'Nothing indicates the Fleet unit was deleted.']) {
  belt('CONTRACT', 'D139.limit.nonAuxLeadIn.' + JSON.stringify(t.slice(0, 40)), t, false, 'no finite aux before the negator');
}
for (const t of ['There were no errors and ACME Holding was archived.', 'ACME Holding was archived — no undo is available.',
  'The company had no open tasks and was archived.']) {
  belt('CONTRACT', 'D139.limit.trailingNegatorStillCaught.' + JSON.stringify(t.slice(0, 40)), t, true,
    'a negator that TRAILS the verb is a qualifier — the fabrication must still be caught');
}

// =====================================================================================
// D142 (P1, DEFECT) — the D138 label strip erases the founder's own command verb
// =====================================================================================
console.log('\n--- D142 (P1): an option whose LABEL IS an opposite-family verb must not absorb the command');
const archivePending = (label) => [opt('a', label), opt('b', 'Beta Corp')];
const restorePending = (label) => [opt('a', label, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];
bind('DEFECT', 'D142.labelIsVerb.restore', 'restore', archivePending('Restore'), null,
  'a company named "Restore"; the reply is a RESTORE COMMAND — binding it ARCHIVES on the opposite intent');
bind('DEFECT', 'D142.labelIsVerb.restoreMixedCase', 'restore', archivePending('ReStore'), null, 'real chain name');
bind('DEFECT', 'D142.labelIsVerb.unarchive', 'unarchive', archivePending('Unarchive'), null, null);
bind('DEFECT', 'D142.labelIsVerb.archiveOnRestore', 'archive', restorePending('Archive'), null, null);
bind('DEFECT', 'D142.labelIsVerb.deleteOnRestore', 'delete', restorePending('Delete'), null, null);
console.log('\n--- D142 limits: what a fix must NOT break (the D138 shape it was built for)');
for (const [n, label, reply] of [
  ['restoredFurniture', 'Restored Furniture Co', 'restored furniture co'],
  ['unarchivedRecords', 'Unarchived Records Ltd', 'unarchived records ltd'],
  ['reactivatedMetals', 'Reactivated Metals LLC', 'reactivated metals llc'],
]) bind('CONTRACT', 'D142.limit.d138NameStillSelectable.' + n, reply, archivePending(label), 'archiveCompanyIds:a',
  'run19/D138: a real name CONTAINING a verb must stay selectable');
for (const [n, label, reply] of [
  ['restoredFurniture', 'Restored Furniture Co', 'restore restored furniture co'],
  ['acme', 'ACME Holdings', 'restore acme holdings'],
]) bind('CONTRACT', 'D142.limit.realOppositeVerbStillDeadEnds.' + n, reply, archivePending(label), null,
  'a real opposite-family verb OUTSIDE the name must still dead-end');

// =====================================================================================
// D141 (P2, DEFECT, PRE-EXISTING at every SHA) — the negator lexicon
// =====================================================================================
console.log('\n--- D141 (P2, pre-existing): negators missing from NEGATED_CLAUSE');
for (const t of [
  'Nobody was assigned to that task.',
  'There is nobody who was reassigned.',
  'Neither company was archived.',
  'Nowhere in the log was ACME Holding archived.',
  'Nor was the Fleet unit deleted.',
  'The company was not archived, nor was it deleted.',
  'Few records were deleted.',
  'Hardly anything was archived.',
]) belt('DEFECT', 'D141.negatorLexicon.' + JSON.stringify(t.slice(0, 40)), t, false,
  'truthful negative destroyed at EVERY SHA in the lineage — a gap, not a regression');
for (const t of ['No records were deleted.', 'Nothing was archived.', 'No one was assigned to that task.']) {
  belt('CONTRACT', 'D141.limit.listedNegatorsStillWork.' + JSON.stringify(t.slice(0, 36)), t, false, null);
}

// =====================================================================================
// D144 (P3, DEFECT) — a fabrication d34af15 caught and this candidate misses
// =====================================================================================
console.log('\n--- D144 (P3): fabrication coverage lost vs d34af15');
belt('DEFECT', 'D144.presentStatePlusPastFabrication', 'ACME Holding is archived, and I also deleted Beta Corp.', true,
  'caught at d34af15; the R9b lowercase-only and/but boundary plus D137 present-tense removal lets both clauses through');

// =====================================================================================
// CONTRACTS — closures this candidate genuinely made, and prior ones it must not reopen
// =====================================================================================
console.log('\n--- D134/D135/D136/D137/D138 (CONTRACT): the run19 closures');
belt('CONTRACT', 'D134.confirmedNegationIsClauseScoped', 'Confirmed — as requested, the company was not archived.', false, null);
belt('CONTRACT', 'D134.confirmedLaterClauseStillCaught', 'Confirmed — as requested, Restored Bob Smith.', true, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives', 'test3 is archived. Should I restore it?', false, null);
belt('CONTRACT', 'D137.progressiveStillCaught', 'ACME Holding is being archived right now.', true, null);
belt('CONTRACT', 'D130.presentStateAndPastNegative', 'ACME Holding is archived but was not deleted.', false, null);
bind('CONTRACT', 'D135.noOptionTwoDeadEnds', 'no option 2', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], null, null);
bind('CONTRACT', 'D133.ordinalSelects', 'option 2', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.bareDigitSelects', '2', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.wordOrdinalSelects', 'the second one', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.outOfRangeBindsNothing', 'option 9', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], null, null);
bind('CONTRACT', 'D129.nameWithDigitBindsNothing', 'acme holdings 2', [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')], null, null);
bind('CONTRACT', 'D136.ordinalThatIsAlsoANameDeadEnds', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], null, null);

console.log('\n--- D132 (CONTRACT): a prototype-key type must fail closed, never throw, never inherit');
for (const k of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
  for (const [n, extra] of [['actionType', { actionType: k }], ['entityType', { entityType: k }], ['both', { actionType: k, entityType: k }]]) {
    const options = [opt('a', 'ACME Holdings', extra), opt('b', 'Beta Corp')];
    let got; try { got = decide('archive acme holdings', options); } catch (e) { got = 'THROW:' + (e && e.constructor ? e.constructor.name : '?'); }
    // an unknown/prototype actionType must resolve NO field (fail closed); a prototype
    // entityType likewise. Never a throw, never an inherited function.
    check('CONTRACT', `D132.protoKey.${n}.${k}`, got === null, `armed=${got} expected=null`);
  }
}

console.log('\n--- D112/D116/D123/D127 (CONTRACT): belt + matcher contracts that must not reopen');
for (const t of ['The company is not archived.', 'I can show you the archived companies.', 'There are 4 archived companies.',
  'The task is still pending, not approved.', 'Nothing has been archived yet.', 'Confirmed — Archive ACME Holding?',
  'Confirmed — the company you asked about is in Ulaanbaatar']) {
  belt('CONTRACT', 'D112.truthfulAnswerSurvives.' + JSON.stringify(t.slice(0, 38)), t, false, null);
}
const TWO = [opt('a', 'ACME Holdings'), opt('b', 'Beta Corp')];
bind('CONTRACT', 'D116.negatedMentionDeadEnds', "don't archive acme holdings", TWO, null, null);
bind('CONTRACT', 'D123.exclusionDeadEnds', 'anything except acme holdings', TWO, null, null);
bind('CONTRACT', 'D123.adjacentClauseNegatorDeadEnds', 'acme holdings? no, the other one', TWO, null, null);
bind('CONTRACT', 'D127.differentIntentDeadEnds', 'activate acme holdings', TWO, null, null);
bind('CONTRACT', 'D127.differentTargetDeadEnds', 'archive acme holdings tasks', TWO, null, null);
bind('CONTRACT', 'D127.ownFamilyVerbIsCleanSelection', 'archive acme holdings', TWO, 'archiveCompanyIds:a', null);
bind('CONTRACT', 'cleanSelection.plainName', 'acme holdings', TWO, 'archiveCompanyIds:a', null);

// =====================================================================================
// VACUOUS-GUARD OBSERVATION (CONTRACT: it stays behaviour-neutral, so nobody "fixes" it
// into a behaviour change by accident)
// =====================================================================================
console.log('\n--- vacuous guard: the ordinal range check is subsumed by the options[ordN-1] test');
for (const [ln, options] of [['one', [opt('a', 'A Co')]], ['two', TWO], ['three', [opt('a', 'A Co'), opt('b', 'B Co'), opt('c', 'C Co')]]]) {
  for (const reply of ['option 4', 'option 10', '#5', 'number 99']) {
    let got; try { got = matchOption(reply, options); got = got ? got.id : null; } catch (e) { got = 'THROW'; }
    check('CONTRACT', `ordinal.outOfRange.${ln}.${JSON.stringify(reply)}`, got === null, `got=${got} expected=null`);
  }
}

// ---------------------------------------------------------------- verdict
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
