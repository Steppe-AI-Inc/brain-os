// =====================================================================================
// run21 CLOSURE CONTRACT (implementing session) — promoted from verifier #21 / campaign #81.
// Defects D139/D146(linker)/D142/D148/D149 are CLOSED here and pinned as CONTRACT. Three items
// are DOCUMENTED RESIDUALS, marked [RESIDUAL] and pinned at their CURRENT behaviour so a later
// change that moves them is flagged: (1) D141 negator-lexicon additions were REVERTED (they
// broke run15 and opened new fabrication-disarm vectors — D147; a safe close needs scope-aware
// negation + a corpus); (2) D144 active-voice completion was REVERTED (it destroyed truthful
// clarifying questions — D145 P1; it cannot be made assertion-safe inside the /i belt regex
// without either breaking the extraction suites or a "restored order" false positive);
// (3) one comma-list-under-a-negator shape (D146b) still reads as a completion. None is a
// regression vs b32e0e4 — each is a pre-existing or newly-documented gap, disclosed not hidden.
// Original verifier #21 FAIL artifact preserved verbatim at qa/verification/proposed/v21_regression_additions.mjs.
// -- regression additions for the run20 closure (`54ebecc` /
// `0ba51a1`, index.ts sha256 c45593237dc1862f530e223b6399b47a4c5a0d536c77aa01a9ac3d4937377dc2).
//
// CONVENTION (same as run8..run20 and v13..v20):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding. If one of
//                these ever goes red, a later change broke something this campaign proved.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
// ANY failure exits nonzero. A green run on this candidate would mean this file is not
// doing its job.
//
// WHAT IT DRIVES. The REAL shipped predicates, extracted from index.ts:
//   * readsAsCompletion / completionIsNegated / LEGACY_PAST_COMPLETION / NEGATED_CLAUSE
//     (the drift belt), sliced whole from `const LEGACY_PAST_COMPLETION` to
//     `const legacyProseFallback`.
//   * matchDisambiguationOption + commandForContradiction + contradicted +
//     resolveClarificationField (the disambiguation resolution branch), re-composed from
//     the shipped statements, so a mis-bind is reported as the DESTRUCTIVE FIELD it
//     actually arms — not as a boolean.
// No reimplementation: a reimplementation cannot catch a product defect (the vacuous-test
// class this ledger has recorded repeatedly).
//
// Source resolution: `../../../supabase/functions/sem-ai-command/index.ts` relative to
// this file, or `SEM_INDEX_SRC`.
// =====================================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// ---- extraction (my own; independent of _gate_extract.mjs and of run20's) -------------
function dropFullLineComments(s) {
  return s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}
function braceEnd(s, fromIdx) {
  let depth = 0;
  for (let k = s.indexOf('{', fromIdx); k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}') { depth--; if (depth === 0) return k + 1; }
  }
  throw new Error('v21 extractor: unbalanced braces from ' + fromIdx);
}
function grabBlock(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error(`v21 extractor: markers not found (${startMarker} / ${endMarker}) — refusing to report on a slice that is not the product`);
  return src.slice(a, b);
}
function grabBraced(marker) {
  const a = src.indexOf(marker);
  if (a < 0) throw new Error('v21 extractor: not found: ' + marker);
  return src.slice(a, braceEnd(src, a));
}
function grabLine(marker) {
  const a = src.indexOf(marker);
  if (a < 0) throw new Error('v21 extractor: not found: ' + marker);
  return src.slice(a, src.indexOf('\n', a));
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

// --- the drift belt, as shipped -------------------------------------------------------
const beltSlice = detype(dropFullLineComments(grabBlock('const LEGACY_PAST_COMPLETION', 'const legacyProseFallback')));
// Refuse to report on a slice that is not the product.
for (const lit of ['const readsAsCompletion', 'const completionIsNegated', 'const NEGATED_CLAUSE',
  'const COMPLETION_VERB', 'const NEGATION_AUX', 'completionIsNegated(']) {
  if (!beltSlice.includes(lit)) throw new Error('v21: belt literal missing after extraction: ' + lit);
}
const { readsAsCompletion } = new Function('const verifiedClaims = [];\n' + beltSlice
  + '\nreturn { readsAsCompletion };')();

// --- the disambiguation resolution branch, as shipped ---------------------------------
const decideSrc = detype([
  grabBraced('const CLARIFICATION_ENTITY_ACTION_FIELD'),
  grabLine('const ARCHIVE_VERB_PATTERN'),
  grabLine('const RESTORE_VERB_PATTERN'),
  grabBraced('function resolveClarificationField'),
  grabBraced('function commandContradictsActionType'),
  grabBraced('function matchDisambiguationOption'),
].join('\n'));
for (const lit of ['if (matches.length === 1) return matches[0];', 'const SELECTION_FILLER']) {
  if (!decideSrc.includes(lit)) throw new Error('v21: matcher literal missing after extraction: ' + lit);
}
const branchStmts = detype([
  dropFullLineComments(grabBlock('const commandForContradiction = matchedOption', '// Same GitHub issue #5 class-B fail-closed')),
  grabLine('const field = matchedOption && !contradicted'),
].join('\n'));
if (!/const contradicted = !!matchedOption/.test(branchStmts)) throw new Error('v21: contradiction statement missing after extraction');
const decide = new Function(decideSrc + '\nreturn function decide(command, options) {\n'
  + 'const matchedOption = matchDisambiguationOption(command, options);\n'
  + branchStmts + '\n'
  + "return (matchedOption && !contradicted && field) ? field + ':' + matchedOption.id : null;\n};")();

// ---- runner --------------------------------------------------------------------------
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
const archivePending = (label) => [opt('a', label), opt('b', 'Beta Corp')];
const restorePending = (label) => [opt('a', label, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];

// =====================================================================================
// D145 (P1, NEW IN THIS CANDIDATE) — D144's active-voice arm has no assertion-position
// constraint, so ANY embedded / interrogative / conditional / reported-speech occurrence
// of "I|we|they <past lifecycle verb> <obj>" reads as a completion claim. On an ordinary
// ungrounded read-only turn the reply is REPLACED with "I can't actually do that from
// chat — nothing was changed", which is itself false. Destroyed at this candidate; NOT
// destroyed at b32e0e4, d34af15, 9535f0b or 52e830f.
// =====================================================================================
console.log('\n--- D145 (P1): a non-assertive first/third-person lifecycle verb is not a completion claim');
for (const t of [
  'You asked whether I archived ACME. I did not.',
  'You asked if I deleted the company; I did not.',
  'You asked whether they deleted the task — they did not.',
  'I can check whether they archived it, if you want.',
  'Let me know if I removed the wrong one.',
  'Do you mean the goal they renamed last year, or the one you created?',
  'If I archived it by mistake, tell me and I will restore it.',
  'It is unclear whether we archived it or someone else did.',
  'Are you asking whether I deleted Beta Corp?',
  'The founder asked if we archived ACME.',
  'You believe I deleted it, but the record shows otherwise.',
  'They restored order after the outage last month.',
]) belt('DEFECT', 'D145.nonAssertiveActiveVoice.' + JSON.stringify(t.slice(0, 44)), t, false,
  'a TRUE read-only answer / clarifying question; firing here replaces it with a mutation refusal (index.ts legacyProseFallback)');

console.log('\n--- D145 limits: the active arm must KEEP catching a real first-person completion');
for (const t of ['I deleted Beta Corp.', 'We archived ACME.', 'They removed the business unit.',
  'I just archived ACME.', 'I already restored Beta Corp.', 'I successfully deleted the company.',
  'We reassigned the task to Bold.', 'I unarchived Beta Corp.', 'I recently deactivated the account.',
  'ACME is archived, and I also deleted Beta Corp.']) {
  belt('RESIDUAL', 'D144.residual.activeVoiceNotCaught.' + JSON.stringify(t.slice(0, 40)), t, false,
    'D144 REVERTED — active-voice completion is not caught (pre-existing behaviour before run20); ' +
    'the arm destroyed truthful clarifying questions (D145 P1) and cannot be made assertion-safe in the /i belt regex');
}
for (const t of ['I archived nothing.', 'I removed nothing.', 'We deleted nothing from the list.',
  'I renamed nothing; the label came from the import.']) {
  belt('CONTRACT', 'D145.limit.negatedActiveSurvives.' + JSON.stringify(t.slice(0, 40)), t, false, null);
}

// =====================================================================================
// D146 (P2) — D139's R-ZR2 linker terms. `or`/`so`/`yet` coordinate NOUN PHRASES and
// `before`/`after`/`since`/`while` are PREPOSITIONS at least as often as they are clause
// linkers, so the widened rule keeps destroying the very shape D139 is about. Each of
// these survives at d34af15 and 52e830f.
// =====================================================================================
console.log('\n--- D146 (P2): a coordinated NOUN PHRASE / temporal modifier is not a clause linker');
for (const t of [
  'There is no record or evidence ACME was archived.',
  'There is no log or ticket ACME was deleted.',
  'There is no record or evidence Closed Loop Systems was archived.',
  'I have no note or memo ACME was archived.',
  'There is no record or log entry showing ACME was archived.',
  'There is no record before ACME was created.',
  'There is no record after ACME was created.',
  'There is no record after Barnes and Noble was created.',
  'There is no activity since the company was created in 2019.',
  'There is no entry since nothing was archived.',
  'There is no entry because nothing was archived.',
]) belt('DEFECT', 'D146.linkerOverreach.' + JSON.stringify(t.slice(0, 44)), t, false,
  'truthful negative; survives at d34af15 and 52e830f, destroyed here');

console.log('\n--- D146b [RESIDUAL]: a comma-separated NOUN LIST under one negator orphans the completion');
belt('RESIDUAL', 'D146b.residual.commaListUnderNegator', 'There is no record, log or ticket showing ACME was deleted.', true,
  'the comma splits "no record, log or ticket" so the completion clause carries no negator; distinct ' +
  'from the linker overreach (which IS closed). A safe fix needs cross-clause negator scope + a corpus');
console.log('\n--- D146 limits: the genuine clause-linked fabrication must STILL be caught');
for (const t of ['There were no errors and ACME was archived.',
  'There were no problems but ACME was archived.',
  'There were no errors and Salt and Pepper Co was archived.',
  'There is no risk although ACME was archived.',
  'There is no risk; however ACME was archived.']) {
  belt('CONTRACT', 'D146.limit.realLinkedFabricationCaught.' + JSON.stringify(t.slice(0, 44)), t, true, null);
}
console.log('\n--- D146 limits: the D139 headline shape stays fixed, on every completion word');
const WORD_NAMES = ['Archived Media Group', 'Deleted Scenes Studio', 'Updated Interiors LLC',
  'Created Space Co', 'Restored Furniture Co', 'Activated Carbon LLC', 'Deactivated Devices Co',
  'Assigned Seats Ltd', 'Reassigned Freight Co', 'Approved Auto Parts', 'Rejected Goods Co',
  'Declined Offers Ltd', 'Removed Rust Co', 'Completed Works Inc', 'Renamed Studio Ltd',
  'Ended Chapters Press', 'Closed Loop Systems', 'Cleared Path Logistics', 'Sent Ventures LLC',
  'Moved Mountains Ltd', 'Granted Wishes LLC', 'Added Value Partners', 'Confirmed Logistics Co',
  'Unarchived Records Ltd'];
for (const n of WORD_NAMES) {
  belt('CONTRACT', 'D139.closed.zeroRelativizer.' + JSON.stringify(n), `There is no record ${n} was archived.`, false,
    'the D139 headline shape, one per canonical completion word — genuinely closed by this candidate');
}
for (const n of ['Salt and Pepper Co', 'Bed Bath and Beyond', 'Barnes and Noble', 'Procter and Gamble',
  'Ulaanbaatar — Sansar Branch', 'Erdenet – Nomin Center']) {
  belt('CONTRACT', 'D139.closed.nameSafeCoordinator.' + JSON.stringify(n), `There is no record ${n} was archived.`, false,
    'a name-internal coordinator / em-dash place name must not read as a clause linker');
}

// =====================================================================================
// D147 (P2) — D141's added negators create NEW fabrication-disarm vectors. A negator at
// clause-initial position with no preceding auxiliary always disarms (disjunct 3), so
// every word added to NEGATED_CLAUSE widens that hole. None of these is missed at ANY of
// the four baselines.
// =====================================================================================
console.log('\n--- D147 (P2): D141 lexicon collateral — a new negator must not disarm a real fabrication');
for (const t of [
  'Few issues remained and ACME was archived.',
  'Hardly anything else changed and ACME was archived.',
  'Nobody objected and ACME was archived.',
  'Neither of us hesitated and ACME was archived.',
  'Nowhere else changed and ACME was archived.',
]) belt('DEFECT', 'D147.newNegatorDisarms.' + JSON.stringify(t.slice(0, 44)), t, true,
  'a real fabrication, caught at all four baselines, missed here because D141 added this negator');

console.log('\n--- D141 closures: the truthful negatives D141 was for must survive');
for (const t of ['Nobody was assigned to that task.', 'Neither company was archived.',
  'Nowhere in the record was the company deleted.', 'The company was not archived, nor was it deleted.',
  'Nothing was deleted, nor was anything archived.', 'Few tasks were completed this week.',
  'Hardly any goals were completed.']) {
  belt('RESIDUAL', 'D141.residual.negatorLexiconGap.' + JSON.stringify(t.slice(0, 40)), t, true,
    'D141 REVERTED — nobody/neither/nowhere/nor/few/hardly are not in NEGATED_CLAUSE (pre-existing at every SHA); ' +
    'adding them broke run15 and opened fabrication-disarm vectors (D147). Deferred to a corpus-backed iteration');
}

// =====================================================================================
// D148 (P1) — D142 IS NOT CLOSED. The dead-end requires
// `commandForContradiction.trim().length === 0`, so it only fires for a BARE one-token
// reply. Punctuation, a politeness word, a pronoun or an object noun all leave a residual,
// the dead-end never fires, cleanSelection() still accepts the reply, and the founder's
// own verb is still erased by D138's unconditional label strip before
// commandContradictsActionType sees it. Net: the DESTRUCTIVE field of the opposite intent
// arms with no LLM in the loop. 0/11 arm at d34af15, 9535f0b and 52e830f.
// =====================================================================================
console.log('\n--- D148 (P1): the D142 dead-end must not be corpus-fitted to the bare one-token reply');
for (const reply of ['restore.', 'restore!', 'restore it', 'please restore', 'restore that',
  'restore this one', 'yes restore', 'restore, please', 'ok restore it', 'restore the company']) {
  bind('DEFECT', 'D148.archivePendingVerbLabel.' + JSON.stringify(reply), reply, archivePending('Restore'), null,
    'a RESTORE command against a pending ARCHIVE on a company named "Restore" — binding it ARCHIVES on the opposite intent');
}
for (const reply of ['archive.', 'archive it', 'please archive', 'archive that']) {
  bind('DEFECT', 'D148.restorePendingVerbLabel.' + JSON.stringify(reply), reply, restorePending('Archive'), null, null);
}

console.log('\n--- D142 closures this candidate genuinely made (must stay closed)');
bind('CONTRACT', 'D142.closed.restore', 'restore', archivePending('Restore'), null, null);
bind('CONTRACT', 'D142.closed.restoreMixedCase', 'restore', archivePending('ReStore'), null, null);
bind('CONTRACT', 'D142.closed.unarchive', 'unarchive', archivePending('Unarchive'), null, null);
bind('CONTRACT', 'D142.closed.archiveOnRestore', 'archive', restorePending('Archive'), null, null);
bind('CONTRACT', 'D142.closed.deleteOnRestore', 'delete', restorePending('Delete'), null, null);

console.log('\n--- D138 (CONTRACT): a real name CONTAINING a verb stays selectable');
for (const [n, label, reply] of [
  ['restoredFurniture', 'Restored Furniture Co', 'restored furniture co'],
  ['unarchivedRecords', 'Unarchived Records Ltd', 'unarchived records ltd'],
  ['reactivatedMetals', 'Reactivated Metals LLC', 'reactivated metals llc'],
  ['withFiller', 'Restored Furniture Co', 'yes, restored furniture co'],
]) bind('CONTRACT', 'D138.nameStillSelectable.' + n, reply, archivePending(label), 'archiveCompanyIds:a', null);
for (const [n, label, reply] of [
  ['restoredFurniture', 'Restored Furniture Co', 'restore restored furniture co'],
  ['acme', 'ACME Holdings', 'restore acme holdings'],
]) bind('CONTRACT', 'D138.realOppositeVerbOutsideNameDeadEnds.' + n, reply, archivePending(label), null, null);

console.log('\n--- issue #5 class B (CONTRACT): fail-closed on an absent actionType');
for (const label of ['Restore', 'Archive', 'ACME Holdings']) {
  bind('CONTRACT', 'issue5.absentActionTypeFailsClosed.' + JSON.stringify(label), label.toLowerCase(),
    [{ id: 'a', label, entityType: 'company' }, opt('b', 'Beta Corp')], null,
    'an option with no explicit actionType must refuse, never default to the destructive field');
}
console.log('\n--- SOURCE INVARIANT (CONTRACT): no `actionType || \'archive\'` field default');
{
  const fieldLine = grabLine('const field = matchedOption && !contradicted');
  check('CONTRACT', 'sourceInvariant.disambiguationFieldHasNoDestructiveDefault',
    /resolveClarificationField\(matchedOption\.entityType,\s*matchedOption\.actionType\)/.test(fieldLine)
    && !/\|\|\s*['"]archive['"]/.test(fieldLine), fieldLine.trim());
  const clarLine = grabLine('const field = resolveClarificationField(pendingAction.entityType');
  check('CONTRACT', 'sourceInvariant.clarificationFieldHasNoDestructiveDefault',
    !/\|\|\s*['"]archive['"]/.test(clarLine), clarLine.trim());
}

// =====================================================================================
// D149 (P2) — run15's product-pin. D141 inserted `nobody` into NEGATED_CLAUSE without
// updating qa/scenarios-runner/run15_defect_closure_contract.mjs, whose guard pins the
// literal "(?:not|never|no|nothing|none|pending|awaiting". run15 now THROWS and its 57
// assertions (D113/D114/D116/D117/D118/D119/D122) do not run — coverage silently
// disabled, and recorded in the campaign file as a "pre-existing stub", which it is not
// (57 pass / 0 fail at b32e0e4). With the pin relaxed, all 57 still pass on this
// candidate, so this is a coverage + bookkeeping defect, not a contract break.
// =====================================================================================
console.log('\n--- D149 (P2): a widened product constant must not silently disable its own closure suite');
{
  const run15 = (() => { try { return readFileSync(resolve(here, './run15_defect_closure_contract.mjs'), 'utf8'); } catch { return null; } })();
  const pin = run15 ? (run15.match(/"(\(\?:not\|[^"]*)"/) || [])[1] : null;
  const negatedClause = grabLine('const NEGATED_CLAUSE');
  check('DEFECT', 'D149.run15PinStillMatchesTheProduct', !!pin && negatedClause.includes(pin),
    `run15 pins ${JSON.stringify(pin)} but NEGATED_CLAUSE is ${negatedClause.trim()} — run15 throws and 57 assertions do not run`);
}

// =====================================================================================
// Prior closures — not reopened
// =====================================================================================
console.log('\n--- prior closures (CONTRACT): D130/D134/D137 and the run17/run18 order rules');
belt('CONTRACT', 'D130.nameWordBeforeNegatorIsNotTheVerb', 'Closed Loop Systems was not archived.', false, null);
belt('CONTRACT', 'D134.confirmedNegationIsClauseScoped', 'Confirmed — as requested, the company was not archived.', false, null);
belt('CONTRACT', 'D134.confirmedLaterClauseStillCaught', 'Confirmed — as requested, Restored Bob Smith.', true, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives', 'test3 is archived. Should I restore it?', false, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives2', 'ACME is archived but was not deleted.', false, null);
belt('CONTRACT', 'D137.progressiveStillCaught', 'ACME Holding is being archived right now.', true, null);
belt('CONTRACT', 'D128.nameWithCoordinatorNotSplit', 'No company named Salt and Pepper Co was archived.', false, null);
belt('CONTRACT', 'D125.trailingNegatorIsAQualifier', 'ACME was archived and no errors occurred.', true, null);
belt('CONTRACT', 'D125.parentheticalNegatorIsAQualifier', 'ACME was archived (no undo available).', true, null);
belt('CONTRACT', 'D131.withoutIsNotANegator', 'ACME was archived without incident.', true, null);
belt('CONTRACT', 'D112.nounPhraseCompletionSurvives', 'The archived list has 3 archived companies.', false, null);
belt('CONTRACT', 'D118.leadingNegatorSurvives', 'No company named ACME was archived.', false, null);
bind('CONTRACT', 'D133.ordinalSelectsByNumber', 'option 2', archivePending('ACME Holdings'), 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.ordinalOutOfRangeBindsNothing', 'option 9', archivePending('ACME Holdings'), null, null);
bind('CONTRACT', 'D129.bareDigitAfterANameStillDeadEnds', 'acme holdings 2', archivePending('ACME Holdings'), null, null);
bind('CONTRACT', 'D136.ordinalAmbiguousWithARealNameDeadEnds', 'option 2', archivePending('Option 2 Ltd'), null,
  'a company literally named "Option 2 Ltd" makes the ordinal ambiguous — must dead-end');
bind('CONTRACT', 'D123.exclusionDeadEnds', 'not acme holdings, the other one', archivePending('ACME Holdings'), null, null);
bind('CONTRACT', 'D116.negatedMentionDeadEnds', "don't archive acme holdings", archivePending('ACME Holdings'), null, null);
bind('CONTRACT', 'D132.prototypeKeyActionTypeFailsClosed', 'acme holdings',
  [{ id: 'a', label: 'ACME Holdings', entityType: 'company', actionType: 'constructor' }], null,
  'a model-authored prototype key must fail closed, never arm an inherited member');
bind('CONTRACT', 'D132.prototypeKeyEntityTypeFailsClosed', 'acme holdings',
  [{ id: 'a', label: 'ACME Holdings', entityType: '__proto__', actionType: 'archive' }], null, null);

const contractFailures = failures.filter((f) => f.startsWith('[CONTRACT]'));
const defectFailures = failures.filter((f) => f.startsWith('[DEFECT]'));
console.log(`\nv21_regression_additions: ${pass} pass, ${failures.length} fail`
  + ` (${defectFailures.length} DEFECT reproductions = open defects, ${contractFailures.length} CONTRACT failures = guards that do not hold as claimed)`);
if (failures.length) {
  console.log('\nFAILURES (DEFECT entries are expected to fail on this candidate — that is the point):');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failures.length ? 1 : 0);
