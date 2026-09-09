// VERIFIER #69 — identifier delta v92 -> candidate, with REGEX-LITERAL AND STRING AWARENESS.
// #68 reported its own extractor falsely counting two identifiers as removed because it read
// regex bodies as code. This one strips comments, strings and regex literals BEFORE tokenising,
// and self-tests that it does so.
import fs from 'node:fs';
process.env.V69_LIB = '1';
const { extractLiterals } = await import('./respell_scan.mjs');

function codeOnly(src) {
  // Blank out comments, strings and regex literals, preserving offsets is unnecessary — we only tokenise.
  let out = '', i = 0; const n = src.length; let prev = '';
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) break; if (src[j] === '\n' && q !== '`') break; j++; }
      out += ' '; i = j + 1; prev = 'lit'; continue;
    }
    if (c === '/') {
      const allow = prev === '' || /[=(,:[!&|?{};+\-*%~^<>]$/.test(prev) || /\b(return|typeof|case|in|of|new|delete|void|do|else|instanceof)$/.test(prev);
      if (allow) {
        let j = i + 1, cls = false, ok = false;
        while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') break; if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) { ok = true; break; } j++; }
        if (ok) { let k = j + 1; while (k < n && /[dgimsuvy]/.test(src[k])) k++; out += ' '; i = k; prev = 'lit'; continue; }
      }
      out += c; i++; prev = '/'; continue;
    }
    let j = i;
    if (/[A-Za-z0-9_$]/.test(c)) { while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; prev = src.slice(i, j); out += prev; }
    else if (/\s/.test(c)) { j = i + 1; out += c; }  // whitespace is NOT significant for "can a regex start here"
    else { j = i + 1; prev = c; out += c; }
    i = j;
  }
  return out;
}
// self-test
{
  const t = codeOnly(`const re = /archiveCompanyIds|restoreCompanyIds/; const realIdent = 1; // commentIdent\nconst s = "stringIdent";`);
  const bad = [];
  if (/archiveCompanyIds/.test(t)) bad.push('regex body leaked into code');
  if (/commentIdent/.test(t)) bad.push('comment leaked');
  if (/stringIdent/.test(t)) bad.push('string leaked');
  if (!/realIdent/.test(t)) bad.push('real identifier lost');
  if (bad.length) { console.error('EXTRACTOR SELFTEST FAIL:', bad.join('; ')); process.exit(2); }
  console.log('extractor selftest: 4/4 OK (regex/comment/string stripped, real identifier kept)');
}

const RESERVED = new Set(('const let var function return if else for while do switch case break continue new delete typeof instanceof in of class extends super this null true false undefined void try catch finally throw async await yield import export from as default static get set public private protected readonly interface type enum namespace declare implements abstract is keyof infer never unknown any string number boolean object symbol bigint').split(' '));
function idents(src) {
  const s = codeOnly(src);
  const set = new Set();
  for (const m of s.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) if (!RESERVED.has(m[0])) set.add(m[0]);
  return set;
}
const v92 = fs.readFileSync('qa/verification/scratch/v92/index.v92.ts', 'utf8');
const cand = fs.readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8');
const A = idents(v92), B = idents(cand);
const removed = [...A].filter((x) => !B.has(x)).sort();
const added = [...B].filter((x) => !A.has(x)).sort();
console.log('\nv92 identifiers=' + A.size + '  candidate identifiers=' + B.size);
console.log('REMOVED (' + removed.length + '): ' + (removed.join(', ') || '(none)'));
console.log('\nADDED (' + added.length + ')');
fs.writeFileSync('qa/verification/scratch/v69/identifier_delta.json', JSON.stringify({ removed, added }, null, 2));
