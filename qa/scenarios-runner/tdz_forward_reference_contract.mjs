#!/usr/bin/env node
// PROMOTED INTO THE BATTERY from verifier #54 (its v48_regression_additions.mjs, renamed): a general TDZ detector —
// no block-scoped const may be read before its declaration in the same block. deno reports this class as
// TS2448/TS2454; the campaign pinned a COUNT (23) for eighteen rounds and never the classes. Cwd-independent.
// VERIFIER #54 (campaign #114) — regression additions for candidate 8eb8cbd.
//
// CONTRACT rows are structural guards that must hold on ANY candidate.
// DEFECT rows reproduce a confirmed defect; each FAILS while the defect is open.
// ANY failure exits non-zero.
//
// Source resolution: SEM_INDEX_SRC, else walk up from this file. Correct from ANY cwd.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const SRC_PATH = process.env.SEM_INDEX_SRC
  ? resolve(process.env.SEM_INDEX_SRC)
  : findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC_PATH) { console.error('FATAL: sem-ai-command/index.ts not found'); process.exit(2); }
const TEXT = readFileSync(SRC_PATH, 'utf8').replace(/\r\n/g, '\n');
const LINES = TEXT.split('\n');

let pass = 0, fail = 0;
const check = (kind, name, ok, detail = '') => {
  if (ok) { pass++; console.log(`ok    [${kind}] ${name}`); }
  else { fail++; console.log(`FAIL  [${kind}] ${name}${detail ? '\n        ' + detail : ''}`); }
};

// ────────────────────────────────────────────────────────────────────────────────────────────
// A comment/string/regex-aware block scanner. A `;` or `{` inside a regex literal must never be
// read as code — that is the same lesson that produced the semicolon-hazard guard (V53-H1).
// ────────────────────────────────────────────────────────────────────────────────────────────
const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));
function blockEvents(src) {
  const ev = [];
  let i = 0, prev = '', line = 1;
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    if (c === '\n') { line++; i++; continue; }
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (two === '/*') {
      const e = src.indexOf('*/', i + 2);
      const seg = src.slice(i, e < 0 ? src.length : e + 2);
      line += (seg.match(/\n/g) || []).length; i = e < 0 ? src.length : e + 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (src[j] === '\n') line++; j++; }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1, inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break; else if (src[j] === '\n') break;
        j++;
      }
      j++; while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '{' || c === '}') ev.push({ line, c, i });
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return ev;
}
const EVENTS = blockEvents(TEXT);
function blockChain(targetLine) {
  const st = [];
  for (const e of EVENTS) {
    if (e.line > targetLine) break;
    if (e.c === '{') st.push(e.line); else st.pop();
  }
  return st;
}
// Does a FUNCTION boundary sit between the two block chains? A `{` that opens a function body is
// preceded by `=>` or by `)` belonging to a function/method header.
function opensFunction(openLine) {
  const idx = TEXT.split('\n').slice(0, openLine - 1).join('\n').length;
  const before = TEXT.slice(Math.max(0, idx), TEXT.indexOf('{', idx) + 1);
  const head = LINES[openLine - 1] || '';
  return /=>\s*\{\s*$/.test(head) || /\bfunction\b/.test(head) || /^\s*async\s+\w+\s*\(/.test(head)
    || /\)\s*\{\s*$/.test(head) && /\b(function|=>|async)\b/.test(head);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 1 (NEW CLASS — TEMPORAL DEAD ZONE). No block-scoped const declared in a block may be
// READ earlier in that same block, with no function boundary in between. That is a guaranteed
// ReferenceError the moment the earlier statement executes.
//
// This class exists because qa/verification/lib/belt_extract.mjs `buildDecide()` re-composes the
// disambiguation branch with its dependencies HOISTED ABOVE it — the harness manufactures a scope
// production does not have, so no extractor-based suite can ever see the ordering. The suites are
// blind to it BY CONSTRUCTION; only the file itself can be asked.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function scanTDZ(text) {
  const lines = text.split('\n');
  const events = blockEvents(text);
  const chain = (t) => { const st = []; for (const e of events) { if (e.line > t) break; if (e.c === '{') st.push(e.line); else st.pop(); } return st; };
  const opensFn = (openLine) => {
    const head = lines[openLine - 1] || '';
    return /=>\s*\{\s*$/.test(head) || /\bfunction\b/.test(head) || /^\s*async\s+[\w$]+\s*\(/.test(head);
  };
  const decls = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*const\s+([A-Z][A-Z0-9_]{2,})\s*=/);
    if (m) decls.push({ name: m[1], line: i + 1 });
  }
  const count = new Map();
  for (const d of decls) count.set(d.name, (count.get(d.name) || 0) + 1);
  const hits = [];
  for (const d of decls) {
    if (count.get(d.name) !== 1) continue;              // shadowed/duplicated: cannot reason, skip
    const declChain = chain(d.line);
    const re = new RegExp('\\b' + d.name + '\\b');
    for (let i = 0; i < d.line - 1; i++) {
      const L = lines[i];
      if (!re.test(L)) continue;
      if (/^\s*(\/\/|\*|\/\*)/.test(L)) continue;       // comment line
      if (new RegExp('\\bconst\\s+' + d.name + '\\b').test(L)) continue;
      const useChain = chain(i + 1);
      const nested = useChain.length >= declChain.length && declChain.every((v, k) => useChain[k] === v);
      if (!nested) continue;
      if (useChain.slice(declChain.length).some(opensFn)) continue; // a closure defers evaluation — safe
      hits.push({ name: d.name, declLine: d.line, useLine: i + 1, text: L.trim().slice(0, 110) });
      break;
    }
  }
  return { hits, decls, count };
}

const { hits: tdzHits, decls: CONST_DECLS, count: seen } = scanTDZ(TEXT);
check('CONTRACT', 'no block-scoped CONST is read before its declaration in the same block (temporal dead zone)',
  tdzHits.length === 0,
  tdzHits.map((h) => `${h.name}: read at :${h.useLine}, declared at :${h.declLine} — ${h.text}`).join('\n        '));

// COVERAGE for CONTRACT 1 — the REAL detector, run on synthetic sources. It must fire on the
// hazard and must NOT fire on the two safe shapes (declared-before-use; used inside a closure).
{
  const HAZARD = 'try {\n  if (x) {\n    const y = FOO.test("a");\n  }\n  const FOO = /a/i;\n}\n';
  const SAFE_ORDER = 'try {\n  const FOO = /a/i;\n  if (x) {\n    const y = FOO.test("a");\n  }\n}\n';
  const SAFE_CLOSURE = 'try {\n  const g = () => {\n    return FOO.test("a");\n  };\n  const FOO = /a/i;\n}\n';
  const fires = scanTDZ(HAZARD).hits.length === 1;
  const quiet1 = scanTDZ(SAFE_ORDER).hits.length === 0;
  const quiet2 = scanTDZ(SAFE_CLOSURE).hits.length === 0;
  check('CONTRACT', 'COVERAGE: the TDZ detector fires on the hazard and stays quiet on both safe shapes (non-vacuous)',
    fires && quiet1 && quiet2,
    `hazard-detected=${fires} declared-first-quiet=${quiet1} closure-quiet=${quiet2}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// DEFECT V54-P0-TDZ — the confirmed instance. FAILS while the defect is open.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const useLine = LINES.findIndex((l) => l.includes('const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN.test(replayLabel)')) + 1;
  const pastLine = LINES.findIndex((l) => /^\s*const PAST_COMPLETION_CLAIM_PATTERN\s*=/.test(l)) + 1;
  const cwLine = LINES.findIndex((l) => /^\s*const COMPLETION_WORD\s*=/.test(l)) + 1;
  if (useLine === 0) {
    check('DEFECT', 'V54-P0-TDZ: readsAsAssertion does not read PAST_COMPLETION_CLAIM_PATTERN before it is declared',
      true, 'use site absent — the construct was removed or rewritten; re-verify by hand');
  } else {
    check('DEFECT', 'V54-P0-TDZ: the disambiguation branch must not read PAST_COMPLETION_CLAIM_PATTERN before its declaration',
      !(pastLine > useLine),
      `use at :${useLine}, declaration at :${pastLine} — every disambiguation reply that MATCHES an option throws `
      + 'ReferenceError. Deployed v92 has no such construct.');
    check('DEFECT', 'V54-P0-TDZ: the disambiguation branch must not read COMPLETION_WORD before its declaration',
      !(cwLine > useLine), `use at :${useLine}, declaration at :${cwLine}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 2 — the harness blind spot itself. buildDecide() must not be the ONLY thing that
// decides the disambiguation branch is sound: assert that it hoists, so nobody reads its green
// as evidence about ordering.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const p = findUp('qa/verification/lib/belt_extract.mjs');
  const t = p ? readFileSync(p, 'utf8') : '';
  const hoists = /const body = mutate\(deps\) \+/.test(t) && /PAST_COMPLETION_CLAIM_PATTERN/.test(t);
  check('CONTRACT', 'belt_extract.buildDecide() is KNOWN to hoist the branch dependencies (documented blind spot, not a silent one)',
    !p || hoists,
    'buildDecide no longer hoists — if that changed deliberately, update this note; if it changed by accident, '
    + 'the suites may now differ from production in a NEW way.');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 3 — deno diagnoses, not a diagnosis COUNT. A gate that pins "23 errors" cannot tell a
// benign implicit-any from a runtime-fatal TDZ. Pin the CLASSES that must be absent.
// ═══════════════════════════════════════════════════════════════════════════════════════════
check('CONTRACT', 'source carries no forward-reference construct of the TS2448/TS2454 class (see CONTRACT 1)',
  tdzHits.length === 0, 'deno check reports TS2448/TS2454 for each hit; a count-based baseline hides them');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CONTRACT 4 — v92 parity floor on the arms the candidate inherits unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const v92 = findUp('qa/verification/scratch/v92/index.v92.ts');
  if (v92) {
    const V = readFileSync(v92, 'utf8').replace(/\r\n/g, '\n');
    const fn = (s, n) => { const i = s.indexOf('function ' + n + '('); return i < 0 ? null : s.slice(i, s.indexOf('\n}', i) + 2); };
    for (const n of ['claimsLifecycleClaim', 'findEntityStateClaimContradiction']) {
      check('CONTRACT', `${n} is byte-identical to deployed v92 (a shared arm must stay shared)`,
        fn(TEXT, n) !== null && fn(TEXT, n) === fn(V, n));
    }
    const past = (s) => (s.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/) || [])[1];
    check('CONTRACT', 'PAST_COMPLETION_CLAIM_PATTERN literal is unchanged from deployed v92',
      past(TEXT) === past(V));
  } else {
    check('CONTRACT', 'v92 reference present for the parity floor', false, 'qa/verification/scratch/v92/index.v92.ts missing');
  }
}

console.log(`\nv48_regression_additions: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
