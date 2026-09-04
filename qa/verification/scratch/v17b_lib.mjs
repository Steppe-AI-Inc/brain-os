// VERIFIER #17 (campaign #77) — MY OWN extraction/execution library.
// Deliberately NOT qa/verification/proposed/v16_mutation_proof.mjs, not v15's, and not a
// copy of run16's factory: written from the source anchors up so a bug in the implementing
// session's harness cannot propagate into my verdict. It DOES reuse the repo's committed
// generic TS stripper only as a fallback; the primary strip is my own literal list, and
// every slice is pinned by product literals before it is executed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SRC = resolve(HERE, '..', '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts');

export function readSrc(path = DEFAULT_SRC) { return readFileSync(path, 'utf8'); }

// --- slicing -------------------------------------------------------------------------
// balancedFrom: from `anchor`, take everything through the balanced close of the first
// `open` seen at/after it. String/regex/comment aware is NOT needed here because every
// anchored construct in this file is brace/paren balanced in its literal text; the
// pinning literals below are what protect against a mis-slice.
export function balancedFrom(text, anchor, open = '{', close = '}') {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('V17 anchor missing: ' + anchor);
  let d = 0;
  for (let j = text.indexOf(open, i); j >= 0 && j < text.length; j++) {
    if (text[j] === open) d++;
    else if (text[j] === close) { d--; if (d === 0) return text.slice(i, j + 1); }
  }
  throw new Error('V17 unbalanced: ' + anchor);
}

// statementFrom: anchor .. first `;` at depth 0, skipping strings / regex / line comments.
export function statementFrom(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) throw new Error('V17 anchor missing: ' + anchor);
  let d = 0, str = null, re = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j], n = text[j + 1];
    if (str) { if (c === '\\') { j++; continue; } if (c === str) str = null; continue; }
    if (re) {
      if (c === '\\') { j++; continue; }
      if (c === '[') { while (j < text.length && text[j] !== ']') { if (text[j] === '\\') j++; j++; } continue; }
      if (c === '/') re = false;
      continue;
    }
    if (c === '/' && n === '/') { while (j < text.length && text[j] !== '\n') j++; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '/') {
      let k = j - 1; while (k >= 0 && /\s/.test(text[k])) k--;
      if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(text[k])) { re = true; continue; }
    }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0) return text.slice(i, j + 1);
  }
  throw new Error('V17 no terminator: ' + anchor);
}

// --- my own TS strip -----------------------------------------------------------------
export function ts2js(s) {
  return s
    .replace(/\)\s*:\s*PendingActionOption\s*\|\s*null\s*\{/g, ') {')
    .replace(/:\s*PendingActionOption\[\]/g, '')
    .replace(/:\s*PendingActionOption\b/g, '')
    .replace(/:\s*Record<string,\s*string>/g, '')
    .replace(/const unresolvableOptionIndexes\s*:\s*number\[\]/g, 'const unresolvableOptionIndexes')
    .replace(/\(_\s*:\s*unknown,\s*oi\s*:\s*number\)/g, '(_, oi)')
    .replace(/\(raw\s*:\s*unknown\)/g, '(raw)')
    .replace(/\(s\s*:\s*unknown\)/g, '(s)')
    .replace(/\(resourceType\s*:\s*string,\s*id\s*:\s*string\)/g, '(resourceType, id)')
    .replace(/\)\s*:\s*string\s*\|\s*null\s*=>/g, ') =>')
    .replace(/\)\s*:\s*string\s*=>/g, ') =>')
    .replace(/\(s\s*:\s*string\)\s*=>/g, '(s) =>')
    .replace(/:\s*string\b(?=\s*[,)])/g, '');
}

function pin(text, literals, what) {
  for (const lit of literals) {
    if (!text.includes(lit)) throw new Error(`V17 REFUSING TO REPORT — ${what} literal absent: ${lit}`);
  }
}

// --- builders ------------------------------------------------------------------------
export function buildMatcher(src) {
  const slice = balancedFrom(src, 'function matchDisambiguationOption');
  pin(slice, [
    'const SELECTION_FILLER =',
    'const cleanSelection =',
    'if (matches.length === 1 && !cleanSelection(matches[0])) return null;',
    'if (matches.length === 1) return matches[0];',
  ], 'matcher');
  return new Function(ts2js(slice) + '\nreturn matchDisambiguationOption;')();
}

// Version-tolerant matcher for A/B against older commits (which have no SELECTION_FILLER).
export function buildMatcherAny(src) {
  const slice = balancedFrom(src, 'function matchDisambiguationOption');
  pin(slice, ['if (matches.length === 1) return matches[0];'], 'matcher(any)');
  return new Function(ts2js(slice) + '\nreturn matchDisambiguationOption;')();
}

export function buildBelt(src, { requireNegatedClause = true } = {}) {
  const parts = [
    statementFrom(src, 'const LEGACY_PAST_COMPLETION ='),
    statementFrom(src, 'const PROGRESS_VERBS ='),
    balancedFrom(src, 'const EXECUTION_IN_PROGRESS = new RegExp(', '(', ')') + ';',
    statementFrom(src, 'const CONFIRMED_COMPLETION ='),
    src.includes('const NEGATED_CLAUSE =') ? statementFrom(src, 'const NEGATED_CLAUSE =') : '',
    statementFrom(src, 'const REFERENCELESS_CONFIRMATION ='),
    statementFrom(src, 'const readsAsCompletion ='),
  ];
  const body = ts2js(parts.join('\n'));
  pin(body, requireNegatedClause ? ['const readsAsCompletion =', 'NEGATED_CLAUSE.test('] : ['const readsAsCompletion ='], 'belt');
  return new Function(body + '\nreturn readsAsCompletion;')();
}

// The REAL option-gating pipeline: alias table + label loop + D119 drop + D95 numbering.
export function buildGate(src, { requireAlias = true } = {}) {
  const gateStart = src.indexOf('const unresolvableOptionIndexes');
  if (gateStart < 0) throw new Error('V17: unresolvableOptionIndexes absent — refusing to report');
  const numLoopIdx = src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)',
    src.indexOf('const labelKey =', gateStart));
  if (numLoopIdx < 0) throw new Error('V17: D95 numbering loop absent — refusing to report');
  let d = 0, gateEnd = -1;
  for (let j = src.indexOf('{', numLoopIdx); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) { gateEnd = j + 1; break; } }
  }
  const gateBlock = src.slice(gateStart, gateEnd);
  pin(gateBlock, [
    ...(requireAlias ? ['const CANONICAL_TYPE_ALIAS'] : []),
    'const canonicalKnowsIt',
    'unresolvableOptionIndexes.push(oi)',
    'paObj.options = paObj.options.filter',
    'const labelKey =',
  ], 'gate');
  const factory = new Function('__canonical', '__runtime', '__names', ts2js(`
    const DEBUG_RESOURCE_IDS = false;
    const canonicalById = __canonical;
    const runtimeLabels = __runtime;
    const companyNameById = __names.company || new Map();
    const taskTitleById = __names.task || new Map();
    const personNameById = __names.person || new Map();
    const goalTitleById = __names.goal || new Map();
    ${statementFrom(src, 'const UUID_IN_TEXT =')}
    ${statementFrom(src, 'const PAST_COMPLETION_CLAIM_PATTERN =')}
    ${statementFrom(src, 'const COMPLETION_WORD =')}
    ${balancedFrom(src, 'const TYPED_FALLBACK')};
    ${balancedFrom(src, 'const lastKnownLabel =')};
    ${balancedFrom(src, 'const safeDisplayLabel =')};
    ${balancedFrom(src, 'const displayName =')};
    ${balancedFrom(src, 'const safeProseFragment =')};
    ${balancedFrom(src, 'const safeOptionLabel =')};
    return function gateOptions(paObj) {
      let pendingActionGatingChanged = false;
      ${gateBlock}
      return { options: paObj.options, pendingActionGatingChanged };
    };
  `));
  return (options, { canonical = new Map(), runtime = new Map(), names = {} } = {}) =>
    factory(canonical, runtime, names)({ options: JSON.parse(JSON.stringify(options)) });
}

export function buildAll(src) {
  return { matchOption: buildMatcher(src), readsAsCompletion: buildBelt(src), gate: buildGate(src) };
}

// --- shared fixtures ------------------------------------------------------------------
export const ID_A = '11111111-1111-4111-8111-111111111111';
export const ID_B = '22222222-2222-4222-8222-222222222222';
export const ID_C = '33333333-3333-4333-8333-333333333333';
export const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
export const canonMap = (rows) => new Map(rows.map(([t, id, name]) => [`${t}|${id}`, { name }]));
