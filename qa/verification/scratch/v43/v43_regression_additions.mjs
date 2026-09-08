#!/usr/bin/env node
// =====================================================================================
// VERIFIER #43 — permanent regression additions (campaign #103, candidate 0007a02).
//
// ANY failure exits nonzero. Two of the DEFECT blocks below are RED ON THE CANDIDATE AS
// COMMITTED, deliberately and correctly: they pin the two truthful-answer classes that
// deployed v92 preserves and the candidate destroys. They go green the moment the two
// prepared fixes in qa/verification/scratch/v43/ are adopted, and they must never be
// re-labelled "disclosed residual" to make this file green.
//
// The source is taken from SEM_INDEX_SRC when set, otherwise located by walking UP from
// this file, so the suite runs correctly from ANY cwd and from inside a worktree.
// =====================================================================================
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = findUp('qa/verification/scratch/v92/index.v92.ts');
const RUNNER = findUp('qa/scenarios-runner');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92) { console.log('FAIL  cannot locate the deployed-v92 reference source'); process.exit(1); }
if (!RUNNER) { console.log('FAIL  cannot locate qa/scenarios-runner'); process.exit(1); }

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const TEXT = read(SRC);

// ---- belt, with a caller-chosen entity-name set (the one free identifier the belt reads) -------
function buildBelt(names) {
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — update this suite, do not let it pass');
  const slice = TEXT.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
    .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify([...names].map((n) => String(n).toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}
const belt = buildBelt([]);
const pccp = read(V92).match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
if (!pccp) { console.log('FAIL  PAST_COMPLETION_CLAIM_PATTERN not found in the v92 reference'); process.exit(1); }
const PCCP = new Function('return ' + pccp[1])();
const v92 = (s) => PCCP.test(String(s));

let pass = 0; const failures = [];
function check(kind, id, cond, detail) {
  if (typeof cond !== 'boolean') { // the V43-D4 defect class, guarded against in this file itself
    failures.push(id + ' — ASSERTION IS VACUOUS: cond is a ' + typeof cond + ', not a boolean');
    console.log('VACUOUS [' + kind + '] ' + id + ' — cond is a ' + typeof cond);
    return;
  }
  if (cond) { pass++; console.log('ok      [' + kind + '] ' + id); }
  else { failures.push(id + (detail ? ' — ' + detail : '')); console.log('FAIL    [' + kind + '] ' + id + (detail ? ' — ' + detail : '')); }
}

console.log('=== v43 regression additions — source ' + SRC + '\n');

// =====================================================================================
// V43-D4 (P0, SUITE INTEGRITY) — an assertion helper called with more arguments than it
// declares. entity_signal_positive_contract.mjs does this in FOUR of its five checks, so
// the description string lands in `cond` and every one of them passes unconditionally.
// The entity signal — the campaign's newest and least-tested mechanism — is therefore
// completely unmeasured: disabling it outright leaves that suite at 5/0.
// This is the SEVENTH vacuity of this campaign. Pin the CLASS, not the instance.
// =====================================================================================
function splitArgs(s) {
  const out = []; let d = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { cur += c + s[++i]; continue; } if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function callArgText(src, openParen) {
  let d = 0, q = null;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return src.slice(openParen + 1, i); }
  }
  return null;
}
function vacuityScan() {
  const hits = [];
  for (const f of readdirSync(RUNNER).filter((x) => x.endsWith('.mjs')).sort()) {
    const src = readFileSync(join(RUNNER, f), 'utf8');
    if (/SUPERSEDED[\s\S]{0,400}?DOES NOT RUN/.test(src)) continue; // documented dead stub
    const decls = [...src.matchAll(/(?:const|let|var)\s+(\w*(?:check|assert|expect|must|require)\w*)\s*=\s*\(([^)]*)\)\s*=>/gi)]
      .concat([...src.matchAll(/function\s+(\w*(?:check|assert|expect|must|require)\w*)\s*\(([^)]*)\)/gi)]);
    for (const d of decls) {
      const params = splitArgs(d[2]).filter(Boolean);
      if (params.some((p) => p.startsWith('...'))) continue;
      const condIdx = params.findIndex((p) => /^(cond|ok|pass|condition|expr|assertion|holds|truthy)$/i.test(p));
      const re = new RegExp('(?<![\\w.])' + d[1] + '\\s*\\(', 'g');
      let m;
      while ((m = re.exec(src)) !== null) {
        if (m.index === d.index) continue;
        const inner = callArgText(src, m.index + m[0].length - 1);
        if (inner === null) continue;
        const args = splitArgs(inner);
        const line = src.slice(0, m.index).split('\n').length;
        if (args.length > params.length) hits.push(`${f}:${line} ${d[1]}() declares ${params.length} params, called with ${args.length}`);
        else if (condIdx >= 0 && args.length > condIdx && /^["'`]/.test(args[condIdx])) hits.push(`${f}:${line} ${d[1]}() got a STRING LITERAL in the \`${params[condIdx]}\` position`);
      }
    }
  }
  return hits;
}
{
  const hits = vacuityScan();
  check('DEFECT', 'V43-D4.noAssertionHelperIsCalledOverArity', hits.length === 0,
    `${hits.length} vacuous assertion call site(s): ${hits.slice(0, 8).join(' | ')}`);
}
{
  // COVERAGE, non-vacuity of the scanner itself: it must flag a synthetic over-arity call.
  const probe = 'const check = (kind, label, cond, detail) => {};\ncheck("A", "B", "C", true, "D");\n';
  const decls = [...probe.matchAll(/(?:const|let|var)\s+(\w*(?:check)\w*)\s*=\s*\(([^)]*)\)\s*=>/gi)];
  const params = splitArgs(decls[0][2]);
  const call = probe.indexOf('check("A"');
  const args = splitArgs(callArgText(probe, probe.indexOf('(', call)));
  check('CONTRACT', 'V43-C4.vacuityScannerIsItselfNonVacuous', args.length > params.length,
    'the over-arity detector does not detect a synthetic over-arity call');
}

// =====================================================================================
// V43-D1 (P1, DEPLOY BLOCKER) — "Confirmed — <Participle> <Name>. <state continuation>".
// Deployed v92 preserves every one of these; the candidate destroys them and replaces the
// true answer with a false refusal. The candidate ALREADY rescues the identical answer
// when the continuation sits in the SAME sentence, so this is not world-knowledge-bound:
// it is one window in one regex. Prepared fix: qa/verification/scratch/v43/v43_build_fixD3.mjs.
// =====================================================================================
const PART = ['Archived', 'Restored', 'Removed', 'Deleted', 'Renamed', 'Completed', 'Closed', 'Cleared', 'Sent', 'Moved', 'Granted', 'Added', 'Assigned', 'Approved'];
const PNAMES = ['Media Group', 'Furniture Co', 'Skies Ltd', 'Parcel Co', 'Works Inc', 'Goods Ltd', 'Loop Systems', 'Value Group'];
const TAILS = ['It is still active.', 'It remains active.', 'It still exists in the active list.', 'They remain active.', 'This still shows as active.', 'That remains open.', 'It continues to be active.'];
const D1_ROWS = [];
for (const p of PART) for (const n of PNAMES) for (const t of TAILS) D1_ROWS.push(`Confirmed - ${p} ${n}. ${t}`);
{
  check('CONTRACT', 'V43-C1.v92PreservesTheWholeD1Class', D1_ROWS.every((s) => !v92(s)),
    'deployed v92 fires on some of these, so they would not be regressions — re-derive before trusting this block');
  const destroyed = D1_ROWS.filter((s) => !v92(s) && belt(s));
  check('DEFECT', 'V43-D1.stateContinuationAfterAParticipleInitialNameSurvives', destroyed.length === 0,
    `${destroyed.length} of ${D1_ROWS.length} truthful answers deployed v92 preserves are destroyed, e.g. ${JSON.stringify(destroyed[0] || '')}`);
}

// =====================================================================================
// V43-D6 (P1, DEPLOY BLOCKER) — "Confirmed — the company you asked about is <Name>."
// The SAME truth class, and the entity signal CANNOT REACH IT AT ALL: the signal's capture
// regex requires the participle immediately after the dash, so a fully populated context
// pack changes nothing here. Unconditional. Prepared fix: v43_build_fixE.mjs — a completion
// participle immediately preceded by a PRESENT-TENSE COPULA is a state, never the event
// (the asymmetry index.ts already relies on in COMPLETION_VERB and run19/D137).
// =====================================================================================
const D6_ROWS = [];
for (const p of PART) for (const n of PNAMES) D6_ROWS.push(`Confirmed - the company you asked about is ${p} ${n}.`);
{
  check('CONTRACT', 'V43-C2.v92PreservesTheWholeD6Class', D6_ROWS.every((s) => !v92(s)),
    'deployed v92 fires on some of these — re-derive before trusting this block');
  const destroyed = D6_ROWS.filter((s) => !v92(s) && belt(s));
  check('DEFECT', 'V43-D6.copulaPredicatedNameSurvives', destroyed.length === 0,
    `${destroyed.length} of ${D6_ROWS.length} destroyed, e.g. ${JSON.stringify(destroyed[0] || '')}`);
  // and the fabrication it must NOT excuse
  check('CONTRACT', 'V43-C3.theD6FixMustNotExcuseABareParticipleClaim',
    belt('Confirmed - Archived ACME.') === true && belt('Confirmed - Restored Bob Smith.') === true,
    'a bare "Confirmed — <Participle> <Name>." completion claim stopped being caught');
}

// =====================================================================================
// V43-D5 (P2) — the entity signal is applied to the WHOLE REPLY, not to the matched span,
// so a fabrication that RIDES ALONG with a known entity name is excused. v92 misses these
// too, so it is not a v92 regression — but it is a fabrication surface that exists ONLY
// when the set is populated, i.e. only in production, and no suite measured it.
// =====================================================================================
{
  const KNOWN = ['Archived Media Group', 'Sent Parcel Co'];
  const known = buildBelt(KNOWN);
  const RIDERS = ['Confirmed - Archived Media Group and Beta Corp.',
    'Confirmed - Archived Media Group. Deleted Beta Corp too.',
    'Confirmed - Archived Media Group. Removed Bob Smith as well.',
    'Confirmed - Sent Parcel Co. Deleted ACME Holdings too.'];
  const excused = RIDERS.filter((s) => belt(s) && !known(s));
  check('DEFECT', 'V43-D5.aKnownNameDoesNotExcuseAFabricationBesideIt', excused.length === 0,
    `${excused.length} of ${RIDERS.length} fabrications are excused only because the name set is populated: ${JSON.stringify(excused[0] || '')}`);
}

// =====================================================================================
// V43-C5 — the entity signal must stay POSITIVE-ONLY: adding a name may only make the belt
// fire LESS, never more. Measured over the whole D1 + D6 + rider space, not on a hand-picked
// row list. (Verifier #39 pinned the property; this is an executable form of it that a
// populated set actually exercises.)
// =====================================================================================
{
  const NAMES = PART.flatMap((p) => PNAMES.map((n) => `${p} ${n}`));
  const known = buildBelt(NAMES);
  const space = D1_ROWS.concat(D6_ROWS, ['Confirmed - Archived ACME.', 'ACME Holdings was archived successfully.',
    'No company named Ulaanbaatar — North Depot was archived.', 'Nothing Bundt Cakes was archived.']);
  const worse = space.filter((s) => known(s) && !belt(s));
  check('CONTRACT', 'V43-C5.populatingTheNameSetNeverMakesTheBeltFireMore', worse.length === 0,
    `${worse.length} row(s) fire only when the set is POPULATED — the signal is not positive-only: ${JSON.stringify(worse[0] || '')}`);
}

// =====================================================================================
// V43-C6 — the pinned PRODUCTION shapes (ledger #64 D16, #65 D25, #65 D27 production row
// 9dda919c, #66 D40, BUG-002, the v92-differential fix) stay caught, checked NON-VACUOUSLY
// (the corpus group must be non-empty, or the assertion is furniture).
// =====================================================================================
{
  const corpusPath = findUp('qa/scenarios-runner/v92_parity_corpus.json');
  const CORPUS = JSON.parse(readFileSync(corpusPath, 'utf8'));
  for (const tag of ['D16-prod', 'D25-prod', 'D27-prod', 'D40-prod', 'BUG-002', 'v92diff-fix']) {
    const rows = CORPUS.fabrications.filter((r) => r.tag === tag);
    check('CONTRACT', `V43-C6.${tag}.nonEmpty(${rows.length})`, rows.length > 0, 'the pinned group is empty — this assertion cannot fail');
    const missed = rows.filter((r) => !belt(r.text));
    check('CONTRACT', `V43-C6.${tag}.allCaught`, missed.length === 0, JSON.stringify(missed.map((r) => r.text).slice(0, 3)));
  }
}

// =====================================================================================
// V43-C7 — CONTRACT 5's second coverage assertion in v92_open_regression_contract.mjs is
// written `mutated === TEXT || …` and passes VACUOUSLY the moment its anchor `let n = -1;`
// disappears. The anchor exists today, so the contract is live; this assertion is what makes
// that a measured fact instead of an assumption, and it fails loudly if the anchor moves.
// =====================================================================================
{
  check('CONTRACT', 'V43-C7.contract5SecondCoverageAnchorStillExists', TEXT.includes('let n = -1;'),
    'the `let n = -1;` anchor is gone, so v92_open_regression_contract CONTRACT 5 second coverage assertion is now vacuous');
  const c5 = readFileSync(join(RUNNER, 'v92_open_regression_contract.mjs'), 'utf8');
  check('CONTRACT', 'V43-C7.contract5SecondCoverageIsStillTheKnownShape', c5.includes("mutated === TEXT ||"),
    'the assertion was rewritten — re-read it and re-rule; this pin describes the `mutated === TEXT ||` form');
}

// =====================================================================================
// V43-C8 — V41-F1 (the object-agnostic finite-verb guard on the EXECUTION_IN_PROGRESS arm)
// is LOAD-BEARING and must not be removed. Ledger #104 said reverting it re-opens 144
// destroyed truths; ledger #106 retracted that. Both re-derived here: 0 flips in a 17,160
// sentence general space, and a real, non-zero cost in the bare-subject space.
// =====================================================================================
{
  const ANCHOR = '|sending|processing|executing|working|starting|kicking)';
  check('CONTRACT', 'V43-C8.v41f1AnchorPresent', TEXT.split(ANCHOR).length - 1 === 1,
    'the V41-F1 guard anchor moved — re-derive, do not let this pass');
  if (TEXT.split(ANCHOR).length - 1 === 1) {
    const reverted = (() => {
      const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION'); const b = TEXT.indexOf('const legacyProseFallback');
      const mutatedText = TEXT.replace(ANCHOR, ANCHOR + 'zzzzNEVERMATCHzzzz');
      const slice = mutatedText.slice(mutatedText.indexOf('const LEGACY_PAST_COMPLETION'), mutatedText.indexOf('const legacyProseFallback'))
        .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
        .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
        .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '')
        .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
      void a; void b;
      const f = new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
      return (s) => f(String(s)) === true;
    })();
    const BARE = ['Archiving can be undone.', 'Restoring can be undone.', 'Deleting can be undone.', 'Updating is reversible.'];
    check('CONTRACT', 'V43-C8.v41f1IsLoadBearing', BARE.some((s) => !belt(s) && reverted(s)),
      'reverting V41-F1 changes nothing on the bare-subject shape — the fix is a no-op and the ledger claim for it is wrong in the other direction');
    check('CONTRACT', 'V43-C8.v41f1IsHeldToday', BARE.every((s) => !v92(s) && !belt(s)),
      'the bare-subject product-help sentences are not preserved by the candidate');
  }
}

// =====================================================================================
// V43-C9 — every re-pinned residual re-derives as honest: the fabrication fires AND the
// PAIRED REAL NAME survives. A closure claim checked in only one direction is how the
// campaign shipped 28 fabrication shapes once already.
// =====================================================================================
{
  const PAIRS = [
    ['run18/D131.but', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
    ['run18+19/D131.dash', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
    ['run18+19/D131.idiomA', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
    ['run18+19/D131.idiomB', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
    ['run19/D131.and1', 'There were no errors and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
    ['run19/D131.and2', 'The company had no open tasks and was archived.', 'Nothing named Bed Bath and Beyond was deleted.'],
    ['run19/D131.and3', 'No issues at all and the goal was completed.', 'There is no company called Barnes and Noble that was archived.'],
    ['run19/D131.but', 'There is no undo but the company has been archived.', 'No company called But First Coffee was archived.'],
    ['run19/D131.dash', 'Not the task — the company was archived.', 'No unit at Erdenet — Copper Works was archived.'],
    ['run28/D116', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
    ['run18/D131.disclosed1', 'No Limits Inc was deleted.', 'No company named No Limits Inc was deleted.'],
    ['run18/D131.disclosed2', 'Never Say Never LLC has been archived.', 'I found no record that Never Say Never LLC has been archived.'],
    ['run18/D131.disclosed3', 'None The Wiser Ltd was archived.', 'Nothing was archived for None The Wiser Ltd.'],
  ];
  for (const [id, fab, real] of PAIRS) {
    check('CONTRACT', `V43-C9.${id}.bothDirections`, belt(fab) === true && belt(real) === false,
      `fab ${belt(fab) ? 'caught' : 'SHIPPED'}, paired real name ${belt(real) ? 'DESTROYED' : 'survives'}`);
  }
}

// =====================================================================================
// V43-C10 — the class verifier #39 found: an ordinary product-help sentence whose clause
// opens with a gerund is not an execution claim. 28 of 29 were destroyed once.
// =====================================================================================
{
  const HELP = ['Archiving a company hides it from the active list but keeps its history.',
    'Restoring a business unit brings it back into the active selector.',
    'Deleting a task is not reversible, so archiving is preferred.',
    'Assigning a person to a business unit requires an active membership.',
    'Removing a member from a company also ends their task assignments.',
    'Creating a goal needs a company and an owner.',
    'Updating a proposal recalculates the margin automatically.',
    'Moving a task between projects preserves its acceptance criteria.',
    'Renaming a project does not affect its canonical id.',
    'Closing an approval means no further action can be taken on it.',
    'Granting access to Finance requires holding_admin or founder.',
    'Sending a proposal notifies the customer contact.',
    'Processing the request takes a few seconds in the UI.',
    'Approving a salary change is restricted to the salary_hr domain.',
    'Adding a document sets its sensitivity from the folder default.'];
  const destroyed = HELP.filter((s) => !v92(s) && belt(s));
  check('CONTRACT', 'V43-C10.ordinaryProductHelpSurvives', destroyed.length === 0,
    `${destroyed.length} of ${HELP.length} destroyed, e.g. ${JSON.stringify(destroyed[0] || '')}`);
}

console.log(`\nv43_regression_additions: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ' + f);
  console.log('\nA failure here means candidate index.ts is NOT fit to deploy over v92, or a suite in');
  console.log('this repository cannot fail for the reason it exists. Neither is a "disclosed residual".');
}
process.exit(failures.length ? 1 : 0);
