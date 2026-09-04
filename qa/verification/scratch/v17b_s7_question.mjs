// VERIFIER #17 / SCENARIO 7 — the QUESTION belt must be UNTOUCHED. Proven two ways:
// (1) byte-identical extraction of every question-belt construct across 52e830f -> candidate;
// (2) behavioural A/B over a question corpus through the REAL safeQuestionFragment.
import { readSrc, balancedFrom, statementFrom, ts2js } from './v17b_lib.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = readSrc();
const V52 = readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8');
const D7 = readFileSync('qa/verification/scratch/v17b_idx_d724d8c.ts', 'utf8');
const h = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const CONSTRUCTS = [
  ['safeQuestionFragment', (s) => balancedFrom(s, 'const safeQuestionFragment =')],
  ['INTERROGATIVE_LEAD', (s) => statementFrom(s, 'const INTERROGATIVE_LEAD =')],
  ['FIRST_PERSON_MAIN_CLAUSE_COMPLETION', (s) => statementFrom(s, 'const FIRST_PERSON_MAIN_CLAUSE_COMPLETION =')],
  ['COMPLETION_WORD', (s) => statementFrom(s, 'const COMPLETION_WORD =')],
  ['safeProseFragment', (s) => balancedFrom(s, 'const safeProseFragment =')],
  ['safeOptionLabel', (s) => balancedFrom(s, 'const safeOptionLabel =')],
  ['safeDisplayLabel', (s) => balancedFrom(s, 'const safeDisplayLabel =')],
  ['PAST_COMPLETION_CLAIM_PATTERN', (s) => statementFrom(s, 'const PAST_COMPLETION_CLAIM_PATTERN =')],
  ['safePendingSummary', (s) => balancedFrom(s, 'const safePendingSummary =')],
];
console.log('construct'.padEnd(38) + 'candidate'.padEnd(18) + '52e830f'.padEnd(18) + 'd724d8c');
let drift = 0;
for (const [name, f] of CONSTRUCTS) {
  let a, b, c;
  try { a = h(f(NOW)); } catch (e) { a = 'ABSENT'; }
  try { b = h(f(V52)); } catch (e) { b = 'ABSENT'; }
  try { c = h(f(D7)); } catch (e) { c = 'ABSENT'; }
  const flag = a === b ? '' : '   <-- CHANGED vs 52e830f';
  if (a !== b) drift++;
  console.log(name.padEnd(38) + a.padEnd(18) + b.padEnd(18) + c + flag);
}
console.log('\nconstructs changed vs 52e830f: ' + drift);

// behavioural A/B on the question belt
function buildQ(src) {
  const body = ts2js([
    statementFrom(src, 'const UUID_IN_TEXT ='),
    statementFrom(src, 'const PAST_COMPLETION_CLAIM_PATTERN ='),
    statementFrom(src, 'const COMPLETION_WORD ='),
    statementFrom(src, 'const INTERROGATIVE_LEAD ='),
    statementFrom(src, 'const FUTURE_PROMISE_IN_QUESTION ='),
    statementFrom(src, 'const FIRST_PERSON_MAIN_CLAUSE_COMPLETION ='),
    balancedFrom(src, 'const safeProseFragment ='),
    balancedFrom(src, 'const safeQuestionFragment ='),
  ].join('\n'));
  return new Function(body + '\nreturn safeQuestionFragment;')();
}
const qNow = buildQ(NOW), q52 = buildQ(V52), q7 = buildQ(D7);
const QUESTIONS = [
  'Which company should I archive?', 'Did you mean ACME or ACME Holdings?',
  'Should I archive ACME?', 'Whose employment should I end?',
  'I archived ACME. Anything else?', 'ACME has been archived. Shall I continue?',
  'Do you want me to restore Bob Smith?', 'Which of these was archived?',
  'Should I archive Salt and Pepper Co?', 'Was ACME archived?',
  'Confirm the archived company?', 'Which archived company should I restore?',
  'Do you mean the Bed Bath and Beyond record?', 'Shall I proceed without approval?',
  'Which one — Acme or Beta?', 'Is the company archived?',
];
let qdrift = 0;
console.log('\nquestion'.padEnd(52) + 'candidate -> 52e830f -> d724d8c');
for (const q of QUESTIONS) {
  const a = qNow(q), b = q52(q), c = q7(q);
  if (JSON.stringify(a) !== JSON.stringify(b)) qdrift++;
  console.log(JSON.stringify(q).padEnd(52) + JSON.stringify(a) + '  |  ' + JSON.stringify(b) + '  |  ' + JSON.stringify(c)
    + (JSON.stringify(a) !== JSON.stringify(b) ? '   <-- DRIFT' : ''));
}
console.log('\nquestion-belt behavioural drift vs 52e830f: ' + qdrift + ' / ' + QUESTIONS.length);
