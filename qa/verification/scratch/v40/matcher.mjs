// VERIFIER #40 — matchDisambiguationOption differential, candidate vs deployed v92.
import fs from 'node:fs';
import { readSrc, candidatePath, v92Path } from './v40_belt.mjs';

const PREV = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function scanFn(src, start) {
  let i = start; let depth = 0; let prev = ''; let saw = false;
  while (i < src.length) {
    const c = src[i]; const two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; } i = j + 1; prev = c; continue; }
    if (c === '/' && (prev === '' || PREV.has(prev))) {
      let j = i + 1; let inC = false;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') inC = true; else if (src[j] === ']') inC = false; else if (src[j] === '/' && !inC) break; else if (src[j] === '\n') break; j++; }
      j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++; i = j; prev = '/'; continue;
    }
    if (c === '(' || c === '[' || c === '{') { if (c === '{' && depth === 0) saw = true; depth++; }
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0 && c === '}' && saw) return i + 1; }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('unterminated function');
}

function buildMatcher(p) {
  const src = readSrc(p);
  const m = /(^|\n)function\s+matchDisambiguationOption\s*\(/.exec(src);
  if (!m) throw new Error('matcher not found in ' + p);
  const start = src.indexOf('function', m.index);
  let fn = src.slice(start, scanFn(src, start));
  fn = fn
    .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/, '(command, options)')
    .replace(/\(s: string\)/g, '(s)')
    .replace(/: Record<string, string>/g, '')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)');
  // eslint-disable-next-line no-new-func
  return new Function(fn + '\nreturn matchDisambiguationOption;')();
}

const cand = buildMatcher(candidatePath());
const v92 = buildMatcher(v92Path());

const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const A = opt('id-acme', 'ACME Holdings');
const B = opt('id-acmelog', 'ACME Logistics');
const S = opt('id-smith', 'Smith');
const SB = opt('id-smithsbakery', "Smith's Bakery");
const Q = opt('id-quoted', '“Advanced Closed Systems”');
const O1 = opt('id-o1', 'Beta Corp (option 1)');
const O2 = opt('id-o2', 'Gamma Ltd (option 2)');
const OPT2NAME = opt('id-option2ltd', 'Option 2 Ltd');
const NL = opt('id-nolimits', 'No Limits Inc');
const NB = opt('id-nbc', 'Nothing Bundt Cakes');
const PERSON = opt('id-bob', 'Bob Smith', 'person', 'archive');
const RESTORE = opt('id-restore', 'ACME Holdings', 'company', 'restore');

// [name, command, options, expected-semantics]
const SHAPES = [
  ['exact single label', 'ACME Holdings', [A, B], 'bind A'],
  ['case-insensitive', 'acme holdings', [A, B], 'bind A'],
  ['substring of two labels => ambiguous', 'acme', [A, B], 'dead-end'],
  ['unrelated reply', 'the blue one', [A, B], 'dead-end'],
  ['empty reply', '   ', [A, B], 'dead-end'],
  ['NEGATED mention (D116)', "don't archive acme holdings", [A, B], 'dead-end'],
  ['exclusion word (D123)', 'exclude acme holdings', [A, B], 'dead-end'],
  ['adjacent-clause negator', 'acme holdings, no', [A, B], 'dead-end'],
  ['correction shape', 'not acme holdings, the other one', [A, B], 'dead-end'],
  ['except form', 'anything except acme holdings', [A, B], 'dead-end'],
  ['affirmative filler + name', 'yes, acme holdings please', [A, B], 'bind A'],
  ['own action verb + name', 'archive acme holdings', [A, B], 'bind A'],
  ['WRONG action verb + name (D127)', 'activate acme holdings', [A, B], 'dead-end'],
  ['different target noun (D127)', 'archive acme holdings tasks', [A, B], 'dead-end'],
  ['restore option + restore verb', 'restore acme holdings', [RESTORE, B], 'bind RESTORE'],
  ['restore option + archive verb', 'archive acme holdings', [RESTORE, B], 'dead-end'],
  ['ordinal "option 2" (D133)', 'option 2', [A, B], 'bind B'],
  ['bare "2"', '2', [A, B], 'bind B'],
  ['"#2"', '#2', [A, B], 'bind B'],
  ['"the second one"', 'the second one', [A, B], 'bind B'],
  ['ordinal out of range', 'option 9', [A, B], 'dead-end'],
  ['"no option 2" (D135)', 'no option 2', [A, B], 'dead-end'],
  ['ordinal ambiguous with a real name (D136)', 'option 2', [OPT2NAME, B], 'dead-end'],
  ['name + bare digit (D129)', 'acme 2', [A, B], 'dead-end'],
  ['name + its own (option N)', 'beta corp (option 1)', [O1, O2], 'bind O1'],
  ['quoted label typed plainly (D93)', 'advanced closed systems', [Q, B], 'bind Q'],
  ['apostrophe pair (D102/D106)', "smith's bakery", [S, SB], 'bind SB'],
  ['apostrophe-less form', 'smiths bakery', [S, SB], 'bind SB'],
  ['multi-mention (D106)', 'archive acme holdings, leave acme logistics alone', [A, B], 'dead-end'],
  ['negator-token NAME selected', 'no limits inc', [NL, B], 'bind NL'],
  ['negator-token NAME excluded', "don't archive no limits inc", [NL, B], 'dead-end'],
  ['second negator-token name', 'nothing bundt cakes', [NB, B], 'bind NB'],
  ['person option + person noun', 'bob smith person', [PERSON, B], 'bind PERSON'],
  ['prototype-key actionType (D132)', 'acme holdings', [{ ...A, actionType: '__proto__' }, B], 'no-crash'],
  ['prototype-key entityType (D132)', 'acme holdings', [{ ...A, entityType: 'constructor' }, B], 'no-crash'],
  ['malformed option (missing id)', 'acme holdings', [{ label: 'ACME Holdings', entityType: 'company' }, B], 'dead-end'],
];

const idOf = (o) => (o && o.id) || null;
let diffs = 0; let crashes = 0;
console.log('shape'.padEnd(44) + 'candidate'.padEnd(18) + 'v92'.padEnd(18) + 'delta');
for (const [name, cmd, opts, expected] of SHAPES) {
  let c; let v; let cerr = null; let verr = null;
  try { c = idOf(cand(cmd, opts)); } catch (e) { cerr = e.message; crashes++; }
  try { v = idOf(v92(cmd, opts)); } catch (e) { verr = e.message; }
  const cs = cerr ? 'THROW' : String(c);
  const vs = verr ? 'THROW' : String(v);
  const delta = cs === vs ? '' : 'DIFFERS';
  if (delta) diffs++;
  console.log(name.padEnd(44) + cs.padEnd(18) + vs.padEnd(18) + delta + '   [' + expected + ']');
}
console.log('\nshapes=' + SHAPES.length + '  differ=' + diffs + '  candidate throws=' + crashes);
