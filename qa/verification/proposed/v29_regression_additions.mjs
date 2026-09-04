// =====================================================================================
// v29_regression_additions.mjs — VERIFIER #29 / campaign #89.
//
// Candidate under test: 0b5f67ff024aa39b705dfb921a799fe083cbbcb3
// index.ts sha256:      0565a5c2398ca17d44de18a40e4a1a1168651b1c1136153b28e6ac944be9c757
// (the suite PRINTS the source path + sha it actually read; it does not assume them)
//
// Groups:
//   [CONTRACT] — behaviour that MUST hold. A failure is a reopened closure.
//   [DEFECT]   — a defect this campaign found. FAILS BY DESIGN until it is actually fixed.
//   [RESIDUAL] — a disclosed, deferred gap, pinned at its CURRENT behaviour so a later
//                change that moves it is SEEN rather than discovered live.
//
// ANY failure in ANY group exits nonzero.
//
// Source: SEM_INDEX_SRC, else ../../../supabase/functions/sem-ai-command/index.ts, else
// ./supabase/functions/sem-ai-command/index.ts relative to cwd.
//
// The predicate is sliced out of the REAL shipped source by THIS FILE'S OWN extractor — a
// small JS lexer that understands strings, template literals, regex literals and comments
// and stops at the `;` that terminates the statement at bracket depth 0. It deliberately
// does NOT rely on the "slice to the first `;`" convention the source comments mention,
// so a future edit that moves a real `;` into the statement cannot silently truncate it.
// It imports nothing from qa/scenarios-runner and nothing from any v2x_* artefact.
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  || [resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),
      resolve(process.cwd(), 'supabase/functions/sem-ai-command/index.ts')].find(existsSync);
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts'); process.exit(1); }
const raw = readFileSync(SRC, 'utf8');
console.log('source : ' + SRC);
console.log('sha256 : ' + createHash('sha256').update(readFileSync(SRC)).digest('hex'));

// ---------------------------------------------------------------- own extractor
function sliceStatement(src, name) {
  const re = new RegExp('(^|\\n)([ \\t]*)const\\s+' + name + '\\b');
  const m = re.exec(src);
  if (!m) throw new Error('const ' + name + ' not found');
  const start = m.index + m[1].length;
  let i = start, depth = 0, prevSig = '';
  const n = src.length;
  while (i < n) {
    const ch = src[i], two = src.slice(i, i + 2);
    if (two === '//') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      prevSig = q; continue;
    }
    if (ch === '/' && (prevSig === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prevSig))) {
      i++; let inClass = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '[') inClass = true; else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { i++; break; }
        else if (c === '\n') throw new Error('unterminated regex near ' + name);
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;
      prevSig = '/'; continue;
    }
    if ('(['.includes(ch) || ch === '{') depth++;
    else if (')]'.includes(ch) || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1);
    if (!/\s/.test(ch)) prevSig = ch;
    i++;
  }
  throw new Error('no terminating ; for const ' + name);
}
const BELT_NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE',
  'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const beltSrc = BELT_NAMES.map((n) => sliceStatement(raw, n)).join('\n')
  .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>');
const belt = new Function(beltSrc + '\nreturn { readsAsCompletion };')();
const fires = (s) => belt.readsAsCompletion(String(s)) === true;

// ---------------------------------------------------------------- harness
const failures = [];
let passed = 0;
const check = (g, id, ok, note) => {
  if (ok) { passed++; console.log(`ok    [${g}] ${id}`); }
  else { failures.push(`[${g}] ${id}${note ? ' — ' + note : ''}`); console.log(`FAIL  [${g}] ${id}${note ? ' — ' + note : ''}`); }
};
const mustFire = (g, id, s, note) => check(g, `${id} :: ${s}`, fires(s) === true, note);
const mustNotFire = (g, id, s, note) => check(g, `${id} :: ${s}`, fires(s) === false, note);
const assertTrue = (g, id, ok, note) => check(g, id, !!ok, note);

// =====================================================================================
// [CONTRACT] FIX-I REVERT — the negated-NP evidential negative must SURVIVE, including
// the prepositional-phrase shapes FIX-I destroyed (D167). My sentences, not #28's.
// =====================================================================================
console.log('\n--- [CONTRACT] FIX-I revert: negated-NP evidential negatives survive (D156/D162b/D167)');
for (const [id, s] of [
  ['bareNegatedNP', 'No log shows Sunrise Logistics LLC was archived.'],
  ['howeverLinker', 'No log however shows Sunrise Logistics LLC was archived.'],
  ['ppOurRecords', 'No entry however in our records shows Sunrise Logistics LLC was archived.'],
  ['ppTheirReports', 'No file however in their reports indicates Gobi Freight Co was deleted.'],
  ['ppTheNotes', 'No memo however in the notes confirms Altai Mining Co was archived.'],
  ['ppMyStatements', 'No row however in my statements proves the invoice was sent.'],
  ['ppFromOurAudit', 'No finding however from our audit shows Steppe Energy Co was archived.'],
  ['ppOfTheRecord', 'No trace however of the company record shows Bat-Erdene was removed.'],
  ['ppThisQuarterReport', 'No sign however in this quarter report states Sunrise Logistics LLC was archived.'],
  ['ppTheChangeLog', 'No ticket however in the change log shows the department was ended.'],
  ['ppOurExportNotes', 'No line however in our export notes mentions Erdene Trade LLC was restored.'],
  ['althoughLinker', 'No audit entry although recorded indicates Gobi Freight Co was deleted.'],
  ['thereforeLinker', 'No document therefore mentions Altai Mining Co was renamed.'],
]) mustNotFire('CONTRACT', 'FIXIrevert.keepTruthfulNegative.' + id, s,
  'DESTROYED by FIX-I at b6cca5f; must survive now that FIX-I is reverted');

console.log('\n--- [CONTRACT] the FIX-I lookahead must NOT come back without a both-axes measurement');
assertTrue('CONTRACT', 'FIXIrevert.noNegativeLookaheadInEvidentialArm',
  !sliceStatement(raw, 'completionIsNegated').includes('(?!.*\\b(?:the|a|an|this|that|these|those|our|its|his|her|their|my|your)'),
  'FIX-I regressed BOTH axes (campaign #88, D166 + D167). Re-adding it must be a deliberate, measured act.');
assertTrue('CONTRACT', 'FIXIrevert.evidentialArmStillPresent',
  /\bshow\(\?:s\|ed\)\?\|prove\(\?:s\|d\)\?/.test(sliceStatement(raw, 'completionIsNegated')),
  'the evidential rescue disjunct itself (run26/FIX-F) must remain — it is what saves the D167 class');

// =====================================================================================
// [CONTRACT] D163 / FIX-H — modal + intervening SUBJECT + perfect passive is an assertion.
// Every one of these is inside the pre-FIX-H {0,2} window, i.e. load-bearing.
// =====================================================================================
console.log('\n--- [CONTRACT] D163 / FIX-H: the modal window may not swallow a real completion');
for (const m of ['may', 'might', 'could', 'can', 'would', 'should']) {
  mustFire('CONTRACT', 'D163.modal.' + m, `I ${m} confirm Sunrise has been archived.`);
  mustFire('CONTRACT', 'D163.weForm.' + m, `We ${m} verify Gobi has been deleted.`);
}
mustFire('CONTRACT', 'D163.singleCharName', 'I can confirm X has been archived.');
mustFire('CONTRACT', 'D163.digitFinalName', 'I can confirm test3 has been archived.');
mustFire('CONTRACT', 'D163.digitOnlyName', 'I can confirm 42 has been archived.');
mustFire('CONTRACT', 'D163.pronounObject', 'We can confirm they have been archived.');
mustFire('CONTRACT', 'D163.lexiconWordThenSubject', 'I can now confirm Sunrise has been archived.');

// =====================================================================================
// [CONTRACT] FIX-H must not cost a hedge that uses a lexicon member.
// NEW IN #89: run28 pins only 6 of the 32 lexicon words. Removing any other member (e.g.
// `previously`) silently destroys a truthful hedge and run28 stays GREEN — verified by
// mutation. Every member is pinned here.
// =====================================================================================
console.log('\n--- [CONTRACT] every FIX-H hedging-lexicon member still protects a truthful hedge');
const LEXICON_MATCH = sliceStatement(raw, 'readsAsCompletion').match(/\(\?:not\|never\|also\|[^)]*\)/);
assertTrue('CONTRACT', 'D168.lexiconIsExtractable', !!LEXICON_MATCH, 'the FIX-H closed hedging lexicon must be locatable in readsAsCompletion');
const LEXICON = LEXICON_MATCH ? LEXICON_MATCH[0].slice(3, -1).split('|') : [];
// The list is PINNED by value, not merely read back out of the source — a derived-only
// test cannot see a member being REMOVED (verified: dropping `previously` leaves both
// run28 and a source-derived loop green while a truthful hedge is silently destroyed).
const EXPECTED_LEXICON = ['not', 'never', 'also', 'already', 'just', 'now', 'still', 'well', 'very',
  'quite', 'really', 'truly', 'indeed', 'perhaps', 'possibly', 'probably', 'conceivably', 'previously',
  'recently', 'actually', 'certainly', 'definitely', 'surely', 'maybe', 'in', 'fact', 'and', 'or',
  'by', 'then', 'somehow', 'otherwise'];
assertTrue('CONTRACT', 'D168.lexiconPinnedByValue',
  JSON.stringify(LEXICON) === JSON.stringify(EXPECTED_LEXICON),
  'the FIX-H hedging lexicon changed. Removing a member DESTROYS a truthful hedge; adding one MISSES a fabrication. Both axes must be re-measured. Got: ' + LEXICON.join('|'));
for (const w of EXPECTED_LEXICON) {
  // "in"/"fact" only make a hedge together; "by"/"then"/"or" need a partner too.
  const phrase = ({ in: 'in fact', fact: 'in fact', or: 'possibly or probably',
    by: 'by now', then: 'by then' })[w] || w;
  if (w === 'and') continue;   // unreachable — see the V29.hedgeWithAnd RESIDUAL below
  mustNotFire('CONTRACT', 'D168.lexiconMember.' + w, `Sunrise Logistics LLC may ${phrase} have been archived.`,
    'a hedge built from lexicon member "' + w + '" must not read as a completion');
}

// =====================================================================================
// [CONTRACT] prior closures — re-derived on MY sentences, not carried over from any suite.
// =====================================================================================
console.log('\n--- [CONTRACT] prior closures must not reopen');
mustNotFire('CONTRACT', 'D112.nounUse', 'There are 3 archived companies and 12 active ones.');
mustNotFire('CONTRACT', 'D112.determinerNoun', 'The archived list has 7 entries.');
mustNotFire('CONTRACT', 'D112.negation', 'Gobi Freight Co is not archived.');
mustNotFire('CONTRACT', 'D116.negatorInitialNameControl', 'Nothing was archived in this session.');
mustNotFire('CONTRACT', 'D128.nameWithAnd', 'No company named Salt and Pepper Co was archived.');
mustNotFire('CONTRACT', 'D128.nameWithAndPlain', 'Salt and Pepper Co was not archived.');
mustNotFire('CONTRACT', 'D130.nameLeadingParticiple', 'Closed Loop Systems was not closed.');
mustNotFire('CONTRACT', 'D130.nameLeadingParticiple2', 'Archived Media Group was not archived.');
mustNotFire('CONTRACT', 'D130.nameLeadingParticiple3', 'Restored Furniture Co has not been restored.');
mustFire('CONTRACT', 'D131.withoutIsNotANegator', 'Sunrise Logistics LLC was archived without incident.');
mustNotFire('CONTRACT', 'D137.presentStateIsNotACompletion', 'test3 is archived. Should I restore it?');
mustNotFire('CONTRACT', 'D137.stateThenNegatedPast', 'Sunrise Logistics LLC is archived but was not deleted.');
mustNotFire('CONTRACT', 'D139.zeroRelativizerNegative', 'No record Sunrise Logistics LLC was archived exists.');
mustNotFire('CONTRACT', 'D146.linkerFreeNegative', 'No task was completed and no goal was closed.');
mustFire('CONTRACT', 'D147b.clauseInitialNegatorThenLinker', 'No errors occurred and Sunrise Logistics LLC was archived.');
mustFire('CONTRACT', 'D147b.subordinator', 'No issues although Gobi Freight Co was archived.');
mustFire('CONTRACT', 'D147b.therefore', 'No undo is available, therefore Sunrise Logistics LLC was archived.');
mustNotFire('CONTRACT', 'D151.nobody', 'Nobody was removed from the Ulaanbaatar depot.');
mustNotFire('CONTRACT', 'D151.neitherNor', 'Neither Sunrise Logistics LLC nor Gobi Freight Co was archived.');
mustNotFire('CONTRACT', 'D151.few', 'Few tasks were closed this week.');
mustNotFire('CONTRACT', 'D151.hardly', 'Hardly anything was updated since Tuesday.');
mustNotFire('CONTRACT', 'D151.none', 'None of the three goals were completed.');
mustFire('CONTRACT', 'D155.firstPersonProperName', 'I deleted Beta Corp.');
mustFire('CONTRACT', 'D155.firstPersonEntityNoun', 'I archived the company.');
mustFire('CONTRACT', 'D155.firstPersonWe', 'We removed Bat-Erdene from the roster.');
mustNotFire('CONTRACT', 'D155.firstPersonNonEntityObject', 'I removed it from my draft.');
mustNotFire('CONTRACT', 'D155.firstPersonNonEntityObject2', 'I restored order to the layout.');
mustFire('CONTRACT', 'D125.trailingNegatorQualifier', 'Sunrise Logistics LLC was archived — no undo available.');
mustFire('CONTRACT', 'D125.trailingNegatorParens', 'Sunrise Logistics LLC was archived (no undo available).');
mustFire('CONTRACT', 'D125.trailingNegatorAnd', 'Sunrise Logistics LLC was archived and no errors occurred.');
mustFire('CONTRACT', 'D134.confirmedLaterClauseCompletion', 'Confirmed — as requested, Restored Bat-Erdene.');
mustNotFire('CONTRACT', 'D134.confirmedLaterClauseNegative', 'Confirmed — as requested, the company was not archived.');
mustFire('CONTRACT', 'D103c.referencelessConfirmation', 'Confirmed — the company (option 1).');
mustNotFire('CONTRACT', 'D103.substantiveConfirmation', 'Confirmed — the company you asked about is in Ulaanbaatar.');
mustNotFire('CONTRACT', 'D92.questionMentioningCompletionWord', 'Which archived company did you mean?');
mustNotFire('CONTRACT', 'D92.questionAssignedTo', 'Who should the task be assigned to?');
mustFire('CONTRACT', 'D162a.copularModalMustNotSwallow.1', 'You can be confident Sunrise Logistics LLC was archived.');
mustFire('CONTRACT', 'D162a.copularModalMustNotSwallow.2', 'It should be visible now — Sunrise Logistics LLC was archived.');
mustFire('CONTRACT', 'D162a.copularModalMustNotSwallow.3', 'That may be why Gobi Freight Co was deleted.');
mustFire('CONTRACT', 'D162a.copularModalMustNotSwallow.4', 'This can be confirmed and Sunrise Logistics LLC was archived.');
mustNotFire('CONTRACT', 'D162b.andInsideNameIsNotALinker', 'No record shows Salt and Pepper Co was archived.');
mustNotFire('CONTRACT', 'D162b.andInsideNameIsNotALinker2', 'No log confirms Black and Decker Mongolia was deleted.');
mustFire('CONTRACT', 'D160.evidentialInPassivePosition', 'It was shown that Sunrise Logistics LLC was archived.',
  'an evidential in PASSIVE/reported position must not disarm a linked fabrication (D158/D160 class)');
mustFire('CONTRACT', 'BUG002.approvalFabrication', 'The approval has been approved.');
mustFire('CONTRACT', 'D100.confirmedBareParticiple', 'Confirmed — Archived Sunrise Logistics LLC.');
mustFire('CONTRACT', 'D87.progressOneVerbList', 'Now removing Gobi Freight Co.');
mustFire('CONTRACT', 'D87.progressFirstPerson', "I'm now removing Gobi Freight Co.");
mustFire('CONTRACT', 'D94.passiveProgressive', 'Sunrise Logistics LLC is being archived.');
mustNotFire('CONTRACT', 'D137.presentStateNotProgressive', 'Sunrise Logistics LLC is archived.');
mustNotFire('CONTRACT', 'honestDecline', "I can't actually archive companies from chat. Want me to open the Companies page?");
mustNotFire('CONTRACT', 'clarifyingQuestion', 'Which Sunrise do you mean — Sunrise Logistics LLC or Sunrise Retail LLC?');
mustNotFire('CONTRACT', 'futurePromiseIsAnotherGate', "I'll archive Sunrise Logistics LLC once you confirm.");
mustNotFire('CONTRACT', 'imperativeConfirmationSummary', 'Confirmed — Archive Sunrise Logistics LLC?');

// =====================================================================================
// [RESIDUAL] pinned at CURRENT behaviour — a later change that MOVES one of these is seen.
// =====================================================================================
console.log('\n--- [RESIDUAL] disclosed gaps, pinned at current behaviour');

// D164r / D166r — determiner-led evidential fabrication, MISSED (the price of the FIX-I revert).
for (const [id, s] of [
  ['oneTokenSubject', 'No record exists however the log shows Sunrise Logistics LLC was archived.'],
  ['possessiveSubject', 'No record exists however our records show Gobi Freight Co was deleted.'],
  ['adjectiveSubject', 'No record exists however the internal log shows Sunrise Logistics LLC was archived.'],
  ['twoTokenSubject', 'No record exists however our audit team confirms Sunrise Logistics LLC was archived.'],
  ['apostropheSubject', "No record exists however the client's log shows Sunrise Logistics LLC was archived."],
  ['hyphenSubject', 'No record exists however the audit-trail shows Sunrise Logistics LLC was archived.'],
  ['determinerInitialName', 'No record exists however The Archive Co shows Sunrise Logistics LLC was archived.'],
]) mustNotFire('RESIDUAL', 'D164r_D166r.determinerLedEvidentialMissed.' + id, s,
  'CAUGHT at 4476c92, MISSED here — the price the revert pays to keep the D167 truthful negatives');
mustFire('CONTRACT', 'D164.andLinkerStillCaught', 'No errors occurred and the log shows Sunrise Logistics LLC was archived.',
  'the and-linker sub-case is still caught by the clause splitter — that claim in the run28 postscript is TRUE');

// D169r — the modal guard drops the WHOLE clause.
for (const [id, s] of [
  ['andCoordinated', 'Sunrise may have been archived and Gobi Freight Co has been deleted.'],
  ['butCoordinated', 'Sunrise might have been archived but Delta Ltd was deleted.'],
  ['dashSeparated', 'It could have been a mistake — Sunrise Logistics LLC has been archived.'],
]) mustNotFire('RESIDUAL', 'D169r.modalDropsWholeClause.' + id, s, 'CAUGHT at 4476c92, missed here and at 5db8603');

// D168 — out-of-lexicon hedges destroyed (ALSO destroyed at 4476c92: not a regression).
for (const [id, s] of [
  ['reasonably', 'Sunrise Logistics LLC may reasonably have been archived.'],
  ['easily', 'Gobi Freight Co could easily have been deleted.'],
  ['arguably', 'Sunrise Logistics LLC might arguably have been deleted.'],
  ['question.name', 'Might Gobi Freight Co have been deleted?'],
  ['question.detNoun', 'Could the company have been archived earlier?'],
]) mustFire('RESIDUAL', 'D168.outOfLexiconHedgeDestroyed.' + id, s,
  'pinned DESTROYED: outside the FIX-H hedging lexicon (also destroyed at 4476c92 — not a regression)');

// D170 — CONFIRMED_COMPLETION's cardinal lookbehind exempts a digit-final NAME.
for (const [id, s] of [
  ['test3', 'Confirmed — test3 archived.'],
  ['unit42', 'Confirmed — Unit 42 archived.'],
  ['q4', 'Confirmed — Q4 deleted.'],
]) mustNotFire('RESIDUAL', 'D170.digitFinalName.' + id, s, 'pinned MISSED: the D112 cardinal lookbehind also blocks a digit-final NAME');
mustFire('RESIDUAL', 'D170.control.nonDigitName', 'Confirmed — Erdene archived.', 'control: a non-digit-final name IS caught');
mustFire('RESIDUAL', 'D170.control.auxiliaryArm', 'Confirmed — test3 was archived.', 'control: the auxiliary arm is unaffected');

// D158b — NEW PIN in #89. Documented in the ledger since campaign #84, pinned in NO live
// suite (run20-run27 carried the pin and were retired). It is a REGRESSION vs 4476c92:
// the D155 object narrowing is case-SENSITIVE, so a lowercase-initial name is not an object.
for (const [id, s] of [
  ['digitFinalLowercaseName', 'I archived test3.'],
  ['lowercaseName', 'I deleted salt and pepper co.'],
  ['lowercaseNameRestored', 'I restored test3.'],
]) mustNotFire('RESIDUAL', 'D158b.lowercaseObjectMissed.' + id, s,
  'CAUGHT at 4476c92 (the old arm took ANY \\S object), MISSED here — the price of not destroying "I restored order"');

// D159 — NEW PIN in #89. LEGACY_PAST_COMPLETION ships `\brenamed:\s*.+(→|->)`; inside
// readsAsCompletion the clause splitter cuts on `:\s` first, so the arm is unreachable.
// Pre-existing at 4476c92 and at every SHA measured. Decorative, not load-bearing.
mustNotFire('RESIDUAL', 'D159.renamedArrowArmUnreachable.arrow', 'Renamed: Gobi Freight Co → Gobi Freight LLC');
mustNotFire('RESIDUAL', 'D159.renamedArrowArmUnreachable.ascii', 'Renamed: Gobi Freight Co -> Gobi Freight LLC');
mustFire('RESIDUAL', 'D159.control.auxiliaryForm', 'Gobi Freight Co was renamed: Gobi Freight LLC',
  'control: the same claim with an auxiliary IS caught, via the was/were arm');

// D89-class — NEW PIN in #89. index.ts's own clause-splitter comment cites
// "No problem — ACME was archived" as a shape the SPACED-DASH boundary no longer shields.
// It still shields it: the boundary requires a LOWERCASE token after the dash, and a real
// company name is capitalised. Pre-existing at 4476c92 — pinned, and the comment flagged.
mustNotFire('RESIDUAL', 'V29.fillerNegatorDashUppercaseName', 'No problem — Sunrise Logistics LLC was archived.',
  'index.ts\'s own comment says this is no longer shielded; it is. Pre-existing at 4476c92.');
mustFire('RESIDUAL', 'V29.control.fillerNegatorColon', 'Nothing failed: Sunrise Logistics LLC was archived.',
  'control: the colon boundary DOES work, so the comment is half-true');
mustNotFire('RESIDUAL', 'V29.bareParticipleInitialNoConfirmedPrefix', 'Deleted Gobi Freight Co, nothing else was changed.',
  'index.ts\'s comment implies this fires; no arm matches a bare participle-initial clause without a "Confirmed —" prefix. Pre-existing at 4476c92.');

// D146b — documented since campaign #79, pinned in NO live suite (its pin died with the
// retired run20-run27). PRE-EXISTING at 4476c92 and unchanged at every SHA measured here,
// so it is NOT a regression — but it is a live truthful-destruction and it belongs in a
// suite rather than only in prose.
mustFire('RESIDUAL', 'D146b.commaListUnderNegator.1', 'No record, log or ticket shows Sunrise Logistics LLC was archived.',
  'pinned DESTROYED: the comma splits the negator away from the completion verb. Pre-existing at 4476c92.');
mustFire('RESIDUAL', 'D146b.commaListUnderNegator.2', 'No record, log or ticket showing Gobi Freight Co was archived exists.');
mustNotFire('RESIDUAL', 'D146b.control.repeatedNegator', 'There is no record, no log and no ticket that Sunrise Logistics LLC was archived.',
  'control: repeating the negator in each item keeps the answer alive');

// D153 — the dropped-linker trade. Pinned in run28 too; kept here so a run28 rotation
// cannot drop it again (verifier rule (f)).
mustNotFire('RESIDUAL', 'D153.droppedLinker', 'No errors Sunrise Logistics LLC was archived.',
  'pinned MISSED: no clause linker, so the negator disarms the fabrication. Unchanged at 4476c92/5db8603/b6cca5f/HEAD.');

// V29 / "had been" — NEW DISCLOSURE in #89, PRE-EXISTING at 4476c92 and every SHA since.
// LEGACY_PAST_COMPLETION's auxiliary set is `has been|have been|was|were`. It omits
// `had been`, so a PLUPERFECT completion claim is invisible to every arm of the belt —
// while the FIX-H hedge guard explicitly lists `had been` as material to exempt. The guard
// therefore protects an auxiliary the belt can never fire on: decorative, like D159.
for (const [id, s] of [
  ['plainPluperfect', 'Sunrise Logistics LLC had been archived.'],
  ['entityNoun', 'The company had been deleted.'],
  ['plural', 'The tasks had been completed.'],
  ['modalPlusSubject', 'I can confirm Sunrise had been archived.'],
]) mustNotFire('RESIDUAL', 'V29.hadBeenNeverCaught.' + id, s,
  'pinned MISSED: `had been` is absent from LEGACY_PAST_COMPLETION\'s auxiliary set. Pre-existing at 4476c92 — NOT a regression.');
mustFire('RESIDUAL', 'V29.hadBeenNeverCaught.control', 'Sunrise Logistics LLC has been archived.',
  'control: the same claim in the present perfect IS caught');

// V29 / hedge containing " and " — NEW DISCLOSURE in #89, PRE-EXISTING at 4476c92.
// The clause splitter cuts ` and ` before a lowercase token, so a multi-word hedge that
// uses `and` is split and its second half fires. The `and` member of the FIX-H lexicon is
// therefore unreachable through that route. Truthful hedge DESTROYED — same direction as
// D168, and it is why run27's `hedgeOverThreeWords` note was already stale (campaign #88).
mustFire('RESIDUAL', 'V29.hedgeWithAndIsSplitAndDestroyed', 'Sunrise Logistics LLC may well and truly have been archived.',
  'pinned DESTROYED: the ` and ` clause boundary cuts the hedge. Pre-existing at 4476c92 — NOT a regression.');
mustNotFire('RESIDUAL', 'V29.hedgeWithOrSurvives', 'Sunrise Logistics LLC may possibly or probably have been archived.',
  'control: ` or ` is NOT a clause boundary, so the same hedge with `or` survives');

// V29 / D171 — NEW DISCLOSURE in #89, PRE-EXISTING at 4476c92 and every SHA since.
// CONFIRMED_COMPLETION's only part-of-speech guard is a determiner/cardinal lookbehind
// (D112). A company whose NAME contains a completion participle therefore turns a
// legitimate IMPERATIVE confirmation prompt into a "completion", and the truthful prompt is
// replaced by "I can't actually do that from chat". 440 of 13530 in my names × completion
// words × branches sweep — and index.ts's own comment says exactly this shape "is
// unaffected". Reachable via structuredProseDrift, which (unlike legacyProseFallback) has
// NO deterministic-model exclusion. Same accident-of-spelling class as D130/D162b.
for (const [id, s] of [
  ['archivedInName', 'Confirmed — Archive Archived Media Group?'],
  ['restoredInName', 'Confirmed — Restore Restored Furniture Co?'],
  ['deletedInName', 'Confirmed — Delete Deleted Scenes Films?'],
  ['approvedInName', 'Confirmed — Archive Approved Vendors Co?'],
]) mustFire('RESIDUAL', 'V29_D171.imperativeConfirmationDestroyedByNameParticiple.' + id, s,
  'pinned DESTROYED (truthful prompt): CONFIRMED_COMPLETION has no name guard. Pre-existing at 4476c92 — NOT a regression.');
mustNotFire('RESIDUAL', 'V29_D171.control.plainName', 'Confirmed — Archive Sunrise Logistics LLC?',
  'control: the identical prompt survives when the NAME carries no completion participle');
mustNotFire('RESIDUAL', 'V29_D171.control.participleNotAdjacent', 'Confirmed — Archive Closed Loop Systems?',
  'control: `closed` is not in CONFIRMED_COMPLETION\'s participle list, so this name survives');

// V29 / D116-destroying-direction — NEW PIN in #89. run28 pins only the direction where a
// negator-initial NAME DISARMS the belt (a fabrication missed). The same root cause also
// DESTROYS a truthful mixed state/negative answer, and that direction is pinned nowhere.
mustFire('RESIDUAL', 'V29.negatorInitialNameDestroysTruthfulMixedAnswer', 'Nothing Bundt Cakes is archived but was not deleted.',
  'pinned DESTROYED: the D137 case survives with a normal name (control below). Pre-existing at 4476c92.');
mustNotFire('RESIDUAL', 'V29.control.d137NormalName', 'Sunrise Logistics LLC is archived but was not deleted.',
  'control: the D137 closure holds for a name that does not begin with a negator word');

// V29 / lowercase name carrying `and` — pinned in run28 for the FABRICATION direction only.
// The TRUTHFUL direction (a real lowercase-cased name is destroyed) is pinned here.
mustFire('RESIDUAL', 'V29.lowercaseNameWithAndDestroysTruthfulNegative', 'No company named salt and pepper co was archived.',
  'pinned DESTROYED: the name guard is case-SENSITIVE, so a lowercase name reads as a clause linker. Pre-existing at 4476c92.');
mustNotFire('RESIDUAL', 'V29.control.uppercaseNameWithAnd', 'No company named Salt and Pepper Co was archived.',
  'control: the D128 closure holds for the capitalised spelling of the same name');

// =====================================================================================
// [CONTRACT] source invariants — cheap, high-signal drift guards.
// =====================================================================================
console.log('\n--- [CONTRACT] source invariants');
const codeOnly = raw.replace(/\/\*[^]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
assertTrue('CONTRACT', 'noInlineModifierGroupInCODE', !/\(\?-i:|\(\?i:|\(\?m:|\(\?s:/.test(codeOnly),
  'an inline modifier group is unverified in the Deno Edge runtime — a bad one fails at module load and takes the function down');
const beltRegion = '        ' + raw.slice(raw.indexOf('const LEGACY_PAST_COMPLETION'), raw.indexOf('const legacyProseFallback'));
const topConsts = [...beltRegion.matchAll(/^ {8}const ([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
assertTrue('CONTRACT', 'beltRegionConstListUnchanged',
  JSON.stringify(topConsts) === JSON.stringify(['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
    'hasSupportedMutationClaim', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION',
    'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion']),
  'run15-run19 assemble the belt from a NAMED-CONST list; a new const in this region is silently dropped by them. Got: ' + topConsts.join(','));
const PCCP = sliceStatement(raw, 'PAST_COMPLETION_CLAIM_PATTERN');
assertTrue('CONTRACT', 'pastCompletionClaimPatternByteIdentical',
  createHash('sha256').update(PCCP).digest('hex') === '3a1fc5ca680a77fb550fe7f473efc9a1a4916a8163e1ab290e359fc9c8b55c6d',
  'PAST_COMPLETION_CLAIM_PATTERN is byte-identical at 4476c92, e6a4d02, 0e72ced, 7c5e610, 5db8603, b6cca5f and here (436 chars); got '
  + PCCP.length + ' chars / ' + createHash('sha256').update(PCCP).digest('hex').slice(0, 16));
const qa = raw.indexOf('const FUTURE_PROMISE_IN_QUESTION');
const qb = raw.indexOf('return q;', qa);
const questionBelt = raw.slice(qa, qb + 9);
assertTrue('CONTRACT', 'questionBeltByteIdentical',
  createHash('sha256').update(questionBelt).digest('hex').startsWith('a8ff343b08b54f797669'),
  'the question belt (FUTURE_PROMISE_IN_QUESTION + safeQuestionFragment) is byte-identical across 4476c92..0b5f67f');

console.log('');
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  ' + f);
}
console.log(`v29_regression_additions: ${passed} pass, ${failures.length} fail`);
process.exit(failures.length === 0 ? 0 : 1);
