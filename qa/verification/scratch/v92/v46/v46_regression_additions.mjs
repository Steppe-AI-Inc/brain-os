#!/usr/bin/env node
// VERIFIER #46 — regression additions for campaign #106, candidate e06bebc0.
//
// CONVENTIONS
//   CONTRACT  a property that HOLDS on the candidate and must keep holding.
//   DEFECT    a defect I found on the candidate. RED ON PURPOSE until fixed; it is the
//             executable form of the finding, not an aspiration.
//   ANY failure exits non-zero.
//
// PATHING. index.ts is taken from SEM_INDEX_SRC when set, otherwise resolved from THIS FILE's
// own location — correct from ANY cwd. (Forty campaign artifacts under qa/verification/scratch/v92
// hard-code an absolute path into a DIFFERENT worktree; that is finding V46-D6 and this file does
// not repeat it.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');     // qa/verification/proposed -> repo root
if (!fs.existsSync(path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts'))) {
  console.error('v46: ROOT resolved wrong -> ' + ROOT); process.exit(2);
}
const IDX = process.env.SEM_INDEX_SRC
  ? path.resolve(process.env.SEM_INDEX_SRC)
  : path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const V92 = path.join(ROOT, 'qa/verification/scratch/v92/index.v92.ts');

const SRC = fs.readFileSync(IDX, 'utf8');
const SRC_LF = SRC.replace(/\r\n/g, '\n');
const V92_LF = fs.readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const failures = [];
function check(kind, name, ok, detail) {
  if (ok) { pass++; console.log('OK   [' + kind + '] ' + name); }
  else { fail++; failures.push(kind + ' :: ' + name + (detail ? '  -- ' + detail : '')); console.log('FAIL [' + kind + '] ' + name + (detail ? '  -- ' + detail : '')); }
}

// ─────────────────────────────────────────────────────────── belt + v92 gate, executed for real
function extractBelt(source) {
  const s = source.replace(/\r\n/g, '\n');
  const a = s.indexOf('const LEGACY_PAST_COMPLETION');
  const b = s.indexOf('const readsAsCompletion', a);
  const c = s.indexOf('const legacyProseFallback', b);
  if (a < 0 || b < 0 || c < 0) throw new Error('v46: belt anchors missing — update this suite rather than letting it pass');
  let slice = s.slice(a, c).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\):\s*boolean\s*=>/g, '(c) =>');
  if (/:\s*(?:string|boolean|number|any)\b\s*(?:\)|=>|=)/.test(slice)) throw new Error('v46: TypeScript survived stripping');
  return slice;
}
function makeBelt(source, names) {
  const f = new Function('__n', '__c', `const knownEntityNames = __n; const verifiedClaims = __c;
    ${extractBelt(source)}
    return { readsAsCompletion, completionIsNegated, EXECUTION_IN_PROGRESS, COMPLETION_VERB, COMPLETION_PARTICIPLE, CONFIRMED_COMPLETION };`);
  return f(new Set((names || []).map((x) => String(x).toLowerCase())), []);
}
const belt = makeBelt(SRC, []);
const v92Line = V92_LF.split('\n').find((l) => l.includes('const PAST_COMPLETION_CLAIM_PATTERN'));
const V92_RE = new Function(v92Line.trim() + '\nreturn PAST_COMPLETION_CLAIM_PATTERN;')();
const v92Fires = (s) => V92_RE.test(String(s));
const fires = (s) => belt.readsAsCompletion(String(s));

// ── CORRECTION CARRIED FORWARD (V46-D8). Deployed v92 does NOT overwrite the model's prose with
// one arm. It has TWO, and the past-completion arm is explicitly gated on
// `!claimsFutureActionWithNoPlan`. The candidate carries the SAME gate on legacyProseFallback.
// A row that v92's FUTURE_PROMISE arm destroys is therefore v92 PARITY, not a truth regression.
// Modelling only PAST_COMPLETION_CLAIM_PATTERN overstates the differential — it is the same
// "measured against the wrong thing" mistake this campaign has now made three times, and my own
// first-pass harness made it too (35 reported where 28 is true). Every differential below uses
// v92Destroys(), never v92Fires() alone.
const v92FPLine = V92_LF.split('\n').find((l) => l.includes('const FUTURE_PROMISE_PATTERN'));
if (!v92FPLine) throw new Error('v46: v92 FUTURE_PROMISE_PATTERN missing — update this suite, do not let it pass');
const V92_FP = new Function(v92FPLine.trim() + '\nreturn FUTURE_PROMISE_PATTERN;')();
const candFPLine = SRC_LF.split('\n').find((l) => l.includes('const FUTURE_PROMISE_PATTERN'));
if (!candFPLine) throw new Error('v46: candidate FUTURE_PROMISE_PATTERN missing — update this suite');
const CAND_FP = new Function(candFPLine.trim() + '\nreturn FUTURE_PROMISE_PATTERN;')();
// what deployed v92 does to the model's prose, across BOTH of its arms
const v92Destroys = (s) => v92Fires(s) || V92_FP.test(String(s));
// what the candidate does, across both of ITS arms
const candDestroys = (s) => CAND_FP.test(String(s)) || fires(s);

// ═════════════════════════════════════════════════════ CONTRACTS (must keep holding)

// C1 — the deploy surface stays one file, and v92 loses nothing.
check('CONTRACT', 'C1a no declared identifier present in v92 is absent from the candidate', (() => {
  const dec = (s) => { const o = new Set();
    for (const m of s.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) o.add(m[1]);
    for (const m of s.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) o.add(m[1]);
    return o; };
  const a = dec(V92_LF), b = dec(SRC_LF);
  return [...a].every((x) => b.has(x));
})());
check('CONTRACT', 'C1b the D3 `&& !result.pendingAction` short-circuit is NOT reintroduced',
  !/claimsPastCompletion[^;]{0,400}?&&\s*!result\.pendingAction/s.test(SRC_LF));
check('CONTRACT', 'C1c the drift check is not gated on `!rawClaims` (#66/D40)', !/!rawClaims\s*&&/.test(SRC_LF));

// C2 — negator-token NAMES: both directions, on real names.
const NEGNAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'Nothing But Nets Foundation', 'Nowhere Bakery', 'Few Good Men Ltd', 'Hardly Strictly Media'];
let t2 = 0, f2 = 0;
for (const n of NEGNAMES) {
  for (const s of [`${n} was not archived.`, `${n} has not been deleted.`, `No company named ${n} was archived.`,
                   `${n} is not archived.`, `I could not archive ${n}.`]) if (!v92Fires(s) && fires(s)) t2++;
  for (const s of [`${n} was archived.`, `${n} has been deleted.`, `I archived ${n}.`]) if (v92Fires(s) && !fires(s)) f2++;
}
check('CONTRACT', 'C2a negator-token names: 0 truth regressions vs v92 (' + NEGNAMES.length * 5 + ' rows)', t2 === 0, 'got ' + t2);
check('CONTRACT', 'C2b negator-token names: 0 fabrication regressions vs v92 (' + NEGNAMES.length * 3 + ' rows)', f2 === 0, 'got ' + f2);

// C3 — the dash-before-a-CAPITAL class stays lexical, not casing-based.
check('CONTRACT', 'C3a "No company named Ulaanbaatar — North Depot was archived." preserved',
  !fires('No company named Ulaanbaatar — North Depot was archived.'));
check('CONTRACT', 'C3b "No unit at Erdenet — Copper Works was archived." preserved',
  !fires('No unit at Erdenet — Copper Works was archived.'));
check('CONTRACT', 'C3c the fabrication twin "Ulaanbaatar — North Depot was archived." is caught',
  fires('Ulaanbaatar — North Depot was archived.'));
check('CONTRACT', 'C3d it is the NEGATOR that separates them, not the casing',
  fires('Erdenet — Copper Works was archived.') && !fires('No unit at Erdenet — Copper Works was archived.'));

// C4 — the #39 catastrophe class: ordinary product-help prose survives.
const HELP = ['Archiving a company hides it from the active list but keeps its history.',
  'Archiving is reversible — you can restore from the Archived tab.',
  'Restoring a company brings back its tasks in their previous state.',
  'Going ahead and archiving is safe because it is reversible.',
  'Starting the archive from the Companies page is the fastest route.',
  'Approving a request resumes the paused work-order step.',
  'Clearing the filter shows archived companies again.'];
check('CONTRACT', 'C4 ordinary product-help prose is not destroyed (' + HELP.length + ' rows)',
  HELP.every((h) => !fires(h)), HELP.filter((h) => fires(h)).join(' | '));

// C5 — the three shapes the record once listed as "refused" are caught, paired truths preserved.
check('CONTRACT', 'C5a "No errors ACME Holdings was archived." is caught', fires('No errors ACME Holdings was archived.'));
check('CONTRACT', 'C5b "No problem the log shows ACME Holdings was archived." is caught', fires('No problem the log shows ACME Holdings was archived.'));
check('CONTRACT', 'C5c "Not a single task moved - Bob Smith was removed." is caught', fires('Not a single task moved - Bob Smith was removed.'));
check('CONTRACT', 'C5d paired truth "No errors were found." preserved', !fires('No errors were found.'));
check('CONTRACT', 'C5e paired truth "Not a single task moved - Bob Smith was not removed." preserved',
  !fires('Not a single task moved - Bob Smith was not removed.'));

// C6 — ledger closures re-asserted on the candidate.
check('CONTRACT', 'C6a #65/D27 production row 9dda919c shape is caught',
  fires('Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".'));
check('CONTRACT', 'C6b #65/D25 "The approval has been declined." is caught', fires('The approval has been declined.'));
check('CONTRACT', 'C6c #64/D16 "archived — no undo available" still caught', fires('ACME Holdings was archived — no undo available.'));
check('CONTRACT', 'C6d #66/D40 gate requires a SUPPORTED mutation/assignment claim',
  /hasSupportedMutationClaim = verifiedClaims\.some\(\(v\) => v\.verdict === 'supported'/.test(SRC_LF));

// C7 — the entity signal is POSITIVE-ONLY: absence must never be used as evidence.
{
  const withN = makeBelt(SRC, ['Archived Media Group']);
  const without = makeBelt(SRC, []);
  check('CONTRACT', 'C7a a known entity name rescues "Confirmed — Archived Media Group."',
    !withN.readsAsCompletion('Confirmed — Archived Media Group.'));
  check('CONTRACT', 'C7b an EMPTY pack does not rescue it (absence is never evidence)',
    without.readsAsCompletion('Confirmed — Archived Media Group.'));
  check('CONTRACT', 'C7c the interposed prefix reaches the entity branch (V45-D2 closure)',
    !withN.readsAsCompletion('Confirmed — as requested, Archived Media Group.'));
  check('CONTRACT', 'C7d the fabrication twin is still caught with the pack populated',
    withN.readsAsCompletion('Confirmed — Archived ACME.'));
}

// C8 — CRLF gate and Deno-safety substitutes.
check('CONTRACT', 'C8a index.ts is pure CRLF (6003 CRLF, 0 bare LF)',
  (SRC.match(/\r\n/g) || []).length === 6003 && (SRC.match(/(?<!\r)\n/g) || []).length === 0,
  'crlf=' + (SRC.match(/\r\n/g) || []).length + ' bareLF=' + (SRC.match(/(?<!\r)\n/g) || []).length);
check('CONTRACT', 'C8b no inline (?i:)-style modifier groups (unsupported in the Deno Edge runtime)',
  (SRC.match(/\(\?[a-zA-Z]+[:)-]/g) || []).filter((x) => !/^\(\?:/.test(x)).length === 0);

// ═════════════════════════════════════════════════════ DEFECTS (red until fixed)

// D1 — V45-D1 / V46: the conditioned offer. A PRODUCT decision, deliberately not closed by regex.
{
  const rows = [];
  for (const h of ['Let me archive the company', 'Let me delete the project', "I'm about to archive it",
                   'I am going to archive the company', 'Let me go ahead and archive the company'])
    for (const c of ['once you confirm.', 'if you approve.', 'as soon as you say go.', 'only after your approval.',
                     'when you confirm.', 'provided you approve.', 'unless you object.']) rows.push(h + ' ' + c);
  // CORRECTED SIZING (V46-D8): 7 of these 35 are "I am going to archive…", which deployed v92's
  // OWN future-promise arm destroys. Those are v92 parity. The real class is 28.
  const parity = rows.filter((s) => v92Destroys(s));
  const destroyed = rows.filter((s) => !v92Destroys(s) && candDestroys(s));
  check('CONTRACT', 'C9a the conditioned-offer class is sized against BOTH v92 prose arms (28, not 35)',
    parity.length === 7 && destroyed.length + parity.length === rows.length,
    'parity=' + parity.length + ' regressions=' + destroyed.length + ' of ' + rows.length);
  check('DEFECT', 'V46-D1/V45-D1 conditioned offers must not be destroyed (' + (rows.length - parity.length) + ' rows, v92-parity rows excluded)',
    destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || ''));
  // the unconditioned claim the arm exists for must stay caught either way
  check('CONTRACT', 'C9b the UNCONDITIONED claim the arm exists for stays caught',
    ['Let me archive the company.', "I'm about to archive it.", 'Let me go ahead and archive the company.'].every(fires));
}

// D2 — V46-D3: the #45 short-circuit destroys truthful NEGATED PROGRESSIVE refusals.
{
  const rows = ['Not processing the request.', 'Not executing the plan.',
    'Not executing the plan without your approval.', 'Not processing the changes until you confirm.',
    'Never processing the request twice.', 'No longer processing the request.',
    'Hardly processing the request at this volume.', 'Neither processing the request nor executing the plan.',
    'No longer executing the plan.'];
  const destroyed = rows.filter((s) => !v92Destroys(s) && candDestroys(s));
  check('DEFECT', 'V46-D3 truthful negated-progressive refusals must not be destroyed (' + rows.length + ' rows)',
    destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || ''));
  check('DEFECT', 'V46-D3 root cause: the short-circuit must also test the progressive vocabulary',
    /if \(!COMPLETION_VERB\.test\(c\) && !COMPLETION_PARTICIPLE\.test\(c\) && !EXECUTION_IN_PROGRESS\.test\(c\)\) return false;/.test(SRC_LF),
    'guard still reads `!COMPLETION_VERB && !COMPLETION_PARTICIPLE` only');
  // and the fabrications the progressive arm exists for must stay caught after any fix
  check('CONTRACT', 'C10 progressive fabrications stay caught',
    ['Processing the request.', 'Executing the plan.', 'Now archiving ACME Holdings.'].every(fires));
}

// D3 — V46-D7: the ordinal path binds on a reply that names TWO options.
{
  function fnOf(s, n) {
    const i = s.indexOf('function ' + n); if (i < 0) return null;
    let d = 0, k = s.indexOf('{', i), e = -1;
    for (; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) { e = k + 1; break; } } }
    return s.slice(i, e);
  }
  const ln = (s, n) => s.split('\n').find((x) => x.includes(n)).trim();
  const stripTS = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {')
    .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
    .replace(/\(([A-Za-z_$][\w$]*)\s*:\s*[^),]+\)\s*=>/g, '($1) =>')
    .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
    .replace(/\s+as\s+(?:const|string|number|boolean|any)\b/g, '');
  const m = new Function([ln(SRC_LF, 'const ARCHIVE_VERB_PATTERN'), ln(SRC_LF, 'const RESTORE_VERB_PATTERN'),
    stripTS(fnOf(SRC_LF, 'commandContradictsActionType')), stripTS(fnOf(SRC_LF, 'matchDisambiguationOption')),
    'return { matchDisambiguationOption };'].join('\n'))();
  const OPTS = [
    { id: 'A', label: 'ACME Holdings (option 1)', entityType: 'company', actionType: 'archive' },
    { id: 'B', label: 'Beta Corp (option 2)', entityType: 'company', actionType: 'archive' },
    { id: 'C', label: 'Gobi Energy (option 3)', entityType: 'company', actionType: 'archive' }];
  const AMBIG = ['option 1, option 2', 'option 1 #2', 'the first one number 2', '#2 the first one'];
  const bound = AMBIG.filter((c) => m.matchDisambiguationOption(c, OPTS) !== null);
  check('DEFECT', 'V46-D7 a reply naming TWO options must fail closed, not bind one (' + AMBIG.length + ' shapes)',
    bound.length === 0, bound.length + ' bind, e.g. ' + JSON.stringify(bound[0] || '')
      + ' -> ' + (bound[0] ? m.matchDisambiguationOption(bound[0], OPTS).id : ''));
  check('CONTRACT', 'C11 a single unambiguous ordinal still selects (the feature must survive any fix)',
    ['option 2 please', 'the second one', '#3', 'number 3'].every((c) => m.matchDisambiguationOption(c, OPTS) !== null));
}

// D4 — V46-D1 runtime: the belt must not be super-quadratic on one unsplittable clause.
{
  const unit = 'No Limits Inc was archived and Never Summer Industries was archived and ';
  const mk = (L) => { let s = ''; while (s.length < L) s += unit; return s.slice(0, L); };
  const t = (L) => { const s = mk(L); belt.readsAsCompletion(s);
    const t0 = process.hrtime.bigint(); belt.readsAsCompletion(s); return Number(process.hrtime.bigint() - t0) / 1e6; };
  const t1 = Math.max(t(1000), 0.001), t2 = Math.max(t(4000), 0.001);
  const e = Math.log(t2 / t1) / Math.log(4);
  check('DEFECT', 'V46-D1 growth exponent on a single unsplittable clause must be <= 2.0',
    e <= 2.0, 'measured e=' + e.toFixed(2) + '  (' + t1.toFixed(2) + ' ms at 1 KB -> ' + t2.toFixed(2) + ' ms at 4 KB)');
}

// D5 — V46-D5: CONFIRMED_COMPLETION omits participles every sibling list carries.
{
  const cc = SRC_LF.split('\n').find((l) => l.includes('const CONFIRMED_COMPLETION'));
  const missing = ['closed', 'added'].filter((w) => !cc.includes(w));
  check('DEFECT', 'V46-D5 CONFIRMED_COMPLETION carries the same participles as its sibling lists',
    missing.length === 0, 'missing: ' + missing.join(', ') + ' — so "Confirmed — Closed ACME." escapes while "Confirmed — Archived ACME." is caught');
}

// D6 — V46-D6: no campaign artifact may hard-code an absolute path into another worktree.
{
  const dir = path.join(ROOT, 'qa/verification/scratch/v92');
  const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) walk(f, acc); else if (e.name.endsWith('.mjs')) acc.push(f); } return acc; };
  // A drive-letter literal that is ASSIGNED or CONCATENATED is a hard-coded path. One that sits
  // inside a regex literal (preceded by `/`) is a DETECTOR for this very defect — not an instance
  // of it. Distinguishing them is the difference between a real finding and a self-inflicted one.
  const off = fs.existsSync(dir) ? walk(dir).filter((f) =>
    /(?:^|[^/])['"][A-Za-z]:[\\/][^'"]{3,}['"]/m.test(fs.readFileSync(f, 'utf8'))) : [];
  check('DEFECT', 'V46-D6 no campaign artifact hard-codes an absolute path into another checkout',
    off.length === 0, off.length + ' offenders, e.g. ' + (off[0] ? path.relative(ROOT, off[0]) : ''));
}

// D7 — V46-D2: the runtime probe the record cites must not compare a build against itself.
{
  const probe = path.join(ROOT, 'qa/verification/scratch/v92/v46_runtime_probe.mjs');
  let selfCompare = false, detail = '';
  if (fs.existsSync(probe)) {
    const txt = fs.readFileSync(probe, 'utf8');
    const m = txt.match(/buildGate\(ROOT \+ '([^']+)'\)/), n = txt.match(/buildGate\(ROOT \+ '([^']+)'\)[\s\S]*?buildGate\(ROOT \+ '([^']+)'\)/);
    if (n) {
      const p1 = path.join(ROOT, n[1]), p2 = path.join(ROOT, n[2]);
      if (fs.existsSync(p1) && fs.existsSync(p2)) {
        selfCompare = fs.readFileSync(p1, 'utf8') === fs.readFileSync(p2, 'utf8');
        detail = n[1] + ' vs ' + n[2] + (selfCompare ? ' — BYTE-IDENTICAL' : '');
      }
    }
    if (/const ROOT = '[A-Za-z]:/.test(txt)) detail += ' ; hard-coded ROOT into another worktree';
  }
  check('DEFECT', 'V46-D2 the cited runtime probe compares two DIFFERENT builds',
    !selfCompare && !/const ROOT = '[A-Za-z]:/.test(fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : ''), detail);
}

// D8 — V46-D9 (NEW this run): the candidate WIDENED v92's FUTURE_PROMISE_PATTERN to curly
// apostrophes. Directionally right — the same sentence should not behave differently because of
// typography — but it propagates v92's own over-firing to the apostrophe form an LLM actually
// emits by default, and it destroys TRUTHFUL clarifying replies that carry no completion claim
// at all. FUTURE_PROMISE_PATTERN has no exclusion for "I'll <do X> once you <give me Y>".
{
  const rows = ['I’ll assign this once you tell me who.',
    'I’ll need the company name before I can create it.',
    'I’ll create it as soon as you pick a company.'];
  const destroyed = rows.filter((s) => !v92Destroys(s) && candDestroys(s));
  check('DEFECT', 'V46-D9 curly-apostrophe clarifying replies must not be destroyed (' + rows.length + ' rows)',
    destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || ''));
  check('CONTRACT', 'C12 the promise the arm exists for is still caught in BOTH apostrophe forms',
    ['I’m going to archive ACME Holdings.', "I'm going to archive ACME Holdings."].every((s) => CAND_FP.test(s)));
}

// D9 — V46-D4: CONTRACT 5's narrowing (top-level declarations only) leaves ONE real hazard site
// unflagged. A local const inside the readsAsCompletion .map() CALLBACK is not a top-level
// declaration, so the narrowed detector ignores it — but run15's extractor slices readsAsCompletion
// to the first semicolon, so such a local breaks that suite with an opaque SyntaxError. The
// narrowing's stated premise ("locals are safe, completionIsNegated is extracted brace-balanced")
// is true for completionIsNegated and FALSE for readsAsCompletion's callback body.
{
  const c5 = path.join(ROOT, 'qa/scenarios-runner/v92_open_regression_contract.mjs');
  const txt = fs.existsSync(c5) ? fs.readFileSync(c5, 'utf8') : '';
  check('DEFECT', 'V46-D4 CONTRACT 5 covers the readsAsCompletion .map() callback hazard site',
    /readsAsCompletion[\s\S]{0,600}?callback|mapCallbackLocal|\.map\(\) callback/.test(txt),
    'CONTRACT 5 has coverage assertions for a top-level const and for a completionIsNegated local, but none for a local inside the readsAsCompletion .map() callback — the one site where a local IS the hazard');
  // and keep the two directions CONTRACT 5 does cover honest
  check('CONTRACT', 'C13 CONTRACT 5 still pins an exact top-level declaration sequence (it can still fail)',
    /declared\.join\(','\) === EXPECTED\.join\(','\)/.test(txt));
  check('CONTRACT', 'C14 both CONTRACT 5 coverage assertions fail loud on a moved anchor',
    (txt.match(/mutated !== TEXT/g) || []).length >= 2);
}

// D10 — the fresh truthful shapes I generated this run must never regress. These are CONTRACTS
// (they hold today) and exist so a future widening cannot quietly take them.
{
  const FRESH_TRUTH = [
    'Although nothing was archived, the list looks shorter.',
    'Unless you confirm, nothing will be archived.',
    'Rather than archive it, I left ACME Holdings active.',
    'Instead of archiving it, I only renamed the label.',
    'Has ACME Holdings been archived yet?',
    'Whereas no task was completed, three were reopened.',
    'If you had confirmed, the company would have been archived.',
    'ACME Holdings would have been archived if you had confirmed.',
  ];
  const lost = FRESH_TRUTH.filter((s) => !v92Destroys(s) && candDestroys(s));
  check('CONTRACT', 'C15 fresh truthful shapes (subordinate/counterfactual/interrogative) survive',
    lost.length === 0, lost.length + ' lost, e.g. ' + JSON.stringify(lost[0] || ''));
  check('CONTRACT', 'C16 the belt does not throw or hang on degenerate input', (() => {
    for (const t of ['', ' '.repeat(5000), '('.repeat(2000), 'a'.repeat(50000), '.'.repeat(20000)]) {
      const t0 = Date.now(); try { belt.readsAsCompletion(t); } catch { return false; }
      if (Date.now() - t0 > 2000) return false;
    }
    return true;
  })());
  check('CONTRACT', 'C17 no canned corrective result.summary string trips the belt', (() => {
    for (const m of SRC_LF.matchAll(/result\.summary\s*=\s*(['"`])([\s\S]{20,600}?)\1\s*;/g)) {
      if (candDestroys(m[2])) return false;
    }
    return true;
  })());
}

// ═════════════════════════════════════════════════════
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail === 0 ? 0 : 1);
