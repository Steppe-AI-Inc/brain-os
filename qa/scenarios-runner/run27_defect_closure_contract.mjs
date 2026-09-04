// =====================================================================================
// run27 CLOSURE CONTRACT (implementing session) — promoted from VERIFIER #27 (campaign #87).
// Pins the run27 closure of D163 (FIX-H) + D164 (FIX-I). GREEN on the candidate promoted onto.
//
// Candidate: the run27 closure (D163 FIX-H + D164 FIX-I) on top of a9bf518
// index.ts sha256: 291800b1163f64823c7d6df47b6a6c35f5c1985d2fa18aeb27076cf140076778
//
// CONVENTION (same as run8..run26 / v13..v26):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding.
//   [DEFECT]   — the CORRECT behaviour for a defect THIS campaign found. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap DISCLOSED and deliberately deferred, pinned at its CURRENT
//                behaviour so a later change that moves it is seen.
// ANY failure exits nonzero.
//
// EXPECTED ON THIS CANDIDATE (a9bf518): every [CONTRACT] and every [RESIDUAL] passes; the
// two [DEFECT] groups (D163, D164) FAIL — 16 failures. It goes fully green only when the
// modal-hedge guard is anchored to the completion it guards (D163) and the evidential
// disjunct distinguishes a NEGATED evidential subject from a POSITIVE one (D164).
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor
// written for THIS campaign. No regex is reimplemented. It imports NOTHING from
// qa/scenarios-runner and nothing from any v*_ artefact — those are the things under test.
//
// Source resolution: SEM_INDEX_SRC, else ../../../supabase/functions/sem-ai-command/index.ts
// (its home in qa/verification/proposed/), else ../../supabase/... (after promotion into
// qa/scenarios-runner/).
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = [
  process.env.SEM_INDEX_SRC,
  resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),
  resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
].filter(Boolean).find((p) => existsSync(p));
if (!SRC_PATH) { console.log('FAIL  cannot locate index.ts'); process.exit(1); }
const SRC = readFileSync(SRC_PATH, 'utf8');
const SRC_SHA = createHash('sha256').update(readFileSync(SRC_PATH)).digest('hex');
console.log(`source: ${SRC_PATH}\nsha256: ${SRC_SHA}\n`);

let pass = 0; const failures = [];
function check(kind, id, ok, note) {
  if (ok) { pass++; console.log(`OK   [${kind}] ${id}`); }
  else { failures.push(`[${kind}] ${id}${note ? ' — ' + note : ''}`); console.log(`FAIL [${kind}] ${id}${note ? ' — ' + note : ''}`); }
}

// ---------------------------------------------------------------- extractors (mine) ---
const LINES = SRC.split('\n');
function sliceBetween(startRe, stopRe) {
  let s = -1, e = -1;
  for (let i = 0; i < LINES.length; i++) {
    if (s < 0 && startRe.test(LINES[i])) s = i;
    if (s >= 0 && i > s && stopRe.test(LINES[i])) { e = i; break; }
  }
  if (s < 0 || e < 0) throw new Error('anchor not found: ' + startRe);
  return { text: LINES.slice(s, e).join('\n'), s: s + 1, e };
}
function buildBelt(blockText) {
  const anns = blockText.match(/[:)]\s*(string|boolean|number|unknown|any|Record<[^>]*>)\b/g) || [];
  if (anns.join('|') !== ': string|: boolean') throw new Error('unexpected TS in belt: ' + JSON.stringify(anns));
  const b = blockText.replace('(c: string): boolean =>', '(c) =>');
  return new Function(`var verifiedClaims=[];var rawClaims=null;var claimExecutionEvidence=[];
    ${b}
    return { readsAsCompletion, completionIsNegated, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS,
             CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION, NEGATED_CLAUSE, COMPLETION_VERB,
             COMPLETION_PARTICIPLE, NEGATION_AUX };`)();
}
const BELT_BLOCK = sliceBetween(/^\s*const LEGACY_PAST_COMPLETION\s*=/, /^\s*const legacyProseFallback\s*=/);
const belt = buildBelt(BELT_BLOCK.text);
const fires = (s) => belt.readsAsCompletion(s) === true;

function buildMatcher() {
  const grab = (startRe) => {
    let s = -1; for (let i = 0; i < LINES.length; i++) if (startRe.test(LINES[i])) { s = i; break; }
    if (s < 0) throw new Error('matcher anchor not found ' + startRe);
    let e = s; for (let i = s + 1; i < LINES.length; i++) if (/^}/.test(LINES[i])) { e = i; break; }
    return LINES.slice(s, e + 1).join('\n');
  };
  const one = (re) => { for (const l of LINES) if (re.test(l)) return l; throw new Error('const not found ' + re); };
  let block = [one(/^const ARCHIVE_VERB_PATTERN\s*=/), one(/^const RESTORE_VERB_PATTERN\s*=/),
    grab(/^function commandContradictsActionType\(/), grab(/^function matchDisambiguationOption\(/)].join('\n');
  for (const [a, b] of [
    ['function commandContradictsActionType(command: string, actionType: string | undefined): boolean {', 'function commandContradictsActionType(command, actionType) {'],
    ['function matchDisambiguationOption(command: string, options: PendingActionOption[]): PendingActionOption | null {', 'function matchDisambiguationOption(command, options) {'],
    ['(s: string) =>', '(s) =>'],
  ]) { if (!block.includes(a)) throw new Error('matcher signature absent: ' + a.slice(0, 60)); block = block.split(a).join(b); }
  block = block.replace(/(const \w+): Record<string, string> =/g, '$1 =').replace(/:\s*PendingActionOption(\[\])?/g, '');
  const leftover = block.match(/:\s*(string|boolean|number|unknown|any)\b/g) || [];
  if (leftover.length) throw new Error('matcher leftover TS ' + JSON.stringify(leftover));
  return new Function(`${block}\nreturn { matchDisambiguationOption, commandContradictsActionType };`)();
}
const matcher = buildMatcher();

function buildQuestionBelt() {
  const one = (re) => { for (const l of LINES) if (re.test(l)) return l; throw new Error('const not found ' + re); };
  let sq = -1, sqE = -1;
  for (let i = 0; i < LINES.length; i++) {
    if (/^\s*const safeQuestionFragment\s*=/.test(LINES[i])) sq = i;
    if (sq >= 0 && sqE < 0 && i > sq && /^\s{8}\};\s*$/.test(LINES[i])) sqE = i + 1;
  }
  const qsrc = LINES.slice(sq, sqE).join('\n');
  const block = [one(/^\s*const UUID_IN_TEXT\s*=/), one(/^\s*const PAST_COMPLETION_CLAIM_PATTERN\s*=/),
    one(/^\s*const COMPLETION_WORD\s*=/), one(/^\s*const FUTURE_PROMISE_IN_QUESTION\s*=/), qsrc].join('\n');
  const b = block.replace('(s: unknown): string | null =>', '(s) =>');
  return { mod: new Function(`${b}\nreturn { safeQuestionFragment };`)(), src: qsrc };
}
const QB = buildQuestionBelt();

const NONCOMMENT = LINES.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// =====================================================================================
console.log('\n--- FIX-F [CONTRACT]: a name-internal `and`/`but` is NOT a clause boundary for the evidential test (D162b closed)');
for (const s of [
  'No log however shows Salt and Pepper Co was archived.',
  'No entry however notes Barnes and Noble was archived.',
  'Nothing therefore shows Johnson and Johnson was deleted.',
  'No file though proves Marks and Spencer was deleted.',
  'No log although old shows Smith and Wesson was archived.',
  'No entry though indicates Black and Decker Mongolia was deleted.',
  'No audit row therefore confirms Rock and Roll Media was restored.',
  'No log however shows Nothing but Nets Foundation was archived.',
  'No log however shows All but One Ltd was archived.',
  'No record shows Salt and Pepper Co was archived.',
  'There is no record Salt and Pepper Co was archived.',
  'Salt and Pepper Co was not archived.',
]) check('CONTRACT', `FIX-F.nameInternalLinkerSurvives :: ${s}`, !fires(s), 'destroying a true answer is the worse direction (D112)');

console.log('\n--- FIX-F [CONTRACT]: a REAL clause linker between negator and completion still FIRES');
for (const s of [
  'No errors occurred and ACME was archived.',
  'No issues were found and Beta Corp was deleted.',
  'No errors occurred and Salt and Pepper Co was archived.',
  'No problems appeared but Orion Holdings was removed.',
  'No errors occurred however ACME was archived.',
  'No errors occurred however Salt and Pepper Co was archived.',
  'Nothing failed although Barnes and Noble was deleted.',
  'No blockers remain therefore Johnson and Johnson was restored.',
  'No issues remain and Salt and Pepper Co was archived.',
]) check('CONTRACT', `FIX-F.realLinkerStillFires :: ${s}`, fires(s));

console.log('\n--- FIX-F [CONTRACT]: the chained split is null-safe and never throws (20k degenerate strings)');
{
  const bits = ['no', 'not', 'never', 'and', 'but', 'however', 'although', 'therefore', 'shows', 'record',
    'was', 'archived', 'ACME', 'Salt', ',', '.', '\u2014', ':', '(', ')', '', ' ', 'has been', 'may', 'can', 'be'];
  let seed = 987654321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let throws = 0;
  for (let i = 0; i < 20000; i++) {
    let s = ''; const len = 1 + Math.floor(rnd() * 12);
    for (let j = 0; j < len; j++) s += bits[Math.floor(rnd() * bits.length)] + ' ';
    try { belt.readsAsCompletion(s); belt.completionIsNegated(s); } catch { throws++; }
  }
  check('CONTRACT', 'FIX-F.degenerateSpansNeverThrow', throws === 0, `${throws} throws`);
  check('CONTRACT', 'FIX-F.splitNeverYieldsUndefined', ''.split(/x/).length === 1 && ''.split(/x/).pop() === '',
    'String.prototype.split always returns >=1 element, so the `?? \'\'` is defensive, not load-bearing');
}

console.log('\n--- FIX-G [CONTRACT]: a copular modal no longer swallows a completion beside it (D162a closed)');
for (const s of [
  'You can be confident ACME was archived.',
  'It should be visible now \u2014 ACME Holdings was archived.',
  'That may be why Beta Corp was deleted.',
  'The change can be seen in the list \u2014 ACME Holdings was archived.',
  'This can be confirmed and ACME Holdings was archived.',
  'You can be sure the task was completed.',
  'It should be clear ACME has been archived.',
  'It may be worth noting that Orion Holdings was archived.',
  'That would be everything \u2014 ACME was renamed.',
  'The result might be surprising but ACME was restored.',
  'It could be that ACME was archived.',
  'It can be hard to say whether ACME was archived.',
]) check('CONTRACT', `FIX-G.copularModalDoesNotSwallow :: ${s}`, fires(s), 'CAUGHT at 4476c92; MISSED at 415fed3');

console.log('\n--- FIX-G [CONTRACT]: genuine perfect-passive hedges still survive (D161 not reopened)');
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
  'Salt and Pepper Co may have been archived.',
  'ACME may in fact have been archived.',
  'The record could well have been deleted.',
  'It may or may not have been archived.',
  'ACME might previously have been renamed.',
  'ACME could have been removed by someone else.',
]) check('CONTRACT', `FIX-G.hedgeSurvives :: ${s}`, !fires(s));

console.log('\n--- FIX-G [CONTRACT]: a bare `be` hedge was never reachable by this belt anyway');
for (const s of ['ACME may be archived.', 'The company should be archived tomorrow.', 'Beta Corp could be deleted next week.'])
  check('CONTRACT', `FIX-G.bareBeHedgeUnreachable :: ${s}`, !fires(s), 'so `|be` protected nothing (the FIX-G argument)');

// =====================================================================================
console.log('\n--- D163 [DEFECT] (P2, NEW, campaign #87): the modal-hedge guard is still not ANCHORED —');
console.log('    modal + (0-2 words) + PERFECT PASSIVE swallows a real completion when the entity name is ONE token.');
console.log('    Every one of these is were MISSED before FIX-H; CAUGHT here. `was` forms fire; `has been` forms do not.');
for (const s of [
  'I can confirm ACME has been archived.',
  'I can report ACME has been archived.',
  'I can verify ACME has been archived.',
  'We can confirm ACME has been archived.',
  'We should note ACME has been deleted.',
  'You should know ACME has been archived.',
  'You may recall ACME has been archived.',
  'You could see ACME has been archived.',
  'I would say ACME has been archived.',
  'I should mention Beta has been removed.',
]) check('DEFECT', `D163.modalWindowSwallowsCompletion :: ${s}`, fires(s), 'missed before FIX-H/FIX-I, CAUGHT at 4476c92 — regression vs baseline, undisclosed');

console.log('\n--- D163 [CONTRACT]: the shapes that DO fire, kept so a fix is not measured only on the hole');
for (const s of [
  'I can confirm ACME was archived.',                       // `was`, not the perfect passive
  'I can confirm ACME Holdings has been archived.',         // 3 tokens — outside {0,2}
  'We can confirm the task has been completed.',            // 3 tokens
  'I can tell you ACME has been archived.',                 // 3 tokens
  'I can confirm test3 has been archived.',                 // digit in the name breaks [a-z]+
  'You can quite very definitely be confident ACME Holdings was archived.',
]) check('CONTRACT', `D163.controlStillFires :: ${s}`, fires(s));

console.log('\n--- D164 [DEFECT] (P3, NEW, campaign #87): FIX-F widened the evidential disjunct, so a POSITIVE');
console.log('    evidential clause after a subordinator now disarms the belt for names containing a coordinator too.');
for (const s of [
  'Nothing failed however the log shows Acme and Sons was archived.',
  'No errors occurred however the audit confirms Salt and Pepper Co was archived.',
  'No issues arose although the record states Barnes and Noble was deleted.',
  'No blockers remain therefore the report notes Johnson and Johnson was restored.',
  'No problems though the log proves Smith and Sons was removed.',
]) check('DEFECT', `D164.positiveEvidentialAfterSubordinator :: ${s}`, fires(s), 'CAUGHT at 415fed3 AND 4476c92, missed before FIX-H/FIX-I');

console.log('\n--- D164 [CONTRACT]: FIX-I closes the linker-free half too — these fabrications are CAUGHT here');
for (const s of [
  'Nothing failed however the log shows ACME was archived.',
  'No errors occurred however the audit confirms ACME was archived.',
]) check('CONTRACT', `D164.plainNameNowCaught :: ${s}`, fires(s), 'FIX-I: an evidential subordinates only when its subject is the negated NP; a determiner-led subject is a new positive clause');

// =====================================================================================
console.log('\n--- PRIOR BELT CLOSURES [CONTRACT] — none reopened');
for (const [id, s, want] of [
  ['D112.noun', 'There are 3 archived companies.', false],
  ['D112.list', 'The archived list has 4 entries.', false],
  ['D112.notdone', 'Still pending, not approved.', false],
  ['D112.presentNegation', 'The company is not archived.', false],
  ['D125.trailingDash', 'ACME was archived \u2013 no undo available.', true],
  ['D125.paren', 'ACME was archived (no undo available).', true],
  ['D125.without', 'ACME was archived without incident.', true],
  ['D125.andNoErrors', 'ACME was archived and no errors occurred.', true],
  ['D128.saltAndPepper', 'No company named Salt and Pepper Co was archived.', false],
  ['D130.closedLoop', 'Closed Loop Systems was not archived.', false],
  ['D130.archivedMedia', 'Archived Media Group was not deleted.', false],
  ['D131.withoutBorders', 'Doctors Without Borders was not archived.', false],
  ['D134.confirmedLaterClause', 'Confirmed \u2014 as requested, Restored Bob Smith.', true],
  ['D134.confirmedNegatedClause', 'Confirmed \u2014 as requested, the company was not archived.', false],
  ['D136.stateButNegated', 'ACME is archived but was not deleted.', false],
  ['D137.stateNotEvent', 'test3 is archived. Should I restore it?', false],
  ['D137.statePresent', 'The task is completed.', false],
  ['D139.hyphenPlaceName', 'No company in Ulaanbaatar-Songino was archived.', false],
  ['D147b.clauseInitialNegatorNoFreePass', 'No errors occurred and ACME was archived.', true],
  ['D151.zeroRelativizer', 'No record Salt and Pepper Co was archived.', false],
  ['D155.firstPersonProperName', 'I deleted Beta Corp.', true],
  ['D155.firstPersonEntityNoun', 'I deleted the company.', true],
  ['D155.notAClaim.draft', 'I removed it from my draft.', false],
  ['D155.notAClaim.order', 'I restored order to the list.', false],
  ['D156.sameSegmentEvidential', 'No log however shows ACME Holdings was archived.', false],
  ['D156.sameSegmentEvidential2', 'No entry however notes Delta Ltd was archived.', false],
  ['D158.firstPersonUnarchived', 'I unarchived Beta Corp.', true],
  ['D160.adverbNever', 'No company was never archived.', false],
  ['D160b.intransitiveEvidential', 'No system recorded ACME Holdings was archived.', false],
  ['D100.confirmedParticiple', 'Confirmed \u2014 Restored Bob Smith.', true],
  ['D103c.referenceless', 'Confirmed \u2014 the company (option 1).', true],
  ['D103.substantive', 'Confirmed \u2014 the company you asked about is in Ulaanbaatar.', false],
  ['D94.passiveProgressive', 'ACME is being archived.', true],
  ['BUG-002.plain', 'The approval has been approved.', true],
]) check('CONTRACT', `prior.${id}`, fires(s) === want, `expected ${want ? 'FIRE' : 'survive'}`);

console.log('\n--- PRIOR MATCHER CLOSURES [CONTRACT] — none reopened');
{
  const opts = [
    { id: 'id-1', label: 'ACME Holdings', entityType: 'company', actionType: 'archive' },
    { id: 'id-2', label: 'ACME Logistics', entityType: 'company', actionType: 'archive' },
    { id: 'id-3', label: 'Delta Ltd', entityType: 'company', actionType: 'archive' },
  ];
  const sel = (c) => { const r = matcher.matchDisambiguationOption(c, opts); return r ? r.id : null; };
  for (const [id, cmd, want] of [
    ['D116.negatedMention', "don't archive acme holdings", null],
    ['D116.except', 'anything except acme holdings', null],
    ['D116.notTheOther', 'not acme holdings, the other one', null],
    ['D123.plainName', 'acme holdings', 'id-1'],
    ['D129.nameWithNumber', 'acme 2', null],
    ['D132.quotedName', '\u201cACME Holdings\u201d', 'id-1'],
    ['D133.ordinalWord', 'the second one', 'id-2'],
    ['D133.ordinalHash', '#3', 'id-3'],
    ['D133.bareNumber', '2', 'id-2'],
    ['D135.negatedOrdinal', 'no option 2', null],
    ['D142.emptyReply', '   ', null],
    ['D148.outOfRangeOrdinal', 'option 9', null],
    ['D150.yesPrefixedName', 'yes, acme logistics', 'id-2'],
    ['D157.optionSuffix', 'acme holdings (option 1)', 'id-1'],
  ]) check('CONTRACT', `matcher.${id}`, sel(cmd) === want, `got ${sel(cmd)}, want ${want}`);

  const amb = [{ id: 'o1', label: 'Option 2 Ltd', entityType: 'company', actionType: 'archive' },
    { id: 'o2', label: 'Beta Corp', entityType: 'company', actionType: 'archive' }];
  check('CONTRACT', 'matcher.D136.ordinalAmbiguousWithName',
    matcher.matchDisambiguationOption('option 2', amb) === null, 'a company literally named "Option 2 Ltd" must dead-end');

  check('CONTRACT', 'matcher.D157.unifiedContradiction',
    matcher.commandContradictsActionType('restore it', 'archive') === true
    && matcher.commandContradictsActionType('archive it', 'restore') === true
    && matcher.commandContradictsActionType('bring it back', 'archive') === true
    && matcher.commandContradictsActionType('archive it', 'archive') === false);
}

console.log('\n--- QUESTION BELT [CONTRACT] — byte-identical and behaviourally unchanged');
{
  // Pinned at MY slice boundaries (`const safeQuestionFragment =` .. the first 8-space `};`),
  // measured identical at 4476c92, 415fed3 and this candidate. NOTE: ledger #86 records
  // "7,995 bytes / sha16 394e7666d501f8f1" for the same invariant; that number is not
  // reproducible under these boundaries (a slice-definition difference, not a code change —
  // the slice is byte-identical across all three SHAs either way).
  const qsha = createHash('sha256').update(QB.src).digest('hex');
  check('CONTRACT', 'questionBelt.byteLength', QB.src.length === 8110, `safeQuestionFragment source is ${QB.src.length} bytes (8110 at 4476c92, 415fed3 and here)`);
  check('CONTRACT', 'questionBelt.sha16', qsha.slice(0, 16) === '1c5cafa9673855f8', `sha16 ${qsha.slice(0, 16)}`);
  const q = QB.mod.safeQuestionFragment;
  for (const [id, inp, want] of [
    ['D61.assertionBeforeQuestion', 'ACME has been archived. Which did you mean?', 'Which did you mean?'],
    ['D88.commaClause', 'I archived ACME, ok?', 'ok?'],
    ['D92.mentionsCompletionWord', 'Which archived company did you mean?', 'Which archived company did you mean?'],
    ['D114.firstPersonInterrogativeLed', 'Did I mention I archived ACME already?', null],
    ['D98.completionInNounPhrase', 'Which company did we archive last week that you want restored?', 'Which company did we archive last week that you want restored?'],
    ['D53.notAQuestion', 'ACME has been archived.', null],
  ]) check('CONTRACT', `questionBelt.${id}`, q(inp) === want, `got ${JSON.stringify(q(inp))}`);
}

console.log('\n--- SOURCE INVARIANTS [CONTRACT]');
check('CONTRACT', 'src.noModifierGroupOnAnyNonCommentLine',
  !/\(\?-?i:/.test(NONCOMMENT), 'a (?-i:)/(?i:) group is unverified in the Deno runtime and would fail at module load');
check('CONTRACT', 'src.fixG.beAlternativeDeleted',
  NONCOMMENT.includes('(?:have been|has been|had been)\\b/i.test(c)') && !NONCOMMENT.includes('had been|be)\\b/i.test(c)'));
check('CONTRACT', 'src.fixF.reusesNameGuard',
  /\.split\(\/\(\?:\^\|\\s\)\[a-z\]\[\^\\s\]\*\\s\+\(\?:and\|but\)\\s\//.test(NONCOMMENT),
  'the evidential split must carry the (?:^|\\s) anchored lowercase-token guard');
check('CONTRACT', 'src.fixF.leadingPopNullSafe',
  /\.split\(\/\\b\(\?:although\|though\|however\|therefore\)\\b\/i\)\.pop\(\) \?\? ''\)/.test(NONCOMMENT));
check('CONTRACT', 'src.fixC.lookbehindChainStillGone',
  !NONCOMMENT.includes('(?<!was )(?<!were )'));
{
  // The belt's named-const set must not grow: run15-run18 assemble the belt from this list.
  const consts = (BELT_BLOCK.text.match(/^\s*const ([A-Z_][A-Z0-9_]*)\s*=/gm) || [])
    .map((s) => s.trim().replace(/^const /, '').replace(/\s*=$/, ''));
  const expected = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
    'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX'];
  check('CONTRACT', 'src.beltConstSetUnchanged', JSON.stringify(consts) === JSON.stringify(expected), JSON.stringify(consts));
}
{
  // D162c, honestly stated: a variable-length lookbehind IS shipped. This is the WORKING
  // detector (run25's `[^)]*` form could not see it). It must report TRUE, not FALSE.
  const vll = /\(\?<[!=](?:[^()]|\((?:\?:)?[^()]*\))*[*+{][^)]*\)/.test(NONCOMMENT);
  check('CONTRACT', 'src.variableLengthLookbehindIS_shipped_andDisclosed', vll === true,
    'FIRST_PERSON_MAIN_CLAUSE_COMPLETION uses \\w{1,24} inside a lookbehind; harmless under V8/Deno, must stay DISCLOSED not denied');
  check('CONTRACT', 'src.thatLookbehindIsTheFirstPersonOne',
    /\(\?<!\\b\(\?:the\|a\|an\|all\|any\|some\|those\|these\|our\|your\|my\|their\|both\|each\|every\)\\s\\w\{1,24\}\\s\)/.test(NONCOMMENT));
}

console.log('\n--- DOCUMENTED RESIDUALS [RESIDUAL] — pinned at CURRENT behaviour');
for (const [id, s, want, note] of [
  ['D116.nothingBundtCakes', 'Nothing Bundt Cakes was archived.', false, 'a real name beginning with a negator word disarms the belt (run17/D128 disclosure)'],
  ['D156b.subjectNP', 'That ACME was archived cannot be confirmed.', true, 'subject-NP shape'],
  ['D158d.allcapsNonEntityObject', 'I restored ORDER to the layout.', true, 'ALLCAPS non-entity object reads as an entity to the case-sensitive arm'],
  ['D153.droppedLinker', 'No errors ACME was archived.', false, 'dropped-linker trade'],
  ['lowercaseNameWithAnd.1', 'No record shows salt and pepper co was archived.', true, 'the D151 name guard is case-SENSITIVE: an all-lowercase company name containing `and` is still read as a clause linker'],
  ['lowercaseNameWithAnd.2', 'No log however shows barnes and noble was archived.', true, 'same; disclosed by verifier #26, inherited unchanged by FIX-F'],
  ['modalWindow.hedgeOverThreeWords', 'ACME may well and truly have been archived.', true, 'a hedge with >2 intervening words falls outside {0,2} and is destroyed (also true at 4476c92)'],
  // D165 (P3, NEW disclosure by verifier #27, NOT a regression — identical at 4476c92,
  // 415fed3 and here). The run11/D87 class ("one shared verb list, every arm") was never
  // applied to the PERFECT-PASSIVE arm: LEGACY_PAST_COMPLETION's participle list omits
  // activated/deactivated/closed/cleared/sent, and CONFIRMED_COMPLETION's omits closed/added.
  // So "X was activated." is caught and "X has been activated." ships — the same claim, two
  // outcomes, which is exactly what D87 was raised to end.
  ['D165.hasBeen.activated', 'Delta Ltd has been activated.', false, 'LEGACY participle list omits `activated`; "Delta Ltd was activated." IS caught'],
  ['D165.hasBeen.deactivated', 'Delta Ltd has been deactivated.', false, 'same'],
  ['D165.hasBeen.closed', 'Delta Ltd has been closed.', false, 'same'],
  ['D165.hasBeen.cleared', 'Delta Ltd has been cleared.', false, 'same'],
  ['D165.hasBeen.sent', 'Delta Ltd has been sent.', false, 'same'],
  ['D165.confirmed.closed', 'Confirmed — Delta Ltd closed.', false, 'CONFIRMED_COMPLETION participle list omits `closed`'],
  ['D165.confirmed.added', 'Confirmed — Delta Ltd added.', false, 'CONFIRMED_COMPLETION participle list omits `added`'],
  ['D165.control.was', 'Delta Ltd was activated.', true, 'the control: the was/were arm DOES carry `activated`'],
  ['D165.control.hasBeenAdded', 'Delta Ltd has been added.', true, 'the control: `added` IS in the LEGACY list'],
]) check('RESIDUAL', id, fires(s) === want, note);

// =====================================================================================
console.log('\n--- FOUNDER-DIRECTED LEXICAL BRANCH [CONTRACT] — real names x every completion word');
{
  const WORDS = ['archived', 'deleted', 'updated', 'created', 'restored', 'activated', 'deactivated',
    'assigned', 'reassigned', 'approved', 'rejected', 'removed', 'completed', 'renamed', 'ended',
    'closed', 'cleared', 'sent', 'moved', 'granted', 'declined', 'added'];
  const NAMES = ['ACME Holdings', 'Beta Corp', 'CLIX GPS', 'Orion Holdings', 'Delta Ltd', 'Gamma LLC',
    'Ulaanbaatar Logistics', 'Nomad Steel', 'Blue Sky Mining', 'Erdenet Works', 'Salt and Pepper Co',
    'Barnes and Noble', 'Johnson and Johnson', 'Smith and Sons', 'Marks and Spencer', 'Black and Decker Mongolia',
    'Rock and Roll Media', 'Closed Loop Systems', 'Archived Media Group', 'Doctors Without Borders',
    'No Limits Inc', 'Option 2 Ltd', 'Advanced Closed Systems', 'Was Archived Holdings',
    'Nothing but Nets Foundation', 'All but One Ltd', 'Hong and Partners', 'Green and Gold Ltd'];
  // Names that BEGIN with a negator word are the disclosed D116/D128 residual, and the
  // completion words missing from LEGACY/CONFIRMED are D165 \u2014 both pinned above, so they are
  // reported separately here rather than being allowed to blur the branch result.
  const NEGATOR_INITIAL = /^(no|not|never|nothing|none|neither|nor|few)\b/i;
  const D165_LEGACY_GAP = new Set(['activated', 'deactivated', 'closed', 'cleared', 'sent']);
  const D165_CONFIRMED_GAP = new Set(['closed', 'added']);
  let ok = 0, bad = 0, pinned = 0; const badRows = [];
  let destroyedTruthful = 0;
  for (let i = 0; i < WORDS.length; i++) {
    const w = WORDS[i];
    const n = NAMES[i % NAMES.length];
    const cases = [
      // survive (truthful negatives / questions / state)
      [`There is no record ${n} was ${w}.`, false, 'truthful'],
      [`No record shows ${n} was ${w}.`, false, 'truthful'],
      [`${n} was not ${w}.`, false, 'truthful'],
      [`Which company did you mean, ${n}?`, false, 'truthful'],
      [`${n} is ${w}. Should I change that?`, false, 'truthful'],
      // fire (fabrications)
      [`${n} was ${w}.`, true, 'fab'],
      [`${n} has been ${w}.`, true, `fab${D165_LEGACY_GAP.has(w) ? '.D165' : ''}`],
      [`Confirmed \u2014 ${n} ${w}.`, true, `fab${D165_CONFIRMED_GAP.has(w) ? '.D165' : ''}`],
    ];
    for (const [s, want, kind] of cases) {
      const known = kind.endsWith('.D165') || (kind === 'fab' && NEGATOR_INITIAL.test(n));
      if (fires(s) === want) ok++;
      else if (known) pinned++;
      else { bad++; if (want === false) destroyedTruthful++; if (badRows.length < 12) badRows.push(`${want ? 'MISSED' : 'DESTROYED'}: ${s}`); }
    }
  }
  for (const r of badRows) console.log('     ' + r);
  check('CONTRACT', 'founderLexicalBranch.noTruthfulAnswerDestroyed', destroyedTruthful === 0,
    `${destroyedTruthful} truthful answers destroyed \u2014 the worse direction (D112)`);
  check('CONTRACT', 'founderLexicalBranch', bad === 0,
    `${ok} correct / ${bad} unexplained / ${pinned} explained by the pinned D165 + negator-initial-name residuals, across ${WORDS.length} completion words x 8 branches`);

  // The two shapes the brief names explicitly, per completion word, incl. a name with an internal `and`.
  let nb = 0;
  for (const w of WORDS) for (const n of ['ACME Holdings', 'Salt and Pepper Co', 'Barnes and Noble']) {
    if (fires(`There is no record ${n} was ${w}.`)) nb++;
  }
  check('CONTRACT', 'founderLexicalBranch.noRecordPerWordPerName', nb === 0, `${nb} truthful "There is no record <Name> was <word>." destroyed`);
}

// =====================================================================================
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log('  ' + f); }
process.exit(failures.length ? 1 : 0);
