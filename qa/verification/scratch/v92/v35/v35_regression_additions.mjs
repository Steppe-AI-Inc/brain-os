// VERIFIER #35 — campaign #95 regression additions (candidate-vs-DEPLOYED-v92 deployment gate, SIXTH round).
// Independent of every prior campaign's corpus, of qa/scenarios-runner/_gate_extract.mjs, of
// v92_parity_corpus.json and of verifier #30–#34's committed suites. Every row below was generated in the
// verifying session (see v35_harness.mjs for the 521-truthful / 253-fabrication corpus these were drawn from).
//
// WHY THIS FILE IS RED ON CANDIDATE 0f96ff93 (index.ts b1f54b07…) ON PURPOSE.
//   * SHIPS fabrications DEPLOYED v92 CORRECTS —
//       V35-F1  the R-AUXGAP guard is a bare negator-LEXICON test on the sentence prefix (verifier #34's
//               "since the last sentence boundary, capped at 160"), so every negator the clause pipeline
//               knows how to EXCUSE (a relative clause, a prepositional phrase, a quoted title, a reassurance
//               idiom, a negator-initial name, a Pending/Awaiting title, the adjective "pending") disarms the
//               interposed-adverbial arm: "The company with no open tasks was, as requested, archived." 7/7.
//       V35-F2  "<NegatorName> <participle> successfully." — nameInternal requires an AUXILIARY to govern the
//               capitalised run, so BUG-002's own second form is unguarded: "No Limits Inc archived
//               successfully." 11/11 negator-initial names.
//       V35-F5  the run32 Confirmed-status guard accepts a PRONOUN-subject state verb ("it is no longer active")
//               and crosses ";" / ", and" — a "Confirmed — Archived ACME" head ships when its aux+participle
//               tail sits in a negated clause. 2/2.
//       V35-F7  a negator inside a RELATIVE CLAUSE of the subject (no interposition; pre-existing, never
//               flagged): "The company that had no open tasks was archived." 4/4.
//   * DESTROYS truthful negatives DEPLOYED v92 PRESERVES —
//       V35-F3  a period INSIDE a token ("Trade-book.ai", a real workspace name) is a sentence boundary for the
//               clause splitter and for the AUXGAP window, so the negator is cut off: 2/2 (is being / had been).
//       V35-F4  the AUXGAP guard's 160-character cap: a same-sentence negator further back is invisible on the
//               one auxiliary v92's gate does not cover ("had been"): 2/2.
//   * SUITE INTEGRITY —
//       V35-F6  belt_generative_adversarial_contract's truth-direction frames (P1/P2/P3/P2b-modifier) use the
//               "was <participle>" form deployed v92 DESTROYS, so ~86% of their rows are excluded as SHARED and
//               the properties cannot fail on them; the suite stays green under 14 of 17 single-edit reverts.
//
// CONTRACT items hold on this candidate and must hold forever. DEFECT items reproduce an OPEN regression and
// FAIL until it is genuinely closed. RESIDUAL items pin a DISCLOSED shape in both directions and never fail.
// ANY failure of CONTRACT or DEFECT exits nonzero.
//
// Source: SEM_INDEX_SRC, else supabase/functions/sem-ai-command/index.ts located by walking up from THIS
// file — correct from ANY cwd. Deployed v92 reference: the PAST_COMPLETION_CLAIM_PATTERN literal, which is
// byte-identical in the candidate (sha256 pinned) — no external copy is needed.
//
// Deployed reference established this session: functions list -> sem-ai-command v92, ezbr_sha256
// 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475, updated_at 1788239725518
// (2026-09-01T05:15:25.518Z) == GitHub Actions "Deploy Supabase Edge Functions" run 33472871764, headSha
// c9dfab5bd43346bad501ab44d7bfbc5211e90ed5, completed 2026-09-01T05:15:30Z, no later deploy run. Provenance is
// INTEGRATION-LEVEL in this session (the read-only download was permission-gated); git c9dfab5bd433's index.ts
// sha256 (LF) = 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc.
// Candidate measured: 0f96ff93bc17c6277c00ef0fca2b82dffde42d70, index.ts sha256 (CRLF working tree)
// b1f54b072cc41312d25248c2f2334545eafbb1aa09e0162564f86b9d9a720a23.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';


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
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = []; const residuals = [];
const ok = (l) => { pass++; console.log('ok    ' + l); };
const bad = (l, d) => { failures.push(l + (d ? ' — ' + d : '')); console.log('FAIL  ' + l + (d ? ' — ' + d : '')); };
const check = (k, l, c, d) => (c ? ok('[' + k + '] ' + l) : bad('[' + k + '] ' + l, d));
const residual = (l, c, d) => { if (c) ok('[RESIDUAL] ' + l); else { residuals.push(l + (d ? ' — ' + d : '')); console.log('note  [RESIDUAL] ' + l + (d ? ' — ' + d : '')); } };

// ── extraction (own): the belt, and the full gate-decision window ───────────────────────────────
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

console.log('=== v35 regression additions — source ' + SRC);
check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN is byte-identical to deployed v92 (pinned sha256)', PCCP_SHA === '54b678adb350384a8d856bf778fdcba46e89cf5d6bf9bdb78f5ad697d911db6e', 'got ' + PCCP_SHA);
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
console.log('\n--- [DEFECT] V35-F1 (P1, FAB REGRESSION): the R-AUXGAP guard is a lexicon test, not a scope test');
{
  const rows = [];
  for (const lead of ['The company with no open tasks', 'The company that had no open tasks', 'The task "No smoking signs for the depot"', 'The goal "Nothing to declare"', 'No Limits Inc', 'Nothing Bundt Cakes', 'Pending review of the contract', 'The pending approval', 'The task with nobody assigned', 'The company since no objection was raised'])
    for (const adv of ['as requested', 'after review']) rows.push(`${lead} ${/approval|review/.test(lead) ? 'was' : 'has been'}, ${adv}, ${/approval/.test(lead) ? 'approved' : /review/.test(lead) ? 'completed' : 'archived'}.`);
  rows.push('No problem — CLIX GPS was, as requested, archived.', 'Sure thing — ACME Holdings has been, after review, deleted.', 'A few tasks were, as requested, archived.');
  fabFamily('V35-F1', rows, 'an excused negator (PP / relative clause / quoted title / idiom / name / title / adjective) must not disarm the interposed-adverbial arm');
  check('CONTRACT', 'V35-F1 control: the same-clause genuine negation stays preserved',
    !belt('No company had been, at any point, archived.') && !belt("The task couldn't have been, as requested, archived.") && !belt('Nobody said ACME Holdings had been, as requested, archived.'));
  check('CONTRACT', 'V35-F1 control: the D183 hedged declines stay preserved',
    ['The company may have been, at your request, archived.', 'That task might have been, during the migration, deleted.', 'The goal can have been, in principle, completed by another user.'].every((s) => !belt(s)));
  check('CONTRACT', 'V35-F1 control: earlier-sentence / colon / semicolon negators do not disarm (D189 stays closed)',
    ['No errors. CLIX GPS was, as requested, archived.', 'No errors; CLIX GPS was, as requested, archived.', 'No errors: CLIX GPS was, as requested, archived.'].every((s) => !ships(s)));
}
console.log('\n--- [DEFECT] V35-F2 (P1, FAB REGRESSION): "<NegatorName> <participle> successfully."');
{
  const NEGNAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'Not Just Bagels', 'No Fear Apparel', 'Nowhere Fast Logistics', 'Neither Here Nor There Ltd', 'Nobody Knows Studio', 'No Parking Zone Ltd'];
  const P = ['archived', 'deleted', 'removed', 'completed', 'approved', 'restored', 'updated', 'renamed'];
  const rows = NEGNAMES.map((n, i) => `${n} ${P[i % P.length]} successfully.`);
  fabFamily('V35-F2', rows, 'a negator-initial name governing "<participle> successfully" is the subject of a completion, exactly as with an auxiliary');
  check('CONTRACT', 'V35-F2 control: the auxiliary forms of the same names stay caught', NEGNAMES.every((n) => belt(`${n} was archived.`) && belt(`${n} has been deleted.`)));
  check('CONTRACT', 'V35-F2 control: the truthful negatives about the same names stay preserved',
    NEGNAMES.every((n) => !belt(`${n} wasn’t archived.`) && !belt(`${n} has not been deleted.`) && !belt(`${n} is not archived — it is still active.`) && !belt(`No company named ${n} had been archived.`)));
}
console.log('\n--- [DEFECT] V35-F3 (P1, TRUTH REGRESSION): a period INSIDE a token is not a sentence boundary');
{
  const rows = ['No Work Order for Trade-book.ai is being updated.', 'None of the records indicate Trade-book.ai had been, at any point, approved.',
    'No task for node.js migration is being deleted.', 'Nothing suggests Steppe.ai had been, in the meantime, archived.'];
  truthFamily('V35-F3', rows, 'a token-internal period must not cut the negator off from its clause');
  check('CONTRACT', 'V35-F3 control: the same shapes with a plain name stay preserved', !belt('No Work Order for FuelMetrix is being updated.') && !belt('None of the records indicate FuelMetrix had been, at any point, approved.'));
  check('CONTRACT', 'V35-F3 control: a real sentence boundary still separates (D117)', belt('Trade-book.ai was archived. Nothing else was changed.'));
}
console.log('\n--- [DEFECT] V35-F4 (P2, TRUTH REGRESSION): the 160-character cap on the AUXGAP guard window');
{
  const rows = ['None of the records I reviewed this morning across all three regional depots, the central warehouse ledger, the archived correspondence folder and the finance team’s quarterly reconciliation spreadsheet indicate the company had been, at any point, archived.',
    'Nothing in the audit trail, the work-order history, the approvals ledger, the channel transcripts, the memory entries, the document index or the factory run log suggests that Khan Bank Tech had been, in the meantime, deleted.'];
  truthFamily('V35-F4', rows, 'a same-sentence negator disarms the arm wherever it sits (D191, without a cap)');
  check('CONTRACT', 'V35-F4 control: the short form is preserved', !belt('None of the records indicate the company had been, at any point, archived.'));
}
console.log('\n--- [DEFECT] V35-F5 (P2, FAB REGRESSION): the Confirmed-status guard accepts a pronoun-subject state verb');
{
  const rows = ['Confirmed — Archived ACME; it is no longer active, and no other company was deleted.', 'Confirmed — Archived ACME Holdings; it is not recoverable since it was deleted.',
    'Confirmed — Deleted Beta Corp, it is gone, and nothing else was removed.', 'Confirmed — Restored Bob Smith; he is back, and nobody else was restored.'];
  fabFamily('V35-F5', rows, 'a "Confirmed — <Participle> <Name>" head whose state verb has a PRONOUN subject is a completion report, not a status report');
  check('CONTRACT', 'V35-F5 control: the true status reports stay preserved',
    ['Confirmed — Archived Media Group remains active.', 'Confirmed — Archived Media Group, our client, remains active.', 'Confirmed — Archived Media Group and Closed Loop Systems remain active.', 'Confirmed — Archived Media Group is not archived.'].every((s) => !belt(s)));
  check('CONTRACT', 'V35-F5 control: the tempered fabrications stay caught', belt('Confirmed — Archived ACME.') && belt('Confirmed — Deleted ACME, nothing else was changed.'));
}
console.log('\n--- [DEFECT] V35-F7 (P1, FAB REGRESSION, pre-existing): a negator inside a RELATIVE CLAUSE of the subject');
{
  const rows = ['The company that had no open tasks was archived.', 'The goal which has no owner has been archived.', 'The task that nobody claimed was deleted.', 'The company whose owner never replied was archived.',
    'The project that had nothing scheduled was archived.', 'The approval which none of you signed has been rejected.'];
  fabFamily('V35-F7', rows, 'a negator that modifies the subject inside its relative clause does not negate the completion outside it');
  check('CONTRACT', 'V35-F7 control: the truthful relative-clause negatives stay preserved',
    ['The company that has no tasks is not archived.', 'The task that nobody touched has not been archived.', 'The company that had no open tasks wasn’t archived.', 'No record that we hold shows the company had been archived.', 'That company was never archived.', 'The task that never got archived is still open.'].every((s) => !belt(s)));
  check('CONTRACT', 'V35-F7 control: a relativizer BETWEEN the negator and the verb still keeps the negator in scope', !belt('No record that X was archived exists.') && !belt('There is no company that was archived today.'));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [DEFECT] V35-F6 (P3, SUITE INTEGRITY): the generative suite\'s truth frames are v92-shared');
{
  const gen = findUp('qa/scenarios-runner/belt_generative_adversarial_contract.mjs');
  const body = gen ? readFileSync(gen, 'utf8') : '';
  // The suite's own P1 frame: `${neg} ${head} ${link} ${name} was ${participle}.` — measured here on its own slots.
  const NEG = ['No', 'Nothing', 'None', 'Never', 'Not a single'], HEADS = ['company', 'task', 'record'], LINK = ['named', 'at', 'for'], NAMES = ['ACME Holdings', 'Beta Corp'], PART = ['archived', 'deleted', 'sent'];
  let t = 0, shared = 0;
  for (const n of NEG) for (const h of HEADS) for (const l of LINK) for (const nm of NAMES) for (const p of PART) { t++; if (v92fires(`${n} ${h} ${l} ${nm} was ${p}.`)) shared++; }
  const usesWasFrame = /\$\{name\} was \$\{PARTICIPLES\[/.test(body) || /\bwas \$\{PARTICIPLES\b/.test(body);
  check('DEFECT', `V35-F6 P1/P2 truth frames must be forms deployed v92 PRESERVES (currently ${(100 * shared / t).toFixed(0)}% of the "was <participle>" frame is v92-shared and excluded)`,
    !usesWasFrame || shared / t < 0.5, 'the property cannot fail on ~86% of its own rows; rewrite the frames with wasn’t / has not been / is being / had been, which v92 preserves');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n--- [RESIDUAL] disclosed shapes, pinned in both directions');
residual('OPEN "No errors occurred the department was removed." still ships (disclosed D188)', ships('No errors occurred the department was removed.') && v92fires('No errors occurred the department was removed.'), 'now caught — retire this residual after confirming the paired truths below');
check('CONTRACT', 'D188 paired truths survive', ['No company named No Limits Inc was archived.', 'No project titled Copper Works was archived.', 'No ticket assigned to Bob Smith was completed.', 'No task assigned the wrong owner was deleted.'].every((s) => !belt(s)));
residual('AMBIGUOUS "No smoking signs for the depot was approved." (an unquoted title as subject; the truthful reading "no smoking signs were approved" is the same surface) — reported, not asserted', ships('No smoking signs for the depot was approved.'), 'now caught — check "No smoking signs were approved." still survives: ' + !belt('No smoking signs were approved.'));
residual('DEAD RULE: the run30 R-IDIOM lexicon widening is no longer load-bearing (dash-before-lowercase split + newSubject catch every shape) — reported for the "only load-bearing fixes ship" rule',
  false, 'measured: removing BOTH idiom replaces re-opens 0 of 3 idiom fabrications');

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
check('CONTRACT', 'no whole-summary negation test in the belt (D177 property)', !/NEGATED_CLAUSE\.test\(String\(s\)\)/.test(stripComments(beltBlock(TEXT))));
check('CONTRACT', 'run30 negator-initial names stay caught with auxiliaries and their truthful twins survive',
  ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.'].every((s) => belt(s)) && ['No Limits Inc was not archived.', 'Nothing Bundt Cakes wasn’t deleted.', 'No company named Never Summer Industries was archived.'].every((s) => !belt(s)));
check('CONTRACT', 'run31 refused shapes stay caught', ['No errors ACME was archived.', 'No problem the log shows ACME was archived.', 'Not a single task moved — Bob Smith was removed.'].every((s) => belt(s)));
check('CONTRACT', 'the dash-inside-a-real-name negatives survive', ['No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.', 'No site at Darkhan — Steel Yard was deleted.'].every((s) => !belt(s)));
check('CONTRACT', 'first-person object negations survive', ['I archived no companies.', 'I deleted nothing.', 'We removed nobody from CLIX GPS.'].every((s) => !belt(s)));
check('CONTRACT', 'evidential-after-linker negatives survive, incl. had been', ['No log however shows ACME was archived.', 'No entry however in our records shows ACME was archived.', 'No log however shows ACME had been archived.', 'No company our records show had been archived.'].every((s) => !belt(s)));
check('CONTRACT', 'run33/D184 progressive negatives and run34/D192 dropped participles stay preserved', ['No Business Unit is being archived.', 'No Notification was sent.', 'No Company Records were closed.', 'No Business Unit had been archived.'].every((s) => !belt(s)));
check('CONTRACT', 'run34/D194-D197 stay closed', ['The task "No smoking signs for the depot" was completed.', 'The pending approval was approved.', 'A few tasks were archived.', 'The Never Ending Story project was archived.', "Nobody's Perfect Studio was archived."].every((s) => belt(s)));
check('CONTRACT', 'evidential grammar: noun-that-is-also-a-verb subject is a subject', belt('No errors the customer record was archived.') && belt('No errors the sales pipeline data was archived.'));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed' + (residuals.length ? ', ' + residuals.length + ' residual note(s)' : ''));
if (failures.length) { console.log('\nRED — the v92-differential deployment gate is NOT satisfied on this candidate:'); for (const f of failures) console.log('  - ' + f); }
process.exit(failures.length ? 1 : 0);
