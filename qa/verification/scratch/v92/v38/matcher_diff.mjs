// V38 matcher differential on MY OWN disambiguation shapes.
// Contract: a v92 DEAD-END (the safe outcome) must never become a candidate wrong-intent SELECT.
import { readSrc, CAND_PATH, V92_PATH } from './harness.mjs';
import { DISAMBIG } from './corpus.mjs';

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

const cand = buildMatcher(readSrc(CAND_PATH), 'cand');
const v92 = buildMatcher(readSrc(V92_PATH), 'v92');

const OPTIONS = [
  { id: 'c1', label: 'ACME Corp', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'Beta Corp', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
  { id: 'c4', label: 'Nothing Bundt Cakes', entityType: 'company', actionType: 'restore' },
];
// my own shapes + ordinal/name/negator-name selection forms
const SHAPES = DISAMBIG.concat([
  'the first one', 'the second one', 'option 1', 'option 2', '1', '2',
  'ACME Corp', 'Beta Corp', 'No Limits Inc', 'Nothing Bundt Cakes',
  'archive ACME Corp', 'restore Nothing Bundt Cakes', 'delete ACME Corp',
  'restore ACME Corp', 'archive Nothing Bundt Cakes', 'neither', 'none of them',
  'no', 'not that one', 'cancel', 'nothing', 'never mind',
]);

let regressions = 0, agree = 0, improved = 0;
console.log('=== V38 MATCHER DIFFERENTIAL (' + SHAPES.length + ' shapes) ===');
for (const s of SHAPES) {
  let v, c;
  try { v = v92(s, OPTIONS); } catch (e) { v = 'THROW:' + e.message; }
  try { c = cand(s, OPTIONS); } catch (e) { c = 'THROW:' + e.message; }
  const bad = v === 'DEAD-END' && c !== 'DEAD-END';
  if (bad) { regressions++; console.log(`  REGRESSION  v92=${v}  cand=${c}   ${JSON.stringify(s)}`); }
  else if (v === c) agree++;
  else { improved++; console.log(`  differs(ok)  v92=${v}  cand=${c}   ${JSON.stringify(s)}`); }
}
console.log('');
console.log(`agree: ${agree}   candidate-differs-safely: ${improved}   WRONG-INTENT REGRESSIONS: ${regressions}`);
process.exitCode = regressions ? 1 : 0;
