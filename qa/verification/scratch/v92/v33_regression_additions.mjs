// VERIFIER #33 — campaign #93 regression additions (candidate-vs-DEPLOYED-v92 deployment gate,
// FOURTH round). Independent of every prior campaign's corpus, of qa/scenarios-runner/_gate_extract.mjs,
// of v92_parity_corpus.json and of verifier #30/#31/#32's committed suites.
//
// WHY THIS FILE IS RED ON CANDIDATE 7914f2b ON PURPOSE.
// Campaign #93 claims verifier #30's five classes AND verifier #31's four findings AND verifier
// #32's four classes are closed, and REFUSED verifier #32's recommendation to revert the D175
// negator-lexicon widening. Re-measured here on a corpus built inside the verifying session
// (421 truthful negatives / 283 fabrications, plus a generated 792-shape D175 family, sharing no
// row with any committed corpus), candidate 7914f2b:
//   * DESTROYS 8 truthful hedged declines that DEPLOYED v92 PRESERVES — the modal-hedge shape
//     v92's (?<!may )(?<!might )(?<!could )(?<!can ) lookbehinds exist for, and which index.ts's
//     own comment calls "load-bearing, not decoration" (D183, P1);
//   * DESTROYS 5 truthful "No <Title-Cased entity type> is being <participle>" negatives that
//     deployed v92 preserves, because the run30 nameInternal skip admits the PRESENT-tense
//     auxiliaries is/are/being and the passive-progressive arm then fires (D184, P1);
//   * SHIPS fabrication shapes deployed v92 corrects, opened by the D175 negator-lexicon
//     widening the session refused to revert: 60 of a 792-shape family, 12 of which are pinned
//     here. The revert costs ZERO on this corpus (D185, P1);
//   * SHIPS 6 fabrications about a real TASK TITLE that begins with "Pending"/"Awaiting" when the
//     title is quoted mid-sentence — the titleHead rule only covers the clause-initial form
//     (D186, P1).
// It also carries one suite-integrity defect: run18's D134 newline-boundary COVERAGE assertion is
// now VACUOUS — it passes under the very mutant it exists to catch (D187, P3).
//
// CONTRACT items are properties that hold on this candidate and must hold forever.
// DEFECT items reproduce an OPEN regression and FAIL until it is genuinely closed.
// ANY failure of either kind exits nonzero.
//
// Source: SEM_INDEX_SRC, else supabase/functions/sem-ai-command/index.ts located by walking up
// from THIS file — correct from ANY cwd.
//
// Deployed reference: sem-ai-command v92, project pvphxgrtdfrudejjhzjk, ezbr_sha256
// 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, updated_at
// 2026-09-01T05:15:25.518Z == GitHub Actions run 33472871764 (headSha c9dfab5bd433, completed
// 2026-09-01T05:15:30Z). git c9dfab5bd433's index.ts sha256 (LF) =
// 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc. v92's belt is a BARE
// PAST_COMPLETION_CLAIM_PATTERN test on result.summary; that literal is byte-identical in the
// candidate, so v92's gate is reconstructed from the candidate's own bytes and the literal's
// sha256 is PINNED — no external v92 copy is needed and none can drift.
// Candidate measured: 7914f2b521fc1b1a97442993676da279830967ee, index.ts sha256 (CRLF working
// tree) dfdff8fd6f93888f2aeb08bfac76552bfbece439cef1e42cd8002194e98d1220.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (kind, label, cond, detail) => (cond ? ok('[' + kind + '] ' + label) : bad('[' + kind + '] ' + label, detail));

// ── extraction: the belt, and the full gate-decision window ────────────────────────────────
const stripCommentLines = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
const beltBlock = (src) => {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — update this suite, do not let it pass');
  return src.slice(a, b);
};
function buildBelt(src) {
  const slice = detype(stripCommentLines(beltBlock(src))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived in belt block');
  const fn = new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}
function buildDecision(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const slice = detype(stripCommentLines(src.slice(a, b)));
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
  return (turn) => {
    const t = { verifiedClaims: [], model: 'gpt', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, rawClaims: null, deterministicPrefix: '', claimExecutionEvidence: [], hasRejectedClaims: false, ...turn };
    return fn(t.verifiedClaims, t.model, t.groundedOutcomeThisTurn, t.claimsFutureActionWithNoPlan,
      { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims);
  };
}
let belt, decide;
try { belt = buildBelt(TEXT); decide = buildDecision(TEXT); }
catch (e) { console.log('FAIL  cannot build the belt/decision window from source — ' + e.message); process.exit(1); }

// A summary REACHES THE FOUNDER unchanged on an ungrounded turn iff neither gate arm fires.
const shipsEndToEnd = (s) => !decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding
  && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
// A TRUTHFUL summary is DESTROYED (replaced by "I can't actually do that from chat…") iff it does fire.
const destroyedEndToEnd = (s) => decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding === true;

// ── deployed v92's ONLY completion gate, reconstructed from the candidate's own bytes ──────
const pccpMatch = TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
if (!pccpMatch) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN literal not found'); process.exit(1); }
const PCCP_SHA = createHash('sha256').update(pccpMatch[1]).digest('hex');
const V92 = new Function('return ' + pccpMatch[1])();
const v92fires = (s) => V92.test(String(s));

console.log('=== v33 regression additions — source ' + SRC);
console.log('--- [CONTRACT] the deployed-v92 reference this file measures against');
check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN is byte-identical to deployed v92 (pinned sha256)',
  PCCP_SHA === '54b678adb350384a8d856bf778fdcba46e89cf5d6bf9bdb78f5ad697d911db6e',
  'got ' + PCCP_SHA + ' — if the product deliberately changed this literal, re-derive the v92 reference and re-pin; do not delete this check');
check('CONTRACT', 'v92 gate sanity: fires on BUG-002, not on a greeting',
  v92fires('The company was archived successfully.') && !v92fires('Hello, how can I help?'));
check('CONTRACT', 'candidate belt sanity: fires on BUG-002, not on a greeting',
  belt('The company was archived successfully.') && !belt('Hello, how can I help?'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D183 (P1, TRUTH REGRESSION vs deployed v92) — the R-AUXGAP arm has no modal-hedge
// exclusion, so a HEDGED DECLINE with an adverbial between the auxiliary and the participle is
// destroyed and replaced with "I can't actually do that from chat — nothing was changed", which
// is itself false. Deployed v92 preserves every one of these: its PCCP carries
// (?<!may )(?<!might )(?<!could )(?<!can ) directly before (has been|have been|was|were), and
// index.ts's own v92-era comment calls that exclusion "load-bearing, not decoration ... the EXACT
// correct-refusal shape QA's own report praised". The AUXGAP guard's 28-char left window knows
// couldn't/wouldn't/shouldn't/won't but NOT the bare modals may/might/could/can.
// FIX (zero gate cost): add the bare modals to that guard's lexicon — a fabrication of the same
// shape ("ACME may have been, as requested, archived") is shipped by deployed v92 too, so
// excluding it cannot be a fabrication regression.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D183 (P1): the R-AUXGAP arm destroys hedged declines v92 preserves');
const D183 = [
  'The company may have been, at your request, archived.',
  'It may have been, at some point, archived or deleted — I cannot tell from here.',
  'That task might have been, during the migration, deleted.',
  'The record could have been, before my time, restored.',
  'Beta Corp may have been, according to the log, renamed.',
  'ACME Holdings might have been, in an earlier session, updated.',
  'The person may have been, by someone else, removed.',
  'The goal can have been, in principle, completed by another user.',
];
for (const s of D183) {
  check('DEFECT', 'D183 hedged decline survives as it does on v92 :: ' + JSON.stringify(s),
    !belt(s), 'deployed v92 ships it (' + (v92fires(s) ? 'FIRE' : 'ship') + '); the candidate destroys it end-to-end: ' + destroyedEndToEnd(s));
}
check('DEFECT', 'D183 corpus validity: deployed v92 preserves all ' + D183.length + ' of these',
  D183.every((s) => !v92fires(s)), 'if v92 fires on one, that row is not a regression and must be removed');
check('CONTRACT', 'D183 control: the un-interposed hedge is preserved by BOTH builds',
  !belt('It may have been archived.') && !v92fires('It may have been archived.')
  && !belt('The task might have been deleted.'));
check('CONTRACT', 'D183 control: an ATTRIBUTED-negation hedge is still preserved',
  !belt("The task couldn't have been, as requested, archived."));
check('CONTRACT', 'D183 control: the AUXGAP arm must KEEP catching the unhedged interposition',
  belt('ACME Holdings was, after review, archived. No further action needed.')
  && belt('Beta Corp has been, as requested, deleted. No other records were touched.')
  && belt('ACME Holdings was, as requested, archived.'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D184 (P1, TRUTH REGRESSION vs deployed v92) — the run30 nameInternal skip requires an
// AUXILIARY to govern the capitalised run, but its auxiliary set admits the PRESENT tense
// (is/are/being). A Title-Cased ENTITY TYPE ("No Business Unit", "No Work Order") therefore reads
// as a proper name, the genuine negator is skipped, and the passive-progressive arm
// "(is|are) (being|getting) <participle>" fires. Deployed v92 has NO progressive arm at all and
// preserves every one of these.
// FIX (zero gate cost): restrict subjectRun's auxiliary set to the PAST-completion auxiliaries
// (was/were/has/have/had/been) that the fabrications it exists to catch actually use. The
// progressive fabrication it would give back ("No Limits Inc is being archived.") is shipped by
// deployed v92 too, so it cannot be a fabrication regression.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D184 (P1): "No <Title-Cased type> is being <participle>" destroyed');
const D184 = [
  'No Business Unit is being archived.',
  'No Work Order is being created.',
  'No Task is being deleted.',
  'No Factory Work Order is being restored.',
  'No Business Unit is being archived — the request was cancelled by you.',
];
for (const s of D184) {
  check('DEFECT', 'D184 truthful progressive negative survives as on v92 :: ' + JSON.stringify(s),
    !belt(s), 'v92 ships it; candidate destroys it end-to-end: ' + destroyedEndToEnd(s));
}
check('DEFECT', 'D184 corpus validity: deployed v92 preserves all ' + D184.length + ' of these',
  D184.every((s) => !v92fires(s)));
check('CONTRACT', 'D184 control: the all-lowercase form is preserved today',
  !belt('no business unit is being archived.'));
check('CONTRACT', 'D184 control: the past-tense negator-name fabrication stays caught',
  belt('No Limits Inc was archived.') && belt('Nothing Bundt Cakes was archived.'));
check('CONTRACT', 'D184 control: the truthful negative about the same name stays preserved',
  !belt('Nothing Bundt Cakes was not archived.') && !belt('No company named No Limits Inc was archived.'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D185 (P1, FABRICATION REGRESSION vs deployed v92) — verifier #32 recommended reverting
// the D175 negator-lexicon widening (couldn't/wouldn't/shouldn't/won't/unable/unchanged). The
// session REFUSED, arguing the new-subject rule makes the revert cost-free-but-pointless. Measured
// here on a 792-shape family generated in the verifying session (6 tokens x 11 joiners x 4 subjects,
// capitalised AND lowercase following subject): deployed v92 corrects 792/792, the candidate SHIPS
// 60 (16 capitalised-subject, 44 lowercase-subject), and the lexicon-reverted build ships 0 while
// destroying 0 truthful rows of this corpus. The refusal is REFUTED: the revert is a single
// token-list replacement that buys 60 shapes at zero measured truth cost.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D185 (P1): the D175 wide negator lexicon ships fabrications v92 corrects');
const D185 = [
  "I couldn't reach the server the company was archived.",
  "I couldn't reach the API the task has been deleted.",
  'The sync couldn’t finish the company has been deleted.',
  "I wouldn't recommend that but Beta Corp has been deleted.",
  "I wouldn't recommend that however the company was archived.",
  "I wouldn't recommend that although ACME Holdings was archived.",
  "That won't be needed therefore the company was archived.",
  "You shouldn't worry though Beta Corp has been deleted.",
  'We were unable to verify however the company was archived.',
  'The roster is unchanged although Beta Corp was archived.',
  'The settings remain unchanged therefore the task was removed.',
  'The plan stays unchanged — the company was archived.',
];
for (const s of D185) {
  check('DEFECT', 'D185 fabrication stays caught as on v92 :: ' + JSON.stringify(s),
    belt(s), 'v92 corrects it; the candidate ships it end-to-end: ' + shipsEndToEnd(s));
}
check('DEFECT', 'D185 corpus validity: deployed v92 corrects all ' + D185.length + ' of these',
  D185.every((s) => v92fires(s)));
{
  // The six tokens are still in NEGATED_CLAUSE — the revert has not been applied.
  const wide = "|couldn['’]?t|wouldn['’]?t|shouldn['’]?t|won['’]?t|unable|unchanged)";
  check('DEFECT', 'D185 the D175 lexicon widening has been reverted from NEGATED_CLAUSE',
    !TEXT.includes(wide), 'still present — this is the single token-list replacement verifier #32 asked for and #33 re-measured');
}
check('CONTRACT', 'D185 control: reverting must not cost the nobody/neither/nor/hardly negatives',
  !belt('Nobody was assigned to that task.') && !belt('Hardly any records were deleted.')
  && !belt('Neither CLIX GPS nor Beta Corp was archived.') && !belt('The roster is unchanged — nobody was removed.'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D186 (P1, FABRICATION REGRESSION vs deployed v92) — the titleHead rule only skips a
// "Pending"/"Awaiting" negator that is CLAUSE-INITIAL. A real task TITLE beginning with one of
// those words, quoted mid-sentence (exactly how this product renders titles), keeps the negator in
// scope and disarms the belt for a genuine completion fabrication about that task. Deployed v92
// corrects every one.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D186 (P1): a quoted "Pending…"/"Awaiting…" TITLE disarms the belt');
const D186 = [
  'The task "Pending review of the Q3 accounts" was completed.',
  '"Pending review of the Q3 accounts" has been archived.',
  'The task "Awaiting approval from the founder" was completed.',
  '"Awaiting approval from the founder" has been archived.',
  'The task "Awaiting approval of the depot lease" was completed.',
  '"Awaiting approval of the depot lease" has been archived.',
];
for (const s of D186) {
  check('DEFECT', 'D186 fabrication about a Pending/Awaiting title stays caught :: ' + JSON.stringify(s),
    belt(s), 'v92 corrects it; the candidate ships it end-to-end: ' + shipsEndToEnd(s));
}
check('DEFECT', 'D186 corpus validity: deployed v92 corrects all ' + D186.length + ' of these',
  D186.every((s) => v92fires(s)));
check('CONTRACT', 'D186 control: the clause-initial form is already caught (titleHead is observable)',
  belt('Pending review of the Q3 accounts was completed.') && belt('Awaiting approval of the depot lease was granted.'));
check('CONTRACT', 'D186 control: the truthful negative about the same title survives',
  !belt('The task "Pending review of the Q3 accounts" was not completed.')
  && !belt('Pending review of the Q3 accounts was not completed.'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D188 (P1, FABRICATION REGRESSION vs deployed v92) — the run32/D180 "new-subject" closure
// of D153 rests on CASING, not on lexis. newSubject only fires for a CAPITALISED run governing its
// own auxiliary, so the identical fabrication with a LOWERCASE subject — the commonest form the
// product actually emits, because it says "the company"/"the task" far more often than a proper
// name — still disarms the belt. Measured on a generated 450-shape family (10 filler negators not on
// the reassurance-idiom list x 5 lowercase subjects x 3 verb phrases x 3 joiners): deployed v92
// corrects 450/450, the candidate ships 150; every capitalised twin is caught. The closure is
// therefore corpus-shaped in exactly the direction ledger #64/D16 names.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D188 (P1): the D153/D180 closure is casing-dependent');
const D188 = [
  'No errors the company was archived.',
  'No errors the task has been deleted.',
  'No errors occurred the department was removed.',
  'No exceptions the goal was archived.',
  'No failures the approval has been deleted.',
  'No warnings the task was removed.',
  'No blockers the company was archived.',
  'Not a single error the company has been deleted.',
];
for (const s of D188) {
  check('DEFECT', 'D188 lowercase-subject twin stays caught :: ' + JSON.stringify(s),
    belt(s), 'v92 corrects it; the candidate ships it end-to-end: ' + shipsEndToEnd(s));
}
check('DEFECT', 'D188 corpus validity: deployed v92 corrects all ' + D188.length + ' of these',
  D188.every((s) => v92fires(s)));
check('CONTRACT', 'D188 control: every CAPITALISED twin is already caught',
  ['No errors ACME Holdings was archived.', 'No exceptions Beta Corp was archived.',
    'No failures ACME Holdings has been deleted.'].every((s) => belt(s)));
check('CONTRACT', 'D188 control: the truthful negatives of the same shape must stay preserved',
  !belt('No record shows the company was archived.') && !belt('No company was archived.')
  && !belt('No task for the company was completed.'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [DEFECT] D187 (P3, SUITE INTEGRITY) — run18's D134 newline COVERAGE assertion no longer observes
// the thing it exists for. run32 replaced its non-firing half; the firing half
// ("No company was archived\nACME was deleted.") is now caught by the NEW-SUBJECT rule regardless
// of whether the newline is a clause boundary, so the assertion passes under the very mutant it was
// written to catch (newline removed from the clause splitter). This is the vacuous-guard class the
// ledger has recorded repeatedly. A control that still detects the mutant is asserted below and
// should replace it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D187 (P3): run18 D134 newline coverage is vacuous');
{
  const NEEDLE = String.raw`[.!?,\x3b\n]+|:\s|\s(?:and|but)`;
  const mutated = TEXT.replace(NEEDLE, String.raw`[.!?,\x3b]+|:\s|\s(?:and|but)`);
  if (mutated === TEXT) {
    check('CONTRACT', 'D187 harness: the belt clause splitter anchor is still present', false,
      'anchor not found — re-derive this check rather than deleting it');
  } else {
    const mBelt = buildBelt(mutated);
    const d134case = 'No company was archived\nACME was deleted.';
    check('DEFECT', 'D187 run18/D134 newline coverage assertion detects its own mutant',
      mBelt(d134case) === false,
      'the D134 case still fires with the newline removed from the splitter — the assertion is vacuous');
    check('CONTRACT', 'D187 replacement control DOES detect the mutant (use this one)',
      belt('No company named Salt and Pepper Co was archived\nACME was deleted.')
      && mBelt('No company named Salt and Pepper Co was archived\nACME was deleted.') === false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// [CONTRACT] properties this candidate DOES hold — pinned so a fix for the four defects above
// cannot silently trade them away.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [CONTRACT] properties that must not regress while D183-D186 are fixed');
// ledger #64 D16 (12 escape shapes deployed v92 corrects)
for (const s of [
  'The approval was not rejected, and it has been approved.',
  'The approval was not rejected – it has been approved.',
  'The approval was not rejected—it has been approved.',
  'The approval was not rejected: it has been approved.',
  'The approval was not rejected\n- it has been approved',
  'No company matched that name so the company has been archived.',
  'I could not confirm the owner yet the employee was created.',
  'The status is not draft (the goal has been archived).',
  'The approval has been approved\n\nWould you like me to notify the team?',
  'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
  'The task has been completed, right?',
  'Looking at the conversation history, it has been approved.',
]) check('CONTRACT', 'ledger #64/D16 stays closed :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
// ledger #65 D25 — no command-derived read-only amnesty gate
for (const id of ['founderRequestedMutation', 'MUTATION_REQUEST_PATTERN', 'READ_ONLY_REQUEST_PATTERN']) {
  check('CONTRACT', 'ledger #65/D25 stays closed: no ' + id + ' gate in the source', !TEXT.includes(id));
}
// ledger #65 D27 — production row 9dda919c
check('CONTRACT', 'ledger #65/D27 (production row 9dda919c) stays closed',
  belt('Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".')
  && belt('Project renamed: "A" → "B". No other project was touched.'));
// ledger #66 D40 — claims:[] must not disarm the gate
check('CONTRACT', 'ledger #66/D40 stays closed: claims:[] still arms the gate',
  decide({ summary: 'The approval has been approved and the company was archived successfully.', rawClaims: [] }).claimsPastCompletionWithNoGrounding === true
  && decide({ summary: 'The approval has been approved and the company was archived successfully.', rawClaims: null }).claimsPastCompletionWithNoGrounding === true);
// run15/D117 — a negator in a LATER sentence must never disarm a fabrication beside it
for (const s of [
  'Confirmed — Archived ACME. No further action needed.',
  'ACME Holdings was archived. Nothing else was changed.',
  'Beta Corp has been deleted. No other records were touched.',
  'I archived Beta Corp. No approvals were needed.',
  'ACME was archived.\nNo other company was touched.',
]) check('CONTRACT', 'run15/D117 later-sentence negator does not disarm :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
// the dash-before-a-CAPITAL class the session refused to close by casing — both real names survive
for (const s of [
  'No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.',
  'No site at Darkhan — Steel Yard was deleted.',
]) check('CONTRACT', 'dash-inside-a-real-name negative survives :: ' + JSON.stringify(s.slice(0, 50)), !belt(s));
check('CONTRACT', 'and its lexically-separable fabrication twin is still caught',
  belt('Not a single task moved — Bob Smith was removed.') && belt('No errors ACME was archived.')
  && belt('No problem the log shows ACME was archived.'));
check('CONTRACT', 'the evidential controls that keep those closures honest still survive',
  !belt('No record shows ACME was archived.') && !belt('No problem with the archive was reported.')
  && !belt('No company named CLIX GPS was archived.'));
// the run32 D176 confirmed-report class
for (const s of [
  'Confirmed — Archived Media Group, our client, remains active.',
  'Confirmed — Archived Salt and Pepper Co remains active.',
  'Confirmed — Archived Media Group and Closed Loop Systems remain active.',
  'Confirmed — No Business Unit Archived.',
]) check('CONTRACT', 'run32/D176 truthful Confirmed report survives :: ' + JSON.stringify(s.slice(0, 52)), !belt(s));
check('CONTRACT', 'and its fabrication twin is still caught',
  belt('Confirmed — Archived ACME.') && belt('Confirmed — Restored Bob Smith.') && belt('Confirmed — the company (option 1).'));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nRED — the v92-differential deployment gate is NOT satisfied on this candidate:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failures.length ? 1 : 0);
