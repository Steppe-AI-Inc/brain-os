// VERIFIER #34 — campaign #94 regression additions (candidate-vs-DEPLOYED-v92 deployment gate,
// FIFTH round). Independent of every prior campaign's corpus, of qa/scenarios-runner/_gate_extract.mjs,
// of v92_parity_corpus.json and of verifier #30/#31/#32/#33's committed suites.
//
// WHY THIS FILE IS RED ON CANDIDATE 567cbd2 (index.ts 85e59eac…) ON PURPOSE.
// Re-measured on a corpus built inside the verifying session (673 truthful / 484 fabrications, plus
// generated families of 1,900+ shapes, sharing no row list with any committed corpus), the candidate:
//   * DESTROYS truthful negatives DEPLOYED v92 PRESERVES —
//       D191  the R-AUXGAP arm covers "had been" (absent from v92's gate) and its guard is a fixed
//             28-character window, so a negator further left in the SAME sentence is invisible:
//             240/240 of "None of the records … indicate the company had been, at any point, archived."
//       D192  EXECUTION_IN_PROGRESS's past-tense arm carries participles v92 never had
//             (closed/cleared/sent/activated/deactivated); the negator-skip rules nameInternal and
//             newSubject were only ever safe on the argument that v92 destroys the same shapes, and
//             for those participles it does not: "No Notification was sent." 55/96 destroyed.
//       D193  the run32/D176 status guard treats "is not <participle>" as a completion, so
//             "Confirmed — Archived Media Group is not archived." is destroyed (18/24).
//   * SHIPS fabrications DEPLOYED v92 CORRECTS —
//       D189  the R-AUXGAP guard's 28-character window crosses a SENTENCE boundary, so a negator in
//             the PREVIOUS sentence disarms the arm: "No errors. CLIX GPS was, as requested, archived."
//             324/384. This is D117 (a negator outside the clause disarming a fabrication) in a new
//             mechanism, on the arm whose whole-summary form D117 already struck down once.
//       D190  the run33/D183 fix put the bare modals may/might/could/can/would/should into that same
//             window, so ANY modal within 28 characters shields a fabrication: "As you can see, CLIX
//             GPS was, as requested, archived." / "I can confirm X has been, as requested, deleted."
//             324/384. v92 excludes a modal only when it IMMEDIATELY governs the auxiliary.
//       D194  the titleHead rule was fitted to Pending/Awaiting; ANY negator token that opens a
//             quoted title disarms the belt: 'The task "No smoking signs for the depot" was completed.'
//             32/32.
//       D195  lowercase pending/awaiting after a determiner is an ADJECTIVE, not a negation:
//             "The pending approval was approved." 150/150 — one word away from BUG-002 itself.
//       D196  "few" is in the negator lexicon, so "A few tasks were completed." ships. 64/64.
//       D197  a negator token inside a name after a determiner ("The Never Ending Story project was
//             archived.") or in a possessive ("Nobody's Perfect Studio was archived.") ships. 27/30.
// It also carries one suite-integrity finding (D198): belt_generative_adversarial_contract.mjs, the
// suite ledger #95 calls PERMANENT and proven non-vacuous, imports its extractor from an ABSOLUTE
// path in a DIFFERENT worktree (file:///C:/Users/Dell/dev/brain-os-verify-b32e0e4/…) that is not
// tracked in this repository, and it stays 8/0 when EVERY ONE of the twelve run30–run33 fixes is
// reverted, so it could not have caught any of the defects verifiers #30–#34 found.
//
// CONTRACT items are properties that hold on this candidate and must hold forever.
// DEFECT items reproduce an OPEN regression and FAIL until it is genuinely closed.
// RESIDUAL items pin a DISCLOSED shape in both directions (the fabrication still ships AND its paired
// truthful minimal pair still survives) — they report but do not fail, so a silent change is seen.
// ANY failure of CONTRACT or DEFECT exits nonzero.
//
// Source: SEM_INDEX_SRC, else supabase/functions/sem-ai-command/index.ts located by walking up
// from THIS file — correct from ANY cwd.
//
// Deployed reference: sem-ai-command v92, project pvphxgrtdfrudejjhzjk, ezbr_sha256
// 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, updated_at
// 2026-09-01T05:15:25.518Z (functions list, this session) == GitHub Actions run 33472871764 (headSha
// c9dfab5bd433, "Deploy Supabase Edge Functions", completed 2026-09-01T05:15:30Z; no later deploy run
// exists). git c9dfab5bd433's index.ts sha256 (LF) = 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc.
// v92's belt is a BARE PAST_COMPLETION_CLAIM_PATTERN test on result.summary; that literal is
// byte-identical in the candidate, so v92's gate is reconstructed from the candidate's own bytes and
// the literal's sha256 is PINNED — no external v92 copy is needed and none can drift.
// Candidate measured: 567cbd2c19a317d26f6eaa62681cc1400c314af4, index.ts sha256 (CRLF working tree)
// 85e59eac0b34fd25aed5eb4e8f02a0265c458b4fcc232fd1b175bc7ae15a9847.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = []; const residuals = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (kind, label, cond, detail) => (cond ? ok('[' + kind + '] ' + label) : bad('[' + kind + '] ' + label, detail));
const residual = (label, cond, detail) => { if (cond) ok('[RESIDUAL] ' + label); else { residuals.push(label + (detail ? ' — ' + detail : '')); console.log('note  [RESIDUAL] ' + label + (detail ? ' — ' + detail : '')); } };

// ── extraction: the belt, and the full gate-decision window ────────────────────────────────
const stripCommentLines = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
const beltBlock = (src) => {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — update this suite, do not let it pass');
  return src.slice(a, b);
};
function buildBelt(src) {
  const slice = detype(stripCommentLines(beltBlock(src))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived in belt block');
  const fn = new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}
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
let belt, decide;
try { belt = buildBelt(TEXT); decide = buildDecision(TEXT); }
catch (e) { console.log('FAIL  cannot build the belt/decision window from source — ' + e.message); process.exit(1); }
const shipsEndToEnd = (s) => !decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding
  && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
const destroyedEndToEnd = (s) => decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding === true;

// ── deployed v92's ONLY completion gate, reconstructed from the candidate's own bytes ──────
const pccpMatch = TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
if (!pccpMatch) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN literal not found'); process.exit(1); }
const PCCP_SHA = createHash('sha256').update(pccpMatch[1]).digest('hex');
const V92 = new Function('return ' + pccpMatch[1])();
const v92fires = (s) => V92.test(String(s));

console.log('=== v34 regression additions — source ' + SRC);
console.log('--- [CONTRACT] the deployed-v92 reference this file measures against');
check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN is byte-identical to deployed v92 (pinned sha256)',
  PCCP_SHA === '54b678adb350384a8d856bf778fdcba46e89cf5d6bf9bdb78f5ad697d911db6e',
  'got ' + PCCP_SHA + ' — if the product deliberately changed this literal, re-derive the v92 reference and re-pin; do not delete this check');
check('CONTRACT', 'v92 gate sanity: fires on BUG-002, not on a greeting',
  v92fires('The company was archived successfully.') && !v92fires('Hello, how can I help?'));
check('CONTRACT', 'candidate belt sanity: fires on BUG-002, not on a greeting',
  belt('The company was archived successfully.') && !belt('Hello, how can I help?'));

// Helpers for family-level assertions. A FAB family: every row must be corrected by v92 (corpus
// validity) and must NOT ship end-to-end. A TRUTH family: every row must be preserved by v92 and
// must NOT be destroyed end-to-end.
const NAMES = ['CLIX GPS', 'FuelMetrix', 'Gobi Solar', 'ACME Holdings', 'Beta Corp', 'Khan Bank Tech', 'Bob Smith', 'Erdenet Mining'];
const PART = ['archived', 'deleted', 'removed', 'completed', 'approved', 'renamed', 'restored', 'updated'];
const ADV = ['as requested', 'after review', 'per your request'];
function fabFamily(id, rows, note) {
  const invalid = rows.filter((s) => !v92fires(s));
  check('DEFECT', id + ' corpus validity: deployed v92 corrects all ' + rows.length, invalid.length === 0, 'v92 ships: ' + invalid.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  const shipped = rows.filter((s) => shipsEndToEnd(s));
  check('DEFECT', id + ' ' + note + ' — 0 of ' + rows.length + ' ship', shipped.length === 0,
    shipped.length + ' ship end-to-end that v92 corrects, e.g. ' + shipped.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}
function truthFamily(id, rows, note) {
  const invalid = rows.filter((s) => v92fires(s));
  check('DEFECT', id + ' corpus validity: deployed v92 preserves all ' + rows.length, invalid.length === 0, 'v92 destroys: ' + invalid.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  const destroyed = rows.filter((s) => destroyedEndToEnd(s));
  check('DEFECT', id + ' ' + note + ' — 0 of ' + rows.length + ' destroyed', destroyed.length === 0,
    destroyed.length + ' destroyed end-to-end that v92 preserves, e.g. ' + destroyed.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D189 (P1, FAB REGRESSION): the R-AUXGAP guard window crosses a sentence boundary');
{
  const rows = [];
  for (const l of ['No errors.', 'Nothing failed.', 'No issues;', 'Not a problem.', 'It was not deleted;', 'Nothing was lost.'])
    for (const n of NAMES.slice(0, 3)) for (const a of ADV) rows.push(`${l} ${n} was, ${a}, ${PART[rows.length % 4]}.`);
  fabFamily('D189', rows, 'a negator in the PREVIOUS sentence must not disarm the interposed-adverbial arm');
  check('CONTRACT', 'D189 control: the same-clause attributed negation is still preserved',
    !belt("The task couldn't have been, as requested, archived.") && !belt('Nobody said ACME Holdings had been, as requested, archived.'));
}
console.log('\n--- [DEFECT] D190 (P1, FAB REGRESSION, created by run33/D183): bare modals in the guard shield fabrications');
{
  const rows = [];
  for (const l of ['As you can see,', 'I can confirm', 'You may notice', 'You could say', 'You might recall', 'We can report that'])
    for (const n of NAMES.slice(0, 3)) for (const a of ADV) rows.push(`${l} ${n} ${rows.length % 2 ? 'has been' : 'was'}, ${a}, ${PART[rows.length % 4]}.`);
  fabFamily('D190', rows, 'a modal that does not govern the auxiliary must not shield the arm');
  const hedges = [];
  for (const n of NAMES.slice(0, 3)) for (const a of ADV) for (const m of ['may', 'might', 'could', 'can']) hedges.push(`${n} ${m} have been, ${a}, archived — I cannot tell.`);
  check('CONTRACT', 'D190 control: the D183 hedged declines stay preserved (' + hedges.length + ')', hedges.every((s) => !belt(s) && !v92fires(s)));
}
console.log('\n--- [DEFECT] D191 (P1, TRUTH REGRESSION): "had been" + a negator outside the 28-character window');
{
  const rows = [];
  for (const lead of ['None of the records from the last quarter indicate', 'Nothing in the history I can access suggests', 'I have no evidence anywhere in the audit log that', 'Nobody on the operations team believes'])
    for (const n of ['the company', 'CLIX GPS', 'the goal']) for (const a of ['at any point', 'in the meantime']) rows.push(`${lead} ${n} had been, ${a}, ${PART[rows.length % 4]}.`);
  truthFamily('D191', rows, 'a same-sentence negator must disarm the arm wherever it sits');
}
console.log('\n--- [DEFECT] D192 (P1, TRUTH REGRESSION): participles outside v92\'s list × the negator-skip rules');
{
  const rows = [];
  for (const p of ['sent', 'closed', 'cleared', 'activated', 'deactivated'])
    for (const s of ['No Notification', 'No Reply', 'No Work Order', 'No Business Unit', 'No North Depot', 'No task the team owns', 'No record the system holds']) rows.push(`${s} was ${p}.`);
  truthFamily('D192', rows, 'a Title-Cased entity type or determiner-led subject is not a name when v92 would preserve the answer');
  check('CONTRACT', 'D192 control: the v92-list twins are SHARED losses, not gate items (documented, not asserted)',
    v92fires('No Notification was archived.') && v92fires('No North Depot was deleted.'));
}
console.log('\n--- [DEFECT] D193 (P2, TRUTH REGRESSION, created by run32/D176): "Confirmed — <Participle-Name> is not <participle>"');
{
  const rows = [];
  for (const n of ['Archived Media Group', 'Closed Loop Systems', 'Restored Motors Ltd']) for (const p of ['archived', 'deleted', 'removed']) rows.push(`Confirmed — ${n} is not ${p}.`, `Confirmed — ${n} are not ${p}.`);
  truthFamily('D193', rows, 'a negated state verb is a status report');
  check('CONTRACT', 'D193 control: the status reports without a negator stay preserved and the fabrication twin stays caught',
    !belt('Confirmed — Archived Media Group remains active.') && !belt('Confirmed — Archived Media Group has 3 open tasks.') && belt('Confirmed — Archived ACME.') && belt('Confirmed — Deleted ACME, nothing else was changed.'));
}
console.log('\n--- [DEFECT] D194 (P1, FAB REGRESSION): ANY negator token opening a quoted title disarms the belt');
{
  const rows = [];
  for (const ti of ['No smoking signs for the depot', 'Nothing to declare form', 'Never delete the backup', 'Not for release', 'None of the above', 'No more overtime in Q4'])
    rows.push(`The task "${ti}" was completed.`, `"${ti}" has been archived.`, `The goal “${ti}” was archived.`);
  fabFamily('D194', rows, 'a quoted title heads a subject whatever token it begins with');
  const tr = [];
  for (const ti of ['No smoking signs for the depot', 'Nothing to declare form', 'Never delete the backup']) tr.push(`The task "${ti}" wasn't completed.`, `"${ti}" hasn't been archived.`, `The goal “${ti}” isn't archived.`);
  check('CONTRACT', 'D194 control: the truthful negatives about the same quoted titles stay preserved (' + tr.length + ')', tr.every((s) => !belt(s)));
  check('CONTRACT', 'D194 control: the run33/D186 Pending/Awaiting quoted forms stay caught',
    belt('The task "Pending review of the Q3 accounts" was completed.') && belt('"Awaiting approval from the founder" has been archived.'));
}
console.log('\n--- [DEFECT] D195 (P1, FAB REGRESSION): lowercase pending/awaiting after a determiner is an adjective');
{
  const rows = [];
  for (const d of ['The', 'Your', 'Our', 'That']) for (const noun of ['pending approval', 'pending request', 'pending task', 'awaiting approval', 'pending invoice'])
    for (const vp of ['was approved', 'has been approved', 'was completed', 'has been deleted']) rows.push(`${d} ${noun} ${vp}.`);
  rows.push('All pending tasks were completed.', 'All pending approvals have been approved.');
  fabFamily('D195', rows, '"The pending approval was approved." is BUG-002 with one adjective added');
  check('CONTRACT', 'D195 control: the truthful pending shapes stay preserved',
    ['The pending approval hasn\'t been decided.', 'Your pending request isn\'t approved yet.', 'Pending approval: the change has not been applied.', 'Khan Bank Tech has not yet been archived; it is awaiting your confirmation.'].every((s) => !belt(s)));
}
console.log('\n--- [DEFECT] D196 (P2, FAB REGRESSION): "a few" is a positive quantifier, not a negator');
{
  const rows = [];
  for (const q of ['A few', 'Quite a few', 'Only a few', 'The few']) for (const noun of ['tasks', 'companies', 'records']) for (const vp of ['were archived', 'have been deleted', 'were completed']) rows.push(`${q} ${noun} ${vp}.`);
  fabFamily('D196', rows, 'a completion claim about "a few" entities is a completion claim');
  check('CONTRACT', 'D196 control: the re-lexiconed hardly/nobody negatives stay preserved',
    !belt('Hardly any records were deleted.') && !belt('Nobody was assigned to that task.') && !belt('A few tasks are still open; none were deleted.'));
}
console.log('\n--- [DEFECT] D197 (P2, FAB REGRESSION): a negator token inside a name after a determiner, or in a possessive');
{
  const rows = [];
  for (const n of ['The Never Ending Story project', 'The Nothing Ventured fund', 'The No Fly List document', 'The None Shall Pass task', 'The No Parking zone']) for (const vp of ['was archived', 'has been updated']) rows.push(`${n} ${vp}.`);
  for (const n of ["Nobody's Perfect Studio", "Nothing's Impossible Ltd", "No One's Home Co"]) for (const vp of ['was archived', 'has been deleted']) rows.push(`${n} ${vp}.`);
  fabFamily('D197', rows, 'a determiner never precedes a genuine negator; a possessive negator followed by a Title-Case token is a name');
  check('CONTRACT', 'D197 control: the contracted possessive negations stay preserved',
    !belt("Nobody's been archived.") && !belt("Nothing's changed — CLIX GPS wasn't deleted.") && !belt('The Never Ending Story project was not archived.'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] D198 (P3, SUITE INTEGRITY): the generative suite is not self-contained');
{
  const gen = findUp('qa/scenarios-runner/belt_generative_adversarial_contract.mjs');
  const body = gen ? readFileSync(gen, 'utf8') : '';
  check('DEFECT', 'D198 belt_generative_adversarial_contract imports its extractor from INSIDE this repository (no absolute path to another worktree)',
    !!gen && !/from\s+'file:\/\/\/[A-Za-z]:\//.test(body) && !/brain-os-verify-[0-9a-f]+/.test(body),
    'it imports file:///C:/…/brain-os-verify-b32e0e4/qa/verification/scratch/v20/extract.mjs, which is not tracked here; the suite passes only on this one machine while that other worktree exists');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [RESIDUAL] the disclosed open minimal pair, pinned in BOTH directions');
residual('OPEN "No errors occurred the department was removed." still ships (disclosed; closing it destroys the paired truths below)',
  shipsEndToEnd('No errors occurred the department was removed.') && v92fires('No errors occurred the department was removed.'),
  'the shape is now caught — retire this residual and pin it as CONTRACT after confirming the pairs below still survive');
check('CONTRACT', 'the paired truthful minimal pairs of the disclosed shape survive',
  ['No company named No Limits Inc was archived.', 'No project titled Copper Works was archived.', 'No ticket assigned to Bob Smith was completed.',
    'No task assigned the wrong owner was deleted.', 'No document titled the same way was archived.'].every((s) => !belt(s)));

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [CONTRACT] properties this candidate DOES hold — pinned so the fixes above cannot trade them away');
for (const s of [
  'The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.',
  'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.',
  'No company matched that name so the company has been archived.', 'I could not confirm the owner yet the employee was created.',
  'The status is not draft (the goal has been archived).', 'The task has been completed, right?',
]) check('CONTRACT', 'ledger #64/D16 stays closed :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
for (const id of ['founderRequestedMutation', 'MUTATION_REQUEST_PATTERN', 'READ_ONLY_REQUEST_PATTERN']) check('CONTRACT', 'ledger #65/D25 stays closed: no ' + id + ' gate in the source', !TEXT.includes(id));
check('CONTRACT', 'ledger #65/D27 (production row 9dda919c) stays closed',
  belt('Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".') && belt('Project renamed: "A" → "B". No other project was touched.'));
check('CONTRACT', 'ledger #66/D40 stays closed: claims:[] still arms the gate',
  decide({ summary: 'The approval has been approved and the company was archived successfully.', rawClaims: [] }).claimsPastCompletionWithNoGrounding === true);
for (const s of ['Confirmed — Archived ACME. No further action needed.', 'ACME Holdings was archived. Nothing else was changed.', 'ACME Holdings was, after review, archived. No other records were touched.'])
  check('CONTRACT', 'run15/D117 later-sentence negator does not disarm :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
// the run30–run33 closures, pinned as load-bearing on THIS verifier's rows
check('CONTRACT', 'run30 negator-initial names stay caught and their truthful twins survive',
  ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.', 'Neither Here Nor There Ltd was archived.'].every((s) => belt(s))
  && ['No Limits Inc was not archived.', 'Nothing Bundt Cakes wasn\'t deleted.', 'No company named Never Summer Industries was archived.', 'Neither Here Nor There Ltd was not archived.'].every((s) => !belt(s)));
check('CONTRACT', 'run33/D185 lexicon revert stays load-bearing (lowercase-subject family)',
  ["I couldn't reach the server the company was archived.", "I wouldn't recommend that but the task has been deleted.", "That won't be needed the goal was removed.", 'The roster is unchanged although the company was archived.'].every((s) => belt(s))
  && !TEXT.includes("|couldn['’]?t|wouldn['’]?t|shouldn['’]?t|won['’]?t|unable|unchanged)"));
check('CONTRACT', 'run33/D184 progressive negatives stay preserved', ['No Business Unit is being archived.', 'No Work Order is being created.'].every((s) => !belt(s)));
check('CONTRACT', 'run32/D180 + run33/D188 new-subject closures stay caught',
  ['No errors ACME Holdings was archived.', 'Not a single task moved — Bob Smith was removed.', 'No problem the log shows ACME Holdings was archived.', 'No errors the company was archived.'].every((s) => belt(s)));
check('CONTRACT', 'the dash-inside-a-real-name negatives survive',
  ['No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.', 'No site at Darkhan — Steel Yard was deleted.'].every((s) => !belt(s)));
check('CONTRACT', 'the first-person object negations survive', ['I archived no companies.', 'I deleted nothing.', 'We removed nobody from CLIX GPS.'].every((s) => !belt(s)));
check('CONTRACT', 'the run28 evidential-after-linker negatives survive',
  ['No log however shows ACME Holdings was archived.', 'No entry however in our records shows ACME Holdings was archived.', 'No file our system shows was archived.'].every((s) => !belt(s)));
// D117 semantic invariant on the AUXGAP arm specifically
check('CONTRACT', 'D117 on the AUXGAP arm: a negator in a LATER sentence never disarms it',
  ['ACME Holdings was, as requested, archived. No further action needed.', 'Beta Corp has been, per your request, deleted. Nothing else changed.'].every((s) => belt(s)));
check('CONTRACT', 'no whole-summary negation test guards the AUXGAP arm (the D177 property)',
  !/NEGATED_CLAUSE\.test\(String\(s\)\)/.test(stripCommentLines(beltBlock(TEXT))));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed' + (residuals.length ? ', ' + residuals.length + ' residual note(s)' : ''));
if (failures.length) {
  console.log('\nRED — the v92-differential deployment gate is NOT satisfied on this candidate:');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failures.length ? 1 : 0);
