// RUN17 DEFECT CLOSURE CONTRACT — verifier #17's cases (campaign #77), promoted with
// FIXED expectations after all of them were closed. Base was 9535f0b / closure f232975
// (index.ts sha256 e5ccf63b…b6d69); every case below passes on the fixed source. Original
// file under qa/verification/proposed/v17_regression_additions.mjs.
//
// WHAT CLOSED THEM:
//   D128  the splitter is back to sentence punctuation, the comma and the newline; negation
//         is decided by ORDER — a negator disarms a clause only when it PRECEDES the completion
//         vocabulary (COMPLETION_VOCAB), so "No company named Salt and Pepper Co was archived"
//         survives and "archived – no undo available" is still caught.
//   D127  SELECTION_FILLER no longer carries every lifecycle verb and entity noun; the verbs
//         and nouns admitted are the winning option's own action family (ACTION_FAMILY_VERBS)
//         and entity type (ENTITY_NOUNS). RESTORE_VERB_PATTERN gains plain "activate".
//   D129  the option's OWN number in the "(option N)" / "option N" / "#N" shape is filler; a
//         bare digit and another option's number are not.
//
// Closure edits, marked "Closure edit (run17)" inline: the belt extraction grabs
// COMPLETION_VOCAB; index.ts is resolved one directory up; one LIMIT case added so the v17
// mutation proof can observe that only the winner's own number is admitted.
//
// V17 REGRESSION ADDITIONS — verifier #17, campaign #77.
// Base 9535f0b4d094570ac871c3ec85b78830324b03bc (closure commit f232975; the rotation
// commit on top is bookkeeping only — index.ts byte-identical, verified by diff).
// index.ts sha256 e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69,
// asserted before the run, after every one of 28 temporary source mutations, and at the end.
// Baseline for every comparison: 52e830f (the #76 candidate) and d724d8c.
//
// Same two-kind convention as run10..run16, and the SAME exit guard: ANY failure exits
// nonzero. No kind-based carve-out.
//
//   CONTRACT — a property that HOLDS on 9535f0b but that NO committed suite observes.
//              Each corresponds to a SURVIVING mutant in my own 28-mutant battery
//              (qa/verification/scratch/v17b_mutate.mjs + v17b_mutate2.mjs), or to a
//              property I could only find by driving the real matcher / real belt /
//              real full gating pipeline.
//   DEFECT   — a real escape demonstrated on 9535f0b. Expected = the FIXED behaviour, so
//              these FAIL on 9535f0b BY DESIGN and the suite exits 1 until they are
//              closed. That is this file working as intended.
//
// WHAT THIS CAMPAIGN FOUND:
//   * D128 (P1) — D125's widened clause splitter added and/but/without, parentheses, colon
//     and dashes as boundaries. Those are not clause boundaries when they occur inside a
//     NOUN PHRASE, so the negator is severed from the completion verb it scopes over:
//     "No company named Salt and Pepper Co was archived." splits to
//     ["No company named Salt", "Pepper Co was archived"] and the second fragment reads as
//     a completion. 97 of 130 realistic truthful negatives about entities whose real names
//     contain one of those tokens are destroyed (52e830f: 0 of 130). readsAsCompletion
//     feeds legacyProseFallback (index.ts:5583 — the whole truthful answer is replaced with
//     "I can't actually do that from chat — nothing was changed") and structuredProseDrift
//     -> rewriteFromStructure (index.ts:5466). This is the class index.ts:5362 itself
//     records as WORSE than the fabrication the belt exists to catch (run14/D112,
//     ledger #4905), recurring for the sixth consecutive drift-belt change. The candidate's
//     disclosed residual ("a negator inside one bare clause with no separator at all") does
//     not mention this direction at all.
//   * D127 (P2) — SELECTION_FILLER is described, in the index.ts comment AND in the #76
//     postscript, as "the pending action's own verbs". It is in fact a static union of ALL
//     lifecycle verbs plus ALL entity-type nouns, independent of which action is pending.
//     Two consequences, both pre-existing at 52e830f/d724d8c but now positively encoded:
//     (a) 'activate' is selection filler but is absent from RESTORE_VERB_PATTERN (which
//     knows only 'reactivate'), so "activate acme" is not a contradiction and arms
//     archiveCompanyIds — a make-active intent performing an archive; (b) the entity-type
//     nouns let a reply change the TARGET of the operation ("archive acme tasks" arms
//     archiveCompanyIds on the COMPANY).
//   * D129 (P3) — the D95 seam. The product numbers colliding options "(option 1)"/"(option
//     2)", and SELECTION_FILLER contains the words 'option' and 'number', but no digit is
//     filler — so "acme (option 1)", "option 1, acme", "acme #1" and "acme 1" all dead-end.
//     'option' and 'number' are dead weight in the allowlist as written.
//   * COVERAGE — the second-option guard inside cleanSelection survived my whole 22-suite
//     battery, and so did adding "or" to the clause splitter. Both are pinned below.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  || resolve(HERE, '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts'); // Closure edit (run17): promoted one directory up
const src = readFileSync(SRC, 'utf8');

// ---- extraction (independent of the run15/run16 harnesses) ---------------------------
function balanced(text, anchor, open = '{', close = '}') {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  let d = 0;
  for (let j = text.indexOf(open, i); j < text.length; j++) {
    if (text[j] === open) d++;
    else if (text[j] === close) { d--; if (!d) return text.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + anchor);
}
function stmt(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  let d = 0, inStr = null, inRe = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j], n = text[j + 1];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (inRe) { if (c === '\\') { j++; continue; } if (c === '[') { while (j < text.length && text[j] !== ']') { if (text[j] === '\\') j++; j++; } continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { while (j < text.length && text[j] !== '\n') j++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/') { let k = j - 1; while (k >= 0 && /\s/.test(text[k])) k--; if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(text[k])) { inRe = true; continue; } }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0) return text.slice(i, j + 1);
  }
  throw new Error('no terminator: ' + anchor);
}
const stripTS = (s) => s
  .replace(/const CLARIFICATION_ENTITY_ACTION_FIELD\s*:\s*Record<string,\s*Record<string,\s*string>>\s*=/g, 'const CLARIFICATION_ENTITY_ACTION_FIELD =')
  .replace(/function resolveClarificationField\([^)]*\)\s*:\s*string \| undefined \{/g, 'function resolveClarificationField(entityType, actionType) {')
  .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean \{/g, 'function commandContradictsActionType(command, actionType) {')
  .replace(/\)\s*:\s*PendingActionOption\s*\|\s*null\s*\{/g, ') {')
  .replace(/:\s*PendingActionOption\[\]/g, '')
  .replace(/:\s*PendingActionOption\b/g, '')
  .replace(/:\s*Record<string,\s*string>/g, '')
  .replace(/const unresolvableOptionIndexes\s*:\s*number\[\]/g, 'const unresolvableOptionIndexes')
  .replace(/\(_\s*:\s*unknown,\s*oi\s*:\s*number\)/g, '(_, oi)')
  .replace(/\(raw\s*:\s*unknown\)/g, '(raw)')
  .replace(/\(s\s*:\s*unknown\)/g, '(s)')
  .replace(/\(resourceType\s*:\s*string,\s*id\s*:\s*string\)/g, '(resourceType, id)')
  .replace(/\)\s*:\s*string\s*\|\s*null\s*=>/g, ') =>')
  .replace(/\)\s*:\s*string\s*=>/g, ') =>')
  .replace(/\(s\s*:\s*string\)\s*=>/g, '(s) =>')
  .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, pp) => '= (' + pp.replace(/:\s*[^,)]+/g, '') + ') =>')
  .replace(/\(([A-Za-z_$][\w$]*)\s*:\s*[^,)]+\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b(?=\s*[,)])/g, '');

// Refuse to report on a slice that is not the product.
for (const lit of ['const SELECTION_FILLER =', 'const cleanSelection =', 'const CANONICAL_TYPE_ALIAS',
  'const canonicalKnowsIt', 'const readsAsCompletion =', 'unresolvableOptionIndexes.push(oi)',
  'paObj.options = paObj.options.filter']) {
  if (!src.includes(lit)) throw new Error('product literal missing from index.ts: ' + lit);
}

const matchOption = new Function(stripTS(balanced(src, 'function matchDisambiguationOption'))
  + '\nreturn matchDisambiguationOption;')();

// the REAL deterministic-disambiguation decision: matcher + contradiction + field
const decide = new Function(stripTS([
  stmt(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD'),
  balanced(src, 'function resolveClarificationField'),
  stmt(src, 'const ARCHIVE_VERB_PATTERN ='),
  stmt(src, 'const RESTORE_VERB_PATTERN ='),
  balanced(src, 'function commandContradictsActionType'),
  balanced(src, 'function matchDisambiguationOption'),
].join('\n')) + `
  return function decide(command, options) {
    const matchedOption = matchDisambiguationOption(command, options);
    const contradicted = !!matchedOption && commandContradictsActionType(command, matchedOption.actionType);
    const field = matchedOption && !contradicted ? resolveClarificationField(matchedOption.entityType, matchedOption.actionType) : undefined;
    return (matchedOption && !contradicted && field) ? { armed: field, id: matchedOption.id } : { armed: null };
  };`)();

const beltSlice = stripTS([
  stmt(src, 'const LEGACY_PAST_COMPLETION ='), stmt(src, 'const PROGRESS_VERBS ='),
  balanced(src, 'const EXECUTION_IN_PROGRESS = new RegExp(', '(', ')') + ';',
  stmt(src, 'const CONFIRMED_COMPLETION ='), stmt(src, 'const NEGATED_CLAUSE ='), stmt(src, 'const COMPLETION_PARTICIPLE ='), stmt(src, 'const COMPLETION_VERB ='), stmt(src, 'const completionIsNegated ='), // Closure edit (run18/D130)
  stmt(src, 'const REFERENCELESS_CONFIRMATION ='), stmt(src, 'const readsAsCompletion ='),
  'return readsAsCompletion;'].join('\n'));
if (!/completionIsNegated\(/.test(beltSlice.split('const readsAsCompletion =')[1] || '')) {
  throw new Error('readsAsCompletion no longer decides negation via completionIsNegated — refusing to report');
}
const readsAsCompletion = new Function(beltSlice)();
// Closure edit (run17): the contradiction guard on its own, so the RESTORE_VERB_PATTERN change is observed.
const contradicts = new Function(stripTS([
  stmt(src, 'const ARCHIVE_VERB_PATTERN ='), stmt(src, 'const RESTORE_VERB_PATTERN ='),
  balanced(src, 'function commandContradictsActionType')].join('\n')) + '\nreturn commandContradictsActionType;')();

// the REAL full gating pipeline: label loop + D119 drop + D95 numbering
const gateStart = src.indexOf('const unresolvableOptionIndexes');
const numLoop = src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)', src.indexOf('const labelKey =', gateStart));
if (gateStart < 0 || numLoop < 0) throw new Error('D119 drop / D95 numbering anchors not found — update this harness, do not let it pass');
let gd = 0, gateEnd = -1;
for (let j = src.indexOf('{', numLoop); j < src.length; j++) {
  if (src[j] === '{') gd++; else if (src[j] === '}') { gd--; if (!gd) { gateEnd = j + 1; break; } }
}
const gateBlock = src.slice(gateStart, gateEnd);
const gateFactory = new Function('__canonical', '__runtime', '__names', stripTS(`
  const DEBUG_RESOURCE_IDS = false;
  const canonicalById = __canonical;
  const runtimeLabels = __runtime;
  const companyNameById = __names.company || new Map();
  const taskTitleById = __names.task || new Map();
  const personNameById = __names.person || new Map();
  const goalTitleById = __names.goal || new Map();
  ${stmt(src, 'const UUID_IN_TEXT =')}
  ${stmt(src, 'const PAST_COMPLETION_CLAIM_PATTERN =')}
  ${stmt(src, 'const COMPLETION_WORD =')}
  ${balanced(src, 'const TYPED_FALLBACK')};
  ${balanced(src, 'const lastKnownLabel =')};
  ${balanced(src, 'const safeDisplayLabel =')};
  ${balanced(src, 'const displayName =')};
  ${balanced(src, 'const safeProseFragment =')};
  ${balanced(src, 'const safeOptionLabel =')};
  return function gateOptions(paObj) {
    let pendingActionGatingChanged = false;
    ${gateBlock}
    return paObj.options;
  };
`));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const gate = (options, canonical = new Map(), runtime = new Map(), names = {}) =>
  gateFactory(canonical, runtime, names)({ options: JSON.parse(JSON.stringify(options)) });
const labels = (...a) => gate(...a).map((o) => o.label);
const canon = (pairs) => new Map(pairs.map(([t, id, name]) => [`${t}|${id}`, { name }]));
const bind = (reply, options) => { const r = matchOption(reply, options); return r ? r.id : null; };
const armed = (reply, options) => decide(reply, options).armed;

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const HOLD = [opt('c1', 'Acme'), opt('c2', 'Acme Holdings')];
const ARCH = [opt('c1', 'Acme', 'company', 'archive'), opt('c2', 'Beta Corp', 'company', 'archive')];
const PEOPLE = [opt('p1', 'Bob Smith', 'person', 'archive'), opt('p2', 'Jane Doe', 'person', 'archive')];

// =====================================================================================
// D128 (P1) — DEFECT. The widened splitter destroys truthful negatives about entities
// whose REAL names contain one of the new boundary tokens. 52e830f got every one right.
// =====================================================================================
for (const s of [
  'No company named Salt and Pepper Co was archived.',
  'Nothing named Bed Bath and Beyond was deleted.',
  'There is no company called Barnes and Noble that was archived.',
  'I did not find any record that Black and Decker Holdings was archived.',
  'No task for Smith and Sons Ltd was completed.',
  'No company called Without Borders Ltd was archived.',
  'Nothing named Home Without Walls Co was deleted.',
  'There is no company named But First Coffee that was archived.',
  'No entity (including ACME) was archived.',
  'Nothing in the 14:30 batch was archived.',
]) {
  C(`D128.truthfulNegativeDestroyed.${JSON.stringify(s.slice(0, 40))}`, 'DEFECT',
    `D128 (P1): 52e830f answered this truthfully and the candidate destroys it — ${JSON.stringify(s)}`,
    () => readsAsCompletion(s) === false);
}
C('D128.rateVsPrior', 'DEFECT',
  'D128 (P1): the false-positive rate on realistic truthful negatives whose names carry a new boundary token must return to 0',
  () => {
    const names = ['Salt and Pepper Co', 'Bed Bath and Beyond', 'Barnes and Noble', 'Smith and Sons Ltd',
      'Without Borders Ltd', 'But First Coffee', 'Ulaanbaatar — North Depot', 'ACME (Mongolia)'];
    const frames = [(n) => `No company named ${n} was archived.`, (n) => `Nothing named ${n} was deleted.`,
      (n) => `There is no company called ${n} that was archived.`];
    let fp = 0;
    for (const n of names) for (const f of frames) if (readsAsCompletion(f(n))) fp++;
    return fp === 0;
  });
C('D128.hold.newFabricationsStillCaught', 'CONTRACT',
  'D125 must not be undone while D128 is fixed: the four shapes d724d8c caught stay caught',
  () => ['The company has been archived – no undo available.',
    'The company has been archived (no undo available).',
    'The company has been archived without incident.',
    'ACME was archived and no errors occurred.'].every((s) => readsAsCompletion(s) === true));
C('D128.hold.plainTruthfulNegativesSurvive', 'CONTRACT',
  'the truthful negatives D118 rescued (#4905) still survive',
  () => ['No company was archived.', 'Bob Smith was not reassigned.', 'Nothing was deleted.',
    'None of the tasks were completed.', 'That company was never archived.',
    'No tasks were assigned to Bob.', 'Nothing was archived. Would you like me to?']
    .every((s) => readsAsCompletion(s) === false));
C('D128.hold.accidentalSurvivors', 'CONTRACT',
  'two shapes in this family survive the widened splitter only by accident (a second negator lands in the trailing fragment, or the verb is a gerund) — pinned so a "fix" that changes them is noticed',
  () => readsAsCompletion('No company named Last But Not Least Ltd was archived.') === false
     && readsAsCompletion('No record of Ulaanbaatar — North Depot being archived.') === false);
C('D128.hold.negatorAfterTheConjunctionStillWorks', 'CONTRACT',
  'the FP is directional: with the negator AFTER the conjunction the belt is still correct',
  () => ['Salt and Pepper Co was not archived.', 'Bed Bath and Beyond was not deleted.']
    .every((s) => readsAsCompletion(s) === false));
C('D128.coverage.orIsNotYetABoundary', 'CONTRACT',
  'COVERAGE (surviving mutant M28): adding "or" to the splitter is observed by NO committed suite — pinned here so the next widening is deliberate',
  () => readsAsCompletion('No company named Rock or Roll Ltd was archived.') === false);

// =====================================================================================
// D127 (P2) — DEFECT. SELECTION_FILLER is a static union of every lifecycle verb and
// entity noun, not "the pending action's own verbs" as the comment and the #76 postscript
// both state. Pre-existing at 52e830f/d724d8c, but positively encoded by this candidate.
// =====================================================================================
C('D127.activateArmsArchive', 'DEFECT',
  "D127 (P2): 'activate' is selection filler but is NOT in RESTORE_VERB_PATTERN (only 'reactivate' is), so a make-active intent arms archiveCompanyIds",
  () => armed('activate acme', ARCH) === null);
C('D127.rejectArmsDestructiveField', 'DEFECT',
  "D127 (P2): 'reject acme' is an EXCLUSION expressed entirely in selection filler and must not arm a destructive field",
  () => armed('reject acme', ARCH) === null);
C('D127.rejectArmsEndEmployment', 'DEFECT',
  "D127 (P2): 'reject bob smith' ends Bob Smith's employment — the sharpest instance of the same hole",
  () => armed('reject bob smith', PEOPLE) === null);
C('D127.entityNounTargetFlip', 'DEFECT',
  "D127 (P2): 'archive acme tasks' names the TASKS and arms archiveCompanyIds on the COMPANY",
  () => armed('archive acme tasks', ARCH) === null);
C('D127.entityNounTargetFlipPeople', 'DEFECT',
  "D127 (P2): 'archive acme employees' arms archiveCompanyIds on the COMPANY",
  () => armed('archive acme employees', ARCH) === null);
C('D127.hold.oppositeFamilyStillRefused', 'CONTRACT',
  'the D32 contradiction guard still works on the axis it does know: restore-verb vs a pending archive, and archive-verb vs a pending restore',
  () => armed('restore acme', ARCH) === null
     && armed('archive acme', [opt('c1', 'Acme', 'company', 'restore'), opt('c2', 'Beta', 'company', 'restore')]) === null);
C('D127.hold.plainSelectionStillArms', 'CONTRACT',
  'fixing D127 must not break an ordinary selection: the bare name and an affirmative frame still arm the pending field',
  () => armed('acme', ARCH) === 'archiveCompanyIds'
     && armed('yes, archive acme please', ARCH) === 'archiveCompanyIds');

// =====================================================================================
// D129 (P3) — DEFECT. The D95 seam: the product NUMBERS options "(option N)" and the
// filler set contains the words 'option' and 'number', but no digit is filler.
// The fix must be SHAPE-scoped (an "(option N)" / "option N" / "#N" tail), never "add
// digits to the allowlist" — "acme 2" must keep dead-ending.
// =====================================================================================
for (const reply of ['acme (option 1)', 'option 1, acme', 'acme option 1', 'acme #1']) {
  C(`D129.numberedReplyDeadEnds.${JSON.stringify(reply)}`, 'DEFECT',
    `D129 (P3): the product renders "(option N)" and then refuses the reply that uses it — ${JSON.stringify(reply)}`,
    () => bind(reply, TWO) === 'c1');
}
// Closure edit (run17): only the WINNER's own number is filler.
C('D129.hold.otherOptionsNumberDeadEnds', 'CONTRACT',
  'D129 LIMIT: another option\'s number is not filler — "acme (option 2)" dead-ends rather than binding Acme',
  () => bind('acme (option 2)', TWO) === null && bind('acme #2', TWO) === null);
// Closure edit (run17): under the ORDER rule the clause split is what keeps a truthful
// negative in one sentence from disarming a fabrication in the next — pinned so the split
// (and the comma boundary) stay observed.
C('D117.hold.splitStillMatters', 'CONTRACT',
  'run17/D128: a truthful negative in sentence 1 must not disarm a fabrication in sentence 2',
  () => readsAsCompletion('Nothing was archived. ACME was deleted.') === true
     && readsAsCompletion('No company was archived! The task has been completed.') === true);
C('D117.hold.commaStillMatters', 'CONTRACT',
  'run17/D128: the comma is still a clause boundary — "No company was archived, ACME was deleted." is caught',
  () => readsAsCompletion('No company was archived, ACME was deleted.') === true
     && readsAsCompletion('Confirmed — Deleted ACME, nothing else was changed.') === true);
C('D127.hold.activateIsRestoreFamily', 'CONTRACT',
  'run17/D127: plain "activate" is a restore-family verb for the contradiction guard (only "reactivate" was)',
  () => contradicts('activate acme', 'archive') === true && contradicts('reactivate acme', 'archive') === true
     && contradicts('archive acme', 'archive') === false);
C('D129.hold.bareDigitStillDeadEnds', 'CONTRACT',
  'D129 LIMIT: fixing the numbered-reply seam must not make a bare trailing digit filler — "acme 2" stays a dead end',
  () => bind('acme 2', TWO) === null && bind('acme 7 tomorrow', TWO) === null);
C('D129.hold.numberingItselfStillHappens', 'CONTRACT',
  'the D95 numbering that creates the seam is really there: two colliding typed fallbacks are numbered',
  () => labels([opt(A, 'F1'), opt(B, 'F2')], new Map([['company|' + A, {}], ['company|' + B, {}]]))
    .join('|') === 'the company (option 1)|the company (option 2)');

// =====================================================================================
// COVERAGE — the surviving mutant from my own 28-mutant battery. The second-option guard
// inside cleanSelection survived all 22 assertion-bearing suites. It is provably
// unreachable-as-true on the single-match path and exactly duplicated by the next
// statement on the specificity path; it only decides the D102 raw tie-break path, in
// 264 of 4,942,140 fuzzed (reply x option-set) combinations. Pinned so it cannot be
// removed silently — and so the next reviewer knows it is nearly, but not actually, vacuous.
// =====================================================================================
C('D123.coverage.secondOptionGuardOnTieBreakPath', 'CONTRACT',
  'cleanSelection\'s second-option guard is the only thing that dead-ends a tie-break reply that ALSO names a third, filler-named option',
  () => bind("bob's task task", [opt('a', "Bob's Task"), opt('b', 'Bobs Task'), opt('c', 'Task')]) === null);
C('D123.coverage.tieBreakStillBindsWhenClean', 'CONTRACT',
  'the same path still binds the exact raw name when the reply is clean',
  () => bind("bob's task", [opt('a', "Bob's Task"), opt('b', 'Bobs Task'), opt('c', 'Task')]) === 'a');
C('D123.coverage.strictlyTighterThanTheWordList', 'CONTRACT',
  'the clean-selection rule is strictly no LOOSER than the retired NEGATED_MENTION list: every reply that word list dead-ended still dead-ends',
  () => ['dont archive acme', 'not acme, the other one', 'anything except acme holdings',
    'no, not beta', 'everything but acme', 'leave acme alone', 'keep acme', 'skip acme',
    'instead of acme', 'rather than acme', 'other than acme', 'cannot acme']
    .every((r) => bind(r, HOLD) === null || bind(r, HOLD) === null));

// =====================================================================================
// CONTRACT — D124 properties no committed suite observes.
// =====================================================================================
C('D124.coverage.prototypeKeysFailClosed', 'CONTRACT',
  'CANONICAL_TYPE_ALIAS is a bare object literal, so a model-authored entityType can reach Object.prototype — every such type must still fail closed and be dropped',
  () => ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']
    .every((et) => gate([opt(A, 'Terminated Bob Smith', et)]).length === 0));
C('D124.coverage.idKnownUnderOriginalTypeIsDropped', 'CONTRACT',
  "an alias must not rescue an id the read knows under a DIFFERENT type: entityType 'employee' whose id is a company| row is dropped",
  () => gate([opt(A, 'Bob Smith', 'employee')], canon([['company', A, 'ACME']])).length === 0
     && gate([opt(A, 'ACME', 'organization')], new Map([['person|' + A, { full_name: 'Bob' }]])).length === 0);
C('D124.coverage.runtimeLabelUsesTheCANONICALtypeKey', 'CONTRACT',
  "lastKnownLabel is consulted with the CANONICAL type, so a runtime label stored under the alias key ('employee|') must NOT resolve, while 'person|' must",
  () => gate([opt(A, 'x', 'employee')], new Map(), new Map([['employee|' + A, 'Fresh']])).length === 0
     && gate([opt(A, 'x', 'employee')], new Map(), new Map([['person|' + A, 'Fresh']])).length === 1);
C('D124.coverage.nonStringEntityTypeDropped', 'CONTRACT',
  'a non-string / absent entityType and an empty id all fail closed',
  () => gate([{ id: A, label: 'X', entityType: 7, actionType: 'archive' }]).length === 0
     && gate([{ id: A, label: 'X', actionType: 'archive' }]).length === 0
     && gate([opt('', 'X', 'company')]).length === 0);
C('D124.coverage.fabricatedLabelNeedsTheCANONICALnameExactly', 'CONTRACT',
  'a fabricated label reaches the founder ONLY when the canonical row itself carries that exact name',
  () => labels([opt(A, 'Terminated Bob Smith')], canon([['company', A, 'Beta Corp']])).join('') === 'Beta Corp'
     && labels([opt(A, 'Terminated Bob Smith')], canon([['company', A, 'Terminated Bob Smith']])).join('') === 'Terminated Bob Smith'
     && gate([opt(A, 'Terminated Bob Smith')]).length === 0);
C('D124.coverage.mixedDropInEveryOrdering', 'CONTRACT',
  'the D119 drop removes only the unresolvable member, in every ordering',
  () => labels([opt(A, 'FAKE'), opt(B, 'Beta Corp')], canon([['company', B, 'Beta Corp']])).join('|') === 'Beta Corp'
     && labels([opt(A, 'Beta Corp'), opt(B, 'FAKE')], canon([['company', A, 'Beta Corp']])).join('|') === 'Beta Corp'
     && labels([opt(A, 'A Co'), opt(B, 'FAKE'), opt(C3, 'C Co')],
       canon([['company', A, 'A Co'], ['company', C3, 'C Co']])).join('|') === 'A Co|C Co');

// =====================================================================================
// CONTRACT — the question belt is UNTOUCHED by this candidate (scenario 7).
// =====================================================================================
C('D125.coverage.questionBeltUnchanged', 'CONTRACT',
  'the question belt constructs are byte-identical to 52e830f/d724d8c — this candidate touched only the completion belt',
  () => {
    const q = balanced(src, 'const safeQuestionFragment =');
    return q.includes('INTERROGATIVE_LEAD') && q.includes('FIRST_PERSON_MAIN_CLAUSE_COMPLETION')
      && !q.includes('SELECTION_FILLER') && !q.includes('CANONICAL_TYPE_ALIAS');
  });

// =====================================================================================
let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok;
  try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(62) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun17_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #77 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
