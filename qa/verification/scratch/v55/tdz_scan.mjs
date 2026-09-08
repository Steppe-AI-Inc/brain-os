// VERIFIER #55 — my own block-scope TDZ analysis over EVERY const/let/class in a TS source.
// Not #54's tdz.mjs. Tokenises with a state machine (comments, strings, template literals,
// regex literals skipped), tracks a scope tree of `{...}` blocks and marks which blocks are
// FUNCTION bodies (function/arrow/method). For every const/let/class declaration D in block B,
// every identifier use U of the same name that
//   (a) is lexically BEFORE D,
//   (b) sits inside B (B encloses U), and
//   (c) is not shadowed by a nearer declaration of the same name enclosing U,
// is reported. A use that sits inside a nested FUNCTION body relative to B is DEFERRED (only a TDZ
// if that function is invoked before D executes) and is reported separately; a use that is
// executed synchronously in B's straight-line flow is a P0 (ReferenceError at runtime).
import fs from 'node:fs';

const SRC = process.env.SEM_INDEX_SRC || process.argv[2];
if (!SRC) { console.error('usage: tdz_scan.mjs <index.ts>'); process.exit(2); }
const text = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
const KEYWORDS_BEFORE_REGEX = /(?:^|[^\w$])(return|typeof|case|of|do|in|instanceof|new|delete|void|throw|else|yield|await)$/;

// ---- tokenise ------------------------------------------------------------------------
const toks = []; // {t:'id'|'punc'|'kw', v, pos}
let i = 0, prevSig = '', prevWordBuf = '';
const isIdStart = (c) => /[A-Za-z_$]/.test(c);
const isId = (c) => /[\w$]/.test(c);
function skipTemplate(j) {
  // j at the opening backtick; returns index just past the closing backtick, handling ${...} nesting
  j++;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && text[j + 1] === '{') {
      j += 2; let depth = 1;
      while (j < text.length && depth > 0) {
        const d = text[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '`') { j = skipTemplate(j); continue; }
        if (d === "'" || d === '"') { let k = j + 1; while (k < text.length && text[k] !== d) { if (text[k] === '\\') k++; k++; } j = k + 1; continue; }
        if (d === '/' && text[j + 1] === '/') { j = text.indexOf('\n', j); if (j < 0) j = text.length; continue; }
        if (d === '/' && text[j + 1] === '*') { j = text.indexOf('*/', j) + 2; continue; }
        if (d === '{') depth++;
        else if (d === '}') depth--;
        j++;
      }
      continue;
    }
    j++;
  }
  return j;
}
while (i < text.length) {
  const c = text[i];
  const two = text.slice(i, i + 2);
  if (two === '//') { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl + 1; continue; }
  if (two === '/*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < text.length) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === c || text[j] === '\n') break; j++; }
    toks.push({ t: 'str', v: text.slice(i, j + 1), pos: i }); i = j + 1; prevSig = 's'; continue;
  }
  if (c === '`') { const j = skipTemplate(i); toks.push({ t: 'str', v: '`…`', pos: i }); i = j; prevSig = 's'; continue; }
  if (c === '/') {
    const regexAllowed = prevSig === '' || PREV_ALLOWS_REGEX.has(prevSig) || (prevSig === 'w' && KEYWORDS_BEFORE_REGEX.test(prevWordBuf));
    if (regexAllowed) {
      let j = i + 1, inClass = false, ok = false;
      while (j < text.length) {
        const d = text[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true; else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { ok = true; break; }
        else if (d === '\n') break;
        j++;
      }
      if (ok) { j++; while (j < text.length && /[gimsuyvd]/.test(text[j])) j++; toks.push({ t: 'regex', v: text.slice(i, j), pos: i }); i = j; prevSig = 's'; continue; }
    }
  }
  if (isIdStart(c)) {
    let j = i + 1; while (j < text.length && isId(text[j])) j++;
    const w = text.slice(i, j);
    toks.push({ t: 'id', v: w, pos: i }); i = j; prevSig = 'w'; prevWordBuf = w; continue;
  }
  if (/\s/.test(c)) { i++; continue; }
  // punctuation: handle => as one token
  if (two === '=>') { toks.push({ t: 'p', v: '=>', pos: i }); i += 2; prevSig = '>'; continue; }
  toks.push({ t: 'p', v: c, pos: i }); i++; prevSig = c;
}

// ---- scope tree -------------------------------------------------------------------------
// Determine for each `{` whether it opens a FUNCTION body. Heuristic on the preceding tokens:
//   ... ) {  where the matching ( is preceded by `function [name]` or by an identifier/`get`/`set`
//            in an object/class member position, or followed-by `=>` (arrow with block body)
//   => {     arrow block body
const blocks = []; // {id, open, close, parent, isFn}
const stack = [];
const tokBlockOpen = new Map(); // token index -> block
function matchingOpenParen(k) { // k = index of ')' token, return index of matching '('
  let depth = 0;
  for (let q = k; q >= 0; q--) {
    const v = toks[q].v;
    if (toks[q].t === 'p') { if (v === ')') depth++; else if (v === '(') { depth--; if (depth === 0) return q; } }
  }
  return -1;
}
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.t !== 'p') continue;
  if (tk.v === '{') {
    let isFn = false;
    const p = toks[k - 1];
    if (p) {
      if (p.v === '=>') isFn = true;
      else if (p.v === ')') {
        const o = matchingOpenParen(k - 1);
        const before = toks[o - 1];
        const before2 = toks[o - 2];
        if (before && before.t === 'id') {
          if (before.v === 'function') isFn = true;
          else if (before2 && before2.t === 'id' && before2.v === 'function') isFn = true; // function name(
          else if (before2 && (before2.v === 'async' || before2.v === 'get' || before2.v === 'set' || before2.v === 'static')) isFn = true;
          else if (!['if', 'for', 'while', 'switch', 'catch', 'with'].includes(before.v)) {
            // possible method shorthand `name(...) {` — only if before-before is `{`, `,`, `;`, `}` or start of class body
            if (!before2 || ['{', ',', ';', '}'].includes(before2.v)) isFn = true;
          }
        } else if (before && before.v === '>' ) {
          // generic function: function name<T>(...) — treat as fn
          isFn = true;
        }
      } else if (p.t === 'id' && (p.v === 'else' || p.v === 'try' || p.v === 'finally' || p.v === 'do')) isFn = false;
      // TS return type annotation: `): Type {` — find the ')' before the ':' chain
      else if (p.t === 'id' || p.v === '>' || p.v === ']') {
        // walk back over a type annotation to a ':' then ')'
        let q = k - 1, depthA = 0;
        while (q >= 0) {
          const v = toks[q].v;
          if (v === '>' || v === ']' ) depthA++;
          else if (v === '<' || v === '[') depthA--;
          else if (depthA === 0 && v === ':') { q--; break; }
          else if (depthA === 0 && (v === ';' || v === '{' || v === '}' || v === ')' )) break;
          q--;
        }
        if (q >= 0 && toks[q].v === ')') {
          const o = matchingOpenParen(q);
          const before = toks[o - 1], before2 = toks[o - 2];
          if (before && (before.v === 'function' || (before2 && before2.v === 'function') || (before2 && ['async', 'get', 'set', 'static', '{', ',', ';', '}'].includes(before2.v) && !['if', 'for', 'while', 'switch', 'catch'].includes(before.v)))) isFn = true;
          // arrow with return type `(a): R => {` handled by '=>' case; `): R {` is a function
        }
      }
    }
    const b = { id: blocks.length, open: k, close: -1, parent: stack.length ? stack[stack.length - 1] : null, isFn };
    blocks.push(b); stack.push(b); tokBlockOpen.set(k, b);
  } else if (tk.v === '}') {
    const b = stack.pop();
    if (b) b.close = k;
  }
}
// ---- parameter scopes, for-head scopes, catch scopes -------------------------------------
// Without these, an arrow parameter `c` in `(c: any) => c.id` resolves to a LATER `const c` in the
// enclosing block and is reported as a false TDZ. Each is a pseudo-block that carries its bindings.
const paramDecls = []; // {name, tok, blockRef} attached after blocks are finalised
function collectParams(openParen, closeParen) {
  // binding identifiers at depth 1 between the parens; skip TS type annotations (`: T`) and defaults (`= v`)
  const out = []; let depth = 0; let mode = 'bind';
  for (let r = openParen; r <= closeParen; r++) {
    const v = toks[r].v, t = toks[r].t;
    if (v === '(' || v === '[' || v === '{' || v === '<') { depth++; if (r === openParen) continue; }
    else if (v === ')' || v === ']' || v === '}' || v === '>') { depth--; if (r === closeParen) break; continue; }
    if (depth === 1 && v === ',') { mode = 'bind'; continue; }
    if (depth === 1 && (v === ':' || v === '=')) { mode = 'skip'; continue; }
    if (mode === 'bind' && t === 'id' && depth >= 1 && depth <= 2 && !['async', 'readonly', 'public', 'private', 'protected'].includes(v)) out.push(r);
    // destructured params `{ a, b }` at depth 2: `key: binding` forms are approximated by taking the last id before , or }
  }
  return out;
}
function exprEnd(k) { // end (exclusive token index) of an expression starting at token k
  let depth = 0;
  for (let r = k; r < toks.length; r++) {
    const v = toks[r].v;
    if (v === '(' || v === '[' || v === '{') depth++;
    else if (v === ')' || v === ']' || v === '}') { if (depth === 0) return r; depth--; }
    else if (depth === 0 && (v === ',' || v === ';')) return r;
  }
  return toks.length;
}
const pseudo = [];
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.v === '=>') {
    let paramToks = [];
    let start = k - 1;
    if (toks[k - 1].v === ')') { const o = matchingOpenParen(k - 1); paramToks = collectParams(o, k - 1); start = o; }
    else if (toks[k - 1].t === 'id') { paramToks = [k - 1]; start = k - 1; }
    else {
      // `(a): R =>` — walk back over the return type to the ')'
      let q = k - 1, d = 0;
      while (q >= 0) { const v = toks[q].v; if (v === '>' || v === ']') d++; else if (v === '<' || v === '[') d--; else if (d === 0 && v === ':') { q--; break; } else if (d === 0 && (v === ';' || v === '{' || v === '}' )) break; q--; }
      if (q >= 0 && toks[q].v === ')') { const o = matchingOpenParen(q); paramToks = collectParams(o, q); start = o; }
    }
    let end;
    if (toks[k + 1] && toks[k + 1].v === '{') { const b = tokBlockOpen.get(k + 1); end = b ? b.close : exprEnd(k + 1); }
    else end = exprEnd(k + 1);
    const pb = { id: 'arrow@' + k, open: start, close: end, parent: null, isFn: true, pseudo: true };
    pseudo.push(pb);
    for (const pt of paramToks) paramDecls.push({ name: toks[pt].v, tok: pt, block: pb });
  }
}
// function / method bodies: params go into the body block
for (const b of blocks) {
  if (!b.isFn) continue;
  let q = b.open - 1;
  // walk back over an optional return type to the ')'
  if (toks[q].v !== ')' && toks[q].v !== '=>') {
    let d = 0;
    while (q >= 0) { const v = toks[q].v; if (v === '>' || v === ']') d++; else if (v === '<' || v === '[') d--; else if (d === 0 && v === ':') { q--; break; } else if (d === 0 && (v === ';' || v === '{' || v === '}')) break; q--; }
  }
  if (q >= 0 && toks[q].v === ')') { const o = matchingOpenParen(q); for (const pt of collectParams(o, q)) paramDecls.push({ name: toks[pt].v, tok: pt, block: b }); }
}
// for-heads and catch clauses: scope = the statement (head + body block)
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.t !== 'id' || (tk.v !== 'for' && tk.v !== 'catch')) continue;
  let o = k + 1; if (toks[o] && toks[o].v === 'await') o++;
  if (!toks[o] || toks[o].v !== '(') continue;
  let depth = 0, c = -1;
  for (let r = o; r < toks.length; r++) { const v = toks[r].v; if (v === '(') depth++; else if (v === ')') { depth--; if (depth === 0) { c = r; break; } } }
  if (c < 0) continue;
  const body = toks[c + 1] && toks[c + 1].v === '{' ? tokBlockOpen.get(c + 1) : null;
  const end = body ? body.close : exprEnd(c + 1);
  const pb = { id: tk.v + '@' + k, open: o, close: end, parent: null, isFn: false, pseudo: true };
  pseudo.push(pb);
  if (tk.v === 'catch') { for (const pt of collectParams(o, c)) paramDecls.push({ name: toks[pt].v, tok: pt, block: pb }); }
  // for-head const/let declarations are re-homed to the pseudo block below (see decl scan)
  pb.isForHead = tk.v === 'for'; pb.headOpen = o; pb.headClose = c;
}
for (const pb of pseudo) blocks.push(pb);
// recompute parents over the union of real + pseudo blocks
for (const b of blocks) {
  let best = null;
  for (const o of blocks) {
    if (o === b) continue;
    if (o.open <= b.open && o.close >= b.close && !(o.open === b.open && o.close === b.close && blocks.indexOf(o) > blocks.indexOf(b))) {
      if (!best || o.open > best.open || (o.open === best.open && o.close < best.close)) best = o;
    }
  }
  b.parent = best;
}
const ROOT = { id: -1, open: -1, close: toks.length, parent: null, isFn: false };
function blockAt(k) { // innermost block containing token index k
  let best = ROOT;
  for (const b of blocks) if (b.open < k && (b.close === -1 || k < b.close)) { if (best === ROOT || b.open > best.open) best = b; }
  return best;
}
function encloses(outer, inner) { // does block `outer` enclose block `inner` (inclusive)?
  for (let b = inner; b; b = b.parent) if (b === outer) return true;
  return outer === ROOT;
}
function crossesFunction(useBlock, declBlock) { // is there a FUNCTION block between useBlock (inclusive) and declBlock (exclusive)?
  for (let b = useBlock; b && b !== declBlock; b = b.parent) if (b.isFn) return true;
  return false;
}

// ---- declarations -------------------------------------------------------------------------
// const/let/class declarations, including destructuring `const { a, b: c } = ...` and `const [x, y] =`
const decls = []; // {name, tok, block}
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.t !== 'id' || !['const', 'let', 'class'].includes(tk.v)) continue;
  // skip `const enum`, `declare`... rare
  const blk = blockAt(k);
  let q = k + 1;
  if (tk.v === 'class') { if (toks[q] && toks[q].t === 'id') decls.push({ name: toks[q].v, tok: q, block: blk }); continue; }
  if (toks[q] && toks[q].t === 'id') { decls.push({ name: toks[q].v, tok: q, block: blk }); continue; }
  if (toks[q] && (toks[q].v === '{' || toks[q].v === '[')) {
    // destructuring: collect binding names until matching close, respecting `key: binding` and defaults
    const openV = toks[q].v; const closeV = openV === '{' ? '}' : ']';
    let depth = 0; let expectBinding = true; let lastId = null;
    for (let r = q; r < toks.length; r++) {
      const v = toks[r].v;
      if (v === '{' || v === '[' || v === '(') depth++;
      else if (v === '}' || v === ']' || v === ')') { depth--; if (depth === 0) { if (lastId) decls.push(lastId); break; } }
      if (depth === 1 && toks[r].t === 'id') { lastId = { name: v, tok: r, block: blk }; }
      else if (depth === 1 && v === ':') { lastId = null; } // `key:` — the binding comes next
      else if (depth === 1 && v === ',') { if (lastId) decls.push(lastId); lastId = null; }
      else if (depth === 1 && v === '=') { if (lastId) decls.push(lastId); lastId = null; /* default: skip to next , */
        let d2 = 0; for (let s = r + 1; s < toks.length; s++) { const w = toks[s].v; if (w === '{' || w === '[' || w === '(') d2++; else if (w === '}' || w === ']' || w === ')') { if (d2 === 0) { r = s - 1; break; } d2--; } else if (w === ',' && d2 === 0) { r = s - 1; break; } } }
    }
  }
}
for (const d of paramDecls) decls.push(d);
const byName = new Map();
for (const d of decls) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }

// ---- uses ---------------------------------------------------------------------------------
const lineOf = (pos) => text.slice(0, pos).split('\n').length;
const p0 = [], deferred = [];
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.t !== 'id' || !byName.has(tk.v)) continue;
  // skip property accesses `.name`, object keys `name:` in literals (imperfect), and the declaration token itself
  const prev = toks[k - 1], next = toks[k + 1];
  if (prev && prev.v === '.') continue;
  if (prev && prev.t === 'id' && ['const', 'let', 'class', 'function', 'var', 'interface', 'type', 'enum', 'import'].includes(prev.v)) continue;
  if (next && next.v === ':' && prev && (prev.v === '{' || prev.v === ',')) continue; // object key
  const useBlock = blockAt(k);
  // resolve: nearest enclosing declaration of this name, by innermost block, ignoring lexical order
  const cands = byName.get(tk.v).filter((d) => d.tok !== k && encloses(d.block, useBlock));
  if (!cands.length) continue;
  // innermost block wins; if same block, the later one shadows nothing (redeclaration illegal) — take the first
  cands.sort((a, b) => (b.block.open - a.block.open));
  const d = cands[0];
  if (d.tok > k) {
    const rec = { name: tk.v, useLine: lineOf(tk.pos), declLine: lineOf(toks[d.tok].pos), declBlockOpenLine: d.block === ROOT ? 0 : lineOf(toks[d.block.open].pos) };
    if (crossesFunction(useBlock, d.block)) deferred.push(rec); else p0.push(rec);
  }
}
console.log('TDZ SCAN', SRC);
console.log('declarations (const/let/class):', decls.length, ' blocks:', blocks.length, ' function-body blocks:', blocks.filter((b) => b.isFn).length);
console.log('SYNCHRONOUS use-before-declaration in an enclosing block (P0 class):', p0.length);
for (const r of p0) console.log('  P0 ', r.name, 'use :' + r.useLine, 'decl :' + r.declLine, 'declBlockOpens :' + r.declBlockOpenLine);
console.log('DEFERRED (use inside a nested function declared before the binding; TDZ only if invoked early):', deferred.length);
for (const r of deferred) console.log('  DEF', r.name, 'use :' + r.useLine, 'decl :' + r.declLine, 'declBlockOpens :' + r.declBlockOpenLine);
process.exit(p0.length ? 1 : 0);
