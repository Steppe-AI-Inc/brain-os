// VERIFIER #70 — SILENT-CORRUPTION CLASS SCAN: escape depth inside CONSTRUCTED regexes.
//
// A regex built from a STRING must double-escape every class: '\\w' in source -> "\w" at
// runtime. A single backslash ('\w' in source) is an unrecognised string escape and silently
// becomes the LITERAL LETTER "w" — no error, anywhere. This is the class that made a clause
// split never split (candidate history) and it is invisible in grep output.
//
// Method: walk the file character by character with a real string/regex/comment/template
// tokenizer. Inside every ORDINARY string literal (' or "), look for a lone backslash
// followed by a regex-meaningful class character. Then, independently, check whether that
// string literal is *used* to build a RegExp (heuristic: the statement it belongs to
// mentions `new RegExp(` or `RegExp(`), and report both sets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || path.resolve(here, '../../../supabase/functions/sem-ai-command/index.ts');
const raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');

// Characters that mean something in a regex when preceded by a backslash, and whose loss is silent.
// (\n \t \r \\ \' \" \0 \x \u are REAL string escapes and are therefore not in this set.)
const CLASSY = new Set(['w', 'W', 's', 'S', 'd', 'D', 'b', 'B', 'p', 'P', 'A', 'Z', 'k', 'c', 'q', 'e', 'g', 'h', 'i', 'j', 'l', 'm', 'o', 'y', 'z', '.', '+', '*', '?', '(', ')', '[', ']', '{', '}', '|', '^', '$', '/', '-']);
// Of those, the ones whose LOSS changes what the regex matches in a way that can never error:
const SILENT_LOSS = new Set(['w', 'W', 's', 'S', 'd', 'D', 'b', 'B', 'p', 'P', 'A', 'Z', 'k', 'c', 'e', 'g', 'h', 'i', 'j', 'l', 'm', 'o', 'q', 'y', 'z']);

const findings = [];
let i = 0, line = 1;
function lineOf(idx) { return raw.slice(0, idx).split('\n').length; }
while (i < raw.length) {
  const c = raw[i];
  if (c === '/' && raw[i + 1] === '/') { const e = raw.indexOf('\n', i); i = e < 0 ? raw.length : e; continue; }
  if (c === '/' && raw[i + 1] === '*') { const e = raw.indexOf('*/', i); i = e < 0 ? raw.length : e + 2; continue; }
  if (c === '`') { // template: skip to matching backtick (no nesting handling needed here)
    let j = i + 1;
    while (j < raw.length) { if (raw[j] === '\\') { j += 2; continue; } if (raw[j] === '`') { j++; break; } j++; }
    i = j; continue;
  }
  // REGEX LITERALS must be skipped verbatim, or a quote inside a character class (/['’]/ is
  // everywhere in this file) is read as a string OPENING and the phantom string swallows real
  // code — which is exactly how the first run of this instrument produced 18 false suspects.
  // INSTRUMENT CORRECTION, verifier #70, before use.
  if (c === '/') {
    let p = i - 1;
    while (p >= 0 && (raw[p] === ' ' || raw[p] === '\t')) p--;
    const prev = p >= 0 ? raw[p] : '';
    const prevWord = raw.slice(Math.max(0, p - 7), p + 1);
    if (prev === '' || '=(,[!&|?:;{}\n+'.includes(prev) || /\b(return|typeof|case|of|do|test|exec)$/.test(prevWord)) {
      let j = i + 1, inClass = false, valid = false;
      while (j < raw.length) {
        const ch = raw[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') { inClass = true; j++; continue; }
        if (ch === ']') { inClass = false; j++; continue; }
        if (ch === '/' && !inClass) { j++; valid = true; break; }
        if (ch === '\n') break;
        j++;
      }
      if (valid) { while (j < raw.length && /[a-z]/i.test(raw[j])) j++; i = j; continue; }
    }
  }
  if (c === "'" || c === '"') {
    const q = c; let j = i + 1; const bad = [];
    while (j < raw.length) {
      if (raw[j] === '\\') {
        const nx = raw[j + 1];
        if (SILENT_LOSS.has(nx)) bad.push({ at: j, ch: nx });
        j += 2; continue;
      }
      if (raw[j] === q) { j++; break; }
      if (raw[j] === '\n') break;   // unterminated -> not a string
      j++;
    }
    if (bad.length) {
      const ln = lineOf(i);
      const stmt = lines[ln - 1] || '';
      const usedAsRegex = /RegExp\s*\(/.test(stmt) || /\.(?:replace|match|split|search)\s*\(/.test(stmt);
      findings.push({ line: ln, chars: [...new Set(bad.map((b) => b.ch))].join(','), usedAsRegex, text: raw.slice(i, Math.min(j, i + 160)) });
    }
    i = j; continue;
  }
  i++;
}

let fail = 0;
console.log('# VERIFIER #70 — ESCAPE-DEPTH SCAN of ordinary string literals in index.ts\n');
if (!findings.length) console.log('  (no single-escaped regex classes inside string literals)');
for (const f of findings) {
  const flag = f.usedAsRegex ? 'REGEX-CONSTRUCTING  *** SUSPECT ***' : 'not a regex site';
  if (f.usedAsRegex) fail++;
  console.log(`line ${String(f.line).padStart(5)}  lost:\\${f.chars.split(',').join('  \\')}   ${flag}`);
  console.log(`         ${f.text.replace(/\n/g, ' ')}`);
}
console.log(`\nSUSPECT REGEX-CONSTRUCTING SITES: ${fail}`);
process.exit(0);
