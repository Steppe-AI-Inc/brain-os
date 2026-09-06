// VERIFIER #36 — matcher differential (disambiguation resolution branch), own harness and cases.
// Builds decide(command, options) from EACH source's real matchDisambiguationOption /
// commandContradictsActionType / resolveClarificationField + the contradiction site.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const CAND = process.env.SEM_INDEX_SRC || join(HERE, '..', '..', '..', '..', 'supabase/functions/sem-ai-command/index.ts');
const V92 = join(HERE, 'hist/c9dfab5bd433/index.ts');

function build(path, tag) {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const braced = (marker) => { const i = src.indexOf(marker); if (i < 0) throw new Error(tag + ': not found ' + marker); let d = 0, st = false; for (let j = i; j < src.length; j++) { if (src[j] === '{') { d++; st = true; } else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); } } throw new Error(tag + ': unbalanced ' + marker); };
  const line = (n) => { const m = src.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  const cfIdx = src.indexOf('const commandForContradiction = matchedOption');
  const cIdx = src.indexOf('const contradicted = !!matchedOption');
  const start = cfIdx >= 0 ? cfIdx : cIdx;
  const fieldIdx = src.indexOf('const field = matchedOption && !contradicted', start);
  if (start < 0 || fieldIdx < 0) throw new Error(tag + ': contradiction site');
  const site = src.slice(start, fieldIdx).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const fieldLine = src.slice(fieldIdx, src.indexOf('\n', fieldIdx));
  const detype = (s) => s
    .replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '')
    .replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'), line('RESTORE_VERB_PATTERN'),
    braced('function resolveClarificationField('), braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function(body + `\nreturn function decide(command, options) {\n  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return 'DEAD-END';\n  ${detype(site)}\n  ${detype(fieldLine)}\n  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};`)();
}
const dV = build(V92, 'v92'), dC = build(CAND, 'cand');
const opt = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
const ARCH = (l) => [opt('a', l), opt('b', 'Beta Corp')];
const REST = (l) => [opt('a', l, { actionType: 'restore' }), opt('b', 'Beta Corp', { actionType: 'restore' })];
const A = 'archiveCompanyIds', R = 'restoreCompanyIds';
const CASES = [
  ['clean name', 'clix gps', ARCH('CLIX GPS'), `SELECT:${A}:a`],
  ['clean name, quoted label', 'advanced closed systems', ARCH('“Advanced Closed Systems”'), `SELECT:${A}:a`],
  ['own-family verb', 'archive clix gps', ARCH('CLIX GPS'), `SELECT:${A}:a`],
  ['own-family verb + filler', 'yes please archive clix gps', ARCH('CLIX GPS'), `SELECT:${A}:a`],
  ['negated mention', "don't archive clix gps", ARCH('CLIX GPS'), 'DEAD-END'],
  ['negated mention, no apostrophe', 'dont archive clix gps', ARCH('CLIX GPS'), 'DEAD-END'],
  ['exclusion', 'anything except clix gps', ARCH('CLIX GPS'), 'DEAD-END'],
  ['exclusion 2', 'not clix gps, the other one', ARCH('CLIX GPS'), 'DEAD-END'],
  ['adjacent negator', 'clix gps? no, the other one', ARCH('CLIX GPS'), 'DEAD-END'],
  ['trailing no', 'clix gps, no', ARCH('CLIX GPS'), 'DEAD-END'],
  ['different intent', 'activate clix gps', ARCH('CLIX GPS'), 'DEAD-END'],
  ['different target', 'archive clix gps tasks', ARCH('CLIX GPS'), 'DEAD-END'],
  ['name+digit', 'clix gps 2', ARCH('CLIX GPS'), 'DEAD-END'],
  ['ordinal', 'option 2', ARCH('CLIX GPS'), `SELECT:${A}:b`],
  ['bare digit', '2', ARCH('CLIX GPS'), `SELECT:${A}:b`],
  ['ordinal word', 'the second one', ARCH('CLIX GPS'), `SELECT:${A}:b`],
  ['ordinal out of range', 'option 3', ARCH('CLIX GPS'), 'DEAD-END'],
  ['negated ordinal', 'no option 2', ARCH('CLIX GPS'), 'DEAD-END'],
  ['ordinal-is-a-name', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], 'DEAD-END'],
  ['name containing verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
  ['opposite verb outside name', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
  ['label IS verb', 'restore', ARCH('Restore'), 'DEAD-END'],
  ['label IS verb phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'],
  ['label IS verb phrasing 2', 'please restore', ARCH('Restore'), 'DEAD-END'],
  ['mirror', 'archive it', REST('Archive'), 'DEAD-END'],
  ['base-verb name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
  ['end-name', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
  ['bring back', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
  ['proto actionType', 'archive clix gps', [opt('a', 'CLIX GPS', { actionType: 'constructor' }), opt('b', 'Beta Corp')], 'DEAD-END'],
  ['proto entityType', 'clix gps', [opt('a', 'CLIX GPS', { entityType: '__proto__' }), opt('b', 'Beta Corp')], 'DEAD-END'],
  ['absent actionType', 'clix gps', [{ id: 'a', label: 'CLIX GPS', entityType: 'company' }, opt('b', 'Beta Corp')], 'DEAD-END'],
  ['two names mentioned', 'archive clix gps, leave beta corp alone', ARCH('CLIX GPS'), 'DEAD-END'],
  ['apostrophe pair exact', "bob's co", [opt('a', "Bob's Co"), opt('b', 'Bobs Co')], `SELECT:${A}:a`],
  ['apostrophe pair other', 'bobs co', [opt('a', "Bob's Co"), opt('b', 'Bobs Co')], `SELECT:${A}:b`],
  ['substring label mis-bind', 'smiths bakery', [opt('a', 'Smith'), opt('b', "Smith's Bakery")], `SELECT:${A}:b`],
  ['negator-name selection', 'no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-name + own verb', 'archive no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-name excluded', 'not no limits inc', ARCH('No Limits Inc'), 'DEAD-END'],
  ['empty reply', '', ARCH('CLIX GPS'), 'DEAD-END'],
  ['hedge', 'maybe clix gps', ARCH('CLIX GPS'), 'DEAD-END'],
];
const run = (d, r, o) => { try { return d(r, o); } catch (e) { return 'THROW:' + (e && e.constructor ? e.constructor.name : '?'); } };
let regress = 0, improve = 0, same = 0, candWrong = 0;
for (const [name, reply, options, correct] of CASES) {
  const v = run(dV, reply, options), c = run(dC, reply, options);
  const cOk = c === correct, vOk = v === correct;
  let note = '';
  if (v === c) { same++; note = cOk ? 'same, correct' : 'same, BOTH WRONG'; }
  else if (cOk && !vOk) { improve++; note = 'IMPROVEMENT (v92 wrong)'; }
  else if (!cOk && vOk) { regress++; note = '*** REGRESSION (candidate wrong)'; }
  else note = 'differ, neither correct';
  if (!cOk) candWrong++;
  console.log(`${name.padEnd(30)} | ${String(v).padEnd(24)} | ${String(c).padEnd(24)} | ${note}`);
}
console.log(`\nMATCHER: ${CASES.length} shapes; candidate-wrong=${candWrong} regressions-vs-v92=${regress} improvements-over-v92=${improve} same=${same}`);
process.exit(regress ? 1 : 0);
