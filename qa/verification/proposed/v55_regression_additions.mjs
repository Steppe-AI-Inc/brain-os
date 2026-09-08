#!/usr/bin/env node
// VERIFIER #55 (campaign #115) — regression additions for candidate 1d720188fd1290f0855d58c8ad83c4910ea68900
// (index.ts sha256 2bad0df120fef86c34e544081e30bc0c492947a7ddbe93b6b5c0bd29f8dad84a).
//
// CONTRACT rows are structural guards that must hold on ANY candidate.
// DEFECT rows reproduce a confirmed defect; each FAILS while the defect is open (V55-D1 is open on
// this candidate, so this file is RED on 1d72018 by design — exactly like verifier #39's entity test).
// ANY failure exits non-zero.
//
// Source resolution: SEM_INDEX_SRC, else walk up from this file. Correct from ANY cwd. The deployed-v92
// reference is V92_INDEX_SRC, else qa/verification/scratch/v92/index.v92.ts found the same way.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; }
  return null;
}
const SRC_PATH = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC_PATH) { console.error('FATAL: sem-ai-command/index.ts not found'); process.exit(2); }
const V92_PATH = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : findUp('qa/verification/scratch/v92/index.v92.ts');
const TEXT = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');
const V92 = V92_PATH ? readFileSync(V92_PATH, 'utf8').replace(/\r\n/g, '\n') : null;

let pass = 0, fail = 0;
const check = (kind, name, ok, detail = '') => {
  if (ok) { pass++; console.log(`ok    [${kind}] ${name}`); }
  else { fail++; console.log(`FAIL  [${kind}] ${name}${detail ? '\n        ' + detail : ''}`); }
};

// ── my own statement scanner (comment/string/regex aware) ─────────────────────────────────
const PREV = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function scanStmt(src, start, mode) {
  let i = start, depth = 0, prev = '', saw = false;
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; } i = j + 1; prev = c; continue; }
    if (c === '/' && (prev === '' || PREV.has(prev))) { let j = i + 1, cls = false; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; else if (src[j] === '\n') break; j++; } j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++; i = j; prev = '/'; continue; }
    if (c === '(' || c === '[' || c === '{') { if (c === '{' && depth === 0 && mode === 'fn') saw = true; depth++; }
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0 && mode === 'fn' && c === '}' && saw) return i + 1; }
    else if (c === ';' && depth === 0 && mode === 'stmt') return i + 1;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('unterminated from ' + start);
}
function grabConst(src, name) { const m = new RegExp('(^|\\n)[ \\t]*const\\s+' + name + '\\b').exec(src); if (!m) throw new Error('const not found: ' + name); const s = src.indexOf('const', m.index); return src.slice(s, scanStmt(src, s, 'stmt')); }
function grabFn(src, name) { const m = new RegExp('(^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); if (!m) throw new Error('fn not found: ' + name); const s = src.indexOf('function', m.index); return src.slice(s, scanStmt(src, s, 'fn')); }
function detype(code) { return code.replace(/\(c: string\): boolean/g, '(c)').replace(/\(s: string\)/g, '(s)').replace(/: string\[\]/g, '').replace(/: RegExp/g, ''); }
const BELT = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
function buildBelt(names = [], mutate = (s) => s) {
  const parts = []; for (const n of BELT) { try { parts.push(detype(grabConst(TEXT, n))); } catch (e) { if (n === 'readsAsCompletion' || n === 'LEGACY_PAST_COMPLETION') throw e; } }
  const body = mutate(parts.join('\n'));
  return { ...new Function('__n', 'const knownEntityNames = new Set(__n.map((v) => String(v).trim().toLowerCase()));\n' + body + '\nreturn { readsAsCompletion, completionIsNegated };')(names), body };
}
const v92Past = V92 ? new Function('return ' + grabConst(V92, 'PAST_COMPLETION_CLAIM_PATTERN').match(/= (\/[\s\S]*\/[a-z]*);\s*$/)[1])() : null;

// ── CONTRACT 1: shared prose arms are byte-identical to deployed v92 (the fourth-path floor) ─
if (V92) {
  for (const [label, f] of [
    ['PAST_COMPLETION_CLAIM_PATTERN', (s) => grabConst(s, 'PAST_COMPLETION_CLAIM_PATTERN')],
    ['claimsLifecycleClaim()', (s) => grabFn(s, 'claimsLifecycleClaim')],
    ['findEntityStateClaimContradiction()', (s) => grabFn(s, 'findEntityStateClaimContradiction')],
    ['claimsCompanyDeleted', (s) => grabConst(s, 'claimsCompanyDeleted')],
    ['claimsPersonDeleted', (s) => grabConst(s, 'claimsPersonDeleted')],
    ['claimsTaskDeleted', (s) => grabConst(s, 'claimsTaskDeleted')],
    ['claimsGoalDeleted', (s) => grabConst(s, 'claimsGoalDeleted')],
  ]) {
    let a, b; try { a = f(V92); b = f(TEXT); } catch (e) { a = 'ERR'; b = e.message; }
    check('CONTRACT', 'V55-C1 shared arm byte-identical to deployed v92: ' + label, a === b, 'differs — the three-arm instrument must model the fourth path before any differential is trusted');
  }
} else {
  check('CONTRACT', 'V55-C1 deployed-v92 reference source is available (V92_INDEX_SRC or scratch/v92/index.v92.ts)', false, 'cannot pin shared-arm identity without it');
}

// ── CONTRACT 2: the belt bounds its input (the cubic-growth item is bounded by this slice) ──
{
  const ra = grabConst(TEXT, 'readsAsCompletion');
  check('CONTRACT', 'V55-C2 readsAsCompletion evaluates a bounded slice (String(s).slice(0, 4000)) — the record\'s "no length cap" is false and must stay false',
    /String\(s\)\.slice\(0, 4000\)/.test(ra) && /String\(s\)\.length > 4000/.test(ra));
}

// ── CONTRACT 3: my own TDZ class check — synchronous use-before-declaration of the two replay patterns
{
  const useLine = TEXT.split('\n').findIndex((l) => /const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN\.test\(replayLabel\)/.test(l)) + 1;
  const declP = TEXT.split('\n').findIndex((l) => /^\s*const PAST_COMPLETION_CLAIM_PATTERN = \//.test(l)) + 1;
  const declW = TEXT.split('\n').findIndex((l) => /^\s*const COMPLETION_WORD = \//.test(l)) + 1;
  check('CONTRACT', 'V55-C3 the disambiguation replay branch reads PAST_COMPLETION_CLAIM_PATTERN / COMPLETION_WORD only AFTER their declarations (V54-P0-TDZ stays closed)',
    useLine > 0 && declP > 0 && declW > 0 && declP < useLine && declW < useLine, `use :${useLine} declP :${declP} declW :${declW}`);
  check('CONTRACT', 'V55-C3b each of the two patterns is declared exactly once', (TEXT.match(/^\s*const PAST_COMPLETION_CLAIM_PATTERN = /gm) || []).length === 1 && (TEXT.match(/^\s*const COMPLETION_WORD = /gm) || []).length === 1);
}

// ── CONTRACT 4: negator-name section, BOTH directions, pack populated ───────────────────────
const NEG = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation'];
{
  const belt = buildBelt(NEG);
  let fabMissed = [], truthLost = [];
  for (const N of NEG) {
    for (const f of [`${N} was archived.`, `${N} has been archived.`, `I archived ${N}.`, `Confirmed — Archived ${N}.`, `${N}'s record was archived.`, `${N}’s record was archived.`]) if (!belt.readsAsCompletion(f)) fabMissed.push(f);
    for (const t of [`${N} was not archived.`, `No company named ${N} was archived.`, `${N} hasn't been archived.`, `I did not archive ${N}.`, `Nothing was changed for ${N}.`, `${N}'s record was not archived.`]) if (belt.readsAsCompletion(t)) truthLost.push(t);
  }
  check('CONTRACT', 'V55-C4a negator-initial names (pack populated): every plain and \'s-possessive fabrication is caught', fabMissed.length === 0, fabMissed.join(' | '));
  check('CONTRACT', 'V55-C4b negator-initial names (pack populated): every truthful negative survives', truthLost.length === 0, truthLost.join(' | '));
}
// ── CONTRACT 5: adversarial truthful classes (each shipped fix's failure direction) ──────────
{
  const belt = buildBelt(['ACME Holdings', 'Ulaanbaatar — North Depot', 'Erdenet — Copper Works']);
  const T = [
    'No Changes Were Made To ACME Holdings.', 'Not Archived: ACME Holdings remains active.',
    'Pending your confirmation, nothing was archived.', 'Awaiting approval — ACME Holdings was not archived.',
    'No problem — ACME Holdings was not archived.', 'No worries, nothing was archived for ACME Holdings.',
    'ACME Holdings has, as far as I can tell, not been archived.', 'ACME Holdings was, as of today, not archived.',
    'No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.',
    'I archived no companies.', 'No log however shows ACME Holdings was archived.', 'No entry however in our records shows ACME Holdings was archived.',
    'Confirmed - Archived Media Group remains active.', 'ACME HOLDINGS WAS NOT ARCHIVED.', 'ACME Holdings’ record wasn’t archived.',
    "Let me archive ACME Holdings once you confirm.",
  ];
  const lost = T.filter((s) => belt.readsAsCompletion(s));
  check('CONTRACT', 'V55-C5 adversarial truthful negatives (Title-Case negator, Pending/Awaiting negation, idiom-then-denial, AUXGAP truth, dash-before-capital, lowercase-after-participle, evidential-after-linker, shouting, curly apostrophes) all survive', lost.length === 0, lost.join(' | '));
  const F = ['Ulaanbaatar — North Depot was archived.', 'Erdenet — Copper Works has been archived.', 'Confirmed - Archived ACME.', 'No errors ACME was archived.', 'No problem the log shows ACME was archived.', 'The company with no active tasks was archived.', 'ACME HOLDINGS WAS ARCHIVED.', 'I have archived ACME Holdings.'];
  const missed = F.filter((s) => !belt.readsAsCompletion(s));
  check('CONTRACT', 'V55-C5b their fabrication twins stay caught', missed.length === 0, missed.join(' | '));
  // V55-R1 (PARITY residual, disclosed — not a contract): the CONTRACTED first-person perfect ships in BOTH
  // builds. v92's PAST arm needs has been|was|were; the candidate's first-person arm lists "have |had " but
  // not "'ve". Pinned as parity so nobody later quotes it as a regression in either direction.
  for (const s of ["I've archived ACME Holdings.", 'I’ve archived ACME Holdings.']) {
    const cand = belt.readsAsCompletion(s), prod = v92Past ? v92Past.test(s) : null;
    console.log(`note  [RESIDUAL] V55-R1 ${JSON.stringify(s)} candidate=${cand ? 'caught' : 'ships'} v92=${prod === null ? 'n/a' : prod ? 'caught' : 'ships'} (${cand === prod ? 'PARITY' : 'DIFFERS'})`);
  }
}
// ── CONTRACT 6: the matcher never arms a NEGATED selection (v92 does) ───────────────────────
{
  const src = TEXT;
  const fn = grabFn(src, 'matchDisambiguationOption');
  const topConsts = new Set([...src.matchAll(/^const ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  const refs = [...new Set([...fn.matchAll(/\b([A-Z_][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))].filter((n) => topConsts.has(n));
  // generic annotated-declaration strip (`const X: T = ` -> `const X = `); type expressions never contain `=`
  const deps = refs.map((n) => grabConst(src, n).replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/, '$1 $2 =').replace(/: string\[\]/g, '')).join('\n');
  const fnJs = fn.replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/, '(command, options)').replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/\((\w+): string\)/g, '($1)').replace(/ as string\[\]/g, '').replace(/ as string/g, '').replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  const matcher = new Function('const knownEntityNames = new Set();\n' + deps + '\n' + fnJs + '\nreturn matchDisambiguationOption;')();
  const O = [{ id: 'a', label: 'ACME Corp', entityType: 'company', actionType: 'archive' }, { id: 'b', label: 'ACME Company', entityType: 'company', actionType: 'archive' }];
  check('CONTRACT', 'V55-C6 "not ACME Corp" resolves to NO option (v92 arms ACME Corp)', matcher('not ACME Corp', O) === null);
  check('CONTRACT', 'V55-C6b "option 2" / "the second one" resolve to the second option; "ACME" (ambiguous) resolves to none',
    matcher('option 2', O)?.id === 'b' && matcher('the second one', O)?.id === 'b' && matcher('ACME', O) === null);
}

// ── DEFECT V55-D1: bare-apostrophe possessive of an s-ending negator-initial name, pack populated ──
{
  const names = ['Nothing Bundt Cakes', 'No Frills Foods', 'Never Summer Industries'];
  const belt = buildBelt(names);
  const fabs = [];
  for (const N of names) for (const P of [N + "'", N + '’']) for (const o of ['record', 'account']) for (const s of [`${P} ${o} was archived.`, `${P} ${o} has been deleted.`]) fabs.push(s);
  const shipped = fabs.filter((s) => !belt.readsAsCompletion(s));
  const v92Catches = v92Past ? fabs.filter((s) => v92Past.test(s)).length : -1;
  check('DEFECT', `V55-D1 (P1) bare-apostrophe possessive of an s-ending negator-initial name ships WITH the pack populated while deployed v92 corrects it (v92 PAST catches ${v92Catches}/${fabs.length}) — expected RED until the possessive strip also removes a bare trailing apostrophe`,
    shipped.length === 0, shipped.length + '/' + fabs.length + ' shipped, e.g. ' + JSON.stringify(shipped[0]));
  // the paired truthful negatives must survive today AND after the fix
  const truths = names.flatMap((N) => [`${N}' account was not archived.`, `${N}’ record has not been deleted.`, `No change was made to ${N}' record.`]);
  check('CONTRACT', 'V55-D1.pairedTruthSurvives — the truthful negatives about the same possessive forms survive', truths.every((s) => !belt.readsAsCompletion(s)), truths.filter((s) => belt.readsAsCompletion(s)).join(' | '));
  // prepared fix, applied IN MEMORY to the extracted belt: closes the class at zero truth cost on these rows
  const FROM = ".replace(/['’]s$/, '')", TO = ".replace(/['’]s$|(?<=s)['’]$/, '')";
  const fixed = buildBelt(names, (b) => b.split(FROM).join(TO));
  check('CONTRACT', 'V55-D1.preparedFixIsLoadBearing — with the possessive strip widened in memory, every V55-D1 fabrication is caught and every paired truth still survives',
    (belt.body.includes(TO) || fixed.body !== belt.body) && fabs.every((s) => fixed.readsAsCompletion(s)) && truths.every((s) => !fixed.readsAsCompletion(s)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
