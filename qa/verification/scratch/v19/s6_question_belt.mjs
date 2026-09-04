// SCENARIO 6 — the QUESTION belt must be untouched: byte fact + behaviour, across revisions.
import { statement, detype, loadFile, INDEX_PATH, sha256 } from './x.mjs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const REVS = { candidate: loadFile(fileURLToPath(INDEX_PATH)) };
for (const r of ['fbafded', 'a559f8f', '9535f0b', '52e830f', 'd724d8c'])
  REVS[r] = loadFile(new URL('./index_' + r + '.ts', import.meta.url).pathname.replace(/^\//, ''));

// The question belt: safeQuestionFragment + the two patterns it consults.
const MARKERS = ['const UUID_IN_TEXT', 'const KNOWN_ABBREVIATION', 'const PAST_COMPLETION_CLAIM_PATTERN', 'const safeProseFragment', 'const FUTURE_PROMISE_IN_QUESTION',
  'const safeQuestionFragment', 'const COMPLETION_WORD'];
const built = {};
for (const [rev, src] of Object.entries(REVS)) {
  const parts = MARKERS.map((m) => statement(src, m));
  const norm = parts.join('\n').replace(/\r\n/g, '\n');
  const h = crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
  const body = detype(norm);
  const fn = new Function(body + '\nreturn safeQuestionFragment;')();
  built[rev] = { h, fn, len: norm.length };
  console.log(rev.padEnd(11) + ' sha16=' + h + '  bytes=' + norm.length);
}
const hashes = new Set(Object.values(built).map((b) => b.h));
console.log('\nBYTE FACT: ' + (hashes.size === 1 ? 'IDENTICAL across all ' + Object.keys(built).length + ' revisions' : 'DIVERGES (' + hashes.size + ' distinct)'));

const CORPUS = [
  'Should I archive ACME?',
  'Which company did you mean?',
  'Do you want me to restore Bob Smith?',
  "I'll archive ACME — shall I proceed?",
  'I will delete the task, ok?',
  'Did you want the archived list?',
  'Confirm?',
  '',
  'Should I archive ACME? I have already archived it.',
  'Is ACME archived?',
  'Which one — Salt and Pepper Co or Beta Corp?',
  'Shall I go ahead and remove the person from the roster?',
];
console.log('\nBEHAVIOUR (safeQuestionFragment):');
let div = 0;
for (const q of CORPUS) {
  const outs = Object.entries(built).map(([r, b]) => { let v; try { v = JSON.stringify(b.fn(q)); } catch (e) { v = 'THREW'; } return [r, v]; });
  const distinct = new Set(outs.map((o) => o[1]));
  if (distinct.size > 1) { div++; console.log('  DIVERGENCE ' + JSON.stringify(q)); for (const [r, v] of outs) console.log('     ' + r.padEnd(11) + v); }
  else console.log('  same across revisions: ' + JSON.stringify(q) + ' -> ' + outs[0][1]);
}
console.log('\nbehavioural divergences across revisions: ' + div + ' / ' + CORPUS.length);
