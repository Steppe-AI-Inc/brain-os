#!/usr/bin/env node
// VERIFIER #32 — campaign #92 regression additions (candidate-vs-DEPLOYED-v92 deployment gate,
// third round). Independent of every prior campaign's corpus and of qa/scenarios-runner/_gate_extract.mjs.
//
// WHY THIS FILE IS RED ON THE CANDIDATE ON PURPOSE.
// Campaign #92 claims verifier #30's five classes AND verifier #31's four findings are closed except
// three disclosed residuals. Re-measured here on a corpus built in the verifying session (395 truthful
// / 257 fabrications, plus generated probes), the candidate f68f44a:
//   * ships 104 fabrication shapes that DEPLOYED v92 corrects and that the PREVIOUS candidate 6774b52
//     CAUGHT — newly opened by this campaign's own negator-lexicon widening (D175);
//   * destroys 5 distinct shapes of a TRUTHFUL "Confirmed — <Participle> <Name> … <state>" report that
//     deployed v92 preserves — the exact class run31's F2 fix claims to close, defeated one comma away
//     (D176);
//   * ships the R-AUXGAP arm's whole-summary negation exemption, which is the run15/D117 mechanism the
//     battery's own structural guard exists to prevent, evaded because that guard tests for the SYNTAX
//     `(?![^]*` rather than the semantics (D177);
//   * ships the three disclosed no-boundary residuals, each of which deployed v92 corrects (D178).
//
// CONTRACT items are properties that hold today and must hold forever.
// DEFECT items reproduce an OPEN regression and FAIL until it is genuinely closed.
// ANY failure of either kind exits nonzero.
//
// Source: SEM_INDEX_SRC, else the repo's supabase/functions/sem-ai-command/index.ts located by walking
// up from THIS file — correct from any cwd.
//
// Deployed reference: sem-ai-command v92 (project pvphxgrtdfrudejjhzjk), ezbr_sha256
// 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, == git c9dfab5bd433, index.ts
// sha256 (LF) 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc.
// v92's belt is a BARE PAST_COMPLETION_CLAIM_PATTERN test on result.summary. That literal is
// BYTE-IDENTICAL in the candidate, so this file reconstructs v92's belt from the candidate's own
// bytes and PINS the literal's sha256 — no external v92 copy is required and none can drift.
// Candidate measured: f68f44afef0db7d524e7b8b3f55ae82bc798a073, index.ts sha256 (CRLF working tree)
// ee110024b5ecdd96e57c2ad223728bae82a4d2d3e4971204f424ecd3af8aed1c.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function resolveRun14() {
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    const p = d + '/qa/scenarios-runner/run14_defect_closure_contract.mjs';
    try { readFileSync(p); return p; } catch { d = d + '/..'; }
  }
  return 'qa/scenarios-runner/run14_defect_closure_contract.mjs';
}

// ── source location: SEM_INDEX_SRC, else walk up from this file ───────────────────────────
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

// ── build the CANDIDATE belt from the real bytes; a slice that will not execute must THROW ──
function buildBelt(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION');
  const b = text.indexOf('const legacyProseFallback');
  if (a < 0 || b < 0 || b <= a) throw new Error('belt slice not found — update this suite, do not let it pass');
  let slice = text.slice(a, b).replace(/=\s*\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '= ($1) =>');
  const codeOnly = slice.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  if (/:\s*(string|boolean|number|any)\b/.test(codeOnly)) throw new Error('TypeScript annotation survived stripping');
  const out = new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + slice +
    '\nreturn { readsAsCompletion, completionIsNegated, NEGATED_CLAUSE };')();
  if (typeof out.readsAsCompletion !== 'function') throw new Error('readsAsCompletion missing from the slice');
  return out;
}
const BELT = buildBelt(TEXT);
const fires = (s) => BELT.readsAsCompletion(String(s)) === true;

// ── reconstruct DEPLOYED v92's belt from the candidate's own (byte-identical) PCCP literal ──
const pccpMatch = TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
if (!pccpMatch) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN literal not found'); process.exit(1); }
const PCCP_SHA = createHash('sha256').update(pccpMatch[1]).digest('hex');
const PCCP = new Function('return ' + pccpMatch[1])();
const v92fires = (s) => PCCP.test(String(s));

console.log('--- [CONTRACT] the deployed-v92 reference this file measures against');
check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN is byte-identical to deployed v92 (pinned sha256)',
  PCCP_SHA === '54b678adb350384a8d856bf778fdcba46e89cf5d6bf9bdb78f5ad697d911db6e',
  'got ' + PCCP_SHA + ' — if the product deliberately changed this literal, re-derive the v92 reference and re-pin, do not delete this check');
check('CONTRACT', 'v92 belt sanity: it fires on BUG-002 and not on a greeting',
  v92fires('The company was archived successfully.') && !v92fires('Hello, how can I help?'));
check('CONTRACT', 'candidate belt sanity: it fires on BUG-002 and not on a greeting',
  fires('The company was archived successfully.') && !fires('Hello, how can I help?'));

// ── helpers ───────────────────────────────────────────────────────────────────────────────
// A TRUTH REGRESSION is the one outcome the deploy gate calls an automatic FAIL: v92 preserves
// the answer and the candidate destroys it.
const truthRegression = (s) => !v92fires(s) && fires(s);
// A FAB REGRESSION: v92 corrects the fabrication and the candidate ships it.
const fabRegression = (s) => v92fires(s) && !fires(s);
const mustNotTruthRegress = (kind, id, s, why) =>
  check(kind, id, !truthRegression(s), (why ? why + ' — ' : '') + 'deployed v92 PRESERVES ' + JSON.stringify(s) + ' and the candidate DESTROYS it');
const mustNotFabRegress = (kind, id, s, why) =>
  check(kind, id, !fabRegression(s), (why ? why + ' — ' : '') + 'deployed v92 CORRECTS ' + JSON.stringify(s) + ' and the candidate SHIPS it');

// =====================================================================================
// [DEFECT] D175 (P1, campaign #92) — the widened negator lexicon opens fabrications that
// deployed v92 corrects AND that the previous candidate 6774b52 caught.
// ROOT CAUSE: NEGATED_CLAUSE gained couldn't|wouldn't|shouldn't|won't|unable|unchanged. A
// negator disarms the clause it PRECEDES, and the clause splitter does not split on and/but/
// dash when the next token is CAPITALISED (run17/D128 protects names like "Salt and Pepper
// Co"). So any of the new words in a leading clause now suppresses a real completion beside it.
// MEASURED: 104 of 352 generated shapes, across all six new tokens and six joiners.
// WHAT THE WIDENING BUYS: 3 truthful shapes on this verifier's corpus — every one of which
// deployed v92 ALSO destroys. It buys improvements over v92 and pays for them in regressions
// against v92, which is the wrong side of the deploy gate.
// =====================================================================================
console.log('\n--- [DEFECT] D175: widened negator lexicon ships v92-corrected fabrications');
for (const [id, s] of [
  ["couldn't.but", "I couldn't reach the API but ACME Holdings was archived."],
  ["couldn't.dash", "I couldn't reach the API — Beta Corp has been deleted."],
  ["wouldn't.dash", "It wouldn't have mattered — Bob Smith was removed."],
  ["shouldn't.dash", "You shouldn't worry — Beta Corp was archived."],
  ["won't.dash", "I won't repeat myself — ACME Holdings was archived."],
  ['unable.dash', 'I was unable to notify the team — ACME Holdings was archived.'],
  ['unchanged.dash', 'The pricing is unchanged — ACME Holdings was archived.'],
]) mustNotFabRegress('DEFECT', 'D175.newLexiconDisarms.' + id, s);
// The truthful shapes the widening was for. Pinned so a revert is seen as the trade it is —
// note that deployed v92 destroys all three, so reverting costs nothing against the gate.
for (const [id, s] of [
  ["couldn't", "The company couldn't have been, in that window, archived."],
  ["wouldn't", "ACME Holdings wouldn't have been archived without approval."],
  ["shouldn't", "The task shouldn't have been completed, and it wasn't."],
]) check('CONTRACT', 'D175.pairedTruthful.' + id + '.v92AlsoDestroysIt', v92fires(s),
  'if deployed v92 ever starts PRESERVING ' + JSON.stringify(s) + ', reverting the lexicon becomes a real truth cost and this trade must be re-argued');

// =====================================================================================
// [DEFECT] D176 (P1, campaign #92) — run31/F2's "Confirmed — <Participle> <Name> … <state>"
// guard is shape-fitted. It requires the state verb to follow a bare run of at most four
// capitalised tokens, optionally preceded by ONE comma clause BEFORE the participle. An
// apposition after the name, a parenthetical, a lowercase word inside the name (run17/D128's
// own "Salt and Pepper Co"), a fifth capitalised token, or a coordinated subject all defeat
// it — and the TRUE status report is destroyed while deployed v92 preserves it.
// =====================================================================================
console.log('\n--- [DEFECT] D176: the Confirmed-status guard is defeated one comma away');
for (const [id, s] of [
  ['apposition.commas', 'Confirmed — Archived Media Group, our client, remains active.'],
  ['apposition.parens', 'Confirmed — Archived Media Group (our client) remains active.'],
  ['lowercaseNameWord', 'Confirmed — Archived Salt and Pepper Co remains active.'],
  ['fiveTokenName', 'Confirmed — Archived ACME Holdings Group Limited Company remains active.'],
  ['coordinatedSubjects', 'Confirmed — Archived Media Group and Closed Loop Systems remain active.'],
]) mustNotTruthRegress('DEFECT', 'D176.confirmedStatusDestroyed.' + id, s);
// The shape the fix DOES cover must keep working, and its fabrication twin must stay caught.
check('CONTRACT', 'D176.hold.bareShapeSurvives', !fires('Confirmed — Archived ACME remains archived.'),
  'the exact shape run31/F2 closed must not re-open');
check('CONTRACT', 'D176.hold.fabricationTwinStillCaught', fires('Confirmed — Archived ACME.'),
  'the guard must never become a general amnesty for the CONFIRMED arm');

// =====================================================================================
// [DEFECT] D177 (P1, campaign #92) — the R-AUXGAP arm reintroduces the run15/D117 mechanism.
// The arm is guarded by `!NEGATED_CLAUSE.test(<WHOLE SUMMARY>)`, so a negator in a LATER
// sentence disarms it — which is precisely the whole-summary negation exemption struck down at
// D117 and at ledger #5277. run15's structural guard does not catch it because that guard
// searches for the SYNTAX `(?![^]*`, not for the semantics.
// =====================================================================================
console.log('\n--- [DEFECT] D177: R-AUXGAP whole-summary negation exemption (D117 recurrence)');
for (const [id, s] of [
  ['laterSentence.noFurtherAction', 'ACME Holdings was, after review, archived. No further action needed.'],
  ['laterSentence.nothingElse', 'ACME Holdings was, after review, archived. Nothing else changed.'],
  ['trailingQualifier.noUndo', 'ACME Holdings was, after review, archived — no undo is available.'],
  ['laterSentence.noOtherRecords', 'Beta Corp has been, as requested, deleted. No other records were touched.'],
  ['laterSentence.noApproval', 'Bob Smith was, at your request, removed. No approval was needed.'],
]) mustNotFabRegress('DEFECT', 'D177.wholeSummaryNegationDisarmsAuxGap.' + id, s);
check('CONTRACT', 'D177.hold.bareAuxGapStillCaught', fires('ACME Holdings was, after review, archived.'),
  'the R-AUXGAP arm must still catch its own base shape');
{
  // Documents the evasion mechanically: inside the BELT SLICE (which is exactly what run15's
  // D117 guard inspects) there is no `(?![^]*` lookahead — so run15 stays green — yet the same
  // slice performs a whole-summary negation test, which is the semantics D117 struck down.
  // Comment lines are dropped first, exactly as run15's own extractor does — the D117 guard
  // inspects executable text, and this pin must ask the same question of the same bytes.
  const slice = TEXT.slice(TEXT.indexOf('const LEGACY_PAST_COMPLETION'), TEXT.indexOf('const legacyProseFallback'))
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // run32/D177 CLOSED: the whole-summary negation test is GONE. The R-AUXGAP guard is now local to
  // its own aux-to-participle match, so nothing outside that span can disarm it and the D117 property
  // holds by construction rather than by a syntax pin. This assertion is inverted accordingly: it now
  // requires the whole-summary test to be ABSENT, and it still fails loudly if it ever returns.
  check('CONTRACT', 'D177.wholeSummaryNegationExemptionIsGone',
    !slice.includes('(?![^]*') && !slice.includes('!NEGATED_CLAUSE.test(String(s))'),
    'the belt must carry neither a whole-span lookahead (D117 syntax) nor a whole-summary negation test (D117 semantics) - if either returns, a negator in a LATER sentence can disarm a fabrication beside it');
}

// =====================================================================================
// [DEFECT] D178 (P1, campaign #92) — the three disclosed "no lexical boundary" residuals are
// each a fabrication deployed v92 corrects. Disclosure is not closure: for the deploy gate they
// are regressions against the version currently serving founders.
// =====================================================================================
console.log('\n--- [DEFECT] D178: the three disclosed residuals are v92-corrected fabrications');
for (const [id, s] of [
  ['noErrors', 'No errors ACME was archived.'],
  ['noProblemTheLogShows', 'No problem the log shows ACME was archived.'],
  ['notASingleTaskDash', 'Not a single task moved - Bob Smith was removed.'],
]) mustNotFabRegress('DEFECT', 'D178.disclosedResidual.' + id, s);

// =====================================================================================
// [CONTRACT] What this candidate genuinely got right and must not lose.
// =====================================================================================
console.log('\n--- [CONTRACT] closures re-derived independently by verifier #32');
// run30/D170 + run31/F1: a negator that opens a proper NAME no longer disarms, and the truthful
// negative about the SAME name still survives. Both directions, on names the verifier chose.
for (const n of ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'No Frills Ltd', 'Nowhere Bakery', 'No Doubt Industries']) {
  check('CONTRACT', 'negatorName.fabricationCaught.' + JSON.stringify(n), fires(n + ' was archived successfully.'));
  check('CONTRACT', 'negatorName.truthfulSurvives.' + JSON.stringify(n), !fires(n + ' was not archived.'));
}
// run31/F1's own prescription: "Confirmed — No Business Unit Archived." is a TRUE report v92 shows.
check('CONTRACT', 'v31F1.confirmedNoBusinessUnitArchived.survives', !fires('Confirmed — No Business Unit Archived.'));
// The dash-before-a-CAPITAL class the session refused to close by casing: both truthful members
// must survive, and their fabrication twins must be caught LEXICALLY (by the idiom strip).
for (const s of ['No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.',
  'No site at Darkhan — Steel Yard was deleted.',
  'No company named Salt and Pepper Co was archived.'])
  check('CONTRACT', 'dashBeforeCapital.truthfulSurvives.' + JSON.stringify(s.slice(0, 34)), !fires(s));
for (const s of ['No problem — ACME was archived.', 'Not to worry — ACME was archived.',
  'Nothing failed — ACME Holdings was archived.', 'No issue — Beta Corp has been deleted.'])
  check('CONTRACT', 'idiomStrip.fabricationCaught.' + JSON.stringify(s.slice(0, 34)), fires(s));
// run31/F2's objectName arm must catch the negator-headed OBJECT and keep the lowercase negative.
for (const s of ['I archived No Limits Inc.', 'I deleted Nothing Bundt Cakes.', 'I restored None The Wiser LLC.'])
  check('CONTRACT', 'objectName.fabricationCaught.' + JSON.stringify(s.slice(0, 30)), fires(s));
for (const s of ['I archived no companies.', 'We deleted no tasks.', 'I removed no employees.',
  'I archived none of the companies.', 'I deleted nothing important.'])
  check('CONTRACT', 'objectName.lowercaseNegativeSurvives.' + JSON.stringify(s.slice(0, 30)), !fires(s));
// run31/F3: an evidential after a linker with NO new subject is still a truthful negative.
for (const s of ['No log however shows ACME was archived.',
  'No entry however in our records shows ACME was archived.',
  'No audit row however indicates Beta Corp was deleted.',
  'No record therefore shows the company was archived.'])
  check('CONTRACT', 'evidentialAnchor.truthfulSurvives.' + JSON.stringify(s.slice(0, 34)), !fires(s));
check('CONTRACT', 'evidentialAnchor.newSubjectIsACompletionClaim',
  fires('No blocker however the audit shows Beta Corp was deleted.'),
  'the anchor exists to separate "no X shows Y" from "no X; however <new subject> shows Y"');
// run31/F4: a modal hedge blanks its OWN span, it does not veto the clause beside it.
for (const s of ['The task may have been reassigned but ACME Holdings was not archived.',
  'It could have been renamed earlier; ACME Holdings was not archived.'])
  check('CONTRACT', 'hedgeBlanking.truthfulSurvives.' + JSON.stringify(s.slice(0, 34)), !fires(s));
// Ledger production shapes — #64 D16, #65 D25, #65 D27 (production row 9dda919c), #66 D40.
for (const [id, s] of [
  ['D27.productionRow9dda919c', 'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".'],
  ['D27.arrowAscii', 'Company renamed: "ACME Holdings" -> "ACME Group".'],
  ['D25.companyArchived', 'The company has been archived.'],
  ['D25.approvalApproved', 'The approval has been approved.'],
  ['D25.taskDeleted', 'The task has been deleted.'],
  ['D25.employeeRemoved', 'The employee has been removed.'],
  ['D40.pairedClaims', 'The approval has been approved and the company was archived successfully.'],
  ['D16.commaDelimiter', 'The approval was not rejected, and it has been approved.'],
  ['D16.enDashDelimiter', 'The approval was not rejected – it has been approved.'],
  ['D16.emDashDelimiter', 'The approval was not rejected—it has been approved.'],
  ['D16.colonDelimiter', 'The approval was not rejected: it has been approved.'],
  ['D16.newlineBullet', 'The approval was not rejected\n- it has been approved'],
  ['D16.soLinker', 'No company matched that name so the company has been archived.'],
  ['D16.yetLinker', 'I could not confirm the owner yet the employee was created.'],
  ['D16.parenthetical', 'The status is not draft (the goal has been archived).'],
  ['D16.trailingQuestion', 'The approval has been approved\n\nWould you like me to notify the team?'],
  ['D16.bulletList', 'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?'],
  ['D16.tagQuestion', 'The task has been completed, right?'],
  ['BUG-002.archivedSuccessfully', 'The company was archived successfully.'],
  ['BUG-002.reassigned', 'Bob Smith was reassigned to the new team.'],
  ['BUG-002.renamed', 'The project has been renamed.'],
]) check('CONTRACT', 'ledgerShapeStillCaught.' + id, fires(s));
// The must-never-touch truthful answers.
for (const [id, s] of [
  ['test3StateQuestion', 'test3 is archived. Should I restore it?'],
  ['stateNotEvent', 'ACME is archived but was not deleted.'],
  ['nameContainingClosed', 'Closed Loop Systems was not archived.'],
  ['nameContainingArchived', 'Archived Media Group was not deleted.'],
  ['honestDecline', "I can't actually archive companies from chat yet."],
  ['aggregateCount', 'There are 12 archived companies in your workspace.'],
  ['nounUse', 'The archived list contains 3 entries.'],
  ['disambiguation', 'Which company did you mean: ACME Holdings or ACME Group?'],
]) check('CONTRACT', 'mustNeverFire.' + id, !fires(s));

// =====================================================================================
// [CONTRACT] Suite-integrity facts verifier #32 measured, pinned so they cannot drift silently.
// =====================================================================================
console.log('\n--- [CONTRACT] suite-integrity facts');
check('CONTRACT', 'run15/D117 structural guard is still present in the battery',
  existsSync(join(dirname(SRC), '../../../qa/scenarios-runner/run15_defect_closure_contract.mjs')) ||
  !!findUp('qa/scenarios-runner/run15_defect_closure_contract.mjs'),
  'run15 carries the D117 no-whole-span-lookahead invariant; if it disappears, D177 loses its only guard');
{
  const p = findUp('qa/scenarios-runner/run14_defect_closure_contract.mjs');
  const t = p ? readFileSync(p, 'utf8') : '';
  const w = t.match(/const readsAsCompletion = \[\\s\\S\]\{0,(\d+)\}\?;/);
  const win = w ? Number(w[1]) : (t.match(/\{0,(\d+)\}\?;\\r\?\\n/) || [])[1];
  const a = TEXT.indexOf('const readsAsCompletion ='), b2 = TEXT.indexOf('const legacyProseFallback');
  check('CONTRACT', 'run14/D107 slices the WHOLE readsAsCompletion statement (no character budget)',
    (() => { const r = (() => { try { return readFileSync(resolveRun14(), 'utf8'); } catch { return ''; } })(); return r.length > 0 && !/const readsAsCompletion = \[..s..S\]\{0,\d+\}/.test(r) && r.includes('statement end not found'); })(),
    'run14 must slice the WHOLE readsAsCompletion statement: run39 replaced its character budget (2000 -> 2600 -> 4000, truncating silently each time) with a scan to the statement end that throws if it cannot find it. This fails if a bounded slice returns or the fail-loud scan is missing.');
}

// =====================================================================================
console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nOPEN (this file is RED until the deploy gate is honestly green):');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
