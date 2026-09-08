// =====================================================================================
// VERIFIER #24 (campaign #84) — regression additions for the run23 closure
// (`e6a4d02` / `89a1ac9`, index.ts sha256
//  bf5e757f4e813b20a11a074d894192685946e1ef469b8e59647cc67c54118066).
//
// CONVENTION (same as run8..run23 / v13..v23):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap DISCLOSED and deliberately deferred, pinned at its CURRENT behaviour
//                so a later change that moves it is seen.
// ANY failure exits nonzero. A green run on THIS candidate would mean this file is not doing
// its job — D158 is open here.
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor written
// for this campaign. No reimplementation. It imports NOTHING from qa/scenarios-runner and
// nothing from v23_*.mjs — those are artefacts under test.
//
// Source resolution: SEM_INDEX_SRC, else `../../../supabase/functions/sem-ai-command/index.ts`
// (its home in qa/verification/proposed/), else `../../supabase/...` (after promotion into
// qa/scenarios-runner/).
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
if (!SRC_PATH) throw new Error('v24: index.ts not found — tried ' + CANDIDATES.join(', '));
const src = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---- extractor (mine) ----------------------------------------------------------------
const imp = (code) => import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'));
function cut(a, b) {
  const i = src.indexOf(a); if (i < 0) throw new Error('v24 extractor: not found: ' + a);
  const j = src.indexOf(b, i); if (j < 0) throw new Error('v24 extractor: end not found: ' + b);
  return src.slice(i, j);
}
let beltSrc = cut('const LEGACY_PAST_COMPLETION =', 'const legacyProseFallback =')
  .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>')
  .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
if (/:\s*string\)/.test(beltSrc)) throw new Error('v24: a TypeScript annotation survived stripping — refusing to report on a slice that is not the product');
for (const need of ['const LEGACY_PAST_COMPLETION', 'const EXECUTION_IN_PROGRESS', 'const CONFIRMED_COMPLETION',
  'const NEGATED_CLAUSE', 'const REFERENCELESS_CONFIRMATION', 'const COMPLETION_PARTICIPLE',
  'const COMPLETION_VERB', 'const completionIsNegated', 'const readsAsCompletion']) {
  if (!beltSrc.includes(need)) throw new Error('v24: belt slice missing ' + need + ' — refusing to report on a slice that is not the product');
}
const belt = await imp(beltSrc + '\nexport { completionIsNegated, readsAsCompletion };\n');
const readsAsCompletion = belt.readsAsCompletion;

const constLine = (n) => {
  const m = src.match(new RegExp('^const ' + n + ' = (.+);$', 'm'));
  if (!m) throw new Error('v24: const not found: ' + n);
  return m[1];
};
const lexBody = `const ARCHIVE_VERB_PATTERN = ${constLine('ARCHIVE_VERB_PATTERN')};\nconst RESTORE_VERB_PATTERN = ${constLine('RESTORE_VERB_PATTERN')};\n`;
const lex = await imp(lexBody + 'export { ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN };');
const contradictedSrc = cut('const contradicted = !!matchedOption', '\n          // Same GitHub issue #5');
const contraMod = await imp(`${lexBody}
export function contradictedFn(matchedOption, command, commandForContradiction, commandContradictsActionType) {
  ${contradictedSrc}
  return contradicted;
}`);
function contradicted(opt, cmd) {
  const stripped = typeof opt.label === 'string'
    ? cmd.replace(new RegExp(opt.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ') : cmd;
  const f = (c, a) => {
    const t = a || 'archive';
    if (t === 'archive' && lex.RESTORE_VERB_PATTERN.test(c) && !lex.ARCHIVE_VERB_PATTERN.test(c)) return true;
    if (t === 'restore' && lex.ARCHIVE_VERB_PATTERN.test(c) && !lex.RESTORE_VERB_PATTERN.test(c)) return true;
    return false;
  };
  return contraMod.contradictedFn(opt, cmd, stripped, f);
}

// ---- harness -------------------------------------------------------------------------
const failures = [];
let pass = 0;
function t(kind, id, got, want, note) {
  if (got === want) { pass++; console.log('OK   [' + kind + '] ' + id); }
  else { failures.push('[' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : '')); console.log('FAIL [' + kind + '] ' + id + '  expected=' + want + ' got=' + got + (note ? '  — ' + note : '')); }
}
const beltCase = (kind, id, text, want, note) => t(kind, id + ' ' + JSON.stringify(text.slice(0, 62)), readsAsCompletion(text), want, note);
const matchCase = (kind, id, opt, cmd, want, note) => t(kind, id + ' label=' + JSON.stringify(opt.label) + ' reply=' + JSON.stringify(cmd), contradicted(opt, cmd), want, note);

// =====================================================================================
// D158 (P2, NEW IN THIS CANDIDATE — REGRESSION vs 4476c92) — FIX-A's evidential/reporting
// verb list is matched anywhere between the negator and the completion verb, with no
// requirement that the verb be an ACTIVE, complement-taking predicate. A PASSIVE / reported
// use of one of the same twelve verbs inside the negated clause now disarms the belt, so the
// fabrication linked beside it ships. This is D147b, which the run22 postscript records as
// CLOSED and which run23 itself pins as a [CONTRACT] — but run23's D147b set uses only
// non-evidential verbs (occurred / were pending / failed / remained), so it cannot see this.
// Caught 12/12 at 4476c92; missed 11/12 here.
// =====================================================================================
console.log('\n--- D158 [DEFECT]: a PASSIVE evidential verb inside the negated clause must not disarm a linked fabrication');
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
]) beltCase('DEFECT', 'D158.passiveEvidentialDisarms', s, true, 'caught at 4476c92, missed here — D147b partially reopened');

console.log('\n--- D156 [CONTRACT]: an ACTIVE evidential verb still makes the clause a truthful negative');
for (const s of [
  'No log however shows ACME was archived.',
  'No record therefore proves Beta Corp was deleted.',
  'No audit entry however indicates ACME was archived.',
  'Nothing though suggests ACME was archived.',
  'No email or memo however says ACME was archived.',
  'No evidence although requested shows ACME was archived.',
  'No entry therefore confirms Gamma Ltd was restored.',
  'No source however states ACME was archived.',
  'No document though proves Beta Corp was deleted.',
  'No history however shows the task was completed.',
  'No note therefore establishes ACME was archived.',
  'No entry though records the company was archived.',
  'No source therefore reports the department was removed.',
]) beltCase('CONTRACT', 'D156.activeEvidentialSurvives', s, false);

console.log('\n--- D147b [CONTRACT]: the non-evidential clause-initial leaks stay closed');
for (const s of [
  'No errors occurred and ACME was archived.',
  'No approvals were pending but Beta Corp was deleted.',
  'No approvals are pending although ACME was archived.',
  'Nothing failed however ACME was archived.',
  'No issues remained and Gamma Ltd was restored.',
  'None remained therefore Beta Corp was deleted.',
  'No problems appeared and Beta Corp was deleted.',
  'No warnings were shown and Beta Corp was archived.',
]) beltCase('CONTRACT', 'D147b.clauseInitialLeakClosed', s, true);

// =====================================================================================
// D155 [CONTRACT] — the inline CASE-SENSITIVE first-person arm, both directions, on my own
// corpus. 0/32 truthful destroyed and 0/25 completions missed here; 13/32 and 0/25 at
// 4476c92, 0/32 and 23/25 at b32e0e4.
// =====================================================================================
console.log('\n--- D155 [CONTRACT]: truthful first-person NON-completions survive');
for (const s of [
  'I removed it from my draft, not from the database.',
  'I restored order to the report layout.',
  'I removed some duplication from the wording above.',
  'If I deleted the company, you would see it in the archive list.',
  'You asked whether I deleted the company.',
  'Have I deleted the company yet? No.',
  'I renamed the section heading in this reply for clarity.',
  'I removed extra whitespace from the numbers below.',
  'I removed that suggestion from my earlier answer.',
  'I restored my earlier phrasing.',
  'I renamed it only in this summary, not in Brain OS.',
  'I removed ambiguity from the question.',
  'I removed the confusion between the two names.',
  'I restored clarity to that paragraph.',
  'When I removed that line, it was only from the draft.',
  'I removed one word from my own sentence.',
  'I restored balance to the two columns.',
  'I have not deleted the company.',
  'I never archived the company.',
  'I removed nothing.',
  'I deleted the paragraph.',
  'I removed the ambiguity.',
]) beltCase('CONTRACT', 'D155.truthfulFirstPersonSurvives', s, false);

console.log('\n--- D144/D152 [CONTRACT]: real first-person completions are still caught');
for (const s of [
  'I deleted Beta Corp.',
  'We archived ACME.',
  'I deleted the company.',
  'I archived the company for you.',
  'I just removed Beta Corp from the system.',
  'I already archived ACME Holdings.',
  'I have deleted the employee.',
  'We restored Beta Corp.',
  'I renamed the department.',
  'I reassigned the task.',
  'I deactivated the account.',
  'I reactivated the person.',
  'Confirmed — I deleted Beta Corp.',
  'Confirmed — i deleted Beta Corp.',
  'I successfully archived ACME.',
  'I now removed the project.',
  'We deleted the document.',
  'I unarchived the goal.',
  'I removed the channel binding.',
  'I recently deleted the record.',
  'I had archived the tasks.',
  'i deleted the company.',
  'we archived the departments.',
  'I deleted our company.',
  'I deleted that goal.',
  'I removed its bindings.',
]) beltCase('CONTRACT', 'D144.firstPersonCompletionCaught', s, true);

console.log('\n--- D158b [RESIDUAL]: the object narrowing also drops real completions with an out-of-list object');
for (const [s, cur] of [
  ['I deleted my account.', false],
  ['I archived his tasks.', false],
  ['I removed 3 tasks.', false],
  ['I deleted them.', false],
  ['I archived acme corp.', false],
]) beltCase('RESIDUAL', 'D158b.outOfListObjectMissed', s, cur,
  'CAUGHT at 4476c92, missed here. The accepted price of closing D155; the postscript reports ' +
  '"15/15" and "4/50 missed" without naming this family. Pinned so a later widening is seen.');

console.log('\n--- D158d [RESIDUAL]: a capitalised NON-entity object still reads as a proper name');
for (const [s, cur] of [
  ['I restored ORDER to the layout.', true],
  ['I removed Excel formatting from my draft.', true],
  ['I removed Beta Corp from the list you pasted, not from Brain OS.', true],
]) beltCase('RESIDUAL', 'D158d.capitalisedNonEntityFP', s, cur,
  'pre-existing at 4476c92 and 54ebecc too — NOT a regression; inherent to a [A-Z] object test');

// =====================================================================================
// D157 [CONTRACT] — the imperative test now reuses ARCHIVE_VERB_PATTERN/RESTORE_VERB_PATTERN.
// contradicted === true means DEAD-END to the LLM (fail-closed); false means the option is
// selected and the destructive field arms.
// =====================================================================================
console.log('\n--- D157 [CONTRACT]: wide-lexicon opposite-intent commands now dead-end instead of arming');
matchCase('CONTRACT', 'D157.bringBack', { actionType: 'archive', label: 'Bring Back', id: 'c1' }, 'bring back', true);
matchCase('CONTRACT', 'D157.bringItBack', { actionType: 'archive', label: 'Bring It Back', id: 'c1' }, 'bring it back', true);
matchCase('CONTRACT', 'D157.unArchiveHyphenated', { actionType: 'archive', label: 'Un-Archive', id: 'c1' }, 'un-archive it', true);
matchCase('CONTRACT', 'D157.unArchiveHyphenatedBare', { actionType: 'archive', label: 'Un-Archive', id: 'c1' }, 'un-archive', true);

console.log('\n--- D148 [CONTRACT]: the bare-verb imperative dead-end is not traded away');
for (const [label, reply, at] of [
  ['Restore', 'restore', 'archive'], ['Restore', 'restore it', 'archive'], ['Restore', 'please restore', 'archive'],
  ['Unarchive', 'unarchive', 'archive'], ['Reactivate', 'reactivate', 'archive'], ['Activate', 'activate', 'archive'],
  ['RESTORE', 'RESTORE', 'archive'], ['  Restore  ', '  Restore  ', 'archive'], ['Restore Activate', 'Restore Activate', 'archive'],
  ['Archive', 'archive', 'restore'], ['Delete', 'delete it', 'restore'], ['Remove', 'please remove', 'restore'], ['End', 'end', 'restore'],
]) matchCase('CONTRACT', 'D148.bareVerbLabelDeadEnds', { actionType: at, label, id: 'c1' }, reply, true);

console.log('\n--- D150/D138 [CONTRACT]: a real NAME that merely CONTAINS a verb stays selectable');
for (const [label, at] of [
  ['Restore Hardware Ltd', 'archive'], ['Bring Back Coffee Co', 'archive'], ['Activate Media Group', 'archive'],
  ['Restored Furniture Co', 'archive'], ['Reactivated Metals LLC', 'archive'], ['Unarchive Solutions LLC', 'archive'],
  ['West End Trading Co', 'restore'], ['End Zone Inc', 'restore'], ['Archive Media Group', 'restore'],
  ['Delete Key Software', 'restore'], ['The Archive Co', 'restore'], ['Front End Systems LLC', 'restore'],
  ['Remove Rust Inc', 'restore'], ['Deep End Ventures', 'restore'],
]) for (const reply of [label, 'yes, ' + label, label + ' (option 1)']) {
  matchCase('CONTRACT', 'D150.realNameStaysSelectable', { actionType: at, label, id: 'c1' }, reply, false);
}

console.log('\n--- fail-closed [CONTRACT]: an option with no usable actionType never enters the gate');
for (const opt of [{ label: 'Restore', id: 'c1' }, { actionType: null, label: 'Restore', id: 'c1' }, { actionType: 'assign', label: 'Restore', id: 'c1' }, { actionType: '__proto__', label: 'Restore', id: 'c1' }]) {
  matchCase('CONTRACT', 'FC.unknownActionTypeNotContradicted', opt, 'restore', false,
    'the gate is skipped; the SEPARATE field resolver is what must refuse — see issue5_confirmation_action_type_binding');
}

console.log('\n--- D158c [RESIDUAL]: the unification also imports -ed/-ing and "bring back", so a BARE participial NAME now dead-ends');
for (const [label, at] of [
  ['Restored', 'archive'], ['Restoring', 'archive'], ['Reactivated', 'archive'], ['Bring Back', 'archive'],
  ['Archived', 'restore'], ['Deleting', 'restore'], ['Ended', 'restore'], ['Removed', 'restore'],
]) matchCase('RESIDUAL', 'D158c.bareParticipialNameDeadEnds', { actionType: at, label, id: 'c1' }, label, true,
  'SELECTED at 4476c92 and b32e0e4. Fail-closed, so not a security defect — but undisclosed, and the ' +
  'D148 comment still in the file ("those word-boundary base forms never match the -ed/-ing forms in a ' +
  'real NAME") is now false. Pinned at current behaviour.');

console.log('\n--- D154 [RESIDUAL]: an OUT-OF-lexicon opposite verb as a bare name still arms the destructive field');
for (const label of ['Revive', 'Reopen', 'Undelete']) {
  matchCase('RESIDUAL', 'D154.outOfLexiconName', { actionType: 'archive', label, id: 'c1' }, label.toLowerCase(), false,
    'identical at every SHA measured; the D136 ambiguity dead-end refactor is the real answer, not a longer blocklist');
}

// =====================================================================================
// Prior closures — re-derived, not trusted.
// =====================================================================================
console.log('\n--- prior closures [CONTRACT]: the belt');
for (const [id, s, want] of [
  ['D112.nounList', 'The archived list has 3 entries.', false],
  ['D112.cardinal', 'There are 3 archived companies.', false],
  ['D112.negation', 'The company is not archived.', false],
  ['D118.laterNegator', 'Confirmed — Archived ACME. No further action needed.', true],
  ['D131.without', 'ACME was archived without incident.', true],
  ['D125.andErrors', 'ACME was archived and no errors occurred.', true],
  ['D128.saltPepper', 'No company named Salt and Pepper Co was archived.', false],
  ['D130.closedLoop', 'Closed Loop Systems was not archived.', false],
  ['D130.archivedMedia', 'Archived Media Group was not deleted.', false],
  ['D130.mixed', 'ACME is archived but was not deleted.', false],
  ['D134.confirmedNegated', 'Confirmed — as requested, the company was not archived.', false],
  ['D134.confirmedPositive', 'Confirmed — as requested, Restored Bob Smith.', true],
  ['D137.stateNotEvent', 'test3 is archived. Should I restore it?', false],
  ['D139.completed', 'The goal was completed.', true],
  ['D139.emDashName', 'No entity named Ulaanbaatar — Central Ltd was archived.', false],
  ['D139.hyphenName', 'Coca-Cola Mongolia LLC was not archived.', false],
  ['D146.commaList', 'No company, no employee and no task was archived.', false],
  ['D151.nobody', 'Nobody was assigned to that task.', false],
  ['D151.neither', 'Neither company was archived.', false],
  ['D151.nor', 'Neither ACME nor Beta Corp was deleted.', false],
  ['D151.hardly', 'Hardly anything was updated.', false],
  ['D151.few', 'Few records were removed.', false],
  ['BUG002.approvalFabrication', 'The approval has been approved.', true],
  ['fab.successfully', 'ACME archived successfully.', true],
  ['hedge.may', 'It may have been archived.', false],
  ['hedge.might', 'It might have been deleted.', false],
  ['decline.honest', "I can't actually do that from chat.", false],
  ['question.clarify', 'Which company do you mean?', false],
  ['future.promise', 'I will archive ACME once you confirm.', false],
  ['D153.droppedLinker', 'No issues, ACME was archived.', true],
]) beltCase('CONTRACT', 'prior.' + id, s, want);

console.log('\n--- prior closures [CONTRACT]: the matcher');
matchCase('CONTRACT', 'D127.activateIsContradiction', { actionType: 'archive', label: 'ACME Corp', id: 'c1' }, 'activate ACME Corp', true);
matchCase('CONTRACT', 'D136.oppositeVerbOutsideName', { actionType: 'archive', label: 'ACME Corp', id: 'c1' }, 'restore ACME Corp', true);
matchCase('CONTRACT', 'D142.bareLabelEmptiesCommand', { actionType: 'archive', label: 'Restore', id: 'c1' }, 'restore', true);
matchCase('CONTRACT', 'D142.caseInsensitiveBareLabel', { actionType: 'archive', label: 'ReStore', id: 'c1' }, 'ReStore', true);

console.log('\n--- [RESIDUAL] pre-existing belt gaps, pinned at current behaviour (identical at b32e0e4 / 54ebecc / 4476c92)');
for (const [id, s, cur, note] of [
  ['D156b.subjectNP', 'That ACME was archived cannot be confirmed.', true,
    'the completion clause is the grammatical SUBJECT of the matrix predicate; needs parsing, not a lexical belt'],
  ['D159.renamedArrowArmUnreachable', 'Renamed: ACME -> Beta Corp', false,
    'LEGACY_PAST_COMPLETION ships an arm `\\brenamed:\\s*.+(→|->)`, but readsAsCompletion splits clauses on `:\\s` FIRST, ' +
    'so the arm can never fire on the natural rendering. "Renamed:ACME -> Beta Corp" (no space) DOES fire. ' +
    'Pre-existing at every SHA measured — a DECORATIVE guard, not a regression here.'],
  ['D128r.bareParticipleTrailingNegator', 'Archived ACME – no undo available.', false,
    'a bare participle with no auxiliary is not a COMPLETION_VERB, so the negator disarms the clause; pre-existing at every SHA'],
  ['D128r.bareParticipleParen', 'Archived ACME (no undo available).', false, 'same shape'],
]) beltCase('RESIDUAL', id, s, cur, note);

// =====================================================================================
// Source invariants [CONTRACT]
// =====================================================================================
console.log('\n--- source invariants [CONTRACT]');
{
  // 1. No regexp modifier group in any actual regex — only in the comment that explains why.
  const nonComment = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  t('CONTRACT', 'noModifierGroupShipped ((?-i: / (?i: absent from every non-comment line)',
    /\(\?-?i:/.test(nonComment), false,
    'a modifier group is unverified in the Deno Edge runtime; a bad one fails at module load and takes the function down');
  t('CONTRACT', 'modifierGroupMentionedOnlyInAComment', (src.match(/\(\?-?i:/g) || []).length, 1);

  // 2. The D155 arm is INLINE (no new const) — run15..run18 assemble the belt from a named-const
  //    list and would silently drop a new one.
  const beltDecls = (beltSrc.match(/^\s*const\s+([A-Z][A-Z0-9_]*)\s*=/gm) || []).map((x) => x.trim().split(/\s+/)[1]);
  t('CONTRACT', 'beltConstSetUnchanged=' + beltDecls.join(','), beltDecls.join(','),
    'LEGACY_PAST_COMPLETION,PROGRESS_VERBS,EXECUTION_IN_PROGRESS,CONFIRMED_COMPLETION,NEGATED_CLAUSE,REFERENCELESS_CONFIRMATION,COMPLETION_PARTICIPLE,COMPLETION_VERB,NEGATION_AUX',
    'a NEW named const here is silently dropped by run15/16/17/18, which assemble the belt from this list');

  // 3. The D155 arm really is case-sensitive.
  const arm = src.match(/\/\(\?:\^\|\\b\[Cc\]onfirmed[^\n]*?\/(i?)\.test\(c\)/);
  t('CONTRACT', 'D155ArmIsCaseSensitive', arm ? arm[1] : 'ARM-NOT-FOUND', '',
    'the object test is (?:[A-Z]|<entity nouns>); an /i flag makes [A-Z] mean [A-Za-z] and reopens D155');

  // 4. The first-person arm is GONE from LEGACY_PAST_COMPLETION.
  t('CONTRACT', 'firstPersonArmRemovedFromLegacy', /LEGACY_PAST_COMPLETION = [^\n]*\(\?:i\|we\)/.test(src), false);

  // 5. The imperative test reuses the shared lexicons (D157).
  t('CONTRACT', 'D157imperativeTestUsesSharedLexicons',
    /ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN\)\.test\(command\)/.test(contradictedSrc), true);

  // 6. The question belt is byte-identical to d34af15/b32e0e4/54ebecc/4476c92.
  const q = src.match(/const safeQuestionFragment[\s\S]*?\n        \};/);
  t('CONTRACT', 'questionBeltByteIdentical', q ? createHash('sha256').update(q[0]).digest('hex').slice(0, 16) : 'NOT-FOUND',
    '1e3d374db34fa084', 'measured identical at b32e0e4, 54ebecc, 4476c92 and this candidate');
}

// =====================================================================================
console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
const byKind = (k) => failures.filter((f) => f.startsWith('[' + k + ']')).length;
console.log('  [CONTRACT] failures: ' + byKind('CONTRACT') + '   [DEFECT] reproductions: ' + byKind('DEFECT') + '   [RESIDUAL] moves: ' + byKind('RESIDUAL'));
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
}
