#!/usr/bin/env node
// VERIFIER #70 — IDENTIFIER DELTA v92 -> candidate, RE-DERIVED.
// INSTRUMENT NOTE (#68 standard): a naive word scan reads identifiers out of REGEX LITERALS, STRINGS,
// TEMPLATES and COMMENTS, and #68 reported two identifiers as "removed" because of exactly that. This
// extractor tokenizes and takes identifiers ONLY from code positions.
import { readFileSync } from 'node:fs';

function codeOnly(raw) {
  const s = raw.replace(/\r\n?/g, '\n');
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; out += ' '; continue; }
    if (c === '`') { let j = i + 1; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '`') { j++; break; } j++; } i = j; out += ' '; continue; }
    if (c === "'" || c === '"') { const q = c; let j = i + 1; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === q) { j++; break; } if (s[j] === '\n') break; j++; } i = j; out += ' '; continue; }
    if (c === '/') {
      let p = i - 1; while (p >= 0 && (s[p] === ' ' || s[p] === '\t')) p--;
      const prev = p >= 0 ? s[p] : ''; const pw = s.slice(Math.max(0, p - 7), p + 1);
      if (prev === '' || '=(,[!&|?:;{}\n+'.includes(prev) || /\b(return|typeof|case|of|do|test|exec)$/.test(pw)) {
        let j = i + 1, cls = false, ok = false;
        while (j < s.length) { const ch = s[j];
          if (ch === '\\') { j += 2; continue; } if (ch === '[') { cls = true; j++; continue; }
          if (ch === ']') { cls = false; j++; continue; } if (ch === '/' && !cls) { j++; ok = true; break; }
          if (ch === '\n') break; j++; }
        if (ok) { while (j < s.length && /[a-z]/i.test(s[j])) j++; i = j; out += ' '; continue; }
      }
    }
    out += c; i++;
  }
  return out;
}
const idsOf = (raw) => new Set([...codeOnly(raw).matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0]));

const A = idsOf(readFileSync(process.argv[2] || 'qa/verification/scratch/v92/index.v92.ts', 'utf8'));
const B = idsOf(readFileSync(process.argv[3] || 'supabase/functions/sem-ai-command/index.ts', 'utf8'));
const removed = [...A].filter((x) => !B.has(x)).sort();
const added = [...B].filter((x) => !A.has(x)).sort();
console.log(`v92 identifiers: ${A.size}   candidate identifiers: ${B.size}`);
console.log(`REMOVED vs v92: ${removed.length}`);
for (const r of removed) console.log('   - ' + r);
console.log(`ADDED vs v92: ${added.length}`);
console.log('   ' + added.join(' '));
// SELF-TEST: the extractor must not be so aggressive that it finds nothing.
if (A.size < 500 || B.size < 500) { console.error('EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: the tokenizer is broken'); process.exit(2); }
