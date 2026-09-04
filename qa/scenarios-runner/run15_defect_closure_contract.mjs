// RUN15 DEFECT CLOSURE CONTRACT — verifier #15's cases (campaign #75), promoted with
// FIXED expectations after all of them were closed. Base was d724d8c (index.ts sha256
// 1b291f37…27ef64); every case below passes on the fixed source. Original file under
// qa/verification/proposed/v15_regression_additions.mjs.
//
// WHAT CLOSED THEM (one structural change each, no new word lists):
//   D116  matchDisambiguationOption dead-ends on a NEGATED mention, clause-scoped, before
//         the single-match return. Fail closed; the negation is never interpreted.
//   D117  the whole-summary negation lookahead is GONE from CONFIRMED_COMPLETION.
//   D118  negation is decided ONCE, per clause, inside readsAsCompletion, for every arm
//         (NEGATED_CLAUSE — the D112 negator list, unchanged, now scoped).
//   D119  the absent-branch lexical fallback is GONE: an option the canonical read cannot
//         name is DROPPED. run8/D72b RETIRED on the record (ledger #75).
//   D120  closed by D119's mechanism — the label channel has no lexical gate left to slip
//         a new shape past; a label is the canonical name or nothing.
//   D121  every CONTRACT case here is now committed (this file).
//   D122  issue5_confirmation_action_type_binding.mjs executes the REAL function.
//
// Closure edits to the verifier's harness, each marked "Closure edit (run15)" inline:
// the belt-slice guard pins NEGATED_CLAUSE instead of the retired lookahead, and
// V15.absentBranchBenignLabelSurvives is replaced by its inverse (D72b retirement).
//
// V15 REGRESSION ADDITIONS — verifier #15, campaign #75, base d724d8c
// (index.ts sha256 1b291f370d285ae79844c7f363a3959d2c668ab5d368a69805b0c9a16227ef64,
// asserted before the run, after every temporary source edit, and at the end).
//
// Same two-kind convention as run10..run14, and the SAME exit guard: ANY failure exits
// nonzero. No kind-based carve-out.
//
//   CONTRACT — a property that HOLDS on d724d8c but that NO committed suite observes.
//              Every one corresponds to a SURVIVING mutant in this campaign's own
//              25-mutant battery (qa/verification/scratch/v15_mutations.mjs, 20 killed /
//              5 survived). A CONTRACT case failing means the guard's narrowness has
//              stopped being observed.
//   DEFECT   — a real escape or regression demonstrated on d724d8c. Expected = the FIXED
//              behaviour, so these FAIL on d724d8c BY DESIGN and the suite exits 1 until
//              they are closed. That is this file working as intended.
//
// WHAT THIS CAMPAIGN FOUND, and the part worth keeping:
//   * D116 (P1) is a wrong-entity DESTRUCTIVE bind, the same severity and the same
//     function as D106 — but it is NOT in the code D106 changed. matchDisambiguationOption
//     short-circuits on `matches.length === 1` BEFORE the specificity rule, the
//     residual-mention guard and the raw tie-break all run, so none of D106's machinery is
//     consulted when the reply names exactly one option. A reply that EXCLUDES that option
//     ("don't archive acme", "not acme, the other one", "anything except acme holdings")
//     therefore binds it and arms archiveCompanyIds with no LLM in the loop.
//   * D117 and D118 are RECURRENCES of failure classes this ledger already recorded, not
//     new inventions. D117 re-introduces the whole-summary negation exemption struck down
//     at KNOWN_FAILURE_MODES.md:5277 ("One truthful negation ... anywhere in the reply,
//     exempts the entire summary including a fabrication sitting next to it"). D118 is the
//     already-recorded "the regex has no negation handling at all, so `was not created`
//     matches exactly like `was created`" (:4905), left standing in the sibling arms
//     because D112 was applied to CONFIRMED_COMPLETION only — despite run13/D100's own
//     headline being "one predicate, both arms".
//   * The genuinely good news, measured not assumed: where the canonical read KNOWS the
//     entity, D113 is correct on every probe I could construct (0/18 assertions survive,
//     0/13 real names destroyed), and the question belt now STRICTLY DOMINATES both
//     predecessor builds on both axes for the first time in four campaigns.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function findRepoFile(rel) {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = resolve(d, rel);
    try { readFileSync(p); return p; } catch { d = resolve(d, '..'); }
  }
  throw new Error('could not locate ' + rel);
}
const { stripTS } = await import(new URL('file://' + findRepoFile('qa/scenarios-runner/_gate_extract.mjs')).href);
const SRC = process.env.SEM_INDEX_SRC || findRepoFile('supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

// ---- extraction helpers ------------------------------------------------------------
function balancedFrom(text, anchor, open = '{', close = '}') {
  const first = text.indexOf(anchor);
  if (first === -1) throw new Error('anchor not found (update this harness, do not let it pass): ' + anchor);
  let depth = 0, end = -1;
  for (let k = text.indexOf(open, first); k < text.length; k++) {
    if (text[k] === open) depth++;
    else if (text[k] === close) { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced ' + open + ' after ' + anchor);
  return text.slice(first, end);
}
const grab = (a, e) => {
  const i = src.indexOf(a);
  if (i === -1) throw new Error('anchor not found: ' + a);
  const j = src.indexOf(e, i);
  if (j === -1) throw new Error('terminator not found after ' + a);
  return src.slice(i, j + e.length);
};

// ---- the matcher, as shipped -------------------------------------------------------
const matcherRaw = balancedFrom(src, 'function matchDisambiguationOption(');
const matcherSlice = stripTS(matcherRaw);
for (const lit of ['const maxLen = Math.max(...matches.map(specificity));',
  'if (matches.length === 1) return matches[0];']) {
  if (!matcherSlice.includes(lit)) throw new Error('matcher literal destroyed by stripping: ' + lit);
}
const matchOption = new Function(matcherSlice + '; return matchDisambiguationOption;')();

// ---- the drift belts, as shipped ---------------------------------------------------
const beltSlice = stripTS([
  grab('const LEGACY_PAST_COMPLETION =', ';'),
  grab('const PROGRESS_VERBS =', ';'),
  balancedFrom(src, 'const EXECUTION_IN_PROGRESS = new RegExp(', '(', ')') + ';',
  grab('const CONFIRMED_COMPLETION =', ';'),
  grab('const NEGATED_CLAUSE =', ';'),
  grab('const REFERENCELESS_CONFIRMATION =', ';'),
  grab('const readsAsCompletion =', ';'),
  'return { readsAsCompletion, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, NEGATED_CLAUSE };',
].join('\n'));
// Closure edit (run15): the D112 lookahead this guard pinned was the D117 defect itself
// (whole-summary, single-arm). Negation now lives in NEGATED_CLAUSE and is applied once,
// per clause, inside readsAsCompletion. The guard pins THAT instead — the same rule as
// before: refuse to report on a slice that is not the product.
if (!beltSlice.includes("(?:not|never|no|nothing|none|without|pending|awaiting")) {
  throw new Error('the D117/D118 NEGATED_CLAUSE negator list did not survive extraction — refusing to report on a slice that is not the product');
}
if (beltSlice.includes('(?![^]*')) {
  throw new Error('a whole-summary negation lookahead is back in a belt — D117 has reopened');
}
if (!/const readsAsCompletion =[\s\S]*NEGATED_CLAUSE\.test\(/.test(beltSlice)) {
  throw new Error('readsAsCompletion no longer consults NEGATED_CLAUSE — D118 (negation on one arm only) has reopened');
}
const BELTS = new Function(beltSlice)();

// ---- the label gate (safeOptionLabel + displayName + the D113 decision), as shipped --
const labelBody = `
  const DEBUG_RESOURCE_IDS = false;
  const canonicalById = __canonicalById;
  const runtimeLabels = new Map();
  const companyNameById = new Map(); const taskTitleById = new Map();
  const personNameById = new Map(); const goalTitleById = new Map();
  ${grab('const UUID_IN_TEXT =', ';')}
  ${grab('const PAST_COMPLETION_CLAIM_PATTERN =', ';')}
  ${grab('const COMPLETION_WORD =', ';')}
  ${grab('const FUTURE_PROMISE_IN_QUESTION =', ';')}
  ${balancedFrom(src, 'const TYPED_FALLBACK')};
  ${balancedFrom(src, 'const lastKnownLabel =')};
  ${balancedFrom(src, 'const safeDisplayLabel =')};
  ${balancedFrom(src, 'const displayName =')};
  ${balancedFrom(src, 'const safeProseFragment =')};
  ${balancedFrom(src, 'const safeQuestionFragment =')};
  ${balancedFrom(src, 'const safeOptionLabel =')};
  function gateOneOption(o, oi) {
    ${src.slice(src.indexOf('const derivedLabel = typeof o.id ==='), src.indexOf('if (o.label !== beforeLabel)'))}
    return o.label;
  }
  return { gateOneOption, safeOptionLabel, safeQuestionFragment, displayName };
`;
const labelSlice = stripTS(labelBody);
for (const lit of ['const canonicalKnowsIt = !!derivedLabel',
  'const agrees = !!safeLabel && bare(safeLabel) === bare(derivedLabel);']) {
  if (!labelSlice.includes(lit)) throw new Error('D113 literal destroyed by stripping: ' + lit);
}
const buildLabels = (canonicalById) => new Function('__canonicalById', labelSlice)(canonicalById);

const ID = '11111111-1111-4111-8111-111111111111';
const renderLabel = (label, canonicalName) => buildLabels(
  canonicalName ? new Map([[`company|${ID}`, { name: canonicalName }]]) : new Map(),
).gateOneOption({ id: ID, entityType: 'company', label }, 0);
const belt = buildLabels(new Map()).safeQuestionFragment;
const bare = (s) => String(s).replace(/[“”‘’"']/g, '').trim().toLowerCase();

const O = (label, id, actionType = 'archive') => ({ label, id, entityType: 'company', actionType });
const bind = (reply, opts) => { const r = matchOption(reply, opts); return r ? r.id : null; };

// =====================================================================================
const CASES = [];
const C = (id, kind, desc, thunk) => CASES.push([id, kind, desc, thunk]);

// =====================================================================================
// D116 — DEFECT (P1). A NEGATED reply binds the option it excludes, and that option's
// actionType then arms a real destructive mutation with no LLM in the loop.
//
// Reachability, traced through the shipped source and not assumed:
//   index.ts:2572  the disambiguation branch requires no affirmative — naming an option IS
//                  the answer, so a negated reply enters here normally.
//   index.ts:423   matches.length === 1 returns immediately. None of D106's specificity
//                  rule, residual-mention guard or raw tie-break is consulted.
//   index.ts:2583  commandContradictsActionType is FALSE: "don't archive acme" contains an
//                  archive verb and no restore verb, which is not a contradiction for an
//                  actionType of "archive".
//   index.ts:2587  resolveClarificationField('company','archive') -> 'archiveCompanyIds'.
//   index.ts:2604  fields = { archiveCompanyIds: [matchedOption.id] }.
//   index.ts:3047  the contextCompanyIds provenance filter PASSES — an option that was
//                  offered to the founder is by construction a company in contextPack.
//   index.ts:3076  supabase.rpc('archive_company', ...) executes for real.
// Expected = null (dead-end and fall through to the LLM), for every one of these.
// =====================================================================================
const NEG3 = [O('Acme', 'a'), O('Acme Holdings', 'ah'), O('Beta', 'b')];
C('D116.notX_theOtherOne', 'DEFECT',
  'D116 (P1): "not acme, the other one" must not bind ACME — the founder excluded it',
  () => bind('not acme, the other one', NEG3) === null);
C('D116.anythingExcept', 'DEFECT',
  'D116 (P1): "anything except acme holdings" must not bind Acme Holdings',
  () => bind('anything except acme holdings', [O('Acme Holdings', 'ah'), O('Beta', 'b')]) === null);
C('D116.dontArchive', 'DEFECT',
  'D116 (P1): "don\'t archive acme" must not archive ACME',
  () => bind("don't archive acme", [O('Acme', 'a'), O('Beta', 'b')]) === null);
C('D116.noNotBeta', 'DEFECT',
  'D116 (P1): "no, not beta" must not bind Beta',
  () => bind('no, not beta', [O('Acme', 'a'), O('Beta', 'b')]) === null);
C('D116.everythingBut', 'DEFECT',
  'D116 (P1): "everything but acme" must not bind Acme',
  () => bind('everything but acme', [O('Acme', 'a'), O('Beta', 'b')]) === null);
C('D116.negationInTiedRawBranch', 'DEFECT',
  'D116 (P1): a negated reply must not bind through the D102 raw tie-break either',
  () => bind("not bob's co", [O("Bob's Co", 'apos'), O('Bobs Co', 'plain')]) === null);
C('D116.hold.plainNameStillBinds', 'CONTRACT',
  'D116 fix must NOT break the ordinary case: a plain naming reply still binds',
  () => bind('archive acme holdings', NEG3) === 'ah');
C('D116.hold.multiMentionStillDeadEnds', 'CONTRACT',
  'D116 fix must not disturb D106: a reply naming two options still dead-ends',
  () => bind('archive acme, leave acme holdings alone', [O('Acme', 'a'), O('Acme Holdings', 'ah')]) === null);
// Closure edit (run15) — LIMITS of the D116 guard, so it cannot be over-broadened without a
// test failing (the vacuous-guard lesson, applied to the fix that states it).
C('D116.hold.negatorInAnotherClauseStillBinds', 'CONTRACT',
  'D116 LIMIT: the negator test is CLAUSE-scoped — "acme holdings, no rush" still binds Acme Holdings',
  () => bind('acme holdings, no rush', NEG3) === 'ah');
C('D116.hold.nameContainingNegatorStillBinds', 'CONTRACT',
  'D116 LIMIT: the option\'s OWN label is removed before the negator test — a real name containing "no" cannot disarm itself',
  () => bind('no limits inc', [O('No Limits Inc', 'nl'), O('Beta', 'b')]) === 'nl');

// =====================================================================================
// D117 — DEFECT. D112's negation lookahead is `(?![^]*\b(?:not|no|nothing|...)\b)`, and
// `[^]*` scans the ENTIRE remainder of the summary. Any later sentence containing a
// negation word disarms CONFIRMED_COMPLETION completely — and with it all four arms,
// because the other three never saw a bare-participle "Confirmed — <Verb> <Object>".
//
// This is a RECURRENCE. KNOWN_FAILURE_MODES.md:5277 already struck down exactly this
// mechanism: "PAST_CLAIM_NEGATED and PAST_CLAIM_ATTRIBUTED_ELSEWHERE are whole-summary
// tests. One truthful negation ... anywhere in the reply, exempts the entire summary
// including a fabrication sitting next to it."
//
// Reachable: on an LLM turn carrying a claims array of only state/existence claims,
// rawClaims !== null so structuredProseDrift is armed, but unaccountedCompletionProse is
// false because readsAsCompletion is false. That is the run8/D58b3 laundering shape,
// reopened by appending one sentence of ordinary assistant boilerplate.
// =====================================================================================
const FN117 = [
  'Confirmed — Archived ACME. No further action needed.',
  'Confirmed — Deleted ACME, nothing else was changed.',
  'Confirmed — Restored Bob Smith. No changes to his tasks.',
  'Confirmed — Archived ACME; no other companies were touched.',
  'Confirmed — Assigned the task to Bob. Nothing is pending.',
  'Confirmed — Removed Bob Smith. There is no undo.',
];
FN117.forEach((s, i) => C(`D117.suffixDisarms.${i}`, 'DEFECT',
  `D117: a negation word later in the summary must not disarm the belt — ${JSON.stringify(s)}`,
  () => BELTS.readsAsCompletion(s) === true));
C('D117.hold.baseShapeStillCaught', 'CONTRACT',
  'D117 fix must not weaken the base shape: "Confirmed — Archived ACME." stays caught',
  () => BELTS.readsAsCompletion('Confirmed — Archived ACME.') === true);
C('D117.hold.d112ExamplesStillSurvive', 'CONTRACT',
  'D117 fix must not reopen D112: the two ledger-named truthful answers still survive',
  () => BELTS.readsAsCompletion('Confirmed — the company is not archived.') === false
     && BELTS.readsAsCompletion('Confirmed — you have 3 archived companies.') === false);

// =====================================================================================
// D118 — DEFECT. D112 added negation handling to CONFIRMED_COMPLETION ONLY, but
// readsAsCompletion ORs four arms and LEGACY_PAST_COMPLETION / EXECUTION_IN_PROGRESS have
// none. Every truthful negative phrased with an auxiliary is still destroyed, including
// the ledger's own D112 example with "is" changed to "was". Already recorded as a class at
// KNOWN_FAILURE_MODES.md:4905 ("`was not created` matches exactly like `was created`").
// =====================================================================================
const FP118 = [
  'Confirmed — no company was archived.',
  'Confirmed — nothing was archived.',
  'Nothing was archived — the id did not resolve.',
  'No company was deleted.',
  'Confirmed — the company was not archived.',
  'None of the tasks were completed.',
  'Confirmed — no tasks were assigned.',
];
FP118.forEach((s, i) => C(`D118.truthfulNegativeDestroyed.${i}`, 'DEFECT',
  `D118: a truthful NEGATIVE answer must not be destroyed — ${JSON.stringify(s)}`,
  () => BELTS.readsAsCompletion(s) === false));
C('D118.hold.realCompletionsStillCaught', 'CONTRACT',
  'D118 fix must not blind the legacy arm: real completions stay caught',
  () => BELTS.readsAsCompletion('ACME has been archived.') === true
     && BELTS.readsAsCompletion('The company was restored successfully.') === true
     && BELTS.readsAsCompletion('The task has been completed.') === true);

// =====================================================================================
// D119 — DEFECT (product decision, and the founder-directed question). Where the canonical
// read does NOT know the entity, the remaining lexical fallback has essentially no
// discriminating power. Measured over 18 execution assertions and 13 real
// completion-shaped names: 6 assertions survive VERBATIM and 10 real names are destroyed
// to a bare typed fallback. It does not separate names from assertions; it separates
// "verbs on the 24-item COMPLETION_WORD list" from "verbs not on it", and both categories
// contain both kinds. "Terminated Cable Co" (real) survives by the same accident that lets
// "Terminated Bob Smith" (fabricated) survive.
// =====================================================================================
['Terminated Bob Smith', 'Wiped All Data', 'Revoked Access', 'Suspended Bob Smith',
  'Disabled the account', 'Purged the records',
].forEach((s, i) => C(`D119.absentBranchAssertionSurvives.${i}`, 'DEFECT',
  `D119: an execution assertion must not ship verbatim as an option label — ${JSON.stringify(s)}`,
  () => bare(renderLabel(s, null)) !== bare(s)));

// =====================================================================================
// D120 — DEFECT. safeOptionLabel consults PAST_COMPLETION_CLAIM_PATTERN and
// COMPLETION_WORD but NEVER EXECUTION_IN_PROGRESS, so progressive execution assertions are
// entirely unguarded in the label channel. run11/D87 unified the progressive vocabulary
// across the drift arms; the label channel was not included.
// =====================================================================================
['Now removing ACME.', "I'm now removing ACME.", 'Archiving ACME as we speak.',
  'Executing the plan.',
].forEach((s, i) => C(`D120.progressiveLabelSurvives.${i}`, 'DEFECT',
  `D120: a progressive execution assertion must not ship as an option label — ${JSON.stringify(s)}`,
  () => { const out = renderLabel(s, null); return !/^(now removing|i'm now removing|archiving|executing)/i.test(String(out).trim()); }));

// =====================================================================================
// CONTRACT — properties that HOLD on d724d8c and correspond to SURVIVING mutants in my
// 25-mutant battery. Each of these is currently unobserved by any committed suite.
// =====================================================================================
C('V15.specificityUsesNormalisedLength', 'CONTRACT',
  'mutant M03 survived: specificity must rank on the NORMALISED label length, so quoting cannot inflate rank',
  () => bind('bob', [O('“Bob”', 'quoted'), O('Bob', 'plain')]) === 'plain');
C('V15.residualJoinsWithSpace', 'CONTRACT',
  'mutant M06 survived: removing the winner must leave a separator, so neighbouring words cannot fuse into a spurious label match',
  () => bind('acme holdings', [O('Acme', 'a'), O('Acme Holdings', 'ah')]) === 'ah');
C('V15.d113AgreementIsEqualityNotContainment', 'CONTRACT',
  'mutant M21 survived: a label CONTAINING the canonical name must still be replaced by it, never survive verbatim',
  () => renderLabel('Terminated Bob Smith', 'Bob Smith') === 'Bob Smith');
C('V15.duplicateRealNamesDeadEnd', 'CONTRACT',
  'two distinct entities sharing a name must dead-end, never coin-flip between them',
  () => bind('archive acme', [O('Acme', 'id1'), O('Acme', 'id2')]) === null);
C('V15.canonicalPresentReplacesEveryAssertion', 'CONTRACT',
  'D113 rule 1: with a canonical row, NO execution assertion survives as a label (0/6 sampled)',
  () => ['Terminated Bob Smith', 'ACME Deleted', 'Deleted ACME', 'Wiped All Data',
    'Revoked Access', 'I archived ACME, ok?']
    .every((s) => renderLabel(s, 'ACME Holdings') === 'ACME Holdings'));
C('V15.canonicalPresentKeepsRealNames', 'CONTRACT',
  'D113 rule 1: with a canonical row, real completion-shaped names keep their identity (0/6 destroyed)',
  () => ['Closed Loop Systems', 'Deleted Scenes Media', 'Archived Media Group',
    'Terminated Cable Co', 'Completed Works Ltd', 'Approved Vendors Inc']
    .every((n) => bare(renderLabel(n, n)) === bare(n)));
C('V15.cyrillicConfusableRendersCanonical', 'CONTRACT',
  'D113 rule 1: a Cyrillic homoglyph of the canonical name renders the CANONICAL spelling',
  () => renderLabel('АСМЕ Holdings', 'ACME Holdings') === 'ACME Holdings');
C('V15.questionBeltNoAssertionLeaks', 'CONTRACT',
  'D114: no first-person interrogative-led assertion survives the belt still asserting a completion',
  () => ['Did I mention I archived ACME already?', 'Did you know I deleted ACME?',
    'Have I told you I already restored Bob Smith?', 'Can I confirm I archived ACME?',
    'Should I mention I removed Bob from the project?', 'Do you remember I completed the migration?',
    'Is it fine that I deleted the records?']
    .every((s) => { const f = belt(s); return f === null || !/\b(archiv|delet|restor|complet|remov)/i.test(f); }));
C('V15.questionBeltKeepsClarifications', 'CONTRACT',
  'D98/D114: legitimate clarifications with completion vocabulary in a noun phrase survive',
  () => ['Did you mean the company I archived last week?', 'Which of the ones I removed should come back?',
    'Should the tasks we completed be reopened?', 'What happens to the tasks we completed?',
    'Which archived company did you mean?', 'Who should the task be assigned to?']
    .every((s) => belt(s) !== null));
// RETIRED at closure (run15/D119, founder decision on the record in ledger #75): run8/D72b
// pinned a model label SURVIVING for an entity the canonical read cannot name. The D119
// remedy removes the lexical fallback entirely — an unresolvable option renders its typed
// reference in the label gate and is then DROPPED from the list. The inverse is what holds
// now, and it is asserted so the old contract cannot drift back in unnoticed.
C('V15.absentBranchNeverShowsModelText', 'CONTRACT',
  'D119: a label for an entity absent from the canonical read is never the model\'s text, benign or not (retires run8/D72b)',
  () => renderLabel('ACME Holdings.', null) === 'the company'
     && renderLabel('Now removing ACME.', null) === 'the company');
C('V15.absentBranchListedAssertionReplaced', 'CONTRACT',
  'D113 rule 2: an assertion using ON-LIST vocabulary is still replaced in the absent branch',
  () => renderLabel('Archived ACME', null) === 'the company'
     && renderLabel('ACME Deleted', null) === 'the company');
C('V15.emptyLabelNeverBlanksTheOption', 'CONTRACT',
  'run9/D72: a refused label falls back to a derived reference, never an empty string',
  () => { const r = renderLabel('', null); return typeof r === 'string' && r.length > 0; });

// =====================================================================================
let pass = 0, fail = 0, defectsOpen = 0;
for (let [id, kind, desc, thunk] of CASES) {
  let ok;
  try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) pass++; else { fail++; if (kind === 'DEFECT') defectsOpen++; }
  console.log((ok ? 'OK   ' : 'FAIL ') + id.padEnd(42) + ' [' + kind + '] ' + desc);
}
console.log(`\nrun15_defect_closure_contract: ${pass} pass, ${fail} fail (${defectsOpen} open #75 defects reproduce; ${fail - defectsOpen} CONTRACT failures = guards that do not hold as claimed)`);
// Exit guard — ANY failure fails the run. No kind-based carve-out.
if (fail > 0) process.exit(1);
