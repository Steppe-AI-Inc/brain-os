// VERIFIER #40 — my own source extractor. Written from scratch after reading the
// candidate belt directly; deliberately not importing qa/verification/lib/belt_extract.mjs
// (verifier #20's) or qa/scenarios-runner/_gate_extract.mjs (the implementing session's).
//
// A small lexer that understands line comments, block comments, the three string kinds
// and REGEX LITERALS, so that a `;` or a brace inside a regex/character class never
// terminates a declaration early.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// scratch/v40 -> repo root is four levels up (qa/verification/scratch/v40)
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

export function candidatePath() {
  return process.env.SEM_INDEX_SRC || path.join(REPO_ROOT, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
}

const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));

function scanStatement(src, start, mode) {
  let i = start;
  let depth = 0;
  let prev = '';
  let sawBodyBrace = false;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (two === '/*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || PREV_ALLOWS_REGEX.has(prev))) {
      let j = i + 1; let inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break;
        j++;
      }
      j++;
      while (j < src.length && /[gimsuyvd]/.test(src[j])) j++;
      i = j; prev = '/'; continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      if (c === '{' && depth === 0 && mode === 'fnbody') sawBodyBrace = true;
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0 && mode === 'fnbody' && c === '}' && sawBodyBrace) return i + 1;
    } else if (c === ';' && depth === 0 && mode === 'stmt') {
      return i + 1;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  throw new Error('unterminated statement from ' + start);
}

export function readSrc(p) { return fs.readFileSync(p, 'utf8').split('\r\n').join('\n'); }

export function grabConst(src, name) {
  const re = new RegExp('(^|\\n)\\s*const\\s+' + name + '\\b');
  const m = re.exec(src);
  if (!m) throw new Error('const not found: ' + name);
  const start = src.indexOf('const', m.index);
  return src.slice(start, scanStatement(src, start, 'stmt'));
}

// Only the TS annotations that actually occur on the belt declarations. Explicit on
// purpose: a general strip could silently change semantics.
function detype(code) {
  return code.replace(/\(c: string\): boolean/g, '(c)').replace(/\(s: string\)/g, '(s)');
}

const BELT = [
  'LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION',
  'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX',
  'completionIsNegated', 'readsAsCompletion',
];

// Build the candidate gate. `mutate` receives the joined source so a mutation test can
// revert exactly one shipped fix and re-measure.
export function buildCandidateGate(srcPath = candidatePath(), mutate = (s) => s) {
  const src = readSrc(srcPath);
  const present = [];
  const parts = [];
  for (const n of BELT) {
    try { parts.push(detype(grabConst(src, n))); present.push(n); } catch (e) { /* optional */ }
  }
  if (!present.includes('readsAsCompletion')) throw new Error('readsAsCompletion not extracted');
  const body = mutate(parts.join('\n'));
  const exported = present.filter((n) => n !== 'PROGRESS_VERBS');
  // eslint-disable-next-line no-new-func
  const built = new Function(body + '\nreturn { ' + exported.join(', ') + ' };')();
  return { ...built, source: body, present };
}

// Deployed-v92 gate: v92's whole decision is ONE pattern on the whole summary.
export function buildV92Gate(srcPath) {
  const src = readSrc(srcPath);
  const decl = grabConst(src, 'PAST_COMPLETION_CLAIM_PATTERN');
  // eslint-disable-next-line no-new-func
  const PAT = new Function(decl + '\nreturn PAST_COMPLETION_CLAIM_PATTERN;')();
  return { PAST_COMPLETION_CLAIM_PATTERN: PAT, readsAsCompletion: (s) => PAT.test(String(s || '')) };
}

export function v92Path() {
  return process.env.SEM_V92_SRC || path.join(REPO_ROOT, 'qa', 'verification', 'scratch', 'v40', 'index.v92.git.ts');
}
