// VERIFIER #16 — build the REAL option-gating pipeline (label loop + the D119 DROP +
// the D95 numbering) out of index.ts, with the REAL displayName / safeOptionLabel /
// safeDisplayLabel / TYPED_FALLBACK behind it. Written by me; the run15 suite's own
// `renderLabel` helper only ever exercises ONE option's label and never reaches the drop,
// which is precisely why I need my own.
import fs from 'node:fs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';

function balanced(src, anchor, open = '{', close = '}') {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  const s = src.indexOf(open, i);
  let d = 0;
  for (let j = s; j < src.length; j++) {
    if (src[j] === open) d++;
    else if (src[j] === close) { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + anchor);
}
function stmt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  let d = 0, inStr = null, inRe = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; }
    if (inRe) { if (c === '\\') { j++; continue; } if (c === '[') { while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; } continue; } if (c === '/') inRe = false; continue; }
    if (c === '/' && n === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/') { let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--; if (k < 0 || /[=(,:!&|?{};[+\-*%<>~^]/.test(src[k])) { inRe = true; continue; } }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0) return src.slice(i, j + 1);
  }
  throw new Error('no terminator: ' + anchor);
}
const stripTS = (s) => s
  .replace(/:\s*Record<string,\s*string>/g, '')
  .replace(/\(raw:\s*unknown\)/g, '(raw)')
  .replace(/\(s:\s*unknown\)/g, '(s)')
  .replace(/\(resourceType:\s*string,\s*id:\s*string\)/g, '(resourceType, id)')
  .replace(/\)\s*:\s*string\s*\|\s*null\s*=>/g, ') =>')
  .replace(/\)\s*:\s*string\s*=>/g, ') =>')
  .replace(/const unresolvableOptionIndexes:\s*number\[\]/g, 'const unresolvableOptionIndexes')
  .replace(/\(_:\s*unknown,\s*oi:\s*number\)/g, '(_, oi)');

export function buildRealGate(srcPath = SRC, requireDrop = true) {
  const src = fs.readFileSync(srcPath, 'utf8');
  if (!requireDrop) {
    // d724d8c baseline: there is no D119 machinery. Start the slice at the label loop.
    return buildFrom(src, src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)'), false);
  }
  // The full, real gating block: from the D119 index array through the end of the D95
  // numbering loop. Sliced from the shipped file, not retyped.
  return buildFrom(src, src.indexOf('const unresolvableOptionIndexes'), true);
}

function buildFrom(src, blockStart, requireDrop) {
  const numberingAnchor = src.indexOf('const labelKey =', blockStart);
  // The D95 numbering loop is the LAST statement of the block; take it balanced so no
  // closing brace is lost.
  const numLoopStart = src.indexOf('for (let oi = 0; oi < paObj.options.length; oi++)', numberingAnchor);
  if (numLoopStart < 0) throw new Error('D95 numbering loop not found');
  let d = 0, end = -1;
  for (let j = src.indexOf('{', numLoopStart); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) { end = j + 1; break; } }
  }
  if (end < 0) throw new Error('D95 numbering loop unbalanced');
  const gateBlock = src.slice(blockStart, end);
  if (requireDrop) {
    if (!gateBlock.includes('unresolvableOptionIndexes.push(oi)')) throw new Error('D119 push missing from slice');
    if (!gateBlock.includes('paObj.options = paObj.options.filter')) throw new Error('D119 DROP missing from slice');
  }

  const body = stripTS(`
    const DEBUG_RESOURCE_IDS = false;
    const canonicalById = __canonical;
    const runtimeLabels = __runtime;
    const companyNameById = __companyNames;
    const taskTitleById = new Map(); const personNameById = __personNames; const goalTitleById = new Map();
    ${stmt(src, 'const UUID_IN_TEXT =')}
    ${stmt(src, 'const PAST_COMPLETION_CLAIM_PATTERN =')}
    ${stmt(src, 'const COMPLETION_WORD =')}
    ${balanced(src, 'const TYPED_FALLBACK')};
    ${balanced(src, 'const lastKnownLabel =')};
    ${balanced(src, 'const safeDisplayLabel =')};
    ${balanced(src, 'const displayName =')};
    ${balanced(src, 'const safeProseFragment =')};
    ${balanced(src, 'const safeOptionLabel =')};
    return function gateOptions(paObj) {
      let pendingActionGatingChanged = false;
      ${gateBlock}
      return { options: paObj.options, pendingActionGatingChanged };
    };
  `);
  // eslint-disable-next-line no-new-func
  const factory = new Function('__canonical', '__runtime', '__companyNames', '__personNames', body);
  return (canonical = new Map(), runtime = new Map(), companyNames = new Map(), personNames = new Map()) =>
    factory(canonical, runtime, companyNames, personNames);
}
