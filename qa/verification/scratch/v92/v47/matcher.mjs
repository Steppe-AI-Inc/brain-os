// Extract matchDisambiguationOption from BOTH v92 and the candidate and run them for real.
import * as L from './lab.mjs';

function extractMatcher(txt) {
  const a = txt.indexOf('function matchDisambiguationOption');
  if (a < 0) throw new Error('matchDisambiguationOption missing');
  let depth = 0, end = -1;
  for (let k = txt.indexOf('{', a); k < txt.length; k++) {
    if (txt[k] === '{') depth++; else if (txt[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  let s = txt.slice(a, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]+\{/, 'function matchDisambiguationOption(command, options) {');
  s = s.replace(/\((\w+):\s*[A-Za-z_$][\w$<>,.\[\]| ]*\)\s*=>/g, '($1) =>');
  s = s.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  s = s.replace(/new Set<[^>]*>\(/g, 'new Set(');
  if (/:\s*(?:string|boolean|number|PendingActionOption|Record)/.test(s)) {
    throw new Error('TypeScript survived matcher stripping:\n' + s.split('\n').filter((l) => /:\s*(?:string|boolean|number|PendingActionOption|Record)/.test(l)).join('\n'));
  }
  return s;
}
export const v92Match = new Function(extractMatcher(L.V92_LF) + '\nreturn matchDisambiguationOption;')();
export const candMatch = new Function(extractMatcher(L.SRC_LF) + '\nreturn matchDisambiguationOption;')();
