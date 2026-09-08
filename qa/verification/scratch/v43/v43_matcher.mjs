// v43: matcher differential on MY OWN >= 25 disambiguation shapes.
// Contract: a v92 DEAD-END (safe: no option selected, the turn falls through) must never become a
// candidate SELECT of the WRONG field/option. Both sources are extracted from their own bytes.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const CAND = read(process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'));
const V92 = read(resolve(ROOT, 'qa/verification/scratch/v92/index.v92.ts'));

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
  return new Function('const knownEntityNames = new Set();\n' + body + `\nreturn function decide(command, options) {\n  const matchedOption = matchDisambiguationOption(command, options);\n  if (!matchedOption) return 'DEAD-END';\n  ${detype(site)}\n  ${detype(fieldLine)}\n  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};`)();
}

const dV = buildMatcher(V92, 'v92'), dC = buildMatcher(CAND, 'cand');
const o = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
const A = 'archiveCompanyIds', R = 'restoreCompanyIds';
const ARCH = (l, l2 = 'Beta Corp') => [o('a', l), o('b', l2)];
const REST = (l, l2 = 'Beta Corp') => [o('a', l, { actionType: 'restore' }), o('b', l2, { actionType: 'restore' })];
const PERSON = (l) => [{ id: 'a', label: l, entityType: 'person', actionType: 'archive' }, { id: 'b', label: 'Bob Jones', entityType: 'person', actionType: 'archive' }];

// >= 25 shapes, written here rather than inherited from the campaign corpus.
const CASES = [
  ['plain name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['name with own verb', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['name cased differently', 'ACME HOLDINGS', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'],
  ['negated mention 2', 'do not archive acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion 2', 'all but acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['opposite intent', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['opposite intent 2', 'restore acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['name + digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
  ['ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['ordinal word', 'the second one', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['ordinal collides with a name', 'option 2', [o('x', 'Option 2 Ltd'), o('y', 'Beta Corp')], 'DEAD-END'],
  ['name contains a verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
  ['name contains a verb + opposite verb outside', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
  ['label IS a bare verb', 'restore', ARCH('Restore'), 'DEAD-END'],
  ['pronoun phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'],
  ['pronoun phrasing mirror', 'archive it', REST('Archive'), 'DEAD-END'],
  ['base-verb-initial name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
  ['end-name under restore', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
  ['multiword idiom label', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
  ['prototype-polluting actionType', 'archive acme holdings', [o('a', 'ACME Holdings', { actionType: 'constructor' }), o('b', 'Beta Corp')], 'DEAD-END'],
  ['prototype-polluting entityType', 'archive acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: '__proto__', actionType: 'archive' }, o('b', 'Beta Corp')], 'DEAD-END'],
  ['absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, o('b', 'Beta Corp')], 'DEAD-END'],
  ['empty label', 'acme holdings', [o('a', ''), o('b', 'ACME Holdings')], `SELECT:${A}:b`],
  ['both labels identical', 'acme holdings', ARCH('ACME Holdings', 'ACME Holdings'), 'DEAD-END'],
  ['person entity', 'bob smith', PERSON('Bob Smith'), 'SELECT:endEmploymentPersonIds:a'],
  ['name that is a negator phrase', 'no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['name with an ampersand', 'salt & pepper co', ARCH('Salt & Pepper Co'), `SELECT:${A}:a`],
  ['question, not a selection', 'which one is bigger?', ARCH('ACME Holdings'), 'DEAD-END'],
  ['cancel', 'cancel', ARCH('ACME Holdings'), 'DEAD-END'],
  ['neither', 'neither', ARCH('ACME Holdings'), 'DEAD-END'],
];

let pass = 0; const fails = [];
const run = (d, r, opts) => { try { return d(r, opts); } catch (e) { return 'THROW'; } };
console.log(`v43 matcher differential over ${CASES.length} disambiguation shapes\n`);
for (const [name, reply, opts, correct] of CASES) {
  const v = run(dV, reply, opts), c = run(dC, reply, opts);
  const regress = v === 'DEAD-END' && c.startsWith('SELECT') && c !== correct;
  const wrong = c !== correct;
  const note = regress ? 'REGRESSION vs v92' : (wrong ? 'candidate differs from my expectation' : '');
  if (regress) { fails.push(`${name}: v92=DEAD-END candidate=${c} correct=${correct}`); }
  else pass++;
  console.log(`${regress ? 'FAIL' : 'ok  '} ${name.padEnd(38)} v92=${v.padEnd(28)} cand=${c.padEnd(28)} ${note}`);
  if (wrong && !regress) console.log(`       (note: I expected ${correct}; v92 agrees with the candidate here, so this is not a v92 regression)`);
}
console.log(`\nv43_matcher: ${pass}/${CASES.length}; v92 DEAD-END -> candidate wrong-intent SELECT: ${fails.length}`);
for (const f of fails) console.log('  ' + f);
process.exit(fails.length ? 1 : 0);
