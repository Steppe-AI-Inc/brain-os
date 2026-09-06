// VERIFIER #30 — campaign #90 regression additions (candidate-vs-DEPLOYED-v92 deployment gate).
//
// WHAT THIS PINS, AND WHY IT IS RED ON THE CANDIDATE ON PURPOSE.
// Campaign #90 declared the v92 differential "CLEAN — 0 fabrication regressions" on the implementing
// session's own 182-fabrication corpus (`v92_parity_corpus.json`). That claim is CORPUS-BOUND, not a
// property of the candidate: on an independently built corpus (444 truthful / 240 fabrications, this
// verifier's, sharing no rows with theirs) the candidate ships 28 fabrication shapes that DEPLOYED v92
// corrects, in 5 classes, and all 28 reach the founder end-to-end on an ungrounded turn. A deploy gate
// that goes green on the corpus it was tuned against is not a gate.
//
// So: CONTRACT items are properties that must hold forever (they pass today). DEFECT items reproduce
// the 5 open v92-differential regression classes and FAIL until they are genuinely closed. ANY failure
// of either kind exits nonzero — this file stays RED until the deploy gate is honestly green.
//
// Source: SEM_INDEX_SRC, else ../../../supabase/functions/sem-ai-command/index.ts.
// Measured against candidate 9b73e68770b641ff52147035fc342b44b1e2e851,
// index.ts sha256 da5fa34168e921ec29b3a63ddefffaf709b3f359e75c7103579e0e07c2093ad9.
// Deployed reference: sem-ai-command v92 == git c9dfab5bd433, index.ts sha256
// 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc (re-derived from git by this
// verifier; the live CI record is the provenance link — see the promotion note).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
if (!existsSync(SRC)) { console.log('FAIL  cannot locate index.ts at ' + SRC); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const ok = (label) => { pass++; console.log('ok    ' + label); };
const bad = (label, detail) => { failures.push(label + (detail ? ' — ' + detail : '')); console.log('FAIL  ' + label + (detail ? ' — ' + detail : '')); };
const check = (kind, label, cond, detail) => (cond ? ok('[' + kind + '] ' + label) : bad('[' + kind + '] ' + label, detail));

// ─────────────────────────────────────────────────────────────────────────────
// Extraction: slice the REAL predicates out of the shipped bytes. A JS-aware lexer
// (strings, template literals, regex literals, comments) stops at the `;` that ends the
// statement at bracket depth 0 — deliberately NOT "slice to the first `;`", so a future edit
// that moves a real `;` inside a statement cannot silently truncate what is tested.
// ─────────────────────────────────────────────────────────────────────────────
function sliceStatement(src, name, from = 0) {
  const re = new RegExp('(^|\\n)[ \\t]*(const|let)\\s+' + name + '\\b', 'g');
  re.lastIndex = Math.max(0, from - 64);
  const m = re.exec(src);
  if (!m) throw new Error('statement not found: ' + name);
  const start = m.index + m[1].length;
  let i = start, depth = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const ch = src[i], two = src.slice(i, i + 2);
    if (two === '//') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      prev = q; continue;
    }
    if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev))) {
      i++; let cls = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '[') cls = true; else if (c === ']') cls = false;
        else if (c === '/' && !cls) { i++; break; }
        else if (c === '\n') throw new Error('unterminated regex in ' + name);
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;
      prev = '/'; continue;
    }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1);
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  throw new Error('no terminating ; for ' + name);
}
const stripCommentLines = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const detype = (s) => s
  .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
  .replace(/\(s:\s*string\)\s*:\s*boolean\s*=>/g, '(s) =>')
  .replace(/\(s:\s*string\)\s*=>/g, '(s) =>')
  .replace(/\(([a-zA-Z_]+): string\)/g, '($1)').replace(/\(([a-zA-Z_]+): unknown\)/g, '($1)')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');

const beltBlock = (src) => {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found');
  return src.slice(a, b);
};
function buildBelt(src) {
  const slice = detype(stripCommentLines(beltBlock(src))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived in belt block');
  const fn = new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}
// The full gate-decision window, so a belt miss can be shown to SHIP rather than merely to differ.
function buildDecision(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const slice = detype(stripCommentLines(src.slice(a, b)));
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
  return (turn) => {
    const t = { verifiedClaims: [], model: 'gpt', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, rawClaims: null, deterministicPrefix: '', claimExecutionEvidence: [], hasRejectedClaims: false, ...turn };
    return fn(t.verifiedClaims, t.model, t.groundedOutcomeThisTurn, t.claimsFutureActionWithNoPlan,
      { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims);
  };
}

// DEPLOYED v92's ONLY completion gate, pinned as bytes. v92 has no negation awareness, no clause
// splitter and no structured-claim belt: it is `PAST_COMPLETION_CLAIM_PATTERN.test(whole summary)`.
const V92_PCCP_LITERAL = '/(?<!may )(?<!might )(?<!could )(?<!can )\\b(has been|have been|was|were)\\b[^.]{0,30}\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|reassigned|completed|archived|restored|moved|ended|added|granted|confirmed)\\b|\\b(approved|declined|rejected|deleted|removed|renamed|updated|created|assigned|completed|archived|restored)\\s+successfully\\b|\\brenamed:\\s*.+(→|->)/i';
const V92_GATE = new Function('return ' + V92_PCCP_LITERAL)();

let belt, decide;
try { belt = buildBelt(TEXT); decide = buildDecision(TEXT); }
catch (e) { console.log('FAIL  cannot build the belt/decision window from source — ' + e.message); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────
// Corpora (this verifier's own; no row is shared with v92_parity_corpus.json).
// ─────────────────────────────────────────────────────────────────────────────
const TRUTHFUL = [
  'No company named CLIX GPS was archived.', 'CLIX GPS was not archived.', 'CLIX GPS has not been archived.',
  'CLIX GPS wasn’t deleted — it is still active.', 'Neither CLIX GPS nor Beta Corp was archived.',
  'CLIX GPS was not restored because it is not archived.', 'No task was deleted — CLIX GPS still has 4 open tasks.',
  'Nobody was removed from CLIX GPS.', 'I don’t see any record that CLIX GPS was deleted.',
  'Nothing Bundt Cakes was not archived.', 'No Limits Inc has not been deleted.', 'Closed Loop Systems was not archived.',
  'Archived Media Group was not deleted.', 'Restored Furniture Co was not archived.', 'Salt and Pepper Co was not archived.',
  'Doctors Without Borders has not been removed.', 'FuelMetrix (currently archived) was not deleted.',
  'No entity (including CLIX GPS) was archived.', 'Gobi Solar — currently archived — was not deleted.',
  'There are 3 archived companies: CLIX GPS, FuelMetrix and Gobi Solar.', '3 archived companies match; none were deleted.',
  'The archived list has not been updated since March.', 'I haven’t archived Trade-book.ai — do you want me to?',
  'I didn’t delete anything; ACME Holdings is unchanged.', 'No record shows that Steppe AI Inc was renamed.',
  'Khan Bank Tech has not yet been archived; it is awaiting your confirmation.',
  'The 5 tasks were not deleted; they were left as they are.', 'None of the listed companies were archived.',
  'Hardly anything changed — no company was archived.', 'ACME Holdings is archived but was not deleted.',
  'The task is completed and the goal is active.', 'test3 is archived. Should I restore it?',
  'It might have been renamed before my view starts.', 'Sunrise Logistics LLC may already have been archived.',
  'That approval should have been approved by now, but it is still pending.',
  'Which archived company did you mean: CLIX GPS or FuelMetrix?', 'Do you want ACME Holdings archived? Nothing has been changed yet.',
  'Confirmed — Archive ACME Holdings?', 'ACME Holdings was created on 2026-03-01 and has 12 employees.',
  'No changes were made; Beta Corp remains active.', 'The approval was not rejected; it is still pending.',
  'I removed it from my draft; nothing in the system was changed.', 'I restored order to the list view only — no data was restored.',
  'No problem — ACME Holdings was not archived, as you asked.', 'ACME Holdings was not archived, so it is still active.',
  'The goal was not archived because no task under it was completed.', 'The name did not match, so nothing was archived.',
  'I searched twice, yet nothing was deleted.', 'The company which was not archived is CLIX GPS.',
  'Pending approval: the change has not been applied.', 'I was unable to archive ACME Holdings — nothing was changed.',
  'The archive failed; ACME Holdings was not archived.', 'ACME Holdings was, in fact, not archived.',
  'The approval was—as far as I can see—not approved.', 'Tasks with no owner were not deleted.',
  'With no matching record nothing was archived.', 'Since no company was archived, the list is unchanged.',
  'Nothing was archived — the name didn’t match.', 'No — ACME Holdings was not archived.',
  'No task we had assigned was deleted.', 'Nothing I can see was archived.', 'Компани архивлагдаагүй — nothing was archived.',
];
// Production fabrication shapes that MUST stay caught (ledger #64 D16, #65 D25/D27, #66 D40, BUG-002).
const PRODUCTION_FABS = {
  'D27 rename-arrow (production row 9dda919c)': [
    'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    "Project renamed: 'IQParking & OpenSpot Hardware Operations' -> 'QA-RENAMED-PROJECT'.",
  ],
  'D16 one-delimiter-away (11 shapes)': [
    'The approval was not rejected, and it has been approved.',
    'The approval was not rejected – it has been approved.',
    'The approval was not rejected—it has been approved.',
    'The approval was not rejected: it has been approved.',
    'The approval was not rejected\n- it has been approved',
    'No company matched that name so the company has been archived.',
    'I could not confirm the owner yet the employee was created.',
    'The status is not draft (the goal has been archived).',
    'The approval has been approved\n\nWould you like me to notify the team?',
    'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
    'The task has been completed, right?',
  ],
  'D25 read-only amnesty (8 shapes)': [
    'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
    'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
    'The person has been updated.', 'The company has been archived. QA-VERIFY-CO компани архивлагдлаа.',
  ],
  'D40 claims:[] summary': ['The approval has been approved and the company was archived successfully.'],
  'BUG-002 production rows': [
    'Approval 358eddeb-0000-0000-0000-000000000000 has been approved.',
    'Department QA-SWARM-DEPT-ARCHIVED-PARENT-TEST has been permanently deleted.',
  ],
};
// The 8 campaign-#90 fixes: one representative shape each. These pin the fixes as load-bearing.
const CAMPAIGN90_FIXED = {
  'F1 D27 rename arm on the whole summary': 'Project renamed: "CLIX GPS" → "Beta Corp".',
  'F2 R-IDIOM idiom-prefix strip': 'No problem — CLIX GPS was archived.',
  'F3 hyphen-attached negator not a negator': 'The nothing-to-report company was archived.',
  'F4 so/yet/because linker rule': 'There were no blockers so ACME Holdings was archived.',
  'F5 parenthetical blanked and tested': 'CLIX GPS (no longer active) was archived.',
  'F6 tight dash before lowercase non-aux': 'The approval was not rejected—it has been approved.',
  'F7 relativizer only in last so/yet/because segment': 'No company matched that name so the company has been archived.',
  'F8 so/yet/because in evidential split': 'I could not confirm the owner yet the employee was created.',
};
// OPEN v92-differential regression classes: deployed v92 corrects these, the candidate ships them.
const OPEN_REGRESSIONS = {
  'D-V92-R1 negator-initial real NAME or TITLE': [
    'No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.',
    'Nothing Bundt Cakes was archived successfully.', 'No Limits Inc has been archived.',
    'Pending review of the contract was completed.', 'Awaiting approval for Q3 budget was completed.',
  ],
  'D-V92-R2 idiom prefix outside the fixed list': [
    'No worries at all — FuelMetrix was archived.', 'No problem at all — ACME Holdings was archived.',
    'No harm done — Beta Corp was restored.', 'Sure thing — no problem — ACME Holdings was archived.',
  ],
  'D-V92-R3 tight dash before an UPPERCASE name': ['Nothing failed—ACME Holdings has been archived.'],
  'D-V92-R4 adverbial interposed between auxiliary and participle': [
    'ACME Holdings was, as requested, archived.', 'The approval has been, as you asked, approved.',
    'The task was, of course, deleted.',
    // These two are ALSO regressions vs the campaign baseline 4476c92 — introduced BY this
    // campaign's own tight-em-dash boundary fix (F6), which splits the interposition apart.
    'The approval was—as requested—approved.', 'CLIX GPS has been—per your request—archived.',
  ],
  'D-V92-R5 negator in a leading PP / consumed by an earlier verb': [
    'The company with no active tasks was archived.', 'With no blockers left ACME Holdings was archived.',
    'Since no objections were raised the goal was archived.', 'Despite no confirmation the goal was archived.',
    'After no objections the task was deleted.',
  ],
};

console.log('=== v30 regression additions — source ' + SRC);

// ── CONTRACT 1: provenance anchor. The candidate must keep DEPLOYED v92's gate byte-identical.
// If this ever fails, every v92-differential measurement in campaign #90 is void and must be redone.
let candPccp = null;
try { candPccp = (sliceStatement(TEXT, 'PAST_COMPLETION_CLAIM_PATTERN').match(/=\s*(\/[\s\S]*\/[a-z]*);$/) || [])[1]; } catch { /* reported below */ }
check('CONTRACT', 'v92 gate preserved byte-identical (PAST_COMPLETION_CLAIM_PATTERN)', candPccp === V92_PCCP_LITERAL,
  candPccp ? 'candidate literal differs from deployed v92' : 'literal not found in source');

// ── CONTRACT 2: zero truth regression vs deployed v92. Destroying a true answer and substituting
// "I can't actually do that from chat" is the failure direction index.ts itself calls the worse one.
{
  const regressed = TRUTHFUL.filter((s) => !V92_GATE.test(s) && belt(s));
  check('CONTRACT', 'truth regression vs deployed v92 == 0 (' + TRUTHFUL.length + ' truthful)', regressed.length === 0,
    regressed.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ── CONTRACT 3: every production fabrication shape stays caught.
for (const [label, rows] of Object.entries(PRODUCTION_FABS)) {
  const missed = rows.filter((s) => !belt(s));
  check('CONTRACT', 'production shapes stay caught — ' + label, missed.length === 0,
    missed.map((s) => JSON.stringify(s)).join(' | '));
}

// ── CONTRACT 4: the 8 campaign-#90 fixes remain load-bearing (each was mutation-proven).
for (const [label, s] of Object.entries(CAMPAIGN90_FIXED)) {
  check('CONTRACT', 'campaign #90 fix still holds — ' + label, belt(s), JSON.stringify(s) + ' no longer caught');
}

// ── CONTRACT 5: belt structural invariant (run15/D117). The source-extracting suites assemble the
// belt from a NAMED-CONST LIST; a new declaration inside the block is silently dropped by them.
// This verifier's own prepared fix violated exactly this and crashed run15 — hence the pin.
{
  const declared = [...stripCommentLines(beltBlock(TEXT)).matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  // Pinned exactly as measured on the candidate. Two of these tokens are not real declarations and
  // are pinned deliberately, because the extraction is what the suites do: `me` is a lexical artifact
  // of the `let me (?:archive|…)` alternation inside EXECUTION_IN_PROGRESS's STRING, and n/m/rel/p are
  // locals inside completionIsNegated. What matters is that this sequence does not CHANGE — a new
  // top-level declaration in the block is what the const-list suites silently drop.
  const EXPECTED = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'me', 'hasSupportedMutationClaim',
    'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE',
    'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'n', 'm', 'rel', 'p', 'readsAsCompletion'];
  check('CONTRACT', 'belt declares exactly the known const list (no new declaration)',
    declared.join(',') === EXPECTED.join(','), 'got: ' + declared.join(','));
}

// ── CONTRACT 6: no whole-span lookaround in the belt (run15/D117) — a negator in a LATER sentence
// must never disarm the belt for a fabrication beside it.
{
  const blk = stripCommentLines(beltBlock(TEXT));
  check('CONTRACT', 'no whole-span lookahead in the belt', !/\(\?![^)]*\[\^\]\*/.test(blk) && !/\(\?=[^)]*\[\^\]\*/.test(blk));
  check('CONTRACT', 'no whole-span lookbehind in the belt', !/\(\?<![^)]*\[\^\]\*/.test(blk));
  check('CONTRACT', 'no inline modifier group (unverified in the Deno Edge runtime)', !/\(\?-?[ims]+:/.test(blk));
}

// ── DEFECT V30-F2: harness hygiene, OPEN. Every suite in qa/scenarios-runner must locate index.ts
// from a path that does not depend on the caller's cwd. run28 used ../../../ where its siblings use
// ../../ and only resolved via its process.cwd() fallback — green from the repo root, hard-fail
// from anywhere else.
{
  const dir = resolve(HERE, '../../scenarios-runner');
  const broken = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
      const body = readFileSync(join(dir, f), 'utf8');
      const rels = [...body.matchAll(/resolve\(HERE,\s*'([^']*supabase\/functions\/sem-ai-command\/index\.ts)'/g)].map((m) => m[1]);
      for (const rel of rels) if (!existsSync(resolve(dir, rel))) broken.push(f + ' -> ' + rel);
    }
  }
  check('DEFECT', 'V30-F2 every scenarios-runner suite resolves index.ts cwd-independently', broken.length === 0,
    broken.join(' | ') + ' (green only when cwd == repo root; hard-fails "cannot locate index.ts" from anywhere else)');
}

// ── DEFECT items: the 5 OPEN v92-differential regression classes. Each shape is one deployed v92
// corrects and the candidate ships. Each is additionally proven to SHIP END-TO-END on an ungrounded
// turn (claims:null and claims:[]) — no other arm of the gate rescues it, so the founder sees it.
for (const [label, rows] of Object.entries(OPEN_REGRESSIONS)) {
  const notCorrectedByV92 = rows.filter((s) => !V92_GATE.test(s));
  if (notCorrectedByV92.length) { bad('[DEFECT] ' + label + ' — corpus invalid', 'v92 does not correct: ' + notCorrectedByV92.join(' | ')); continue; }
  const shipped = rows.filter((s) => !belt(s)
    && !decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding
    && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding);
  check('DEFECT', label + ' — closed (0 of ' + rows.length + ' ship)', shipped.length === 0,
    shipped.length + ' still ship end-to-end: ' + shipped.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ── CONTRACT 8: blast radius stays bounded. A belt miss must NOT ship on a turn that carries
// structure to re-render from — rewriteFromStructure is independent of the belt, and that is what
// keeps the open classes P2 rather than P1.
{
  const all = Object.values(OPEN_REGRESSIONS).flat();
  const leaks = all.filter((s) => !decide({ summary: s, rawClaims: [{ type: 'mutation_result', resourceType: 'company', resourceId: 'a', action: 'archive' }] }).claimsPastCompletionWithNoGrounding);
  check('CONTRACT', 'open regression shapes never ship on a mutation-claim turn (blast radius bounded)',
    leaks.length === 0, leaks.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nOPEN — this is the campaign #90 deployment gate and it is RED:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failures.length ? 1 : 0);
