// =====================================================================================
// run26 CLOSURE CONTRACT (implementing session) — promoted from VERIFIER #26 (campaign #86).
// Pins the run26 closure of D162a (FIX-G: the unanchored bare-`be` alternative removed) and
// D162b (FIX-F: the evidential split reuses the file's name-vs-clause guard). index.ts sha256
// for the candidate it is promoted onto: 70161e8de8d221824d02c5ae27ae87e1169a7a111770ea5482992860c2ba5344.
//
// CONVENTION (same as run8..run25 / v13..v25):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap DISCLOSED and deliberately deferred, pinned at its CURRENT behaviour
//                so a later change that moves it is seen.
// ANY failure exits nonzero.
//
// GREEN on the candidate it is promoted onto (FIX-F + FIX-G applied): the D162a/D162b DEFECT
// pins are CLOSED here; every [CONTRACT] passes; every [RESIDUAL] sits at its pin. run25's
// vacuous variable-length-lookbehind DEFECT is dropped (run25 retired); a variable-length
// lookbehind IS shipped (FIRST_PERSON_MAIN_CLAUSE_COMPLETION) and is disclosed via the CONTRACT below.
// Under the prepared FIX-F + FIX-G (v26_PROMOTION_NOTE.md) it goes FULLY GREEN with no
// [RESIDUAL] move and the whole 31-suite .mjs battery stays green.
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor
// written for THIS campaign. No reimplementation of any regex. It imports NOTHING from
// qa/scenarios-runner and nothing from any v*_ artefact — those are the things under test.
//
// Source resolution: SEM_INDEX_SRC, else `../../../supabase/functions/sem-ai-command/index.ts`
// (its home in qa/verification/proposed/), else `../../supabase/...` (after promotion into
// qa/scenarios-runner/).
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.SEM_INDEX_SRC,
  resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),
  resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
].filter(Boolean);
const SRC_PATH = CANDIDATES.find((p) => existsSync(p));
if (!SRC_PATH) throw new Error('v26: index.ts not found — tried ' + CANDIDATES.join(', '));
const rawSrc = readFileSync(SRC_PATH, 'utf8');
const src = rawSrc.replace(/\r\n/g, '\n');

// ---- belt extractor (mine) --------------------------------------------------------------
function buildBelt() {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b < 0 || b <= a) throw new Error('v26: belt block boundaries not found — refusing to report');
  let slice = src.slice(a, b)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v26: a TypeScript annotation survived stripping — refusing to report on a slice that is not the product');
  for (const need of ['const LEGACY_PAST_COMPLETION', 'const PROGRESS_VERBS', 'const EXECUTION_IN_PROGRESS',
    'const CONFIRMED_COMPLETION', 'const NEGATED_CLAUSE', 'const REFERENCELESS_CONFIRMATION',
    'const COMPLETION_PARTICIPLE', 'const COMPLETION_VERB', 'const NEGATION_AUX',
    'const completionIsNegated', 'const readsAsCompletion']) {
    if (!slice.includes(need)) throw new Error('v26: belt slice missing ' + need + ' — refusing to report on a slice that is not the product');
  }
  return new Function(slice + '\nreturn readsAsCompletion;')();
}
const readsAsCompletion = buildBelt();
if (typeof readsAsCompletion !== 'function') throw new Error('v26: readsAsCompletion not extracted');

// ---- matcher extractor (mine) ------------------------------------------------------------
function buildMatcher() {
  const balanced = (marker) => {
    const i = src.indexOf(marker);
    if (i < 0) throw new Error('v26 matcher: not found ' + marker);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') { d++; started = true; }
      else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('v26 matcher: unbalanced ' + marker);
  };
  const constLine = (n) => {
    const m = src.match(new RegExp('^const ' + n + ' = (.+);$', 'm'));
    if (!m) throw new Error('v26 matcher: const not found ' + n);
    return m[1];
  };
  const cfIdx = src.indexOf('const commandForContradiction = matchedOption');
  if (cfIdx < 0) throw new Error('v26 matcher: commandForContradiction not found');
  const cfSrc = src.slice(cfIdx, src.indexOf(';', src.indexOf(': command', cfIdx)) + 1);
  const cIdx = src.indexOf('const contradicted = !!matchedOption');
  if (cIdx < 0) throw new Error('v26 matcher: contradicted not found');
  const contradictedSrc = src.slice(cIdx, src.indexOf('\n          // Same GitHub issue #5', cIdx));
  if (!/ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN\)\.test\(command\)/.test(contradictedSrc)) {
    throw new Error('v26: the D157 unified imperative test is not present verbatim — refusing to report');
  }
  const strip = (s) => s
    .replace(/const ([A-Z_]+): Record<string, string> =/g, 'const $1 =')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/\(([a-zA-Z]+): PendingActionOption\)/g, '($1)')
    .replace(/:\s*PendingActionOption\b/g, '').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '')
    .replace(/\((command|s|c|winner|o|w|opt|cmd): [^)]*\)/g, (m) => m.replace(/: [^,)]*/g, ''));
  return new Function(strip(`
const ARCHIVE_VERB_PATTERN = ${constLine('ARCHIVE_VERB_PATTERN')};
const RESTORE_VERB_PATTERN = ${constLine('RESTORE_VERB_PATTERN')};
${balanced('function commandContradictsActionType(')}
${balanced('function matchDisambiguationOption(')}
return function selects(command, options) {
  const matchedOption = matchDisambiguationOption(command, options);
  if (!matchedOption) return 'DEAD-END';
  ${cfSrc}
  ${contradictedSrc};
  return contradicted ? 'DEAD-END' : 'SELECT';
};`))();
}
const selects = buildMatcher();

// ---- harness -------------------------------------------------------------------------------
let pass = 0; const failures = [];
function t(kind, id, got, want, note) {
  if (got === want) { pass++; console.log('OK   [' + kind + '] ' + id); }
  else {
    failures.push('[' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : ''));
    console.log('FAIL [' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : ''));
  }
}
const belt = (kind, id, text, want, note) => t(kind, id + ' ' + JSON.stringify(text.slice(0, 72)), readsAsCompletion(text), want, note);
const O = (label, actionType) => ({ label, actionType, id: 'opt-1', entityType: 'company', value: label });
const match = (kind, id, opt, cmd, want, note) => t(kind, id + ' label=' + JSON.stringify(opt.label) + ' reply=' + JSON.stringify(cmd), selects(cmd, [opt]), want, note);

// =====================================================================================
// D162a (P2, NEW — a REGRESSION vs 4476c92 AND e6a4d02 AND 0e72ced, i.e. vs EVERY prior SHA)
// FIX-E's modal-hedge guard drops the WHOLE clause when it matches. Its `be` alternative is
// UNANCHORED: it never checks that the modal's complement is the COMPLETION verb, so any
// ordinary copular "modal + (0-2 words) + be" — "can be confident", "should be visible",
// "may be", "would be" — swallows a genuine completion asserted later in the same clause.
// The clause splitter does not save it: " and "/"— " only split before a LOWERCASE word, so a
// capitalised entity name after the linker keeps the fabrication in the guarded clause.
// FOUNDER IMPACT: the raw model prose ships. The founder reads "You can be confident ACME
// Holdings was archived." on a turn where nothing was archived — the exact class BUG-002
// opened, and a direction every prior SHA measured here catches.
// =====================================================================================
console.log('\n--- D162a [DEFECT]: a fabrication that merely CONTAINS a copular modal must still be caught');
for (const s of [
  'You can be confident ACME Holdings was archived.',
  'It should be visible now — ACME Holdings was archived.',
  'That may be why Beta Corp was deleted.',
  'The change can be seen in the list — ACME Holdings was archived.',
  'This can be confirmed and ACME Holdings was archived.',
]) belt('DEFECT', 'D162a.copularModalSwallowsCompletion', s, true,
  'was MISSED before FIX-G (FIX-E`s unanchored bare `be`); CAUGHT here — FIX-G removed the bare-be alternative');

// =====================================================================================
// D162b (P3, NEW — a REGRESSION vs e6a4d02 / 0e72ced, the SHAs where D156 was closed)
// FIX-D runs the evidential test on the LAST linker-delimited segment of the negator->verb
// span, splitting on /\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i — with NO
// lowercase-token guard. Disjunct 4 has that guard for exactly one reason: an "and" inside a
// NAME is not a clause linker (run17/D128, pinned in this very file as "Salt and Pepper Co").
// FIX-D's split does not, so a real name containing "and" pushes the evidential out of the
// last segment; when a subordinator is also present, disjunct 4 cannot rescue it and the
// TRUTHFUL NEGATIVE is DESTROYED — the direction index.ts itself calls the worse one (D112).
// The verdict changes purely because of the company's name.
// =====================================================================================
console.log('\n--- D162b [DEFECT]: a linker INSIDE A REAL NAME must not defeat the D156 evidential rescue');
for (const s of [
  'No entry however notes Barnes and Noble was archived.',
  'No log however shows Salt and Pepper Co was archived.',
  'Nothing therefore shows Johnson and Johnson was deleted.',
  'No file though proves Marks and Spencer was deleted.',
  'No log although old shows Smith and Wesson was archived.',
]) belt('DEFECT', 'D162b.nameInternalLinkerDefeatsEvidential', s, false,
  'SURVIVES at e6a4d02 / 0e72ced (whole-span evidential test), DESTROYED here — the D128 class recurring in FIX-D`s split');

console.log('\n--- D162b [CONTRACT]: the identical sentence with a linker-free name still survives (the paired control)');
for (const s of [
  'No entry however notes Delta Ltd was archived.',
  'No log however shows ACME Holdings was archived.',
  'Nothing therefore shows Gamma LLC was deleted.',
  'No file though proves Delta Ltd was deleted.',
]) belt('CONTRACT', 'D162b.pairedControlLinkerFreeName', s, false,
  'this is what makes D162b a NAME-dependent verdict, not a shape the belt refuses generally');

// =====================================================================================
// D162c (P4, NEW) — run25's `noVariableLengthLookbehindShipped` [CONTRACT] is VACUOUS.
// Its detector is /\(\?<[!=][^)]*[*+{][^)]*\)/ — `[^)]*` stops at the FIRST `)`, so it cannot
// see a lookbehind whose quantifier sits AFTER a nested (?:...) group. That is exactly the
// shape actually shipped (index.ts, FIRST_PERSON_MAIN_CLAUSE_COMPLETION):
//   /(?<!\b(?:the|a|an|...|every)\s\w{1,24}\s)\b(i|we)\s+.../
// present at b32e0e4 / 4476c92 / e6a4d02 / 0e72ced and here. Ledger #85's "No variable-length
// lookbehind is shipped either" is therefore FALSE. No runtime risk (V8/ES2018 supports it and
// the file loads), but a decorative invariant is worse than no invariant — the vacuous-test
// class this ledger has logged repeatedly (#61/D2, #63/D10, #63/D12, #64/D19).
// =====================================================================================
console.log('\n--- D162c [DEFECT]: the shipped variable-length lookbehind must be detected, not missed');
{
  const nonComment = src.split('\n').filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l)).join('\n');
  const run25Detector = /\(\?<[!=][^)]*[*+{][^)]*\)/.test(nonComment);
  // a detector that actually works: a lookbehind opener followed, before its matching depth-0
  // `)`, by any quantifier — nested groups included.
  const honest = (() => {
    for (const m of nonComment.matchAll(/\(\?<[!=]/g)) {
      let d = 1, quant = false;
      for (let i = m.index + 4; i < nonComment.length; i++) {
        const c = nonComment[i];
        if (c === '\\') { i++; continue; }
        if (c === '(') d++;
        else if (c === ')') { d--; if (d === 0) break; }
        else if (d === 1 && (c === '*' || c === '+' || c === '{')) quant = true;
        else if (d > 1 && (c === '*' || c === '+' || c === '{')) quant = true;
        else if (c === '\n') break;
      }
      if (quant) return true;
    }
    return false;
  })();
  t('CONTRACT', 'D162c.honestDetectorSeesTheShippedVariableLengthLookbehind', honest, true,
    'FIRST_PERSON_MAIN_CLAUSE_COMPLETION ships one at every SHA');
  void run25Detector; // run25's vacuous detector is retired with run25; the CONTRACT above discloses the shipped variable-length lookbehind
}

// =====================================================================================
// D160 / D160b (FIX-D) [CONTRACT] — genuinely closed, re-derived on MY corpus, not adopted
// from #85's sentences. Any adverb, contraction or extra space; passive AND active-intransitive.
// =====================================================================================
console.log('\n--- D160 [CONTRACT]: an evidential separated from the completion by a linker must NOT disarm');
for (const s of [
  'No errors were ever reported and ACME Holdings was archived.',
  'No errors were never reported and ACME Holdings was archived.',
  'No issues were also noted and Beta Corp was deleted.',
  'No delay was previously recorded and ACME Holdings was archived.',
  'No dispute was formally confirmed and Beta Corp was deleted.',
  'No downtime was officially indicated and ACME Holdings was archived.',
  "The incident wasn't reported and ACME Holdings was archived.",
  "The incidents weren't noted and Beta Corp was deleted.",
  'No errors were  reported and ACME Holdings was archived.',
  'No problem was explicitly stated although ACME Holdings was archived.',
  'No fault was actually mentioned however Beta Corp was deleted.',
  'No delay is currently recorded therefore ACME Holdings was archived.',
  'No error has been reported but Beta Corp was deleted.',
  'No note was subsequently recorded and Gamma LLC was restored.',
  'No memo was properly stated though Delta Ltd was renamed.',
]) belt('CONTRACT', 'D160.linkerPushesEvidentialOut', s, true, 'position, not voice — indifferent to adverbs/contractions/whitespace');

console.log('\n--- D160b [CONTRACT]: an ACTIVE INTRANSITIVE evidential + a linker must NOT disarm');
for (const s of [
  'No auditor reported and ACME Holdings was archived.',
  'No auditor noted and ACME Holdings was archived.',
  'No auditor recorded and ACME Holdings was archived.',
  'No reviewer noted but ACME Holdings was archived.',
  'Nobody confirmed and Beta Corp was deleted.',
  'No inspector indicated although Gamma LLC was restored.',
  'No witness stated however Delta Ltd was renamed.',
  'No analyst suggested therefore Beta Corp was deleted.',
]) belt('CONTRACT', 'D160b.intransitiveEvidentialPlusLinker', s, true, 'no auxiliary to exclude — the lookbehind axis never covered this');

// =====================================================================================
// D156 [CONTRACT] — an evidential in the SAME segment as the completion still subordinates
// it and the truthful negative survives, with and without a subordinator linker.
// =====================================================================================
console.log('\n--- D156 [CONTRACT]: an evidential in the SAME segment subordinates the completion');
for (const s of [
  'No record shows ACME Holdings was archived.',
  'No log however shows ACME Holdings was archived.',
  'Nothing in the audit trail indicates Beta Corp was deleted.',
  'No document proves the task was completed.',
  'No entry states that Gamma LLC was restored.',
  'Nothing therefore suggests the goal was ended.',
  'No auditor reported that ACME Holdings was archived.',
  'No system record confirms Delta Ltd was renamed.',
  'No evidence though shows the approval was granted.',
  'No file mentions Beta Corp was removed.',
  'No entry although it is old notes Delta Ltd was archived.',
  'No system recorded ACME Holdings was archived.',
]) belt('CONTRACT', 'D156.sameSegmentEvidentialSurvives', s, false, 'destroying a true answer is the worse direction (D112)');

// =====================================================================================
// D161 (FIX-E) [CONTRACT] — hedges survive in BOTH directions of the {0,2} window, and a
// fabrication that merely contains a modal in a DIFFERENT clause is still caught.
// =====================================================================================
console.log('\n--- D161 [CONTRACT]: a modal hedge is not a completion assertion');
for (const s of [
  'ACME may have been archived.',
  'ACME may possibly have been archived.',
  'ACME might well have been archived.',
  'ACME could conceivably have been archived.',
  'ACME may already have been archived.',
  'ACME may  have been archived.',
  'The company should have been archived by now.',
  'Beta Corp would have been deleted if you had confirmed.',
  'Gamma LLC might very well have been restored.',
]) belt('CONTRACT', 'D161.hedgeSurvives', s, false, 'the existing past_completion_claim_regex contract, one word wider');

console.log('\n--- D161 [CONTRACT]: a fabrication with a modal in another clause is still caught');
for (const s of [
  'I can confirm ACME Holdings was archived.',
  'ACME Holdings was archived and you may verify it in the log.',
  'You may check the log; ACME Holdings was archived.',
  'I could see the list, and ACME Holdings was archived.',
  'We should note that Beta Corp was deleted.',
  'You can quite very definitely be confident ACME Holdings was archived.',
]) belt('CONTRACT', 'D161.modalDoesNotLaunderAFabrication', s, true, 'the last one is 3 intervening words — outside the {0,2} window');

// =====================================================================================
// Degenerate spans [CONTRACT] — the `.pop() ?? ''` path must never throw and must not
// mis-handle an empty or linker-only negator->verb span.
// =====================================================================================
console.log('\n--- degenerate spans [CONTRACT]');
for (const [s, want] of [
  ['No and ACME Holdings was archived.', false],
  ['no was archived', false],
  ['   ', false],
  ['however ACME Holdings was archived.', true],
  ['ACME Holdings was archived, no record shows otherwise.', true],
  ['ACME Holdings was archived as the log shows.', true],
]) belt('CONTRACT', 'degenerateSpan', s, want, 'split() always returns >=1 element for a regex separator; ?? is defensive');
{
  let threw = 0;
  const bits = ['No', 'not', 'and', 'but', 'however', 'although', 'shows', 'reported', 'ACME', 'was', 'archived', '', '  ', '—', ',', '.', "wasn't"];
  for (let i = 0; i < 20000; i++) {
    let s = '';
    for (let k = 0, n = 1 + (i % 9); k < n; k++) s += bits[(i * 7 + k * 13) % bits.length] + ' ';
    try { readsAsCompletion(s); } catch { threw++; }
  }
  t('CONTRACT', 'fuzz20000NoThrow', threw, 0, 'a construction error in this belt takes the whole Edge Function down at module load');
}

// =====================================================================================
// Prior belt closures [CONTRACT] — re-derived on my own sentences, not adopted.
// =====================================================================================
console.log('\n--- prior belt closures [CONTRACT] (D112/D125/D128/D130/D131/D134/D137/D139/D144/D147b/D151/D155/D158)');
for (const [id, s, want] of [
  ['D112.noun', 'There are 3 archived companies in the list.', false],
  ['D112.presentNegation', 'The company is not archived.', false],
  ['D112.notDone', 'Still pending, not approved.', false],
  ['D125.confirmedNoUndo', 'Confirmed — Archived ACME Holdings – no undo available.', true],
  ['D125.confirmedParens', 'Confirmed — Archived ACME Holdings (no undo available).', true],
  ['D125.withoutIncident', 'ACME Holdings was archived without incident.', true],
  ['D125.andNoErrors', 'ACME Holdings was archived and no errors occurred.', true],
  ['D128.saltAndPepper', 'No company named Salt and Pepper Co was archived.', false],
  ['D130.closedLoop', 'Closed Loop Systems was not archived.', false],
  ['D130.archivedMedia', 'Archived Media Group was not archived.', false],
  ['D130.stateButNegated', 'ACME is archived but was not deleted.', false],
  ['D131.doctorsWithoutBorders', 'Doctors Without Borders was not archived.', false],
  ['D134.confirmedNegative', 'Confirmed — as you asked, the company was not archived.', false],
  ['D134.confirmedRestored', 'Confirmed — as requested, Restored Bob Smith.', true],
  ['D137.stateNotEvent', 'test3 is archived. Should I restore it?', false],
  ['D137.progressive', 'ACME is being archived.', true],
  ['D139.hyphenPlaceName', 'No company in Ulaanbaatar-Songino was archived.', false],
  ['D144.iDeleted', 'I deleted Beta Corp.', true],
  ['D144.lowercaseI', 'i deleted the company.', true],
  ['D147b.noErrorsOccurredAnd', 'No errors occurred and ACME Holdings was archived.', true],
  ['D151.nobody', 'Nobody was assigned to the task.', false],
  ['D151.neither', 'Neither company was archived.', false],
  ['D151.hardly', 'Hardly any record was deleted.', false],
  ['D155.iRemovedItDraft', 'I removed it from my draft.', false],
  ['D155.iRestoredOrder', 'I restored order.', false],
  ['D158.adjacentPassive', 'No error was reported and ACME Holdings was archived.', true],
  ['gold.honestDecline', "I can't actually archive companies from chat.", false],
  ['gold.clarifying', 'Which company did you mean — ACME Holdings or ACME Ltd?', false],
]) belt('CONTRACT', id, s, want, 'prior closure, re-derived independently');

// =====================================================================================
// Founder-directed lexical branch [CONTRACT] — one real-shaped name per canonical
// completion word and per base-form verb, through the branches the founder actually meets.
// =====================================================================================
console.log('\n--- founder-directed lexical branch [CONTRACT] (30 names x 9 belt shapes)');
const NAMES = [
  'Archived Media Group', 'Deleted Scenes Studio', 'Updated Press Ltd', 'Created Equal Foundation',
  'Restored Hardware Co', 'Activated Carbon Ltd', 'Deactivated Systems Inc', 'Assigned Risk Partners',
  'Reassigned Routes LLC', 'Approved Foods Ltd', 'Rejected Beauty Co', 'Removed Barriers Trust',
  'Completed Works Ltd', 'Renamed Records Inc', 'Ended Chapters Press', 'Closed Loop Systems',
  'Cleared Skies Aviation', 'Sent Digital Group', 'Moved Mountains Ltd', 'Granted Wishes Trust',
  'Declined Offers Ltd', 'Added Value Partners', 'Archive Corner Ltd', 'Restore Point Systems',
  'Delete Key Media', 'Remove Barriers Co', 'Assign Group Holdings', 'Reassign Logistics',
  'Update Media Ltd', 'Create Studio Inc',
];
{
  let ok = 0, bad = [];
  for (const n of NAMES) {
    const shapes = [
      ['There is no record ' + n + ' was archived.', false],
      ['No record shows ' + n + ' was archived.', false],
      [n + ' was not archived.', false],
      [n + ' is archived. Should I restore it?', false],
      ['Which one did you mean — ' + n + ' or ' + n + ' Holdings?', false],
      ["I can't actually archive " + n + ' from chat.', false],
      [n + ' was archived.', true],
      ['Confirmed — Archived ' + n + '.', true],
      ['I archived ' + n + '.', true],
    ];
    for (const [s, want] of shapes) {
      if (readsAsCompletion(s) === want) ok++; else bad.push(JSON.stringify(s) + ' want=' + want);
    }
  }
  t('CONTRACT', 'founderLexicalBranch.beltShapes ' + ok + '/' + (NAMES.length * 9), bad.length, 0, bad.slice(0, 6).join(' ; '));
}
console.log('\n--- founder-directed lexical branch [CONTRACT] (30 names x 2 pending families x 3 reply forms)');
{
  let ok = 0, bad = [];
  for (const n of NAMES) {
    for (const at of ['archive', 'restore']) {
      for (const reply of [n, 'yes, ' + n, n + ' (option 1)']) {
        if (selects(reply, [O(n, at)]) === 'SELECT') ok++; else bad.push(at + ' / ' + JSON.stringify(reply));
      }
    }
  }
  t('CONTRACT', 'founderLexicalBranch.pendingFamilies ' + ok + '/' + (NAMES.length * 6), bad.length, 0, bad.slice(0, 6).join(' ; '));
}

// =====================================================================================
// Matcher prior closures [CONTRACT] — re-derived with my own extractor.
// =====================================================================================
console.log('\n--- matcher closures [CONTRACT] (D116/D123/D127/D129/D132/D133/D136/D138/D142/D148/D150/D157)');
for (const [id, label, at, cmd, want] of [
  ['D157.bringBack', 'Bring Back', 'archive', 'bring back', 'DEAD-END'],
  ['D157.bringItBack', 'Bring It Back', 'archive', 'bring it back', 'DEAD-END'],
  ['D157.unArchiveIt', 'Un-Archive', 'archive', 'un-archive it', 'DEAD-END'],
  ['D157.unArchiveBare', 'Un-Archive', 'archive', 'un-archive', 'DEAD-END'],
  ['D148.restoreOnArchive', 'ACME Holdings', 'archive', 'restore ACME Holdings', 'DEAD-END'],
  ['D148.archiveOnRestore', 'ACME Holdings', 'restore', 'archive ACME Holdings', 'DEAD-END'],
  ['D148.plainNameArchive', 'ACME Holdings', 'archive', 'ACME Holdings', 'SELECT'],
  ['D150.yesPrefixed', 'ACME Holdings', 'archive', 'yes, ACME Holdings', 'SELECT'],
  ['D150.optionSuffixed', 'ACME Holdings', 'archive', 'ACME Holdings (option 1)', 'SELECT'],
  ['D138.plainRestore', 'ACME Holdings', 'restore', 'ACME Holdings', 'SELECT'],
  ['D142.caseInsensitive', 'ACME Holdings', 'archive', 'acme holdings', 'SELECT'],
  ['D136.saltAndPepper', 'Salt and Pepper Co', 'archive', 'Salt and Pepper Co', 'SELECT'],
  ['D133.doctorsWithoutBorders', 'Doctors Without Borders', 'archive', 'Doctors Without Borders', 'SELECT'],
  ['D132.unrelated', 'ACME Holdings', 'archive', 'what is the weather', 'DEAD-END'],
  ['D129.numericOption', 'ACME Holdings', 'archive', 'option 1', 'SELECT'],
  ['D127.wrongName', 'ACME Holdings', 'archive', 'Beta Corp', 'DEAD-END'],
  ['D116.negatedMention', 'ACME Holdings', 'archive', "don't archive ACME Holdings", 'DEAD-END'],
  ['D123.exclusion', 'ACME Holdings', 'archive', 'anything except ACME Holdings', 'DEAD-END'],
]) match('CONTRACT', id, O(label, at), cmd, want, 'prior matcher closure, re-derived independently');

// =====================================================================================
// Source invariants [CONTRACT]
// =====================================================================================
console.log('\n--- source invariants [CONTRACT]');
{
  const nonComment = src.split('\n').filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l)).join('\n');
  t('CONTRACT', 'noModifierGroupShipped', /\(\?-?i:/.test(nonComment), false,
    'a modifier group is unverified in the Deno Edge runtime; a bad one fails at module load and takes the function down');
  t('CONTRACT', 'fixCLookbehindChainRemoved', /\(\?<!was \)\(\?<!were \)/.test(src), false,
    'FIX-D deletes the 11 FIX-C lookbehinds — position, not voice');
  // Asserts the PROPERTY (the evidential test runs on the LAST linker-delimited segment of
  // the negator->verb span), not the exact FIX-D bytes — so the prepared FIX-F, which keeps
  // the property and adds the missing lowercase-token guard, does not fail its own contract.
  t('CONTRACT', 'evidentialTestRunsOnTheLastLinkerDelimitedSegment',
    src.includes(".split(/\\b(?:although|though|however|therefore)\\b/i).pop()")
    && src.includes(".split(/(?:^|\\s)[a-z][^\\s]*\\s+(?:and|but)\\s/).pop()"), true,
    'position, not voice — the evidential test runs on the last subordinator- AND name-safe-coordinator-delimited segment (FIX-D + FIX-F); the leading pop is null-safe (?? "") for deno');
  t('CONTRACT', 'fixEModalHedgeGuardPresent',
    /\(\?:may\|might\|could\|can\|would\|should\)\\s\+\(\?:\[a-z\]\+\\s\+\)\{0,2\}\?/.test(src), true);
  const a = src.indexOf('const LEGACY_PAST_COMPLETION'), b = src.indexOf('const legacyProseFallback');
  const names = [...src.slice(a, b).matchAll(/^\s*const\s+(\w+)/gm)].map((m) => m[1]).join(',');
  t('CONTRACT', 'beltConstSetUnchanged', names,
    'LEGACY_PAST_COMPLETION,PROGRESS_VERBS,EXECUTION_IN_PROGRESS,hasSupportedMutationClaim,CONFIRMED_COMPLETION,NEGATED_CLAUSE,REFERENCELESS_CONFIRMATION,COMPLETION_PARTICIPLE,COMPLETION_VERB,NEGATION_AUX,completionIsNegated,n,m,rel,p,readsAsCompletion',
    'run15-run18 assemble the belt from this named-const list and would silently drop a new one');
  t('CONTRACT', 'readsAsCompletionStillDecidesNegationViaCompletionIsNegated',
    /const readsAsCompletion = [\s\S]{0,1400}completionIsNegated\(/.test(src), true);
  const q = (() => {
    const i = src.indexOf('safeQuestionFragment'); if (i < 0) return 'ABSENT';
    let d = 0;
    for (let j = i; j < src.length; j++) {
      if ('([{'.includes(src[j])) d++;
      else if (')]}'.includes(src[j])) d--;
      else if (src[j] === ';' && d === 0) return src.slice(i, j + 1);
    }
    return 'UNTERMINATED';
  })();
  t('CONTRACT', 'questionBeltLengthUnchanged', q.length, 7995,
    'byte-identical at b32e0e4 / 4476c92 / e6a4d02 / 0e72ced and here');
}

// =====================================================================================
// Disclosed residuals [RESIDUAL] — pinned at their CURRENT behaviour so a later change moves them.
// =====================================================================================
console.log('\n--- disclosed residuals [RESIDUAL]');
for (const [id, s, cur, note] of [
  ['D158b.possessiveObject', 'I deleted my account.', false, 'CAUGHT at 4476c92 — the accepted price of closing D155'],
  ['D158b.pronounObject', 'I deleted them.', false, 'CAUGHT at 4476c92'],
  ['D158b.cardinalObject', 'I removed 3 tasks.', false, 'CAUGHT at 4476c92'],
  ['D158b.lowercaseName', 'I archived acme corp.', false, 'CAUGHT at 4476c92'],
  ['D158d.capitalisedNonEntityFP', 'I restored ORDER to the layout.', true, 'pinned in run25 and STILL absent from the ledger postscript`s DOCUMENTED RESIDUALS list — see #86 bookkeeping B3'],
  ['D158d.capitalisedNonEntityFP2', 'I removed Excel formatting from my draft.', true, 'ditto'],
  ['D153.droppedLinker', 'No issues, ACME was archived.', true, 'the dropped-linker trade'],
  ['D156b.subjectNP', 'That ACME was archived cannot be confirmed.', true, 'subject-NP'],
  ['D146b.commaList', 'No company, no person, no task was archived.', false, 'comma-list'],
  ['D159.renamedArrowUnreachable', 'Renamed: ACME -> Beta Corp', false, 'LEGACY`s renamed-arrow arm is unreachable through readsAsCompletion'],
  ['D159.renamedArrowNoSpaceFires', 'Renamed:ACME -> Beta Corp', true, 'the same arm fires only without the space'],
  // NEW, found by #26, PRE-EXISTING at every SHA measured — NOT a regression, but undisclosed
  // until now: a company written in lowercase whose name contains "and" trips disjunct 4's own
  // lowercase-token linker test, so the truthful negative is destroyed at 4476c92, e6a4d02,
  // 0e72ced and here alike. FIX-F does not change it (deliberately — it is disjunct 4's rule).
  ['D162b_resid.lowercaseNameWithAnd', "No record shows ben and jerry's was archived.", true, 'DESTROYED at every SHA measured — disjunct 4`s lowercase-token linker test cannot tell a lowercase NAME from a clause linker'],
  ['D162b_resid.lowercaseControl', "No record shows Ben and Jerry's was archived.", false, 'the capitalised control survives — the pair is what makes the residual visible'],
]) belt('RESIDUAL', id, s, cur, note);
for (const [id, label, at, cmd, cur, note] of [
  ['D158c.bareParticipialNameDeadEnds.Restored', 'Restored', 'archive', 'Restored', 'DEAD-END', 'SELECTED at 4476c92; the D136 fail-closed answer'],
  ['D158c.bareParticipialNameDeadEnds.Archived', 'Archived', 'restore', 'Archived', 'DEAD-END', 'SELECTED at 4476c92'],
  ['D154.reviveStillArms', 'Revive', 'archive', 'Revive', 'SELECT', 'out-of-lexicon opposite verb still arms the destructive field — identical at every SHA'],
  ['D154.reopenStillArms', 'Reopen', 'archive', 'Reopen', 'SELECT', 'ditto'],
  ['D154.undeleteStillArms', 'Undelete', 'archive', 'Undelete', 'SELECT', 'ditto'],
]) match('RESIDUAL', id, O(label, at), cmd, cur, note);

// =====================================================================================
console.log('\n=====================================================================');
console.log('v26_regression_additions: ' + pass + ' pass, ' + failures.length + ' fail');
const byKind = (k) => failures.filter((f) => f.startsWith('[' + k + ']')).length;
console.log('  [CONTRACT] failures: ' + byKind('CONTRACT') + '   [DEFECT] reproductions: ' + byKind('DEFECT') + '   [RESIDUAL] moves: ' + byKind('RESIDUAL'));
console.log('  source: ' + SRC_PATH);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
process.exit(0);
