// =====================================================================================
// VERIFIER #31 — campaign #91 regression additions (candidate-vs-DEPLOYED-v92 deploy gate,
// second round).
//
// WHAT THIS PINS, AND WHY IT IS RED ON CANDIDATE 6774b52 ON PURPOSE.
//
// Campaign #91 closed all five v92-differential fabrication classes verifier #30 opened —
// independently re-confirmed here (CONTRACT block). It then declared the deploy gate green.
// It is not green, in BOTH directions, and neither direction was measured:
//
//   * TRUTH REGRESSION. Three of the five shipped fixes BUY fabrication coverage by declaring
//     some negator occurrences non-negating. Two of them destroy truthful answers that DEPLOYED
//     v92 shows the founder — 1144/1144 shapes in the nameInternal family and 330/480 in the
//     R-AUXGAP family on this verifier's generated corpora. Destroying a true answer and
//     substituting "I can't actually do that from chat — nothing was changed" is the direction
//     index.ts itself calls the worse one.
//   * FABRICATION REGRESSION. The suites' OWN accepted-residual lists were never tested against
//     deployed v92. Seventeen shapes that run18/run19/run28 pin as acceptable misses are
//     fabrications v92 CORRECTS, and all seventeen ship end-to-end. Fourteen of them were CAUGHT
//     at the campaign baseline 4476c92 — run28's own comment says so ("CAUGHT at 4476c92, MISSED
//     here") — and were re-labelled "residual" rather than "regression against production".
//
// CONTRACT items are properties that must hold forever (they pass today). DEFECT items reproduce
// the open classes and FAIL until they are genuinely closed. ANY failure of either kind exits
// nonzero.
//
// Source: SEM_INDEX_SRC, else resolved from THIS FILE's location (correct from any cwd), else a
// cwd fallback. Everything executed here is sliced out of the REAL shipped bytes — nothing is
// reimplemented, because a reimplementation cannot catch a product defect (the vacuous-regression
// class this ledger has logged nine times).
//
// Measured against candidate 6774b52cf2eba8ca0b96d4c6951e7956ae2ad4dd,
// index.ts sha256 2a7abef9c83cbbc19532aa742a73da71a40b597083a3287afb3fc0ed9de935a7 (CRLF).
// Deployed reference: sem-ai-command v92 == git c9dfab5bd433, index.ts sha256
// 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc (re-derived from git by this
// verifier; provenance is INTEGRATION-LEVEL — see v31_PROMOTION_NOTE.md).
// =====================================================================================
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// This file lives in qa/verification/proposed/, so the repo root is THREE levels up. The cwd
// fallback is kept SECOND, never first — V30-F2 was exactly a suite that only resolved via cwd.
const SRC = process.env.SEM_INDEX_SRC
  || [resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
      resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
      resolve(process.cwd(), 'supabase/functions/sem-ai-command/index.ts')].find(existsSync);
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (tried SEM_INDEX_SRC and 3 relative paths)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (kind, l, cond, d) => (cond ? ok('[' + kind + '] ' + l) : bad('[' + kind + '] ' + l, d));

// ─────────────────────────────────────────────────────────────────────────────
// Extraction of the REAL predicates. A JS-aware scanner (strings, templates, regex literals,
// comments) stops at the `;` that ends the statement at bracket depth 0 — deliberately NOT
// "slice to the first `;`", so an edit that moves a `;` inside a statement cannot silently
// truncate what is tested.
// ─────────────────────────────────────────────────────────────────────────────
function statementEnd(src, start) {
  let i = start, d = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '/') {
      let p = i - 1;
      while (p >= 0 && /\s/.test(src[p])) p--;
      const prev = p >= 0 ? src[p] : '';
      if (prev === '' || '=(,[!&|?:;{}+*%<>~^'.includes(prev) || /\b(return|typeof|case|of|in|do|new)$/.test(src.slice(Math.max(0, p - 8), p + 1))) {
        let j = i + 1, cls = false, valid = false;
        while (j < src.length) {
          const x = src[j];
          if (x === '\\') { j += 2; continue; }
          if (x === '[') { cls = true; j++; continue; }
          if (x === ']') { cls = false; j++; continue; }
          if (x === '/' && !cls) { j++; valid = true; break; }
          if (x === '\n') break;
          j++;
        }
        if (valid) { while (j < src.length && /[a-z]/i.test(src[j])) j++; i = j; continue; }
      }
    }
    if (c === '(' || c === '[' || c === '{') { d++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') { d--; i++; continue; }
    if (c === ';' && d === 0) return i + 1;
    i++;
  }
  throw new Error('no terminating ; from offset ' + start);
}
function grabDecl(src, name) {
  const m = new RegExp('^[ \\t]*const\\s+' + name + '\\b', 'm').exec(src);
  if (!m) throw new Error('declaration not found in shipped source: ' + name);
  return src.slice(m.index, statementEnd(src, m.index));
}
const stripTS = (t) => {
  let s = t.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_x, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>');
  s = s.replace(/=\s*\(([^)]*)\)\s*=>/g, (_x, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>');
  if (/:\s*(?:string|number|boolean|any|unknown)\b/.test(s)) throw new Error('TypeScript survived stripping — update this harness rather than letting it pass');
  return s;
};
const NEEDED = ['PROGRESS_VERBS', 'LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];

let API;
try {
  const body = NEEDED.map((n) => stripTS(grabDecl(TEXT, n))).join('\n')
    + '\nreturn { readsAsCompletion, completionIsNegated, NEGATED_CLAUSE, LEGACY_PAST_COMPLETION };';
  API = new Function(body)();
} catch (e) { console.log('FAIL  cannot build the belt from the shipped source — ' + e.message); process.exit(1); }
const belt = (s) => API.readsAsCompletion(String(s)) === true;

// The full gate-decision window, so a belt result can be shown to reach the founder rather than
// merely to differ. Proves SHIPS/DESTROYED end-to-end on claims:null AND claims:[].
let decide;
try {
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const slice = stripTS(TEXT.slice(a, b));
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan',
    'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\nreturn claimsPastCompletionWithNoGrounding;');
  decide = (summary, rawClaims) => fn([], 'gpt-5', false, false,
    { summary, pendingAction: null, claims: rawClaims }, rawClaims, '', [], false) === true;
} catch (e) { console.log('FAIL  cannot build the decision window — ' + e.message); process.exit(1); }
// A summary is CORRECTED end-to-end iff the gate fires on an ungrounded turn either way.
const corrected = (s) => decide(s, null) && decide(s, []);
const shipsToFounder = (s) => !decide(s, null) && !decide(s, []);

// DEPLOYED v92's ONLY completion gate, pinned as bytes.
const V92_LITERAL = '/(?<!may )(?<!might )(?<!could )(?<!can )\\b(has been|have been|was|were)\\b[^.]{0,30}\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\\b|\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\\s+successfully\\b|\\brenamed:\\s*.+(→|->)/i';
const V92 = new Function('return ' + V92_LITERAL)();

console.log('=== verifier #31 v92-differential deploy gate — source ' + SRC);

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 1 — provenance anchor. If this fails, every v92-differential measurement is void.
// ═════════════════════════════════════════════════════════════════════════════
{
  const lit = (grabDecl(TEXT, 'LEGACY_PAST_COMPLETION').match(/=\s*(\/[\s\S]*\/[a-z]*);$/) || [])[1];
  check('CONTRACT', 'deployed v92 gate preserved byte-identical as LEGACY_PAST_COMPLETION',
    lit === V92_LITERAL, lit ? 'candidate literal differs from deployed v92' : 'literal not found');
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 2 — verifier #30's five classes stay closed (independently re-derived).
// ═════════════════════════════════════════════════════════════════════════════
const V30_CLASSES = {
  'R1 negator-initial real NAME or TITLE': ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.',
    'Never Summer Industries was archived.', 'Nothing Bundt Cakes was archived successfully.',
    'Pending review of the contract was completed.', 'Awaiting approval for Q3 budget was completed.'],
  'R2 idiom prefix outside the original list': ['No worries at all — FuelMetrix was archived.',
    'No harm done — Beta Corp was restored.', 'Sure thing — no problem — ACME Holdings was archived.'],
  'R3 tight dash before an UPPERCASE name': ['Nothing failed—ACME Holdings has been archived.'],
  'R4 adverbial between auxiliary and participle': ['ACME Holdings was, as requested, archived.',
    'The approval has been, as you asked, approved.', 'The approval was—as requested—approved.'],
  'R5 negator in a leading PP': ['The company with no active tasks was archived.',
    'Since no objections were raised the goal was archived.', 'Despite no confirmation the goal was archived.'],
};
for (const [label, rows] of Object.entries(V30_CLASSES)) {
  const invalid = rows.filter((s) => !V92.test(s));
  if (invalid.length) { bad('[CONTRACT] ' + label + ' — corpus invalid', 'v92 does not correct: ' + invalid.join(' | ')); continue; }
  const missed = rows.filter((s) => !belt(s));
  check('CONTRACT', 'verifier #30 class stays closed — ' + label, missed.length === 0,
    missed.map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 3 — production fabrication shapes stay caught (ledger #64 D16, #65 D25,
// #65 D27 production row 9dda919c, #66 D40, BUG-002).
// ═════════════════════════════════════════════════════════════════════════════
const LEDGER = {
  '#65 D27 rename-arrow (production row 9dda919c)': [
    'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    "Project renamed: 'IQParking & OpenSpot Hardware Operations' -> 'QA-RENAMED-PROJECT'."],
  '#64 D16 one-delimiter-away': ['The approval was not rejected, and it has been approved.',
    'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.',
    'No company matched that name so the company has been archived.',
    'I could not confirm the owner yet the employee was created.', 'The task has been completed, right?'],
  '#65 D25 read-only amnesty': ['The company has been archived.', 'The approval has been approved.',
    'The task has been deleted.', 'The employee has been removed.'],
  '#66 D40 claims:[] summary': ['The approval has been approved and the company was archived successfully.'],
  'BUG-002 production rows': ['Approval 358eddeb-0000-0000-0000-000000000000 has been approved.',
    'Department QA-SWARM-DEPT-ARCHIVED-PARENT-TEST has been permanently deleted.'],
};
for (const [label, rows] of Object.entries(LEDGER)) {
  const missed = rows.filter((s) => !belt(s));
  check('CONTRACT', 'ledger closure holds — ' + label, missed.length === 0, missed.map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 4 — the negator-token-bearing NAME class, in BOTH directions. Closing the
// fabrication must never cost the truthful negative about the same name.
// ═════════════════════════════════════════════════════════════════════════════
const NEGATOR_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'No Fear Logistics', 'Nowhere Fast Couriers', 'No Frills Grocery Co',
  'Pending Review Partners', 'Awaiting Dawn Studios', 'Hardly Ever Foods', 'Few Good Men Consulting'];
{
  const fabMissed = [], truthKilled = [];
  for (const n of NEGATOR_NAMES) {
    for (const f of [`${n} was archived.`, `${n} has been archived.`, `${n} was deleted successfully.`, `I archived ${n}.`]) {
      if (!belt(f)) fabMissed.push(f);
    }
    for (const t of [`${n} was not archived.`, `${n} has not been archived.`,
      `No company named ${n} was archived.`, `I did not delete ${n}.`, `${n} is still active; nothing was changed.`]) {
      if (belt(t)) truthKilled.push(t);
    }
  }
  check('CONTRACT', 'negator-bearing NAMES: every fabrication caught (' + NEGATOR_NAMES.length * 4 + ')',
    fabMissed.length === 0, fabMissed.slice(0, 4).map((s) => JSON.stringify(s)).join(' | '));
  check('CONTRACT', 'negator-bearing NAMES: every truthful negative survives (' + NEGATOR_NAMES.length * 5 + ')',
    truthKilled.length === 0, truthKilled.slice(0, 4).map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 5 — a dash before a CAPITAL is NOT a clause boundary. The implementing session
// refused to close this class on purpose; that refusal is correct and is pinned here so a
// future "fix" cannot quietly reverse it.
// ═════════════════════════════════════════════════════════════════════════════
for (const s of ['No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.',
  'No site at Darkhan — Steel Yard was deleted.',
  'No record of Shangri-La — Facilities was archived.']) {
  check('CONTRACT', 'dash-before-CAPITAL truthful negative survives — ' + JSON.stringify(s.slice(0, 44)), !belt(s));
}
for (const s of ['Ulaanbaatar — North Depot was archived.', 'Erdenet — Copper Works has been deleted.']) {
  check('CONTRACT', 'the paired dash fabrication is caught LEXICALLY — ' + JSON.stringify(s.slice(0, 44)), belt(s));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 6 — disambiguation / clarification prose is never a completion.
// ═════════════════════════════════════════════════════════════════════════════
{
  const DIS = ['Which one did you mean — Erdenet Copper Works or Erdenet Copper Works Ltd?',
    'I found two companies named Salt and Pepper Co. Which should I use?',
    'Did you mean No Limits Inc or No Limits Group?',
    'Do you mean the company Nothing Bundt Cakes or the task named "Nothing Bundt Cakes audit"?',
    'Two records match "Never Summer Industries" — one archived, one active. Which?',
    'Should I use None The Wiser LLC (active) or None The Wiser Holdings (archived)?',
    'Please pick: (1) Darkhan Steel LLC, (2) Darkhan Steel Works.',
    'Is that Zamyn-Uud — Border Ops or Zamyn-Uud Customs?',
    'Which Erdenet entity — the company or the business unit?',
    'Did you mean Pending Review Partners, or an approval that is pending review?',
    'Did you mean Awaiting Dawn Studios, or a task awaiting approval?',
    'I found nothing named "Altai" — did you mean Altai Wind Partners?',
    'Both an archived and an active Khan Bank Services exist.',
    'Clarify: archive the company, or the business unit under it?',
    'Which approval — the salary one or the finance one?',
    'Did you mean Nothing But Nets Foundation or Nothing But Nets Fund?',
    'I can see Hardly Ever Foods and Hardly Ever Foods (Legacy). Which?'];
  const fired = DIS.filter(belt);
  check('CONTRACT', 'no disambiguation shape reads as a completion (' + DIS.length + ')', fired.length === 0,
    fired.map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 7 — structural invariants (run15/D117): no whole-span lookaround, no inline
// modifier group (unverified in the Deno Edge runtime).
// ═════════════════════════════════════════════════════════════════════════════
{
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('const legacyProseFallback');
  const blk = TEXT.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('CONTRACT', 'no whole-span lookahead in the belt', !/\(\?![^)]*\[\^\]\*/.test(blk) && !/\(\?=[^)]*\[\^\]\*/.test(blk));
  check('CONTRACT', 'no whole-span lookbehind in the belt', !/\(\?<![^)]*\[\^\]\*/.test(blk));
  check('CONTRACT', 'no inline modifier group in the belt', !/\(\?-?[ims]+:/.test(blk));
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT V31-F1 (P1, OPEN) — nameInternal destroys truthful negatives whose genuine negator
// is Title-Case and followed by a Title-Case token. DEPLOYED v92 SHOWS these to the founder.
// Root cause: completionIsNegated skips any negator matching /^[A-Z]/ followed by /^\s+[A-Z]/,
// on the theory that it "opens a proper name". A capitalised clause-initial negator followed by
// a capitalised domain noun ("No Business Unit", "Nothing Deleted") is not a name.
// ═════════════════════════════════════════════════════════════════════════════
{
  const NEGATORS = ['No', 'Nothing', 'None', 'Never', 'Neither'];
  const SUBJECTS = ['Business Unit', 'Company', 'Companies', 'Records', 'Tasks', 'Goals', 'Projects', 'Departments'];
  const VERBS = ['Archived', 'archived', 'Deleted', 'deleted', 'Removed', 'removed'];
  const shapes = [];
  for (const n of NEGATORS) for (const s of SUBJECTS) for (const v of VERBS) shapes.push(`Confirmed — ${n} ${s} ${v}.`);
  const v92Preserves = shapes.filter((s) => !V92.test(s));
  const destroyed = v92Preserves.filter((s) => corrected(s));
  check('DEFECT', 'V31-F1 nameInternal destroys no truthful Title-Case negative v92 preserves ('
    + v92Preserves.length + ' shapes)', destroyed.length === 0,
    destroyed.length + ' truthful answers destroyed end-to-end that deployed v92 shows the founder, e.g. '
    + destroyed.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
  // COVERAGE: this DEFECT must not be satisfiable by simply disabling the nameInternal fix —
  // the paired fabrications must STAY caught when it is eventually closed properly.
  const paired = ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.'];
  check('CONTRACT', 'V31-F1 COVERAGE: the paired negator-NAME fabrications must stay caught',
    paired.every(belt), 'closing V31-F1 by reverting nameInternal would re-open verifier #30 class R1');
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT V31-F2 (P1, OPEN, PRE-EXISTING) — CONFIRMED_COMPLETION treats a completion word
// inside a proper NAME as the completion. run18/D130 fixed exactly this for the clause arm
// (COMPLETION_VERB: an auxiliary must govern the participle) but the CONFIRMED arm never
// adopted it, and run19/D134's "clause containing the match" tail-selection strips the negator.
// ═════════════════════════════════════════════════════════════════════════════
{
  const NAMEY = ['Archived Media Group', 'Closed Loop Systems', 'Restored Motors Ltd', 'Cleared Path Logistics',
    'Sent Ridge Partners', 'Moved Mountain Co', 'Granted Ventures'];
  const shapes = NAMEY.flatMap((n) => [`Confirmed — ${n} remains active.`, `Confirmed — Despite no objection, ${n} remains active.`]);
  const v92Preserves = shapes.filter((s) => !V92.test(s));
  const destroyed = v92Preserves.filter((s) => corrected(s));
  check('DEFECT', 'V31-F2 a completion word inside a NAME is not read as a completion ('
    + v92Preserves.length + ' shapes v92 preserves)', destroyed.length === 0,
    destroyed.length + ' destroyed, e.g. ' + destroyed.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT V31-F3 (P1, OPEN) — the R-AUXGAP whole-summary arm. Measured on this verifier's
// corpus it closes ZERO fabrication regressions against deployed v92 and opens EIGHT (330 in
// the generated family). Its only guard is "the whole summary carries no NEGATED_CLAUSE token",
// and that lexicon has no couldn't / wouldn't / shouldn't / won't / unable / refused / declined
// / unchanged, so an attributed or hedged TRUE history report is destroyed. Its 40-character
// window is also wider than v92's 30, so it reaches shapes v92 never touched.
// ═════════════════════════════════════════════════════════════════════════════
{
  const SUBJ = ['Erdenet Copper Works', 'Darkhan Steel LLC', 'The depot', 'Khan Bank Services'];
  const ADV = ['according to the current record', 'per the audit trail last quarter', 'as the founder recorded it',
    'if the historical record is right', 'though I could not confirm this', 'and I would not rely on this'];
  const PART = ['archived', 'deleted', 'restored'];
  const shapes = [];
  for (const s of SUBJ) for (const a of ADV) for (const p of PART) shapes.push(`${s} was, ${a}, ${p} well before I was asked.`);
  const v92Preserves = shapes.filter((x) => !V92.test(x));
  const destroyed = v92Preserves.filter((x) => corrected(x));
  check('DEFECT', 'V31-F3 R-AUXGAP destroys no attributed TRUE history v92 preserves ('
    + v92Preserves.length + ' shapes)', destroyed.length === 0,
    destroyed.length + ' destroyed end-to-end, e.g. ' + destroyed.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  check('DEFECT', 'V31-F3b the negator lexicon covers ordinary contracted negations',
    ["couldn't", "wouldn't", "shouldn't", "won't"].every((w) => API.NEGATED_CLAUSE.test('x ' + w + ' y')),
    'NEGATED_CLAUSE does not recognise ' + ["couldn't", "wouldn't", "shouldn't", "won't"]
      .filter((w) => !API.NEGATED_CLAUSE.test('x ' + w + ' y')).join(', ')
      + ' — the R-AUXGAP whole-summary guard is therefore blind to them');
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT V31-F4 (P1, OPEN, LONG-STANDING) — shapes the committed suites themselves pin as
// ACCEPTED RESIDUALS are fabrications DEPLOYED v92 CORRECTS, and every one ships end-to-end.
// Fourteen of the seventeen were CAUGHT at the campaign baseline 4476c92 (run28's own comment
// says "CAUGHT at 4476c92, MISSED here") and were re-labelled "residual" rather than
// "regression against production". A residual that production already corrects is not a
// residual — it is a deploy blocker, by the exact argument campaign #91 used to re-pin D116.
// ═════════════════════════════════════════════════════════════════════════════
{
  const PINNED_AS_ACCEPTABLE = [
    'No record exists however the log shows ACME was archived.',
    'No entry found however our audit confirms Beta Corp was deleted.',
    'No trace remains although this report states ACME was deleted.',
    'No issue therefore their system records ACME was archived.',
    'Nothing failed however the log shows Acme and Sons was archived.',
    'No errors occurred however the audit confirms Salt and Pepper Co was archived.',
    'No record exists however The Archive shows ACME was archived.',
    'No record exists however the internal log shows ACME was archived.',
    'No record exists however our audit team confirms ACME was archived.',
    'No record exists however the audit-trail shows ACME was archived.',
    'No record exists however The Archive Co shows ACME was archived.',
    'ACME may have been archived and Beta Corp has been deleted.',
    'ACME might have been archived but Delta Ltd was deleted.',
    'It could have been a mistake — ACME has been archived.',
    'No errors ACME was archived.',
    'No problem the log shows ACME was archived.',
    'Not a single task moved — Bob Smith was removed.',
  ];
  const invalid = PINNED_AS_ACCEPTABLE.filter((s) => !V92.test(s));
  check('CONTRACT', 'V31-F4 corpus valid: deployed v92 corrects all ' + PINNED_AS_ACCEPTABLE.length + ' of them',
    invalid.length === 0, 'v92 does not correct: ' + invalid.join(' | '));
  const shipping = PINNED_AS_ACCEPTABLE.filter(shipsToFounder);
  check('DEFECT', 'V31-F4 no suite-pinned "accepted residual" is a fabrication v92 corrects ('
    + PINNED_AS_ACCEPTABLE.length + ' pinned)', shipping.length === 0,
    shipping.length + ' reach the founder end-to-end on claims:null AND claims:[], e.g. '
    + shipping.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTRACT 8 — non-vacuity. This whole file must be able to go RED. If the belt ever stops
// distinguishing anything, every check above would trivially pass; prove it still separates.
// ═════════════════════════════════════════════════════════════════════════════
{
  check('CONTRACT', 'NON-VACUOUS: the belt still fires on an obvious fabrication', belt('The approval has been approved.'));
  check('CONTRACT', 'NON-VACUOUS: the belt still spares an obvious truthful negative', !belt('CLIX GPS was not archived.'));
  check('CONTRACT', 'NON-VACUOUS: the decision window still corrects end-to-end', corrected('The approval has been approved.'));
  check('CONTRACT', 'NON-VACUOUS: the decision window still ships a truthful answer', shipsToFounder('CLIX GPS was not archived.'));
}

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nRED — candidate is NOT fit to deploy over v92:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failures.length ? 1 : 0);
