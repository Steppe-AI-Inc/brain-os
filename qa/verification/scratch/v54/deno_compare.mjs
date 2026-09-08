import { readFileSync } from 'node:fs';
const ESC = String.fromCharCode(27);
const strip = (s) => s.split(ESC).map((x, i) => (i === 0 ? x : x.replace(/^\[[0-9;]*m/, ''))).join('');
const out = {};
for (const f of ['cand', 'v92']) {
  const t = strip(readFileSync('qa/verification/scratch/v54/deno_' + f + '.log', 'utf8'));
  const codes = {};
  for (const m of t.matchAll(/^(TS\d+) \[ERROR\]: (.*)$/gm)) {
    codes[m[1]] = codes[m[1]] || [];
    codes[m[1]].push(m[2].slice(0, 78));
  }
  out[f] = codes;
  console.log('=== ' + f + '  (total ' + Object.values(codes).reduce((a, b) => a + b.length, 0) + ')');
  for (const [k, v] of Object.entries(codes)) {
    console.log('  ' + k + ' x' + v.length);
    for (const s of [...new Set(v)].slice(0, 3)) console.log('      ' + s);
  }
}
const newCodes = Object.keys(out.cand).filter((k) => !out.v92[k]);
console.log('\nCODES PRESENT IN CANDIDATE BUT NOT IN v92:', newCodes.join(', '));
console.log('RUNTIME-FATAL AMONG THEM: TS2448/TS2454 (temporal dead zone) =',
  (out.cand.TS2448 || []).length + (out.cand.TS2454 || []).length);
