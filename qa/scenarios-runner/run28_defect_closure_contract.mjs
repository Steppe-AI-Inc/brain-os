// =====================================================================================
// run28 CLOSURE CONTRACT — promoted from v28_regression_additions (verifier #28 / campaign #88),
// then FIX-I reverted (D164/D166 re-opened as RESIDUAL); PASSED by verifier #29 (campaign #89).
//
// Candidate under test (run28 consolidation): 95c824c
// index.ts sha256:     0565a5c2398ca17d44de18a40e4a1a1168651b1c1136153b28e6ac944be9c757
// NOTE: the D166/D164 residual notes below still mention a "FIX-I lookahead" that this candidate
//   REVERTED — the assertions pin the correct (reverted, missed) behaviour; only that prose is stale.
//
// Groups:
//   [CONTRACT] — behaviour that MUST hold. A failure here is a reopened closure.
//   [DEFECT]   — a defect this campaign found. FAILS on this candidate BY DESIGN; it goes
//                green only when the defect is actually fixed. Do not "fix" it by editing
//                the expectation.
//   [RESIDUAL] — a disclosed, deliberately-deferred gap, pinned at its CURRENT behaviour so
//                that a later change which moves it is seen rather than discovered live.
//
// ANY failure in any group exits nonzero.
//
// Source: SEM_INDEX_SRC, else ../../supabase/functions/sem-ai-command/index.ts.
// The predicate is sliced out of the REAL shipped source by this file's own extractor —
// it imports nothing from qa/scenarios-runner and nothing from any v27_*/v28_* artefact.
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';


// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,
// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is
// what makes "an empty set produces byte-identical verdicts" the structural default of the whole
// battery rather than a control someone has to remember to run. `new Function` bodies execute in
// global scope, so this one assignment reaches every belt-build site in this file.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  // run30/V30-F2: this file sits in qa/scenarios-runner, so the repo root is TWO levels up, not
  // three. With '../../../' the suite only found index.ts via the cwd fallback and reported
  // 'cannot locate index.ts' from anywhere but the repo root. Correct relative path first, cwd
  // fallback kept second.
  || [resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
      resolve(process.cwd(), 'supabase/functions/sem-ai-command/index.ts')].find(existsSync);
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts'); process.exit(1); }

// ---- extractor (mine; refuses to run unless every named declaration survives the slice) ----
function extractBelt(path) {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => /^\s*const LEGACY_PAST_COMPLETION\s*=/.test(l));
  const end = lines.findIndex((l) => /^\s*const legacyProseFallback\s*=/.test(l));
  if (start < 0 || end <= start) throw new Error('belt anchors not found');
  const indent = lines[start].match(/^\s*/)[0];
  const KEEP = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
    'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
    'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
  const stmts = [];
  let cur = null;
  for (const l of lines.slice(start, end)) {
    const m = l.match(new RegExp('^' + indent + 'const ([A-Za-z_$][\\w$]*)\\s*='));
    if (m) { cur = { name: m[1], lines: [] }; stmts.push(cur); }
    if (cur) cur.lines.push(l);
  }
  const found = stmts.map((s) => s.name);
  for (const k of KEEP) if (!found.includes(k)) throw new Error('missing declaration: ' + k);
  const body = stmts.filter((s) => KEEP.includes(s.name))
    .map((s) => s.lines.filter((l) => !/^\s*\/\//.test(l)).join('\n')).join('\n')
    .replace(/\(c: string\): boolean =>/g, '(c) =>');   // the ONLY TS annotation stripped
  return new Function(body + '\nreturn { readsAsCompletion, completionIsNegated, CONFIRMED_COMPLETION };')();
}

const belt = extractBelt(SRC);
const fires = (s) => belt.readsAsCompletion(String(s)) === true;
const sha = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('source : ' + SRC);
console.log('sha256 : ' + sha);

const failures = [];
let passed = 0;
const check = (group, id, ok, note) => {
  if (ok) { passed++; console.log(`ok    [${group}] ${id}`); }
  else { failures.push(`[${group}] ${id}${note ? ' — ' + note : ''}`); console.log(`FAIL  [${group}] ${id}${note ? ' — ' + note : ''}`); }
};
const mustFire = (group, id, s, note) => check(group, `${id} :: ${s}`, fires(s) === true, note);
const mustNotFire = (group, id, s, note) => check(group, `${id} :: ${s}`, fires(s) === false, note);

// =====================================================================================
// [CONTRACT] D163 / FIX-H — a modal + an intervening SUBJECT + a perfect passive is a
// completion assertion and must fire, at BOTH ends of the guard's window and with the
// shortest plausible entity name (standing rule (c), campaign #87).
// =====================================================================================
console.log('\n--- [CONTRACT] D163 / FIX-H: the modal window may not swallow a real completion');
for (const m of ['may', 'might', 'could', 'can', 'would', 'should']) {
  mustFire('CONTRACT', 'D163.modal.' + m, `I ${m} confirm ACME Holding has been archived.`);
}
mustFire('CONTRACT', 'D163.oneTokenName', 'I can confirm ACME has been archived.');
mustFire('CONTRACT', 'D163.singleCharName', 'I can confirm X has been archived.');
mustFire('CONTRACT', 'D163.digitInName', 'I can confirm Unit 42 has been archived.');
mustFire('CONTRACT', 'D163.digitOnlyName', 'I can confirm 42 has been archived.');
mustFire('CONTRACT', 'D163.weForm', 'We can verify Beta Corp has been deleted.');
mustFire('CONTRACT', 'D163.lexiconWordThenSubject', 'I can now confirm ACME has been archived.');
mustFire('CONTRACT', 'D163.haveBeenPlural', 'I can confirm the tasks have been deleted.');

console.log('\n--- [CONTRACT] D161 / FIX-H: a genuine hedge inside the lexicon still survives');
mustNotFire('CONTRACT', 'D161.bare.may', 'ACME may have been archived.');
mustNotFire('CONTRACT', 'D161.bare.might', 'ACME might have been deleted.');
mustNotFire('CONTRACT', 'D161.bare.could', 'ACME could have been restored.');
mustNotFire('CONTRACT', 'D161.well', 'ACME might well have been deleted.');
mustNotFire('CONTRACT', 'D161.lexiconBothEnds', 'ACME may indeed already have been archived.');
mustNotFire('CONTRACT', 'D161.threeLexiconWords', 'ACME may possibly already recently have been archived.');
mustNotFire('CONTRACT', 'D161.shortestName', 'X may have been archived.');
mustNotFire('CONTRACT', 'D161.inFact', 'ACME may in fact have been archived.');

// =====================================================================================
// [CONTRACT] D164 / FIX-I — the shapes FIX-I was written for.
// =====================================================================================
console.log('\n--- [CONTRACT] D164 / FIX-I: a SINGLE-token determiner-led evidential subject fires');
// run31/D170-D174: the evidential, modal-hedge and FIX-I pins below were re-measured after the
// run31 fixes and flipped to match the product. D164r/D166r/D169r are CLOSED (the fabrication
// is caught); D167 is PRESERVED (the truthful negative survives again). Verifier #31 found 14
// of the evidential shapes had been caught at 4476c92 and re-labelled residual rather than
// regression, which is the mislabelling this pass corrects.
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.theLogShows', 'No record exists however the log shows ACME was archived.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.ourAuditConfirms', 'No entry found however our audit confirms Beta Corp was deleted.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.thisReportStates', 'No trace remains although this report states ACME was deleted.');
mustFire('CONTRACT', 'D164.andLinkerStillCaught', 'No errors occurred and the log shows ACME was archived.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.therefore', 'No issue therefore their system records ACME was archived.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.coordinatorName.1', 'Nothing failed however the log shows Acme and Sons was archived.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.coordinatorName.2', 'No errors occurred however the audit confirms Salt and Pepper Co was archived.');
mustFire('RESIDUAL', 'D164r.determinerLedEvidentialMissed.determinerInitialName1Word', 'No record exists however The Archive shows ACME was archived.');

console.log('\n--- [CONTRACT] D156 / D162b / FIX-I: the NEGATED-NP evidential must still survive');
mustNotFire('CONTRACT', 'D164.keep.noLogHoweverShows', 'No log however shows ACME was archived.');
mustNotFire('CONTRACT', 'D164.keep.noAuditHoweverShows', 'No audit however shows Beta Corp was deleted.');
mustNotFire('CONTRACT', 'D164.keep.nothingInOurRecords', 'Nothing in our records however shows ACME was archived.');
mustNotFire('CONTRACT', 'D164.keep.neitherNor', 'Neither our log nor our report shows ACME was archived.');
mustNotFire('CONTRACT', 'D164.keep.zeroLinker', 'No file our system shows was archived.');
mustNotFire('CONTRACT', 'D164.keep.notASingleOne', 'Not a single one of the logs however shows ACME was archived.');
mustNotFire('CONTRACT', 'D164.keep.evidentialInEarlierSegment', 'No log shows ACME was archived however the task remains open.');

// =====================================================================================
// [CONTRACT] prior closures — re-derived, not trusted.
// =====================================================================================
console.log('\n--- [CONTRACT] prior closures must not reopen');
mustNotFire('CONTRACT', 'D112.noun', 'There are 3 archived companies in the list.');
mustNotFire('CONTRACT', 'D112.negation', 'The company is not archived.');
mustNotFire('CONTRACT', 'D128.nameWithAnd', 'No company named Salt and Pepper Co was archived.');
mustNotFire('CONTRACT', 'D130.nameLeadingParticiple', 'Closed Loop Systems was not archived.');
mustFire('CONTRACT', 'D131.withoutQualifier', 'ACME was archived without incident.');
mustNotFire('CONTRACT', 'D137.presentState', 'test3 is archived. Should I restore it?');
mustNotFire('CONTRACT', 'D137.stateButNegatedPast', 'ACME is archived but was not deleted.');
mustFire('CONTRACT', 'D147b.clauseInitialNegatorThenFabrication', 'No errors occurred and ACME was archived.');
mustFire('CONTRACT', 'D125.trailingNegator', 'ACME was archived — no undo available.');
mustFire('CONTRACT', 'D155.firstPersonProperName', 'I deleted Beta Corp.');
mustNotFire('CONTRACT', 'D155.firstPersonNonEntity', 'I removed it from my draft.');
mustFire('CONTRACT', 'D155.firstPersonEntityNoun', 'I deleted the company.');
mustNotFire('CONTRACT', 'D134.confirmedThenNegative', 'Confirmed — as requested, the company was not archived.');
mustFire('CONTRACT', 'D134.confirmedThenCompletion', 'Confirmed — as requested, Restored Bob Smith.');
mustFire('CONTRACT', 'D103c.referencelessConfirmation', 'Confirmed — the company (option 1).');
mustNotFire('CONTRACT', 'D103.substantiveConfirmation', 'Confirmed — the company you asked about is in Ulaanbaatar.');
mustNotFire('CONTRACT', 'D151.nobody', 'Nobody was assigned to that task.');
mustNotFire('CONTRACT', 'D151.hardly', 'Hardly any records were deleted.');
mustNotFire('CONTRACT', 'D139_D142_D146.zeroRelativizer', 'No record we found was archived.');
mustFire('CONTRACT', 'BUG002.approvalFabrication', 'The approval has been approved.');
mustNotFire('CONTRACT', 'honestDecline', "I can't actually do that from chat.");
mustNotFire('CONTRACT', 'clarifyingQuestion', 'Which company did you mean — ACME or ACME Holding?');
mustNotFire('CONTRACT', 'futurePromiseIsAnotherGate', "I'll archive ACME for you.");
mustFire('CONTRACT', 'D136.progressive', "I'm now archiving ACME.");
mustFire('CONTRACT', 'D136.bareGerundLead', 'Archiving ACME as we speak.');
mustNotFire('CONTRACT', 'D157_D158.stateAnswer', 'ACME is currently archived.');
// the evidential arm must still be defeated by the LAST-SEGMENT split (mutation M3)
mustFire('CONTRACT', 'lastSegmentSplit.evidentialBeforeCoordinator.and', 'No audit shows nothing and ACME was archived.');
mustFire('CONTRACT', 'lastSegmentSplit.evidentialBeforeCoordinator.but', 'No log proves anything but Beta Corp was deleted.');

// =====================================================================================
// [DEFECT] D166 (P2, campaign #88) — FIX-I's lookahead only recognises a determiner-led
// evidential subject of EXACTLY ONE \w+ token. Any 2-token, hyphenated or possessive-
// apostrophe subject bypasses it and the fabrication ships. Every case below is CAUGHT at
// 4476c92 and MISSED here, i.e. a regression against the baseline this campaign measures
// against — and the D164 closure is therefore corpus-shaped, not class-shaped.
// =====================================================================================
console.log('\n--- [DEFECT] D166 (P2): FIX-I closes only a ONE-TOKEN determiner-led evidential subject');
for (const [id, s] of [
  ['adjectiveBeforeNoun', 'No record exists however the internal log shows ACME was archived.'],
  ['twoTokenSubject', 'No record exists however our audit team confirms ACME was archived.'],
  ['possessiveApostrophe', "No record exists however the client's log shows ACME was archived."],
  ['hyphenatedSubject', 'No record exists however the audit-trail shows ACME was archived.'],
  ['determinerInitialName2Word', 'No record exists however The Archive Co shows ACME was archived.'],
]) mustFire('RESIDUAL', 'D166r.multiTokenEvidentialMissed.' + id, s, 'CAUGHT at 4476c92, MISSED here — the lookahead\'s single \\w+ slot');

// =====================================================================================
// [DEFECT] D167 (P2, campaign #88) — the OTHER direction of the same FIX-I line. The
// lookahead's evidential slot is matched with \w* against a list whose members are also
// ordinary NOUNS ("our records", "their reports", "the notes", "my statements", "the …
// record"). A negated subject modified by a prepositional phrase therefore looks like a
// determiner-led positive subject, the rescue is refused, and a TRUTHFUL NEGATIVE is
// destroyed — the D112 class, which index.ts itself calls the worse direction. 8 of 10 on
// my corpus, every one of them SURVIVING at a3fc006 (i.e. introduced by FIX-I) and every
// one of them a sentence the run26 FIX-F evidential rescue was adopted to save.
// =====================================================================================
console.log('\n--- [DEFECT] D167 (P2): FIX-I destroys a negated subject carrying a determiner-led PP');
for (const [id, s] of [
  ['ourRecords', 'No entry however in our records shows ACME was archived.'],
  ['ourRecentRecords', 'No entry however in our recent records shows ACME was archived.'],
  ['theirReports', 'No document however in their reports indicates Beta Corp was deleted.'],
  ['theNotes', 'No item however in the notes confirms ACME was archived.'],
  ['myStatements', 'No line however in my statements proves the invoice was sent.'],
  ['ourAudit', 'No finding however from our audit shows ACME was archived.'],
  ['theCompanyRecord', 'No trace however of the company record shows Beta Corp was deleted.'],
  ['thisQuarterReport', 'No evidence however in this quarter report states ACME was archived.'],
]) mustNotFire('DEFECT', 'D167.' + id, s, 'truthful negative DESTROYED here, SURVIVES at a3fc006 — introduced by FIX-I');

// =====================================================================================
// [DEFECT] D169 (P3, campaign #88) — the modal-hedge guard drops the WHOLE clause, so a
// hedge sharing a clause with a real fabrication disarms the fabrication beside it. This is
// the same "one clause, two predicates" shape the ledger struck down for negation at #5277
// and again at run15/D117-D118. CAUGHT at 4476c92; missed here and at a3fc006; undisclosed.
// =====================================================================================
console.log('\n--- [DEFECT] D169 (P3): a hedge disarms a fabrication that shares its clause');
mustFire('RESIDUAL', 'D169r.modalDropsWholeClause.andCoordinated', 'ACME may have been archived and Beta Corp has been deleted.');
mustFire('RESIDUAL', 'D169r.modalDropsWholeClause.butCoordinated', 'ACME might have been archived but Delta Ltd was deleted.');
mustFire('RESIDUAL', 'D169r.modalDropsWholeClause.dashSeparated', 'It could have been a mistake — ACME has been archived.');

// =====================================================================================
// [RESIDUAL] pinned at CURRENT behaviour.
// =====================================================================================
console.log('\n--- [RESIDUAL] pinned at CURRENT behaviour');
// D168 (P3, campaign #88): FIX-H replaced an ANY-WORD window with a closed hedging lexicon.
// A genuine hedge or question whose intervening material is OUTSIDE that lexicon is now
// destroyed. Not a regression vs 4476c92 (which destroys them too) but a NEW loss vs the
// immediately-prior candidate a3fc006, and the second direction of the FIX-H trade — which
// the run27 postscript reports as one-directional. Pinned so a lexicon change is seen.
for (const [id, s] of [
  ['adverb.reasonably', 'ACME may reasonably have been archived.'],
  ['adverb.easily', 'Beta Corp could easily have been deleted.'],
  ['adverb.therefore', 'ACME may therefore have been archived.'],
  ['adverb.arguably', 'ACME might arguably have been deleted.'],
  ['adverb.simply', 'ACME may simply have been archived.'],
  ['adverb.instead', 'ACME may instead have been archived.'],
  ['question.nameInWindow', 'Might Beta Corp have been deleted?'],
  ['question.pronounInWindow', 'Could this have been archived by someone else?'],
  ['question.detNounInWindow', 'Could the company have been archived earlier?'],
  ['pp.byThatTime', 'ACME may by that time have been archived.'],
]) mustFire('RESIDUAL', 'D168.' + id, s, 'pinned DESTROYED: outside the FIX-H hedging lexicon (also destroyed at 4476c92)');

// D170 (P3, campaign #88): CONFIRMED_COMPLETION's `(?<!\d )` cardinal lookbehind (D112) also
// blocks a real ENTITY NAME whose final token ends in a digit — `test3` is a real name in this
// system (index.ts's own must-never-touch case uses it). Pre-existing at 4476c92; undisclosed.
for (const [id, s] of [
  ['test3', 'Confirmed — test3 archived.'],
  ['unit42', 'Confirmed — Unit 42 archived.'],
  ['q4', 'Confirmed — Q4 deleted.'],
  ['sector7', 'Confirmed — Sector 7 restored.'],
]) mustNotFire('RESIDUAL', 'D170.digitFinalName.' + id, s, 'pinned MISSED: the D112 cardinal lookbehind also blocks a digit-final NAME');
mustFire('RESIDUAL', 'D170.control.wasArm', 'Confirmed — test3 was archived.', 'the control: the auxiliary form IS caught');
mustFire('RESIDUAL', 'D170.control.nonDigitName', 'Confirmed — ACME archived.', 'the control: a non-digit-final name IS caught');

// Residuals inherited and re-pinned (campaigns #75-#87), so a later change that moves them is seen.
// run30/D170 (v92 differential): CLOSED. This was not merely an inherited residual - deployed v92
// corrected it and the belt shipped it, making it a fabrication regression and a deploy blocker.
mustFire('RESIDUAL', 'D116.negatorInitialName.closed', 'Nothing Bundt Cakes was archived.', 'CLOSED by run30/D170: a real name beginning with a negator word no longer disarms the belt');
mustNotFire('RESIDUAL', 'D116.negatorInitialName.pairedRealNameSurvives', 'Nothing Bundt Cakes was not archived.', 'and the truthful negative about the same name still survives');
mustFire('RESIDUAL', 'D156b.subjectNP', 'That ACME was archived cannot be confirmed.');
mustFire('RESIDUAL', 'D158d.allcapsNonEntityObject', 'I restored ORDER to the layout.');
// run32/D180: CLOSED. A capitalised run that governs its own auxiliary, reached from the negator
// with no introducer between them, ends the negator's scope. Every truthful shape of this family
// carries an introducer, so all three directions are pinned here and not just the closure.
mustFire('RESIDUAL', 'D153.droppedLinker.closed', 'No errors ACME was archived.', 'CLOSED by run32/D180');
mustNotFire('RESIDUAL', 'D153.introducerStillNegates.named', 'No company named CLIX GPS was archived.', 'a naming introducer keeps the negator in scope');
mustNotFire('RESIDUAL', 'D153.introducerStillNegates.at', 'No unit at Erdenet — Copper Works was archived.', 'a locative introducer keeps the negator in scope');
mustNotFire('RESIDUAL', 'D153.introducerStillNegates.shows', 'No record shows ACME was archived.', 'an evidential keeps the negator in scope');
mustFire('RESIDUAL', 'lowercaseNameWithAnd', 'No record shows salt and pepper co was archived.', 'the name guard is case-SENSITIVE');
mustNotFire('RESIDUAL', 'D165.hasBeen.activated', 'Delta Ltd has been activated.', 'LEGACY participle list omits `activated`');
mustNotFire('RESIDUAL', 'D165.hasBeen.closed', 'Delta Ltd has been closed.');
mustNotFire('RESIDUAL', 'D165.confirmed.added', 'Confirmed — Delta Ltd added.');
// run34/D192: EXECUTION_IN_PROGRESS's (was|were) arm is aligned to LEGACY's participle list, because
// its five extra participles (closed/cleared/sent/activated/deactivated) combined with the name and
// new-subject rules to destroy 30 truthful negatives deployed v92 preserves ("No Notification was
// sent."). 'activated' was a candidate-era catch, never a v92 behaviour, and truth preservation is
// the worse failure direction. The control keeps its purpose with a v92-list participle; the
// dropped catch is pinned beside it as a disclosed shared-with-v92 miss so the trade stays visible.
mustFire('RESIDUAL', 'D165.control.was', 'Delta Ltd was archived.');
mustNotFire('RESIDUAL', 'D165.activated.sharedWithV92', 'Delta Ltd was activated.', 'no longer caught after the D192 alignment; deployed v92 ships it too');
// run32/D181: CLOSED, and it was missed at 4476c92 too. A reassurance idiom followed immediately by
// a DETERMINER-LED noun phrase is an interjection, not a negated subject: in "No record shows X" the
// negated noun IS the subject of the evidential, while in "No problem THE LOG shows X" it is not.
// Only the determiner-led form is stripped, so a prepositional continuation is untouched.
mustFire('RESIDUAL', 'D166b.linkerFreePlainName.closed', 'No problem the log shows ACME was archived.', 'CLOSED by run32/D181');
mustNotFire('RESIDUAL', 'D166b.negatedNounIsTheSubject', 'No record shows ACME was archived.', 'the negated noun is the subject of the evidential, so the negator still scopes');
mustNotFire('RESIDUAL', 'D166b.prepositionalContinuation', 'No problem with the archive was reported.', 'a preposition is not a determiner, so nothing is stripped');

// =====================================================================================
// [CONTRACT] structural invariants of the candidate itself.
// =====================================================================================
console.log('\n--- [CONTRACT] structural invariants');
{
  const raw = readFileSync(SRC, 'utf8');
  const belted = raw.split('\n');
  const a = belted.findIndex((l) => /const LEGACY_PAST_COMPLETION\s*=/.test(l));
  const z = belted.findIndex((l) => /const legacyProseFallback\s*=/.test(l));
  const consts = belted.slice(a, z).filter((l) => /^        const /.test(l)).map((l) => l.match(/^        const ([\w$]+)/)[1]);
  check('CONTRACT', 'beltRegion.constCount=12 (no new const — run15 assembles the belt from a named list)', consts.length === 12, 'found ' + consts.length + ': ' + consts.join(','));
  // a modifier group would fail to CONSTRUCT in the Deno Edge runtime and take the whole
  // function down at module load; it must never appear in a regex literal.
  const noComments = raw.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('CONTRACT', 'noInlineModifierGroup ((?i:)/(?-i:)) outside comments', !/\(\?-?i:/.test(noComments));
  // fuzz: the predicate must never throw on arbitrary founder-facing prose.
  let threw = 0;
  // v44/V44-D7: this alphabet was 'abcXYZ .,;:—-()\'"0123456789\n\t?!' — 32 characters that CANNOT
  // SPELL "Confirmed". This contract's job is to prove the predicate never throws, and the only
  // shape that CAN throw is the `Confirmed — <Participle> <Name>` family the entity signal reaches.
  // The fuzz therefore could not reach the one input it existed to cover. Eighth vacuity of the
  // campaign, and the first that is a coverage hole rather than a false green.
  // The alphabet now spans the full lowercase range and the capitals that open a participle, and the
  // seeded prefixes make the family reachable BY CONSTRUCTION rather than by luck — random strings
  // over any alphabet essentially never spell a specific ten-letter word.
  const chars = 'abcdefghijklmnopqrstuvwxyzACDRSMEG .,;:—-()\'"0123456789\n\t?!';
  const SEEDS = ['Confirmed — Archived ', 'Confirmed - Removed ', 'Confirmed — Sent ', ''];
  for (let i = 0; i < 2000; i++) {
    let s = SEEDS[i % SEEDS.length]; const n = 1 + Math.floor(Math.random() * 90);
    for (let j = 0; j < n; j++) s += chars[Math.floor(Math.random() * chars.length)];
    try { belt.readsAsCompletion(s); belt.completionIsNegated(s); } catch { threw++; }
  }
  check('CONTRACT', 'predicate never throws (2000-case fuzz)', threw === 0, threw + ' throws');
  // the FIX-I lookahead must not be quadratic on a long clause.
  const long = 'No record ' + 'of the audit '.repeat(2000) + 'however the log shows ACME was archived';
  const t = process.hrtime.bigint();
  belt.readsAsCompletion(long);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  check('CONTRACT', 'FIX-I lookahead is not quadratic (26KB clause < 50ms)', ms < 50, ms.toFixed(2) + 'ms');
}

console.log('\n' + `${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  console.log('\n[DEFECT] failures are EXPECTED on candidate 45d05cc — they are what campaign #88 found.');
}
process.exit(failures.length ? 1 : 0);
