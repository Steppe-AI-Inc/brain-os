// Prove the prepared fix closes V47-D3 and costs nothing on the other 40 shapes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.SEM_INDEX_SRC = path.join(HERE, 'index.ordfix.ts');
const { candMatch: fixedMatch } = await import('./matcher.mjs');
delete process.env.SEM_INDEX_SRC;

// re-import the unpatched matcher in a separate module registry is not possible, so extract
// the stock one directly here.
import fs from 'node:fs';
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const STOCK = fs.readFileSync(path.join(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/\r\n/g, '\n');
function extractMatcher(txt) {
  const a = txt.indexOf('function matchDisambiguationOption');
  let depth = 0, end = -1;
  for (let k = txt.indexOf('{', a); k < txt.length; k++) {
    if (txt[k] === '{') depth++; else if (txt[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  let s = txt.slice(a, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  s = s.replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]+\{/, 'function matchDisambiguationOption(command, options) {');
  s = s.replace(/\((\w+):\s*[A-Za-z_$][\w$<>,.\[\]| ]*\)\s*=>/g, '($1) =>');
  s = s.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  s = s.replace(/new Set<number>\(\)/g, 'new Set()');
  return s;
}
const stockMatch = new Function(extractMatcher(STOCK) + '\nreturn matchDisambiguationOption;')();

const OPTS = [
  { label: 'Acme Holdings', id: 'A', entityType: 'company', actionType: 'archive' },
  { label: 'Acme Logistics', id: 'B', entityType: 'company', actionType: 'archive' },
  { label: 'Acme Retail', id: 'C', entityType: 'company', actionType: 'archive' },
];
const CASES = [
  ['option 1', 'A'], ['option 2', 'B'], ['#3', 'C'], ['2', 'B'], ['the second one', 'B'],
  ['option 3', 'C'], ['number 2', 'B'], ['yes, option 2', 'B'], ['please pick option 3', 'C'],
  ['option 9', null], ['acme 2', null], ['no option 2', null], ['not option 1, option 2', null],
  ['option 1 or option 2', null], ['option 1 and option 3', null],
  // the defect rows
  ['option 1, option 2', null], ['number 1 number 2', null], ['#1 #2', null],
  ['option 2, option 1', null], ['option 1 option 3', null],
  ['the first one or the second one', null],
];
let stockBad = 0, fixBad = 0;
console.log('reply'.padEnd(36), 'stock'.padEnd(7), 'fixed'.padEnd(7), 'safe');
for (const [cmd, want] of CASES) {
  const a = stockMatch(cmd, OPTS), b = fixedMatch(cmd, OPTS);
  const ai = a ? a.id : null, bi = b ? b.id : null;
  if (ai !== want) stockBad++;
  if (bi !== want) fixBad++;
  console.log(JSON.stringify(cmd).padEnd(36), String(ai).padEnd(7), String(bi).padEnd(7), String(want),
    ai !== want ? '  <-- stock wrong' : '', bi !== want ? '  <-- FIX WRONG' : '');
}
console.log('\nstock deviations:', stockBad, ' fixed deviations:', fixBad);
console.log(fixBad === 0 && stockBad > 0 ? 'PREPARED FIX CLOSES THE CLASS AT ZERO COST ON THESE SHAPES'
  : 'PREPARED FIX IS NOT CLEAN — do not ship');
