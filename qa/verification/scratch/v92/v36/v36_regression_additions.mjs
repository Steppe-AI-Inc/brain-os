// VERIFIER #36 — campaign #96 regression additions (candidate-vs-DEPLOYED-v92 deployment gate, SEVENTH round).
// Independent of every prior campaign's corpus, of qa/scenarios-runner/_gate_extract.mjs, of
// v92_parity_corpus.json and of verifier #30–#35's committed suites. Every row below was built in the
// verifying session (see qa/verification/scratch/v36/ for the 893-truthful / 680-fabrication corpus,
// the 40-shape matcher differential and the prepared fix40).
//
// WHY THIS FILE IS RED ON CANDIDATE f64b280 (index.ts a01c8e1a…) ON PURPOSE.
//   * DESTROYS truthful answers DEPLOYED v92 PRESERVES —
//       V36-F1  (CREATED by run36 = verifier #35's A2 collapse, adopted verbatim) the interposed-adverbial
//               COLLAPSE bounds the adverbial's CONTENT at 30 chars while v92's window bounds the whole span
//               (content + separators) at 30, so an adverbial of 27-30 chars that CARRIES the negation is
//               discarded: "ACME Holdings was, as far as anyone can tell not, archived." 4/4 (+12 in
//               verifier #31's own V31-F3 family, which passed 33/1 on 0f96ff9 and fails on this candidate).
//       V36-F2  (CREATED by run36 = verifier #35's D splice) the Confirmed-status guard excludes a PRONOUN
//               subject and a ";" crossing, so a true status report about a participle-named company is
//               destroyed: "Confirmed — Archived Media Group; it is still a customer." 4/4 (preserved on 0f96ff9).
//       V36-F3  (pre-existing since run30, missed by #31-#35) ppInternal excuses a negator after
//               since/given/after… regardless of which arm the clause reaches, and the candidate-only
//               PROGRESSIVE arm then fires: "Since no company is being archived, the list is unchanged." 3/3.
//       V36-F4  (pre-existing since run32/D181, missed by #33-#35) the determiner-led idiom strip removes
//               "No issues" from a REAL noun phrase with a reduced relative clause and the progressive arm
//               fires: "No issues the team reported are being archived." 3/3.
//   * SHIPS fabrications DEPLOYED v92 CORRECTS —
//       V36-F5  (CREATED by run36 = verifier #35's C1 splice) a token-internal period is no longer a clause
//               boundary, but newSubject's capitalised run cannot contain one, so "No errors Trade-book.ai
//               was restored." ships (caught on every earlier build via the boundary). 2/2.
//       V36-F6  (pre-existing since run30, missed by every verifier) COMPLETION_PARTICIPLE lacks v92's
//               "confirmed", so "The approval was, as requested, confirmed." is never collapsed and ships. 2/2.
//       V36-F7  (pre-existing since run32/D176, missed by #33-#35) the status guard excuses a NAME subject
//               with a v92-caught tail: "Confirmed — Restored Bob Smith is back, and no other person was
//               restored." ships. 1/1.
//
// CONTRACT items hold on this candidate and must hold forever. DEFECT items reproduce an OPEN regression and
// FAIL until it is genuinely closed. RESIDUAL items pin a DISCLOSED shape in both directions and never fail.
// ANY failure of CONTRACT or DEFECT exits nonzero. All DEFECT items are green on the prepared fix40
// (qa/verification/scratch/v36/build_fix40.mjs), mutation-proven 7/7 through its skip switch.
//
// Source: SEM_INDEX_SRC, else supabase/functions/sem-ai-command/index.ts located by walking up from THIS
// file — correct from ANY cwd. Deployed v92 reference: the PAST_COMPLETION_CLAIM_PATTERN literal, which is
// byte-identical in the candidate (sha256 pinned) and cross-checked against git c9dfab5bd433 when git is
// available.
//
// Deployed reference established this session: functions list -> sem-ai-command v92, ezbr_sha256
// 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, updated_at 1788239725518
// (2026-09-01T05:15:25.518Z) == GitHub Actions "Deploy Supabase Edge Functions" run 33472871764, headSha
// c9dfab5bd43346bad501ab44d7bfbc5211e90ed5, completed 2026-09-01T05:15:30Z, no later deploy run. Provenance is
// INTEGRATION-LEVEL in this session (the read-only download was permission-gated); git c9dfab5bd433's index.ts
// sha256 (LF) = 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc.
// Candidate measured: f64b280778d573d5bc3f3b4421fffaa49bb62b99, index.ts sha256 (CRLF working tree)
// a01c8e1a41c8f06dac84c8acf178832d922a2704e911a64056a56e5e600ede0b.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';


// Verifier #42's ruling: every extractor injects the entity-name set as an EMPTY Set by default,
// so a name being ABSENT proves nothing and the belt's positive-only signal is inert here. This is
// what makes "an empty set produces byte-identical verdicts" the structural default of the whole
// battery rather than a control someone has to remember to run. `new Function` bodies execute in
// global scope, so this one assignment reaches every belt-build site in this file.
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const u = dirname(d); if (u === d) break; d = u; } return null; }
const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

let pass = 0; const failures = []; const residuals = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (k, l, c, d) => (c ? ok('[' + k + '] ' + l) : bad('[' + k + '] ' + l, d));
const residual = (l, c, d) => { if (c) ok('[RESIDUAL] ' + l); else { residuals.push(l + (d ? ' — ' + d : '')); console.log('note  [RESIDUAL] ' + l + (d ? ' — ' + d : '')); } };

// ── extraction (own) ───────────────────────────────────────────────────────────────────────────
const stripComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const detype = (s) => s.replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>').replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*Array<\{[^}]*\}>/g, '').replace(/:\s*Record<string,\s*string>/g, '').replace(/:\s*(string|boolean|unknown|number|any)(\[\])?\b/g, '');
const beltBlock = (src) => { const a = src.indexOf('const LEGACY_PAST_COMPLETION'); const b = src.indexOf('const legacyProseFallback'); if (a < 0 || b <= a) throw new Error('belt block not found — update this suite, do not let it pass'); return src.slice(a, b); };
function buildBelt(src) {
  const slice = detype(stripComments(beltBlock(src))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived in belt block');
  const fn = new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}
function buildDecision(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION'); const b = src.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const slice = detype(stripComments(src.slice(a, b)));
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
  return (turn) => { const t = { verifiedClaims: [], model: 'gpt', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, rawClaims: null, deterministicPrefix: '', claimExecutionEvidence: [], hasRejectedClaims: false, ...turn };
    return fn(t.verifiedClaims, t.model, t.groundedOutcomeThisTurn, t.claimsFutureActionWithNoPlan, { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims); };
}
let belt, decide;
try { belt = buildBelt(TEXT); decide = buildDecision(TEXT); }
catch (e) { console.log('FAIL  cannot build the belt/decision window from source — ' + e.message); process.exit(1); }
const ships = (s) => !decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
const destroyed = (s) => decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding === true;

// ── deployed v92's ONLY completion gate, reconstructed from the candidate's own bytes ────────────
const pccpMatch = TEXT.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
if (!pccpMatch) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN literal not found'); process.exit(1); }
const PCCP_SHA = createHash('sha256').update(pccpMatch[1]).digest('hex');
const V92 = new Function('return ' + pccpMatch[1])();
const v92fires = (s) => V92.test(String(s));

console.log('=== v36 regression additions — source ' + SRC);
check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN is byte-identical to deployed v92 (pinned sha256)', PCCP_SHA === '54b678adb350384a8d856bf778fdcba46e89cf5d6bf9bdb78f5ad697d911db6e', 'got ' + PCCP_SHA);
{
  // Cross-check against git when available: the literal in c9dfab5bd433 must equal the candidate's.
  let gitLit = null;
  try { gitLit = (execFileSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { cwd: dirname(SRC), maxBuffer: 1 << 26 }).toString('utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/) || [])[1] || null; } catch { /* no git here */ }
  if (gitLit !== null) check('CONTRACT', 'the literal equals git c9dfab5bd433 (deployed v92) byte for byte', gitLit === pccpMatch[1]);
  else console.log('note  git c9dfab5bd433 not reachable from this cwd; sha pin above is the provenance anchor');
}
check('CONTRACT', 'v92 gate sanity', v92fires('The company was archived successfully.') && !v92fires('Hello, how can I help?'));
check('CONTRACT', 'candidate belt sanity', belt('The company was archived successfully.') && !belt('Hello, how can I help?'));

function fabFamily(id, rows, note) {
  const invalid = rows.filter((s) => !v92fires(s));
  check('DEFECT', id + ' corpus validity: deployed v92 corrects all ' + rows.length, invalid.length === 0, 'v92 ships: ' + invalid.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  const shipped = rows.filter((s) => ships(s));
  check('DEFECT', id + ' ' + note + ' — 0 of ' + rows.length + ' ship', shipped.length === 0, shipped.length + ' ship end-to-end that v92 corrects, e.g. ' + shipped.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}
function truthFamily(id, rows, note) {
  const invalid = rows.filter((s) => v92fires(s));
  check('DEFECT', id + ' corpus validity: deployed v92 preserves all ' + rows.length, invalid.length === 0, 'v92 destroys: ' + invalid.slice(0, 2).map((s) => JSON.stringify(s)).join(' | '));
  const lost = rows.filter((s) => destroyed(s));
  check('DEFECT', id + ' ' + note + ' — 0 of ' + rows.length + ' destroyed', lost.length === 0, lost.length + ' destroyed end-to-end that v92 preserves, e.g. ' + lost.slice(0, 3).map((s) => JSON.stringify(s)).join(' | '));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] V36-F1 (P1, TRUTH REGRESSION, created by run36/A2): the collapse discards a negation carried by a 27-30-char adverbial');
{
  const rows = ['ACME Holdings was, as far as anyone can tell not, archived.', 'The goal was, according to no record we hold, archived.', 'CLIX GPS was, per no evidence I could find, archived.',
    'Erdenet Copper Works was, and I would not rely on this, archived well before I was asked.', 'Khan Bank Services was, and I would not rely on this, deleted well before I was asked.'];
  truthFamily('V36-F1', rows, 'the collapse must reach no further than deployed v92\'s 30-character window');
  check('CONTRACT', 'V36-F1 control: shapes inside v92\'s window stay collapsed and caught', ['ACME Holdings was, as requested, archived.', 'ACME Holdings was, with no delay, archived.', 'ACME Holdings was, as you explicitly asked, archived.', 'The task "No smoking" was, as requested, archived.'].every((s) => !ships(s)));
  check('CONTRACT', 'V36-F1 control: the same-clause genuine negation stays preserved', ['ACME Holdings was not, as requested, archived.', "The task couldn't have been, as requested, archived.", 'The task was, of course, not deleted.'].every((s) => !belt(s)));
}
console.log('\n--- [DEFECT] V36-F2 (P1, TRUTH REGRESSION, created by run36/D): a pronoun-subject or ";"-separated TRUE status report');
{
  const rows = ['Confirmed — Archived Media Group; it is still a customer.', 'Confirmed — Archived Media Group, it has 3 open tasks.', 'Confirmed — Archived Media Group: it is active.',
    'Confirmed — Restored Furniture Co; they are still active.', 'Confirmed — Closed Loop Systems; it has two open invoices.'];
  truthFamily('V36-F2', rows, 'a status report about a participle-named company survives whatever its subject and separator are');
  check('CONTRACT', 'V36-F2 control: the run35 F5 fabrications (v92-corrected via their tails) stay caught',
    ['Confirmed — Archived ACME; it is no longer active, and no other company was deleted.', 'Confirmed — Deleted Beta Corp, it is gone, and nothing else was removed.'].every((s) => !ships(s)));
  check('CONTRACT', 'V36-F2 control: the earlier true status reports stay preserved',
    ['Confirmed — Archived Media Group remains active.', 'Confirmed — Archived Media Group, our client, remains active.', 'Confirmed — Archived Media Group is not archived.', 'Confirmed — Archived Media Group and Closed Loop Systems remain active.'].every((s) => !belt(s)));
  check('CONTRACT', 'V36-F2 control: the tempered fabrications stay caught', belt('Confirmed — Archived ACME.') && belt('Confirmed — Deleted ACME, nothing else was changed.') && belt('Confirmed — Archived Media Group remains active. ACME Holdings was archived.'));
}
console.log('\n--- [DEFECT] V36-F3 (P1, TRUTH REGRESSION, pre-existing since run30): ppInternal excuses the clause\'s own negator before the progressive arm');
{
  const rows = ['Since no company is being archived, the list is unchanged.', 'Since nobody is being removed, the roster is unchanged.', 'Given no approval is being granted, the request stays pending.', 'Since no task is being deleted, the board is unchanged.'];
  truthFamily('V36-F3', rows, 'a negator that is the clause\'s own keeps its scope when the only completion is progressive');
  check('CONTRACT', 'V36-F3 control: the run30 R5 fabrications stay caught',
    ['The company with no active tasks was archived.', 'With no blockers left ACME Holdings was archived.', 'Since no objections were raised the goal was archived.', 'Since no objections were raised ACME Holdings was archived.', 'After no objections the task was deleted.'].every((s) => !ships(s)));
}
console.log('\n--- [DEFECT] V36-F4 (P1, TRUTH REGRESSION, pre-existing since run32/D181): the determiner-led idiom strip eats a real noun phrase before the progressive arm');
{
  const rows = ['No issues the team reported are being archived.', 'No problem the customer raised is being deleted.', 'No issue our records list is being closed.'];
  truthFamily('V36-F4', rows, '"No issues" heading a noun phrase with a reduced relative clause is a negated subject, not an interjection');
  check('CONTRACT', 'V36-F4 control: the D181 fabrication stays caught and its truthful twin survives', !ships('No problem the log shows ACME was archived.') && !ships('No problem the company was archived.') && !belt('No problem with the archive was reported.'));
}
console.log('\n--- [DEFECT] V36-F5 (P2, FAB REGRESSION, created by run36/C1): newSubject\'s name run cannot contain a token-internal period');
{
  fabFamily('V36-F5', ['No errors Trade-book.ai was restored.', 'No errors Steppe.ai was archived.', 'No exceptions Trade-book.ai has been deleted.'], 'a filler negator before a period-bearing name governing its own auxiliary is a new subject');
  check('CONTRACT', 'V36-F5 control: the token-internal-period truths stay preserved', !belt('No record for Trade-book.ai is being archived.') && !belt('No Work Order for Trade-book.ai is being updated.'));
  check('CONTRACT', 'V36-F5 control: the plain-name twin stays caught', !ships('No errors FuelMetrix was restored.'));
}
console.log('\n--- [DEFECT] V36-F6 (P2, FAB REGRESSION, pre-existing since run30): COMPLETION_PARTICIPLE lacks v92\'s "confirmed"');
{
  fabFamily('V36-F6', ['The approval was, as requested, confirmed.', 'The booking has been, after review, confirmed.'], 'an interposed-adverbial completion on a v92-list participle is collapsed and caught');
  check('CONTRACT', 'V36-F6 control: the plain form is caught by both', belt('The approval was confirmed.') && v92fires('The approval was confirmed.'));
}
console.log('\n--- [DEFECT] V36-F7 (P2, FAB REGRESSION, pre-existing since run32/D176): the status guard excuses a NAME subject beside a v92-caught tail');
{
  fabFamily('V36-F7', ['Confirmed — Restored Bob Smith is back, and no other person was restored.', 'Confirmed — Archived ACME Holdings is gone, and nothing else was archived.'], 'a "Confirmed — <Participle> <Name> <state verb>" head ships only when deployed v92 would also show it');
  check('CONTRACT', 'V36-F7 control: the v92-shared status/fabrication pair is reported, not asserted (both ship on v92)', !v92fires('Confirmed — Restored Bob Smith is back.') && !v92fires('Confirmed — Restored Furniture Co is back on the client list.'));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [RESIDUAL] disclosed shapes, pinned in both directions');
residual('OPEN "No errors occurred the department was removed." still ships (disclosed D188)', ships('No errors occurred the department was removed.') && v92fires('No errors occurred the department was removed.'), 'now caught — retire after confirming the paired truths');
check('CONTRACT', 'D188 paired truths survive', ['No company named No Limits Inc was archived.', 'No project titled Copper Works was archived.', 'No ticket assigned to Bob Smith was completed.'].every((s) => !belt(s)));
residual('AMBIGUOUS unquoted title as subject ("No smoking signs for the depot was completed." / "Nothing to declare form was completed.") ships — same surface as the determiner reading; reported, not asserted',
  ships('No smoking signs for the depot was completed.') && ships('Nothing to declare form was completed.'), 'now caught — check "No smoking signs were approved." still survives: ' + !belt('No smoking signs were approved.'));
residual('SHARED LOSS (v92 destroys too, so NOT a gate item): "No North Depot was archived." and "Never ACME Holdings, and never Beta Corp, was archived."',
  v92fires('No North Depot was archived.') && v92fires('Never ACME Holdings, and never Beta Corp, was archived.'), 'v92 now preserves one of these — re-classify');
residual('DEAD CODE: the run30 R-IDIOM strip (both the widening AND the whole dash-form strip) re-opens 0 shapes when removed; only the run32 D181 determiner-led strip is load-bearing', false, 'measured in qa/verification/scratch/v36/idiom_deadcode.mjs — remove per the "only load-bearing fixes ship" rule');

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [CONTRACT] properties this candidate DOES hold — pinned so a fix for the defects above cannot trade them away');
for (const s of ['The approval was not rejected, and it has been approved.', 'The approval was not rejected – it has been approved.', 'The approval was not rejected—it has been approved.', 'The approval was not rejected: it has been approved.',
  'No company matched that name so the company has been archived.', 'I could not confirm the owner yet the employee was created.', 'The status is not draft (the goal has been archived).', 'The task has been completed, right?'])
  check('CONTRACT', 'ledger #64/D16 stays closed :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
for (const id of ['founderRequestedMutation', 'MUTATION_REQUEST_PATTERN', 'READ_ONLY_REQUEST_PATTERN']) check('CONTRACT', 'ledger #65/D25 stays closed: no ' + id, !TEXT.includes(id));
check('CONTRACT', 'ledger #65/D27 (production row 9dda919c) stays closed', belt('Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".') && belt('Project renamed: "A" → "B". No other project was touched.'));
check('CONTRACT', 'ledger #66/D40 stays closed: claims:[] still arms the gate', decide({ summary: 'The approval has been approved and the company was archived successfully.', rawClaims: [] }).claimsPastCompletionWithNoGrounding === true);
for (const s of ['Confirmed — Archived ACME. No further action needed.', 'ACME Holdings was archived. Nothing else was changed.', 'ACME Holdings was, after review, archived. No other records were touched.'])
  check('CONTRACT', 'run15/D117 later-sentence negator does not disarm :: ' + JSON.stringify(s.slice(0, 46)), belt(s));
check('CONTRACT', 'no whole-summary NEGATION test in the belt (D177 property)', !/NEGATED_CLAUSE\.test\(String\(s\)\)/.test(stripComments(beltBlock(TEXT))));
check('CONTRACT', 'run30 negator-initial names stay caught with auxiliaries and "<participle> successfully", and their truthful twins survive',
  ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.', 'No Limits Inc archived successfully.', 'Nothing But Nets Foundation was deleted.'].every((s) => belt(s))
  && ['No Limits Inc was not archived.', 'Nothing Bundt Cakes wasn’t deleted.', 'No company named Never Summer Industries was archived.', 'No charity like Nothing But Nets was archived.', 'Nothing But Nets Foundation is not being archived.'].every((s) => !belt(s)));
check('CONTRACT', 'negator-initial TITLES stay caught and their truthful twins survive',
  ['Pending review of the contract was completed.', 'The task "Pending review of the Q3 contract" was completed.', 'The task "No smoking signs for the depot" was completed.'].every((s) => belt(s))
  && ['The task "Pending review of the Q3 contract" wasn’t completed.', 'Pending approval, the goal was not archived.', 'Pending: no changes are being made.'].every((s) => !belt(s)));
check('CONTRACT', 'run31 refused shapes stay caught', ['No errors ACME was archived.', 'No problem the log shows ACME was archived.', 'Not a single task moved — Bob Smith was removed.'].every((s) => belt(s)));
check('CONTRACT', 'the dash-inside-a-real-name negatives survive (a dash before a capital is not a boundary)', ['No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.', 'No site at Darkhan — Steel Yard was deleted.'].every((s) => !belt(s)));
check('CONTRACT', 'first-person object negations survive; the negator-name object fabrication stays caught', ['I archived no companies.', 'I deleted nothing for CLIX GPS.', 'We removed nobody from CLIX GPS.'].every((s) => !belt(s)) && belt('I archived No Limits Inc.'));
check('CONTRACT', 'evidential-after-linker negatives survive', ['No log however shows ACME was archived.', 'No entry however in our records shows ACME was archived.', 'No log however shows ACME is being archived.'].every((s) => !belt(s)));
check('CONTRACT', 'run33/D184, run34/D192 and had-been negatives stay preserved', ['No Business Unit is being archived.', 'No Notification was sent.', 'No Business Unit had been archived.', 'None Of The Listed Companies is being archived.', 'No Erdenet Mining employee was removed.'].every((s) => !belt(s)));
check('CONTRACT', 'run34/D194-D197 stay closed', ['The pending approval was approved.', 'A few tasks were archived.', 'The Never Ending Story project was archived.', "Nobody's Perfect Studio was archived."].every((s) => belt(s)));
check('CONTRACT', 'run35 relInternal: relative-clause negator excused, main-clause negation kept',
  belt('The company that had no open tasks was archived.') && ['The task that no one completed was not deleted.', 'The company that had no open tasks was never archived.', 'The company that nobody owns is not being archived.', 'The record which none of you signed has not been rejected.'].every((s) => !belt(s)));
check('CONTRACT', 'run35 token-internal period: truths preserved, real sentence boundary still separates', !belt('No record for Trade-book.ai is being archived.') && !belt('No company is being archived.CLIX GPS wasn’t deleted.') && belt('Trade-book.ai was archived. Nothing else was changed.'));
check('CONTRACT', 'hedged declines survive with and without interposition', ['It may have been archived.', 'The company may have been, at your request, archived.', 'The task could in fact have been, during the migration, deleted.', 'CLIX GPS may have been archived earlier, but it was not deleted.'].every((s) => !belt(s)));
check('CONTRACT', 'production BUG-002 shapes stay caught', ['Approval 358eddeb-0000-0000-0000-000000000000 has been approved.', 'Department QA-SWARM-DEPT-ARCHIVED-PARENT-TEST has been permanently deleted.', 'The company has been archived.'].every((s) => belt(s)));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed' + (residuals.length ? ', ' + residuals.length + ' residual note(s)' : ''));
if (failures.length) { console.log('\nRED — the v92-differential deployment gate is NOT satisfied on this candidate:'); for (const f of failures) console.log('  - ' + f); }
process.exit(failures.length ? 1 : 0);
