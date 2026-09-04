// RUN16 DEFECT CLOSURE CONTRACT — verifier #16's cases (campaign #76), promoted with
// FIXED expectations after all of them were closed. Base was 0a03127 / closure 52e830f
// (index.ts sha256 0c3616b4…12fc26); every case below passes on the fixed source. Original
// file under qa/verification/proposed/v16_regression_additions.mjs.
//
// WHAT CLOSED THEM:
//   D123  the NEGATED_MENTION word list is GONE. matchDisambiguationOption binds only a
//         CLEAN SELECTION: once the chosen label is removed, every remaining word must be
//         selection filler; anything else dead-ends to the LLM path. Applied on all three
//         paths (single match, specificity, raw tie-break).
//   D124  entity types resolve through CANONICAL_TYPE_ALIAS (employee -> person, ...);
//         canonicalKnowsIt is decided by the canonical read itself (canonicalById /
//         lastKnownLabel), never by comparing two fallback strings.
//   D125  clause boundaries now include dashes (except the "Confirmed —" lead), colon,
//         parentheses, newline and and/but/without.
//   D126  run15 drives the real pipeline for the drop (D126.* there); this file's D126
//         cases are committed.
//
// Closure edits, marked "Closure edit (run16)" inline: the extraction guard no longer
// requires the retired NEGATED_MENTION / clauses literals; D123.hold.negatorInAnotherClause
// is inverted (fail closed); two cases observe the clean-selection rule on the D106 and
// D102 paths (the v16 mutation proof needs them).
//
// V16 REGRESSION ADDITIONS — verifier #16, campaign #76, base 0a03127 / closure 52e830f
// (index.ts sha256 0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26,
// asserted before the run, after every temporary source edit, and at the end).
//
// Same two-kind convention as run10..run15, and the SAME exit guard: ANY failure exits
// nonzero. No kind-based carve-out.
//
//   CONTRACT — a property that HOLDS on 52e830f but that NO committed suite observes.
//              Each corresponds to a SURVIVING mutant in my own 20-mutant battery
//              (qa/verification/scratch/v16_mutations.mjs + v16_mutations2.mjs), or to a
//              property I could only find by driving the REAL full gating pipeline
//              (label loop + the D119 DROP + the D95 numbering) rather than the single
//              -label helper the run15 suite uses.
//   DEFECT   — a real escape demonstrated on 52e830f. Expected = the FIXED behaviour, so
//              these FAIL on 52e830f BY DESIGN and the suite exits 1 until they are
//              closed. That is this file working as intended.
//
// WHAT THIS CAMPAIGN FOUND:
//   * D123 (P1) — D116 is closed only for the six replies the #75 ledger recorded. The
//     guard is a WORD LIST tested per CLAUSE, so exclusion survives two ways: an
//     exclusion word not on the list ("exclude acme", "cancel acme", "besides acme"),
//     and a negator in an ADJACENT clause ("acme? no, the holdings one"). 24 of my 48
//     exclusion replies still bind the option the founder excluded and arm the
//     destructive field with no LLM in the loop. Note the punctuation inversion:
//     "acme - no" dead-ends but "acme, no" BINDS, because the comma creates the clause
//     boundary that hides the negator.
//   * D124 (P1) — the D119 drop never fires for any model-authored entityType outside
//     the 22-key TYPED_FALLBACK map, because canonicalKnowsIt compares derivedLabel to
//     `TYPED_FALLBACK[et] || 'the record'` while displayName derives `the <et>` for ANY
//     word-shaped type. 'employee' is the sharp case: it IS in
//     CLARIFICATION_ENTITY_ACTION_FIELD (executable -> endEmploymentPersonIds) and
//     canonicalById is keyed 'person|', so REAL, named, in-context people render as
//     "the employee (option 1)" / "(option 2)" and the founder is asked to choose whose
//     employment to end with no name shown. PRE-EXISTING at d724d8c, not introduced by
//     this candidate — but not covered by D119's stated guarantee either.
//   * D125 (P2) — four fabrications that d724d8c CAUGHT now escape the completion belt,
//     because D118 extended negation to LEGACY_PAST_COMPLETION and EXECUTION_IN_PROGRESS
//     (which previously had none) while the clause splitter knows only [.!?,;]. Em dash,
//     en dash, colon, parentheses, newline and "and" are not boundaries.
//   * D126 (TEST GAP) — the run15 suite's D119/D120 cases never execute the drop (their
//     renderLabel helper is the per-option label loop only), and NO committed suite
//     observes the MIXED drop case: weakening the drop to "only when EVERY option is
//     unresolvable" passes the entire battery.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC
  || resolve(HERE, '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts'); // Closure edit (run16): promoted one directory up
const src = readFileSync(SRC, 'utf8');

// ---- extraction (independent of the run15 harness) ----------------------------------
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
  .replace(/\)\s*:\s*PendingActionOption\s*\|\s*null\s*\{/g, ') {')
  .replace(/:\s*PendingActionOption\[\]/g, '')
  .replace(/:\s*PendingActionOption\b/g, '')
  .replace(/:\s*Record<string,\s*string>/g, '')
  .replace(/\(raw:\s*unknown\)/g, '(raw)')
  .replace(/\(s:\s*unknown\)/g, '(s)')
  .replace(/\(resourceType:\s*string,\s*id:\s*string\)/g, '(resourceType, id)')
  .replace(/\)\s*:\s*string\s*\|\s*null\s*=>/g, ') =>')
  .replace(/\)\s*:\s*string\s*=>/g, ') =>')
  .replace(/const unresolvableOptionIndexes:\s*number\[\]/g, 'const unresolvableOptionIndexes')
  .replace(/\(_:\s*unknown,\s*oi:\s*number\)/g, '(_, oi)')
  .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, pp) => '= (' + pp.replace(/:\s*[^,)]+/g, '') + ') =>')
  .replace(/\(([A-Za-z_$][\w$]*)\s*:\s*[^,)]+\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b(?=\s*[,)])/g, '');

// Refuse to report on a slice that is not the product.
// Closure edit (run16): NEGATED_MENTION and the clause split were RETIRED by the D123 fix;
// the guard pins the clean-selection rule instead.
for (const lit of ['const SELECTION_FILLER =', 'const cleanSelection =', 'if (matches.length === 1 && !cleanSelection(matches[0])) return null;',
  'if (matches.length === 1) return matches[0];']) {
  if (!src.includes(lit)) throw new Error('matcher literal missing from index.ts: ' + lit);
}
const matchOption = new Function(stripTS(balanced(src, 'function matchDisambiguationOption'))
  + '\nreturn matchDisambiguationOption;')();

const beltSlice = stripTS([
  stmt(src, 'const LEGACY_PAST_COMPLETION ='), stmt(src, 'const PROGRESS_VERBS ='),
  balanced(src, 'const EXECUTION_IN_PROGRESS = new RegExp(', '(', ')') + ';',
  stmt(src, 'const CONFIRMED_COMPLETION ='), stmt(src, 'const NEGATED_CLAUSE ='), stmt(src, 'const COMPLETION_PARTICIPLE ='), stmt(src, 'const COMPLETION_VERB ='), stmt(src, 'const NEGATION_AUX ='), stmt(src, 'const completionIsNegated ='), // Closure edit (run18/D130)
  stmt(src, 'const REFERENCELESS_CONFIRMATION ='), stmt(src, 'const readsAsCompletion ='),
  'return readsAsCompletion;'].join('\n'));
if (!/completionIsNegated\(/.test(beltSlice.split('const readsAsCompletion =')[1] || '')) {
  throw new Error('readsAsCompletion no longer decides negation via completionIsNegated — refusing to report');
}
const readsAsCompletion = new Function(beltSlice)();

// The REAL full gating pipeline: label loop + the D119 DROP + the D95 numbering.
const gateStart = src.indexOf('const unresolvableOptionIndexes');
if (gateStart < 0) throw new Error('the D119 drop is absent from index.ts — refusing to report');
const numLoop = src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)', src.indexOf('const labelKey =', gateStart));
let d = 0, gateEnd = -1;
for (let j = src.indexOf('{', numLoop); j < src.length; j++) {
  if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { gateEnd = j + 1; break; } }
}
const gateBlock = src.slice(gateStart, gateEnd);
for (const lit of ['unresolvableOptionIndexes.push(oi)', 'paObj.options = paObj.options.filter']) {
  if (!gateBlock.includes(lit)) throw new Error('D119 literal missing from the gate slice: ' + lit);
}
const gateFactory = new Function('__canonical', '__runtime', '__companyNames', stripTS(`
  const DEBUG_RESOURCE_IDS = false;
  const canonicalById = __canonical;
  const runtimeLabels = __runtime;
  const companyNameById = __companyNames;
  const taskTitleById = new Map(); const personNameById = new Map(); const goalTitleById = new Map();
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
    return { options: paObj.options, pendingActionGatingChanged };
  };
`));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const gate = (options, canonical = new Map(), runtime = new Map(), companyNames = new Map()) =>
  gateFactory(canonical, runtime, companyNames)({ options: JSON.parse(JSON.stringify(options)) }).options;
const labels = (...a) => gate(...a).map((o) => o.label);
const canon = (pairs) => new Map(pairs.map(([t, id, name]) => [`${t}|${id}`, { name }]));
const bind = (reply, options) => { const r = matchOption(reply, options); return r ? r.id : null; };

const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D123 (P1) — DEFECT. A reply that EXCLUDES an option still binds it, two ways.
// The bind arms the destructive field with no LLM in the loop: index.ts disambiguation
// branch -> commandContradictsActionType is false (an exclusion carries no OPPOSITE-family
// verb) -> resolveClarificationField('company','archive') -> archiveCompanyIds.
// =====================================================================================
const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const HOLD = [opt('c1', 'Acme'), opt('c2', 'Acme Holdings')];

// (a) exclusion words that are not on the NEGATED_MENTION list
for (const reply of ['exclude acme', 'excludes acme', 'everything besides acme', 'aside from acme',
  'apart from acme', 'avoid acme', 'omit acme', 'ignore acme', 'all of them minus acme',
  'cancel acme', 'forget acme', 'hold off on acme', 'unless acme', 'nope acme', 'nah acme']) {
  C(`D123.unlistedNegator.${JSON.stringify(reply)}`, 'DEFECT',
    `D123 (P1): ${JSON.stringify(reply)} EXCLUDES Acme and must not bind it`,
    () => bind(reply, TWO) !== 'c1');
}
// (b) the negator sits in an ADJACENT clause — the clause split hides it
for (const reply of ['no. acme', 'not that one, acme', 'acme? no', 'acme, no',
  'stop, acme', 'wrong one, acme']) {
  C(`D123.crossClauseNegator.${JSON.stringify(reply)}`, 'DEFECT',
    `D123 (P1): ${JSON.stringify(reply)} EXCLUDES Acme across a clause boundary and must not bind it`,
    () => bind(reply, TWO) !== 'c1');
}
C('D123.founderSelfCorrection', 'DEFECT',
  'D123 (P1): "acme? no, the holdings one" is the founder correcting themselves — it must not archive Acme',
  () => bind('acme? no, the holdings one', HOLD) !== 'c1');
// Closure edit (run16): the clean-selection rule must hold on the specificity (D106) and
// raw tie-break (D102) paths too, not only on the single-match path.
C('D123.exclusionOnSpecificityPath', 'CONTRACT',
  'run16/D123: an exclusion around the LONGER of two overlapping labels dead-ends on the specificity path',
  () => bind('exclude acme holdings', HOLD) === null && bind('acme holdings? no', HOLD) === null);
C('D123.exclusionOnTieBreakPath', 'CONTRACT',
  'run16/D123: an exclusion around a presentation-tied pair dead-ends on the raw tie-break path',
  () => bind("exclude bob's co", [opt('apos', "Bob's Co"), opt('plain', 'Bobs Co')]) === null
     && bind("bob's co", [opt('apos', "Bob's Co"), opt('plain', 'Bobs Co')]) === 'apos');
C('D123.punctuationInversion', 'DEFECT',
  'D123 (P1): "acme - no" dead-ends but "acme, no" binds — the same reply, two outcomes, decided by a comma',
  () => bind('acme, no', TWO) === bind('acme - no', TWO));

// The D116 closure that DID hold — pinned so it cannot regress while D123 is fixed.
for (const [reply, opts] of [['dont archive acme', TWO], ['not acme, the other one', HOLD],
  ['anything except acme holdings', [opt('c1', 'Acme Holdings'), opt('c2', 'Beta')]],
  ['no, not beta', TWO], ['everything but acme', TWO]]) {
  C(`D116.hold.${JSON.stringify(reply)}`, 'CONTRACT',
    `D116 stays closed for the reply the #75 ledger recorded: ${JSON.stringify(reply)}`,
    () => bind(reply, opts) === null);
}
C('D123.hold.legitimateRepliesStillBind', 'CONTRACT',
  'fixing D123 must not over-refuse: real names containing negator words still bind',
  () => ['no limits inc', 'not just bagels', 'except studios', 'nothing bundt cakes',
    'never say never llc', 'nothing but net', 'keep it simple co', 'none the wiser ltd',
    'without a trace inc'].every((n) =>
    bind(n, [opt('c1', n.replace(/\b\w/g, (m) => m.toUpperCase())), opt('c2', 'Beta Corp')]) === 'c1'));
// Closure edit (run16): this CONTRACT pinned the benign direction of clause scoping. The
// D123 remedy inverts the rule — a deterministic bind requires a CLEAN SELECTION (label +
// selection filler); ANY other word dead-ends to the LLM path. So an unrelated negator in
// another clause now dead-ends, deliberately (fail closed), and that is what is pinned.
C('D123.hold.negatorInAnotherClauseDeadEnds', 'CONTRACT',
  'run16/D123: an unrelated negator in another clause dead-ends (fail closed); the LLM path resolves it',
  () => ['acme, no rush', 'acme, nothing else', 'acme. no problem'].every((r) => bind(r, TWO) === null));
C('D123.hold.selectionFillerStillBinds', 'CONTRACT',
  'run16/D123 LIMIT: selection filler around a name still binds',
  () => ['yes, archive acme please', 'the acme one', 'acme, that one', 'ok acme'].every((r) => bind(r, TWO) === 'c1'));

// =====================================================================================
// D124 (P1) — DEFECT. The D119 drop never fires for an entityType outside TYPED_FALLBACK,
// because canonicalKnowsIt and displayName compute DIFFERENT typed fallbacks.
// =====================================================================================
for (const et of ['subsidiary', 'branch', 'unit', 'client', 'vendor', 'invoice', 'organization']) {
  C(`D124.unlistedEntityTypeNotDropped.${et}`, 'DEFECT',
    `D124 (P1): an unresolvable option with entityType='${et}' must be DROPPED like every other unresolvable option`,
    () => gate([opt(A, 'Terminated Bob Smith', et)]).length === 0);
}
C('D124.employeeNotDropped', 'DEFECT',
  "D124 (P1): entityType='employee' is EXECUTABLE (endEmploymentPersonIds) yet never dropped — canonicalById is keyed 'person|', so it is unresolvable by construction",
  () => gate([opt(A, 'Bob Smith', 'employee')]).length === 0);
C('D124.employeeNameDestroyed', 'DEFECT',
  "D124 (P1): with entityType='employee', two REAL named in-context people render as \"the employee (option 1/2)\" — the founder chooses whose employment to end with no name shown",
  () => {
    const out = labels([opt(A, 'Bob Smith', 'employee'), opt(B, 'Jane Doe', 'employee')],
      new Map([['person|' + A, { full_name: 'Bob Smith' }], ['person|' + B, { full_name: 'Jane Doe' }]]));
    return out[0] === 'Bob Smith' && out[1] === 'Jane Doe';
  });
C('D124.hold.listedTypesStillDropped', 'CONTRACT',
  'D119 keeps working for every entityType that IS in TYPED_FALLBACK',
  () => ['company', 'person', 'task', 'goal', 'approval', 'channel', 'document', 'lead', 'work_order']
    .every((et) => gate([opt(A, 'Terminated Bob Smith', et)]).length === 0));

// =====================================================================================
// D125 (P2) — DEFECT. Fabrications d724d8c CAUGHT that this candidate does not: the
// clause splitter knows only [.!?,;], so a same-clause negator disarms the arms D118
// newly extended negation to.
// =====================================================================================
for (const s of ['The company has been archived – no undo available.',
  'The company has been archived (no undo available).',
  'The company has been archived without incident.',
  'ACME was archived and no errors occurred.']) {
  C(`D125.newFalseNegative.${JSON.stringify(s.slice(0, 34))}`, 'DEFECT',
    `D125 (P2): d724d8c caught this fabrication and this candidate does not — ${JSON.stringify(s)}`,
    () => readsAsCompletion(s) === true);
}
C('D125.hold.truthfulNegativesStillSurvive', 'CONTRACT',
  'fixing D125 must NOT re-destroy the truthful negatives D118 rescued (#4905)',
  () => ['No company was archived.', 'Bob Smith was not reassigned.', 'Nothing was deleted.',
    'None of the tasks were completed.', 'That company was never archived.',
    'No tasks were assigned to Bob.', 'Nothing was archived. Would you like me to?']
    .every((s) => readsAsCompletion(s) === false));
C('D125.hold.d117LaterClauseStillCaught', 'CONTRACT',
  'D117 stays closed: boilerplate in a LATER clause no longer disarms the belt',
  () => ['Confirmed — Archived ACME. No further action needed.',
    'Confirmed — Deleted ACME, nothing else was changed.',
    'Confirmed — Restored Bob Smith. No changes to his tasks.',
    'Confirmed — Archived ACME; no other changes.'].every((s) => readsAsCompletion(s) === true));

// =====================================================================================
// D126 (TEST GAP) — CONTRACT. The MIXED drop case is unobserved by every committed suite:
// weakening the drop to "only when EVERY option is unresolvable" passes the whole battery.
// These observe the drop through the REAL pipeline, which the run15 D119/D120 cases do not.
// =====================================================================================
C('D126.mixedDropObserved', 'CONTRACT',
  'D119 MIXED case: an unresolvable option is dropped even when a resolvable one remains',
  () => {
    const out = labels([opt(A, 'Now removing ACME.'), opt(B, 'Beta Corp')], canon([['company', B, 'Beta Corp']]));
    return out.length === 1 && out[0] === 'Beta Corp';
  });
C('D126.allUnresolvableDropObserved', 'CONTRACT',
  'D119: when nothing is left the option list is EMPTY, so the next turn cannot bind',
  () => gate([opt(A, 'Terminated Bob Smith'), opt(B, 'ACME Holdings.')]).length === 0
     && bind('acme holdings', []) === null);
C('D126.resolvableOptionsAreNeverDropped', 'CONTRACT',
  'the D119 drop must not become over-broad: canonically-known options always survive',
  () => labels([opt(A, 'Terminated Bob Smith'), opt(B, 'whatever')],
    canon([['company', A, 'ACME Holdings'], ['company', B, 'Beta Corp']])).join('|') === 'ACME Holdings|Beta Corp');
C('D126.freshCreateLabelStillResolves', 'CONTRACT',
  'run8/D67: a row created THIS turn resolves via runtimeLabels and is NOT dropped',
  () => labels([opt(A, 'anything')], new Map(), new Map([['company|' + A, 'Fresh Co']])).join('') === 'Fresh Co');

// =====================================================================================
let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok;
  try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(58) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun16_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #76 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
