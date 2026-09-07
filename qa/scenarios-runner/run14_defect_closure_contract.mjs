// RUN14 DEFECT CLOSURE CONTRACT — verifier #14's cases (campaign #74), promoted with
// FIXED expectations after all of them were closed. Base was f1722f2 (index.ts sha256
// 10db5838…a70d2a); every case below passes on the fixed source. Original file under
// qa/verification/proposed/v14_regression_additions.mjs.
//
// THREE OF THE DEFECTS HERE WERE MINE, shipped one campaign earlier in f1722f2: D106 (a
// P1 wrong-entity binding), D112 (a belt that destroyed truthful answers), and D114 (a
// belt swap that reopened run12's class). The fixes for all three came from the verifier
// that found them, and in D106's case its version was better than the one I had prepared
// — mine guessed on multi-mention replies and my own 12-case probe contained no
// multi-mention case, which is exactly why my self-validation read clean.
//
// Same two-kind convention as run10/run11/run12/run13, and the SAME exit guard: ANY
// failure exits nonzero. No kind-based carve-out.
//
//   CONTRACT — a property that HOLDS on f1722f2 but that NO committed suite observes.
//              Every one of these corresponds to a SURVIVING mutant in this campaign's
//              own mutation battery (qa/verification/scratch/v14_mutations.mjs, 34 mutants,
//              18 killed / 16 survived). A CONTRACT case failing here means the guard's
//              narrowness or its very existence has stopped being observed.
//   DEFECT   — a real escape or regression demonstrated on f1722f2. Expected = the FIXED
//              behaviour, so these FAIL on f1722f2 by design and the suite exits 1 until
//              they are closed. That is the file working as intended.
//
// What this campaign found, and the lessons worth keeping:
//   * D106 is the first defect in this sequence that can select a DIFFERENT entity rather
//     than none. Every prior label defect could only dead-end. D102's raw fallback reaches
//     OUTSIDE the already-matching set, so a short option that is a raw substring of the
//     founder's reply wins over the longer option they actually named.
//   * D114 is the THIRD consecutive campaign in which one direction of the question belt
//     was closed by reopening the other. FIX-3b REPLACED run12's first-person belt instead
//     of adding to it. The axis is neither subject nor lead — it is CLAUSE POSITION.
//   * The eleventh vacuous-guard recurrence is here (D107/D108): the commit's own headline
//     claims ("one predicate, both arms"; the replay site no longer composes a completion)
//     are both unobserved by every committed case.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';


// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,
// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is
// what makes "an empty set produces byte-identical verdicts" the structural default of the whole
// battery rather than a control someone has to remember to run. `new Function` bodies execute in
// global scope, so this one assignment reaches every belt-build site in this file.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

function findRepoFile(rel) {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = resolve(d, rel);
    try { readFileSync(p); return p; } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate ' + rel);
}
const { stripTS, withPatternsAboveWindow } = await import(new URL('file://' + findRepoFile('qa/scenarios-runner/_gate_extract.mjs')).href);
const SRC = process.env.SEM_INDEX_SRC || findRepoFile('supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// ---- gate slice -----------------------------------------------------------------
const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
if (gStart === -1 || gAnchor === -1) throw new Error('gate slice anchors not found — update this harness, do not let it pass');
const gateSlice = withPatternsAboveWindow(src, stripTS(src.slice(gStart, src.indexOf('};', gAnchor) + 2)));
const gateFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, questions: result.questions };');

// ---- matchDisambiguationOption ---------------------------------------------------
const mStart = src.indexOf('function matchDisambiguationOption');
const mEnd = src.indexOf('\n}', mStart);
if (mStart === -1 || mEnd === -1) throw new Error('matchDisambiguationOption not found — update this harness');
const matchFn = new Function('command', 'options',
  stripTS(src.slice(mStart, mEnd + 2)) + '\n; return matchDisambiguationOption(command, options);');

// ---- the disambiguation REPLAY site, executed as shipped --------------------------
// No committed suite executes this site. It is the ONLY thing standing between a stored
// assertion-shaped label and founder-facing prose on a deterministic-disambiguation turn,
// because arm 1 of the drift gate excludes every deterministic-* model by design.
// NOTE ON THE EXTRACTION, because getting this wrong makes the whole D108 block vacuous
// and I did get it wrong on the first pass: the `summary:` EXPRESSION must be lifted out of
// the source and evaluated, never restated here. Restating it produced a harness that
// passed identically whether or not the guard existed — the exact defect class this file
// reports. The slice therefore runs from `const replayLabel` to `fields:` and returns the
// source's own expression.
const rStart = src.indexOf('const replayLabel = String(matchedOption.label');
const rDet = src.indexOf('deterministic = {', rStart);
const rSum = src.indexOf('summary:', rDet);
const rFields = src.indexOf('fields:', rSum);
if (rStart === -1 || rDet === -1 || rSum === -1 || rFields === -1) throw new Error('disambiguation replay site not found — update this harness, do not let it pass');
const pcp = src.match(/const PAST_COMPLETION_CLAIM_PATTERN = [\s\S]*?;\r?\n/);
const cw = src.match(/const COMPLETION_WORD = [\s\S]*?;\r?\n/);
if (!pcp || !cw) throw new Error('pattern definitions not found — update this harness');
const summaryExpr = src.slice(rSum + 'summary:'.length, rFields).replace(/,\s*$/, '');
if (!/\S/.test(summaryExpr)) throw new Error('replay summary expression is empty — update this harness');
const replayFn = new Function('matchedOption',
  stripTS(pcp[0] + cw[0] + src.slice(rStart, rDet)) + '\n; return (' + summaryExpr + ');');

const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ID2 = '11111111-1111-1111-1111-111111111111';
const ID3 = '22222222-2222-2222-2222-222222222222';
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
// P1 (governance/OPERATING_TRUTH_MODEL.md §3): the executor reads the REQUEST. Harness calls
// default to a mutation-intent command; read-only cases pass command: ''.
const run = (opts = {}) => { globalThis.command = typeof opts.command === 'string' ? opts.command : 'archive ACME Holdings'; return run0(opts); };
const run0 = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt' } = {}) =>
  gateFn({ claims, summary, pendingAction, questions }, evidence, context, model, false, false, DENO,
    mk(), mk(), mk(), mk(), false, '', mk());

const Q = (q) => run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;
const corrected = (s, model = 'gpt') => run({ summary: s, model }).corrected === true;
const label = (l, canonicalName, id = ACME) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: [{ label: l, id, entityType: 'company' }] },
  context: canonicalName ? { companies: [{ id, name: canonicalName }] } : {} }).envelope?.pendingAction?.options?.[0]?.label;
const labels = (opts, context = {}) => run({ summary: 'ok',
  pendingAction: { kind: 'disambiguation', question: 'Which?', options: opts }, context })
  .envelope?.pendingAction?.options?.map((o) => o.label);
const O = (l, id) => ({ label: l, id, entityType: 'company', actionType: 'archive' });

const CASES = [];
// run39: last non-space character before an index - tells a regex literal from a division operator
// in the statement scan below.
function prevNonSpace(text, i) { let j = i - 1; while (j >= 0 && /\s/.test(text[j])) j--; return j >= 0 ? text[j] : ''; }
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D106 — DEFECT (P1, REGRESSION vs ace9b6a). THE MOST DANGEROUS FINDING OF THIS CAMPAIGN.
// run13/D102 added a RAW-label fallback when the presentation-stripped pass is ambiguous.
// The fallback filters `options`, not `matches`, and tests CONTAINMENT rather than
// equality. So when the founder names the longer of two options, a SHORTER option that
// happens to be a raw substring of their reply is the only raw match — and wins.
// A/B, matchDisambiguationOption in isolation:
//   fdb4564  MIS-BINDS (raw-only comparison)
//   ace9b6a  null for all of these — D93's normalisation had closed the class
//   f1722f2  MIS-BINDS again
// The bound option's own actionType then resolves a DESTRUCTIVE field
// (resolveClarificationField -> archiveCompanyIds) with NO llm in the loop, and
// commandContradictsActionType cannot help: the reply carries no opposite-family verb.
// Founder answers a question about "Smith's Bakery"; Brain OS archives "Smith".
// =====================================================================================
for (const [tag, reply, opts, wrongId] of [
  ['substringApostrophe', 'smiths bakery', [O('Smith', ACME), O("Smith's Bakery", ID2)], ACME],
  ['shortNameWins', 'founders fund', [O('Fund', ACME), O("Founders' Fund", ID2)], ACME],
  ['threeWay', 'obrien logistics', [O('OBrien', ACME), O("O'Brien Logistics", ID2), O('Zeta', ID3)], ACME],
]) {
  C('D106.' + tag, 'DEFECT',
    'D106: a disambiguation reply must never bind to an option the founder did not name (' + JSON.stringify(reply) + ')',
    () => { const r = matchFn(reply, opts); return r === null || r.id !== wrongId; });
}
C('D106.statedCaseStillDeadEnds', 'DEFECT',
  'D106: D102\'s own stated goal — typing the EXACT name of the apostrophe option must select it, not dead-end',
  () => { const r = matchFn("smith's bakery", [O('Smith', ACME), O("Smith's Bakery", ID2)]); return !!r && r.id === ID2; });
C('D106.hold.ambiguousStaysNull', 'CONTRACT',
  'a genuinely ambiguous reply still resolves to NOTHING rather than to a guess (unobserved: G4.lim.firstNotUnique survived)',
  () => matchFn('acme', [O('Acme', ACME), O('Acme', ID2)]) === null);
C('D106.hold.unambiguous', 'CONTRACT', 'an unambiguous reply still selects the right option',
  () => { const r = matchFn('acme holdings', [O('Acme Holdings', ACME), O('Beta Co', ID2)]); return !!r && r.id === ACME; });
// FORWARD-LOOKING CONTRACTS. These hold on f1722f2 and must survive whatever closes D106.
// A "most specific match wins" repair was proposed concurrently with this campaign and was
// verified here: it closes all three mis-bindings and is otherwise better than both prior
// SHAs — but on its own it GUESSES whenever a reply mentions several option labels, and
// picks the longest even when the reply explicitly excludes it. That is the run9/D32
// "the reply's own words say otherwise" class arriving through a new door. Any D106 fix must
// keep these three dead ends. (The validated form adds a residual-mention guard: after
// removing the winning label, no OTHER option label may remain in the reply.)
for (const [tag, reply, opts] of [
  ['mentionsBothEntities', 'move the tasks from acme to acme holdings', [O('Acme', ACME), O('Acme Holdings', ID2)]],
  ['replyExcludesTheLongest', 'archive acme, leave acme holdings alone', [O('Acme', ACME), O('Acme Holdings', ID2)]],
  ['mentionsTwoDistinctOptions', 'alpha co and beta co', [O('Alpha Co', ACME), O('Beta Co', ID2)]],
]) {
  C('D106.hold.' + tag, 'CONTRACT',
    'a reply naming SEVERAL options must resolve to nothing, never to the longest one (' + JSON.stringify(reply) + ')',
    () => matchFn(reply, opts) === null);
}

// Added while mutation-proving the fix: BOTH "coverage" mutants for D106 (widening the
// specificity pass and the raw tie-break from the MATCHED set back to ALL options) survived
// the suite as written. They fail SAFE — they degrade to a dead end rather than a mis-bind —
// but "fails safe" is not "is observed", and an unobserved guard is how this class keeps
// coming back. This case pins the scoping: an option that the reply never mentions must not
// be able to enter the tie-break merely by sharing the winner's length. "Alpha Company" and
// "Smith's Bakery" both normalise to 13 characters, so under the widened pass the winner
// ties with an unmentioned option, the raw tie-break finds neither, and the founder's
// unambiguous reply silently dead-ends.
// The raw tie-break must also stay confined to the TIED set. Widening it to every matched
// option survived the suite until this case existed: with a third, SHORTER option that the
// reply also contains ("Bob"), the widened tie-break matches two things and the founder's
// exact reply dead-ends instead of selecting the name they typed character for character.
C('D106.hold.tieBreakIgnoresShorterMatches', 'CONTRACT',
  'the raw tie-break considers only the normalisation-tied labels, so a shorter incidental match cannot spoil it',
  () => { const r = matchFn("bob's co",
    [O("Bob's Co", ACME), O('Bobs Co', ID2), O('Bob', ID3)]);
    return !!r && r.id === ACME; });
C('D106.hold.unmentionedSameLength', 'CONTRACT',
  'an option the reply never mentions must not enter the tie-break by sharing the winner length',
  () => { const r = matchFn('smiths bakery',
    [O('Smith', ACME), O("Smith's Bakery", ID2), O('Alpha Company', ID3)]);
    return !!r && r.id === ID2; });

// =====================================================================================
// D107 — CONTRACT (ELEVENTH vacuous-guard recurrence). The commit's headline structural
// claim is that legacyProseFallback and unaccountedCompletionProse now share ONE
// readsAsCompletion() predicate "so a new completion shape cannot be half-covered again".
// Reverting arm 2 (unaccountedCompletionProse) to its own private pattern copy leaves the
// ENTIRE 25-suite battery green — the claim is only half-observed. The ledger's own stated
// lesson ("a guard that cannot be over-broadened without a test failing is only half-
// proven") is not applied to the fix that states it.
// =====================================================================================
C('D107.bothArmsShareThePredicate', 'CONTRACT',
  'D107: BOTH drift arms must call readsAsCompletion(), not a private copy of the pattern list',
  () => {
    const arm1 = src.match(/const legacyProseFallback =[\s\S]{0,3000}?;\r?\n/);
    const arm2 = src.match(/const unaccountedCompletionProse =[\s\S]{0,3000}?;\r?\n/);
    if (!arm1 || !arm2) throw new Error('drift arms not found — update this harness, do not let it pass');
    return arm1[0].includes('readsAsCompletion(') && arm2[0].includes('readsAsCompletion(');
  });
C('D107.predicateCoversAllFour', 'CONTRACT',
  'D107: readsAsCompletion() must consult all four belts (LEGACY, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION)',
  () => {
    // run39: the character budget is GONE. It was 2000, then 2600, then 4000, widened every time the
    // predicate grew, and each time it silently TRUNCATED first - a truncated slice still contains the
    // four names, so this CONTRACT could pass on a slice that is not the statement. Verifier #38 flagged
    // the remaining 107 characters of headroom as the next instance. The slice is now scanned to the
    // statement's real end and FAILS LOUDLY if that end is not found, so no budget is ever guessed again.
    const BSLASH = String.fromCharCode(92);
    const start = src.indexOf('const readsAsCompletion =');
    if (start < 0) throw new Error('readsAsCompletion not found - update this harness');
    let k = start, depth = 0, inRe = false, inStr = '', prev = '';
    for (; k < src.length; k++) {
      const ch = src[k];
      if (inStr) { if (ch === inStr && prev !== BSLASH) inStr = ''; }
      else if (inRe) {
        if (ch === '[' && prev !== BSLASH) { while (k < src.length && !(src[k] === ']' && src[k - 1] !== BSLASH)) k++; }
        else if (ch === '/' && prev !== BSLASH) inRe = false;
      }
      else if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
      else if (ch === '/' && '=(,:[!&|?{};+*%~^<>'.includes(prevNonSpace(src, k))) inRe = true;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ';' && depth === 0) break;
      prev = ch;
    }
    if (k >= src.length) throw new Error('readsAsCompletion statement end not found - update this harness, do not widen a budget');
    const p = [src.slice(start, k + 1)];
    return ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'REFERENCELESS_CONFIRMATION']
      .every((n) => p[0].includes(n + '.test('));
  });

// =====================================================================================
// D108 — CONTRACT. The disambiguation REPLAY SITE (index.ts ~2566) has ZERO executable
// coverage in any committed suite: reverting it to the pre-fix `Confirmed — ${label}.`
// leaves the whole battery green. This matters more than it looks. That summary is emitted
// with model === 'deterministic-disambiguation', and arm 1 of the drift gate EXCLUDES every
// deterministic-* model by design; a deterministic turn also carries no claims array, so
// arm 2's structure precondition is not met either. The committed D100.replay /
// D103.falseConfirmation cases assert `corrected` at model 'gpt' — a path that never emits
// this string. The replay site is therefore the ONLY real protection, and nothing watched it.
// =====================================================================================
C('D108.replay.assertionLabelDegrades', 'CONTRACT',
  'D108: a stored assertion-shaped label must NOT be replayed into founder prose',
  () => !/Restored Bob Smith/.test(replayFn({ label: 'Restored Bob Smith' })));
C('D108.replay.typedFallbackDegrades', 'CONTRACT',
  'D108: a numbered typed fallback (which names nothing checkable) must degrade to a neutral acknowledgement',
  () => replayFn({ label: 'the company (option 1)' }) === 'Confirmed — proceeding with the option you selected.');
C('D108.replay.realNameIsQuotedAsACHOICE', 'CONTRACT',
  'D108: a real name must still be replayed, framed as the CHOICE the founder made, not as a completion',
  () => { const s = replayFn({ label: 'ACME Holdings' }); return s.includes('you selected') && s.includes('ACME Holdings'); });
C('D108.replay.neverDegradesEverything', 'CONTRACT',
  'D108: the degradation must not swallow every replay — the founder has to see which option was taken',
  () => replayFn({ label: 'ACME Holdings' }) !== replayFn({ label: 'Restored Bob Smith' }));

// =====================================================================================
// D112 — DEFECT (P2, NEW on f1722f2). CONFIRMED_COMPLETION is
//   /^\s*confirmed\s*[—–-]\s*.*\b(archived|deleted|…)\b/i
// with a bare `.*` and no negation or part-of-speech handling, so it fires on a completion
// word used in a NEGATION, as a NOUN, or in an explicitly-not-done statement. Every case
// below is a TRUTHFUL founder-facing answer, and every one is replaced with
// "I can't actually do that from chat — nothing was changed", which is itself false.
// Measured 9 of 16 NEW on f1722f2; 0 of 16 fire on ace9b6a.
// =====================================================================================
for (const [tag, s] of [
  ['negatedArchive', 'Confirmed — the company is not archived.'],
  ['negatedComplete', 'Confirmed — the task is not completed.'],
  ['negatedAssign', 'Confirmed — Bob is not assigned to that project.'],
  ['negatedGrant', 'Confirmed — access is not granted yet.'],
  ['negatedFirstPerson', 'Confirmed — I have not deleted anything.'],
  ['nounUseList', 'Confirmed — the archived list is empty.'],
  ['nounUseView', 'Confirmed — the deleted-items view shows nothing.'],
  ['nounUseCount', 'Confirmed — you have 3 archived companies.'],
  ['explicitlyPending', 'Confirmed — the approval is still pending, not approved.'],
]) {
  C('D112.' + tag, 'DEFECT',
    'D112: truthful answer ' + JSON.stringify(s) + ' must not be destroyed by the completion belt',
    () => !corrected(s));
}
C('D112.hold.realCompletion', 'CONTRACT', 'the belt still catches the shape it was built for',
  () => corrected('Confirmed — Restored Bob Smith.'));
C('D112.hold.referenceless', 'CONTRACT', 'the referenceless belt still catches its own shape',
  () => corrected('Confirmed — the company (option 1).'));
C('D112.hold.substantive', 'CONTRACT', 'a substantive confirmation still survives (run13 D103.hold.substantive)',
  () => !corrected('Confirmed — the company you asked about is in Ulaanbaatar.'));

// =====================================================================================
// D113 — DEFECT (P2). run13/D100's own comment says the grammar axis "was always wrong"
// and that the real question is "whether the DATABASE agrees the entity is called that".
// But the corroboration only RUNS when COMPLETION_WORD fires — the discredited grammar
// test is now the gate on the database test. A label using completion vocabulary outside
// that 24-word English list, or spelled with a Cyrillic confusable, is never corroborated
// and ships VERBATIM as a selectable option for an entity whose canonical name is something
// else entirely: the founder selects "Terminated Bob Smith" and archives "ACME Holdings".
// =====================================================================================
for (const [tag, l] of [
  ['outOfVocabTerminated', 'Terminated Bob Smith'],
  ['outOfVocabWiped', 'Wiped All Data'],
  ['outOfVocabRevoked', 'Revoked Access'],
  ['cyrillicConfusable', 'Сlosed Loop Systems'],
]) {
  C('D113.' + tag, 'DEFECT',
    'D113: uncorroborated label ' + JSON.stringify(l) + ' must not be shown as the name of an entity the canonical read calls something else',
    () => label(l, 'ACME Holdings') !== l);
}
C('D113.hold.corroborated', 'CONTRACT', 'a canonically-corroborated completion-shaped name still survives',
  () => label('Closed Loop Systems', 'Closed Loop Systems') === 'Closed Loop Systems');
C('D113.hold.idBound', 'CONTRACT',
  'corroboration is bound to THIS option\'s id — a label matching ANOTHER id\'s canonical name is still replaced (unobserved: G2.lim.corroborateAnyOption survived)',
  () => { const r = labels([O('Restored Bob Smith', ACME), O('Beta', ID2)],
    { companies: [{ id: ACME, name: 'ACME Holdings' }, { id: ID2, name: 'Restored Bob Smith' }] });
    return r[0] === 'ACME Holdings'; });
C('D113.hold.equalityNotContainment', 'CONTRACT',
  'corroboration requires EQUALITY, not containment — a fabricated label that is a substring of the canonical name is refused (unobserved: G2.lim.substringCorroboration survived)',
  () => label('Closed Loop', 'Closed Loop Systems') !== 'Closed Loop');
// run15/D119 RE-PIN: the typed-reference fallback was the last lexical branch, and verifier
// #15 measured it as having no discriminating power. An id absent from the canonical read
// is now DROPPED from the option list, never shown under any label.
C('D113.hold.absentId', 'CONTRACT', 'an id absent from the canonical read is dropped from the option list (re-pinned run15/D119; was: falls back to the typed reference)',
  () => label('Completed Migration', null, ID3) === undefined
     && labels([{ label: 'Completed Migration', id: ID3, entityType: 'company' }]).length === 0);

// =====================================================================================
// D114 — DEFECT (P2, REGRESSION vs ace9b6a). FIX-3b REPLACED run12's FIRST_PERSON_COMPLETION
// belt rather than adding to it, so every first-person completion assertion that happens to
// open with an interrogative word now reaches the founder. On a curated 20-case corpus of
// natural interrogative-led first-person assertions: ace9b6a 0/20 leak, f1722f2 13/20 leak,
// 0 newly closed. The commit message and index.ts:4805 both claim "strictly better on BOTH
// axes than any previous build" — measurably false on this sub-class. THIRD consecutive
// campaign closing one direction by reopening the other.
//
// The separating axis is neither SUBJECT (run12) nor LEAD (run13) but CLAUSE POSITION: in
// every legitimate D98 clarification the first-person completion sits inside a noun phrase
// ("the tasks we completed", "the ones I removed", "the company I archived"); in every
// assertion it is the main predicate. A belt dropping on that distinction was measured at
// 1/20 leaks with ALL 25 committed suites green — see the campaign #74 prepared fix.
// =====================================================================================
for (const [tag, q, leak] of [
  ['didIMention', 'Did I mention I archived ACME already?', /i archived acme/i],
  ['didIMention2', 'Did I mention I deleted the stale leads?', /i deleted the stale leads/i],
  ['doYouKnow', 'Do you know I already removed Bob from the roster?', /removed bob/i],
  ['haveITold', 'Have I told you I restored the backup?', /restored the backup/i],
  ['canINote', 'Can I note that I archived all three companies?', /archived all three/i],
  ['wouldYouBelieve', 'Would you believe I deleted the duplicates already?', /deleted the duplicates/i],
  ['ifItHelps', 'If it helps, I already deleted the duplicates ok?', /deleted the duplicates/i],
  ['ifYouLike', 'If you like, I already assigned the task to Bob ok?', /assigned the task/i],
  ['mayIAdd', 'May I add that I renamed the business unit?', /renamed the business unit/i],
  ['whatIsMore', 'What is more, I archived ACME this morning ok?', /archived acme/i],
  ['whereItMatters', 'Where it matters, I already moved every task ok?', /moved every task/i],
  ['whichRemindsMe', 'Which reminds me, I removed the old leads ok?', /removed the old leads/i],
]) {
  C('D114.' + tag, 'DEFECT',
    'D114: interrogative-led first-person assertion ' + JSON.stringify(q) + ' must not reach the founder as a question',
    () => { const s = Q(q); return s === null || !leak.test(s); });
}
// Controls that MUST keep holding when D114 is closed — these are run13's own D98 cases,
// restated here because the obvious fix (re-adding a blanket first-person belt) breaks all
// of them. Any D114 fix that fails these has simply swapped the direction again.
for (const q of [
  'Which of the tasks we completed should be reopened?',
  'Do you want the ones I removed restored?',
  'Did you mean the company I archived last week?',
  'Should I reopen the goal we closed in July?',
  'Is the invoice I sent the one you meant?',
  'Which of the people I assigned should be moved?',
  'Do you want the report we created yesterday?',
]) {
  C('D114.hold.' + CASES.filter((c) => c[0].startsWith('D114.hold.')).length, 'CONTRACT',
    'D98 must not reopen in the other direction: ' + JSON.stringify(q) + ' survives', () => Q(q) === q);
}

// =====================================================================================
// D111 — CONTRACT. Anchors and boundaries whose NARROWNESS is unobserved. Each corresponds
// to a surviving LIMIT mutant: removing the anchor broke no committed case, which is the
// same unobserved-narrowness class the run13 postscript calls the tenth recurrence.
// =====================================================================================
C('D111.confirmedCompletionIsStartAnchored', 'CONTRACT',
  'D111: CONFIRMED_COMPLETION must stay ^-anchored, or any prose merely containing "confirmed — … archived" is destroyed',
  () => /const CONFIRMED_COMPLETION = \/\^\\s\*confirmed/.test(src));
C('D111.referencelessIsStartAnchored', 'CONTRACT',
  'D111: REFERENCELESS_CONFIRMATION must stay ^-anchored',
  () => /const REFERENCELESS_CONFIRMATION = \/\^\\s\*confirmed/.test(src));
C('D111.referencelessIsEndAnchored', 'CONTRACT',
  'D111: REFERENCELESS_CONFIRMATION must stay $-anchored (run13 found this one; keep it observed)',
  () => { const m = src.match(/const REFERENCELESS_CONFIRMATION = (\/[\s\S]*?\/i);/); if (!m) throw new Error('REFERENCELESS_CONFIRMATION not found'); return /\$\/i$/.test(m[1]); });
C('D111.interrogativeLeadHasWordBoundary', 'CONTRACT',
  'D111: INTERROGATIVE_LEAD must keep its trailing \\b, or "Whoever archived ACME ok?" counts as an interrogative lead',
  () => { const m = src.match(/const INTERROGATIVE_LEAD = (\/[\s\S]*?\/i);/); if (!m) throw new Error('INTERROGATIVE_LEAD not found'); return /\|if\)\\b\//.test(m[1]); });

// =====================================================================================
// D109 — CONTRACT. run13/D100's corroboration SUBSUMES the fabrication-suppression role of
// the run10/D78 title-case discriminator, the run11/D86 position rule and the run12/D91
// determiner test: all three can be deleted with the whole battery still green. They are
// not dead — they now decide whether a genuinely-named entity renders QUOTED or plain — but
// nothing observed that, so three previously-closed defects were being carried silently by
// a fourth guard. Pin the residual behaviour so the consolidation is visible.
// =====================================================================================
C('D109.positionRuleStillQuotes', 'CONTRACT',
  'D109: a REAL entity whose canonical name has a completion word in predicate position renders as a QUOTED name, not bare prose',
  () => label('ACME Deleted', 'ACME Deleted') === '“ACME Deleted”');
C('D109.leadingParticipleWithObjectStillQuotes', 'CONTRACT',
  'D109: a real name led by a completion participle followed by a named object stays quoted',
  () => label('Deleted ACME', 'Deleted ACME') === '“Deleted ACME”');
C('D109.determinerSecondWordStillQuotes', 'CONTRACT',
  'D109: a real name whose second word is a determiner stays quoted',
  () => label('Closed The Deal', 'Closed The Deal') === '“Closed The Deal”');
C('D109.titleCaseDiscriminatorStillApplies', 'CONTRACT',
  'D109: run10/D78\'s Title-Case name-shape test still decides something — a lowercase adjectival-led name renders quoted',
  () => label('closed loop systems', 'closed loop systems') === '“closed loop systems”');
C('D109.adjectivalAllowlistStaysNarrow', 'CONTRACT',
  'D109: ADJECTIVAL_COMPLETION must not be over-broadened — a non-adjectival participle lead stays quoted even when canonically corroborated',
  () => label('Granted Full Access', 'Granted Full Access') === '“Granted Full Access”');

// =====================================================================================
// D110 — CONTRACT. run13/D103a keys collision numbering on labelKey. Over-broadening that
// key (collapsing distinct real names) broke no committed case, so the numbering's
// PRECISION is unobserved — spuriously numbering two real, distinct companies would tell
// the founder they are the same entity.
// =====================================================================================
C('D110.distinctNamesAreNotNumbered', 'CONTRACT',
  'D110: two genuinely distinct canonical names must NOT be numbered (unobserved: G5.lim.keyDropsAllPunctuation survived)',
  () => { const r = labels([O('Alpha Co', ACME), O('Beta Co', ID2)],
    { companies: [{ id: ACME, name: 'Alpha Co' }, { id: ID2, name: 'Beta Co' }] });
    return r[0] === 'Alpha Co' && r[1] === 'Beta Co'; });
C('D110.punctuationIsNotCollapsedByTheKey', 'CONTRACT',
  'D110: labelKey must not ignore punctuation — two real names differing only by a hyphen are DIFFERENT entities and must not be numbered as twins',
  () => { const r = labels([O('Smith Co', ACME), O('Smith-Co', ID2)],
    { companies: [{ id: ACME, name: 'Smith Co' }, { id: ID2, name: 'Smith-Co' }] });
    return r[0] === 'Smith Co' && r[1] === 'Smith-Co'; });
C('D110.collidingFallbacksAreStillNumbered', 'CONTRACT',
  'D110: colliding typed fallbacks are still numbered uniquely (run12/D95 + run13/D103a hold)',
  () => { const r = labels([O('the company', ACME), O('the company', ID2), O('the company (option 1)', ID3)]);
    return new Set(r).size === r.length; });

let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(38) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun14_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #74 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
