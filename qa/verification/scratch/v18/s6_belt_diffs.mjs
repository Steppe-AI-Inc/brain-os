// VERIFIER #18 / SCENARIO 6 — the SEVENTH consecutive change to a drift belt.
// (a) hash the COMPLETION belt block and the QUESTION belt block in each revision, so
//     "the question belt is untouched" is a byte fact, not a claim;
// (b) run both belts in BOTH directions across the SHAs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beltFor, statementAt } from './v18_belt.mjs';

const SHAS = ['CANDIDATE', '9535f0b', '52e830f', 'd724d8c'];
const path = (s) => s === 'CANDIDATE'
  ? new URL('../../../../supabase/functions/sem-ai-command/index.ts', import.meta.url)
  : new URL('./index_' + s + '.ts', import.meta.url);

function balanced(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor missing: ' + anchor);
  let d = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + anchor);
}
const h = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

console.log('=== SCENARIO 6a : belt blocks, byte identity across revisions ===');
console.log('rev'.padEnd(12) + 'questionBelt(safeQuestionFragment)'.padEnd(36) + 'completionBelt(readsAsCompletion stmt)');
const qh = {}, ch = {};
for (const s of SHAS) {
  const src = readFileSync(path(s), 'utf8');
  const q = balanced(src, 'const safeQuestionFragment =');
  const i = src.indexOf('const readsAsCompletion =');
  const c = src.slice(i, src.indexOf(';', src.indexOf('CONFIRMED_COMPLETION.test(c)', i)) + 1);
  qh[s] = h(q); ch[s] = h(c);
  console.log(s.padEnd(12) + qh[s].padEnd(36) + ch[s]);
}
console.log('\nquestion belt identical CANDIDATE vs 9535f0b : ' + (qh.CANDIDATE === qh['9535f0b']));
console.log('question belt identical CANDIDATE vs 52e830f : ' + (qh.CANDIDATE === qh['52e830f']));
console.log('question belt identical CANDIDATE vs d724d8c : ' + (qh.CANDIDATE === qh.d724d8c));
console.log('completion belt identical CANDIDATE vs 9535f0b: ' + (ch.CANDIDATE === ch['9535f0b']));

// ---- 6b: both directions of the QUESTION belt, driven, across revisions --------------
// The question belt is a different predicate; execute it rather than trusting the hash.
function questionBelt(sha) {
  const src = readFileSync(path(sha), 'utf8');
  const pieces = [];
  for (const a of ['const UUID_IN_TEXT =', 'const KNOWN_ABBREVIATION =', 'const COMPLETION_WORD =',
    'const PAST_COMPLETION_CLAIM_PATTERN =', 'const FUTURE_PROMISE_IN_QUESTION =',
    'const INTERROGATIVE_LEAD =', 'const FIRST_PERSON_MAIN_CLAUSE_COMPLETION =']) {
    pieces.push(statementAt(src, a));
  }
  const fn = balanced(src, 'const safeQuestionFragment =')
    .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>');
  const body = pieces.join('\n') + '\n' + fn + ';\nreturn safeQuestionFragment;';
  if (/:\s*(string|unknown|boolean)/.test(body.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))) {
    throw new Error('TypeScript survived the question-belt slice');
  }
  return new Function(body)();
}
console.log('\n=== SCENARIO 6b : the QUESTION belt, driven, both directions ===');
const QCASES = [
  ['Should I archive ACME?', 'legitimate question — must SURVIVE'],
  ['Would you like me to restore Bob Smith?', 'legitimate question — must SURVIVE'],
  ['I archived ACME. Should I also archive Beta Corp?', 'fabrication + question — the completion half must be dropped'],
  ['ACME was archived. Do you want me to continue?', 'fabrication + question'],
  ['No company was archived. Should I archive ACME?', 'TRUTHFUL negative + question — must SURVIVE'],
  ['Nothing was deleted. Would you like me to delete it?', 'TRUTHFUL negative + question — must SURVIVE'],
  ["I'll archive ACME now. Ok?", 'future promise inside a question — must be dropped'],
  ['The archived list was not updated. Should I update it?', 'the A-class shape, in a question'],
];
const qb = Object.fromEntries(SHAS.map((s) => { try { return [s, questionBelt(s)]; } catch (e) { console.log('  build failed for ' + s + ': ' + e.message); return [s, null]; } }));
let qDiffs = 0;
for (const [q, why] of QCASES) {
  const outs = SHAS.map((s) => { if (!qb[s]) return '<n/a>'; try { return JSON.stringify(qb[s](q)); } catch (e) { return 'THREW'; } });
  const same = outs.every((o) => o === outs[0]);
  if (!same) qDiffs++;
  console.log(JSON.stringify(q));
  console.log('    -> ' + outs[0] + (same ? '   [IDENTICAL on all 4 revisions]' : '   [DIVERGES: ' + outs.join(' | ') + ']'));
  console.log('    // ' + why);
}
console.log('\nquestion-belt behavioural divergences across the 4 revisions: ' + qDiffs + ' of ' + QCASES.length);
