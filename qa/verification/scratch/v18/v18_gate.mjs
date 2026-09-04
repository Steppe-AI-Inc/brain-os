// VERIFIER #18 — INDEPENDENT option-gate extractor (label branch), my own.
import { readFileSync } from 'node:fs';
import { statementAt } from './v18_belt.mjs';
import { balancedFn } from './v18_matcher.mjs';

function stripTS(s) {
  return s
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
    .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
    .replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
      (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>')
    .replace(/(\w)!\./g, '$1.');
}

export function buildGate(path) {
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('const unresolvableOptionIndexes');
  if (start < 0) throw new Error('gate anchor missing');
  const numLoop = src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)', src.indexOf('const labelKey =', start));
  if (numLoop < 0) throw new Error('D95 numbering anchor missing');
  let d = 0, end = -1;
  for (let j = src.indexOf('{', numLoop); j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { end = j + 1; break; } }
  }
  const block = src.slice(start, end);
  const body = stripTS(`
    const DEBUG_RESOURCE_IDS = false;
    const canonicalById = __canonical;
    const runtimeLabels = __runtime;
    const companyNameById = __names.company || new Map();
    const taskTitleById = __names.task || new Map();
    const personNameById = __names.person || new Map();
    const goalTitleById = __names.goal || new Map();
    ${statementAt(src, 'const UUID_IN_TEXT =')}
    ${statementAt(src, 'const PAST_COMPLETION_CLAIM_PATTERN =')}
    ${statementAt(src, 'const COMPLETION_WORD =')}
    ${balancedFn(src, 'const TYPED_FALLBACK')};
    ${balancedFn(src, 'const lastKnownLabel =')};
    ${balancedFn(src, 'const safeDisplayLabel =')};
    ${balancedFn(src, 'const displayName =')};
    ${balancedFn(src, 'const safeProseFragment =')};
    ${balancedFn(src, 'const safeOptionLabel =')};
    return function gateOptions(paObj) {
      let pendingActionGatingChanged = false;
      ${block}
      return paObj.options;
    };
  `);
  const factory = new Function('__canonical', '__runtime', '__names', body);
  return (options, { canonical = new Map(), runtime = new Map(), names = {} } = {}) =>
    factory(canonical, runtime, names)({ options: JSON.parse(JSON.stringify(options)) });
}

export const ID_A = '11111111-1111-4111-8111-111111111111';
export const canonMap = (pairs) => new Map(pairs.map(([t, id, name]) => [`${t}|${id}`, { name }]));
