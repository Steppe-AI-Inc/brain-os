// Deno is not invokable in this session, so a `deno check` is BLOCKED. This is the part of
// that risk I CAN measure: every regex literal in index.ts must construct in V8, and no
// inline-modifier group may appear anywhere (a bad modifier fails at MODULE LOAD in the Deno
// Edge runtime and takes the whole function down — index.ts's own comment says so).
import { readSrc, candidatePath } from './v40_belt.mjs';

const src = readSrc(candidatePath());
const PREV = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
let i = 0; let prev = ''; let n = 0; let bad = 0;
const lits = [];
while (i < src.length) {
  const c = src[i]; const two = src.slice(i, i + 2);
  if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
  if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1;
    while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
    i = j + 1; prev = c; continue;
  }
  if (c === '/' && (prev === '' || PREV.has(prev))) {
    let j = i + 1; let inC = false; let okEnd = false;
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '[') inC = true; else if (src[j] === ']') inC = false;
      else if (src[j] === '/' && !inC) { okEnd = true; break; }
      else if (src[j] === '\n') break;
      j++;
    }
    if (okEnd) {
      const body = src.slice(i + 1, j);
      let k = j + 1; let flags = '';
      while (k < src.length && /[gimsuyvd]/.test(src[k])) { flags += src[k]; k++; }
      lits.push([body, flags, src.slice(0, i).split('\n').length]);
      i = k; prev = '/'; continue;
    }
  }
  if (!/\s/.test(c)) prev = c;
  i++;
}
for (const [body, flags, line] of lits) {
  n++;
  try { new RegExp(body, flags); } catch (e) { bad++; console.log('CONSTRUCT FAIL line ' + line + ': ' + e.message + '  /' + body.slice(0, 90) + '/'); }
}
const inline = [...src.matchAll(/\(\?-?[imsux]+:/g)];
console.log('regex literals scanned: ' + n + '  construct failures: ' + bad);
console.log('inline-modifier groups anywhere in index.ts: ' + inline.length);
for (const m of inline.slice(0, 5)) console.log('  at char ' + m.index + ': ' + src.slice(m.index, m.index + 40));
console.log(bad === 0 && inline.length === 0 ? 'REGEX LOAD CHECK: PASS' : 'REGEX LOAD CHECK: FAIL');
process.exit(bad === 0 && inline.length === 0 ? 0 : 1);
