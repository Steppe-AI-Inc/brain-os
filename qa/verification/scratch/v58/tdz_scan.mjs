// VERIFIER #58 — own block-scope use-before-declaration (TDZ) scan over index.ts.
// Method (independent of #54/#55): tokenise with a small state machine (comments/strings/templates/regex skipped),
// build a brace-block tree marking FUNCTION bodies (function keyword, `=>` block bodies, method shorthand),
// collect every const/let/class binding (incl. destructuring and for-heads) with its block, then for each use of a
// bound name that (a) precedes the declaration lexically, (b) sits inside the declaring block, and (c) is not
// shadowed by a nearer binding, classify: SYNC (runtime ReferenceError on that path) vs DEFERRED (use inside a nested
// function body — only fatal if invoked before the declaration executes). Type-literal keys (`{ x?: T }` inside `as`)
// are excluded by construction: a name followed by `?:` / `:` right after `{` or `,` inside an `as {` annotation.
import fs from 'node:fs';
const SRC = process.env.SEM_INDEX_SRC || process.argv[2];
if (!SRC) { console.error('usage: tdz_scan.mjs <index.ts>'); process.exit(2); }
const text = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lineOf = (pos) => text.slice(0, pos).split('\n').length;

// ---- tokenise ----
const toks = []; let i = 0; let prevSig = '';
const canRegex = () => prevSig === '' || '=(,:[!&|?;{}+*%~^<>'.includes(prevSig) || /(?:^|\W)(return|typeof|case|of|do|in|instanceof|new|delete|void|throw|else|yield|await)$/.test(prevSig);
while (i < text.length) {
  const c = text[i], two = text.slice(i, i + 2);
  if (two === '//') { const j = text.indexOf('\n', i); i = j < 0 ? text.length : j + 1; continue; }
  if (two === '/*') { const j = text.indexOf('*/', i + 2); i = j < 0 ? text.length : j + 2; continue; }
  if (c === '"' || c === "'") { let j = i + 1; while (j < text.length && text[j] !== c && text[j] !== '\n') { if (text[j] === '\\') j++; j++; } toks.push({ t: 's', v: '""', pos: i }); i = j + 1; prevSig = 's'; continue; }
  if (c === '`') {
    let j = i + 1; const stack = [];
    while (j < text.length) {
      const d = text[j];
      if (d === '\\') { j += 2; continue; }
      if (stack.length === 0) { if (d === '`') break; if (d === '$' && text[j + 1] === '{') { stack.push('${'); j += 2; continue; } j++; continue; }
      // inside ${ }: track braces and nested strings/templates crudely
      if (d === '{') stack.push('{'); else if (d === '}') stack.pop();
      else if (d === '`') { let k = j + 1; let inner = 0; while (k < text.length) { if (text[k] === '\\') { k += 2; continue; } if (text[k] === '$' && text[k + 1] === '{') inner++; else if (inner && text[k] === '}') inner--; else if (!inner && text[k] === '`') break; k++; } j = k; }
      else if (d === '"' || d === "'") { let k = j + 1; while (k < text.length && text[k] !== d) { if (text[k] === '\\') k++; k++; } j = k; }
      j++;
    }
    toks.push({ t: 's', v: '``', pos: i }); i = j + 1; prevSig = 's'; continue;
  }
  if (c === '/' && canRegex()) {
    let j = i + 1, inClass = false, ok = false;
    while (j < text.length) { const d = text[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) { ok = true; break; } else if (d === '\n') break; j++; }
    if (ok) { j++; while (j < text.length && /[a-z]/.test(text[j])) j++; toks.push({ t: 're', v: '/re/', pos: i }); i = j; prevSig = 's'; continue; }
  }
  if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < text.length && /[\w$]/.test(text[j])) j++; const w = text.slice(i, j); toks.push({ t: 'id', v: w, pos: i }); i = j; prevSig = w; continue; }
  if (/[0-9]/.test(c)) { let j = i + 1; while (j < text.length && /[\w.]/.test(text[j])) j++; toks.push({ t: 'n', v: text.slice(i, j), pos: i }); i = j; prevSig = 'n'; continue; }
  if (/\s/.test(c)) { i++; continue; }
  if (two === '=>') { toks.push({ t: 'p', v: '=>', pos: i }); i += 2; prevSig = '>'; continue; }
  if (two === '?.' ) { toks.push({ t: 'p', v: '?.', pos: i }); i += 2; prevSig = '.'; continue; }
  toks.push({ t: 'p', v: c, pos: i }); i++; prevSig = c;
}

// ---- blocks ----
const matchOpen = (k) => { let d = 0; for (let q = k; q >= 0; q--) { if (toks[q].v === ')') d++; else if (toks[q].v === '(') { d--; if (d === 0) return q; } } return -1; };
const blocks = []; const stack = []; const openAt = new Map();
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.v === '{') {
    let isFn = false, isTypeLit = false;
    const p = toks[k - 1], p2 = toks[k - 2];
    if (p) {
      if (p.v === '=>') isFn = true;
      else if (p.v === ')') {
        const o = matchOpen(k - 1); const b1 = toks[o - 1], b2 = toks[o - 2];
        if (b1 && b1.t === 'id') {
          if (b1.v === 'function' || (b2 && b2.v === 'function')) isFn = true;
          else if (b2 && ['async', 'get', 'set', 'static'].includes(b2.v)) isFn = true;
          else if (!['if', 'for', 'while', 'switch', 'catch', 'with'].includes(b1.v) && b2 && ['{', ',', ';', '}'].includes(b2.v)) isFn = true; // method shorthand
        }
      } else if (p.v === 'as' || (p.t === 'id' && p.v === 'as')) isTypeLit = true;
      else if (p.v === ':' || p.v === '|' || p.v === '&' || p.v === '<' || p.v === '=' && p2 && p2.t === 'id' && toks[k - 3] && toks[k - 3].v === 'type') isTypeLit = p.v !== '=' || (toks[k - 3] && toks[k - 3].v === 'type');
      else if (p.t === 'id' && !['else', 'try', 'finally', 'do', 'return', 'yield', 'await', 'typeof', 'in', 'of', 'new'].includes(p.v)) {
        // `): Type {` return-type annotated function — walk back through the annotation to a ')'
        let q = k - 1, d = 0;
        while (q >= 0) { const v = toks[q].v; if (v === '>' || v === ']') d++; else if (v === '<' || v === '[') d--; else if (d === 0 && v === ':') { q--; break; } else if (d === 0 && (v === ';' || v === '{' || v === '}' || v === ')')) break; q--; }
        if (q >= 0 && toks[q].v === ')') { const o = matchOpen(q); const b1 = toks[o - 1], b2 = toks[o - 2]; if (b1 && (b1.v === 'function' || (b2 && (b2.v === 'function' || ['async', 'get', 'set', 'static'].includes(b2.v))))) isFn = true; }
      }
    }
    const b = { open: k, close: -1, parent: stack.length ? stack[stack.length - 1] : null, isFn, isTypeLit };
    blocks.push(b); stack.push(b); openAt.set(k, b);
  } else if (tk.v === '}') { const b = stack.pop(); if (b) b.close = k; }
}
const blockAt = (k) => { let best = null; for (const b of blocks) if (b.open < k && k < b.close) { if (!best || b.open > best.open) best = b; } return best; };
const encloses = (outer, inner) => { if (outer === null) return true; for (let b = inner; b; b = b.parent) if (b === outer) return true; return false; };
const crossesFn = (use, decl) => { for (let b = use; b && b !== decl; b = b.parent) if (b.isFn) return true; return false; };
const inTypeLit = (k) => { for (let b = blockAt(k); b; b = b.parent) if (b.isTypeLit) return true; return false; };

// ---- bindings ----
const decls = [];
const params = (o, c, blk) => { let d = 0; let bind = true; for (let r = o + 1; r < c; r++) { const v = toks[r].v; if (v === '(' || v === '[' || v === '{' || v === '<') { d++; continue; } if (v === ')' || v === ']' || v === '}' || v === '>') { d--; continue; } if (d === 0 && v === ',') { bind = true; continue; } if (d === 0 && (v === ':' || v === '=')) { bind = false; continue; } if (bind && toks[r].t === 'id' && d <= 1) decls.push({ name: v, tok: r, block: blk, kind: 'param' }); } };
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k];
  if (tk.t === 'id' && (tk.v === 'const' || tk.v === 'let' || tk.v === 'class')) {
    const blk = blockAt(k); let q = k + 1;
    if (toks[q].t === 'id') { decls.push({ name: toks[q].v, tok: q, block: blk, kind: tk.v }); continue; }
    if (toks[q].v === '{' || toks[q].v === '[') {
      let d = 0; let last = null;
      for (let r = q; r < toks.length; r++) {
        const v = toks[r].v;
        if (v === '{' || v === '[' || v === '(') { d++; continue; }
        if (v === '}' || v === ']' || v === ')') { d--; if (d === 0) { if (last) decls.push(last); break; } continue; }
        if (d === 1) { if (toks[r].t === 'id') last = { name: v, tok: r, block: blk, kind: tk.v + '-destructure' }; else if (v === ':') last = null; else if (v === ',') { if (last) decls.push(last); last = null; } else if (v === '=') { if (last) decls.push(last); last = null; let d2 = 0; for (let s2 = r + 1; s2 < toks.length; s2++) { const w = toks[s2].v; if ('([{'.includes(w)) d2++; else if (')]}'.includes(w)) { if (d2 === 0) { r = s2 - 1; break; } d2--; } else if (w === ',' && d2 === 0) { r = s2 - 1; break; } } } }
      }
    }
  }
  if (tk.v === '=>') { // arrow params: scope = body block or expression
    let o = -1, c = -1;
    if (toks[k - 1].v === ')') { c = k - 1; o = matchOpen(c); }
    else if (toks[k - 1].t === 'id') { const body = toks[k + 1].v === '{' ? openAt.get(k + 1) : null; decls.push({ name: toks[k - 1].v, tok: k - 1, block: body || { open: k - 1, close: exprEnd(k + 1), parent: blockAt(k), isFn: true, pseudo: true }, kind: 'param' }); continue; }
    else { let q = k - 1, d = 0; while (q >= 0) { const v = toks[q].v; if (v === '>' || v === ']') d++; else if (v === '<' || v === '[') d--; else if (d === 0 && v === ':') { q--; break; } else if (d === 0 && ';{}'.includes(v)) break; q--; } if (q >= 0 && toks[q].v === ')') { c = q; o = matchOpen(c); } }
    if (o >= 0) { const body = toks[k + 1].v === '{' ? openAt.get(k + 1) : { open: o, close: exprEnd(k + 1), parent: blockAt(k), isFn: true, pseudo: true }; if (!body.pseudo) body.paramsFrom = o; params(o, c, body); }
  }
}
function exprEnd(k) { let d = 0; for (let r = k; r < toks.length; r++) { const v = toks[r].v; if ('([{'.includes(v)) d++; else if (')]}'.includes(v)) { if (d === 0) return r; d--; } else if (d === 0 && (v === ',' || v === ';')) return r; } return toks.length; }
for (const b of blocks) { // function-declaration params → body
  if (!b.isFn) continue; let q = b.open - 1;
  if (toks[q].v !== ')' && toks[q].v !== '=>') { let d = 0; while (q >= 0) { const v = toks[q].v; if (v === '>' || v === ']') d++; else if (v === '<' || v === '[') d--; else if (d === 0 && v === ':') { q--; break; } else if (d === 0 && ';{}'.includes(v)) break; q--; } }
  if (q >= 0 && toks[q].v === ')' && toks[q - 0] && toks[b.open - 1].v !== '=>') { const o = matchOpen(q); if (o >= 0 && !(toks[o - 1] && ['if', 'for', 'while', 'switch', 'catch'].includes(toks[o - 1].v))) params(o, q, b); }
}
for (let k = 0; k < toks.length; k++) { // for-heads / catch → statement scope
  const tk = toks[k]; if (tk.t !== 'id' || (tk.v !== 'for' && tk.v !== 'catch')) continue;
  let o = k + 1; if (toks[o].v === 'await') o++; if (toks[o].v !== '(') continue;
  let d = 0, c = -1; for (let r = o; r < toks.length; r++) { if (toks[r].v === '(') d++; else if (toks[r].v === ')') { d--; if (d === 0) { c = r; break; } } }
  const body = toks[c + 1].v === '{' ? openAt.get(c + 1) : null; const pb = { open: o, close: body ? body.close : exprEnd(c + 1), parent: blockAt(k), isFn: false, pseudo: true };
  if (body) body.parent = pb; blocks.push(pb);
  if (tk.v === 'catch') params(o, c, pb);
  for (let r = o; r < c; r++) if (toks[r].t === 'id' && (toks[r].v === 'const' || toks[r].v === 'let')) { // re-home the for-head binding
    const target = decls.find((dd) => dd.tok === r + 1 || (toks[r + 1].v === '[' && dd.tok > r && dd.tok < c && dd.kind.endsWith('destructure'))); for (const dd of decls) if ((dd.tok === r + 1) || (dd.kind.endsWith('destructure') && dd.tok > r && dd.tok < c)) dd.block = pb; void target;
  }
}
const byName = new Map(); for (const d of decls) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }

// ---- uses ----
const sync = [], deferred = [];
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k]; if (tk.t !== 'id' || !byName.has(tk.v)) continue;
  const prev = toks[k - 1], next = toks[k + 1];
  if (prev && (prev.v === '.' || prev.v === '?.')) continue;
  if (prev && prev.t === 'id' && ['const', 'let', 'class', 'function', 'var', 'type', 'interface', 'enum', 'import', 'as'].includes(prev.v)) continue;
  if (next && (next.v === ':' || (next.v === '?' && toks[k + 2] && toks[k + 2].v === ':')) && prev && (prev.v === '{' || prev.v === ',')) continue; // object / type-literal key
  if (inTypeLit(k)) continue;
  const useBlock = blockAt(k);
  const cands = byName.get(tk.v).filter((d) => d.tok !== k && encloses(d.block, useBlock));
  if (!cands.length) continue;
  cands.sort((a, b) => ((b.block ? b.block.open : -1) - (a.block ? a.block.open : -1)));
  const d = cands[0];
  if (d.tok > k) { const rec = { name: tk.v, use: lineOf(tk.pos), decl: lineOf(toks[d.tok].pos), kind: d.kind }; (crossesFn(useBlock, d.block) ? deferred : sync).push(rec); }
}
console.log('V58 TDZ SCAN', SRC);
console.log(`tokens ${toks.length}, blocks ${blocks.length} (function bodies ${blocks.filter((b) => b.isFn).length}), bindings ${decls.length}`);
console.log('SYNC use-before-declaration (runtime-fatal class):', sync.length);
for (const r of sync) console.log('  SYNC', r.name, 'use :' + r.use, 'decl :' + r.decl, r.kind);
console.log('DEFERRED (inside a nested function declared earlier; fatal only if invoked before the declaration runs):', deferred.length);
for (const r of deferred) console.log('  DEF ', r.name, 'use :' + r.use, 'decl :' + r.decl, r.kind);
process.exit(sync.length ? 1 : 0);
