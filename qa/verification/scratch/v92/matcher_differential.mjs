#!/usr/bin/env node
// CANDIDATE-vs-DEPLOYED-v92 MATCHER DIFFERENTIAL (disambiguation resolution branch).
// Builds decide(command, options) from EACH source's real matchDisambiguationOption /
// commandContradictsActionType / resolveClarificationField + its contradiction site, then runs a
// shared corpus. For every case: v92 verdict, candidate verdict, and the CORRECT verdict.
// Deploy-relevant regression = v92 DEAD-ENDs (safe) and candidate SELECTs a WRONG-intent field.
import { readFileSync } from 'node:fs';
const CAND = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const V92 = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/index.v92.ts';

function build(path, tag) {
  const src = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const braced = (marker) => { const i = src.indexOf(marker); if (i < 0) throw new Error(tag + ': not found ' + marker); let d = 0, st = false; for (let j = i; j < src.length; j++) { if (src[j] === '{') { d++; st = true; } else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); } } throw new Error(tag + ': unbalanced ' + marker); };
  const line = (n) => { const m = src.match(new RegExp('^const ' + n + ' = (.+);$', 'm')); if (!m) throw new Error(tag + ': const ' + n); return `const ${n} = ${m[1]};`; };
  // contradiction site: from the first of (commandForContradiction | contradicted) to just before `const field =`
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
// [name, reply, options, CORRECT verdict]
const CASES = [
  ['clean name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['D127 own-family verb', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['D116 negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'],
  ['D123 exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['D123 adjacent negator', 'acme holdings? no, the other one', ARCH('ACME Holdings'), 'DEAD-END'],
  ['D127 different intent', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['D127 different target', 'archive acme holdings tasks', ARCH('ACME Holdings'), 'DEAD-END'],
  ['D129 name+digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
  ['D133 ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['D133 bare digit', '2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['D136 ordinal-is-a-name', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], 'DEAD-END'],
  ['D138 name containing verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
  ['D138 opposite verb outside name', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
  ['D142 label IS verb', 'restore', ARCH('Restore'), 'DEAD-END'],
  ['D148 phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'],
  ['D148 phrasing 2', 'please restore', ARCH('Restore'), 'DEAD-END'],
  ['D148 mirror', 'archive it', REST('Archive'), 'DEAD-END'],
  ['D150 base-verb name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
  ['D150 end-name', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
  ['D157 bring back', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
  ['D132 proto actionType', 'archive acme holdings', [opt('a', 'ACME Holdings', { actionType: 'constructor' }), opt('b', 'Beta Corp')], 'DEAD-END'],
  ['issue#5 absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, opt('b', 'Beta Corp')], 'DEAD-END'],
];
const run = (d, r, o) => { try { return d(r, o); } catch (e) { return 'THROW:' + (e && e.constructor ? e.constructor.name : '?'); } };
let regress = 0, improve = 0, same = 0, candWrong = 0;
console.log('case                              | v92            | candidate           | correct             | note');
for (const [name, reply, options, correct] of CASES) {
  const v = run(dV, reply, options), c = run(dC, reply, options);
  const cOk = c === correct, vOk = v === correct;
  let note = '';
  if (v === c) { same++; note = cOk ? 'same, correct' : 'same, BOTH WRONG'; }
  else if (cOk && !vOk) { improve++; note = 'IMPROVEMENT (v92 wrong)'; }
  else if (!cOk && vOk) { regress++; note = '*** REGRESSION (candidate wrong)'; }
  else note = 'differ, neither correct';
  if (!cOk) candWrong++;
  console.log(`${name.padEnd(33)} | ${String(v).padEnd(14)} | ${String(c).padEnd(19)} | ${correct.padEnd(19)} | ${note}`);
}
console.log(`\nSUMMARY: candidate-wrong=${candWrong} regressions-vs-v92=${regress} improvements-over-v92=${improve} same=${same} of ${CASES.length}`);
