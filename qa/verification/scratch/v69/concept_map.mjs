// VERIFIER #69 — THE STRUCTURAL QUESTION, mechanised:
//   WHICH CONSUMER OF THIS CONCEPT DOES NOT DERIVE FROM ITS DEFINITION?
//
// Instrument note (the #68 standard): the FIRST version of this scan read only TOP-LEVEL
// alternation members, so a vocabulary nested inside a regex group was invisible — which is
// precisely the blindness the founder named in concept_duplication_ratchet_contract. Members are
// now collected at EVERY nesting depth. Self-tests below prove both properties before the scan runs.
import fs from 'node:fs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';

function extractLiterals(src) {
  const out = []; let i = 0, line = 1; const n = src.length; let prev = '';
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c, sl = line; let j = i + 1, buf = '';
      while (j < n) { if (src[j] === '\\') { buf += src[j + 1]; j += 2; continue; } if (src[j] === q) break; if (src[j] === '\n') { line++; if (q !== '`') break; } buf += src[j]; j++; }
      out.push({ kind: 'string', line: sl, text: buf }); i = j + 1; prev = 'lit'; continue;
    }
    if (c === '/') {
      const allow = prev === '' || /[=(,:[!&|?{};+\-*%~^<>]$/.test(prev) || /\b(return|typeof|case|in|of|new|delete|void|do|else|instanceof)$/.test(prev);
      if (allow) {
        const sl = line; let j = i + 1, buf = '', cls = false, ok = false;
        while (j < n) { const d = src[j]; if (d === '\\') { buf += d + src[j + 1]; j += 2; continue; } if (d === '\n') break; if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) { ok = true; break; } buf += d; j++; }
        if (ok) { let k = j + 1; while (k < n && /[dgimsuvy]/.test(src[k])) k++; out.push({ kind: 'regex', line: sl, text: buf }); i = k; prev = 'lit'; continue; }
      }
      i++; prev = '/'; continue;
    }
    let j = i;
    if (/[A-Za-z0-9_$]/.test(c)) { while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; prev = src.slice(i, j); }
    else if (/\s/.test(c)) { j = i + 1; }
    else { j = i + 1; prev = c; }
    i = j;
  }
  return out;
}

// Collect alternation members at EVERY nesting depth.
function membersDeep(text) {
  const set = new Set();
  // NOTE: the group-prefix strip must consume EXACTLY `?:` `?=` `?!` `?<=` `?<!` `?<name>`.
  // An earlier `\?[:=!<][a-z]*` was greedy and ate the first alternative of every group
  // ("(?:create|update)" -> "|update", losing "create"). Caught by this file's own self-test.
  const GROUP_PREFIX = /\(\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/g;
  const clean = (p) => p.replace(GROUP_PREFIX, '(').replace(/[\\^$()\[\]{}?*+.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const addAlts = (s) => {
    let depth = 0, cls = false, cur = '';
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + s[i + 1]; i++; continue; }
      if (c === '[') cls = true; else if (c === ']') cls = false;
      else if (!cls && c === '(') depth++;
      else if (!cls && c === ')') depth--;
      if (!cls && depth === 0 && c === '|') { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    for (const p of parts) {
      const t = clean(p);
      if (t.length >= 3 && /^[a-z][a-z '’-]*$/.test(t)) set.add(t);
    }
  };
  addAlts(text);
  // recurse into every group body
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] !== '(') continue;
    let d = 0, cls = false, j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (c === '\\') { j++; continue; }
      if (c === '[') cls = true; else if (c === ']') cls = false;
      else if (!cls && c === '(') d++;
      else if (!cls && c === ')') { d--; if (d === 0) break; }
    }
    if (j < text.length) addAlts(text.slice(i + 1, j).replace(/^\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/, ''));
  }
  return set;
}

// ---------- instrument self-test ----------
{
  const fails = [];
  const nested = membersDeep('\\b(?:(?:create|update) (?:the |a )?(?:company|work order|task)\\b|other)');
  if (!nested.has('company') || !nested.has('work order') || !nested.has('task')) fails.push('NESTED vocabulary not seen — the exact blindness this instrument exists to remove');
  if (!nested.has('create') || !nested.has('update')) fails.push('nested verb group not seen');
  const top = membersDeep('alpha|beta|gamma');
  if (!(top.has('alpha') && top.has('beta') && top.has('gamma'))) fails.push('top-level members lost');
  const lits = extractLiterals(`const a = /x|y/i; const b = a / 2; const c = "p|q"; // /nope|nope2/\n`);
  if (!lits.some(l => l.kind === 'regex' && l.text === 'x|y')) fails.push('regex literal missed');
  if (lits.some(l => l.text.includes('nope'))) fails.push('comment read as a literal');
  if (!lits.some(l => l.kind === 'string' && l.text === 'p|q')) fails.push('string literal missed');
  if (fails.length) { console.error('INSTRUMENT SELFTEST FAILED:\n  ' + fails.join('\n  ')); process.exit(2); }
  console.log('instrument selftest: 6/6 OK (nested-depth extraction proven)');
}

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split(/\r?\n/);

// Canonical definitions, resolved from source.
const CANON_NAMES = ['ENTITY_NOUN_ALTERNATION', 'REQUEST_FRAME_ADDRESSED', 'REQUEST_FRAME_DELIBERATIVE',
  'CONFIRMATION_ALTERNATION', 'MUTATION_VERB_ALTERNATION'];
const canon = {};
const declSpan = {};
for (const name of CANON_NAMES) {
  const at = src.indexOf('const ' + name + ' = ');
  if (at < 0) { console.error('missing canonical', name); process.exit(2); }
  let d = 0, end = -1;
  for (let i = at; i < src.length; i++) { const ch = src[i]; if ('(['.includes(ch) || ch === '{') d++; else if (')]'.includes(ch) || ch === '}') d--; else if (ch === ';' && d === 0) { end = i; break; } }
  const body = src.slice(at, end);
  canon[name] = membersDeep(body);
  const l0 = src.slice(0, at).split(/\r?\n/).length;
  const l1 = src.slice(0, end).split(/\r?\n/).length;
  declSpan[name] = [l0, l1];
}
// REQUEST_FRAME_ALTERNATION is the union of ADDRESSED + its own extra members
{
  const at = src.indexOf('const REQUEST_FRAME_ALTERNATION = ');
  let d = 0, end = -1;
  for (let i = at; i < src.length; i++) { const ch = src[i]; if ('(['.includes(ch) || ch === '{') d++; else if (')]'.includes(ch) || ch === '}') d--; else if (ch === ';' && d === 0) { end = i; break; } }
  canon.REQUEST_FRAME_ALTERNATION = new Set([...canon.REQUEST_FRAME_ADDRESSED, ...membersDeep(src.slice(at, end))]);
  declSpan.REQUEST_FRAME_ALTERNATION = [src.slice(0, at).split(/\r?\n/).length, src.slice(0, end).split(/\r?\n/).length];
}

const lits = extractLiterals(src);
const rows = [];
for (const lit of lits) {
  const ms = membersDeep(lit.text);
  if (ms.size < 4) continue;
  for (const [name, cset] of Object.entries(canon)) {
    const [a, b] = declSpan[name] || [0, 0];
    if (lit.line >= a && lit.line <= b) continue;          // part of the definition itself
    const shared = [...ms].filter((x) => cset.has(x));
    if (shared.length < 4) continue;
    // does the STATEMENT containing this literal reference the canonical name?
    let s = lit.line - 1; while (s > 0 && !/^\s*(?:const|let|var|function|return|\}|\/\/)/.test(lines[s])) s--;
    let e = lit.line; while (e < lines.length && !/;\s*$/.test(lines[e - 1])) e++;
    const stmt = lines.slice(Math.max(0, s - 1), Math.min(lines.length, e + 1)).join('\n');
    const derives = stmt.includes(name);
    const missing = [...cset].filter((x) => !ms.has(x));
    rows.push({ line: lit.line, canon: name, shared: shared.length, ownSize: ms.size, derives, missingCount: missing.length, missing });
  }
}
rows.sort((a, b) => (a.derives - b.derives) || (b.shared - a.shared));
console.log('\n=== CONSUMERS OF A CANONICAL VOCABULARY (>=4 shared members) ===');
console.log('STATUS    LINE   CANONICAL                       shared  ownAlts  canonWordsMISSING');
for (const r of rows) {
  console.log((r.derives ? 'DERIVES ' : 'RESPELL!').padEnd(10) + ('L' + r.line).padEnd(7) + r.canon.padEnd(32) + String(r.shared).padEnd(8) + String(r.ownSize).padEnd(9) + r.missingCount);
}
const bad = rows.filter((r) => !r.derives);
console.log('\nINLINE RE-SPELLINGS THAT DO NOT DERIVE: ' + bad.length);
for (const r of bad) {
  console.log('\n--- L' + r.line + '  re-spells ' + r.canon + ' (' + r.shared + ' shared, ' + r.missingCount + ' canonical words absent)');
  console.log('    source: ' + (lines[r.line - 1] || '').trim().slice(0, 150));
  console.log('    ABSENT FROM THE RE-SPELLING: ' + r.missing.slice(0, 60).join(', '));
}
fs.writeFileSync('qa/verification/scratch/v69/concept_map.json', JSON.stringify(rows, null, 2));
