// VERIFIER #58 — identifier delta v92 (git c9dfab5bd433) -> candidate. Own scanner: declared identifiers via
// const/let/var/function/class/type/interface, after stripping comments, strings, templates and regex literals.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const cand = readFileSync(resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const v92 = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
function scrub(s) {
  // remove block comments, line comments, strings, template literals, regex literals (best-effort tokenizer)
  let out = ''; let i = 0;
  while (i < s.length) {
    const c = s[i], two = s.slice(i, i + 2);
    if (two === '//') { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    if (two === '/*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 2; out += ' '; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } out += '""'; i = j + 1; continue; }
    if (c === '`') { let j = i + 1, d = 0; while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === '$' && s[j + 1] === '{') { d++; j += 2; continue; } if (d > 0 && s[j] === '}') { d--; j++; continue; } if (d === 0 && s[j] === '`') break; j++; } out += '``'; i = j + 1; continue; }
    if (c === '/') {
      const prev = out.replace(/\s+$/, '').slice(-1); const prevWord = (out.match(/([A-Za-z_$][\w$]*)\s*$/) || [])[1];
      if (prev === '' || '=(,[!&|?:;{}+*%~^<>'.includes(prev) || ['return', 'typeof', 'case', 'of', 'do', 'in', 'instanceof', 'new', 'delete', 'void', 'throw', 'else', 'yield', 'await'].includes(prevWord)) {
        let j = i + 1, inClass = false, ok = false;
        while (j < s.length) { const d = s[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) { ok = true; break; } else if (d === '\n') break; j++; }
        if (ok) { j++; while (j < s.length && /[a-z]/.test(s[j])) j++; out += '/re/'; i = j; continue; }
      }
    }
    out += c; i++;
  }
  return out;
}
function declared(s) {
  const t = scrub(s); const names = new Map();
  const addN = (n, kind) => { if (!names.has(n)) names.set(n, new Set()); names.get(n).add(kind); };
  for (const m of t.matchAll(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)/g)) addN(m[2], m[1]);
  for (const m of t.matchAll(/\b(const|let|var)\s*\{([^}=]*)\}\s*(?::[^=]*)?=/g)) for (const part of m[2].split(',')) { const n = part.split(':').pop().trim().split(/\s|=/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) addN(n, m[1] + '-destructure'); }
  for (const m of t.matchAll(/\b(const|let|var)\s*\[([^\]=]*)\]\s*(?::[^=]*)?=/g)) for (const part of m[2].split(',')) { const n = part.trim().split(/\s|=/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) addN(n, m[1] + '-destructure'); }
  for (const m of t.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) addN(m[1], 'function');
  for (const m of t.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) addN(m[1], 'class');
  for (const m of t.matchAll(/\b(type|interface)\s+([A-Za-z_$][\w$]*)/g)) addN(m[2], m[1]);
  return names;
}
const A = declared(v92), B = declared(cand);
const removed = [...A.keys()].filter((n) => !B.has(n)).sort();
const added = [...B.keys()].filter((n) => !A.has(n)).sort();
const linesA = v92.split('\n').length, linesB = cand.split('\n').length;
const hunks = execSync('git diff --stat c9dfab5bd433 HEAD -- supabase/functions/sem-ai-command/index.ts', { cwd: ROOT, encoding: 'utf8' }).trim();
const numstat = execSync('git diff --numstat c9dfab5bd433 HEAD -- supabase/functions/sem-ai-command/index.ts', { cwd: ROOT, encoding: 'utf8' }).trim();
console.log(`v92: ${v92.length} B / ${linesA} lines, ${A.size} declared identifiers`);
console.log(`cand: ${cand.length} B (LF-normalised) / ${linesB} lines, ${B.size} declared identifiers`);
console.log(`added: ${added.length}  removed: ${removed.length}`);
console.log('REMOVED:', JSON.stringify(removed));
console.log('numstat (raw, CRLF-vs-LF inflates):', numstat);
const importsA = v92.split('\n').filter((l) => /^\s*import\b/.test(l)), importsB = cand.split('\n').filter((l) => /^\s*import\b/.test(l));
console.log('imports identical:', JSON.stringify(importsA) === JSON.stringify(importsB), JSON.stringify(importsB));
writeFileSync(resolve(HERE, 'identifier_delta.json'), JSON.stringify({ v92: { bytes: v92.length, lines: linesA, declared: A.size }, cand: { bytes: cand.length, lines: linesB, declared: B.size }, added, removed, importsIdentical: JSON.stringify(importsA) === JSON.stringify(importsB) }, null, 1));
