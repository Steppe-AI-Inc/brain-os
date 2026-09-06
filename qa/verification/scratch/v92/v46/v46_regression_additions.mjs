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
  const destroyed = rows.filter((s) => !v92Fires(s) && fires(s));
  check('DEFECT', 'V46-D1/V45-D1 conditioned offers must not be destroyed (' + rows.length + ' rows)',
    destroyed.length === 0, destroyed.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || ''));
  // the unconditioned claim the arm exists for must stay caught either way
  check('CONTRACT', 'C9 the UNCONDITIONED claim the arm exists for stays caught',
    ['Let me archive the company.', "I'm about to archive it.", 'Let me go ahead and archive the company.'].every(fires));
}

// D2 — V46-D3: the #45 short-circuit destroys truthful NEGATED PROGRESSIVE refusals.
{
  const rows = ['Not processing the request.', 'Not executing the plan.',
    'Not executing the plan without your approval.', 'Not processing the changes until you confirm.',
    'Never processing the request twice.', 'No longer processing the request.',
    'Hardly processing the request at this volume.', 'Neither processing the request nor executing the plan.'];
  const destroyed = rows.filter((s) => !v92Fires(s) && fires(s));
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
  const off = fs.existsSync(dir) ? walk(dir).filter((f) => /['"][A-Za-z]:[\\/]/.test(fs.readFileSync(f, 'utf8'))) : [];
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

// ═════════════════════════════════════════════════════
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail === 0 ? 0 : 1);
