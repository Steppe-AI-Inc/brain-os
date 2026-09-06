#!/usr/bin/env node
// ============================================================================================
// VERIFIER #44 — campaign #104 regression additions (v92 DEPLOYMENT DIFFERENTIAL).
//
// Candidate under test: 3f6e05cfb751aeaac5796defd10c37ea24075bf8
//   supabase/functions/sem-ai-command/index.ts sha256 3e56dbd163bbfc89a…
// Deployed production:  git c9dfab5bd433, index.ts sha256 795c20c82301aba1…
//
// WHAT THIS FILE IS. Six DEFECT groups I found by building my own corpus, plus the CONTRACTs
// that must keep holding while they are fixed. Every DEFECT check asserts the defect is CLOSED,
// so on the candidate as committed this file EXITS NONZERO. That is the finding, not a bug in
// the harness — run it against qa/verification/scratch/v44/fix44.ts (the prepared fix) and the
// four truth-regression groups and one of the two fabrication-regression groups go green.
//
// RULES THIS FILE FOLLOWS
//   * ANY failure exits nonzero.
//   * index.ts is located from SEM_INDEX_SRC, else a path correct from ANY cwd, else the cwd.
//   * The belt is extracted WHOLE (anchor to anchor), never from a named-const list, so a new
//     declaration cannot be silently dropped.
//   * knownEntityNames — the belt's ONE free identifier — is injected EXPLICITLY. Three suites
//     in the battery do not inject it at all and therefore ReferenceError on the whole
//     "Confirmed — <Participle> <Name>" family; V44-D7 below is the scanner for that.
// ============================================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.SEM_INDEX_SRC,
  resolve(HERE, '../../../supabase/functions/sem-ai-command/index.ts'),   // qa/verification/proposed → repo root
  resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts'),
  resolve(process.cwd(), 'supabase/functions/sem-ai-command/index.ts'),
].filter(Boolean);
const SRC = CANDIDATES.find((p) => existsSync(p));
if (!SRC) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const V92 = [resolve(HERE, '../scratch/v92/index.v92.ts'), resolve(process.cwd(), 'qa/verification/scratch/v92/index.v92.ts')].find((p) => existsSync(p));
if (!V92) { console.log('FAIL  cannot locate the deployed-v92 reference copy'); process.exit(1); }
const RUNNER = [resolve(HERE, '../../scenarios-runner'), resolve(process.cwd(), 'qa/scenarios-runner')].find((p) => existsSync(p));

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const src = read(SRC);
const v92src = read(V92);

// ---- gates ---------------------------------------------------------------------------------
const pccpLit = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
const V92RE = new Function('return ' + pccpLit(v92src))();
const v92 = (s) => V92RE.test(String(s));

const stripComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
function beltBlock(s) {
  const a = s.indexOf('const LEGACY_PAST_COMPLETION');
  const b = s.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt anchors not found — refusing to report');
  return s.slice(a, b);
}
function buildBelt(text, names = []) {
  const slice = stripComments(beltBlock(text))
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('a TS annotation survived extraction — refusing to report');
  if (!/completionIsNegated\(/.test(slice.split('const readsAsCompletion =')[1] || '')) {
    throw new Error('readsAsCompletion no longer routes through completionIsNegated — refusing to report');
  }
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  return new Function(seed + slice + '\nreturn readsAsCompletion;')();
}
const belt = buildBelt(src);
const fires = (s) => belt(String(s)) === true;

let pass = 0; const failures = [];
const check = (kind, id, ok, detail) => {
  if (ok) { pass++; console.log('ok    [' + kind + '] ' + id); }
  else { failures.push('[' + kind + '] ' + id + (detail ? ' — ' + detail : '')); console.log('FAIL  [' + kind + '] ' + id + (detail ? ' — ' + detail : '')); }
};
// A TRUTHFUL row deployed v92 preserves must not be destroyed by the candidate.
const truthSurvives = (kind, id, t) => check(kind, id + ' :: ' + JSON.stringify(t).slice(0, 96), !(!v92(t) && fires(t)),
  'deployed v92 PRESERVES this truthful answer and the candidate DESTROYS it');
// A FABRICATION deployed v92 corrects must not be shipped by the candidate.
const fabCaught = (kind, id, t) => check(kind, id + ' :: ' + JSON.stringify(t).slice(0, 96), !(v92(t) && !fires(t)),
  'deployed v92 CORRECTS this fabrication and the candidate SHIPS it');

// =============================================================================================
console.log('source : ' + SRC);
console.log('v92    : ' + V92 + '\n');

console.log('--- V44-D1 (P1, TRUTH REGRESSION). Every EXECUTION_IN_PROGRESS product-help guard is');
console.log('    anchored ^<gerund>, so a leading adverbial defeats all three and an ordinary');
console.log('    answer about what the product DOES is replaced with a false refusal.');
for (const g of ['archiving', 'restoring', 'deleting', 'renaming', 'assigning', 'removing', 'adding', 'sending', 'approving', 'clearing']) {
  truthSurvives('DEFECT', 'V44-D1.now.' + g, 'Now ' + g + ' a company is only available from the app.');
  truthSurvives('DEFECT', 'V44-D1.currently.' + g, 'Currently ' + g + ' a company requires manager rights.');
}
truthSurvives('DEFECT', 'V44-D1.nowKeepsHistory', 'Now archiving a company keeps its history.');
truthSurvives('DEFECT', 'V44-D1.currentlyEnds', 'Currently removing someone ends their employment record.');

console.log('\n--- V44-D2 (P1, TRUTH REGRESSION). The "working on <gerund>" arm has no subject test, so');
console.log('    a sentence about somebody ELSE working reads as this turn executing.');
truthSurvives('DEFECT', 'V44-D2.anyone', 'Anyone working on archiving a company needs manager rights.');
truthSurvives('DEFECT', 'V44-D2.theTeam', 'The team working on restoring the depot data finished last week.');
truthSurvives('DEFECT', 'V44-D2.everyone', 'You will find everyone working on renaming under the Projects tab.');

console.log('\n--- V44-D3 (P2, TRUTH REGRESSION). "let me <verb>" fires on a DEFERRED offer that');
console.log('    explicitly waits for the founder. run12/D94 aimed the arm at an imminent claim;');
console.log('    an offer conditioned on confirmation is not one.');
truthSurvives('DEFECT', 'V44-D3.onceYouConfirm', 'Let me archive the company once you confirm.');
truthSurvives('DEFECT', 'V44-D3.ifYouApprove', 'Let me restore the company if you approve.');
truthSurvives('DEFECT', 'V44-D3.onlyAfter', 'Let me delete that only after your approval.');

console.log('\n--- V44-D4 (P2, TRUTH REGRESSION). "(is|are) (being|getting) <participle>" inside a');
console.log('    relative clause or a generic statement is a STATE, not this turn.');
truthSurvives('DEFECT', 'V44-D4.relativeClause', 'A company that is being archived still shows its history.');
truthSurvives('DEFECT', 'V44-D4.anythingThat', 'Anything that is being deleted stays in the audit log.');
truthSurvives('DEFECT', 'V44-D4.generic', 'Records are being archived nightly by the platform, not by me.');

console.log('\n--- V44-D5 (P1, FABRICATION REGRESSION). nameInternal requires a CONTIGUOUS capitalised');
console.log('    run before the auxiliary, so a COORDINATED proper-name subject breaks it and a');
console.log('    fabrication deployed v92 corrects is shipped. D-V92-R1 is not closed.');
for (const n of ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Not Just Coffee', 'Nowhere Fast Logistics', 'No Doubt Trading',
  'Few Good Men Consulting', 'Hardly Strictly LLC', 'No Man Land Mining', 'None Shall Pass Security']) {
  fabCaught('DEFECT', 'V44-D5.coordinated.' + n.split(' ')[1], n + ' and Beta Corp were archived.');
}
fabCaught('DEFECT', 'V44-D5.coordinatedHasBeen', 'No Doubt Trading and Gobi Cashmere have been archived.');
// and the truthful counterparts about the SAME names must still survive
for (const t of ['No Limits Inc and Beta Corp were not archived.',
  'Nothing Bundt Cakes and Beta Corp have not been archived.',
  'No ACME Holdings and Beta Corp records were updated.',
  'No ACME Holdings task was completed.',
  'No company named Salt and Pepper Co was archived.',
  'No company named Ulaanbaatar — North Depot was archived.',
  'No unit at Erdenet — Copper Works was archived.']) {
  truthSurvives('CONTRACT', 'V44-D5.pairedTruthSurvives', t);
}

console.log('\n--- V44-D6 (P1, FABRICATION REGRESSION). A negator-initial NAME that is not clause-initial');
console.log('    (mid-clause, after a preposition or a determiner+noun) still disarms the belt.');
fabCaught('DEFECT', 'V44-D6.taskNamed', 'The task No Limits Inc audit was archived.');
fabCaught('DEFECT', 'V44-D6.approvalFor', 'The approval for Pending review of the Q3 ledger has been approved.');
fabCaught('DEFECT', 'V44-D6.employmentFor', 'The employment record for Pending review of the Q3 ledger was ended.');
fabCaught('DEFECT', 'V44-D6.accessFor', 'Access for Pending review of the Q3 ledger was granted.');
fabCaught('DEFECT', 'V44-D6.awaitingTitle', 'The approval for Awaiting approval of the depot plan has been approved.');
truthSurvives('CONTRACT', 'V44-D6.pairedTruthSurvives.1', 'The task No Limits Inc audit was not archived.');
truthSurvives('CONTRACT', 'V44-D6.pairedTruthSurvives.2', 'The approval for Pending review of the Q3 ledger was not approved.');

console.log('\n--- V44-D7 (P2, SUITE INTEGRITY). The belt reads ONE free identifier, knownEntityNames.');
console.log('    The campaign record says EVERY extractor injects it as an empty Set. It does not:');
console.log('    a suite that omits it ReferenceErrors on the whole "Confirmed — <Participle> <Name>"');
console.log('    family, and run28\'s "predicate never throws" fuzz cannot spell "Confirmed".');
{
  const CONFIRMED_PROBE = 'Confirmed — Archived ACME Holdings.';
  // Build the belt with NO seed at all — exactly what run18 / run28 / v92_open_regression_contract
  // do — and prove it throws on the Confirmed-participle-name shape.
  const unseeded = (() => {
    const slice = stripComments(beltBlock(src))
      .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
      .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
    return new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
  })();
  let tripped = false;
  try { unseeded(CONFIRMED_PROBE); } catch (e) { tripped = /knownEntityNames is not defined/.test(String(e && e.message)); }
  check('CONTRACT', 'V44-D7.freeIdentifierIsReal (a belt built without knownEntityNames throws on the Confirmed shape)', tripped,
    'the probe did not throw — re-derive this contract, the belt may no longer read the identifier');
  if (RUNNER) {
    // A suite is clean if IT injects the identifier, or if the extractor helper it imports does.
    const LIB = [resolve(HERE, '../lib/belt_extract.mjs'), resolve(process.cwd(), 'qa/verification/lib/belt_extract.mjs')].find((p) => existsSync(p));
    const libInjects = LIB ? /knownEntityNames/.test(readFileSync(LIB, 'utf8')) : false;
    const offenders = [];
    for (const f of readdirSync(RUNNER).filter((x) => x.endsWith('.mjs'))) {
      const t = readFileSync(resolve(RUNNER, f), 'utf8');
      if (!/readsAsCompletion/.test(t)) continue;
      if (/knownEntityNames/.test(t)) continue;
      if (libInjects && /belt_extract\.mjs/.test(t)) continue;   // extraction delegated to the vendored helper
      offenders.push(f);
    }
    check('DEFECT', 'V44-D7.everyBeltBuildingSuiteInjectsKnownEntityNames', offenders.length === 0,
      offenders.length + ' suite(s) build the belt without injecting it, so they cannot test the '
      + 'Confirmed-participle-name arm at all and would crash if a row of that shape were added: ' + offenders.join(', '));
    // and the fuzz that is supposed to notice cannot: its alphabet has no letters for "Confirmed"
    const r28 = resolve(RUNNER, 'run28_defect_closure_contract.mjs');
    if (existsSync(r28)) {
      const alpha = (readFileSync(r28, 'utf8').match(/const chars = '([^']*)'/) || [])[1] || '';
      const spellable = 'Confirmed'.split('').every((ch) => alpha.includes(ch));
      check('DEFECT', 'V44-D7.neverThrowsFuzzCanReachTheThrowingShape', spellable,
        'the 2000-case fuzz alphabet ' + JSON.stringify(alpha) + ' cannot spell "Confirmed", so '
        + '"predicate never throws" is vacuous for the only shape that throws');
    }
  }
}

console.log('\n--- CONTRACT: everything the candidate already gets right, pinned so a fix cannot trade it away');
for (const t of ['Now archiving ACME Holdings.', 'Currently archiving ACME Holdings.',
  'Working on archiving ACME Holdings.', 'I am working on archiving ACME Holdings.',
  'ACME Holdings is being archived.', 'The company is being archived right now.',
  'Confirmed — Archived ACME.', 'Confirmed — Restored Bob Smith.',
  'No Limits Inc was archived.', 'Nothing Bundt Cakes was archived.',
  'Pending Review Partners was archived.', 'The company with no active tasks was archived.',
  'No errors occurred and ACME was archived.', 'No problem — ACME Holdings was archived.',
  'Nothing failed: ACME Corp was archived.', 'ACME was archived — no undo available.',
  'The approval has been approved.', 'The company was archived successfully.',
  'Project renamed: "Old" → "New".', 'No errors ACME was archived.',
  'No problem the log shows ACME was archived.', 'Not a single task moved - Bob Smith was removed.']) {
  check('CONTRACT', 'stillCaught :: ' + JSON.stringify(t).slice(0, 84), fires(t), 'the candidate no longer catches this fabrication');
}
for (const t of ['Confirmed — No Business Unit Archived.', 'Confirmed — Archived Media Group. It is still active.',
  'Confirmed — Archived Media Group is still active.', 'Confirmed — the company you asked about is in Ulaanbaatar.',
  'Confirmed — Archive ACME?', 'I archived no companies.', 'I removed no one from the roster.',
  'I restored order to the list.', 'The company was, after a careful review of the depot records, not archived.',
  'The company has, despite the request from the manager, not been archived.',
  'Archiving a company hides it from the active list.', 'Restoring a company brings back its tasks.',
  'Processing the request happens on the server, not in chat.', 'Executing the plan requires founder approval.',
  'I am not archiving anything.', 'Nothing is being archived right now.',
  'Companies in the process of archiving still show in reports.',
  'If you are about to archive a company, check its tasks first.',
  'The document may have been archived last year.', 'The company should have been archived.']) {
  check('CONTRACT', 'stillPreserved :: ' + JSON.stringify(t).slice(0, 84), !fires(t), 'the candidate now destroys this truthful answer');
}

console.log('\n--- CONTRACT: production shapes ledger #64 D16 / #65 D25 / #65 D27 / #66 D40 stay closed');
for (const t of ['The approval was not rejected, and it has been approved.',
  'No company matched that name so the company has been archived.',
  'The status is not draft (the goal has been archived).',
  'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
  'Company renamed: "ACME Holdings" -> "ACME Group".',
  'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
  'The approval has been approved and the company was archived successfully.',
  'Bob Smith was reassigned to the new team.']) {
  fabCaught('CONTRACT', 'productionShape', t);
}

console.log('\n--- CONTRACT: structural invariants (a fix must not reach for a banned construct)');
{
  const blk = stripComments(beltBlock(src));
  check('CONTRACT', 'noWholeSpanLookahead (D117 stays closed)', !/\(\?![^]\*/.test(blk) && !blk.includes('(?![^]*'), 'a whole-summary negation lookahead is back');
  check('CONTRACT', 'noInlineModifierGroup (unverified in the Deno Edge runtime)', !/\(\?-?i:/.test(blk), 'an inline modifier group would fail to construct at module load');
  const depth = (() => { let d = 0, out = [], tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g, m;
    while ((m = tok.exec(blk)) !== null) { if (m[0] === '{') d++; else if (m[0] === '}') d = Math.max(0, d - 1); else if (d === 0 && m[1]) out.push(m[1]); } return out; })();
  check('CONTRACT', 'beltTopLevelDeclarations unchanged (' + depth.length + ')',
    depth.join(',') === 'LEGACY_PAST_COMPLETION,PROGRESS_VERBS,EXECUTION_IN_PROGRESS,me,hasSupportedMutationClaim,CONFIRMED_COMPLETION,NEGATED_CLAUSE,REFERENCELESS_CONFIRMATION,COMPLETION_PARTICIPLE,COMPLETION_VERB,NEGATION_AUX,completionIsNegated,readsAsCompletion',
    'got: ' + depth.join(','));
  check('CONTRACT', 'v92 PCCP byte-identical in the candidate', pccpLit(src) === pccpLit(v92src), 'the candidate changed the deployed regex');
  check('CONTRACT', 'predicate never throws on 4000 fuzzed strings INCLUDING the Confirmed shape', (() => {
    const alpha = 'abcXYZ .,;:—-()\'"0123456789\n\t?!';
    const LEAD = ['', 'Confirmed — ', 'Confirmed - ', 'No problem — ', 'Now ', 'Currently '];
    const WORD = ['Archived', 'Restored', 'ACME Holdings', 'archiving', 'was archived', 'not', 'No Limits Inc'];
    for (let i = 0; i < 4000; i++) {
      let s = LEAD[i % LEAD.length];
      const n = 1 + (i % 12);
      for (let j = 0; j < n; j++) s += (i + j) % 3 === 0 ? WORD[(i + j) % WORD.length] + ' ' : alpha[(i * 7 + j * 13) % alpha.length];
      try { belt(s); } catch { return false; }
    }
    return true;
  })(), 'readsAsCompletion threw');
}

console.log('\nv44_regression_additions: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFAILING:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
