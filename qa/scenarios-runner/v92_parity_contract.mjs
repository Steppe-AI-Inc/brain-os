#!/usr/bin/env node
// v92 PARITY CONTRACT — candidate-vs-DEPLOYED-production differential, made permanent.
//
// Production sem-ai-command v92 == git c9dfab5b (byte-exact; sha256 795c20c8…), saved at
// qa/verification/scratch/v92/index.v92.ts. Its ONLY completion gate is PAST_COMPLETION_CLAIM_PATTERN
// (no negation awareness); the candidate keeps that regex byte-identical and builds the belt on it.
//
// CONTRACTS (any failure exits nonzero):
//   BELT   truthRegression == 0 : no truthful answer v92 preserves may be destroyed by the candidate (§26)
//   BELT   fabRegression   == 0 : every fabrication v92's gate corrects must still be corrected
//   BELT   production shapes    : ledger #64/#65/#66 v92-regressions (D16/D25/D27/D40) stay CLOSED
//   MATCHER                     : v92 DEAD-END (safe) never becomes a candidate wrong-intent SELECT
// Corpus: qa/scenarios-runner/v92_parity_corpus.json (snapshot of the campaign corpora + production shapes).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const CAND = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const V92 = resolve(HERE, '../verification/scratch/v92/index.v92.ts');
const CORPUS = JSON.parse(readFileSync(resolve(HERE, 'v92_parity_corpus.json'), 'utf8'));
const src = readFileSync(CAND, 'utf8').replace(/\r\n/g, '\n');

// ---- v92 gate: the PCCP literal (byte-identical in candidate; asserted against the v92 file when present)
const pccpLit = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
const candPCCP = pccpLit(src); if (!candPCCP) throw new Error('v92_parity: candidate PCCP not found');
let v92src = null; if (existsSync(V92)) v92src = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');
const PCCP = new Function('return ' + candPCCP)();
const v92fires = (s) => PCCP.test(String(s));

// ---- candidate belt (own extractor: whole block LEGACY_PAST_COMPLETION .. legacyProseFallback)
function buildBelt() {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION'); const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v92_parity: belt block not found');
  const slice = src.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>').replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v92_parity: TS annotation survived — refusing');
  return new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
}
const readsAsCompletion = buildBelt();
const candFires = (s) => readsAsCompletion(String(s)) === true;

// ---- matcher (both sources), same builder as the campaign harness
function buildMatcher(text, tag) {
  const braced = (m) => { const i = text.indexOf(m); if (i < 0) throw new Error(tag + ': ' + m); let d = 0, st = false; for (let j = i; j < text.length; j++) { if (text[j] === '{') { d++; st = true; } else if (text[j] === '}') { d--; if (st && d === 0) return text.slice(i, j + 1); } } throw new Error(tag + ': unbalanced ' + m); };
  const line = (n) => { const m = text.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  const cf = text.indexOf('const commandForContradiction = matchedOption'); const cI = text.indexOf('const contradicted = !!matchedOption');
  const start = cf >= 0 ? cf : cI; const fI = text.indexOf('const field = matchedOption && !contradicted', start);
  const site = text.slice(start, fI).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); const fieldLine = text.slice(fI, text.indexOf('\n', fI));
  const detype = (s) => s.replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '').replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'), line('RESTORE_VERB_PATTERN'), braced('function resolveClarificationField('), braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function(body + `\nreturn function decide(command, options) {\n  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return 'DEAD-END';\n  ${detype(site)}\n  ${detype(fieldLine)}\n  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};`)();
}

// ---- runner
let pass = 0; const failures = [];
const check = (id, ok, detail) => { if (ok) { pass++; console.log('OK   ' + id); } else { failures.push(id + ' — ' + detail); console.log('FAIL ' + id + ' — ' + detail); } };

console.log('--- v92 identity');
check('v92.pccpByteIdenticalToDeployed', !v92src || pccpLit(v92src) === candPCCP, 'candidate PCCP differs from deployed v92 PCCP');
check('v92.referenceCopyPresent', !!v92src, 'qa/verification/scratch/v92/index.v92.ts missing — matcher parity cannot be asserted');

console.log('\n--- BELT parity over ' + CORPUS.truthful.length + ' truthful / ' + CORPUS.fabrications.length + ' fabrications');
const tReg = [], fReg = []; let tImp = 0, fImp = 0;
for (const { tag, text } of CORPUS.truthful) { const v = v92fires(text), c = candFires(text); if (!v && c) tReg.push(`[${tag}] ${text}`); else if (v && !c) tImp++; }
for (const { tag, text } of CORPUS.fabrications) { const v = v92fires(text), c = candFires(text); if (v && !c) fReg.push(`[${tag}] ${text}`); else if (!v && c) fImp++; }
check('belt.truthRegression==0', tReg.length === 0, `${tReg.length} truthful answers v92 preserves are destroyed: ${tReg.slice(0, 5).join(' | ')}`);
check('belt.fabRegression==0', fReg.length === 0, `${fReg.length} fabrications v92 corrects are shipped: ${fReg.slice(0, 8).join(' | ')}`);
console.log(`     (truth rescued vs v92: ${tImp}; extra fabrications caught vs v92: ${fImp})`);
for (const tag of ['D27-prod', 'D25-prod', 'D40-prod', 'D16-prod', 'BUG-002', 'v92diff-fix']) {
  const items = CORPUS.fabrications.filter((x) => x.tag === tag);
  const missed = items.filter((x) => !candFires(x.text));
  check(`belt.productionShapes.${tag}.allCaught(${items.length})`, missed.length === 0, missed.map((x) => x.text).slice(0, 4).join(' | '));
}

console.log('\n--- MATCHER parity (v92 DEAD-END never becomes a wrong-intent SELECT)');
if (v92src) {
  const dV = buildMatcher(v92src, 'v92'), dC = buildMatcher(src, 'cand');
  const opt = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
  const ARCH = (l) => [opt('a', l), opt('b', 'Beta Corp')]; const REST = (l) => [opt('a', l, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];
  const A = 'archiveCompanyIds', R = 'restoreCompanyIds';
  const CASES = [
    ['clean name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`], ['D127 own verb', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
    ['D116 negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'], ['D123 exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
    ['D127 different intent', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'], ['D129 name+digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
    ['D133 ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`], ['D136 ordinal-is-a-name', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], 'DEAD-END'],
    ['D138 name with verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`], ['D138 opposite outside', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
    ['D142 label is verb', 'restore', ARCH('Restore'), 'DEAD-END'], ['D148 phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'], ['D148 mirror', 'archive it', REST('Archive'), 'DEAD-END'],
    ['D150 base-verb name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`], ['D150 end-name', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
    ['D157 bring back', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
    ['D132 proto actionType', 'archive acme holdings', [opt('a', 'ACME Holdings', { actionType: 'constructor' }), opt('b', 'Beta Corp')], 'DEAD-END'],
    ['issue#5 absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, opt('b', 'Beta Corp')], 'DEAD-END'],
  ];
  const run = (d, r, o) => { try { return d(r, o); } catch (e) { return 'THROW'; } };
  for (const [name, reply, options, correct] of CASES) {
    const v = run(dV, reply, options), c = run(dC, reply, options);
    check(`matcher.candidateCorrect.${name}`, c === correct, `candidate=${c} correct=${correct} (v92=${v})`);
    check(`matcher.noRegressionVsV92.${name}`, !(v === 'DEAD-END' && c.startsWith('SELECT') && c !== correct), `v92 DEAD-ENDs but candidate SELECTs a wrong field: ${c}`);
  }
}
console.log(`\nv92_parity_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); process.exit(1); }
