// v43 PREPARED FIX F (scratch only), stacked on D3+E.
//
// V43-D5: the entity-name rescue is applied to the WHOLE REPLY but keyed on a PREFIX match, so a
// fabrication that rides along with a known name is excused wholesale. Measured: 4 of 4 engineered
// rows are excused only when the set is populated — a fabrication surface that exists ONLY in
// production, where the set is never empty, and that no suite measured (see V43-D4: the one suite
// that populates the set has four vacuous assertions).
//
// The rescue is narrowed to the span it was reasoning about: it may excuse the reply only when the
// text AFTER the matched "<Participle> <Name>" phrase carries no other completion participle and
// does not continue the object list with a coordinator + a further proper name.
import { readFileSync, writeFileSync } from 'node:fs';
const SRC_PATH = process.argv[2];
const OUT = process.argv[3];
const src = readFileSync(SRC_PATH, 'utf8');

const HEAD = '((__p) => __p !== null && knownEntityNames.has(__p.toLowerCase()))((String(s).match(';
const TAIL = ') || [])[1] || null)';
const i = src.indexOf(HEAD);
if (i < 0) throw new Error('v43 fixF: head anchor not found');
const j = src.indexOf(TAIL, i);
if (j < 0) throw new Error('v43 fixF: tail anchor not found');
const RE = src.slice(i + HEAD.length, j);           // the capture regex literal, untouched
if (src.indexOf(HEAD, i + 1) >= 0) throw new Error('v43 fixF: head anchor is not unique');

const NEW = '((__m) => __m !== null && knownEntityNames.has(String(__m[1]).toLowerCase())'
  + ' && !COMPLETION_PARTICIPLE.test(String(s).slice(__m.index + __m[0].length))'
  + " && !/^\\s*(?:and|plus|,)\\s+[A-Z]/.test(String(s).slice(__m.index + __m[0].length)))"
  + '(String(s).match(' + RE + '))';

writeFileSync(OUT, src.slice(0, i) + NEW + src.slice(j + TAIL.length));
console.log('v43 fixF written to ' + OUT);
