// RULE ON V46-D1 (runtime). Measure the belt's growth on the worst shape #46 named: ONE
// unsplittable clause carrying SKIPPED negators. Compare against deployed v92's single regex.
import * as L from './lab.mjs';
const v92 = (s) => L.V92_FUT.test(s) || L.V92_PAST.test(s);
const time = (f, s, reps) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < reps; i++) f(s); return Number(process.hrtime.bigint() - t0) / 1e6 / reps; };

// worst shape: capitalised negator-initial runs, no clause boundary anywhere, ending in a completion.
const unit = 'No Limits Inc and No Frills Freight and Nothing Bundt Cakes ';
function build(chars) { let s = ''; while (s.length < chars) s += unit; return s.slice(0, chars) + ' was archived.'; }
console.log('shape: one unsplittable clause of capitalised negator-initial runs + a completion');
console.log('bytes'.padStart(7), 'belt(ms)'.padStart(10), 'v92(ms)'.padStart(9), 'ratio'.padStart(9), 'belt verdict');
const pts = [];
for (const n of [500, 1000, 2000, 4000, 8000, 16000]) {
  const s = build(n);
  const reps = n <= 2000 ? 20 : n <= 8000 ? 5 : 2;
  const a = time(L.fires, s, reps), b = time(v92, s, 200);
  pts.push([n, a]);
  console.log(String(n).padStart(7), a.toFixed(2).padStart(10), b.toFixed(4).padStart(9),
    (a / b).toFixed(0).padStart(9), L.fires(s) ? 'FIRE' : 'keep');
}
// growth exponent from the last three points
const [x1, y1] = pts[pts.length - 3], [x2, y2] = pts[pts.length - 1];
console.log('\ngrowth exponent e =', (Math.log(y2 / y1) / Math.log(x2 / x1)).toFixed(2));

// ORDINARY prose, the realistic case
const proseUnit = 'The company was reviewed and the depot report was filed by the site lead. ';
let p = ''; while (p.length < 16000) p += proseUnit;
for (const n of [2000, 8000, 16000]) {
  const s = p.slice(0, n);
  console.log('ordinary prose', String(n).padStart(6), 'bytes:', time(L.fires, s, 5).toFixed(2), 'ms');
}
// Reachability: what is the real cap on a summary?
const m = L.SRC_LF.match(/max_tokens[^,\n]{0,40}/g);
console.log('\nmax_tokens occurrences in index.ts:', m ? m.join(' | ') : '(none)');
const cap = L.SRC_LF.match(/summary[^\n]{0,60}slice\(0,\s*\d+/g);
console.log('any explicit summary length cap:', cap ? cap.join(' | ') : '(none found)');
