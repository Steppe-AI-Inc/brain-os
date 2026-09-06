// VERIFIER #41 — identifier delta, re-derived independently (ledger #90 reported it wrongly
// once, so this is computed here rather than restated).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const cand = norm(path.join(REPO, 'supabase/functions/sem-ai-command/index.ts'));
const v92 = norm(path.join(HERE, 'v92.lf.ts'));

function topLevelBeltDecls(src) {
  const s = src.indexOf('const LEGACY_PAST_COMPLETION') >= 0
    ? src.indexOf('const LEGACY_PAST_COMPLETION') : src.indexOf('const PAST_COMPLETION_CLAIM_PATTERN');
  const e = src.indexOf('const legacyProseFallback') >= 0
    ? src.indexOf('const legacyProseFallback') : src.indexOf('if (claimsPastCompletionWithNoGrounding)');
  if (s < 0 || e <= s) return { window: 'n/a', decls: [] };
  const blk = src.slice(s, e).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  let depth = 0, out = [], m; const tok = /[{}]|\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = tok.exec(blk)) !== null) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && m[1]) out.push(m[1]);
  }
  return { window: (e - s) + ' chars', decls: out };
}
const A = topLevelBeltDecls(v92), B = topLevelBeltDecls(cand);
console.log('v92  belt window ' + A.window + '  top-level decls (' + A.decls.length + '): ' + A.decls.join(', '));
console.log('cand belt window ' + B.window + '  top-level decls (' + B.decls.length + '): ' + B.decls.join(', '));
const added = B.decls.filter((x) => !A.decls.includes(x));
const removed = A.decls.filter((x) => !B.decls.includes(x));
console.log('ADDED   (' + added.length + '): ' + added.join(', '));
console.log('REMOVED (' + removed.length + '): ' + removed.join(', '));

// whole-file top-level function/const identifier delta, as a second, coarser measure
const ids = (src) => new Set((src.match(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm) || [])
  .map((x) => x.replace(/^(?:const|let|function)\s+/, '')));
const a = ids(v92), b = ids(cand);
console.log(`\nfile-level top-level identifiers: v92=${a.size} cand=${b.size}`);
console.log('  added: ' + [...b].filter((x) => !a.has(x)).join(', ') || '(none)');
console.log('  removed: ' + ([...a].filter((x) => !b.has(x)).join(', ') || '(none)'));
