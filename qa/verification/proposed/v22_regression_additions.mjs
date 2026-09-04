// =====================================================================================
// VERIFIER #22 (campaign #82) — regression additions for the run21 closure
// (`0969852` / `be8d9ca`, index.ts sha256
//  272de3a43cbfa685e144376b52c07cb30fa63d72615390ce529dca0b841bfbd2).
//
// CONVENTION (same as run8..run21 / v13..v21):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding. If one of
//                these ever goes red, a later change broke something this campaign proved.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap the implementing session DISCLOSED and deliberately deferred,
//                pinned at its CURRENT behaviour so a later change that moves it is seen.
// ANY failure exits nonzero. A green run on this candidate would mean this file is not
// doing its job.
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor
// written for this campaign. No reimplementation — a reimplementation cannot catch a
// product defect (the vacuous-test class this ledger has recorded repeatedly). It does not
// import qa/scenarios-runner/_gate_extract.mjs, run21_defect_closure_contract.mjs or
// v21_*.mjs: all three are artefacts under test.
//
// Source resolution: SEM_INDEX_SRC, else `../../../supabase/functions/sem-ai-command/
// index.ts` relative to this file (its home in qa/verification/proposed/), else
// `../../supabase/...` (its home after promotion into qa/scenarios-runner/).
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.SEM_INDEX_SRC,
  resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),
  resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
].filter(Boolean);
const SRC_PATH = CANDIDATES.find((p) => existsSync(p));
if (!SRC_PATH) throw new Error('v22: index.ts not found — tried ' + CANDIDATES.join(', '));
const src = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---- extractor (mine) ----------------------------------------------------------------
function stripTS(s) {
  s = s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  s = s.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => `function ${n}(${p.replace(/:\s*[^,)]+/g, '')}) {`);
  s = s.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g, (_m, n, p) => `function ${n}(${p.replace(/:\s*[^,)]+/g, '')}) {`);
  s = s.replace(/\(([^)]*)\)\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*=>/g, (_m, p) => `(${p.replace(/:\s*[^,)]+/g, '')}) =>`);
  s = s.replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
    (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>');
  s = s.replace(/([\w$])!\./g, '$1.');
  if (/\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$]/.test(s)) {
    throw new Error('v22: a TypeScript annotation survived stripping — refusing to report on a slice that is not the product');
  }
  return s;
}
function between(a, b, includeEnd = true) {
  const i = src.indexOf(a); if (i < 0) throw new Error('v22 extractor: not found: ' + a);
  const j = src.indexOf(b, i); if (j < 0) throw new Error('v22 extractor: not found: ' + b);
  return src.slice(i, includeEnd ? j + b.length : j);
}
function braced(marker) {
  const i = src.indexOf(marker); if (i < 0) throw new Error('v22 extractor: not found: ' + marker);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('v22 extractor: unbalanced braces at ' + marker);
}
function line(marker) {
  const i = src.indexOf(marker); if (i < 0) throw new Error('v22 extractor: not found: ' + marker);
  return src.slice(i, src.indexOf('\n', i));
}

// the drift belt, as shipped
const beltSlice = between('        const LEGACY_PAST_COMPLETION', '        const legacyProseFallback', false);
for (const lit of ['const readsAsCompletion', 'const completionIsNegated', 'const NEGATED_CLAUSE',
  'const COMPLETION_VERB', 'const NEGATION_AUX', 'completionIsNegated(']) {
  if (!beltSlice.includes(lit)) throw new Error('v22: belt literal missing after extraction: ' + lit);
}
const { readsAsCompletion } = new Function(stripTS('const verifiedClaims = [];\n' + beltSlice + '\nreturn { readsAsCompletion };'))();

// the disambiguation resolution branch, as shipped — reported as the FIELD it arms
const decideSrc = [
  braced('const CLARIFICATION_ENTITY_ACTION_FIELD'),
  braced('function resolveClarificationField'),
  between('const ARCHIVE_VERB_PATTERN', 'const RESTORE_VERB_PATTERN', false),
  between('const RESTORE_VERB_PATTERN', 'function commandContradictsActionType', false),
  braced('function commandContradictsActionType'),
  braced('function matchDisambiguationOption'),
].join('\n');
for (const lit of ['if (matches.length === 1) return matches[0];', 'const SELECTION_FILLER', 'const cleanSelection']) {
  if (!decideSrc.includes(lit)) throw new Error('v22: matcher literal missing after extraction: ' + lit);
}
const branch = between('          const commandForContradiction = matchedOption',
  'resolveClarificationField(matchedOption.entityType, matchedOption.actionType) : undefined;');
if (!/const contradicted = !!matchedOption/.test(branch)) throw new Error('v22: contradiction statement missing after extraction');
const decide = new Function(stripTS(decideSrc + `
return function decide(command, options) {
  const matchedOption = matchDisambiguationOption(command, options);
${branch}
  return (matchedOption && !contradicted && field) ? field + ':' + matchedOption.id : null;
};`))();

// the option-label renderer, as shipped
const labelSrc = [
  between('        const PAST_COMPLETION_CLAIM_PATTERN', ';\n', true),
  between('        const UUID_IN_TEXT', ';\n', true),
  between('        const safeProseFragment', '        const safeQuestionFragment', false),
  between('        const COMPLETION_WORD', ';\n', true),
  between('        const safeOptionLabel', '        const safePendingSummary', false),
].join('\n');
const { safeOptionLabel } = new Function(stripTS(labelSrc + '\nreturn { safeOptionLabel };'))();

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
const arch = (label) => [opt('a', label), opt('b', 'Beta Corp')];
const rest = (label) => [opt('a', label, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];
const bind = (kind, name, reply, options, expected, why) => {
  let got; try { got = decide(reply, options); } catch (e) { got = 'THROW:' + (e && e.constructor ? e.constructor.name : '?'); }
  check(kind, name, got === expected, `reply=${JSON.stringify(reply)} armed=${got} expected=${expected}${why ? ' :: ' + why : ''}`);
};

// =====================================================================================
// D148 (P1) — CLOSED on this candidate. Every natural phrasing of an opposite COMMAND
// against a company literally NAMED that verb must dead-end to the LLM, not arm the
// opposite (destructive) field. 34 of these 41 arm archiveCompanyIds at b32e0e4.
// =====================================================================================
console.log('\n--- D148 [CONTRACT]: an opposite-intent COMMAND must never arm the opposite field');
for (const reply of ['restore', 'restore it', 'restore it.', 'restore.', 'restore!', 'Restore It',
  'please restore', 'please restore it', 'please restore it.', 'restore it please',
  'yes, restore it', 'yes restore it', 'ok, restore it', 'okay restore it', 'sure, restore it',
  'restore that one', 'restore this one', 'restore them', 'go ahead and restore it', 'go ahead, restore',
  'restore it now', 'just restore', 'can you restore it', 'could you please restore it?',
  'i want to restore it', 'restore it instead', 'actually, restore it', 'no, restore it',
  'restore, please', 'RESTORE IT', 'restore it back', 'restore the company', "let's restore it",
  'restore it asap', 'yeah restore', 'restore — now', 'confirm restore', 'do it, restore it',
  'restore it and confirm', 'proceed to restore', 'restore this record']) {
  bind('CONTRACT', 'D148.archivePending.oppositeCommand.' + JSON.stringify(reply), reply, arch('Restore'), null,
    'a RESTORE command against a pending ARCHIVE on a company named "Restore" — binding it ARCHIVES on the opposite intent');
}
for (const [label, reply] of [['Unarchive', 'unarchive it'], ['Unarchive', 'please unarchive'],
  ['Reactivate', 'reactivate it'], ['Reactivate', 'yes, reactivate'], ['Activate', 'activate it']]) {
  bind('CONTRACT', 'D148.archivePending.otherBaseForms.' + JSON.stringify(reply), reply, arch(label), null, null);
}
for (const [label, reply] of [['Archive', 'archive it'], ['Archive', 'please archive it'],
  ['Delete', 'delete it'], ['Delete', 'yes, delete it'], ['Remove', 'remove it'],
  ['Remove', 'go ahead and remove it'], ['End', 'end it'], ['End', 'please end it']]) {
  bind('CONTRACT', 'D148.restorePending.oppositeCommand.' + JSON.stringify(reply), reply, rest(label), null, null);
}

// =====================================================================================
// D150 (P2, NEW IN THIS CANDIDATE) — D148's imperative test runs on the RAW command,
// which still CONTAINS the matched option's own label, and it is not gated on the label
// being a bare verb. So a real entity name carrying a BASE-form lifecycle verb is now
// UNSELECTABLE BY ITS OWN NAME. All of these SELECT at b32e0e4 and at 54ebecc(run20).
// The option is still RENDERED (safeOptionLabel accepts every one of these names), so the
// founder sees the option, types its exact name, and gets a dead end. This is D138's class
// — "a real name that merely CONTAINS a verb stays selectable" — reopened for base forms.
// =====================================================================================
console.log('\n--- D150 [DEFECT]: a real NAME carrying a BASE-form verb must stay selectable');
for (const [label, reply] of [['Restore Hardware Ltd', 'restore hardware ltd'],
  ['Restore Hardware Ltd', 'yes, restore hardware ltd'], ['Restore Point Systems', 'restore point systems'],
  ['Activate Media Group', 'activate media group'], ['Reactivate Wellness Inc', 'reactivate wellness inc']]) {
  bind('DEFECT', 'D150.archivePending.baseFormName.' + JSON.stringify(reply), reply, arch(label), 'archiveCompanyIds:a',
    'the founder typed the option\'s exact name to SELECT it for the PENDING action; dead-ending it is D138 reopened');
}
for (const [label, reply] of [['West End Trading Co', 'west end trading co'],
  ['High End Motors', 'high end motors'], ['Book End Cafe', 'book end cafe'],
  ['Front End Systems LLC', 'front end systems llc'], ['Archive Media Group', 'archive media group'],
  ['Delete Key Software', 'delete key software'], ['Remove Rust Inc', 'remove rust inc'],
  ['The Archive Co', 'the archive co'], ['End Zone Inc', 'end zone inc']]) {
  bind('DEFECT', 'D150.restorePending.baseFormName.' + JSON.stringify(reply), reply, rest(label), 'restoreCompanyIds:a', null);
}
console.log('\n--- D150 [CONTRACT]: those same names ARE rendered as their own option label');
for (const n of ['Restore Hardware Ltd', 'West End Trading Co', 'End Zone Inc', 'Archive Media Group',
  'Delete Key Software', 'Remove Rust Inc', 'High End Motors', 'Activate Media Group']) {
  check('CONTRACT', 'D150.labelIsRendered.' + JSON.stringify(n), safeOptionLabel(n) === n,
    `safeOptionLabel=${JSON.stringify(safeOptionLabel(n))} — the option IS shown to the founder, which is what makes the dead end user-visible`);
}

// =====================================================================================
// D138 / D136 — must stay closed while D150 is fixed.
// =====================================================================================
console.log('\n--- D138 [CONTRACT]: a participial real name stays selectable, an opposite verb outside it does not');
for (const [label, reply] of [['Restored Furniture Co', 'restored furniture co'],
  ['Restored Furniture Co', 'yes, restored furniture co'], ['Restored Furniture Co', 'archive restored furniture co'],
  ['Unarchived Records Ltd', 'unarchived records ltd'], ['Reactivated Metals LLC', 'reactivated metals llc'],
  ['Activated Carbon Co', 'activated carbon co']]) {
  bind('CONTRACT', 'D138.participialSelectable.' + JSON.stringify(reply), reply, arch(label), 'archiveCompanyIds:a', null);
}
for (const [label, reply] of [['Archived Media Group', 'archived media group'],
  ['Deleted Files Inc', 'deleted files inc'], ['Removed Goods Ltd', 'removed goods ltd'],
  ['Ended Ventures', 'ended ventures']]) {
  bind('CONTRACT', 'D138.participialSelectable.restorePending.' + JSON.stringify(reply), reply, rest(label), 'restoreCompanyIds:a', null);
}
for (const [label, reply] of [['Restored Furniture Co', 'restore restored furniture co'],
  ['ACME Holdings', 'restore acme holdings'], ['Deleted Files Inc', 'remove deleted files inc']]) {
  bind('CONTRACT', 'D138.oppositeVerbOutsideNameDeadEnds.' + JSON.stringify(reply), reply,
    label === 'Deleted Files Inc' ? rest(label) : arch(label), null, null);
}

// =====================================================================================
// issue #5 class B — fail closed on an absent/unknown actionType; no `|| 'archive'`.
// =====================================================================================
console.log('\n--- issue #5 class B [CONTRACT]: an absent/unknown actionType must refuse');
bind('CONTRACT', 'issue5.absentActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company' }], null, null);
bind('CONTRACT', 'issue5.nullActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: null }], null, null);
bind('CONTRACT', 'issue5.assignActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: 'assign' }], null, null);
bind('CONTRACT', 'D132.prototypeActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: '__proto__' }], null, null);
bind('CONTRACT', 'D132.prototypeEntityType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'constructor', actionType: 'archive' }], null, null);
{
  const fieldLine = line('const field = matchedOption && !contradicted');
  check('CONTRACT', 'sourceInvariant.disambiguationFieldHasNoDestructiveDefault',
    /resolveClarificationField\(matchedOption\.entityType,\s*matchedOption\.actionType\)/.test(fieldLine)
    && !/\|\|\s*['"]archive['"]/.test(fieldLine), fieldLine.trim());
  const clarLine = line('const field = resolveClarificationField(pendingAction.entityType');
  check('CONTRACT', 'sourceInvariant.clarificationFieldHasNoDestructiveDefault',
    !/\|\|\s*['"]archive['"]/.test(clarLine), clarLine.trim());
  const contraLine = between('          const contradicted = !!matchedOption', ';\n', true);
  check('CONTRACT', 'sourceInvariant.contradictionEvaluatedOnlyForAKnownActionType',
    /matchedOption\.actionType === 'restore' \|\| matchedOption\.actionType === 'archive'/.test(contraLine),
    contraLine.replace(/\s+/g, ' ').trim());
}

// =====================================================================================
// D139 — the zero-relativizer truthful negative, one per canonical completion word.
// 24/24 destroyed at b32e0e4; 0/24 here.
// =====================================================================================
console.log('\n--- D139 [CONTRACT]: "There is no record <Name> was archived." on every completion word');
for (const n of ['Archived Media Group', 'Deleted Scenes Studio', 'Updated Interiors LLC',
  'Created Space Design', 'Restored Furniture Co', 'Activated Carbon Co', 'Deactivated Devices Ltd',
  'Assigned Risk Partners', 'Reassigned Logistics Inc', 'Approved Auto Parts', 'Rejected Goods Traders',
  'Declined Cards Ltd', 'Removed Wallpaper Co', 'Completed Works Studio', 'Renamed Brands Agency',
  'Ended Ventures', 'Closed Loop Systems', 'Cleared Path Consulting', 'Sent Mail Solutions',
  'Moved Mountains Co', 'Granted Wishes Foundation', 'Added Value Partners', 'Confirmed Logistics Co',
  'Unarchived Records Ltd']) {
  belt('CONTRACT', 'D139.zeroRelativizer.' + JSON.stringify(n), `There is no record ${n} was archived.`, false, null);
}
console.log('\n--- D139 [CONTRACT]: name-internal coordinators, em-dash place names, hyphenated names');
for (const n of ['Salt and Pepper Co', 'Ben and Jerry Holdings', 'Black and Decker Mongolia',
  'Bed Bath and Beyond', 'Barnes and Noble', 'Nothing But Nets', 'Doctors Without Borders',
  'Ulaanbaatar — Songino Khairkhan', 'Sainshand — Zamyn-Uud Logistics', 'Zamyn-Uud Trading']) {
  belt('CONTRACT', 'D139.nameSafe.' + JSON.stringify(n), `There is no record ${n} was archived.`, false, null);
}

// =====================================================================================
// D146 — the linker narrowing. Truthful side CLOSED; the retained arms still fire.
// =====================================================================================
console.log('\n--- D146 [CONTRACT]: a coordinated noun phrase / temporal modifier is not a clause linker');
for (const t of ['There is no record or log ACME was archived.',
  'There is no ticket or request Beta Corp was deleted.',
  'I see no note or entry Gamma Ltd was restored.',
  'There is no such company so ACME was archived is not something I can confirm.',
  'There is no evidence yet ACME was archived.',
  'There is no record because ACME was archived under a different name.',
  'There is no record since March ACME was archived.',
  'There is no entry while ACME was archived last quarter.',
  'There is no entry before ACME was archived last quarter.',
  'There is no entry after ACME was archived last quarter.',
  'No log or ticket shows ACME was archived.',
  'No manager or admin says Beta Corp was deleted.']) {
  belt('CONTRACT', 'D146.truthfulNegativeSurvives.' + JSON.stringify(t.slice(0, 44)), t, false, null);
}
console.log('\n--- D146 [CONTRACT]: the RETAINED linkers must still catch a genuinely linked fabrication');
for (const t of ['There were no problems and Beta Corp was deleted.',
  'There were no blockers but ACME was archived.',
  'There were no problems although ACME was archived.',
  'There was no delay though ACME was archived.',
  'There was no failure however ACME was archived.',
  'There is no backlog therefore ACME was archived.']) {
  belt('CONTRACT', 'D146.linkedFabricationCaught.' + JSON.stringify(t.slice(0, 44)), t, true, null);
}

// =====================================================================================
// D153 (P3, NEW IN THIS CANDIDATE) — the price of the D146 narrowing, undisclosed. Each of
// these is a genuinely clause-linked fabrication in exactly the aux-preceded shape where
// the RETAINED linkers do fire; all eight are CAUGHT at b32e0e4 and at 54ebecc(run20) and
// MISSED here. The closure records "collateral … == the b32e0e4 baseline, no coverage
// regression"; measured on a corpus that contains the dropped terms, there is one.
// =====================================================================================
console.log('\n--- D153 [DEFECT]: a fabrication linked by a DROPPED linker must still be caught');
for (const t of ['There were no blockers so ACME was archived.',
  'There was no objection because ACME was archived.',
  'There was no objection since ACME was archived.',
  'There was no activity while ACME was archived.',
  'There was no activity before ACME was archived.',
  'There was no activity after ACME was archived.',
  'There was no approval yet ACME was archived.',
  'There was no error or ACME was archived.']) {
  belt('DEFECT', 'D153.droppedLinkerFabricationMissed.' + JSON.stringify(t.slice(0, 44)), t, true,
    'caught at b32e0e4 and 54ebecc, missed here — the D146 narrowing\'s undisclosed cost');
}

// =====================================================================================
// D151 (P2) — D141's revert. The truthful negatives it existed for are destroyed again.
// A safe close EXISTS and is mutation-proven in v22_mutation_proof.mjs: re-add the lexicon
// AND drop completionIsNegated's clause-initial free pass (`!NEGATION_AUX.test(...)`), which
// is the hole D147 actually complained about. Measured: truthful destroyed 11 -> 1 of 101,
// fabrications missed 32 -> 27 of 61, 0 CONTRACT failures in run8..run21 (run15's pin and
// run21's [RESIDUAL] pins need updating in the same commit — that is the D149 rule).
// =====================================================================================
console.log('\n--- D151 [DEFECT]: the D141 truthful negatives must not be destroyed');
for (const t of ['Nobody was archived.', 'Nobody was removed from the company.',
  'Neither company was archived.', 'Neither ACME nor Beta Corp was deleted.',
  'Nowhere in the audit log was ACME archived.', 'ACME was not archived, nor was Beta Corp deleted.',
  'Few records were deleted.', 'Hardly any records were deleted.',
  'Nobody was assigned to that task.', 'Hardly any goals were completed.']) {
  belt('DEFECT', 'D151.excludedNegatorTruthfulNegative.' + JSON.stringify(t.slice(0, 40)), t, false,
    'a TRUE answer; firing here replaces it with "I can\'t actually do that from chat", which is itself false');
}
console.log('\n--- D147 [CONTRACT]: those same words must not disarm a real fabrication when re-added');
for (const t of ['Nobody objected and ACME was archived.', 'Neither of us hesitated and ACME was archived.',
  'Few issues remained and ACME was archived.', 'Hardly any work was left and ACME was archived.']) {
  belt('CONTRACT', 'D147.clauseLinkedFabricationStillCaught.' + JSON.stringify(t.slice(0, 44)), t, true, null);
}
console.log('\n--- D147b [DEFECT]: the clause-INITIAL free pass leaks with the CURRENT lexicon too');
for (const t of ['No errors occurred and ACME was archived.',
  'No approvals were pending but Beta Corp was deleted.',
  'No approvals are pending although ACME was archived.',
  'Nothing failed however ACME was archived.']) {
  belt('DEFECT', 'D147b.clauseInitialNegatorFreePass.' + JSON.stringify(t.slice(0, 44)), t, true,
    'missed at EVERY SHA — D147 is not caused by D141\'s words, it is caused by completionIsNegated\'s third disjunct');
}

// =====================================================================================
// D152 (P3) — D144's active-voice revert. The stated blocker is HALF true: a NEW const does
// break run15/run16/run17/run18 (they assemble a NAMED LIST of consts) — measured. But the
// arm needs no new const: added inside LEGACY_PAST_COMPLETION with a clause-position anchor
// it destroys 0/12 of D145's truthful shapes and catches 7/7 of D144's fabrications. One
// residual FP remains ("I restored order to the report layout."), which is the real reason
// to defer — not impossibility.
// =====================================================================================
console.log('\n--- D152 [DEFECT]: an active-voice completion is a completion claim');
for (const t of ['I deleted Beta Corp.', 'We archived ACME.', 'I just archived ACME.',
  'I already restored Beta Corp.', 'I successfully deleted the company.', 'I unarchived Beta Corp.',
  'ACME is archived, and I also deleted Beta Corp.']) {
  belt('DEFECT', 'D152.activeVoiceCompletionUncaught.' + JSON.stringify(t.slice(0, 40)), t, true,
    'reverted with run21; an assertion-position-constrained arm is mutation-proven in v22_mutation_proof.mjs');
}
console.log('\n--- D145 [CONTRACT]: the truthful shapes run20\'s arm destroyed must stay alive');
for (const t of ['You asked whether I archived ACME. I did not.',
  'Are you asking whether I deleted Beta Corp?',
  'I can check whether they archived it, if you want.',
  'The founder asked if we archived ACME.',
  'If I archived it by mistake, tell me and I will restore it.',
  'It is unclear whether we archived it or someone else did.',
  'They restored order after the outage last month.',
  'I restored order to the report layout.',
  'Should I restore it?', 'ACME is archived. Should I restore it?',
  'Do you want me to delete Beta Corp?', 'Which one should I archive?']) {
  belt('CONTRACT', 'D145.truthfulSurvives.' + JSON.stringify(t.slice(0, 44)), t, false, null);
}

// =====================================================================================
// D146b [RESIDUAL] — disclosed by the implementing session, pinned at current behaviour.
// =====================================================================================
console.log('\n--- D146b [RESIDUAL]: a comma-separated noun list orphans the completion from its negator');
for (const t of ['There is no record, log or ticket showing ACME was deleted.',
  'There is no record, log or ticket that ACME was deleted.',
  'I found no email, memo or note saying ACME was archived.']) {
  belt('RESIDUAL', 'D146b.commaListUnderNegator.' + JSON.stringify(t.slice(0, 44)), t, true,
    'DISCLOSED and deferred by run21; pinned at current behaviour so a later change that moves it is seen');
}
belt('CONTRACT', 'D146b.limit.withoutTheCommaItSurvives', 'There is no record or log showing ACME was deleted.', false, null);

// =====================================================================================
// D149 (P2) — CLOSED. run15's product pin matches again, so its 57 assertions run.
// =====================================================================================
console.log('\n--- D149 [CONTRACT]: run15\'s NEGATED_CLAUSE pin still matches the product');
{
  const run15Path = [resolve(HERE, '../../scenarios-runner/run15_defect_closure_contract.mjs'),
    resolve(HERE, './run15_defect_closure_contract.mjs')].find((p) => existsSync(p));
  const run15 = run15Path ? readFileSync(run15Path, 'utf8') : null;
  const pin = run15 ? (run15.match(/"(\(\?:not\|[^"]*)"/) || [])[1] : null;
  const negatedClause = line('const NEGATED_CLAUSE');
  check('CONTRACT', 'D149.run15PinMatchesTheProduct', !!pin && negatedClause.includes(pin),
    `run15 pins ${JSON.stringify(pin)}; NEGATED_CLAUSE is ${negatedClause.trim()}`);
}

// =====================================================================================
// Prior closures — not reopened (re-derived independently, not copied from run21).
// =====================================================================================
console.log('\n--- prior closures [CONTRACT]');
belt('CONTRACT', 'D112.nounPhraseCompletionSurvives', 'The archived list has 3 archived companies.', false, null);
belt('CONTRACT', 'D112.negationSurvives', 'The company is not archived.', false, null);
belt('CONTRACT', 'D118.leadingNegatorSurvives', 'No company named ACME was archived.', false, null);
belt('CONTRACT', 'D125.trailingNegatorIsAQualifier', 'ACME was archived and no errors occurred.', true, null);
belt('CONTRACT', 'D125.parentheticalNegatorIsAQualifier', 'ACME was archived (no undo available).', true, null);
belt('CONTRACT', 'D125.dashQualifier', 'ACME was archived — no undo available.', true, null);
belt('CONTRACT', 'D128.nameWithCoordinatorNotSplit', 'No company named Salt and Pepper Co was archived.', false, null);
belt('CONTRACT', 'D130.nameWordBeforeNegatorIsNotTheVerb', 'Closed Loop Systems was not archived.', false, null);
belt('CONTRACT', 'D131.withoutIsNotANegator', 'ACME was archived without incident.', true, null);
belt('CONTRACT', 'D134.confirmedNegationIsClauseScoped', 'Confirmed — as requested, the company was not archived.', false, null);
belt('CONTRACT', 'D134.confirmedLaterClauseStillCaught', 'Confirmed — as requested, Restored Bob Smith.', true, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives', 'test3 is archived. Should I restore it?', false, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives2', 'ACME is archived but was not deleted.', false, null);
belt('CONTRACT', 'D137.progressiveStillCaught', 'ACME Holding is being archived right now.', true, null);
belt('CONTRACT', 'D103c.referencelessConfirmationCaught', 'Confirmed — the company (option 1).', true, null);
belt('CONTRACT', 'FILLER.noProblemDoesNotShield', 'Nothing failed: ACME was archived.', true, null);
belt('CONTRACT', 'FILLER.noWorriesDoesNotShield', 'No worries. ACME was archived.', true, null);
bind('CONTRACT', 'D116.negatedMentionDeadEnds', "don't archive acme holdings", arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.exclusionDeadEnds', 'not acme holdings, the other one', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.excludeVerbDeadEnds', 'exclude acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.adjacentClauseNegatorDeadEnds', 'acme holdings, no', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D127.activateIsADifferentIntent', 'activate acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D127.differentTargetDeadEnds', 'archive acme holdings tasks', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D129.bareDigitAfterANameDeadEnds', 'acme holdings 2', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D129.ownNumberIsACleanSelection', 'acme holdings (option 1)', arch('ACME Holdings'), 'archiveCompanyIds:a', null);
bind('CONTRACT', 'D133.ordinalSelectsByNumber', 'option 2', arch('ACME Holdings'), 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.wordOrdinalSelects', 'the second one', arch('ACME Holdings'), 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.ordinalOutOfRangeBindsNothing', 'option 9', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D135.noIsNotOrdinalFiller', 'no option 2', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D136.ordinalAmbiguousWithARealNameDeadEnds', 'option 2', arch('Option 2 Ltd'), null, null);
bind('CONTRACT', 'D106.longestWinsNotSubstring', 'smiths bakery', [opt('a', 'Smith'), opt('b', "Smith's Bakery")], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D106.multiMentionDeadEnds', 'archive acme, leave acme holdings alone', [opt('a', 'ACME'), opt('b', 'ACME Holdings')], null, null);

// =====================================================================================
// Pre-existing, re-derived, unchanged by this candidate — recorded so it is not lost.
// =====================================================================================
console.log('\n--- safeOptionLabel [RESIDUAL]: 20 of 24 real completion-word names cannot be rendered');
{
  const NAMES = ['Archived Media Group', 'Deleted Scenes Studio', 'Updated Interiors LLC',
    'Created Space Design', 'Activated Carbon Co', 'Deactivated Devices Ltd', 'Assigned Risk Partners',
    'Reassigned Logistics Inc', 'Approved Auto Parts', 'Rejected Goods Traders', 'Declined Cards Ltd',
    'Removed Wallpaper Co', 'Renamed Brands Agency', 'Ended Ventures', 'Cleared Path Consulting',
    'Sent Mail Solutions', 'Moved Mountains Co', 'Granted Wishes Foundation', 'Added Value Partners',
    'Confirmed Logistics Co'];
  const suppressed = NAMES.filter((n) => safeOptionLabel(n) === null);
  check('RESIDUAL', 'safeOptionLabel.realNamesSuppressed', suppressed.length === NAMES.length,
    `${suppressed.length}/${NAMES.length} suppressed — identical at b32e0e4 and 54ebecc, PRE-EXISTING (the caller falls back to the derived canonical name); recorded by #80 and #81 and still not addressed`);
  for (const n of ['Restored Furniture Co', 'Completed Works Studio', 'Closed Loop Systems', 'Unarchived Records Ltd']) {
    check('CONTRACT', 'safeOptionLabel.adjectivalLeadSurvives.' + JSON.stringify(n), safeOptionLabel(n) === n, String(safeOptionLabel(n)));
  }
  for (const t of ['ACME deleted', 'Deleted ACME', 'The approval was approved', 'ACME Deleted Everything',
    'Granted Full Access', 'Done: ACME deleted']) {
    check('CONTRACT', 'safeOptionLabel.assertionShapedLabelRefused.' + JSON.stringify(t), safeOptionLabel(t) === null, String(safeOptionLabel(t)));
  }
}

// =====================================================================================
const contractFailures = failures.filter((f) => f.startsWith('[CONTRACT]'));
const defectFailures = failures.filter((f) => f.startsWith('[DEFECT]'));
const residualFailures = failures.filter((f) => f.startsWith('[RESIDUAL]'));
console.log(`\nv22_regression_additions: ${pass} pass, ${failures.length} fail`
  + ` (${defectFailures.length} DEFECT reproductions = open defects, ${residualFailures.length} RESIDUAL moves,`
  + ` ${contractFailures.length} CONTRACT failures = guards that do not hold as claimed)`);
if (failures.length) {
  console.log('\nFAILURES (DEFECT entries are expected to fail on this candidate — that is the point):');
  for (const f of failures) console.log('  - ' + f);
}
console.log(`\nsource: ${SRC_PATH}`);
process.exit(failures.length ? 1 : 0);
