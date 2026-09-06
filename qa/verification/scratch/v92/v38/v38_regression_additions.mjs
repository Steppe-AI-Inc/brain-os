#!/usr/bin/env node
// VERIFIER #38 (campaign #98) — permanent regression additions for the v92 deployment gate.
//
// Every check is labelled [CONTRACT] (a structural invariant that must hold) or [DEFECT]
// (a concrete shape whose behaviour is pinned). ANY failure exits nonzero.
//
// index.ts is resolved from SEM_INDEX_SRC, else by walking up from this file until
// supabase/functions/sem-ai-command/index.ts is found — correct from ANY cwd.
//
// WHAT THIS FILE ADDS THAT NO EXISTING SUITE HAD:
//   The committed v92 parity corpus (911 strings) contains only 7 parentheticals and NONE
//   that places a long parenthetical between the auxiliary and the participle. That blind
//   spot let a real, newly-introduced v92 fabrication regression (V38-D2) ship while
//   v92_parity_contract.mjs stayed green at 46/0. CONTRACT V38-C1 closes the blind spot as
//   a PROPERTY (generated, not enumerated) so it cannot silently reopen.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

function resolveRun14() {
  // walk up from cwd to find the repo copy of run14, so this pin works from any cwd
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    const p = d + '/qa/scenarios-runner/run14_defect_closure_contract.mjs';
    try { readFileSync(p); return p; } catch { d = d + '/..'; }
  }
  return 'qa/scenarios-runner/run14_defect_closure_contract.mjs';
}

const HERE = dirname(fileURLToPath(import.meta.url));
function findIndex() {
  if (process.env.SEM_INDEX_SRC) return process.env.SEM_INDEX_SRC;
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('v38: cannot locate supabase/functions/sem-ai-command/index.ts from ' + HERE);
}
const SRC_PATH = findIndex();
const src = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// ---- deployed-v92 gate. PCCP is byte-identical in the candidate (asserted below), so the
// v92 gate is reconstructed from the candidate's own literal; the committed v92 copy is used
// to prove that identity when it is present.
const pccpLit = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
const candPCCP = pccpLit(src);
if (!candPCCP) throw new Error('v38: PAST_COMPLETION_CLAIM_PATTERN not found — update this harness');
const V92_COPY = resolve(HERE, '../scratch/v92/index.v92.ts');
const v92src = existsSync(V92_COPY) ? readFileSync(V92_COPY, 'utf8').replace(/\r\n/g, '\n') : null;
const V92 = new Function('return ' + candPCCP)();
const v92Fires = (s) => V92.test(String(s));

// ---- candidate belt
function buildBelt(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION');
  const b = text.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v38: belt block not found — update this harness');
  const slice = text.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v38: TypeScript survived stripping — refusing to pass');
  return new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
}
const belt = buildBelt(src);
const candFires = (s) => belt(String(s)) === true;

let pass = 0; const failures = [];
const check = (kind, id, ok, detail) => {
  if (ok) { pass++; console.log(`OK   [${kind}] ${id}`); }
  else { failures.push(`[${kind}] ${id} — ${detail}`); console.log(`FAIL [${kind}] ${id} — ${detail}`); }
};

// =====================================================================================
console.log('--- v92 identity');
check('CONTRACT', 'V38-C0 PCCP byte-identical to deployed v92',
  !v92src || pccpLit(v92src) === candPCCP,
  'the candidate PCCP literal differs from the deployed v92 literal — the whole differential is invalid');

// =====================================================================================
// CONTRACT V38-C1 — THE BLIND SPOT. Generated, not enumerated.
// A completion claim whose auxiliary and participle are separated by a parenthetical must
// not be SHIPPED when deployed v92 CORRECTS it. This is the property the committed parity
// corpus never generated, and it is how V38-D2 shipped past an all-green gate set.
// =====================================================================================
console.log('\n--- [CONTRACT] V38-C1 parenthetical between auxiliary and participle (generated property)');
{
  const SUBJ = ['ACME Corp', 'Beta Corp', 'Gobi Cashmere', 'Khan Bank', 'Erdenet Copper Works'];
  const AUX = ['was', 'has been'];
  // parentheticals that CONTAIN completion vocabulary (this is what v92's window reaches)
  const PAR = [
    '(per the approval granted last week by finance)',
    '(following the review completed yesterday)',
    '(after the request approved by the board)',
    '(once the transfer completed on Monday)',
    '(per the change approved in Q3)',
  ];
  const PART = ['archived', 'deleted', 'restored', 'renamed'];
  const shipped = [];
  let generated = 0;
  for (const s of SUBJ) for (const a of AUX) for (const p of PAR) for (const t of PART) {
    const text = `${s} ${a} ${p} ${t}.`;
    generated++;
    if (v92Fires(text) && !candFires(text)) shipped.push(text);
  }
  check('CONTRACT', `V38-C1 no fabrication v92 corrects is shipped (${generated} generated shapes)`,
    shipped.length === 0,
    `${shipped.length} of ${generated} fabrications deployed v92 CORRECTS are SHIPPED by this build, e.g. ${JSON.stringify(shipped[0] || '')}`);

  // the paired truthful negatives must still survive — the fix for C1 must not be bought with truth
  const truthDestroyed = [];
  for (const s of SUBJ) for (const p of PAR) for (const t of PART) {
    for (const text of [`${s} was not ${p} ${t}.`, `No company ${p} was ${t}.`, `${s} has not been ${p} ${t}.`]) {
      if (!v92Fires(text) && candFires(text)) truthDestroyed.push(text);
    }
  }
  check('CONTRACT', 'V38-C1b paired truthful negatives of the same shape survive',
    truthDestroyed.length === 0,
    `${truthDestroyed.length} truthful answers v92 PRESERVES are destroyed, e.g. ${JSON.stringify(truthDestroyed[0] || '')}`);
}

// =====================================================================================
// CONTRACT V38-C2 — transformation invariance. The same truthful negative, with and
// without a parenthetical / period-bearing token / quoted span / dash inside its adverbial,
// must get the SAME answer. Any pair that differs is a defect in whichever direction.
// =====================================================================================
console.log('\n--- [CONTRACT] V38-C2 transformation invariance of a truthful negative');
{
  const BASES = ['ACME Corp was not archived', 'No company was archived', 'Beta Corp has not been deleted'];
  const ADV = ['today', '(per the audit log) today', 'per Inc. policy today',
    'per the "hold" rule today', '— per the hold rule — today', 'per Dr. Chen’s instruction today'];
  const bad = [];
  for (const b of BASES) {
    const answers = ADV.map((a) => ({ a, fired: candFires(`${b} ${a}.`) }));
    const first = answers[0].fired;
    for (const x of answers) if (x.fired !== first) bad.push(`${b} + ${x.a}`);
  }
  check('CONTRACT', 'V38-C2 adverbial form does not change the verdict', bad.length === 0,
    `${bad.length} transformation pair(s) disagree: ${bad.slice(0, 3).join(' | ')}`);
}

// =====================================================================================
// DEFECT pins — negator-token entity names, BOTH directions.
// =====================================================================================
console.log('\n--- [DEFECT] negator-token entity names, both directions');
{
  const NEG_NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries',
    'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Logistics', 'Nobody Studios'];
  const missed = [], destroyed = [];
  for (const n of NEG_NAMES) {
    for (const f of [`${n} was archived.`, `${n} has been archived.`, `${n} was archived successfully.`, `I archived ${n}.`]) {
      if (!candFires(f)) missed.push(f);
    }
    for (const t of [`${n} was not archived.`, `${n} has not been archived.`, `I did not archive ${n}.`, `No company named ${n} was archived.`]) {
      if (candFires(t)) destroyed.push(t);
    }
  }
  check('DEFECT', 'V38-D3 a fabrication about a negator-token name is caught', missed.length === 0,
    `${missed.length} shipped, e.g. ${JSON.stringify(missed[0] || '')}`);
  check('DEFECT', 'V38-D3b the truthful negative about the SAME name survives', destroyed.length === 0,
    `${destroyed.length} destroyed, e.g. ${JSON.stringify(destroyed[0] || '')}`);
}

// =====================================================================================
// DEFECT pins — the mandated dash-before-a-capital class (must be preserved, and the
// fabrication twin must be caught LEXICALLY rather than by casing).
// =====================================================================================
console.log('\n--- [DEFECT] dash before a capital is not a clause boundary');
{
  const mustSurvive = [
    'No company named Ulaanbaatar — North Depot was archived.',
    'No unit at Erdenet — Copper Works was archived.',
  ];
  const mustCatch = [
    'No problem — Ulaanbaatar North Depot was archived.',
    'No worries — Erdenet Copper Works was archived.',
  ];
  for (const s of mustSurvive) check('DEFECT', `V38-D4 preserved :: ${s.slice(0, 46)}…`, !candFires(s), 'a truthful answer was destroyed');
  for (const s of mustCatch) check('DEFECT', `V38-D4b caught :: ${s.slice(0, 46)}…`, candFires(s), 'a fabrication shipped');
}

// =====================================================================================
// DEFECT pins — reassurance idiom must not shield a fabrication, and must not destroy
// a first-person or progressive DENIAL (the arms verifier #37 showed the strip carries).
// =====================================================================================
console.log('\n--- [DEFECT] reassurance idiom, both directions');
{
  for (const s of ['No problem — ACME Corp was archived.', 'No worries — I archived ACME Corp.',
    'Nothing failed: ACME Corp was archived.', 'No worries — ACME Corp is being deleted.']) {
    check('DEFECT', `V38-D5 idiom does not shield :: ${s.slice(0, 44)}…`, candFires(s), 'fabrication shipped behind a reassurance idiom');
  }
  for (const s of ['No problem — I archived nothing.', 'No worries — nothing is being deleted.',
    'No problem — ACME Corp was not archived.', 'Not a problem — I did not delete anything.']) {
    check('DEFECT', `V38-D5b idiom + denial survives :: ${s.slice(0, 44)}…`, !candFires(s), 'a truthful denial was destroyed');
  }
}

// =====================================================================================
// DEFECT pins — ledger production shapes (#64 D16, #65 D25, #65 D27 production row
// 9dda919c, #66 D40) stay closed.
// =====================================================================================
console.log('\n--- [DEFECT] ledger production shapes stay closed');
{
  const LEDGER = [
    ['#64 D16', 'The approval has been approved.'],
    ['#64 D16', 'The department was created.'],
    ['#65 D25', 'Confirmed — Archived ACME Corp.'],
    ['#65 D27 prod row 9dda919c', 'renamed: "ACME Corp" → "ACME Holdings"'],
    ['#65 D27 ascii arrow', 'renamed: "ACME Corp" -> "ACME Holdings"'],
    ['#66 D40', 'ACME Corp was archived successfully.'],
    ['#66 D40', 'Bob Smith was reassigned successfully.'],
  ];
  for (const [tag, s] of LEDGER) check('DEFECT', `V38-D6 ${tag} closed :: ${s.slice(0, 40)}…`, candFires(s), 'a ledger-closed production shape reopened');
}

// =====================================================================================
// CONTRACT — the belt must not acquire a whole-span lookaround (run15/D117), and must not
// use an inline modifier group (unverified in the Deno Edge runtime).
// =====================================================================================
console.log('\n--- [CONTRACT] belt structural invariants');
{
  const a = src.indexOf('const LEGACY_PAST_COMPLETION'), b = src.indexOf('const legacyProseFallback');
  const blk = src.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  check('CONTRACT', 'V38-C3 no whole-span lookahead in the belt', !/\(\?![^)]*\[\^\]\*/.test(blk) && !/\(\?=[^)]*\[\^\]\*/.test(blk), 'a later-sentence negator could disarm the belt');
  check('CONTRACT', 'V38-C3b no whole-span lookbehind in the belt', !/\(\?<![^)]*\[\^\]\*/.test(blk), 'a later-sentence negator could disarm the belt');
  check('CONTRACT', 'V38-C3c no inline modifier group', !/\(\?-?[ims]+:/.test(blk), 'inline modifier groups are unverified in the Deno Edge runtime and fail at module load');
  // the readsAsCompletion statement must remain ONE statement that the slicing suites can span
  const i = src.indexOf('const readsAsCompletion = ');
  const j = src.indexOf(';\n', i);
  check('CONTRACT', 'V38-C4 readsAsCompletion statement is spanned by run14 4000-char window',
(() => { const r = (() => { try { return readFileSync(resolveRun14(), 'utf8'); } catch { return ''; } })(); return r.length > 0 && !/const readsAsCompletion = \[..s..S\]\{0,\d+\}/.test(r) && r.includes('statement end not found'); })(),
    'run14 must slice the WHOLE readsAsCompletion statement: run39 replaced its character budget (2000 -> 2600 -> 4000, truncating silently each time) with a scan to the statement end that throws if it cannot find it. This fails if a bounded slice returns or the fail-loud scan is missing.');
}

// =====================================================================================
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nRED — v38 regression additions are not satisfied on this build:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
process.exit(0);
