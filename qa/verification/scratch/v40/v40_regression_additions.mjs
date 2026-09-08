#!/usr/bin/env node
// VERIFIER #40 — campaign #100 regression additions (candidate-vs-DEPLOYED-v92 deploy gate).
//
// WHY THIS FILE IS RED ON CANDIDATE 4cf2a88 ON PURPOSE.
// Ledger #101 reports "34 suites executed / 0 failures". Re-measured here: that number is
// literally true and it is not a deploy gate. On a corpus this verifier built from scratch
// (758 rows: 483 truthful negatives with real names, 275 fabrications) the candidate
//   * DESTROYS 27 truthful answers deployed v92 preserves, in three classes, and the false
//     refusal it substitutes is PERSISTED to work_orders.output; and
//   * SHIPS 5 fabrication shapes deployed v92 CORRECTS (one of which the repo's own
//     v33_regression_additions.mjs has been RED about the whole time).
//
// CONTRACT items are properties that hold on this candidate and must hold forever.
// DEFECT  items reproduce an open v92 regression and FAIL until it is genuinely closed.
// ANY failure of either kind exits nonzero.
//
// Source: SEM_INDEX_SRC, else located by walking UP from this file to the repo root, so the
// suite runs correctly from ANY cwd (ledger #99 V30-F2: v30_regression_additions.mjs is
// unrunnable from every cwd because it resolved a relative path against process.cwd()).
//
// Measured against candidate 4cf2a88f720b90e5f8aeddaefa85cfbb6db2cdd4,
// index.ts sha256 3798ad2f819749ff36daf6dd522a9e00cfe95a521ceb6bf92f810fa6de6f2901.
// Deployed reference: sem-ai-command v92 (project pvphxgrtdfrudejjhzjk, version 92,
// ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, read myself
// via `supabase functions list`) == git c9dfab5bd433, index.ts sha256
// 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── source location: SEM_INDEX_SRC, else walk up from THIS FILE (never process.cwd()) ────
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
const SRC = process.env.SEM_INDEX_SRC
  ? resolve(process.env.SEM_INDEX_SRC)
  : findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
console.log('=== v40 regression additions — source ' + SRC);

let pass = 0; const failures = [];
const C = (kind, label, why, fn) => {
  let okv = false; let err = '';
  try { okv = fn() === true; } catch (e) { err = ' — threw: ' + e.message; }
  if (okv) { pass++; console.log('ok    [' + kind.padEnd(8) + '] ' + label); }
  else { failures.push('[' + kind + '] ' + label + ' — ' + why + err); console.log('FAIL  [' + kind.padEnd(8) + '] ' + label + ' — ' + why + err); }
};

// ── extractor: a JS-aware lexer (comments, the three string kinds, REGEX LITERALS) that
// stops at the `;` ending the statement at bracket depth 0. Deliberately not "slice N chars"
// and not "slice to the first `;`" — both have silently truncated in this campaign. ───────
const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function endOfStatement(src, start) {
  let i = start; let depth = 0; let prev = '';
  while (i < src.length) {
    const c = src[i]; const two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1; let inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break;
        j++;
      }
      j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return i + 1;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('unterminated statement — update this harness, do not guess a budget');
}
function grabConst(name) {
  const m = new RegExp('(^|\\n)\\s*const ' + name + '\\b').exec(TEXT);
  if (!m) throw new Error('const not found: ' + name);
  const s = TEXT.indexOf('const', m.index);
  return TEXT.slice(s, endOfStatement(TEXT, s));
}
const BELT = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
function buildBelt() {
  const parts = [];
  for (const n of BELT) { try { parts.push(grabConst(n)); } catch (e) { /* optional across baselines */ } }
  const body = parts.join('\n').replace(/\(c: string\): boolean/g, '(c)').replace(/\(s: string\)/g, '(s)');
  if (/:\s*(string|boolean|number|any)\b/.test(body)) throw new Error('a TS annotation survived — refusing to guess');
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn readsAsCompletion;')();
}
let readsAsCompletion;
try { readsAsCompletion = buildBelt(); } catch (e) {
  console.log('FAIL  the belt could not be assembled from ' + SRC + ' — ' + e.message);
  console.log('      (this suite is a CANDIDATE-side gate; pointing it at deployed v92, which has no belt, is not meaningful)');
  console.log('\n0 passed, 1 failed');
  process.exit(1);
}
const belt = (s) => readsAsCompletion(String(s)) === true;

// deployed v92's ENTIRE completion gate is one pattern on the whole summary. The candidate
// keeps that regex byte-identical, which is what makes this an honest v92 oracle.
const v92Lit = (TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[\s\S]*?\/i);\n/) || [])[1];
if (!v92Lit) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN not found'); process.exit(1); }
// eslint-disable-next-line no-new-func
const V92 = new Function('return ' + v92Lit)();
const v92fires = (s) => V92.test(String(s));

// The gate an ungrounded read-only turn actually reaches, and whether the correction is
// PERSISTED (this is what makes a destroyed truthful answer worse than a one-turn error).
const REACHES_FOUNDER = /const legacyProseFallback = !hasSupportedMutationClaim[\s\S]{0,400}?readsAsCompletion\(String\(result\.summary \|\| ''\)\);/.test(TEXT);
const IS_PERSISTED = /claimsPastCompletionWithNoGrounding[^\n]*\)\s*\{\s*\n\s*await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)/.test(TEXT);

// ══════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [CONTRACT] the v92 oracle used by this file is the real one');
C('CONTRACT', 'V40-C0.legacyPatternIsByteIdenticalToDeployedV92',
  'LEGACY_PAST_COMPLETION must stay byte-identical to deployed v92 PAST_COMPLETION_CLAIM_PATTERN, or every v92 comparison below is measuring the candidate against itself',
  () => {
    const legacy = (TEXT.match(/const LEGACY_PAST_COMPLETION = (\/[\s\S]*?\/i);\n/) || [])[1];
    return !!legacy && legacy === v92Lit
      && v92Lit.startsWith('/(?<!may )(?<!might )(?<!could )(?<!can )');
  });
C('CONTRACT', 'V40-C0.correctionReachesTheFounderAndIsPersisted',
  'an ungrounded read-only turn reaches readsAsCompletion via legacyProseFallback and the substituted summary is written to work_orders.output — so a destroyed truthful answer survives a reload',
  () => REACHES_FOUNDER && IS_PERSISTED);

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-D1 (P1) — the arm deployed v92 DOES NOT HAVE, second recurrence.
// #39 found EXECUTION_IN_PROGRESS's clause-initial gerund destroying ordinary product help
// and closed it with a WHITELIST OF FINITE VERBS (is|are|requires|needs|…|affects). English
// predicates are an OPEN class. Every sentence below has a main verb outside that list, and
// every one of them is corrected by the candidate and shown truthfully by deployed v92.
console.log('\n--- [DEFECT] V40-D1: clause-initial gerund still destroys ordinary product prose');
const D1 = [
  'Archiving a company triggers a notification to its owner.',
  'Archiving a company cascades to its business units.',
  'Renaming a company propagates to all of its tasks.',
  'Updating a record writes an audit entry.',
  'Deleting a document permanently erases the stored file.',
  'Restoring a company reactivates its business units.',
  'Approving a request unlocks the next workflow step.',
  'Assigning a task emails the assignee.',
  'Restoring a person reinstates their memberships.',
  'Archiving old projects reduces clutter on the dashboard.',
  'Creating a company seeds a default business unit.',
  'Deleting a draft discards unsaved edits.',
  'Assigning a goal transfers ownership to the new owner.',
  'Approving an expense debits the department budget.',
  'Archiving a business unit detaches its people.',
  'Sending a message queues it for delivery.',
  'Adding a member grants read access.',
  'Clearing a filter resets the view.',
  'Two rules apply: archiving a company cascades to its units.',
  'Note: renaming a project propagates everywhere.',
];
for (const s of D1) {
  C('DEFECT', 'V40-D1.productProseSurvives :: ' + JSON.stringify(s.slice(0, 52)),
    'a non-claim policy/help sentence deployed v92 shows the founder is replaced with "I can’t actually do that from chat" and PERSISTED',
    () => belt(s) === false && v92fires(s) === false);
}
C('DEFECT', 'V40-D1.nonVacuity',
  'this defect block must actually separate the two builds — every row above must be a v92-PRESERVED sentence, or the block proves nothing',
  () => D1.every((s) => v92fires(s) === false) && D1.length >= 20);

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-D2 (P1) — the CONFIRMED arm's morphological disarm reads a participle followed by a
// function word as a real claim. "no longer" is an ADVERBIAL, not determiner+object.
console.log('\n--- [DEFECT] V40-D2: CONFIRMED arm destroys a definitional sentence');
for (const s of ['Confirmed — Archived no longer means deleted.', 'Confirmed — Deleted no longer appears in the picker.']) {
  C('DEFECT', 'V40-D2.adverbialAfterParticiple :: ' + JSON.stringify(s.slice(0, 52)),
    'the participle heads an adverbial, not an object; v92 preserves this sentence and the candidate corrects it',
    () => belt(s) === false && v92fires(s) === false);
}
C('CONTRACT', 'V40-D2.hold.adjectivalDisarmStillWorks',
  'closing D2 must not re-open the adjectival readings the morphological test already handles',
  () => ['Confirmed — Archived items are read-only.', 'Confirmed — Removed members keep their audit history.',
    'Confirmed — Deleted drafts are purged after 30 days.', 'Confirmed — Archived and restored are different states.']
    .every((s) => belt(s) === false));
C('CONTRACT', 'V40-D2.hold.realConfirmedClaimsStayCaught',
  'closing D2 must not blind the CONFIRMED arm to a real claim',
  () => ['Confirmed - Archived ACME.', 'Confirmed — Deleted Beta Corp.', 'Confirmed — Deleted the company.',
    'Confirmed — Restored Bob Smith.', 'Confirmed — Archived ACME Holdings.'].every((s) => belt(s) === true));

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-D3 (P1) — the first-person arm matches an entity noun used as a noun MODIFIER.
console.log('\n--- [DEFECT] V40-D3: first-person arm fires on a noun MODIFIER, not the object head');
for (const s of [
  'I removed the company filter from the list you asked about.',
  'I removed the company column from the summary I drafted.',
  'I restored the project view you had before.',
  'I renamed the task label in the draft, not in the database.',
  'I deleted the document reference from my notes.',
]) {
  C('DEFECT', 'V40-D3.nounModifier :: ' + JSON.stringify(s.slice(0, 52)),
    '"the company FILTER" is not "the company"; v92 preserves this sentence and the candidate corrects it',
    () => belt(s) === false && v92fires(s) === false);
}
C('CONTRACT', 'V40-D3.hold.realFirstPersonClaimsStayCaught',
  'closing D3 must not blind the first-person arm',
  () => ['I archived Beta Corp.', 'I deleted the company.', 'I archived No Limits Inc.', 'I deleted Nothing Bundt Cakes.',
    'We removed Never Summer Industries.', 'I restored None The Wiser LLC.', 'No worries — I archived Beta Corp.']
    .every((s) => belt(s) === true));
C('CONTRACT', 'V40-D3.hold.truthfulFirstPersonSurvives',
  'the truthful first-person negatives must stay preserved',
  () => ['I archived nothing.', 'I archived no companies.', 'I deleted no records.', 'We removed nobody from the team.',
    'I restored none of them.', 'I can help you archive a company.', 'I have not archived the company.']
    .every((s) => belt(s) === false));

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-D4 (P1, FABRICATION REGRESSION) — deployed v92 corrects these; the candidate ships
// them. `newSubject`'s endsLinked alternative `[a-z]+(?:ing|ed|en)` swallows an ordinary
// FINITE past-tense verb, so a filler negator is treated as scoping over a completion that
// lives in a following, independent clause. Already RED in v33_regression_additions.mjs.
console.log('\n--- [DEFECT] V40-D4: filler negator + finite verb ships a fabrication v92 corrects');
for (const s of [
  'No errors occurred the department was removed.',
  'No errors occurred the company was archived.',
  'No issues occurred the person was removed.',
  'Nothing happened the task was completed.',
  'No problems appeared the goal was deleted.',
]) {
  C('DEFECT', 'V40-D4.finiteVerbEndsTheNegatorClause :: ' + JSON.stringify(s.slice(0, 52)),
    'deployed v92 CORRECTS this fabrication and the candidate ships it end-to-end',
    () => belt(s) === true && v92fires(s) === true);
}
C('CONTRACT', 'V40-D4.hold.reducedRelativeTruthsSurvive',
  'closing D4 must not destroy a reduced relative on a SINGULAR head noun — the exact pairs v34/v35 pin',
  () => ['No company named No Limits Inc was archived.', 'No project titled Copper Works was archived.',
    'No ticket assigned to Bob Smith was completed.', 'No task assigned the wrong owner was deleted.',
    'No document titled the same way was archived.'].every((s) => belt(s) === false));
C('CONTRACT', 'V40-D4.hold.evidentialsStillLink',
  'closing D4 must not destroy an evidential negative — those verbs take a that-clause and legitimately link',
  () => ['No log however shows ACME was archived.', 'No entry however in our records shows ACME was archived.',
    'No record therefore shows Beta Corp was deleted.', 'No record that nobody reviewed shows ACME was archived.'
  ].slice(0, 3).every((s) => belt(s) === false));

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-C1 (CONTRACT) — REFUTES the campaign file's CORRECTED_BY_V39 claim that the R-AUXGAP
// arm is "fully masked by #38's backstop" and should be deleted under the only-load-bearing
// -code rule. Reverting it alone re-opens two fabrications deployed v92 CORRECTS, so
// deleting it would be a FABRICATION REGRESSION. #39's deadness proof was vacuous: its
// corpus had no sentence where a negator inside the SAME sentence disarms the first arm.
console.log('\n--- [CONTRACT] V40-C1: the R-AUXGAP arm is load-bearing (refutes "fully masked")');
C('CONTRACT', 'V40-C1.rAuxGapIsLoadBearing',
  'reverting the aux-gap collapse must re-open a fabrication deployed v92 corrects, so it may not be removed as dead code',
  () => {
    const parts = [];
    for (const n of BELT) { try { parts.push(grabConst(n)); } catch (e) { /* optional */ } }
    let body = parts.join('\n').replace(/\(c: string\): boolean/g, '(c)').replace(/\(s: string\)/g, '(s)');
    const marker = 'couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don';
    const idx = body.indexOf(marker);
    if (idx < 0) throw new Error('R-AUXGAP marker not found — update this harness');
    const callStart = body.lastIndexOf('.replace(', idx);
    let i = callStart + '.replace('.length - 1; let depth = 0; let prev = ''; let mode = 0; let end = -1;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (mode === 0) {
        if (ch === '"' || ch === "'" || ch === '`') { mode = 1; prev = ch; continue; }
        if (ch === '/' && PREV_ALLOWS_REGEX.has(prev)) {
          let j = i + 1; let inC = false;
          while (j < body.length) { if (body[j] === '\\') { j += 2; continue; } if (body[j] === '[') inC = true; else if (body[j] === ']') inC = false; else if (body[j] === '/' && !inC) break; j++; }
          j++; while (j < body.length && /[gimsuyvd]/.test(body[j])) j++;
          i = j - 1; prev = '/'; continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { end = i; break; } }
        if (!/\s/.test(ch)) prev = ch;
      } else if (ch === '\\') i++;
      else if (ch === prev) mode = 0;
    }
    if (end < 0) throw new Error('unbalanced R-AUXGAP .replace — update this harness');
    const reverted = body.slice(0, callStart) + body.slice(end + 1);
    // eslint-disable-next-line no-new-func
    const noAuxGap = new Function(reverted + '\nreturn readsAsCompletion;')();
    const probes = ['ACME was, with no delay, archived.', 'Beta Corp has been, with no issues, deleted.'];
    return probes.every((s) => v92fires(s) === true && belt(s) === true)
      && probes.some((s) => noAuxGap(s) !== true);
  });

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-C2 (CONTRACT) — the four re-pinned residuals, re-derived on this verifier's own
// extractor rather than on the suites that pinned them. BOTH directions, every time.
console.log('\n--- [CONTRACT] V40-C2: re-pinned residuals hold in both directions');
for (const [label, fab, real] of [
  ['run18/D131 dash member (run32/D180)', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
  ['run18/D131 name-initial (run30/D170)', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['run18/D131 idiom member A', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['run18/D131 idiom member B', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['run28/D116 negator-initial name', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
  ['run18/D131 disclosedResidual 2', 'No Limits Inc was deleted.', 'No company named No Limits Inc was deleted.'],
  ['run18/D131 disclosedResidual 3', 'Never Say Never LLC has been archived.', 'I found no record that Never Say Never LLC has been archived.'],
  ['run18/D131 disclosedResidual 4', 'None The Wiser Ltd was archived.', 'Nothing was archived for None The Wiser Ltd.'],
  ['run19/D131 separable', 'No record and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
]) {
  C('CONTRACT', 'V40-C2.repin :: ' + label,
    'the re-pin is only honest if the fabrication is caught AND the paired real name genuinely survives',
    () => belt(fab) === true && belt(real) === false);
}

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-C3 (CONTRACT) — ledger #64 D16/D17, #65 D25, #65 D27 (production row 9dda919c) and
// #66 D40 stay closed. Re-derived from the ledger's own tables, not from a prior verifier.
console.log('\n--- [CONTRACT] V40-C3: ledger #64/#65/#66 production shapes stay closed');
for (const s of [
  'The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.',
  'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.',
  'No company matched that name so the company has been archived.', 'I could not confirm the owner yet the employee was created.',
  'The status is not draft (the goal has been archived).', 'The task has been completed, right?',
  'Looking at the conversation history, it has been approved.', 'Per the conversation history, they have been archived.',
  'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
  'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
  'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
  'Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".',
]) {
  C('CONTRACT', 'V40-C3.productionShape :: ' + JSON.stringify(s.slice(0, 46)),
    'a shape deployed v92 corrects today must stay corrected',
    () => belt(s) === true && v92fires(s) === true);
}
C('CONTRACT', 'V40-C3.d40.driftIsAdditiveNotClaimsGated',
  '#66/D40: a schema-valid claims array must not disable the gate — both drift arms are armed unless a SUPPORTED mutation/assignment claim exists',
  () => /const legacyProseFallback = !hasSupportedMutationClaim/.test(TEXT)
    && /const unaccountedCompletionProse = !hasSupportedMutationClaim/.test(TEXT)
    && /const hasSupportedMutationClaim = verifiedClaims\.some\(\(v\) => v\.verdict === 'supported'/.test(TEXT)
    && !/const\s+unaccountedCompletionProse\s*=\s*!rawClaims/.test(TEXT));
C('CONTRACT', 'V40-C3.d25.noCommandDerivedAmnestyGate',
  '#65/D25: the command-derived read-only gate must never come back',
  () => ['founderRequestedMutation', 'MUTATION_REQUEST_PATTERN', 'READ_ONLY_REQUEST_PATTERN'].every((id) => !TEXT.includes(id)));
C('CONTRACT', 'V40-C3.d27.renameArrowTestedOnWholeSummary',
  '#65/D27 (production row 9dda919c): the `renamed: X -> Y` arm must be tested on the WHOLE summary, before the clause splitter eats the colon',
  () => /REFERENCELESS_CONFIRMATION\.test\(s\) \|\| \/\\brenamed:\\s\*\.\+\(→\|->\)\/i\.test\(String\(s\)\)/.test(TEXT));

// ══════════════════════════════════════════════════════════════════════════════════════
// V40-C4 (CONTRACT) — structural invariants of the belt that this campaign has broken
// before, re-asserted with their own non-vacuity proof.
console.log('\n--- [CONTRACT] V40-C4: belt structural invariants (with non-vacuity)');
const beltBlock = () => {
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found');
  return TEXT.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
};
C('CONTRACT', 'V40-C4.noWholeSpanLookaround',
  'run15/D117: a negator in a LATER sentence must never disarm the belt for a fabrication beside it',
  () => { const b = beltBlock(); return !/\(\?![^)]*\[\^\]\*/.test(b) && !/\(\?=[^)]*\[\^\]\*/.test(b) && !/\(\?<![^)]*\[\^\]\*/.test(b); });
C('CONTRACT', 'V40-C4.noInlineModifierGroupAnywhere',
  'an inline modifier group is unverified in the Deno Edge runtime and fails at MODULE LOAD, taking the whole function down',
  () => !/\(\?-?[imsux]+:/.test(TEXT.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
C('CONTRACT', 'V40-C4.everyRegexLiteralConstructs',
  'every regex literal in index.ts must construct in V8 — a bad one is a module-load failure, not a wrong answer',
  () => {
    let i = 0; let prev = ''; let bad = 0;
    while (i < TEXT.length) {
      const c = TEXT[i]; const two = TEXT.slice(i, i + 2);
      if (two === '//') { const nl = TEXT.indexOf('\n', i); i = nl < 0 ? TEXT.length : nl + 1; continue; }
      if (two === '/*') { const e = TEXT.indexOf('*/', i + 2); i = e < 0 ? TEXT.length : e + 2; continue; }
      if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < TEXT.length) { if (TEXT[j] === '\\') { j += 2; continue; } if (TEXT[j] === c) break; j++; } i = j + 1; prev = c; continue; }
      if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
        let j = i + 1; let inC = false; let okEnd = false;
        while (j < TEXT.length) { if (TEXT[j] === '\\') { j += 2; continue; } if (TEXT[j] === '[') inC = true; else if (TEXT[j] === ']') inC = false; else if (TEXT[j] === '/' && !inC) { okEnd = true; break; } else if (TEXT[j] === '\n') break; j++; }
        if (okEnd) {
          const body = TEXT.slice(i + 1, j); let k = j + 1; let flags = '';
          while (k < TEXT.length && /[gimsuyvd]/.test(TEXT[k])) { flags += TEXT[k]; k++; }
          try { new RegExp(body, flags); } catch (e) { bad++; }
          i = k; prev = '/'; continue;
        }
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
    return bad === 0;
  });
C('CONTRACT', 'V40-C4.hold.realProgressClaimsStayCaught',
  'any fix for V40-D1 must not blind EXECUTION_IN_PROGRESS to a REAL progress claim (this is what makes D1 closable rather than deletable)',
  () => ['Archiving ACME as we speak.', 'Now removing ACME Holdings.', 'I’m now archiving Beta Corp.',
    'I am archiving ACME Holdings.', 'Working on archiving ACME Holdings.', 'Confirmed. Now deleting ACME Holdings.',
    'No problem — Archiving ACME now.'].every((s) => belt(s) === true));
C('CONTRACT', 'V40-C4.hold.stateAnswersAndCountsSurvive',
  'run19/D137 + run14/D112: present-tense STATE answers and noun uses of a completion word must never be corrected',
  () => ['test3 is archived. Should I restore it?', 'ACME is archived but was not deleted.',
    'There are 3 archived companies in your workspace.', 'The archived list has 12 entries.',
    'Still pending, not approved.', 'The company is archived; its tasks are still visible.'].every((s) => belt(s) === false));

// ══════════════════════════════════════════════════════════════════════════════════════
console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log('  - ' + f); }
process.exit(failures.length ? 1 : 0);
