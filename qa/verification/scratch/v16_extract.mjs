// VERIFIER #16 — INDEPENDENT extraction of the real product code from index.ts.
// Written from scratch. Does NOT reuse qa/verification/proposed/v15_mutation_proof.mjs
// or qa/verification/scratch/v15_extract.mjs (those are the implementing session's).
//
// Strategy: slice the REAL source text by structural anchors, then evaluate it. Any
// mutation to index.ts therefore flows through into every probe below. Nothing here
// re-implements product logic.
import fs from 'node:fs';

export const SRC_PATH = 'supabase/functions/sem-ai-command/index.ts';
export function readSrc(p = SRC_PATH) { return fs.readFileSync(p, 'utf8'); }

// ---------- generic helpers ----------
function sliceBalanced(src, startIdx) {
  // From the first '{' at/after startIdx, return through its matching '}'.
  const open = src.indexOf('{', startIdx);
  let depth = 0, i = open, inStr = null, inLine = false, inBlock = false, inRe = false;
  for (; i < src.length; i++) {
    const c = src[i], p = src[i - 1], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (inRe) { if (c === '\\') { i++; continue; } if (c === '[') { while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i++; i++; } continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/') {
      // regex literal heuristic: previous non-space char suggests an operand position
      let j = i - 1; while (j >= 0 && /\s/.test(src[j])) j--;
      if (j < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(src[j])) { inRe = true; continue; }
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced from ' + startIdx);
}

function stripTypes(js) {
  return js
    .replace(/\)\s*:\s*PendingActionOption\s*\|\s*null\s*\{/g, ') {')
    .replace(/:\s*Record<string,\s*Record<string,\s*string>>\s*=/g, ' =')
    .replace(/:\s*PendingActionOption\[\]/g, '')
    .replace(/:\s*PendingActionOption\b/g, '')
    .replace(/:\s*Record<string,\s*string>/g, '')
    .replace(/:\s*number\[\]/g, '')
    .replace(/:\s*string\s*\|\s*undefined\s*\|\s*null/g, '')
    .replace(/\)\s*:\s*string\s*\|\s*undefined\s*\{/g, ') {')
    .replace(/\)\s*:\s*boolean\s*\{/g, ') {')
    .replace(/\(_:\s*unknown,\s*oi:\s*number\)/g, '(_, oi)')
    .replace(/:\s*string\b(?=\s*[,)])/g, '')
    .replace(/:\s*string\[\]/g, '');
}

// ---------- A/B: matchDisambiguationOption ----------
export function extractMatcher(src = readSrc()) {
  const i = src.indexOf('function matchDisambiguationOption');
  if (i < 0) throw new Error('matchDisambiguationOption not found');
  const body = sliceBalanced(src, i);
  const js = stripTypes(body);
  // eslint-disable-next-line no-new-func
  const f = new Function(js + '\nreturn matchDisambiguationOption;')();
  return f;
}

// ---------- C: the completion drift belt ----------
export function extractBelt(src = readSrc()) {
  const names = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
    'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION'];
  const parts = [];
  for (const n of names) {
    const m = src.indexOf('const ' + n + ' =');
    if (m < 0) {
      if (n === 'NEGATED_CLAUSE') { parts.push('const NEGATED_CLAUSE = /$^/;  /* ABSENT in source */'); continue; }
      throw new Error(n + ' not found');
    }
    // read to the terminating ";\r\n" at statement level
    let j = m, inStr = null, inRe = false, depth = 0, inLine = false, inBlock = false;
    for (; j < src.length; j++) {
      const c = src[j], nx = src[j + 1];
      if (inLine) { if (c === '\n') inLine = false; continue; }
      if (inBlock) { if (c === '*' && nx === '/') { inBlock = false; j++; } continue; }
      if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
      if (inRe) { if (c === '\\') { j++; continue; } if (c === '[') { while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; } continue; } if (c === '/') inRe = false; continue; }
      if (c === '/' && nx === '/') { inLine = true; j++; continue; }
      if (c === '/' && nx === '*') { inBlock = true; j++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '/') { let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--; if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(src[k])) { inRe = true; continue; } }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth === 0) break;
    }
    parts.push(src.slice(m, j + 1));
  }
  const rIdx = src.indexOf('const readsAsCompletion =');
  if (rIdx < 0) throw new Error('readsAsCompletion not found');
  // readsAsCompletion is written to be a single statement terminated by the first
  // top-level ';' — reuse the same scanner.
  let j = rIdx, inStr = null, inRe = false, depth = 0, inLine = false, inBlock = false;
  for (; j < src.length; j++) {
    const c = src[j], nx = src[j + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && nx === '/') { inBlock = false; j++; } continue; }
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (inRe) { if (c === '\\') { j++; continue; } if (c === '[') { while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; } continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && nx === '/') { inLine = true; j++; continue; }
    if (c === '/' && nx === '*') { inBlock = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/') { let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--; if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(src[k])) { inRe = true; continue; } }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) break;
  }
  parts.push(src.slice(rIdx, j + 1));
  const js = parts.join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function(js + '\nreturn { readsAsCompletion, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION, NEGATED_CLAUSE };')();
  return api;
}

// ---------- D: the D119 option gating block ----------
// Extracted as the real loop text between the `const unresolvableOptionIndexes` line and
// the D95 numbering block, plus the numbering block, driven by injected displayName /
// safeOptionLabel / TYPED_FALLBACK stubs the caller supplies.
export function extractOptionGate(src = readSrc()) {
  const start = src.indexOf('const unresolvableOptionIndexes');
  if (start < 0) throw new Error('unresolvableOptionIndexes not found (D119 drop absent?)');
  const endMarker = src.indexOf('const labelKey =', start);
  if (endMarker < 0) throw new Error('labelKey not found');
  const loopText = src.slice(start, endMarker);
  // numbering block: from labelKey through the closing of the second for loop
  const numEnd = src.indexOf('pendingActionGatingChanged = true;', src.indexOf('(option ${oi + 1})', endMarker));
  const numText = src.slice(endMarker, src.indexOf('\n', src.indexOf('}', src.indexOf('}', numEnd) + 1)) + 1);
  const js = stripTypes(`
    return function gate(paObj, ctx) {
      const { displayName, safeOptionLabel, TYPED_FALLBACK } = ctx;
      let pendingActionGatingChanged = false;
      ${loopText}
      ${numText}
      return { options: paObj.options, pendingActionGatingChanged };
    };
  `);
  // eslint-disable-next-line no-new-func
  return new Function(js)();
}

// ---------- F: resolveClarificationField ----------
export function extractResolveClarificationField(src = readSrc()) {
  const mapIdx = src.indexOf('const CLARIFICATION_ENTITY_ACTION_FIELD');
  if (mapIdx < 0) throw new Error('CLARIFICATION_ENTITY_ACTION_FIELD not found');
  const mapEnd = src.indexOf('};', mapIdx) + 2;
  const fnIdx = src.indexOf('function resolveClarificationField');
  const fn = sliceBalanced(src, fnIdx);
  const js = stripTypes(src.slice(mapIdx, mapEnd) + '\n' + fn);
  // eslint-disable-next-line no-new-func
  return new Function(js + '\nreturn resolveClarificationField;')();
}

export function extractAll(src = readSrc()) {
  return {
    match: extractMatcher(src),
    belt: extractBelt(src),
    gate: extractOptionGate(src),
    resolve: extractResolveClarificationField(src),
  };
}
