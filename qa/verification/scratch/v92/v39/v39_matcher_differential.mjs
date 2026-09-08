// VERIFIER #39 — matcher differential over 30 disambiguation shapes of my own.
// Contract: a v92 DEAD-END (safe: falls through to the LLM path) must never become a
// candidate SELECT of the WRONG field/id. A v92 SELECT that is CORRECT must not be lost.
import { readSrc, CAND_PATH, V92_PATH } from './belt39.mjs';

function buildMatcher(text, tag) {
  const braced = (m) => { const i = text.indexOf(m); if (i < 0) throw new Error(tag + ': ' + m); let d = 0, st = false; for (let j = i; j < text.length; j++) { if (text[j] === '{') { d++; st = true; } else if (text[j] === '}') { d--; if (st && d === 0) return text.slice(i, j + 1); } } throw new Error(tag + ': unbalanced ' + m); };
  const line = (n) => { const m = text.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  const cf = text.indexOf('const commandForContradiction = matchedOption'); const cI = text.indexOf('const contradicted = !!matchedOption');
  const start = cf >= 0 ? cf : cI; const fI = text.indexOf('const field = matchedOption && !contradicted', start);
  const site = text.slice(start, fI).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const fieldLine = text.slice(fI, text.indexOf('\n', fI));
  const detype = (s) => s.replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '')
    .replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'), line('RESTORE_VERB_PATTERN'),
    braced('function resolveClarificationField('), braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function(body + `\nreturn function decide(command, options) {\n  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return 'DEAD-END';\n  ${detype(site)}\n  ${detype(fieldLine)}\n  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};`)();
}

const dC = buildMatcher(readSrc(CAND_PATH), 'cand');
const dV = buildMatcher(readSrc(V92_PATH), 'v92');
const A = 'archiveCompanyIds', R = 'restoreCompanyIds';
const o = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
const ARCH = (l, l2 = 'Beta Corp') => [o('a', l), o('b', l2)];
const REST = (l, l2 = 'Beta Corp') => [o('a', l, { actionType: 'restore' }), o('b', l2, { actionType: 'restore' })];

// 30 shapes. `correct` is MY judgment of the right answer, argued case by case.
const CASES = [
  ['plain name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['plain name, second option', 'beta corp', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['own verb + name', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['opposite verb + name', 'restore acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['unrelated verb + name', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'],
  ['negated mention 2', 'do not archive acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion 2', 'all but acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['name plus digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
  ['ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['ordinal word', 'the second one', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['ordinal is itself a name', 'option 2', [o('x', 'Option 2 Ltd'), o('y', 'Beta Corp')], 'DEAD-END'],
  ['name contains a verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
  ['name contains a verb + opposite verb outside', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
  ['label IS a bare verb', 'restore', ARCH('Restore'), 'DEAD-END'],
  ['label IS a bare verb, pronoun form', 'restore it', ARCH('Restore'), 'DEAD-END'],
  ['mirror: archive it against restore options', 'archive it', REST('Archive'), 'DEAD-END'],
  ['base-verb-leading real name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
  ['end-word name under restore', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
  ['idiom label', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
  ['prototype-polluting actionType', 'archive acme holdings', [o('a', 'ACME Holdings', { actionType: 'constructor' }), o('b', 'Beta Corp')], 'DEAD-END'],
  ['absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, o('b', 'Beta Corp')], 'DEAD-END'],
  ['absent entityType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', actionType: 'archive' }, o('b', 'Beta Corp')], 'DEAD-END'],
  ['empty label', 'acme holdings', [o('a', ''), o('b', 'ACME Holdings')], `SELECT:${A}:b`],
  ['ambiguous: both labels mentioned', 'acme holdings and beta corp', ARCH('ACME Holdings'), 'DEAD-END'],
  ['negator-token name', 'no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-token name with own verb', 'archive no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-token name negated', "don't archive no limits inc", ARCH('No Limits Inc'), 'DEAD-END'],
  ['name is a substring of the other', 'acme', [o('a', 'ACME'), o('b', 'ACME Holdings')], `SELECT:${A}:a`],
];

const run = (d, r, opts) => { try { return d(r, opts); } catch (e) { return 'THROW:' + e.message.slice(0, 40); } };
let ok = 0; const wrong = [], regressed = [], lost = [];
for (const [name, reply, options, correct] of CASES) {
  const v = run(dV, reply, options), c = run(dC, reply, options);
  if (c === correct) ok++; else wrong.push(`${name}: candidate=${c} expected=${correct} (v92=${v})`);
  if (v === 'DEAD-END' && c.startsWith('SELECT') && c !== correct) regressed.push(`${name}: v92 DEAD-END -> candidate ${c}`);
  if (v.startsWith('SELECT') && v === correct && c !== correct) lost.push(`${name}: v92 was correct (${v}), candidate=${c}`);
}
console.log('MATCHER: ' + CASES.length + ' shapes; candidate correct on ' + ok);
console.log('  v92-DEAD-END -> wrong candidate SELECT : ' + regressed.length);
console.log('  correct v92 SELECT lost by candidate   : ' + lost.length);
if (wrong.length) { console.log('\nCANDIDATE DISAGREES WITH MY EXPECTATION:'); wrong.forEach((w) => console.log('  - ' + w)); }
if (regressed.length) { console.log('\nSAFETY REGRESSIONS:'); regressed.forEach((w) => console.log('  ! ' + w)); }
if (lost.length) { console.log('\nLOST CORRECT SELECTS:'); lost.forEach((w) => console.log('  ! ' + w)); }
process.exit(regressed.length + lost.length ? 1 : 0);
