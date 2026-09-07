// Try harder to reproduce #46's cubic shape: ONE unsplittable clause with MANY skipped negators
// AND MANY "<subject> was" spans (the newSubject IIFE is a nested scan).
import * as L from './lab.mjs';
const time = (f, s, reps) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < reps; i++) f(s); return Number(process.hrtime.bigint() - t0) / 1e6 / reps; };
const UNITS = {
  'negator+subject pairs': 'no proof Alpha Corp was archived plus ',
  'negator-initial names': 'No Limits Inc was archived plus ',
  'nothing + name + aux': 'nothing Beta Holdings has been deleted plus ',
  'mixed with relatives': 'no record that Gamma Group was archived plus ',
};
for (const [name, unit] of Object.entries(UNITS)) {
  console.log('\nshape:', name);
  const pts = [];
  for (const n of [1000, 2000, 4000, 8000, 16000]) {
    let s = ''; while (s.length < n) s += unit;
    s = s.slice(0, n) + ' ACME was archived.';
    const reps = n <= 2000 ? 10 : n <= 8000 ? 3 : 1;
    const t = time(L.fires, s, reps);
    pts.push([n, t]);
    console.log('  ', String(n).padStart(6), 'bytes:', t.toFixed(2).padStart(9), 'ms', L.fires(s) ? 'FIRE' : 'keep');
  }
  const [x1, y1] = pts[1], [x2, y2] = pts[pts.length - 1];
  console.log('   growth exponent e =', (Math.log(y2 / y1) / Math.log(x2 / x1)).toFixed(2));
}
