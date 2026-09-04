// =====================================================================================
// v25_regression_additions.mjs — VERIFIER #25 (campaign #85), independent verification of
// the run24 D158 closure (FIX-C) on candidate `164b3ee` / index.ts sha256
// e88370a92f5dc2e89d2014e3ec2f1267056ba0021732e423736b4065884f5834.
//
// CONVENTION (same as run8..run24 / v13..v24):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap DISCLOSED and deliberately deferred, pinned at its CURRENT behaviour
//                so a later change that moves it is seen.
// ANY failure exits nonzero.
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor written
// for this campaign. No reimplementation. It imports NOTHING from qa/scenarios-runner and
// nothing from any v*_ artefact — those are the things under test.
//
// Source resolution: SEM_INDEX_SRC, else `../../../supabase/functions/sem-ai-command/index.ts`
// (its home in qa/verification/proposed/), else `../../supabase/...` (after promotion into
// qa/scenarios-runner/).
//
// EXPECTED ON THIS CANDIDATE: the 6 [DEFECT] groups FAIL (D160/D160b/D161 reproduce);
// every [CONTRACT] passes and every [RESIDUAL] sits at its pin. Under the prepared FIX-D
// (v25_PROMOTION_NOTE.md) it goes fully green with no [RESIDUAL] move.
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.SEM_INDEX_SRC,
  resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),
  resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
].filter(Boolean);
const SRC_PATH = CANDIDATES.find((p) => existsSync(p));
if (!SRC_PATH) throw new Error('v25: index.ts not found — tried ' + CANDIDATES.join(', '));
const src = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---- extractor (mine) ----------------------------------------------------------------
const imp = (code) => import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'));
function cut(a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error('v25 extractor: not found: ' + a);
  const j = src.indexOf(b, i); if (j < 0) throw new Error('v25 extractor: end not found: ' + b);
  return src.slice(i, j);
}
function balanced(marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('v25 extractor: not found: ' + marker);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('v25 extractor: unbalanced: ' + marker);
}
let beltSrc = cut('const LEGACY_PAST_COMPLETION =', 'const legacyProseFallback =')
  .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>')
  .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
if (/:\s*string\)/.test(beltSrc)) throw new Error('v25: a TypeScript annotation survived stripping — refusing to report on a slice that is not the product');
for (const need of ['const LEGACY_PAST_COMPLETION', 'const PROGRESS_VERBS', 'const EXECUTION_IN_PROGRESS',
  'const CONFIRMED_COMPLETION', 'const NEGATED_CLAUSE', 'const REFERENCELESS_CONFIRMATION',
  'const COMPLETION_PARTICIPLE', 'const COMPLETION_VERB', 'const NEGATION_AUX',
  'const completionIsNegated', 'const readsAsCompletion']) {
  if (!beltSrc.includes(need)) throw new Error('v25: belt slice missing ' + need + ' — refusing to report on a slice that is not the product');
}
const belt = await imp(beltSrc + '\nexport { completionIsNegated, readsAsCompletion };\n');
const readsAsCompletion = belt.readsAsCompletion;
if (typeof readsAsCompletion !== 'function') throw new Error('v25: readsAsCompletion not extracted');

// ---- matcher extractor (mine) ---------------------------------------------------------
const stripTs = (s) => s
  .replace(/const ([A-Z_]+): Record<string, string> =/g, 'const $1 =')
  .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
  .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
  .replace(/\(([a-zA-Z]+): PendingActionOption\)/g, '($1)')
  .replace(/:\s*PendingActionOption\b/g, '').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '')
  .replace(/\((command|s|c|winner|o|w|opt|cmd): [^)]*\)/g, (m) => m.replace(/: [^,)]*/g, ''));
const constLine = (n) => {
  const m = src.match(new RegExp('^const ' + n + ' = (.+);$', 'm'));
  if (!m) throw new Error('v25: const not found: ' + n);
  return m[1];
};
const cfIdx = src.indexOf('const commandForContradiction = matchedOption');
const cfSrc = src.slice(cfIdx, src.indexOf(';', src.indexOf(': command', cfIdx)) + 1);
const contradictedSrc = cut('const contradicted = !!matchedOption', '\n          // Same GitHub issue #5');
if (!/ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN\)\.test\(command\)/.test(contradictedSrc)) {
  throw new Error('v25: the D157 unified imperative test is not present verbatim — refusing to report');
}
const matcher = await imp(stripTs(`
const ARCHIVE_VERB_PATTERN = ${constLine('ARCHIVE_VERB_PATTERN')};
const RESTORE_VERB_PATTERN = ${constLine('RESTORE_VERB_PATTERN')};
${balanced('function commandContradictsActionType(')}
${balanced('function matchDisambiguationOption(')}
export function selects(command, options) {
  const matchedOption = matchDisambiguationOption(command, options);
  if (!matchedOption) return 'DEAD-END';
  ${cfSrc}
  ${contradictedSrc};
  return contradicted ? 'DEAD-END' : 'SELECT';
}`));

// ---- harness --------------------------------------------------------------------------
let pass = 0; const failures = [];
function t(kind, id, got, want, note) {
  if (got === want) { pass++; console.log('OK   [' + kind + '] ' + id); }
  else {
    failures.push('[' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : ''));
    console.log('FAIL [' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : ''));
  }
}
const beltCase = (kind, id, text, want, note) => t(kind, id + ' ' + JSON.stringify(text.slice(0, 66)), readsAsCompletion(text), want, note);
const matchCase = (kind, id, opt, cmd, want, note) => t(kind, id + ' label=' + JSON.stringify(opt.label) + ' reply=' + JSON.stringify(cmd),
  matcher.selects(cmd, [opt]), want, note);

// =====================================================================================
// D160 (P2, NEW — a REGRESSION vs 4476c92 that this candidate carries) — FIX-C decides
// PASSIVE-vs-ACTIVE with a FIXED-LENGTH lookbehind, which can only see the ONE token in
// front of the evidential verb. One adverb, one contraction or one extra space between the
// auxiliary and the verb defeats it, and the passive evidential disarms the belt again.
// Measured on my corpus: 47 of 52 shapes MISSED here, all 52 CAUGHT at 4476c92.
// =====================================================================================
console.log('\n--- D160 [DEFECT]: an adverb/contraction between the auxiliary and the evidential must not re-disarm the belt');
for (const s of [
  'No errors were ever reported and ACME Holdings was archived.',
  'No errors were never reported and ACME Holdings was archived.',
  'No errors were also reported and ACME Holdings was archived.',
  'No errors were previously reported and ACME Holdings was archived.',
  'No errors were formally reported and ACME Holdings was archived.',
  'No errors were officially reported and ACME Holdings was archived.',
  'No errors were actually reported and ACME Holdings was archived.',
  'No errors were still reported and ACME Holdings was archived.',
  'No errors were not reported and ACME Holdings was archived.',
  'No delay was never recorded and ACME Holdings was archived.',
  'No issues were also noted and Beta Corp was deleted.',
  'No delay was never mentioned and ACME Holdings was archived.',
  'No issues were also confirmed and Beta Corp was deleted.',
  'No delay was never stated and ACME Holdings was archived.',
  'No issues were also suggested and ACME Holdings was archived.',
  'No delay was never indicated and ACME Holdings was archived.',
  'No issues were also established and ACME Holdings was archived.',
  'No delay was never proved and ACME Holdings was archived.',
  "The incident wasn't reported and ACME Holdings was archived.",
  "The incidents weren't noted and Beta Corp was deleted.",
  'No errors were  reported and ACME Holdings was archived.',
]) beltCase('DEFECT', 'D160.adverbDefeatsFixedLengthLookbehind', s, true,
  'CAUGHT at 4476c92, missed here — the same D147b/D158 direction FIX-C exists to close');

// =====================================================================================
// D160b (P2, NEW) — an ACTIVE but INTRANSITIVE evidential has no auxiliary at all, so the
// lookbehind can never fire, and it disarms a linked fabrication. 0/28 caught here, 28/28
// at 4476c92. Voice is the wrong test; POSITION relative to the clause linker is the right one.
// =====================================================================================
console.log('\n--- D160b [DEFECT]: an ACTIVE intransitive evidential linked by and/but must not disarm');
for (const v of ['reported', 'noted', 'recorded', 'confirmed', 'stated', 'suggested', 'indicated', 'established', 'mentioned', 'proved']) {
  beltCase('DEFECT', 'D160b.intransitiveActiveEvidential', `No auditor ${v} and ACME Holdings was archived.`, true,
    'CAUGHT at 4476c92, missed here');
}
beltCase('DEFECT', 'D160b.intransitiveActiveEvidential', 'No reviewer noted but ACME Holdings was archived.', true,
  'CAUGHT at 4476c92, missed here');

// =====================================================================================
// D161 (P4, PRE-EXISTING at b32e0e4 / 4476c92 / e6a4d02 and here — NOT a regression, but
// UNDISCLOSED and the same defect class as D160) — LEGACY_PAST_COMPLETION's modal
// lookbehinds `(?<!may )(?<!might )(?<!could )(?<!can )` are the same fixed-length
// construct and fail the same way: one adverb between the modal and the auxiliary and a
// HEDGE (a non-claim) is destroyed as a fabrication. `sem_ai_command_past_completion_claim_regex.mjs`
// already asserts the un-adverbed hedges must not match; this is that contract, one word wider.
// =====================================================================================
console.log('\n--- D161 [DEFECT]: an adverb between the modal and the auxiliary must not turn a HEDGE into a completion claim');
for (const s of [
  'ACME may possibly have been archived.',
  'ACME might well have been archived.',
  'ACME could conceivably have been archived.',
  'ACME may already have been archived.',
  'ACME might perhaps have been archived.',
  'ACME may  have been archived.',
]) beltCase('DEFECT', 'D161.adverbDefeatsModalLookbehind', s, false,
  'pre-existing at every SHA measured; same class as D160 — a fixed-length lookbehind used to decide scope');

// =====================================================================================
// [CONTRACT] — what this candidate genuinely provides. Re-derived, not taken on trust.
// =====================================================================================
console.log('\n--- D158 [CONTRACT]: the DIRECTLY-ADJACENT passive evidential is genuinely closed (all eleven of #24\'s shapes)');
for (const s of [
  'No errors were reported and ACME was archived.',
  'No issues were noted and Beta Corp was deleted.',
  'Nothing was mentioned and ACME was restored.',
  'No delay was recorded and ACME was archived.',
  'No dispute was confirmed and Beta Corp was deleted.',
  'No downtime was indicated and ACME Holdings was archived.',
  'No objection was stated and Beta Corp was removed.',
  'No exception was suggested and ACME was restored.',
  'No change was noted although ACME was archived.',
  'No error was reported however Beta Corp was deleted.',
  'No issue was recorded therefore ACME was archived.',
]) beltCase('CONTRACT', 'D158.adjacentPassiveEvidentialCaught', s, true);

console.log('\n--- D156 [CONTRACT]: an ACTIVE complement-taking evidential still makes the clause a truthful negative');
for (const s of [
  'No log shows ACME was archived.', 'No record indicates Beta Corp was deleted.',
  'No audit trail records ACME was archived.', 'There is no record ACME was archived.',
  'No log however shows ACME was archived.', 'No record therefore proves Beta Corp was deleted.',
  'No audit entry however indicates ACME was archived.', 'Nothing though suggests ACME was archived.',
  'No email or memo however says ACME was archived.', 'No evidence although requested shows ACME was archived.',
  'No entry therefore confirms Gamma Ltd was restored.', 'No source however states ACME was archived.',
  'No document though proves Beta Corp was deleted.', 'No history however shows the task was completed.',
  'No note therefore establishes ACME was archived.', 'No entry though records the company was archived.',
  'No source therefore reports the department was removed.',
]) beltCase('CONTRACT', 'D156.activeEvidentialSurvives', s, false);

console.log('\n--- prior belt closures [CONTRACT] (D112/D116/D118/D125/D128/D130/D131/D134/D137/D139/D147b/D151)');
for (const [id, s, want] of [
  ['D112.nounDeterminer', 'The archived list has three entries.', false],
  ['D112.nounCardinal', 'There are 3 archived companies.', false],
  ['D112.presentNegation', 'The company is not archived.', false],
  ['D112.notDone', 'Still pending, not approved.', false],
  ['D116.laterSentenceNegator', 'Confirmed — Archived ACME. No further action needed.', true],
  ['D118.truthfulNegative', 'No company was archived.', false],
  ['D125.dashNoUndo', 'ACME was archived – no undo available.', true],
  ['D125.parenNoUndo', 'ACME was archived (no undo available).', true],
  ['D125.withoutIncident', 'ACME was archived without incident.', true],
  ['D125.andNoErrors', 'ACME was archived and no errors occurred.', true],
  ['D128.saltAndPepper', 'No company named Salt and Pepper Co was archived.', false],
  ['D130.closedLoop', 'Closed Loop Systems was not archived.', false],
  ['D130.archivedMedia', 'Archived Media Group was not archived.', false],
  ['D130.stateButNegated', 'ACME is archived but was not deleted.', false],
  ['D131.doctorsWithout', 'Doctors Without Borders was not archived.', false],
  ['D134.confirmedBenignThenNegated', 'Confirmed — as requested, ACME was not archived.', false],
  ['D134.confirmedLaterClauseParticiple', 'Confirmed — as requested, Restored Bob Smith.', true],
  ['D137.stateQuestion', 'test3 is archived. Should I restore it?', false],
  ['D137.progressivePassive', 'ACME is being archived.', true],
  ['D139.hyphenPlaceName', 'Ulaanbaatar-Darkhan Logistics was not archived.', false],
  ['D139.emDashName', 'No company — not even ACME Holdings — was archived.', false],
  ['D147b.noErrorsOccurredAnd', 'No errors occurred and ACME was archived.', true],
  ['D147b.werePendingAnd', 'No approvals were pending and ACME was archived.', true],
  ['D147b.failedAnd', 'Nothing failed and ACME was archived.', true],
  ['D147b.remainedAnd', 'Nothing remained and ACME was archived.', true],
  ['D151.nobody', 'Nobody archived ACME.', false],
  ['D151.neither', 'Neither company was archived.', false],
  ['D151.nor', 'Neither ACME nor Beta Corp was archived.', false],
  ['D151.few', 'Few companies were archived.', false],
  ['D151.hardly', 'Hardly anything was archived.', false],
  ['D151.none', 'None of them were archived.', false],
]) beltCase('CONTRACT', 'prior.' + id, s, want);

console.log('\n--- D155 [CONTRACT]: the first-person arm is case-sensitive, and D144 still fires');
for (const s of [
  'I removed it from my draft, not from the database.', 'I restored order to the report layout.',
  'I removed some duplication from the wording above.', 'I renamed the section heading in this reply for clarity.',
  'I have not deleted the company.', 'Have I deleted the company yet?',
  'If I deleted the company, tell me.', 'You asked whether I deleted the company.',
]) beltCase('CONTRACT', 'D155.truthfulFirstPersonSurvives', s, false);
for (const s of [
  'I deleted Beta Corp.', 'We archived ACME.', 'I deleted the company.', 'I archived the company.',
  'I removed the person.', 'I restored the project.', 'I renamed the task.', 'I deactivated the account.',
  'i deleted Beta Corp.', 'we archived ACME.', 'I just deleted Beta Corp.', 'I already archived ACME.',
  'I have deleted the company.', 'Confirmed — I deleted Beta Corp.', 'I reassigned the tasks.',
]) beltCase('CONTRACT', 'D144.firstPersonCompletionCaught', s, true);

console.log('\n--- matcher closures [CONTRACT] (D116/D123/D127/D129/D132/D133/D136/D138/D142/D148/D150/D157)');
const O = (label, actionType) => ({ id: 'c1', label, entityType: 'company', actionType });
for (const [id, label, at, cmd, want] of [
  ['D157.bringBack', 'Bring Back', 'archive', 'bring back', 'DEAD-END'],
  ['D157.bringItBack', 'Bring It Back', 'archive', 'bring it back', 'DEAD-END'],
  ['D157.unArchiveIt', 'Un-Archive', 'archive', 'un-archive it', 'DEAD-END'],
  ['D157.unArchiveBare', 'Un-Archive', 'archive', 'un-archive', 'DEAD-END'],
  ['D148.restoreIt', 'Restore', 'archive', 'restore it', 'DEAD-END'],
  ['D148.pleaseRestore', 'Restore', 'archive', 'please restore', 'DEAD-END'],
  ['D148.bareRESTORE', 'Restore', 'archive', 'RESTORE', 'DEAD-END'],
  ['D138.restoredFurniture', 'Restored Furniture Co', 'archive', 'Restored Furniture Co', 'SELECT'],
  ['D138.reactivatedMetals', 'Reactivated Metals LLC', 'archive', 'Reactivated Metals LLC', 'SELECT'],
  ['D150.restoreHardware', 'Restore Hardware Ltd', 'archive', 'Restore Hardware Ltd', 'SELECT'],
  ['D150.westEndTrading', 'West End Trading Co', 'restore', 'West End Trading Co', 'SELECT'],
  ['D150.endZoneInc', 'End Zone Inc', 'restore', 'End Zone Inc', 'SELECT'],
  ['D142.bareLabelEmptiesCommand', 'Restore', 'archive', 'restore Restore', 'DEAD-END'],
  ['D127.activateAcme', 'ACME Holdings', 'archive', 'activate ACME Holdings', 'DEAD-END'],
  ['D127.rejectAcme', 'ACME Holdings', 'archive', 'reject ACME Holdings', 'DEAD-END'],
  ['D127.archiveAcmeTasks', 'ACME Holdings', 'archive', 'archive ACME Holdings tasks', 'DEAD-END'],
  ['D116.dontArchive', 'ACME', 'archive', "don't archive acme", 'DEAD-END'],
  ['D123.excludeAcme', 'ACME', 'archive', 'exclude acme', 'DEAD-END'],
  ['D123.acmeCommaNo', 'ACME', 'archive', 'acme, no', 'DEAD-END'],
  ['D133.optionTwoOutOfRange', 'ACME', 'archive', 'option 2', 'DEAD-END'],
  ['D129.acmeTwo', 'ACME', 'archive', 'acme 2', 'DEAD-END'],
  ['D129.acmeOptionOne', 'ACME', 'archive', 'acme (option 1)', 'SELECT'],
  ['D132.protoKeyConstructor', 'ACME', 'constructor', 'ACME', 'SELECT'],
  ['D132.protoKeyProto', 'ACME', '__proto__', 'ACME', 'SELECT'],
]) matchCase('CONTRACT', id, O(label, at), cmd, want);

// =====================================================================================
// FOUNDER-DIRECTED LEXICAL BRANCH [CONTRACT] — one real company name per canonical
// completion word plus the eight base-form-verb names, driven through both branches the
// founder actually meets.
// =====================================================================================
console.log('\n--- founder-directed lexical branch [CONTRACT] (30 names)');
const NAMES = ['Archived Media Group', 'Deleted Scenes Films', 'Updated Interiors Ltd', 'Created Space Studio',
  'Restored Furniture Co', 'Activated Carbon Ltd', 'Deactivated Systems LLC', 'Assigned Risk Insurance',
  'Reassigned Freight Co', 'Approved Auto Parts', 'Rejected Goods Depot', 'Declined Cards Ltd',
  'Removed Asbestos Services', 'Completed Works Ltd', 'Renamed Brands Inc', 'Ended Chapters Books',
  'Closed Loop Systems', 'Cleared Skies Aviation', 'Sent Post Logistics', 'Moved Mountains Ltd',
  'Granted Land Holdings', 'Added Value Partners', 'Archive', 'Delete', 'Remove', 'End', 'Restore',
  'Unarchive', 'Reactivate', 'Activate'];
let lexPass = 0, lexFail = 0;
for (const n of NAMES) {
  for (const s of [`There is no record ${n} was archived.`, `No record shows ${n} was archived.`,
    `${n} was not archived.`, `${n} is archived. Should I restore it?`,
    `Which ${n} did you mean — the holding company or the subsidiary?`,
    `I could not archive ${n} — no action was taken.`]) {
    if (readsAsCompletion(s) === false) lexPass++; else { lexFail++; console.log('FAIL [CONTRACT] lex.truthfulDestroyed ' + JSON.stringify(s)); failures.push('[CONTRACT] lex.truthfulDestroyed ' + JSON.stringify(s)); }
  }
  for (const s of [`${n} was archived.`, `Confirmed — Archived ${n}.`, `I archived ${n}.`]) {
    if (readsAsCompletion(s) === true) lexPass++; else { lexFail++; console.log('FAIL [CONTRACT] lex.fabricationMissed ' + JSON.stringify(s)); failures.push('[CONTRACT] lex.fabricationMissed ' + JSON.stringify(s)); }
  }
}
t('CONTRACT', 'lex.beltBranch 270 cases (180 truthful survive + 90 fabrications fire)', lexFail, 0);
pass += lexPass;

let selPass = 0;
for (const n of NAMES) for (const at of ['archive', 'restore']) for (const reply of [n, `yes, ${n}`, `${n} (option 1)`]) {
  const got = matcher.selects(reply, [O(n, at)]);
  // Pinned at the candidate's own behaviour, which I measured identical to 4476c92 180/180.
  const want = (['Archive', 'Delete', 'Remove', 'End', 'Restore', 'Unarchive', 'Reactivate', 'Activate'].includes(n)
    && ((at === 'archive' && /^(Restore|Unarchive|Reactivate|Activate)$/.test(n)) || (at === 'restore' && /^(Archive|Delete|Remove|End)$/.test(n))))
    ? 'DEAD-END' : 'SELECT';
  if (got === want) selPass++;
  else { failures.push('[CONTRACT] lex.matcher ' + JSON.stringify({ n, at, reply, got, want })); console.log('FAIL [CONTRACT] lex.matcher ' + JSON.stringify({ n, at, reply, got, want })); }
}
t('CONTRACT', 'lex.matcherBranch 180 cases (30 names x 2 pending families x 3 reply forms)', selPass, 180);

// =====================================================================================
// [RESIDUAL] — disclosed and deliberately deferred, pinned at CURRENT behaviour.
// =====================================================================================
console.log('\n--- disclosed residuals [RESIDUAL]');
for (const [id, s, cur, note] of [
  ['D158b.possessiveObject', 'I deleted my account.', false, 'CAUGHT at 4476c92 — the accepted price of closing D155'],
  ['D158b.pronounObject', 'I deleted them.', false, 'CAUGHT at 4476c92'],
  ['D158b.cardinalObject', 'I removed 3 tasks.', false, 'CAUGHT at 4476c92'],
  ['D158b.lowercaseName', 'I archived acme corp.', false, 'CAUGHT at 4476c92'],
  ['D158d.capitalisedNonEntityFP', 'I restored ORDER to the layout.', true, 'pinned in run24 but NOT listed in the ledger postscript\'s residual set — a disclosure gap, not a code gap'],
  ['D158d.capitalisedNonEntityFP2', 'I removed Excel formatting from my draft.', true, 'ditto'],
  ['D153.droppedLinker', 'No issues, ACME was archived.', true, 'the dropped-linker trade'],
  ['D156b.subjectNP', 'That ACME was archived cannot be confirmed.', true, 'subject-NP'],
  ['D146b.commaList', 'No company, no person, no task was archived.', false, 'comma-list'],
  ['D159.renamedArrowUnreachable', 'Renamed: ACME -> Beta Corp', false, 'LEGACY\'s `renamed: … ->` arm is unreachable through readsAsCompletion'],
  ['D159.renamedArrowNoSpaceFires', 'Renamed:ACME -> Beta Corp', true, 'the same arm fires only without the space'],
]) beltCase('RESIDUAL', id, s, cur, note);
for (const [id, label, at, cmd, cur, note] of [
  ['D158c.bareParticipialNameDeadEnds.Restored', 'Restored', 'archive', 'Restored', 'DEAD-END', 'SELECTED at 4476c92; the D136 fail-closed answer'],
  ['D158c.bareParticipialNameDeadEnds.Archived', 'Archived', 'restore', 'Archived', 'DEAD-END', 'SELECTED at 4476c92'],
  ['D154.reviveStillArms', 'Revive', 'archive', 'Revive', 'SELECT', 'out-of-lexicon opposite verb still arms the destructive field — identical at every SHA'],
  ['D154.reopenStillArms', 'Reopen', 'archive', 'Reopen', 'SELECT', 'ditto'],
  ['D154.undeleteStillArms', 'Undelete', 'archive', 'Undelete', 'SELECT', 'ditto'],
]) matchCase('RESIDUAL', id, O(label, at), cmd, cur, note);

// =====================================================================================
// source invariants [CONTRACT]
// =====================================================================================
console.log('\n--- source invariants [CONTRACT]');
{
  const nonComment = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  t('CONTRACT', 'noModifierGroupShipped ((?-i: / (?i: absent from every non-comment line)', /\(\?-?i:/.test(nonComment), false,
    'a modifier group is unverified in the Deno Edge runtime; a bad one fails at module load and takes the function down');
  t('CONTRACT', 'noVariableLengthLookbehindShipped', /\(\?<[!=][^)]*[*+{][^)]*\)/.test(nonComment), false);
  const beltDecls = (beltSrc.match(/^\s*const\s+([A-Z][A-Z0-9_]*)\s*=/gm) || []).map((x) => x.trim().split(/\s+/)[1]);
  t('CONTRACT', 'beltConstSetUnchanged=' + beltDecls.join(','), beltDecls.join(','),
    'LEGACY_PAST_COMPLETION,PROGRESS_VERBS,EXECUTION_IN_PROGRESS,CONFIRMED_COMPLETION,NEGATED_CLAUSE,REFERENCELESS_CONFIRMATION,COMPLETION_PARTICIPLE,COMPLETION_VERB,NEGATION_AUX',
    'a NEW named const here is silently dropped by run15/16/17/18, which assemble the belt from this list');
  const arm = src.match(/\/\(\?:\^\|\\b\[Cc\]onfirmed[^\n]*?\/(i?)\.test\(c\)/);
  t('CONTRACT', 'D155ArmIsCaseSensitive', arm ? arm[1] : 'ARM-NOT-FOUND', '');
  t('CONTRACT', 'firstPersonArmRemovedFromLegacy', /LEGACY_PAST_COMPLETION = [^\n]*\(\?:i\|we\)/.test(src), false);
  t('CONTRACT', 'D157imperativeTestUsesSharedLexicons', /ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN\)\.test\(command\)/.test(contradictedSrc), true);
  const q = src.match(/const safeQuestionFragment[\s\S]*?\n        \};/);
  t('CONTRACT', 'questionBeltByteIdentical', q ? createHash('sha256').update(q[0]).digest('hex').slice(0, 16) : 'NOT-FOUND', '1e3d374db34fa084',
    're-measured identical at b32e0e4, 4476c92, e6a4d02 and this candidate');
  t('CONTRACT', 'readsAsCompletionStillDecidesNegationViaHelper',
    /completionIsNegated\(/.test(beltSrc.split('const readsAsCompletion =')[1] || ''), true);
}

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
const byKind = (k) => failures.filter((f) => f.startsWith('[' + k + ']')).length;
console.log('  [CONTRACT] failures: ' + byKind('CONTRACT') + '   [DEFECT] reproductions: ' + byKind('DEFECT') + '   [RESIDUAL] moves: ' + byKind('RESIDUAL'));
if (failures.length) process.exit(1);
