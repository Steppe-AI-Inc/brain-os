// =====================================================================================
// VERIFIER #23 (campaign #83) — regression additions for the run22 closure
// (`4476c92` / `82d4d77`, index.ts sha256
//  e802227b2944585fa7ff6989030c4d96b84f61ea1e778405195af157d9e449f3).
//
// CONVENTION (same as run8..run22 / v13..v22):
//   [CONTRACT] — a guarantee that HOLDS on this candidate. It must keep holding. If one of
//                these goes red, a later change broke something this campaign proved.
//   [DEFECT]   — the CORRECT behaviour for a defect this campaign FOUND. It FAILS on this
//                candidate by design; it turns green when the defect is genuinely closed.
//   [RESIDUAL] — a gap DISCLOSED and deliberately deferred, pinned at its CURRENT behaviour
//                so a later change that moves it is seen.
// ANY failure exits nonzero. A green run on THIS candidate would mean this file is not doing
// its job — D155/D156 are open here.
//
// WHAT IT DRIVES. The REAL shipped predicates, sliced out of index.ts by an extractor written
// for this campaign. No reimplementation. It imports NOTHING from qa/scenarios-runner and
// nothing from v22_*.mjs — those are artefacts under test.
//
// Source resolution: SEM_INDEX_SRC, else `../../../supabase/functions/sem-ai-command/index.ts`
// (its home in qa/verification/proposed/), else `../../supabase/...` (after promotion into
// qa/scenarios-runner/).
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
if (!SRC_PATH) throw new Error('v23: index.ts not found — tried ' + CANDIDATES.join(', '));
const src = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---- extractor (mine) ----------------------------------------------------------------
function stripTS(s) {
  s = s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  s = s.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/\(([^)]*)\)\s*:\s*[A-Za-z_$][\w$<>[\]|. ]*=>/g, (_m, p) => '(' + p.replace(/:\s*[^,)]+/g, '') + ') =>');
  s = s.replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
    (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>');
  s = s.replace(/([\w$])!\./g, '$1.');
  if (/\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$]/.test(s)) {
    throw new Error('v23: a TypeScript annotation survived stripping — refusing to report on a slice that is not the product');
  }
  return s;
}
function between(a, b, includeEnd = true) {
  const i = src.indexOf(a); if (i < 0) throw new Error('v23 extractor: not found: ' + a);
  const j = src.indexOf(b, i); if (j < 0) throw new Error('v23 extractor: not found: ' + b);
  return src.slice(i, includeEnd ? j + b.length : j);
}
function braced(marker) {
  const i = src.indexOf(marker); if (i < 0) throw new Error('v23 extractor: not found: ' + marker);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('v23 extractor: unbalanced braces at ' + marker);
}
function line(marker) {
  const i = src.indexOf(marker); if (i < 0) throw new Error('v23 extractor: not found: ' + marker);
  return src.slice(i, src.indexOf('\n', i));
}

// the drift belt, as shipped
const beltSlice = between('        const LEGACY_PAST_COMPLETION', '        const legacyProseFallback', false);
for (const lit of ['const readsAsCompletion', 'const completionIsNegated', 'const NEGATED_CLAUSE',
  'const COMPLETION_VERB', 'const NEGATION_AUX', 'const CONFIRMED_COMPLETION',
  'const EXECUTION_IN_PROGRESS', 'completionIsNegated(']) {
  if (!beltSlice.includes(lit)) throw new Error('v23: belt literal missing after extraction: ' + lit);
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
for (const lit of ['if (matches.length === 1) return matches[0];', 'const SELECTION_FILLER',
  'const cleanSelection', 'const ORDINAL_WORDS']) {
  if (!decideSrc.includes(lit)) throw new Error('v23: matcher literal missing after extraction: ' + lit);
}
const branch = between('          const commandForContradiction = matchedOption',
  'resolveClarificationField(matchedOption.entityType, matchedOption.actionType) : undefined;');
if (!/const contradicted = !!matchedOption/.test(branch)) throw new Error('v23: contradiction statement missing after extraction');
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
// D155 (P2, NEW IN THIS CANDIDATE — regression vs b32e0e4 AND vs 0969852) — the D152
// first-person active-voice arm has NO entity requirement. Its object test is `\s+\S`:
// literally "any non-space character". So every truthful first-person sentence in which the
// model describes what it did to a NON-ENTITY (its own draft, its wording, the formatting,
// a filter, an idea, the ambiguity in a question) reads as a completion claim and the whole
// reply is replaced with "I can't actually do that from chat — nothing was changed."
// (legacyProseFallback) or with re-rendered structure (structuredProseDrift, reached whenever
// rawClaims !== null — i.e. on ordinary structured read-only turns).
// The closure discloses ONE FP ("I restored order to the report layout."). It is not an idiom
// FP; it is the whole class. 24 of 24 below are destroyed here and correct at b32e0e4 AND
// 0969852. This is the D112 class in the direction index.ts itself calls the worse one.
// =====================================================================================
console.log('\n--- D155 [DEFECT]: a truthful first-person statement about a NON-ENTITY object must survive');
for (const t of ['I restored order to the report layout.',
  'We restored order after the incident.',
  'I restored the connection to the database.',
  'I removed my earlier suggestion.',
  'I removed the ambiguity from the question.',
  'I deleted my draft note before sending.',
  'I renamed the column in my example.',
  'I archived that idea for later.',
  'We reassigned priorities in the plan, not in the system.',
  'I deactivated the filter in my query.',
  'I just restored the formatting.',
  'I already removed the confusion.',
  'I have restored order to the list.',
  'I removed it from my draft, not from the database.',
  'We deleted it from the conversation, not from Brain OS.',
  'I restored my own notes.',
  'I removed the duplicate line from my answer.',
  'I renamed the heading in this summary for clarity.',
  'I removed some detail to keep this short.',
  'I archived the older wording of my reply.',
  'I deleted the extra whitespace in the table.',
  'I restored the original phrasing of your question.',
  'We removed the jargon from this explanation.',
  'I reassigned the numbering in my list.']) {
  belt('DEFECT', 'D155.nonEntityObjectDestroyed.' + JSON.stringify(t.slice(0, 46)), t, false,
    'a TRUE statement; firing replaces it with "I can\'t actually do that from chat", which is itself false. ' +
    'Correct at b32e0e4 and 0969852; destroyed here by the D152 arm\'s `\\s+\\S` object test');
}
console.log('\n--- D155 [CONTRACT]: the D144 fabrications the arm exists for must STILL be caught');
for (const t of ['I deleted Beta Corp.', 'We archived ACME.', 'I just archived ACME.',
  'I already restored Beta Corp.', 'I successfully deleted the company.', 'I unarchived Beta Corp.',
  'ACME is archived, and I also deleted Beta Corp.', 'I have deleted Beta Corp.',
  'We reassigned Bob Smith to the new task.', 'I renamed ACME to ACME Holdings.',
  'I removed Bob Smith from the company.', 'I deactivated the account.',
  'I recently archived ACME.', 'I archived ACME Holdings.', 'Confirmed — I archived ACME.']) {
  belt('CONTRACT', 'D155.d144FabricationStillCaught.' + JSON.stringify(t.slice(0, 46)), t, true, null);
}
console.log('\n--- D145 [CONTRACT]: the clause anchor genuinely works — these must stay alive');
for (const t of ['You asked whether I archived ACME. I did not.',
  'Are you asking whether I deleted Beta Corp?',
  'I can check whether they archived it, if you want.',
  'The founder asked if we archived ACME.',
  'If I archived it by mistake, tell me and I will restore it.',
  'It is unclear whether we archived it or someone else did.',
  'They restored order after the outage last month.',
  'She said I archived ACME, but that is not in the log.',
  'Whether we deleted Beta Corp is not something I can confirm.',
  'Should I restore it?', 'ACME is archived. Should I restore it?',
  'Do you want me to delete Beta Corp?', 'Which one should I archive?',
  'I did not archive ACME.', 'I have not deleted Beta Corp.', 'I deleted nothing.',
  'I renamed nothing.', 'I deleted no records.', 'I unarchived nothing at all.',
  'I never archived that company.', 'I cannot archive ACME from chat.']) {
  belt('CONTRACT', 'D145.truthfulSurvives.' + JSON.stringify(t.slice(0, 46)), t, false, null);
}

// =====================================================================================
// D156 (P3, NEW IN THIS CANDIDATE — regression vs b32e0e4, 54ebecc AND 0969852) — deleting
// completionIsNegated's clause-initial free pass (`!NEGATION_AUX.test(c.slice(0,n))`) closed
// D147b, but it also removed the only thing protecting a clause-initial negator whose
// completion verb sits in an EVIDENTIAL COMPLEMENT ("No log however SHOWS ACME was archived").
// The linker test then reads `however`/`therefore`/`though`/`and` as a clause link and the
// truthful negative is destroyed. The closure claims D151 is "measured strictly better on both
// axes"; on this shape family it is 11/12 worse, and it is disclosed nowhere.
// =====================================================================================
console.log('\n--- D156 [DEFECT]: a clause-initial negator scoping through an EVIDENTIAL verb is a truthful negative');
for (const t of ['No log however shows ACME was archived.',
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
  'No log exists and ACME was archived cannot be confirmed.',
  'No record and Beta Corp was archived is unproven.',
  'Nothing was found and ACME was archived remains unverified.',
  'No entry survived and Beta Corp was deleted is unconfirmed.']) {
  belt('DEFECT', 'D156.evidentialComplementDestroyed.' + JSON.stringify(t.slice(0, 46)), t, false,
    'correct at b32e0e4, 54ebecc AND 0969852; destroyed here by the free-pass deletion');
}
console.log('\n--- D147b [CONTRACT]: the leaks the free-pass deletion genuinely closed must stay closed');
for (const t of ['No errors occurred and ACME was archived.',
  'No approvals were pending but Beta Corp was deleted.',
  'No approvals are pending although ACME was archived.',
  'Nothing failed however ACME was archived.',
  'No issues remained and Gamma Ltd was restored.',
  'None remained therefore Beta Corp was deleted.']) {
  belt('CONTRACT', 'D147b.clauseInitialLeakClosed.' + JSON.stringify(t.slice(0, 46)), t, true, null);
}
console.log('\n--- D151 [CONTRACT]: the re-added negator lexicon must keep protecting its truthful negatives');
for (const t of ['Nobody was archived.', 'Nobody was removed from the company.',
  'Nobody was assigned to that task.', 'Nobody has been granted access.',
  'Neither company was archived.', 'Neither ACME nor Beta Corp was deleted.',
  'Neither goal was completed.', 'Nowhere in the audit log was ACME archived.',
  'Nowhere in the record was Beta Corp deleted.', 'ACME was not archived, nor was Beta Corp deleted.',
  'Few records were deleted.', 'Few tasks were completed.', 'Hardly any records were deleted.',
  'Hardly any goals were completed.', 'Hardly anything was archived last quarter.']) {
  belt('CONTRACT', 'D151.reAddedNegatorLexicon.' + JSON.stringify(t.slice(0, 46)), t, false, null);
}
console.log('\n--- D147 [CONTRACT]: those same words must not disarm a genuinely linked fabrication');
for (const t of ['Nobody objected and ACME was archived.', 'Neither of us hesitated and ACME was archived.',
  'Few issues remained and ACME was archived.', 'Hardly any work was left and ACME was archived.']) {
  belt('CONTRACT', 'D147.linkedFabricationStillCaught.' + JSON.stringify(t.slice(0, 46)), t, true, null);
}

// =====================================================================================
// D157 (P2-shaped, PRE-EXISTING at b32e0e4 and 0969852 — NOT introduced by run22, and NOT
// covered by the D150 label gate) — the D148/D150 imperative test uses a SECOND, NARROWER
// lexicon (`/\b(?:restore|unarchive|reactivate|activate)\b/i`) than the one that decides the
// label is a bare verb (`RESTORE_VERB_PATTERN`, which also carries `bring\s+(it\s+)?back` and
// `un-?archiv…`). A company literally named with a verb IN the wide lexicon but NOT in the
// narrow one is selected by its own opposite-intent command and ARMS the destructive field.
// This is D154's class ("an option named an opposite verb"), but D154 is disclosed only for
// verbs OUTSIDE the lexicon (revive/reopen/undelete); these are INSIDE it.
// =====================================================================================
console.log('\n--- D157 [DEFECT]: a bare-verb label from the WIDE lexicon must dead-end too');
bind('DEFECT', 'D157.bringBack', 'bring back', arch('Bring Back'), null,
  'a RESTORE intent on a pending ARCHIVE arms archiveCompanyIds — same shape as D148 (P1)');
bind('DEFECT', 'D157.bringItBack', 'bring it back', arch('Bring It Back'), null, null);
bind('DEFECT', 'D157.unArchiveHyphenated', 'un-archive it', arch('Un-Archive'), null, null);
console.log('\n--- D154 [RESIDUAL]: an OUT-OF-lexicon opposite verb as a name, pinned at current behaviour');
for (const [label, reply] of [['Revive', 'revive it'], ['Reopen', 'reopen it'], ['Undelete', 'undelete it']]) {
  bind('RESIDUAL', 'D154.outOfLexiconName.' + JSON.stringify(label), reply, arch(label), 'archiveCompanyIds:a',
    'DISCLOSED by the run22 closure and deferred to the D136 ambiguity-dead-end refactor; pinned so a later change is seen');
}

// =====================================================================================
// D150 (P2) — CLOSED on this candidate. Re-derived independently, both pending families.
// 13/13 correct at b32e0e4 and 54ebecc, 0/13 at 0969852, 13/13 here.
// =====================================================================================
console.log('\n--- D150 [CONTRACT]: a real NAME carrying a BASE-form verb stays selectable (archive pending)');
for (const [label, reply] of [['Restore Hardware Ltd', 'restore hardware ltd'],
  ['Restore Hardware Ltd', 'yes, restore hardware ltd'], ['Restore Hardware Ltd', 'Restore Hardware Ltd'],
  ['Restore Point Systems', 'restore point systems'], ['Restore Point Systems', 'the company restore point systems'],
  ['Activate Media Group', 'activate media group'], ['Reactivate Wellness Inc', 'reactivate wellness inc'],
  ['Unarchive Solutions LLC', 'unarchive solutions llc'], ['Bring Back Coffee Co', 'bring back coffee co'],
  ['Restore Hardware Ltd', 'restore hardware ltd (option 1)']]) {
  bind('CONTRACT', 'D150.archivePending.' + JSON.stringify(reply), reply, arch(label), 'archiveCompanyIds:a',
    'the founder typed the option\'s exact name to SELECT it for the PENDING action');
}
console.log('\n--- D150 [CONTRACT]: same, restore pending');
for (const [label, reply] of [['West End Trading Co', 'west end trading co'],
  ['West End Trading Co', 'yes, west end trading co'], ['High End Motors', 'high end motors'],
  ['Book End Cafe', 'book end cafe'], ['Front End Systems', 'front end systems'],
  ['Front End Systems LLC', 'front end systems llc'], ['End Zone Inc', 'end zone inc'],
  ['The Archive Co', 'the archive co'], ['Archive Media Group', 'archive media group'],
  ['Delete Key Software', 'delete key software'], ['Remove Rust Inc', 'remove rust inc'],
  ['Deep End Ventures', 'deep end ventures'], ['End Of Line Systems', 'end of line systems'],
  ['The Archive Co', 'the archive co (option 1)']]) {
  bind('CONTRACT', 'D150.restorePending.' + JSON.stringify(reply), reply, rest(label), 'restoreCompanyIds:a', null);
}
console.log('\n--- D150 [CONTRACT]: the label gate must not throw or arm on a NON-STRING label');
for (const bad of [null, 42, {}, []]) {
  bind('CONTRACT', 'D150.nonStringLabel.' + JSON.stringify(bad), 'restore it',
    [{ id: 'a', label: bad, entityType: 'company', actionType: 'archive' }, opt('b', 'Beta Corp')], null,
    'matchDisambiguationOption\'s ORDINAL path validates only .id, so a non-string label CAN reach the gate');
}
bind('CONTRACT', 'D150.nonStringLabel.ordinalPathNoThrow', 'option 1',
  [{ id: 'a', label: ['restore'], entityType: 'company', actionType: 'archive' }], 'archiveCompanyIds:a',
  'without `typeof matchedOption.label === "string"` this is an uncaught TypeError — the guard IS load-bearing');
console.log('\n--- D150 [CONTRACT]: a label that STRIPS to empty is still bare, however it is spelled');
for (const label of ['Restore Restore', 'Restore Activate', 'restore', '  Restore  ', 'ReStore', 'RESTORE', 'Restoring']) {
  bind('CONTRACT', 'D150.multiVerbBareLabel.' + JSON.stringify(label), 'restore it', arch(label), null, null);
}

// =====================================================================================
// D148 / D138 / D136 / issue #5 class B — must stay closed while D150 is fixed.
// =====================================================================================
console.log('\n--- D148 [CONTRACT]: an opposite-intent COMMAND on a bare-verb name must never arm');
for (const reply of ['restore', 'restore it', 'restore it.', 'restore.', 'restore!', 'Restore It',
  'please restore', 'please restore it', 'restore it please', 'yes, restore it', 'ok, restore it',
  'sure, restore it', 'restore that one', 'restore them', 'go ahead and restore it', 'restore it now',
  'just restore', 'can you restore it', 'could you please restore it?', 'i want to restore it',
  'restore it instead', 'actually, restore it', 'no, restore it', 'RESTORE IT', 'restore it back',
  "let's restore it", 'yeah restore', 'confirm restore', 'proceed to restore', 'restore this record']) {
  bind('CONTRACT', 'D148.archivePending.' + JSON.stringify(reply), reply, arch('Restore'), null, null);
}
for (const [label, reply] of [['Archive', 'archive it'], ['Delete', 'delete it'], ['Remove', 'remove it'],
  ['End', 'end it'], ['Deleting', 'delete it'], ['Archiving', 'archive it']]) {
  bind('CONTRACT', 'D148.restorePending.' + JSON.stringify(reply) + '.' + label, reply, rest(label), null, null);
}
console.log('\n--- D138 [CONTRACT]: a participial real name stays selectable; an opposite verb OUTSIDE it does not');
for (const [label, reply] of [['Restored Furniture Co', 'restored furniture co'],
  ['Unarchived Records Ltd', 'unarchived records ltd'], ['Reactivated Metals LLC', 'reactivated metals llc'],
  ['Activated Carbon Co', 'activated carbon co'], ['Restoring Hope Foundation', 'restoring hope foundation']]) {
  bind('CONTRACT', 'D138.participial.' + JSON.stringify(reply), reply, arch(label), 'archiveCompanyIds:a', null);
}
for (const [label, reply, k] of [['Restored Furniture Co', 'restore restored furniture co', 'a'],
  ['ACME Holdings', 'restore acme holdings', 'a'], ['Restore Hardware Ltd', 'unarchive restore hardware ltd', 'a'],
  ['West End Trading Co', 'delete west end trading co', 'r'], ['The Archive Co', 'delete the archive co', 'r'],
  ['End Zone Inc', 'remove end zone inc', 'r']]) {
  bind('CONTRACT', 'D138.oppositeVerbOutsideName.' + JSON.stringify(reply), reply, k === 'a' ? arch(label) : rest(label), null, null);
}
console.log('\n--- issue #5 class B [CONTRACT]: an absent/unknown actionType must refuse, never default to archive');
bind('CONTRACT', 'issue5.absentActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company' }], null, null);
bind('CONTRACT', 'issue5.nullActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: null }], null, null);
bind('CONTRACT', 'issue5.emptyActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: '' }], null, null);
bind('CONTRACT', 'issue5.assignActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: 'assign' }], null, null);
bind('CONTRACT', 'D132.prototypeActionType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: '__proto__' }], null, null);
bind('CONTRACT', 'D132.prototypeEntityType', 'acme corp', [{ id: 'a', label: 'ACME Corp', entityType: 'constructor', actionType: 'archive' }], null, null);
bind('CONTRACT', 'issue5.absentActionType.bareVerbLabel', 'restore it', [{ id: 'a', label: 'Restore', entityType: 'company' }], null, null);
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
    contraLine.replace(/\s+/g, ' ').trim().slice(0, 180));
  check('CONTRACT', 'sourceInvariant.d150LabelGateIsPresentAndTypeGuarded',
    /typeof matchedOption\.label === 'string'/.test(contraLine)
    && /\.trim\(\)\.length === 0/.test(contraLine), contraLine.replace(/\s+/g, ' ').trim().slice(0, 180));
  check('CONTRACT', 'sourceInvariant.d151FreePassIsGone',
    !/!NEGATION_AUX\.test\(c\.slice\(0, ?n\)\)/.test(beltSlice),
    'completionIsNegated must not carry the clause-initial free pass');
  check('CONTRACT', 'sourceInvariant.d151LexiconIsTheLongOne',
    /nobody\|nothing\|none\|nowhere\|neither\|nor\|few\|hardly/.test(line('const NEGATED_CLAUSE')),
    line('const NEGATED_CLAUSE').trim().slice(0, 180));
  check('CONTRACT', 'sourceInvariant.d152ArmIsInsideLegacyNotANewConst',
    /const LEGACY_PAST_COMPLETION[^\n]*\(\?:i\|we\)/.test(line('const LEGACY_PAST_COMPLETION')),
    'the active-voice arm must stay INSIDE LEGACY_PAST_COMPLETION — a new const breaks run15/16/17/18');
}

// =====================================================================================
// Prior closures — re-derived here, not copied from run22.
// =====================================================================================
console.log('\n--- prior closures [CONTRACT]');
belt('CONTRACT', 'D112.nounPhrase', 'The archived list has 3 archived companies.', false, null);
belt('CONTRACT', 'D112.negation', 'The company is not archived.', false, null);
belt('CONTRACT', 'D118.leadingNegator', 'No company named ACME was archived.', false, null);
belt('CONTRACT', 'D118.laterSentenceNegatorDoesNotDisarm', 'Confirmed — Archived ACME. No further action needed.', true, null);
belt('CONTRACT', 'D125.trailingNegatorIsAQualifier', 'ACME was archived and no errors occurred.', true, null);
belt('CONTRACT', 'D125.parenthetical', 'ACME was archived (no undo available).', true, null);
belt('CONTRACT', 'D125.dash', 'ACME was archived — no undo available.', true, null);
belt('CONTRACT', 'D128.nameWithCoordinatorNotSplit', 'No company named Salt and Pepper Co was archived.', false, null);
belt('CONTRACT', 'D130.nameWordBeforeNegatorIsNotTheVerb', 'Closed Loop Systems was not archived.', false, null);
belt('CONTRACT', 'D131.withoutIsNotANegator', 'ACME was archived without incident.', true, null);
belt('CONTRACT', 'D131.withoutInARealName', 'There is no record Doctors Without Borders was archived.', false, null);
belt('CONTRACT', 'D134.confirmedNegationIsClauseScoped', 'Confirmed — as requested, the company was not archived.', false, null);
belt('CONTRACT', 'D134.confirmedLaterClauseStillCaught', 'Confirmed — as requested, Restored Bob Smith.', true, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives', 'test3 is archived. Should I restore it?', false, null);
belt('CONTRACT', 'D137.presentTenseStateSurvives2', 'ACME is archived but was not deleted.', false, null);
belt('CONTRACT', 'D137.progressiveStillCaught', 'ACME Holding is being archived right now.', true, null);
belt('CONTRACT', 'D103c.referencelessConfirmation', 'Confirmed — the company (option 1).', true, null);
belt('CONTRACT', 'FILLER.noProblemDoesNotShield', 'Nothing failed: ACME was archived.', true, null);
belt('CONTRACT', 'FILLER.noWorriesDoesNotShield', 'No worries. ACME was archived.', true, null);
console.log('\n--- D139 [CONTRACT]: "There is no record <Name> was archived." on every completion word');
for (const n of ['Archived Media Group', 'Deleted Scenes Studio', 'Updated Interiors LLC',
  'Created Space Design', 'Restored Furniture Co', 'Activated Carbon Co', 'Deactivated Devices Ltd',
  'Assigned Risk Partners', 'Reassigned Logistics Inc', 'Approved Auto Parts', 'Rejected Goods Traders',
  'Declined Cards Ltd', 'Removed Wallpaper Co', 'Completed Works Studio', 'Renamed Brands Agency',
  'Ended Ventures', 'Closed Loop Systems', 'Cleared Path Consulting', 'Sent Mail Solutions',
  'Moved Mountains Co', 'Granted Wishes Foundation', 'Added Value Partners', 'Confirmed Logistics Co',
  'Unarchived Records Ltd', 'Salt and Pepper Co', 'Ben and Jerry Holdings', 'Nothing But Nets',
  'Zamyn-Uud Trading', 'Ulaanbaatar — Songino Khairkhan']) {
  belt('CONTRACT', 'D139.zeroRelativizer.' + JSON.stringify(n), `There is no record ${n} was archived.`, false, null);
}
console.log('\n--- D146 [CONTRACT]: a coordinated noun phrase / temporal modifier is not a clause linker');
for (const t of ['There is no record or log ACME was archived.',
  'There is no ticket or request Beta Corp was deleted.',
  'I see no note or entry Gamma Ltd was restored.',
  'There is no evidence yet ACME was archived.',
  'There is no record because ACME was archived under a different name.',
  'There is no record since March ACME was archived.',
  'There is no entry before ACME was archived last quarter.',
  'No log or ticket shows ACME was archived.',
  'No manager or admin says Beta Corp was deleted.']) {
  belt('CONTRACT', 'D146.truthfulNegativeSurvives.' + JSON.stringify(t.slice(0, 44)), t, false, null);
}
for (const t of ['There were no problems and Beta Corp was deleted.',
  'There were no blockers but ACME was archived.',
  'There were no problems although ACME was archived.',
  'There was no delay though ACME was archived.',
  'There was no failure however ACME was archived.',
  'There is no backlog therefore ACME was archived.']) {
  belt('CONTRACT', 'D146.linkedFabricationCaught.' + JSON.stringify(t.slice(0, 44)), t, true, null);
}
console.log('\n--- matcher prior closures [CONTRACT]');
bind('CONTRACT', 'D116.negatedMentionDeadEnds', "don't archive acme holdings", arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D116.exceptForm', 'anything except acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.exclusionDeadEnds', 'not acme holdings, the other one', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.excludeVerbDeadEnds', 'exclude acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.cancelVerbDeadEnds', 'cancel acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D123.adjacentClauseNegatorDeadEnds', 'acme holdings, no', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D127.activateIsADifferentIntent', 'activate acme holdings', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D127.differentTargetDeadEnds', 'archive acme holdings tasks', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D129.bareDigitAfterANameDeadEnds', 'acme holdings 2', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D129.ownNumberIsACleanSelection', 'acme holdings (option 1)', arch('ACME Holdings'), 'archiveCompanyIds:a', null);
bind('CONTRACT', 'D133.ordinalSelectsByNumber', 'option 2', arch('ACME Holdings'), 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.wordOrdinalSelects', 'the second one', arch('ACME Holdings'), 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D133.ordinalOutOfRangeBindsNothing', 'option 9', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D135.noIsNotOrdinalFiller', 'no option 2', arch('ACME Holdings'), null, null);
bind('CONTRACT', 'D136.ordinalAmbiguousWithARealName', 'option 2', arch('Option 2 Ltd'), null, null);
bind('CONTRACT', 'D106.longestWinsNotSubstring', 'smiths bakery', [opt('a', 'Smith'), opt('b', "Smith's Bakery")], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D106.multiMentionDeadEnds', 'archive acme, leave acme holdings alone', [opt('a', 'ACME'), opt('b', 'ACME Holdings')], null, null);
bind('CONTRACT', 'D102.apostropheCollision', 'bobs co', [opt('a', "Bob's Co"), opt('b', 'Bobs Co')], 'archiveCompanyIds:b', null);
bind('CONTRACT', 'D93.quotedLabelStillSelectable', 'advanced closed systems', arch('“Advanced Closed Systems”'), 'archiveCompanyIds:a', null);

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
    `${suppressed.length}/${NAMES.length} suppressed — identical at b32e0e4, 54ebecc and 0969852; PRE-EXISTING ` +
    '(the caller falls back to the derived canonical name); recorded by #80, #81 and #82 and still not addressed');
  for (const n of ['Restored Furniture Co', 'Completed Works Studio', 'Closed Loop Systems', 'Unarchived Records Ltd',
    'Restore Hardware Ltd', 'West End Trading Co', 'End Zone Inc', 'The Archive Co', 'Delete Key Software']) {
    check('CONTRACT', 'safeOptionLabel.renderedAsIs.' + JSON.stringify(n), safeOptionLabel(n) === n, String(safeOptionLabel(n)));
  }
  for (const t of ['ACME deleted', 'Deleted ACME', 'The approval was approved', 'ACME Deleted Everything',
    'Granted Full Access', 'Done: ACME deleted']) {
    check('CONTRACT', 'safeOptionLabel.assertionShapedLabelRefused.' + JSON.stringify(t), safeOptionLabel(t) === null, String(safeOptionLabel(t)));
  }
}
console.log('\n--- D153 [RESIDUAL]: the 8 dropped-linker fabrications, pinned at current behaviour');
for (const t of ['There were no blockers so ACME was archived.',
  'There was no objection because ACME was archived.',
  'There was no objection since ACME was archived.',
  'There was no activity while ACME was archived.',
  'There was no activity before ACME was archived.',
  'There was no activity after ACME was archived.',
  'There was no approval yet ACME was archived.',
  'There was no error or ACME was archived.']) {
  belt('RESIDUAL', 'D153.droppedLinkerTrade.' + JSON.stringify(t.slice(0, 44)), t, false,
    'DELIBERATE, DISCLOSED trade (D146): re-broadening the linker set would reopen D146\'s truthful side');
}
console.log('\n--- D146b [RESIDUAL]: a comma-separated noun list orphans the completion from its negator');
for (const t of ['There is no record, log or ticket showing ACME was deleted.',
  'There is no record, log or ticket that ACME was deleted.',
  'I found no email, memo or note saying ACME was archived.']) {
  belt('RESIDUAL', 'D146b.commaListUnderNegator.' + JSON.stringify(t.slice(0, 44)), t, true,
    'DISCLOSED and deferred; pinned so a later change that moves it is seen');
}
belt('CONTRACT', 'D146b.limit.withoutTheCommaItSurvives', 'There is no record or log showing ACME was deleted.', false, null);
console.log('\n--- pre-existing misses/destructions, pinned so they are not mistaken for new ones');
belt('RESIDUAL', 'preexisting.successfullyVerbGap.reassigned', 'Person reassigned successfully.', false,
  'MISSED at d34af15, b32e0e4, 54ebecc, 0969852 and here — "reassigned" is absent from the `<participle> successfully` arm of LEGACY_PAST_COMPLETION');
belt('RESIDUAL', 'preexisting.quotedPropositionSubject', 'There is no record, so ACME was archived is not something I can confirm.', true,
  'DESTROYED at every SHA measured — the comma splits the negator away from a quoted-proposition subject');

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
const contractFailures = failures.filter((f) => f.startsWith('[CONTRACT]'));
const defectFailures = failures.filter((f) => f.startsWith('[DEFECT]'));
const residualFailures = failures.filter((f) => f.startsWith('[RESIDUAL]'));
console.log(`\nv23_regression_additions: ${pass} pass, ${failures.length} fail`
  + ` (${defectFailures.length} DEFECT reproductions = open defects, ${residualFailures.length} RESIDUAL moves,`
  + ` ${contractFailures.length} CONTRACT failures = guards that do not hold as claimed)`);
if (failures.length) {
  console.log('\nFAILURES (DEFECT entries are expected to fail on this candidate — that is the point):');
  for (const f of failures) console.log('  - ' + f);
}
console.log(`\nsource: ${SRC_PATH}`);
process.exit(failures.length ? 1 : 0);
