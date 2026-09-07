// VERIFIER #20 (campaign #80) — my own source extractor. Deliberately NOT reusing
// qa/scenarios-runner/_gate_extract.mjs or any v15..v19 harness: those are the
// implementing session's / prior verifiers' and are exactly what must not be trusted.
//
// Scans a JS/TS source with a small state machine that understands line comments,
// block comments, single/double/backtick strings and REGEX LITERALS (so a `;` or a
// brace inside a regex never terminates a declaration), and lifts out a named
// `const NAME = ...;` declaration or a `function NAME(...) {...}` whole.
import fs from 'node:fs';

const PREV_ALLOWS_REGEX = new Set('=(,:[!&|?{};+*%~^<>'.split(''));

// Returns the index just past the end of the statement/declaration that starts at `start`.
// mode 'stmt'  -> ends at the first `;` at bracket depth 0
// mode 'fnbody'-> ends at the `}` closing the first `{` opened at bracket depth 0
function scanStatement(src, start, mode = 'stmt') {
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
      // regex literal
      let j = i + 1; let inClass = false;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        else if (src[j] === '\n') break; // unterminated; bail
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
  throw new Error('unterminated statement from index ' + start);
}

export function extractConst(src, name) {
  const re = new RegExp('(^|\\n)\\s*const\\s+' + name + '\\b');
  const m = re.exec(src);
  if (!m) throw new Error('const not found: ' + name);
  const start = src.indexOf('const', m.index);
  const end = scanStatement(src, start, 'stmt');
  return src.slice(start, end);
}

export function extractFunction(src, name) {
  const re = new RegExp('(^|\\n)function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const start = src.indexOf('function', m.index);
  const end = scanStatement(src, start, 'fnbody');
  return src.slice(start, end);
}

// Minimal TypeScript-annotation stripping for the specific declarations this campaign
// touches. Kept explicit (not a general TS parser) so a silent mis-strip is impossible.
export function detype(code) {
  return code
    .replace(/: Record<string, Record<string, string>>/g, '')
    .replace(/: Record<string, string>/g, '')
    .replace(/\(c: string\): boolean/g, '(c)')
    .replace(/\(s: string\)/g, '(s)')
    .replace(/\(command: string, options: PendingActionOption\[\]\): PendingActionOption \| null/g, '(command, options)')
    .replace(/\(winner: PendingActionOption\)/g, '(winner)')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)')
    .replace(/\((\w+): string\)/g, '($1)')
    .replace(/\(command: string, actionType: string \| undefined\): boolean/g, '(command, actionType)')
    .replace(/\(entityType: string \| undefined \| null, actionType: string \| undefined \| null\): string \| undefined/g, '(entityType, actionType)');
}

export function readSource(p) {
  return fs.readFileSync(p, 'utf8');
}

// ---- The completion-drift belt (readsAsCompletion) ------------------------------
// Superset across d724d8c..b32e0e4. Older baselines simply do not declare some of
// these (the belt was restructured five times); each is optional, and what a given
// baseline actually declares is reported by buildGate().
const GATE_NAMES = [
  'LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION',
  'COMPLETION_VOCAB', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX',
  'completionIsNegated', 'readsAsCompletion',
];
const REQUIRED = new Set(['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'REFERENCELESS_CONFIRMATION', 'readsAsCompletion']);

// `names` is the positive entity signal (knownEntityNames). It defaults to EMPTY on purpose — the
// battery's structural default is "no pack" so a verdict that needs the pack must SAY so by passing
// one. After V48-D3 the first-person active arm consults the pack for a capitalised object, exactly
// as deployed v92 behaves on that shape, so suites asserting those catches supply the names.
export function buildGate(srcPath, mutate = (code) => code, names = []) {
  const src = readSource(srcPath);
  const parts = [];
  const present = [];
  for (const n of GATE_NAMES) {
    try { parts.push(detype(extractConst(src, n))); present.push(n); } catch (e) {
      if (!REQUIRED.has(n)) continue;
      throw e;
    }
  }
  const body = mutate(parts.join('\n'));
  // eslint-disable-next-line no-new-func
  const exported = present.filter((n) => n !== 'PROGRESS_VERBS');
  const f = new Function('__n', 'const knownEntityNames = new Set(__n.map((v) => String(v).trim().toLowerCase()));\n' + body + '\nreturn { ' + exported.join(', ') + ' };');
  return { ...f(names), source: body, present };
}

// ---- matchDisambiguationOption --------------------------------------------------
export function buildMatcher(srcPath, mutate = (code) => code) {
  const src = readSource(srcPath);
  const fn = mutate(detype(extractFunction(src, 'matchDisambiguationOption')));
  // eslint-disable-next-line no-new-func
  const f = new Function('const knownEntityNames = new Set();\n' + fn + '\nreturn matchDisambiguationOption;');
  return f();
}

export function buildClarificationField(srcPath, mutate = (code) => code) {
  const src = readSource(srcPath);
  const table = detype(extractConst(src, 'CLARIFICATION_ENTITY_ACTION_FIELD'));
  const fn = detype(extractFunction(src, 'resolveClarificationField'));
  const body = mutate(table + '\n' + fn);
  // eslint-disable-next-line no-new-func
  return new Function('const knownEntityNames = new Set();\n' + body + '\nreturn resolveClarificationField;')();
}

// Re-composes the REAL disambiguation-resolution branch (index.ts:2696-2731) out of the
// real source lines, so the E2E answer ("which field got armed with which id, and what
// summary would the founder see") is decided by the shipped statements, not by my
// paraphrase of them.
export function buildDecide(srcPath, mutate = (code) => code) {
  const src = readSource(srcPath);
  const grab = (marker, fallback) => {
    const i = src.indexOf(marker);
    if (i < 0) {
      if (fallback !== undefined) return fallback;
      throw new Error('marker not found: ' + marker);
    }
    return src.slice(i, scanStatement(src, i, 'stmt'));
  };
  const deps = [
    extractConst(src, 'CLARIFICATION_ENTITY_ACTION_FIELD'),
    extractConst(src, 'ARCHIVE_VERB_PATTERN'),
    extractConst(src, 'RESTORE_VERB_PATTERN'),
    extractConst(src, 'COMPLETION_WORD'),
    extractConst(src, 'PAST_COMPLETION_CLAIM_PATTERN'),
    extractFunction(src, 'resolveClarificationField'),
    extractFunction(src, 'commandContradictsActionType'),
    extractFunction(src, 'matchDisambiguationOption'),
  ].map(detype).join('\n');
  const branch = [
    'const matchedOption = matchDisambiguationOption(command, options);',
    // Pre-run19 sources have no label-strip line: the contradiction test ran on the raw
    // command. Reproduce that faithfully rather than failing to build.
    grab('const commandForContradiction = matchedOption', 'const commandForContradiction = command;'),
    grab('const contradicted = !!matchedOption'),
    grab('const field = matchedOption && !contradicted'),
    "const replayLabel = String(matchedOption?.label ?? '');",
    grab('const isTypedFallbackOnly ='),
    grab('const readsAsAssertion ='),
    'return { matched: matchedOption ? matchedOption.id : null, contradicted, field: field ?? null,'
    + " armed: (matchedOption && !contradicted && field) ? field + ':' + matchedOption.id : null,"
    + ' summary: (matchedOption && !contradicted && field)'
    + " ? ((isTypedFallbackOnly || readsAsAssertion) ? 'Confirmed \\u2014 proceeding with the option you selected.'"
    + " : 'Confirmed \\u2014 you selected \\u201c' + replayLabel + '\\u201d.') : null };",
  ].join('\n');
  const body = mutate(deps) + '\nreturn function decide(command, options) {\n' + branch + '\n};';
  // eslint-disable-next-line no-new-func
  return new Function(body)();
}

export function buildContradiction(srcPath) {
  const src = readSource(srcPath);
  const deps = [extractConst(src, 'ARCHIVE_VERB_PATTERN'), extractConst(src, 'RESTORE_VERB_PATTERN')].join('\n');
  const fn = detype(extractFunction(src, 'commandContradictsActionType'));
  return new Function(deps + '\n' + fn + '\nreturn commandContradictsActionType;')();
}
