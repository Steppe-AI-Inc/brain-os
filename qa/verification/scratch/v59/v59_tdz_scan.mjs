#!/usr/bin/env node
// VERIFIER #59 — own block-scope analysis: for every `const`/`let` declaration, any identifier read of the same
// name INSIDE THE SAME BLOCK before the declaration is a TDZ hazard. A read inside a nested function body (a
// closure that runs later) is DEFERRED and reported separately. Runs on the LF-normalised source with strings,
// template literals, regex literals and comments blanked (their bytes replaced by spaces, so offsets hold).
// Control: on 8eb8cbd the scanner must report the known V54-P0 pair (PAST_COMPLETION_CLAIM_PATTERN, COMPLETION_WORD).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const arg = process.argv[2];
const text = (arg && /^[0-9a-f]{7,40}$/.test(arg) ? execSync(`git show ${arg}:supabase/functions/sem-ai-command/index.ts`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : readFileSync(arg ? resolve(arg) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8')).replace(/\r\n/g, '\n');

// blank strings / templates / regex / comments, preserving length
function blank(s) {
  const out = s.split(''); let i = 0; const n = s.length;
  const prevSig = (k) => { let p = k - 1; while (p >= 0 && /\s/.test(s[p])) p--; return p; };
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { let j = i; while (j < n && s[j] !== '\n') { out[j] = ' '; j++; } i = j; continue; }
    if (c === '/' && s[i + 1] === '*') { let j = i; while (j < n && !(s[j] === '*' && s[j + 1] === '/')) { if (s[j] !== '\n') out[j] = ' '; j++; } out[j] = ' '; out[j + 1] = ' '; i = j + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') { out[j] = ' '; j++; } out[j] = ' '; j++; } i = j + 1; continue; }
    if (c === '`') { let j = i + 1, depth = 0; while (j < n) { if (s[j] === '\\') { out[j] = ' '; out[j + 1] = ' '; j += 2; continue; } if (depth === 0 && s[j] === '`') break; if (s[j] === '$' && s[j + 1] === '{') { depth++; j += 2; continue; } if (depth > 0 && s[j] === '}') { depth--; j++; continue; } if (depth === 0 && s[j] !== '\n') out[j] = ' '; j++; } i = j + 1; continue; }
    if (c === '/') {
      const p = prevSig(i); const prev = p >= 0 ? s[p] : ''; const word = s.slice(Math.max(0, p - 6), p + 1);
      if (prev === '' || '=(,[!&|?:;{}'.includes(prev) || /\b(return|typeof|case|of|do)$/.test(word)) {
        let j = i + 1, inClass = false, ok = false;
        while (j < n) { const d = s[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) { ok = true; break; } else if (d === '\n') break; j++; }
        if (ok) { for (let k = i + 1; k < j; k++) out[k] = ' '; i = j + 1; while (i < n && /[a-z]/.test(s[i])) i++; continue; }
      }
    }
    i++;
  }
  return out.join('');
}
const b = blank(text);
const lineOf = (pos) => b.slice(0, pos).split('\n').length;
// block map: for each '{' its matching '}'
const closeOf = new Map(); const openOf = new Map(); const stack = [];
for (let i = 0; i < b.length; i++) { if (b[i] === '{') stack.push(i); else if (b[i] === '}') { const o = stack.pop(); if (o !== undefined) { closeOf.set(o, i); openOf.set(i, o); } } }
const enclosingBlock = (pos) => { let best = -1; for (const [o, c] of closeOf) if (o < pos && c > pos && o > best) best = o; return best; };
// is `pos` inside a nested FUNCTION body that opens after blockStart? (then the read is deferred)
function nestedFnBodyStart(pos, blockStart) {
  let best = -1;
  for (const [o, c] of closeOf) {
    if (o <= blockStart || o >= pos || c <= pos) continue;
    const before = b.slice(Math.max(0, o - 400), o);
    if (/=>\s*$/.test(before) || /\)\s*$/.test(before) && /function\b[^{]*$|\bcatch\s*\([^)]*\)\s*$|\b(?:if|for|while|switch)\s*\([\s\S]*$/.test(before) === false && /\)\s*$/.test(before) && /\b(?:async\s+)?(?:function\s*\w*|\w+)\s*\([^{}]*\)\s*$/.test(before) && !/\b(?:if|for|while|switch|catch)\s*\([^{}]*\)\s*$/.test(before)) { if (o > best) best = o; }
  }
  return best;
}
const declRe = /\b(const|let)\s+([A-Za-z_$][\w$]*)/g;
const results = []; let m;
while ((m = declRe.exec(b))) {
  const name = m[2]; const declPos = m.index;
  const blockStart = enclosingBlock(declPos);
  const from = blockStart === -1 ? 0 : blockStart;
  const region = b.slice(from, declPos);
  const useRe = new RegExp('(^|[^\\w$.])' + name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
  let u;
  while ((u = useRe.exec(region))) {
    const pos = from + u.index + u[1].length;
    const after = b.slice(pos + name.length, pos + name.length + 30);
    const beforeTxt = b.slice(Math.max(0, pos - 60), pos);
    // object key / type-literal key / labelled / shorthand-in-type: `name:` or `name?:` preceded by { , ( or line start
    if (/^\s*\??\s*:/.test(after) && /[{,(]\s*$/.test(beforeTxt)) continue;
    // property in a destructuring pattern or params of a nested arrow are declarations of a DIFFERENT binding — approximate: skip if inside (...) => params
    if (/^[\s,]*\)\s*=>/.test(after) || /^[\s,]*[\w$]+\s*\)\s*=>/.test(after)) continue;
    if (/\(\s*$/.test(beforeTxt) && /^\s*\)\s*=>/.test(after)) continue;
    // inner declaration of the same name inside a nested block between use and decl (shadowing) — skip when the use's own enclosing block declares it
    const useBlock = enclosingBlock(pos);
    if (useBlock !== from && useBlock > from) { const inner = b.slice(useBlock, closeOf.get(useBlock) || pos); if (new RegExp('\\b(const|let|var)\\s+' + name + '\\b').test(inner) || new RegExp('(\\(|,)\\s*' + name + '\\s*(,|\\)|:)').test(b.slice(Math.max(0, useBlock - 200), useBlock))) continue; }
    const fnStart = nestedFnBodyStart(pos, from);
    results.push({ name, declLine: lineOf(declPos), useLine: lineOf(pos), kind: fnStart >= 0 ? 'DEFERRED' : 'SYNC' });
  }
}
const sync = results.filter((r) => r.kind === 'SYNC'), deferred = results.filter((r) => r.kind === 'DEFERRED');
console.log(`TDZ scan (${arg || 'candidate'}): declarations ${[...b.matchAll(/\b(const|let)\s+[A-Za-z_$]/g)].length}; SYNC use-before-declaration: ${sync.length}; DEFERRED (closure) reads: ${deferred.length}`);
for (const r of sync) console.log(`  SYNC     ${r.name} used :${r.useLine} declared :${r.declLine}`);
for (const r of deferred) console.log(`  DEFERRED ${r.name} used :${r.useLine} declared :${r.declLine}`);
process.exit(0);
