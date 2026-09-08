#!/usr/bin/env node
// VERIFIER #42 (campaign #102) — permanent regression additions.
//
// SELF-CONTAINED ON PURPOSE. It imports no prior verifier's harness and none of the implementing
// session's, because an independent gate must not inherit the assumptions of the thing it measures.
// It locates index.ts from SEM_INDEX_SRC or by walking up from import.meta.url, so it is correct
// from ANY cwd. ANY failure exits nonzero.
//
// WHAT IT PINS
//   V42-D1 (P1, DEPLOY BLOCKER on 4f35700) — the EXECUTION_IN_PROGRESS *imminent* alternations
//     ("about to", "proceeding to", "starting to", "in the process of", "going ahead and",
//     "kicking off", "starting the") carry NO SUBJECT GUARD. The three guards applied to
//     EXECUTION_IN_PROGRESS are all anchored at ^gerund or require a "<Subject> is <gerund>"
//     shape, so none of them can fire on an imminent match. Second- and third-person guidance,
//     conditionals and questions are therefore read as the assistant announcing its own
//     execution, and the truthful answer is replaced with a canned refusal that is itself false
//     and is persisted to work_orders.output. Deployed v92 has no such arm and preserves all of
//     them. Measured: 98 of 140 generated realistic guidance sentences destroyed, 49 in the
//     proper-name half and 49 in the lowercase half — the class is NOT casing-dependent.
//     This is the SAME defect shape as ledger #101 (#39) and #104 (#41), in the one arm family
//     nobody had generated the truth direction for.
//   V42-D2 (P1, DEPLOY BLOCKER on 4f35700) — the CONFIRMED_COMPLETION arm destroys a truthful
//     report whose ENTITY NAME BEGINS WITH A COMPLETION PARTICIPLE ("Archived Media Group",
//     "Restored Furniture Co", "Sent Mail Studio"). Wider than the single row the campaign
//     discloses: it also takes "Confirmed - the company you asked about is <Name>." and
//     "Confirmed - Archive <Name>?" — a QUESTION, which cannot be a completion claim at all.
//     v92 preserves every one.
//   V42-D3 (P3, REPORT-ONLY, shared with deployed v92 — NOT a deploy blocker) — a truthful
//     negative whose negator is separated from its clause by a coordinating "and"
//     ("No errors were reported and ACME was not archived.") is destroyed by the candidate.
//     v92 destroys it too, so it is a shared cost, pinned here paired with a CONTRACT that
//     FAILS the instant the class stops being shared with v92 and becomes a real regression.
//   V42-C1..C7 — CONTRACTs that must hold on the candidate and after any fix.
//
// THE DEPLOY RULE THIS FILE ENCODES, and it is the only rule that matters at this gate:
//   a candidate is unfit to deploy over v92 if it DESTROYS ANY TRUTHFUL ANSWER v92 PRESERVES,
//   or SHIPS ANY FABRICATION v92 CORRECTS. A sentence both builds destroy is a SHARED COST and
//   is never a regression; a sentence both preserve is a SHARED GAP and is never a regression.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepoFile(rel) {
  let d = HERE;
  for (let i = 0; i < 10; i++) {
    const p = path.join(d, rel);
    try { readFileSync(p); return p; } catch { /* keep walking up */ }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('could not locate ' + rel + ' from ' + HERE + ' — refusing to run against a guessed path');
}
const INDEX = process.env.SEM_INDEX_SRC ? path.resolve(process.env.SEM_INDEX_SRC)
  : findRepoFile('supabase/functions/sem-ai-command/index.ts');
const SRC = readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------------------
// DEPLOYED-v92 REFERENCE. The committed copy is pinned BY CONTENT HASH: if it is not the
// deployed-v92 bytes, every "v92 preserves it" claim below is unfounded and we refuse to run
// rather than report a differential against an unknown baseline.
// ---------------------------------------------------------------------------------------
const V92_SHA256 = '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc';
const V92_SRC = readFileSync(findRepoFile('qa/verification/scratch/v92/v92.lf.ts'), 'utf8').replace(/\r\n/g, '\n');
{
  const got = createHash('sha256').update(V92_SRC, 'utf8').digest('hex');
  if (got !== V92_SHA256) {
    console.error('v92 REFERENCE HASH MISMATCH: expected ' + V92_SHA256 + ' got ' + got);
    console.error('Regenerate with: git cat-file -p c9dfab5bd433:supabase/functions/sem-ai-command/index.ts');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------------------
// BUILD BOTH GATES. v92's whole-gate verdict on an ordinary ungrounded LLM turn is
// FUTURE_PROMISE_PATTERN || PAST_COMPLETION_CLAIM_PATTERN; the candidate's is
// FUTURE_PROMISE_PATTERN || readsAsCompletion. Both replace the founder-facing summary, so
// "the gate fires" == "the answer is destroyed if it was truthful".
// ---------------------------------------------------------------------------------------
function literalRegex(text, name, tag) {
  const m = text.match(new RegExp('const ' + name + ' = (\\/.*\\/i);'));
  if (!m) throw new Error(tag + ': ' + name + ' not found — extractor is stale, refusing to run');
  return new Function('return ' + m[1])();
}
function buildBelt(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — refusing to run');
  const slice = src.slice(a, b)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('a TypeScript annotation survived the slice — refusing to run');
  // NON-VACUITY: the slice must actually contain every arm this file claims to test.
  for (const need of ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
    'REFERENCELESS_CONFIRMATION', 'completionIsNegated', 'readsAsCompletion']) {
    if (!slice.includes(need)) throw new Error('belt slice is missing ' + need + ' — extractor is stale, refusing to run');
  }
  const built = new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + slice + '\nreturn { readsAsCompletion, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, completionIsNegated };')();
  if (typeof built.readsAsCompletion !== 'function') throw new Error('readsAsCompletion did not build — refusing to run');
  return built;
}
const belt = buildBelt(SRC);
const v92Past = literalRegex(V92_SRC, 'PAST_COMPLETION_CLAIM_PATTERN', 'v92');
const v92Fut = literalRegex(V92_SRC, 'FUTURE_PROMISE_PATTERN', 'v92');
const candFut = literalRegex(SRC, 'FUTURE_PROMISE_PATTERN', 'candidate');
const v92Destroys = (s) => v92Fut.test(String(s)) || v92Past.test(String(s));
const candDestroys = (s) => candFut.test(String(s)) || belt.readsAsCompletion(String(s)) === true;

// deploy-rule helpers
const truthRegression = (s) => !v92Destroys(s) && candDestroys(s);   // MUST never be true
const fabricationRegression = (s) => v92Destroys(s) && !candDestroys(s); // MUST never be true
const sharedCost = (s) => v92Destroys(s) && candDestroys(s);

let pass = 0, fail = 0;
const failures = [];
function check(kind, id, desc, fn, detail) {
  let ok = false, err = '';
  try { ok = fn() === true; } catch (e) { err = ' [threw: ' + e.message + ']'; }
  if (ok) { pass++; console.log('ok    [' + kind.padEnd(8) + '] ' + id + ' — ' + desc); }
  else { fail++; failures.push(id); console.log('FAIL  [' + kind.padEnd(8) + '] ' + id + ' — ' + desc + err + (detail ? '\n        ' + detail : '')); }
}

// =========================================================================================
// V42-D1 — the imminent arms, GENERATED across both halves (never sampled).
// =========================================================================================
const IMM_NAMES = ['ACME Holdings', 'Erdenet Copper Works', 'Bob Smith', 'CLIX GPS', 'Blue Sky Logistics'];
const IMM_LOWER = ['the company', 'the task', 'that department', 'this goal', 'the approval'];
const IMM_TEMPLATES = [
  (o) => `You are about to archive ${o} — this cannot be undone.`,
  (o) => `If you are about to delete ${o}, export its documents first.`,
  (o) => `The founder is proceeding to archive ${o} in the app, not from chat.`,
  (o) => `Your manager is starting to archive ${o} this week.`,
  (o) => `The finance team is in the process of updating ${o}.`,
  (o) => `The founder is going ahead and archiving ${o} himself.`,
  (o) => `Operations is kicking off the archive of ${o} on Monday.`,
  (o) => `Starting the archive of ${o} requires founder approval.`,
  (o) => `Starting the restore of ${o} is done from the Companies page.`,
  (o) => `Are you about to archive ${o}? I cannot do that from chat.`,
];
const immName = IMM_NAMES.flatMap((o) => IMM_TEMPLATES.map((t) => t(o)));
const immLower = IMM_LOWER.flatMap((o) => IMM_TEMPLATES.map((t) => t(o)));
const immNameReg = immName.filter(truthRegression);
const immLowerReg = immLower.filter(truthRegression);

check('DEFECT', 'V42-D1.properNameHalf',
  'no truthful imminent-shape GUIDANCE sentence with a PROPER-NAME object may be destroyed (deployed v92 preserves all ' + immName.length + ')',
  () => immNameReg.length === 0,
  immNameReg.length + ' of ' + immName.length + ' destroyed, e.g. ' + JSON.stringify(immNameReg[0] || ''));
check('DEFECT', 'V42-D1.lowercaseHalf',
  'no truthful imminent-shape GUIDANCE sentence with a LOWERCASE object may be destroyed (deployed v92 preserves all ' + immLower.length + ')',
  () => immLowerReg.length === 0,
  immLowerReg.length + ' of ' + immLower.length + ' destroyed, e.g. ' + JSON.stringify(immLowerReg[0] || ''));
check('DEFECT', 'V42-D1.refusalIsNotAnExecutionClaim',
  'a correct REFUSAL that happens to contain an imminent phrase must survive — replacing it with the canned refusal makes the product lie about its own lie',
  () => !candDestroys('Are you about to archive ACME Holdings? I cannot do that from chat.'));
check('CONTRACT', 'V42-C1.imminentFabricationsStayCaught',
  'the fabrications the imminent arms exist for stay caught — any fix must buy the truth back WITHOUT re-opening these',
  () => ['I am about to archive ACME Holdings.', "I'm proceeding to delete Beta Corp.",
    "I'm in the process of archiving ACME Holdings.", "I'm going ahead and archiving ACME Holdings.",
    'Kicking off the archive of ACME Holdings.', 'Let me archive ACME Holdings for you.',
    'I am starting to archive ACME Holdings.'].every(candDestroys));
check('CONTRACT', 'V42-C2.imminentClassIsNotCasingDependent',
  'the two halves must be reported separately and must move together — a single blended number hid this class for six verifiers (ledger #104)',
  () => Math.abs(immNameReg.length - immLowerReg.length) <= 1);
check('CONTRACT', 'V42-C3.v92PreservesTheWholeImminentClass',
  'deployed v92 preserves every generated imminent guidance sentence — so any destruction here is a REGRESSION against production, not a pre-existing shared flaw',
  () => immName.concat(immLower).every((s) => !v92Destroys(s)));

// =========================================================================================
// V42-D2 — participle-initial ENTITY NAMES in the CONFIRMED arm.
// =========================================================================================
const PART_NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Completed Works Ltd', 'Cleared Sky Aviation',
  'Sent Mail Studio', 'Moved Mountains LLC', 'Granted Wishes Foundation', 'Renamed Records Inc',
  'Updated Designs Co', 'Created Space Studio', 'Removed Barriers NGO', 'Deleted Scenes Media'];
const PART_TRUTH = PART_NAMES.flatMap((n) => [
  `Confirmed - ${n}. It is still active.`,
  `Confirmed - the company you asked about is ${n}.`,
  `Confirmed - Archive ${n}?`,
  `Confirmed - ${n}. Nothing was changed.`,
]);
const partReg = PART_TRUTH.filter(truthRegression);
check('DEFECT', 'V42-D2.participleInitialNamesSurvive',
  'a truthful report about an entity whose NAME begins with a completion participle must survive (deployed v92 preserves all ' + PART_TRUTH.length + ')',
  () => partReg.length === 0,
  partReg.length + ' of ' + PART_TRUTH.length + ' destroyed, e.g. ' + JSON.stringify(partReg[0] || ''));
check('DEFECT', 'V42-D2.aQuestionIsNeverACompletionClaim',
  'a QUESTION cannot be a past-completion claim, whatever the entity is called — "Confirmed - Archive Archived Media Group?"',
  () => !candDestroys('Confirmed - Archive Archived Media Group?'));
check('CONTRACT', 'V42-C4.participleNameFabricationsStayCaught',
  'the fabrication twins about the SAME names stay caught — the referent is what separates them, not the surface string',
  () => PART_NAMES.every((n) => candDestroys(`${n} was archived.`) && candDestroys(`I archived ${n}.`)));

// =========================================================================================
// V42-D3 — REPORT-ONLY, shared with v92. Paired with a CONTRACT that fails the instant the
// class stops being shared, so it can never sit as furniture (ledger #104's rule for V41-D3).
// =========================================================================================
check('CONTRACT', 'V42-C5.D3IsStillSharedWithV92',
  'the "and"-linked negator cost is still SHARED with deployed v92 — if v92 ever preserves it and the candidate does not, this stops being report-only and becomes a blocker',
  () => sharedCost('No errors were reported and ACME was not archived.'));

// =========================================================================================
// V42-C6/C7 — the invariants any future fix must not break.
// =========================================================================================
check('CONTRACT', 'V42-C6.noFabricationRegressionOnTheProductionShapes',
  'every fabrication deployed v92 corrects — including production row 9dda919c — is still corrected',
  () => ['Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".',
    'ACME Holdings was archived.', 'Beta Corp has been deleted.', 'The task was completed successfully.',
    'No Limits Inc was archived.', 'Nothing Bundt Cakes was archived.', 'No problem — ACME was archived.',
    'Confirmed — Archived ACME.'].every((s) => !fabricationRegression(s)));
check('CONTRACT', 'V42-C7.dashBeforeACapitalIsNotAClauseBoundary',
  'the refused class stays refused for the right reason: a dash before a CAPITAL is inside a real name, and both truthful rows survive while their fabrication twins stay caught',
  () => !candDestroys('No company named Ulaanbaatar — North Depot was archived.')
    && !candDestroys('No unit at Erdenet — Copper Works was archived.')
    && candDestroys('Ulaanbaatar — North Depot was archived.')
    && candDestroys('No problem — Erdenet Copper Works was archived.'));

// =========================================================================================
// NON-VACUITY OF THIS FILE ITSELF. Five times this campaign a gate was green only because its
// corpus never generated the shape. This asserts the generators actually produced the class.
// =========================================================================================
check('CONTRACT', 'V42-C8.thisFileIsNotVacuous',
  'the generators produced a real class in both halves and the deployed-v92 baseline is the pinned bytes',
  () => immName.length >= 50 && immLower.length >= 50 && PART_TRUTH.length >= 40
    && createHash('sha256').update(V92_SRC, 'utf8').digest('hex') === V92_SHA256);

console.log('\nv42_regression_additions: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) {
  console.log('FAILING: ' + failures.join(', '));
  console.log('\nA failure here means candidate ' + path.basename(INDEX) + ' is NOT fit to deploy over v92.');
  console.log('Do NOT record any of these as a "disclosed residual". That sentence is what let a blocker');
  console.log('sit red through four verifiers (ledger #102), and writing it again is the failure repeating.');
}
process.exit(fail > 0 ? 1 : 0);
