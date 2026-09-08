// VERIFIER #55 — byte-identity of the v92 prose paths SHARED by the candidate. My own scanner
// (not belt_extract.mjs / _gate_extract.mjs). If any shared arm differs, the differential must
// model it; if all are identical, the differential reduces to readsAsCompletion vs
// PAST_COMPLETION_CLAIM_PATTERN on the ungrounded-turn shape.
import fs from 'node:fs';
import crypto from 'node:crypto';

const A = fs.readFileSync('qa/verification/scratch/v92/v92.lf.ts', 'utf8');
const B = fs.readFileSync('qa/verification/scratch/v55_cand.lf.ts', 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const PREV = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
export function scanStmt(src, start, mode) {
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
export function grabConst(src, name, nth = 0) {
  const re = new RegExp('(^|\\n)[ \\t]*const\\s+' + name + '\\b', 'g');
  let m, k = 0;
  while ((m = re.exec(src))) { if (k++ === nth) { const s = src.indexOf('const', m.index); return src.slice(s, scanStmt(src, s, 'stmt')); } }
  throw new Error('const not found: ' + name);
}
export function grabFn(src, name) {
  const m = new RegExp('(^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const s = src.indexOf('function', m.index);
  return src.slice(s, scanStmt(src, s, 'fn'));
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const isMain = process.argv[1] && /shared_arms_identity\.mjs$/.test(process.argv[1]);
const items = !isMain ? [] : [
  ['FUTURE_PROMISE_PATTERN', (s) => grabConst(s, 'FUTURE_PROMISE_PATTERN')],
  ['PAST_COMPLETION_CLAIM_PATTERN', (s) => grabConst(s, 'PAST_COMPLETION_CLAIM_PATTERN')],
  ['claimsLifecycleClaim()', (s) => grabFn(s, 'claimsLifecycleClaim')],
  ['findEntityStateClaimContradiction()', (s) => grabFn(s, 'findEntityStateClaimContradiction')],
  ['COMPANY_STATE_CLAIM_VOCAB', (s) => grabConst(s, 'COMPANY_STATE_CLAIM_VOCAB')],
  ['PERSON_STATE_CLAIM_VOCAB', (s) => grabConst(s, 'PERSON_STATE_CLAIM_VOCAB')],
  ['claimsTaskDeleted', (s) => grabConst(s, 'claimsTaskDeleted')],
  ['claimsCompanyDeleted', (s) => grabConst(s, 'claimsCompanyDeleted')],
  ['claimsPersonDeleted', (s) => grabConst(s, 'claimsPersonDeleted')],
  ['claimsGoalDeleted', (s) => grabConst(s, 'claimsGoalDeleted')],
  ['claimsFutureActionWithNoPlan', (s) => grabConst(s, 'claimsFutureActionWithNoPlan')],
  ['matchDisambiguationOption()', (s) => grabFn(s, 'matchDisambiguationOption')],
  ['commandContradictsActionType()', (s) => grabFn(s, 'commandContradictsActionType')],
  ['resolveClarificationField()', (s) => grabFn(s, 'resolveClarificationField')],
  ['ARCHIVE_VERB_PATTERN', (s) => grabConst(s, 'ARCHIVE_VERB_PATTERN')],
  ['RESTORE_VERB_PATTERN', (s) => grabConst(s, 'RESTORE_VERB_PATTERN')],
];
let allSame = true;
for (const [label, f] of items) {
  let a, b;
  try { a = f(A); } catch (e) { a = 'ERR ' + e.message; }
  try { b = f(B); } catch (e) { b = 'ERR ' + e.message; }
  const same = a === b, sameNorm = norm(a) === norm(b);
  if (!same) allSame = false;
  console.log((same ? 'IDENTICAL   ' : sameNorm ? 'WS-ONLY     ' : 'DIFFERS     '), label.padEnd(38), 'v92', sha(a), 'cand', sha(b), 'len', a.length, '/', b.length);
  if (!same && !sameNorm && a.length < 3000 && b.length < 3000) { console.log('   v92 :', a.replace(/\n/g, '\\n').slice(0, 800)); console.log('   cand:', b.replace(/\n/g, '\\n').slice(0, 800)); }
}
// the state-claim call sites: where findEntityStateClaimContradiction is invoked and what it suppresses
for (const [name, src] of (isMain ? [['v92', A], ['cand', B]] : [])) {
  const lines = src.split('\n');
  const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /findEntityStateClaimContradiction\(|claimsLifecycleClaim\(|stateClaimCorrections\.push|lifecycleMismatchCorrections\.push|lifecycleReports\.push/.test(l) && !/^\s*\/\//.test(l));
  console.log(name, 'call sites:', hits.length);
  for (const [n, l] of hits) console.log('   :' + n, l.trim().slice(0, 150));
}
if (isMain) console.log(allSame ? 'ALL SHARED ARMS BYTE-IDENTICAL' : 'SOME SHARED ARMS DIFFER — see above');
