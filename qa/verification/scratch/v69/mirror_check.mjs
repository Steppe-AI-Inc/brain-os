// VERIFIER #69 — _shared mirrors vs web/lib (mod CRLF), and index.ts imports nothing from _shared.
import fs from 'node:fs';
const norm = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
const pairs = [
  ['web/lib/contracts/collection.ts', 'supabase/functions/_shared/collection.ts'],
  ['web/lib/contracts/execution.ts', 'supabase/functions/_shared/execution.ts'],
  ['web/lib/contracts/lifecycle.ts', 'supabase/functions/_shared/lifecycle.ts'],
  ['web/lib/policy/archived-parent.ts', 'supabase/functions/_shared/parent-policy.ts'],
];
for (const [a, b] of pairs) {
  const same = norm(a) === norm(b);
  console.log((same ? 'IDENTICAL(mod CRLF) ' : 'DIFFERS             ') + a + ' <-> ' + b);
  if (!same) {
    const la = norm(a).split('\n'), lb = norm(b).split('\n');
    let n = 0; for (let i = 0; i < Math.max(la.length, lb.length) && n < 8; i++) if (la[i] !== lb[i]) { console.log('   L' + (i + 1) + ' web: ' + (la[i] || '').slice(0, 120)); console.log('   L' + (i + 1) + ' edge:' + (lb[i] || '').slice(0, 120)); n++; }
  }
}
const idx = fs.readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const imports = idx.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l));
console.log('index.ts import lines:', imports.length);
for (const l of imports) console.log('  ' + l);
console.log('imports _shared:', imports.some((l) => l.includes('_shared')));
// embedTexts equality mod CRLF
const v92 = fs.readFileSync('qa/verification/scratch/v69/v92_index.ts', 'utf8').replace(/\r\n?/g, '\n');
const cand = idx.replace(/\r\n?/g, '\n');
function fn(src, name) { const i = src.indexOf('async function ' + name); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } } return src.slice(i, j + 1); }
console.log('embedTexts identical mod CRLF:', fn(v92, 'embedTexts') === fn(cand, 'embedTexts'));
console.log('embedText  identical mod CRLF:', fn(v92, 'embedText') === fn(cand, 'embedText'));
