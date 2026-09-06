#!/usr/bin/env node
// v43: identifier delta between deployed-v92 source and the candidate, computed on CODE ONLY
// (comments, string literals, template literals and regex literals stripped by a small lexer),
// because a naive /\b(const|let|var|function)\s+(\w+)/ scan over raw text counts words that
// appear INSIDE regex sources and prose comments. Ledger #90 reported this count wrongly once.
import { readFileSync } from 'node:fs';

function stripNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  // crude but adequate: track whether a '/' starts a regex by looking at the last significant char
  let lastSig = '';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; out += '""'; lastSig = '"'; continue;
    }
    if (c === '`') {
      i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && src[i] === '}') { depth--; i++; continue; }
        if (depth === 0 && src[i] === '`') break;
        i++;
      }
      i++; out += '``'; lastSig = '`'; continue;
    }
    if (c === '/') {
      // regex literal iff previous significant char cannot end an expression
      const canDivide = /[\w$)\]"'`]/.test(lastSig);
      if (!canDivide) {
        i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) break;
          else if (src[i] === '\n') break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/.test(src[i])) i++;
        out += '/RE/'; lastSig = '/'; continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

const DECL = /(?:^|[\s;{}()\[\],:?=&|!+*/-])(?:export\s+)?(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;

function declsOf(path) {
  const code = stripNonCode(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  const names = new Map();
  let m;
  DECL.lastIndex = 0;
  while ((m = DECL.exec(code)) !== null) names.set(m[2], (names.get(m[2]) || 0) + 1);
  return names;
}

const V = declsOf(process.argv[2]);
const C = declsOf(process.argv[3]);
const added = [...C.keys()].filter((k) => !V.has(k)).sort();
const removed = [...V.keys()].filter((k) => !C.has(k)).sort();
console.log('v92  distinct declared identifiers (code only): ' + V.size);
console.log('cand distinct declared identifiers (code only): ' + C.size);
console.log('ADDED   (' + added.length + '): ' + added.join(', '));
console.log('REMOVED (' + removed.length + '): ' + removed.join(', '));
