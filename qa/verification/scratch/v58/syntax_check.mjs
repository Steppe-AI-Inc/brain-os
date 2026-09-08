// VERIFIER #58 — deno is gated in this session. Substitute (syntax level only): detype the WHOLE index.ts with the
// repository's stripper, stub the two imports and `serve`, and parse it with V8 (new Function) — any SyntaxError
// (unbalanced braces, stray tokens, a bad regex flag/modifier the Edge runtime would reject at module load) surfaces
// here. This is NOT a type check and NOT a TDZ check; those are separate (tdz_scan.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const { stripTS } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
let s = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
s = s.replace(/^import\s.*$/gm, '');
// Multi-line `type X = { ... };` / `type X = A | { ... };` / `interface X { ... }` — brace-balanced removal (the generic
// stripper only handles a type alias that ends on its first `;`).
function stripTypeBlocks(text) {
  let out = ''; let i = 0;
  const re = /^[ \t]*(?:export\s+)?(?:type\s+\w+(?:<[^>]*>)?\s*=|interface\s+\w+(?:\s+extends\s+[\w<>, ]+)?\s*\{)/gm;
  let m; let last = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index < last) continue;
    out += text.slice(last, m.index);
    let j = m.index + m[0].length; let depth = m[0].trim().endsWith('{') ? 1 : 0;
    // consume until the alias terminates: a `;` at depth 0 (type alias) or the closing brace (interface)
    while (j < text.length) {
      const c = text[j];
      if (c === '{' || c === '<' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === '>' || c === ')' || c === ']') { depth--; if (depth === 0 && m[0].includes('interface')) { j++; break; } }
      else if (c === ';' && depth === 0) { j++; break; }
      else if (c === '\n' && depth === 0 && m[0].includes('type') && /^\s*(?:const|let|function|type|interface|\/\/|serve|export|async|$)/.test(text.slice(j + 1, j + 40)) && !/\|\s*$/.test(text.slice(m.index, j))) { break; }
      j++;
    }
    out += ' '.repeat(0); last = j; re.lastIndex = j;
  }
  out += text.slice(last);
  return out;
}
s = stripTypeBlocks(s);
// `function f<T>(` / `const f = <T>(` generics; `x satisfies T`; `as const`; index-signature params; `!` non-null before `.`/`[`/`(`
s = s.replace(/\bfunction\s+(\w+)\s*<[^>()]*>\s*\(/g, 'function $1(');
// Balanced return-type removal: `): <type> {` where <type> may carry <> {} [] () — the generic stripper stops at the
// first `{`, so `Promise<{ a: b }>` breaks it. Consume the annotation until a `{` at depth 0 that opens the body.
function stripReturnTypes(text) {
  let out = ''; let i = 0;
  while (i < text.length) {
    if (text[i] === ')' && /^\)\s*:\s*[A-Za-z_{[(]/.test(text.slice(i, i + 12))) {
      let j = text.indexOf(':', i) + 1; let depth = 0; let ok = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '<' || c === '{' || c === '[' || c === '(') { if (c === '{' && depth === 0) { ok = true; break; } depth++; }
        else if (c === '>' || c === '}' || c === ']' || c === ')') depth--;
        else if (depth === 0 && (c === ';' || c === '\n' || c === '=' )) break;
        j++;
      }
      if (ok) { out += ') '; i = j; continue; }
    }
    out += text[i]; i++;
  }
  return out;
}
s = stripReturnTypes(s);
// Typed destructured parameters `{ a, b }: { a: T; b: U }` and `[x, y]: [T, U]` — remove the balanced annotation.
function stripDestructuredParamTypes(text) {
  let out = ''; let i = 0;
  while (i < text.length) {
    const m = /^([}\]])[ \t]*:[ \t]*(?=[{[A-Za-z])/.exec(text.slice(i, i + 8));
    if (m) {
      let j = i + m[0].length; let depth = 0;
      while (j < text.length) {
        const c = text[j];
        if (c === '{' || c === '<' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === '>' || c === ']' || c === ')') { if (depth === 0) break; depth--; }
        else if (depth === 0 && (c === ',' || c === '=' || c === '\n' || c === ';')) break;
        j++;
      }
      // only a PARAMETER annotation ends at `,` or `)` or `=` (default) — a ternary continuation `] : x;` does not
      if (text[j] === ',' || text[j] === ')' || text[j] === '=') { out += m[1]; i = j; continue; }
    }
    out += text[i]; i++;
  }
  return out;
}
s = stripDestructuredParamTypes(s);
// Object-TYPE annotations on parameters/declarations: `name: { a: Map<string, unknown>; b: T }` — a balanced `{…}` that
// contains a `;` member separator or a generic (`Map<`, `Array<`, `Record<`) is a type literal, never a value.
function stripObjectTypeAnnotations(text) {
  let out = ''; let i = 0;
  while (i < text.length) {
    const m = /^([A-Za-z_$][\w$]*\??)\s*:\s*\{/.exec(text.slice(i, i + 60));
    if (m && (i === 0 || /[\s(,{;]/.test(text[i - 1]))) {
      const open = i + m[0].length - 1; let j = open; let depth = 0; let sawType = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '{' || c === '<' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === '>' || c === ')' || c === ']') { depth--; if (depth === 0) break; }
        if (depth === 1 && c === ';') sawType = true;
        if (/^(?:Map|Array|Record|Set|Promise)</.test(text.slice(j, j + 8))) sawType = true;
        j++;
      }
      if (sawType && text[j] === '}') { out += m[1]; i = j + 1; continue; }
    }
    out += text[i]; i++;
  }
  return out;
}
s = stripObjectTypeAnnotations(s);
s = s.replace(/\s+satisfies\s+[\w<>[\]|]+/g, '');
s = s.replace(/(\w|\)|\])!(?=[.[(])/g, '$1');
// TS-only constructs the generic stripper leaves: `x!` non-null on non-dot positions, `satisfies`, `as const`, generics on calls, `: is string` predicates, `declare`, enum
let js = stripTS(s);
js = js.replace(/\b(\w+)!(?=[\s;,)\]])/g, '$1');           // trailing non-null `foo!`
js = js.replace(/\bnew Map<[^>]*>\(/g, 'new Map(');         // generic ctor
js = js.replace(/\bnew Set<[^>]*>\(/g, 'new Set(');
js = js.replace(/\(\((\w+)\): \1 is [^)]*\) =>/g, '(($1) =>'); // type predicates `(id): id is string =>`
js = js.replace(/\bPromise<[^>]*>/g, 'Promise');
let ok = true; let err = null;
try { new vm.Script('(async () => {\n' + js + '\n})', { filename: 'index.detyped.js' }); }
catch (e) { ok = false; err = e; }
writeFileSync(resolve(HERE, 'index.detyped.js'), js);
if (ok) console.log('SYNTAX CHECK (V8 parse of the detyped whole file): OK —', js.length, 'chars');
else {
  console.log('SYNTAX CHECK: FAILED —', err.message);
  // locate
  const m = String(err.stack).match(/index\.detyped\.js:(\d+)/); if (m) { const ln = Number(m[1]); const lines = js.split('\n'); console.log('near line', ln, ':', lines.slice(Math.max(0, ln - 3), ln + 2).join('\n')); }
}
// Every regex literal in the ORIGINAL source must construct in V8 (a bad flag/modifier fails at module load in Deno too).
const text = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
let bad = 0, count = 0;
const re = /(^|[=(,:[!&|?;{}]|return|=>)\s*(\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*)/gm;
for (const m of text.matchAll(re)) { count++; try { new Function('return ' + m[2])(); } catch (e) { bad++; console.log('REGEX FAILS TO CONSTRUCT:', m[2].slice(0, 120), e.message); } }
console.log(`regex literals scanned: ${count}, failing to construct: ${bad}`);
process.exit(ok && bad === 0 ? 0 : 1);
