// v43: SAME-CLASS SEARCH for the V43-D4 defect class — an assertion helper called with MORE
// arguments than it declares, so the boolean lands in an ignored parameter and the description
// string lands in `cond`. Scans every .mjs suite: finds arrow/function assertion helpers whose
// parameter list contains a condition-shaped name, then counts top-level arguments at each call.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '../../../scenarios-runner');

function splitArgs(s) {
  const out = []; let d = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { cur += c + s[++i]; continue; } if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function callArgs(src, start) { // start = index of '('
  let d = 0, q = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return src.slice(start + 1, i); }
  }
  return null;
}

let flagged = 0, scanned = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.mjs')).sort()) {
  const src = readFileSync(resolve(DIR, f), 'utf8');
  // declared assertion helpers
  const decls = [...src.matchAll(/(?:const|let|var)\s+(\w*(?:check|assert|expect|ok|must|require)\w*)\s*=\s*\(([^)]*)\)\s*=>/gi)]
    .concat([...src.matchAll(/function\s+(\w*(?:check|assert|expect|ok|must|require)\w*)\s*\(([^)]*)\)/gi)]);
  for (const d of decls) {
    const name = d[1];
    const params = splitArgs(d[2]).filter(Boolean);
    if (params.some((p) => p.startsWith('...'))) continue; // rest param: arity-safe
    scanned++;
    const re = new RegExp('(?<![\\w.])' + name + '\\s*\\(', 'g');
    let m; const bad = [];
    while ((m = re.exec(src)) !== null) {
      if (m.index === d.index || src.slice(0, m.index).match(/(?:const|let|var|function)\s*$/)) continue;
      const inner = callArgs(src, m.index + m[0].length - 1);
      if (inner === null) continue;
      const args = splitArgs(inner);
      const line = src.slice(0, m.index).split('\n').length;
      if (args.length > params.length) bad.push({ line, got: args.length, why: 'over-arity: the boolean is dropped' });
      const ci = params.findIndex((p) => /^(cond|ok|pass|condition|expr|assertion|holds|truthy)$/i.test(p));
      if (ci >= 0 && args.length > ci && /^["'`]/.test(args[ci])) bad.push({ line, got: args.length, why: 'STRING LITERAL in the `' + params[ci] + '` position: always truthy' });
    }
    if (bad.length) {
      flagged++;
      console.log(`VACUITY-RISK  ${f}  helper ${name}(${params.join(', ')}) declares ${params.length} params`);
      for (const b of bad) console.log(`    line ${b.line}: called with ${b.got} arguments — ${b.why}`);
    }
  }
}
console.log(`\nv43_arity_sweep: ${scanned} assertion helpers scanned, ${flagged} with over-arity call sites`);
process.exit(0);
