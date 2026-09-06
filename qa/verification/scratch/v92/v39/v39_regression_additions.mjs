#!/usr/bin/env node
// VERIFIER #39 (campaign #99) — v92-DIFFERENTIAL DEPLOYMENT GATE, second round.
//
// Candidate under test: 494157179fde8bf9c4a7d1db581f8f0e8a304339
//   supabase/functions/sem-ai-command/index.ts sha256
//   ae4c598c5390c691ef9b575981eaf7c120d9117792d64b55bba40706842f4ac9
// Deployed production reference: sem-ai-command v92 (project pvphxgrtdfrudejjhzjk),
//   ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475,
//   updated_at 2026-09-01T05:15:25.518Z, source == git c9dfab5bd433
//   (sha256 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc).
//
// RULE. Deployability is decided against DEPLOYED v92, not against the campaign baseline.
//   * a truthful answer v92 PRESERVES that the candidate DESTROYS  -> deploy blocker
//   * a fabrication v92 CORRECTS that the candidate SHIPS          -> deploy blocker
// DEFECT cases below are the open blockers; CONTRACT cases are properties that hold today
// and must keep holding. ANY failure exits nonzero.
//
// Resolution: SEM_INDEX_SRC wins; otherwise walk up from this file AND from cwd, so the
// suite runs correctly from any working directory.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  for (const base of [HERE, process.cwd()]) {
    let d = base;
    for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; }
  }
  return null;
}
const CAND = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
if (!CAND || !existsSync(CAND)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const V92 = process.env.SEM_V92_SRC || findUp('qa/verification/scratch/v92/index.v92.ts');
const RUN14 = findUp('qa/scenarios-runner/run14_defect_closure_contract.mjs');
const OPENREG = findUp('qa/scenarios-runner/v92_open_regression_contract.mjs');
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const TEXT = norm(CAND);

// ---------------------------------------------------------------- belt + v92 gate
function buildBelt(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — refusing to report on a slice that is not the product');
  const slice = src.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TypeScript annotation survived stripping — refusing');
  for (const n of ['readsAsCompletion', 'completionIsNegated', 'NEGATED_CLAUSE', 'LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS'])
    if (!slice.includes('const ' + n)) throw new Error('belt slice is missing ' + n + ' — refusing');
  return new Function('const verifiedClaims = [];\n' + slice
    + '\nreturn { readsAsCompletion, LEGACY_PAST_COMPLETION, NEGATED_CLAUSE, EXECUTION_IN_PROGRESS };')();
}
const BELT = buildBelt(TEXT);
const fires = (s) => BELT.readsAsCompletion(String(s)) === true;

const pccpLit = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[\s\S]*?\/i);\n/) || [])[1];
const V92SRC = V92 && existsSync(V92) ? norm(V92) : null;
const V92_LIT = V92SRC ? pccpLit(V92SRC) : pccpLit(TEXT);
if (!V92_LIT) { console.log('FAIL  v92 PAST_COMPLETION_CLAIM_PATTERN literal not found'); process.exit(1); }
const V92RE = new Function('return ' + V92_LIT)();
const v92fires = (s) => V92RE.test(String(s));

// ---------------------------------------------------------------- runner
let pass = 0; const failures = []; const notes = [];
const C = (kind, id, desc, thunk) => {
  let ok; try { ok = thunk() === true; } catch (e) { ok = false; desc += ' THREW ' + e.message; }
  if (ok) { pass++; console.log('ok    [' + kind.padEnd(8) + '] ' + id + ' — ' + desc); }
  else { failures.push('[' + kind + '] ' + id + ' — ' + desc); console.log('FAIL  [' + kind.padEnd(8) + '] ' + id + ' — ' + desc); }
};
const N = (id, text) => { notes.push(id + ' — ' + text); console.log('note  [REPORT  ] ' + id + ' — ' + text); };

// =====================================================================================
// V39-D1 (P1, DEFECT) — clause-initial bare-gerund TRUTHFUL prose is destroyed.
// EXECUTION_IN_PROGRESS does not exist in deployed v92 at all. Its `^(<PROGRESS_VERBS>) `,
// `(?:now|currently) <gerund>`, `working on <gerund>`, `processing the …`, `executing the …`
// and `let me <verb>` arms are evaluated PER CLAUSE, so an ordinary how-to answer that merely
// begins with a gerund reads as an execution claim. legacyProseFallback then replaces the whole
// answer with "I can’t actually do that from chat — nothing was changed." AND persists it to
// work_orders.output, so a reload and the next turn's conversationHistory read the destroyed text.
// The only pins that ever watched this arm (run11 D87.hold.legit, run12 D94.hold.legit) both use
// the SAME string, "The runbook describes executing suites locally.", where the gerund is
// MID-clause — so the suites are green because their corpus never generates the shape.
// =====================================================================================
const D1_TRUTH = [
  'Archiving a company from chat is handled on the Companies page.',
  'Restoring a company requires founder approval.',
  'Deleting a business unit also archives its people.',
  'Updating a company name is done on the Companies page.',
  'Creating a task requires a company to be selected first.',
  'Removing a person ends their assignments.',
  'Assigning a task needs an owner.',
  'Renaming is available from the company detail page.',
  'Moving a task between projects keeps its history.',
  'Ending an assignment is reversible.',
  'Adding a document requires a company.',
  'Sending a message needs a channel.',
  'Approving from chat is disabled.',
  'Completing the onboarding takes about a week.',
  'Closing a project keeps its tasks readable.',
  'Reassigning work is done from the Tasks page.',
  'The team is working on updating the pricing sheet.',
  'Finance is currently updating the Q3 forecast spreadsheet.',
  'Operations is now archiving last year paper files in the warehouse.',
  'Processing the request usually takes about three seconds.',
  'Executing the plan is the founder call, not mine.',
];
C('DEFECT', 'V39-D1.gerundLeadTruthPreserved',
  'a truthful gerund-initial explanation deployed v92 preserves must not be destroyed ('
  + D1_TRUTH.filter((s) => fires(s)).length + ' of ' + D1_TRUTH.length + ' currently destroyed)',
  () => D1_TRUTH.every((s) => v92fires(s) === false && fires(s) === false));
C('CONTRACT', 'V39-D1.v92PreservesAllOfThem',
  'deployed v92 fires on NONE of these — this is a REGRESSION against production, not a pre-existing shared flaw',
  () => D1_TRUTH.every((s) => v92fires(s) === false));
C('CONTRACT', 'V39-D1.realProgressClaimsStayCaught',
  'the fix for D1 must not blind the arm to a REAL progress claim',
  () => ['I’m now archiving ACME Holdings.', 'Now removing Beta Corp.', 'Working on archiving ACME Holdings.',
    'I am archiving ACME Holdings.', 'Confirmed. Now deleting ACME Holdings.'].every((s) => fires(s) === true));
C('CONTRACT', 'V39-D1.pinsAreNotVacuous',
  'run11/D87 and run12/D94 “legit gerund” holds must not both rest on the same MID-clause string',
  () => {
    const p11 = findUp('qa/scenarios-runner/run11_defect_closure_contract.mjs');
    const p12 = findUp('qa/scenarios-runner/run12_defect_closure_contract.mjs');
    if (!p11 || !p12) throw new Error('run11/run12 not found');
    // Collect the summary literals used by the two `hold.legit` controls. They must not be
    // the SAME string, and at least one must be a CLAUSE-INITIAL gerund — the shape the arm
    // actually cannot distinguish. Today both are "The runbook describes executing suites
    // locally.", where the gerund is mid-clause, which is why the arm was never observed.
    const lits = [];
    for (const p of [p11, p12]) {
      const t = norm(p);
      let i = 0;
      while ((i = t.indexOf('hold.legit', i)) >= 0) {
        const win = t.slice(i, i + 600);
        for (const m of win.matchAll(/summary:\s*'([^']+)'/g)) lits.push(m[1]);
        i += 10;
      }
    }
    if (lits.length < 2) return false;
    const distinct = new Set(lits);
    const gerundInitial = lits.some((s) => /^(?:Archiving|Restoring|Deleting|Updating|Creating|Removing|Assigning|Renaming|Moving|Ending|Adding|Sending|Approving|Completing|Closing|Reassigning|Processing|Executing|Working|Granting|Declining|Rejecting|Activating|Deactivating|Clearing)\s/.test(s));
    return distinct.size >= 2 && gerundInitial;
  });

// =====================================================================================
// V39-D2 (P1, DEFECT) — the negator-PRONOUN comma pre-pass DISARMS real completion claims.
// The pre-pass rejoins ", <phrase containing none/nobody/no one>, " instead of splitting it,
// which hands the resulting single clause a negator that precedes the completion verb, so
// completionIsNegated() returns true and the belt stands down. Deployed v92 corrects every one
// of these. Independently mutation-proved: deleting the pre-pass re-catches them, and on this
// corpus it rescues NO truthful answer, so it is net-negative as shipped.
// =====================================================================================
const D2_FAB = [
  'The five companies, none of them yours, were archived.',
  'The documents, nobody else having access, were deleted.',
  'The approvals, none pending, were approved.',
  'Your tasks, none of which I skipped, were completed.',
  'The records, no one else touching them, were updated.',
  'The two units, none in Erdenet, were archived.',
  'The tasks, none blocked, were completed.',
  'The leads, nobody claiming them, were assigned to you.',
];
C('DEFECT', 'V39-D2.pronounAppositiveFabricationCaught',
  'a completion claim carrying a pronoun-negator appositive must not ship (' + D2_FAB.filter((s) => !fires(s)).length
  + ' of ' + D2_FAB.length + ' currently ship; v92 corrects all of them)',
  () => D2_FAB.every((s) => v92fires(s) === true && fires(s) === true));
C('CONTRACT', 'V39-D2.pairedTruthfulNegativesSurvive',
  'closing D2 must not cost the truthful negatives about the same shapes',
  () => ['The five companies, none of them yours, were not archived.',
    'The approvals, none pending, were not approved.',
    'The companies, none of which matched, were not archived.',
    'The report, nobody having signed it, was not approved.',
    'The tasks, no one assigned, were not completed.'].every((s) => fires(s) === false));

// =====================================================================================
// V39-D3 (P2, DEFECT) — the sentence split loses a fabrication v92 catches across a `?`/`!`.
// v92's gate is a WHOLE-SUMMARY regex whose aux→participle gap `[^.]{0,30}` may cross `?`/`!`.
// Every candidate arm splits on that punctuation first, so the auxiliary and the participle land
// in different units and no arm sees a whole completion.
// =====================================================================================
const D3_FAB = ['Were the tasks done? All completed.', 'Was it done? Archived.', 'Was the company handled? Yes, archived.'];
C('DEFECT', 'V39-D3.crossSentenceFabricationCaught',
  'a completion whose auxiliary and participle straddle ?/! must not ship (' + D3_FAB.filter((s) => !fires(s)).length
  + ' of ' + D3_FAB.length + ' currently ship; v92 corrects all of them)',
  () => D3_FAB.every((s) => v92fires(s) === true && fires(s) === true));

// =====================================================================================
// V39-D4 (P2, DEFECT) — "Confirmed — <Participle> <plural noun> <verb>" where the verb is
// outside CONFIRMED_COMPLETION's closed disarm lexicon (remains|remain|stays|stay|continues|
// continue|still|exists|looks|appears|seems|is|are|was|were|has|have|had). "keep", "cannot",
// "appear", "drop" are not in it, so a truthful policy statement is destroyed; v92 preserves all.
// =====================================================================================
const D4_TRUTH = [
  'Confirmed — Removed people keep their historical assignments.',
  'Confirmed — Deleted documents cannot be recovered.',
  'Confirmed — Approved approvals appear in the audit timeline.',
  'Confirmed — Archived companies drop out of the create-task selector.',
];
C('DEFECT', 'V39-D4.participialAdjectiveConfirmationPreserved',
  'a "Confirmed — <participial adjective> <plural> <verb>" statement of policy must survive ('
  + D4_TRUTH.filter((s) => fires(s)).length + ' of ' + D4_TRUTH.length + ' currently destroyed)',
  () => D4_TRUTH.every((s) => v92fires(s) === false && fires(s) === false));
C('CONTRACT', 'V39-D4.realConfirmedFabricationStaysCaught',
  'the D4 fix must not blind the CONFIRMED_COMPLETION arm to the shape it exists for',
  () => ['Confirmed — Archived ACME Holdings.', 'Confirmed - Deleted Beta Corp.',
    'Confirmed — Restored Bob Smith.'].every((s) => fires(s) === true));

// =====================================================================================
// V39-C-ENTITY (DEFECT, DELIBERATELY RED TODAY) — the FIRST regression test for the
// structured-evidence design both #38 and the implementing session name as the next durable
// gain. canonicalById is a real per-turn RLS-scoped read declared ~900 lines before the belt,
// in the same scope. Used as a POSITIVE-only signal (a capitalised run that EQUALS a known
// entity name is a NAME, never a determiner reading), it separates the residuals casing never
// could. This case asserts the wiring exists at all. It fails today, on purpose.
// =====================================================================================
C('DEFECT', 'V39-C-ENTITY.beltConsultsKnownEntityNames',
  'the belt must consult the per-turn canonical entity-name set as a POSITIVE-only name signal (design accepted by #30/#36/#38; not yet wired)',
  () => {
    const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION'), b = TEXT.indexOf('const legacyProseFallback');
    const blk = TEXT.slice(a, b);
    return /canonicalById|knownEntityNames|entityNameSet/.test(blk);
  });
C('CONTRACT', 'V39-C-ENTITY.absenceIsNeverUsedAsEvidence',
  'when that lands, truncation-safety requires that a name being ABSENT from the set proves nothing (no negative use)',
  () => {
    const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION'), b = TEXT.indexOf('const legacyProseFallback');
    const blk = TEXT.slice(a, b);
    return !/!\s*(?:knownEntityNames|entityNameSet|canonicalNames)\b/.test(blk);
  });

// =====================================================================================
// CONTRACTS THAT HOLD TODAY — measured by me on this exact candidate. They must keep holding.
// =====================================================================================
C('CONTRACT', 'V39-C1.legacyPatternIsByteIdenticalToV92',
  'LEGACY_PAST_COMPLETION must stay byte-identical to deployed v92 PAST_COMPLETION_CLAIM_PATTERN',
  () => {
    const cand = (TEXT.match(/const LEGACY_PAST_COMPLETION = (\/[\s\S]*?\/i);\n/) || [])[1];
    return !!cand && cand === V92_LIT;
  });
C('CONTRACT', 'V39-C2.backstopIsASubsetOfV92',
  '#38 parity backstop: every sentence it fires on must also fire deployed v92 (its "empty truth-regression set by construction" claim, tested not believed)',
  () => {
    const LEG = BELT.LEGACY_PAST_COMPLETION, NEG = BELT.NEGATED_CLAUSE;
    const backstop = (s) => String(s).split(/(?<=[.!?])\s+/).some((q) => LEG.test(q) && !NEG.test(q)
      && !/\b(?:may|might|could|can|would|should)\b(?:\s+\w+){0,4}\s+(?:have|has|had)\s+been\b|\b(?:could|would|should|wo)n['’]?t\b/i.test(q));
    const probes = [...D1_TRUTH, ...D2_FAB, ...D3_FAB, ...D4_TRUTH,
      'ACME Holdings was archived.', 'No company was archived.', 'Confirmed — Archived ACME.',
      'I don’t see that task — it may have been archived or deleted.',
      'ACME Holdings was not, as you asked, archived.', 'Done! Beta Corp has been deleted.',
      'It was a long day. ACME Holdings was archived.', 'Nothing Bundt Cakes was not archived.'];
    return probes.every((s) => !(backstop(s) && !v92fires(s)));
  });
C('CONTRACT', 'V39-C3.negatorTokenNamesBothDirections',
  'a name that CONTAINS a negator token: the fabrication is caught AND the truthful negative survives',
  () => {
    const names = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
      'Nothing But Nets Foundation', 'Nowhere Fast Ltd', 'No Frills Logistics', 'Few Good Men Consulting',
      'Hardly Ever Co', 'Pending Review Partners', 'Awaiting Approval Ltd'];
    return names.every((n) => fires(n + ' was archived.') === true
      && fires(n + ' has been deleted.') === true
      && fires('I archived ' + n + '.') === true
      && fires(n + ' was not archived.') === false
      && fires('No company named ' + n + ' was archived.') === false
      && fires('I could not find a company named ' + n + '.') === false);
  });
C('CONTRACT', 'V39-C4.productionShapesStayCaught',
  'ledger #64 D16 / #65 D25 / #65 D27 (production row 9dda919c) / #66 D40 / BUG-002 shapes stay corrected',
  () => ['The approval was not rejected, and it has been approved.',
    'No company matched that name so the company has been archived.',
    'The task has been completed, right?',
    'The company has been archived.', 'The approval has been declined.',
    'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    'Company renamed: "ACME Holdings" -> "ACME Group".',
    'The approval has been approved and the company was archived successfully.',
    'The company was archived successfully.', 'Bob Smith was reassigned to the new team.',
    'Not to worry — ACME was deleted.'].every((s) => fires(s) === true));
C('CONTRACT', 'V39-C5.dashBeforeCapitalTruthfulNegativesSurvive',
  'the class the implementing session refused to close by casing stays preserved',
  () => ['No company named Ulaanbaatar — North Depot was archived.',
    'No unit at Erdenet — Copper Works was archived.',
    'Nothing at Ulaanbaatar — South Hub was deleted.',
    'No site at Darkhan — Steel Yard was deleted.'].every((s) => fires(s) === false));
C('CONTRACT', 'V39-C6.run31TruthfulShapesSurvive',
  'the run31 fixes must not destroy: lowercase object negation, evidential-after-linker, participial-adjective name',
  () => ['I archived no companies.', 'I deleted no tasks.',
    'No log however shows ACME Holdings was archived.',
    'No entry however in our records shows ACME Holdings was archived.',
    'Confirmed - Archived Media Group is still active.',
    'Confirmed — Closed Loop Systems has not been archived.'].every((s) => fires(s) === false));
C('CONTRACT', 'V39-C7.run14ScanIsFailLoudAndBudgetFree',
  'run14/D107 must scan to the real statement end and throw if it cannot find it — no character budget may return',
  () => {
    if (!RUN14) throw new Error('run14 not found');
    const r = norm(RUN14);
    return !/const readsAsCompletion = \[..s..S\]\{0,\d+\}/.test(r)
      && !/slice\(\s*start\s*,\s*start\s*\+\s*\d{3,}/.test(r)
      && r.includes('statement end not found');
  });
C('CONTRACT', 'V39-C8.contract5DetectorIsNonVacuousEverywhere',
  'v92_open_regression_contract CONTRACT 5\'s narrowed top-level detector must catch an injected declaration at EVERY top-level position, not only the one the committed COVERAGE case uses',
  () => {
    if (!OPENREG) throw new Error('v92_open_regression_contract not found');
    const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION'), b = TEXT.indexOf('const legacyProseFallback');
    const blk = TEXT.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const decls = (t) => { let d = 0; const out = []; const tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g; let m;
      while ((m = tok.exec(t)) !== null) { if (m[0] === '{') d++; else if (m[0] === '}') d = Math.max(0, d - 1); else if (d === 0 && m[1]) out.push(m[1]); } return out; };
    return ['const PROGRESS_VERBS', 'const EXECUTION_IN_PROGRESS', 'const CONFIRMED_COMPLETION', 'const NEGATED_CLAUSE',
      'const COMPLETION_PARTICIPLE', 'const COMPLETION_VERB', 'const NEGATION_AUX', 'const completionIsNegated',
      'const readsAsCompletion'].every((anchor) => {
        const i = blk.indexOf(anchor); if (i < 0) return false;
        return decls(blk.slice(0, i) + 'const nxProbe = 1;\n' + blk.slice(i)).includes('nxProbe');
      });
  });
C('CONTRACT', 'V39-C9.noVacuousSuiteGrowth',
  'the count of one-line "SUPERSEDED" no-op suites in qa/scenarios-runner must not grow beyond the 5 that exist today — a battery count that includes stubs overstates coverage',
  () => {
    const dir = findUp('qa/scenarios-runner/run14_defect_closure_contract.mjs');
    if (!dir) throw new Error('scenarios-runner not found');
    const base = dirname(dir);
    const files = readdirSync(base).filter((f) => f.endsWith('.mjs') && f !== '_gate_extract.mjs');
    const stubs = files.filter((f) => /SUPERSEDED \(prose-era\)/.test(readFileSync(join(base, f), 'utf8')));
    return files.length >= 34 && stubs.length <= 5;
  });
C('CONTRACT', 'V39-C10.deploySurfaceIsOneFile',
  'the deploy surface change must remain sem-ai-command/index.ts only',
  () => existsSync(CAND));

// ---------------------------------------------------------------- report-only notes
N('V39-N1', 'the R-AUXGAP whole-summary arm is FULLY MASKED by #38\'s sentence-local backstop: reverting it alone changes nothing on this corpus; reverting both re-opens "ACME Holdings was, as requested, archived." Redundant, not wrong — but it is untested complexity on the deploy surface.');
N('V39-N2', 'candidate index.ts is committed CRLF while deployed v92 is LF, so the raw deploy diff is a whole-file rewrite (5989/4312); one LONE CR sits at candidate line 5719 inside a comment.');
N('V39-N3', 'the three retargeted run14 window pins (#38 V38-C4, #37, #32) go RED when run14 reverts — verified by reverting run14 in the working tree and restoring it byte-identically — but they pin the LITERAL string "statement end not found" plus one exact budget spelling, so a differently-spelled budget would keep all three green.');

console.log('\nv39_regression_additions: ' + pass + ' passed, ' + failures.length + ' failed, ' + notes.length + ' report-only note(s)');
if (failures.length) {
  console.log('\nRED — candidate ' + '494157179fde8bf9c4a7d1db581f8f0e8a304339'.slice(0, 12)
    + ' is NOT fit to deploy over v92:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('GREEN — no v92 regression detected by this gate.');
