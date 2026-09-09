// VERIFIER #69 INSTRUMENT — find inline re-spellings of a canonical vocabulary.
// Instrument-validation cases are at the bottom and run first; if any fails, the scan does not run.
import fs from 'node:fs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';

// ---- literal extraction: regex literals, single/double/backtick strings, regex-aware ----
export function extractLiterals(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  // track whether a '/' can begin a regex: after these, yes.
  let prevSignificant = '';
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    // line comment
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    // block comment
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; const startLine = line; let j = i + 1; let buf = '';
      while (j < n) {
        if (src[j] === '\\') { buf += src[j + 1]; j += 2; continue; }
        if (src[j] === q) break;
        if (src[j] === '\n') { line++; if (q !== '`') break; }
        buf += src[j]; j++;
      }
      out.push({ kind: 'string', line: startLine, text: buf });
      i = j + 1; prevSignificant = 'lit'; continue;
    }
    if (c === '/') {
      // regex literal only if previous significant token allows it
      const allow = prevSignificant === '' || /[=(,:[!&|?{};+\-*%~^<>]$/.test(prevSignificant) || /\b(return|typeof|case|in|of|new|delete|void|do|else|instanceof)$/.test(prevSignificant);
      if (allow) {
        const startLine = line; let j = i + 1; let buf = ''; let inClass = false; let ok = false;
        while (j < n) {
          const d = src[j];
          if (d === '\\') { buf += d + src[j + 1]; j += 2; continue; }
          if (d === '\n') break;
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { ok = true; break; }
          buf += d; j++;
        }
        if (ok) {
          let k = j + 1; while (k < n && /[dgimsuvy]/.test(src[k])) k++;
          out.push({ kind: 'regex', line: startLine, text: buf });
          i = k; prevSignificant = 'lit'; continue;
        }
      }
      i++; prevSignificant = '/'; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    // accumulate an identifier/operator run for the regex-allowed heuristic
    let j = i;
    if (/[A-Za-z0-9_$]/.test(c)) { while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; prevSignificant = src.slice(i, j); }
    else { j = i + 1; prevSignificant = c; }
    i = j;
  }
  return out;
}

// ---- alternation member extraction ----
export function members(text) {
  // split on top-level | (not inside (...) groups or [...] classes)
  const parts = []; let depth = 0, cls = false, cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { cur += c + text[i + 1]; i++; continue; }
    if (c === '[') cls = true; else if (c === ']') cls = false;
    else if (!cls && c === '(') depth++;
    else if (!cls && c === ')') depth--;
    if (!cls && depth === 0 && c === '|') { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  const set = new Set();
  for (let p of parts) {
    p = p.replace(/\(\?[:=!<][^)]*\)/g, '').replace(/[\\^$()\[\]{}?*+.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (p.length >= 3 && /^[a-z][a-z '’-]*$/.test(p)) set.add(p);
  }
  return set;
}

// ---- instrument validation ----
function selfTest() {
  const cases = [];
  const t1 = extractLiterals(`const a = /foo|bar/i; const b = "baz|qux";`);
  cases.push(['regex literal seen', t1.some(l => l.kind === 'regex' && l.text === 'foo|bar')]);
  cases.push(['string literal seen', t1.some(l => l.kind === 'string' && l.text === 'baz|qux')]);
  // division must NOT be read as a regex
  const t2 = extractLiterals(`const x = a / b; const y = c / d;`);
  cases.push(['division not a regex', !t2.some(l => l.kind === 'regex')]);
  // a regex containing a quote must not open a string
  const t3 = extractLiterals(`const q = /don['’]t|can't/i; const after = "REAL";`);
  cases.push(['quote inside regex safe', t3.some(l => l.kind === 'string' && l.text === 'REAL')]);
  // a slash inside a character class must not close the regex
  const t4 = extractLiterals(`const s = /[/]a|b/i; const after2 = "REAL2";`);
  cases.push(['slash in class safe', t4.some(l => l.kind === 'string' && l.text === 'REAL2')]);
  // comments ignored
  const t5 = extractLiterals(`// /notregex|x/\nconst z = /yes|no/;`);
  cases.push(['line comment ignored', t5.filter(l => l.kind === 'regex').length === 1]);
  const m = members('archiv(?:e|ing)|restore|work order|\\d+');
  cases.push(['members basic', m.has('restore') && m.has('work order') && !m.has('')]);
  let bad = 0;
  for (const [name, ok] of cases) { if (!ok) { console.error('INSTRUMENT SELFTEST FAIL:', name); bad++; } }
  if (bad) { console.error('instrument is not trustworthy — aborting'); process.exit(2); }
  console.log('instrument selftest: ' + cases.length + '/' + cases.length + ' OK');
}
selfTest();
if (process.env.V69_LIB) { /* imported as a library — do not run the scan */ }
else { runScan(); }
function runScan() {
const src = fs.readFileSync(SRC, 'utf8');
const CANON = {
  ENTITY_NOUN_ALTERNATION: 1771,
  REQUEST_FRAME_ADDRESSED: 1720,
  REQUEST_FRAME_ALTERNATION: 1722,
  REQUEST_FRAME_DELIBERATIVE: 1739,
  CONFIRMATION_ALTERNATION: 1779,
  MUTATION_VERB_ALTERNATION: 1758,
};
// rebuild canonical member sets by evaluating the declarations out of source
const canonSets = {};
for (const [name] of Object.entries(CANON)) {
  const re = new RegExp('const ' + name + ' = ([^;]+);', 's');
  const m = src.match(re);
  if (!m) { console.error('cannot find', name); process.exit(2); }
  // evaluate the string concatenation safely
  const expr = m[1].replace(/REQUEST_FRAME_ADDRESSED/g, JSON.stringify(''))
    .replace(/REQUEST_FRAME_ALTERNATION\b/g, JSON.stringify(''));
  let val;
  try { val = Function('"use strict";return (' + expr.replace(/\/\/[^\n]*\n/g, '\n') + ')')(); } catch (e) { console.error('eval fail', name, e.message); process.exit(2); }
  canonSets[name] = members(String(val));
}
// canonical composites
canonSets.REQUEST_FRAME_ALTERNATION = new Set([...canonSets.REQUEST_FRAME_ADDRESSED, ...canonSets.REQUEST_FRAME_ALTERNATION]);

const lits = extractLiterals(src);
const declLines = new Set(Object.values(CANON));
// lines that textually reference the canonical name derive from it
const srcLines = src.split(/\r?\n/);
const rows = [];
for (const lit of lits) {
  if (lit.text.length < 12) continue;
  const ms = members(lit.text);
  if (ms.size < 3) continue;
  for (const [name, cset] of Object.entries(canonSets)) {
    const shared = [...ms].filter(x => cset.has(x));
    if (shared.length < 3) continue;
    const frac = shared.length / ms.size;
    if (frac < 0.5) continue;
    // does this literal's statement reference the canonical name? scan +-3 lines and back to statement start
    let ctx = '';
    for (let k = Math.max(0, lit.line - 6); k < Math.min(srcLines.length, lit.line + 3); k++) ctx += srcLines[k] + '\n';
    const derives = ctx.includes(name);
    if (declLines.has(lit.line)) continue;
    rows.push({ line: lit.line, kind: lit.kind, canon: name, shared: shared.length, total: ms.size, frac: +frac.toFixed(2), derives, missing: [...cset].filter(x => !ms.has(x)).length, sample: lit.text.slice(0, 70) });
  }
}
rows.sort((a, b) => (a.derives - b.derives) || (b.shared - a.shared));
console.log('\n=== LITERALS OVERLAPPING A CANONICAL VOCABULARY ===');
for (const r of rows) {
  console.log([r.derives ? 'DERIVES ' : 'RESPELL!', 'L' + r.line, r.kind, r.canon, r.shared + '/' + r.total, 'frac=' + r.frac, 'canonMissing=' + r.missing, r.sample.replace(/\s+/g, ' ')].join(' | '));
}
const respells = rows.filter(r => !r.derives);
console.log('\nRESPELLINGS (do not derive): ' + respells.length);
}
