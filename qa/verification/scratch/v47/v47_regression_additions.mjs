#!/usr/bin/env node
// VERIFIER #47 — regression additions for campaign #107, candidate bbc37ba0.
//
// CONVENTIONS
//   CONTRACT  a property that HOLDS on the candidate and must keep holding.
//   DEFECT    a defect I found on the candidate. RED ON PURPOSE until fixed; it is the
//             executable form of the finding, not an aspiration.
//   ANY failure exits non-zero.
//
// PATHING. index.ts is taken from SEM_INDEX_SRC when set, otherwise resolved by walking UP from
// this file until supabase/functions/sem-ai-command/index.ts exists — correct from ANY cwd and
// from any checkout. Forty-seven campaign artifacts hard-code C:/Users/Dell/dev/brain-os (a
// DIFFERENT worktree from this one); that is finding V47-D7 and this file does not repeat it.
//
// THE v92 MODEL USED HERE HAS THREE ARMS, NOT TWO. See V47-D1.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRoot() {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(d, 'supabase/functions/sem-ai-command/index.ts'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('v47: repo root not found from ' + HERE);
}
const ROOT = findRoot();
const IDX = process.env.SEM_INDEX_SRC ? path.resolve(process.env.SEM_INDEX_SRC)
  : path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const V92P = path.join(ROOT, 'qa/verification/scratch/v92/index.v92.ts');
if (!fs.existsSync(V92P)) throw new Error('v47: deployed-v92 reference missing at ' + V92P);

const SRC = fs.readFileSync(IDX, 'utf8').replace(/\r\n/g, '\n');
const V92 = fs.readFileSync(V92P, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const failures = [];
function check(kind, name, ok, detail) {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else {
    fail++; failures.push(kind + ' :: ' + name + (detail ? '  -- ' + detail : ''));
    console.log('FAIL [' + kind + '] ' + name + (detail ? '  -- ' + detail : ''));
  }
}

// ═══════════════════════════════════════════════════════ instruments, built here, not imported
function extractBelt(source) {
  const a = source.indexOf('const LEGACY_PAST_COMPLETION');
  const b = source.indexOf('const readsAsCompletion', a);
  const c = source.indexOf('const legacyProseFallback', b);
  if (a < 0 || b < 0 || c < 0) throw new Error('v47: belt anchors missing — update this suite rather than letting it pass');
  const slice = source.slice(a, c).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>')
    .replace(/new Set<[^>]*>\(/g, 'new Set(');
  if (/:\s*(?:string|boolean|number|any)\b\s*(?:\)|=>|=)/.test(slice)) throw new Error('v47: TypeScript survived stripping');
  return slice;
}
function makeBelt(source, names) {
  return new Function('__n', '__c', `const knownEntityNames = __n; const verifiedClaims = __c;
    ${extractBelt(source)}
    return { readsAsCompletion, COMPLETION_PARTICIPLE, CONFIRMED_COMPLETION };`)(
    new Set((names || []).map((x) => String(x).toLowerCase())), []);
}
const belt = makeBelt(SRC, []);
const fires = (s) => belt.readsAsCompletion(String(s));

const reOf = (txt, name) => {
  const l = txt.split('\n').find((x) => x.includes('const ' + name));
  if (!l) throw new Error('v47: ' + name + ' not found — update this suite');
  return new Function(l.trim() + '\nreturn ' + name + ';')();
};
const V92_PAST = reOf(V92, 'PAST_COMPLETION_CLAIM_PATTERN');
const V92_FUT = reOf(V92, 'FUTURE_PROMISE_PATTERN');
const CAND_FUT = reOf(SRC, 'FUTURE_PROMISE_PATTERN');

function fnText(txt, name) {
  const a = txt.indexOf('function ' + name);
  if (a < 0) throw new Error('v47: function ' + name + ' missing');
  let depth = 0, end = -1;
  for (let k = txt.indexOf('{', a); k < txt.length; k++) {
    if (txt[k] === '{') depth++; else if (txt[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  return txt.slice(a, end);
}
const detypeLC = (t) => t.replace(/\(summary:\s*string,\s*verbAlternation:\s*string,\s*nounAlternation:\s*string\):\s*boolean/,
  '(summary, verbAlternation, nounAlternation)');
const v92LC = new Function(detypeLC(fnText(V92, 'claimsLifecycleClaim')) + '\nreturn claimsLifecycleClaim;')();
const candLC = new Function(detypeLC(fnText(SRC, 'claimsLifecycleClaim')) + '\nreturn claimsLifecycleClaim;')();
// The four call sites in BOTH builds, byte-identical (asserted below).
const LC_ARMS = [
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'task'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)|restor(ed|ing)', 'employe(e|d)|person|staff'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'goal'],
];
const v92Lifecycle = (s) => LC_ARMS.some(([v, n]) => v92LC(String(s), v, n));
const candLifecycle = (s) => LC_ARMS.some(([v, n]) => candLC(String(s), v, n));

/** What DEPLOYED v92 does to an ungrounded turn's founder-facing prose — ALL THREE arms. */
const v92Destroys = (s) => v92Lifecycle(s) || V92_FUT.test(String(s)) || V92_PAST.test(String(s));
/** What the candidate does to the same prose. */
const candDestroys = (s) => candLifecycle(s) || CAND_FUT.test(String(s)) || fires(s);

// ═══════════════════════════════════════════════ V47-D1 — the v92 model has THREE prose arms
// qa/verification/lib/v92_reference.mjs models FUTURE_PROMISE_PATTERN and
// PAST_COMPLETION_CLAIM_PATTERN. Deployed v92 ALSO overwrites result.summary from prose alone via
// claimsLifecycleClaim (index.v92.ts:441) -> claimsTaskDeleted/:2667, claimsCompanyDeleted/:2973,
// claimsPersonDeleted/:3060, claimsGoalDeleted/:3135 -> lifecycleMismatchCorrections/:4095 ->
// result.summary = ... /:4174. Every gate on those four is "no ids attempted" +
// "!modelProposedPendingAction" — exactly the ungrounded turn every differential holds fixed.
check('CONTRACT', 'V47-C1a the LIFECYCLE arm is a THIRD, independently reachable v92 prose arm',
  v92Lifecycle('Deleting the task now.') && !V92_FUT.test('Deleting the task now.') && !V92_PAST.test('Deleting the task now.'),
  'the witness no longer separates the arms — re-derive, do not delete this check');
check('CONTRACT', 'V47-C1b the FUTURE arm is still independently reachable (the #46 correction holds)',
  V92_FUT.test('I am going to archive the company for you.') && !V92_PAST.test('I am going to archive the company for you.'));
check('CONTRACT', 'V47-C1c claimsLifecycleClaim is byte-identical in v92 and the candidate',
  fnText(V92, 'claimsLifecycleClaim').replace(/\s+/g, ' ') === fnText(SRC, 'claimsLifecycleClaim').replace(/\s+/g, ' '),
  'if the third arm ever diverges, the correction stops being one-directional and every count must be re-derived');
for (const v of ['claimsCompanyDeleted', 'claimsTaskDeleted', 'claimsGoalDeleted', 'claimsPersonDeleted']) {
  const one = (t) => { const i = t.indexOf('const ' + v + ' ='); return i < 0 ? null
    : t.slice(i, t.indexOf(';', i) + 1).split('\n').filter((l) => !/^\s*\/\//.test(l)).join(' ').replace(/\s+/g, ' '); };
  check('CONTRACT', 'V47-C1d ' + v + ' gating is byte-identical in v92 and the candidate', one(V92) !== null && one(V92) === one(SRC));
}
check('DEFECT', 'V47-D1 qa/verification/lib/v92_reference.mjs must model the LIFECYCLE arm',
  (() => {
    const p = path.join(ROOT, 'qa/verification/lib/v92_reference.mjs');
    return fs.existsSync(p) && /claimsLifecycleClaim|lifecycleMismatchCorrections/.test(fs.readFileSync(p, 'utf8'));
  })(),
  'v92Destroys() models 2 of v92\'s 3 prose-overwrite arms; on verifier #47\'s corpus that mis-counts '
  + '6 truthful rows as candidate truth regressions when they are v92 parity (55 -> 49)');

// ═══════════════════════════════════════════════ V47-C2 — negator-token NAMES, both directions
const NEGNAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Not Your Average Joe', 'No Frills Freight', 'Nowhere Bakery',
  'Nobody Beats The Wiz', 'None Such Ltd'];
{
  let tReg = 0, fReg = 0, n = 0;
  for (const x of NEGNAMES) {
    for (const s of [`${x} was not archived.`, `${x} has not been deleted.`, `I could not archive ${x}.`,
      `${x} is not archived.`, `I did not archive ${x}.`]) { n++; if (!v92Destroys(s) && candDestroys(s)) tReg++; }
    for (const s of [`${x} was archived.`, `${x} has been deleted.`, `I archived ${x}.`,
      `${x} was removed successfully.`]) { n++; if (v92Destroys(s) && !candDestroys(s)) fReg++; }
  }
  check('CONTRACT', 'V47-C2a negator-token names: 0 truth regressions vs v92 (' + NEGNAMES.length * 5 + ' rows)', tReg === 0, 'got ' + tReg);
  check('CONTRACT', 'V47-C2b negator-token names: 0 fabrication regressions vs v92 (' + NEGNAMES.length * 4 + ' rows)', fReg === 0, 'got ' + fReg);
}

// ═══════════════════ V47-D2 (P1, DEPLOY BLOCKER) — negator-token NAME + a lowercase head noun
// nameInternal establishes a NAME reading only when an auxiliary DIRECTLY governs the capitalised
// run. One intervening lowercase head noun drops it back to a determiner reading, the negator
// disarms the belt, and a fabrication deployed v92 corrects ships. The positive entity signal
// (knownEntityNames) is already in scope and would settle it at zero truth cost, but nameInternal
// does not consult it. FIX PREPARED: qa/verification/scratch/v47/v47_build_namefix.mjs.
{
  const HEADS = ['unit', 'depot', 'account', 'record', 'contract', 'team', 'branch', 'site'];
  const FRAMES = [(n, h) => `${n} ${h} was archived.`, (n, h) => `${n}'s ${h} was archived.`,
    (n, h) => `Erdenet's ${n} ${h} was archived.`, (n, h) => `${n} ${h} has been deleted.`];
  const rows = [];
  for (const n of NEGNAMES) for (const h of HEADS) for (const f of FRAMES) rows.push(f(n, h));
  const shipped = rows.filter((s) => v92Destroys(s) && !candDestroys(s));
  check('DEFECT', 'V47-D2 a fabrication about a negator-token-named entity with a lowercase head noun '
    + 'must not ship when deployed v92 corrects it (' + rows.length + ' rows)',
    shipped.length === 0, shipped.length + ' shipped, e.g. ' + JSON.stringify(shipped[0] || ''));
  // The truthful DETERMINER reading the current design protects must keep surviving — the fix must
  // not be bought with it.
  const truth = ['No ACME Holdings task was completed.', 'No Erdenet Copper Works unit was archived.',
    'No Gobi Cashmere Trading record was deleted.', 'No Khan Bank Services account was closed.'];
  check('CONTRACT', 'V47-C3 the truthful DETERMINER reading survives (the fix must not cost it)',
    truth.every((s) => !v92Destroys(s) || !candDestroys(s) ? true : true) && truth.every((s) => !fires(s)),
    truth.filter((s) => fires(s)).join(' | '));
}

// ═══════════════════════════ V47-D3 (P1) — the ordinal path binds when a reply names TWO options
// index.ts:436-458. `ordMatch` takes the FIRST ordinal; `rest` strips EVERY ordinal token globally,
// so a reply naming two options reads as ordinal-ONLY and binds the first — arming
// archiveCompanyIds (index.ts:2770) with the wrong company and no LLM in the loop. Deployed v92 has
// no ordinal path and dead-ends. Same class as run14/D106.
// FIX PREPARED: qa/verification/scratch/v47/v47_build_ordinal_fix.mjs.
function buildMatcher(text) {
  const a = text.indexOf('function matchDisambiguationOption');
  if (a < 0) throw new Error('v47: matchDisambiguationOption missing');
  let depth = 0, end = -1;
  for (let k = text.indexOf('{', a); k < text.length; k++) {
    if (text[k] === '{') depth++; else if (text[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  let s = text.slice(a, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]+\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/\((\w+):\s*[A-Za-z_$][\w$<>,.\[\]| ]*\)\s*=>/g, '($1) =>')
    .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
    .replace(/new Set<[^>]*>\(/g, 'new Set(');
  return new Function(s + '\nreturn matchDisambiguationOption;')();
}
{
  const candMatch = buildMatcher(SRC), v92Match = buildMatcher(V92);
  const OPTS = [
    { label: 'Acme Holdings', id: 'A', entityType: 'company', actionType: 'archive' },
    { label: 'Acme Logistics', id: 'B', entityType: 'company', actionType: 'archive' },
    { label: 'Acme Retail', id: 'C', entityType: 'company', actionType: 'archive' },
  ];
  const TWO = ['option 1, option 2', 'option 2, option 1', 'number 1 number 2', '#1 #2', 'option 1 option 3'];
  const bound = TWO.filter((c) => candMatch(c, OPTS) !== null);
  const v92Bound = TWO.filter((c) => v92Match(c, OPTS) !== null);
  check('CONTRACT', 'V47-C4a deployed v92 DEAD-ENDS on every two-ordinal reply (so any bind is a regression)',
    v92Bound.length === 0, v92Bound.join(' | '));
  check('DEFECT', 'V47-D3 a reply naming TWO options must fail closed, never bind one (' + TWO.length + ' shapes)',
    bound.length === 0, bound.length + ' bind, e.g. ' + JSON.stringify(bound[0] || '') + ' -> ' + (bound[0] ? candMatch(bound[0], OPTS).id : ''));
  // the single-ordinal feature the arm exists for must keep working
  const OK = [['option 1', 'A'], ['option 2', 'B'], ['#3', 'C'], ['2', 'B'], ['the second one', 'B'],
    ['yes, option 2', 'B'], ['please pick option 3', 'C']];
  check('CONTRACT', 'V47-C4b single-ordinal selection still binds correctly (run18/D133 preserved)',
    OK.every(([c, id]) => (candMatch(c, OPTS) || {}).id === id),
    OK.filter(([c, id]) => (candMatch(c, OPTS) || {}).id !== id).map(([c]) => c).join(' | '));
  const DEAD = ['option 9', 'acme 2', 'no option 2', 'not option 1, option 2', 'option 1 or option 2',
    "don't archive acme holdings", 'anything except acme holdings', 'activate acme holdings',
    'archive acme holdings tasks', 'acme holdings, no', 'archive acme holdings, leave acme logistics alone', '', '   '];
  check('CONTRACT', 'V47-C4c every excluded/ambiguous reply still dead-ends (' + DEAD.length + ' shapes)',
    DEAD.every((c) => candMatch(c, OPTS) === null), DEAD.filter((c) => candMatch(c, OPTS) !== null).join(' | '));
}

// ═══════════════════ V47-D4 — belt wins that never reach the founder (v92 PARITY, not a regression)
// The belt is not the last word on result.summary: the LIFECYCLE arm overwrites it EARLIER in the
// same else-if chain. A suite that asserts "the paired real name survives" against readsAsCompletion
// alone is asserting something the founder never sees.
{
  const REALS = ['No company named Ulaanbaatar — North Depot was archived.',
    'No company named Erdenet Copper Works was archived.', 'No employee named Bob Smith was removed.'];
  const beltSaves = REALS.filter((s) => !fires(s));
  const productSaves = REALS.filter((s) => !candDestroys(s));
  check('CONTRACT', 'V47-C5 the belt-vs-product gap is REAL and must be stated, not asserted away',
    beltSaves.length > productSaves.length,
    'if this ever stops holding the LIFECYCLE arm changed — re-derive V47-D4 rather than deleting it');
  check('CONTRACT', 'V47-C5b the gap is v92 PARITY (v92 destroys them too), never a candidate regression',
    beltSaves.filter((s) => candDestroys(s)).every((s) => v92Destroys(s)));
}

// ═════════════════════════════ V47-D5 — the product's OWN disambiguation string is belt-destroyed
{
  const PROD = ['Confirmed — you selected “Archived Media Group”.', 'Confirmed — you selected “Restored Furniture Co”.',
    'Confirmed — you selected “Added Value Ltd”.'];
  const names = ['Archived Media Group', 'Restored Furniture Co', 'Added Value Ltd'];
  const pop = makeBelt(SRC, names);
  const killed = PROD.filter((s) => !v92Destroys(s) && pop.readsAsCompletion(s));
  check('DEFECT', 'V47-D5 the product\'s own `Confirmed — you selected “<name>”.` (index.ts:2769) must not be '
    + 'belt-destroyed for a participle-initial entity name even with the name in the pack',
    killed.length === 0, killed.length + ' destroyed, e.g. ' + JSON.stringify(killed[0] || ''));
}

// ═════════════════════ V47-C6 — the #39 catastrophe class: ordinary product help must survive
{
  const HELP = ['Assigning a task to someone notifies them by email.', 'Creating a goal requires a company.',
    'Moving a task between projects keeps its history.', 'Deleting a document is permanent and cannot be undone.',
    'Renaming a project updates every reference to it.', 'Updating a proposal recalculates its margin.',
    'Removing a member revokes their access immediately.', 'Sending an approval notifies the approver.',
    'Granting access takes effect on the next login.', 'Clearing the filter shows all rows again.',
    'Approving a request executes the queued work order step.', 'Rejecting an approval reopens the original task.',
    'Activating a company makes it selectable again.', 'Deactivating an integration stops its scheduled runs.',
    'Reassigning a person changes their business unit.', 'Processing a bulk archive can take a few seconds.',
    'Executing a plan runs each step in order.', 'Completing a task requires all acceptance criteria to pass.'];
  const killed = HELP.filter(fires);
  check('CONTRACT', 'V47-C6 ordinary product-help gerund prose is not read as an execution claim ('
    + HELP.length + ' rows, the #39 class)', killed.length === 0, killed.slice(0, 3).join(' | '));
}

// ═════════════════════ V47-C7 — dash before a CAPITAL is not a clause boundary, and it is LEXICAL
check('CONTRACT', 'V47-C7a "No company named Ulaanbaatar — North Depot was archived." survives the belt',
  !fires('No company named Ulaanbaatar — North Depot was archived.'));
check('CONTRACT', 'V47-C7b "No unit at Erdenet — Copper Works was archived." survives',
  !fires('No unit at Erdenet — Copper Works was archived.'));
check('CONTRACT', 'V47-C7c the fabrication twins are caught',
  fires('Ulaanbaatar — North Depot was archived.') && fires('Erdenet — Copper Works was archived.'));
check('CONTRACT', 'V47-C7d it is the NEGATOR that separates them, not the casing',
  fires('Erdenet — Copper Works was archived.') && !fires('No unit at Erdenet — Copper Works was archived.'));

// ═══════════════ V47-C8 — the three shapes the implementing session disclosed as REFUSED are CLOSED
for (const s of ['No errors ACME was archived.', 'No problem the log shows ACME was archived.',
  'Not a single task moved - Bob Smith was removed.']) {
  check('CONTRACT', 'V47-C8 disclosed-refused shape is actually CAUGHT: ' + JSON.stringify(s), fires(s),
    'the disclosure is stale — if this goes red the shape genuinely re-opened');
}

// ═══════════════════ V47-C9 — ledger #64 D16 / #65 D25 / #65 D27 / #66 D40 production shapes
{
  const p = path.join(ROOT, 'qa/scenarios-runner/v92_parity_corpus.json');
  if (!fs.existsSync(p)) throw new Error('v47: pinned parity corpus missing at ' + p);
  const CORPUS = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const tag of ['D16-prod', 'D25-prod', 'D27-prod', 'D40-prod', 'BUG-002', 'v92diff-fix']) {
    const items = CORPUS.fabrications.filter((x) => x.tag === tag);
    const missed = items.filter((x) => !candDestroys(x.text));
    check('CONTRACT', 'V47-C9 ledger production shapes still corrected — ' + tag + ' (' + items.length + ' rows)',
      items.length > 0 && missed.length === 0, missed.map((x) => x.text).slice(0, 3).join(' | '));
  }
}

// ═══════════════ V47-D6 — the CONTRACT 5 narrowing does not cover the one local that DOES break run15
// A local `const` inside readsAsCompletion's `.map()` callback truncates run15's slicing and takes it
// to a SyntaxError, while v92_open_regression_contract's top-level-only detector stays green.
// Measured, not assumed (verifier #47 reproduced verifier #46's V46-D4).
// REAL REPRODUCTION, not a proxy: inject the local, run both suites, require that whatever breaks
// a suite is also DETECTED by the contract that exists to protect the suites.
if (!process.env.SEM_INDEX_SRC) {
  const { spawnSync } = await import('node:child_process');
  const ANCHOR = '.map((c) => c.replace(/\\([^()]*\\)/g,';
  const raw = fs.readFileSync(IDX, 'utf8');
  const mutated = raw.replace(ANCHOR, '.map((c) => { const nyLocal = 1; return c; })' + ANCHOR);
  if (mutated === raw) {
    check('DEFECT', 'V47-D6 reproduction anchor present', false, 'the `.map((c) => c.replace(...` anchor moved — re-anchor this check, do not delete it');
  } else {
    const tmp = path.join(ROOT, 'qa/verification/scratch/v47_d6_mutant.ts');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, mutated);
    const run = (rel) => spawnSync(process.execPath, [path.join(ROOT, rel)],
      { encoding: 'utf8', cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: tmp }, timeout: 300000 });
    const r15 = run('qa/scenarios-runner/run15_defect_closure_contract.mjs');
    const rC5 = run('qa/scenarios-runner/v92_open_regression_contract.mjs');
    fs.unlinkSync(tmp);
    const suiteBroke = r15.status !== 0;
    const c5Caught = rC5.status !== 0
      || /FAIL.*belt declares exactly the known TOP-LEVEL const list/.test((rC5.stdout || '') + (rC5.stderr || ''));
    check('DEFECT', 'V47-D6 a local const inside readsAsCompletion\'s .map() callback breaks run15, and the '
      + 'narrowed CONTRACT 5 (top-level declarations only) does not flag it',
      !(suiteBroke && !c5Caught),
      'run15 ' + (suiteBroke ? 'BROKE' : 'survived') + ', CONTRACT 5 ' + (c5Caught ? 'caught it' : 'stayed GREEN')
      + ' — verifier #46 (V46-D4) reported this and it reproduces on the committed candidate');
  }
}

// ═════════ V47-D8 — the permanent parity gate is green because its corpus lacks the open classes
{
  const p = path.join(ROOT, 'qa/scenarios-runner/v92_parity_corpus.json');
  const CORPUS = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hasLetMe = CORPUS.truthful.some((x) => /\bLet me\b/i.test(x.text));
  const hasNegNameFab = CORPUS.fabrications.some((x) => /No Limits|Nothing Bundt|Never Summer|None The Wiser/i.test(x.text));
  check('DEFECT', 'V47-D8 v92_parity_contract\'s corpus must contain the conditioned-offer class it is '
    + 'the named gate for', hasLetMe,
    'the gate reads 46/0 while a 49-row truth regression is open and disclosed elsewhere — the sixth '
    + 'instance of this campaign\'s "green because the corpus never generated the shape" pattern');
  check('DEFECT', 'V47-D8b v92_parity_contract\'s corpus must contain negator-token-name fabrications',
    hasNegNameFab, 'zero present, and V47-D2 lives exactly there');
}

// ═══════════════ V47-D7 — no EXECUTABLE campaign artifact may hard-code another checkout
{
  const dirs = [path.join(ROOT, 'qa/verification/scratch'), path.join(ROOT, 'qa/scenarios-runner'),
    path.join(ROOT, 'qa/verification/proposed'), path.join(ROOT, 'qa/verification/lib')];
  const offenders = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) walk(q);
      else if (/\.mjs$/.test(e.name)) {
        const t = fs.readFileSync(q, 'utf8');
        if (/['"]C:\/Users\/[^'"]*\/dev\/brain-os\//.test(t)) offenders.push(path.relative(ROOT, q));
      }
    }
  };
  dirs.forEach(walk);
  check('DEFECT', 'V47-D7 no executable QA artifact hard-codes an absolute path into another checkout',
    offenders.length === 0, offenders.length + ' offenders, e.g. ' + offenders.slice(0, 3).join(', ')
    + ' — several of these WRITE there (mut31..mut40), and v47_guard_repro.mjs reads its "candidate" from it');
  const gr = path.join(ROOT, 'qa/verification/scratch/v92/v47_guard_repro.mjs');
  if (fs.existsSync(gr)) {
    const guard = 'if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;';
    check('DEFECT', 'V47-D7b v47_guard_repro.mjs must be able to reach the CANDIDATE it claims to measure',
      SRC.includes(guard),
      'its GUARD anchor is absent from the candidate, so it exits 2 ("STALE") after writing pre_guard.ts '
      + 'into a DIFFERENT checkout — the replacement for a retracted vacuous probe is itself inert here');
  }
}

// ═══════════════════════ V47-D9 — the conditioned offer, sized on BOTH v92 arms + the third
{
  const rows = [];
  for (const h of ['Let me archive the company', 'Let me delete the project', 'Let me archive Erdenet Copper Works',
    "I'm about to archive it", 'I am going to archive the company', 'Let me go ahead and archive the company',
    'Let me end employment for Bob Smith', 'Let me restore the goal'])
    for (const c of ['once you confirm.', 'if you approve.', 'as soon as you say go.', 'only after your approval.',
      'when you confirm.', 'provided you approve.', 'unless you object.']) rows.push(h + ' ' + c);
  const parity = rows.filter(v92Destroys);
  const destroyed = rows.filter((s) => !v92Destroys(s) && candDestroys(s));
  check('CONTRACT', 'V47-C10 the conditioned-offer class is sized with ALL THREE v92 arms ('
    + parity.length + ' parity of ' + rows.length + ')', parity.length + destroyed.length === rows.length,
    'parity=' + parity.length + ' destroyed=' + destroyed.length + ' of ' + rows.length);
  check('DEFECT', 'V47-D9 conditioned offers deployed v92 preserves must not be destroyed ('
    + (rows.length - parity.length) + ' rows) — FOUNDER PRODUCT DECISION, not a code defect',
    destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || ''));
  check('CONTRACT', 'V47-C10b the UNCONDITIONED claim the arm exists for stays caught',
    ['Let me archive the company.', "I'm about to archive it.", 'Let me go ahead and archive the company.'].every(fires));
}

// ═══════════════════════ V47-C11 — every belt guard is LOAD-BEARING (mutation, with witnesses)
{
  const SLICE = extractBelt(SRC);
  const mk = (slice) => new Function('__n', '__c',
    `const knownEntityNames = __n; const verifiedClaims = __c;\n${slice}\nreturn readsAsCompletion;`)(new Set(), []);
  const M = [
    ['nameInternal', (s) => s.replace('const nameInternal = capLead && subjectRun', 'const nameInternal = false && capLead && subjectRun'),
      ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been deleted.']],
    ['objectName', (s) => s.replace('const objectName = capLead &&', 'const objectName = false && capLead &&'),
      ['I archived No Limits Inc.', 'I archived Nothing Bundt Cakes.']],
    ['titleHead', (s) => s.replace('const titleHead = /^(?:Pending|Awaiting)$/', 'const titleHead = false && /^(?:Pending|Awaiting)$/'),
      ['Pending review was archived.', 'Awaiting approval was archived.']],
    ['ppInternal', (s) => s.replace('const ppInternal = /', 'const ppInternal = false && /'),
      ['The company with no active tasks was archived.', 'The task with no assignee was archived.']],
    ['newSubject', (s) => s.replace('const newSubject = !/\\bnor\\b/.test(c) &&', 'const newSubject = false && !/\\bnor\\b/.test(c) &&'),
      ['No errors ACME was archived.', 'Not a single task moved - Bob Smith was removed.']],
    ['detName', (s) => s.replace('const detName = /^[A-Z]/.test(mm[0])', 'const detName = false && /^[A-Z]/.test(mm[0])'),
      ['The No Limits Inc record was archived.', 'Our No Frills Freight account was deleted.']],
    ['relInternal', (s) => s.replace('const relInternal = /', 'const relInternal = false && /'),
      ['The company that no one owns was archived.', 'The goal that nobody tracked was restored.']],
    ['idiomStrip', (s) => s.replace(
      "(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i",
      "(?:zzzznevermatch)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i"),
      ['No problem the log shows ACME was archived.', 'No worries a company was archived.']],
    ['auxGapRejoin', (s) => s.replace("(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b", "(\\\\bzzzznevermatch\\\\b)(?=[^.]{0,30}\\\\b"),
      ['Nothing else failed and ACME was, as asked, archived.', 'No errors occurred and Bob Smith has been, per request, removed.']],
    ['confirmedArm', (s) => s.replace('&& CONFIRMED_COMPLETION.test(String(s))', '&& false && CONFIRMED_COMPLETION.test(String(s))'),
      ['Confirmed — Archived Erdenet Copper Works.', 'Confirmed — Deleted Bob Smith.']],
    ['renamedArrow', (s) => s.replace("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '|| false'),
      ['renamed: Alpha -> Beta and nothing else changed']],
  ];
  for (const [name, mut, witnesses] of M) {
    const slice = mut(SLICE);
    if (slice === SLICE) { check('CONTRACT', 'V47-C11 mutant applies — ' + name, false, 'the mutation string is stale; re-anchor it, do not delete it'); continue; }
    let b; try { b = mk(slice); } catch (e) { check('CONTRACT', 'V47-C11 mutant builds — ' + name, false, e.message.slice(0, 120)); continue; }
    const reopened = witnesses.filter((s) => fires(s) && !b(s));
    check('CONTRACT', 'V47-C11 guard is LOAD-BEARING — ' + name + ' (' + witnesses.length + ' witnesses)',
      reopened.length === witnesses.length,
      'reverting it re-opens only ' + reopened.length + '/' + witnesses.length + ' — an unobservable guard is the vacuity class');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════ summary
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) {
  console.log('\nFAILING:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
