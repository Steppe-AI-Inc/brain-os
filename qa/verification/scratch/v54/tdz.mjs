// V54 — is the TS2448/TS2454 temporal-dead-zone flag a REAL runtime hazard?
// Comment/string/regex-aware brace tracker: report the enclosing-block chain for two line numbers
// and whether any FUNCTION boundary separates the use site from the declaration site.
import { readFileSync } from 'node:fs';
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), 'g');
const SRC = readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8')
  .replace(CRLF, String.fromCharCode(10));
const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));

function scan(src) {
  const events = []; // {i, line, type:'{'|'}', fnStart:boolean}
  let i = 0, prev = '', line = 1;
  const stack = [];
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    if (c === '\n') { line++; i++; continue; }
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); const seg = src.slice(i, e < 0 ? src.length : e + 2); line += (seg.match(/\n/g) || []).length; i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (src[j] === '\n') line++; j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1, inClass = false;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false; else if (src[j] === '/' && !inClass) break; else if (src[j] === '\n') break; j++; }
      j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '{') {
      const before = src.slice(Math.max(0, i - 220), i);
      const isFn = /(?:=>|\bfunction\b[^;{]*|\bfunction\s*\*?\s*[\w$]*\s*\([^)]*\)\s*|\basync\b[^;{]{0,80})\s*$/.test(before)
        || /=>\s*$/.test(before) || /\)\s*\{$/.test(before.slice(-2) + '{') && /(?:function|=>)/.test(before.slice(-200));
      stack.push({ line, isFn: /=>\s*$/.test(before) || /\bfunction\b[\s\S]{0,200}\)\s*$/.test(before) });
      events.push({ line, type: '{', depth: stack.length, openLine: line });
    } else if (c === '}') {
      const t = stack.pop();
      events.push({ line, type: '}', depth: stack.length + 1, openLine: t ? t.line : -1 });
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return events;
}
const ev = scan(SRC);
function chainAt(target) {
  const stack = [];
  for (const e of ev) {
    if (e.line > target) break;
    if (e.type === '{') stack.push(e.openLine); else stack.pop();
  }
  return stack;
}
const USE = 2779, DECL_PAST = 4778;
const declLine = SRC.split('\n').findIndex((l) => /^\s*const PAST_COMPLETION_CLAIM_PATTERN = \//.test(l)) + 1;
const cwLine = SRC.split('\n').findIndex((l) => /^\s*const COMPLETION_WORD\b/.test(l)) + 1;
console.log('use site line          :', USE, JSON.stringify(SRC.split('\n')[USE - 1].trim().slice(0, 90)));
console.log('PAST_COMPLETION decl   :', declLine);
console.log('COMPLETION_WORD decl   :', cwLine);
const cu = chainAt(USE), cd = chainAt(declLine), cc = chainAt(cwLine);
console.log('enclosing-block chain @use :', cu.join(' > '));
console.log('enclosing-block chain @PAST:', cd.join(' > '));
console.log('enclosing-block chain @CW  :', cc.join(' > '));
const shared = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return a.slice(0, k); };
console.log('SAME BLOCK as PAST decl?  ', JSON.stringify(cu) === JSON.stringify(cd) ? 'YES (identical chain)'
  : 'no — common prefix ' + shared(cu, cd).join(' > ') + ' ; decl block = ' + cd[cd.length - 1] + ' ; use nested deeper = ' + (cu.length > cd.length && shared(cu, cd).length === cd.length));
console.log('SAME BLOCK as CW decl?    ', JSON.stringify(cu) === JSON.stringify(cc) ? 'YES'
  : 'no — decl block = ' + cc[cc.length - 1] + ' ; use nested inside it = ' + (cu.length > cc.length && shared(cu, cc).length === cc.length));
