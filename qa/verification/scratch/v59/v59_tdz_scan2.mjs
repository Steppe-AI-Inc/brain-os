#!/usr/bin/env node
// VERIFIER #59 — shadow-aware block-scope TDZ scan over EVERY const/let/class in index.ts (the committed suite
// tdz_forward_reference_contract.mjs scans UPPERCASE consts only). Same rule: a name declared exactly once in the
// file, read on an earlier line inside the SAME block chain, with no function boundary between the read and the
// declaration, is a guaranteed ReferenceError when that earlier statement executes. Names declared more than once
// are reported separately (cannot be reasoned about lexically) and the six new declaration sites named in the
// launch prompt are checked by hand below.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const LINES = TEXT.split('\n');
const PREV_ALLOWS_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '\n', '+', '-', '*', '<', '>', '~', '%', '^', 'n']);
function blockEvents(src) {
  const ev = []; let i = 0, line = 1, prev = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); for (let k = i; k < e; k++) if (src[k] === '\n') line++; i = e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (src[j] === '\n') line++; if (c === '`' && src[j] === '$' && src[j + 1] === '{') { let d = 1; j += 2; while (j < src.length && d > 0) { if (src[j] === '{') d++; else if (src[j] === '}') d--; else if (src[j] === '\n') line++; j++; } continue; } j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev) || /return|typeof|case|of$/.test(TEXT.slice(Math.max(0, i - 7), i).trim()))) {
      let j = i + 1, inClass = false, ok = false;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false; else if (src[j] === '/' && !inClass) { ok = true; break; } else if (src[j] === '\n') break; j++; }
      if (ok) { j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++; i = j; prev = '/'; continue; }
    }
    if (c === '{' || c === '}') ev.push({ line, c });
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return ev;
}
const EVENTS = blockEvents(TEXT);
const chain = (t) => { const st = []; for (const e of EVENTS) { if (e.line > t) break; if (e.c === '{') st.push(e.line); else st.pop(); } return st; };
const opensFn = (openLine) => { const head = LINES[openLine - 1] || ''; return /=>\s*\{\s*$/.test(head) || /\bfunction\b/.test(head) || /^\s*(?:async\s+)?[\w$]+\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/.test(head) || /\)\s*(?::\s*[^{=]+)?\s*\{\s*$/.test(head) && /\b(function|=>|async|catch)\b/.test(head); };
const decls = [];
for (let i = 0; i < LINES.length; i++) {
  const L = LINES[i];
  if (/^\s*(?:\/\/|\*|\/\*)/.test(L)) continue;
  for (const m of L.matchAll(/\b(?:const|let|class)\s+([A-Za-z_$][\w$]*)\b/g)) decls.push({ name: m[1], line: i + 1 });
  const d = L.match(/^\s*(?:const|let)\s+\[([^\]]+)\]\s*=/); if (d) for (const n of d[1].split(',').map((x) => x.trim().replace(/^\.\.\./, '')).filter(Boolean)) decls.push({ name: n, line: i + 1 });
}
const count = new Map(); for (const d of decls) count.set(d.name, (count.get(d.name) || 0) + 1);
const hits = [], multi = new Set();
for (const d of decls) {
  if (count.get(d.name) !== 1) { multi.add(d.name); continue; }
  const declChain = chain(d.line);
  const re = new RegExp('(?<![\\w$.])' + d.name.replace(/\$/g, '\\$') + '(?![\\w$])');
  for (let i = 0; i < d.line - 1; i++) {
    const L = LINES[i];
    if (!re.test(L) || /^\s*(?:\/\/|\*|\/\*)/.test(L)) continue;
    // strip string/regex-ish content crudely: a use inside a string literal or template is not a read
    const stripped = L.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, '""');
    if (!re.test(stripped)) continue;
    const useChain = chain(i + 1);
    const nested = useChain.length >= declChain.length && declChain.every((v, k) => useChain[k] === v);
    if (!nested) continue;
    if (useChain.slice(declChain.length).some(opensFn)) continue;
    hits.push({ name: d.name, declLine: d.line, useLine: i + 1, text: L.trim().slice(0, 140) });
    break;
  }
}
console.log(`declarations scanned: ${decls.length} (unique names ${count.size}; names declared more than once: ${multi.size})`);
console.log(`SYNC use-before-declaration in the same block (unique names): ${hits.length}`);
for (const h of hits) console.log(`  ${h.name}: read at :${h.useLine}, declared at :${h.declLine} — ${h.text}`);
// the six declaration sites the launch prompt names — first line of each and its first prior read (must be none)
const SITES = ['resolveCompanyLifecycleTargets', 'verifyRowsExist', 'recordCreate', 'requestedIntent', 'requestedIntentPrimary', 'receiptRendered', 'receiptExempt', 'lexiconVerb', 'modelIntentKind', 'IMPERATIVE_HEAD_RE', 'commandFallbackAllowed', 'headLifecycleAction', 'lifecycleCommandName', 'LifecycleLookupRow', 'CompanyLookupRow', 'MutationIntent', 'idOf', 'executedVerifiedCount', 'MUTATION_ARRAY_FIELDS', 'READ_SHAPE', 'CONFIRMATION_COMMAND'];
for (const n of SITES) {
  const declLine = LINES.findIndex((L) => new RegExp('^\\s*(?:const|let|type|async function|function)\\s+' + n + '\\b').test(L)) + 1;
  const firstUse = LINES.findIndex((L, i) => i + 1 < declLine && !/^\s*\/\//.test(L) && new RegExp('(?<![\\w$.])' + n + '(?![\\w$])').test(L.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, '""'))) + 1;
  console.log(`  site ${n.padEnd(32)} declared :${declLine || '?'}  first earlier read: ${firstUse || 'none'}${firstUse && declLine && chain(firstUse).slice(chain(declLine).length).some(opensFn) ? ' (inside a closure — deferred, safe)' : firstUse ? (LINES[firstUse - 1].includes('function ' + n) ? ' (hoisted function)' : '  <-- CHECK') : ''}`);
}
console.log(`multi-declared names (lexically undecidable here, executed through the windows instead): ${[...multi].slice(0, 40).join(', ')}${multi.size > 40 ? ' …' : ''}`);
process.exit(hits.length === 0 ? 0 : 1);
