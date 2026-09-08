// VERIFIER #48 — the four-quadrant differential: deployed v92 vs candidate, on MY corpus.
import { CORPUS, TRUTHFUL, FABRICATIONS } from './corpus.mjs';
import { makeCandDestroys, v92Arm, v92Destroys } from './harness.mjs';

const MODE = (process.env.V48_PACK === 'empty' || process.argv.includes('--empty')) ? 'empty' : 'populated';
const VERBOSE = process.argv.includes('--verbose');

const bySection = new Map();
const quad = { TT_pp: 0, TT_dd: 0, TRUTH_REGRESSION: [], TRUTH_RESCUE: [] };
const fquad = { FF_dd: 0, FF_pp: [], FAB_REGRESSION: [], FAB_GAIN: [] };

for (const r of CORPUS) {
  const names = MODE === 'empty' ? [] : (r.names || []);
  const cand = makeCandDestroys(names);
  const c = cand(r.text);
  const v = v92Arm(r.text);
  const cD = c !== null;
  const vD = v92Destroys(r.text);
  const rec = { ...r, v92: v, cand: c };
  if (!bySection.has(r.section)) bySection.set(r.section, { n: 0, tr: 0, fr: 0, rescue: 0, gain: 0 });
  const s = bySection.get(r.section);
  s.n++;
  if (r.label === 'T') {
    if (!vD && !cD) quad.TT_pp++;
    else if (vD && cD) quad.TT_dd++;
    else if (!vD && cD) { quad.TRUTH_REGRESSION.push(rec); s.tr++; }
    else { quad.TRUTH_RESCUE.push(rec); s.rescue++; }
  } else {
    if (vD && cD) fquad.FF_dd++;
    else if (!vD && !cD) fquad.FF_pp.push(rec);
    else if (vD && !cD) { fquad.FAB_REGRESSION.push(rec); s.fr++; }
    else { fquad.FAB_GAIN.push(rec); s.gain++; }
  }
}

console.log('=== VERIFIER #48 DIFFERENTIAL — entity pack: ' + MODE + ' ===');
console.log('corpus rows: ' + CORPUS.length + '  truthful: ' + TRUTHFUL.length + '  fabrications: ' + FABRICATIONS.length);
console.log('');
console.log('TRUTHFUL quadrants');
console.log('  v92 preserves & candidate preserves : ' + quad.TT_pp);
console.log('  v92 destroys  & candidate destroys  : ' + quad.TT_dd + '   (parity — v92 already destroys these)');
console.log('  v92 destroys  & candidate PRESERVES : ' + quad.TRUTH_RESCUE.length + '   (RESCUE)');
console.log('  v92 preserves & candidate DESTROYS  : ' + quad.TRUTH_REGRESSION.length + '   *** TRUTH REGRESSION ***');
console.log('');
console.log('FABRICATION quadrants');
console.log('  v92 destroys  & candidate destroys  : ' + fquad.FF_dd);
console.log('  v92 preserves & candidate destroys  : ' + fquad.FAB_GAIN.length + '   (GAIN)');
console.log('  v92 preserves & candidate preserves : ' + fquad.FF_pp.length + '   (both ship it — not a regression vs v92)');
console.log('  v92 destroys  & candidate PRESERVES : ' + fquad.FAB_REGRESSION.length + '   *** FABRICATION REGRESSION ***');
console.log('');
if (quad.TRUTH_REGRESSION.length) {
  console.log('--- TRUTH REGRESSIONS (candidate destroys a truthful answer v92 ships) ---');
  for (const r of quad.TRUTH_REGRESSION) console.log('  [' + r.id + '] arm=' + r.cand + '  ' + JSON.stringify(r.text));
  console.log('');
}
if (fquad.FAB_REGRESSION.length) {
  console.log('--- FABRICATION REGRESSIONS (candidate ships a fabrication v92 corrects) ---');
  for (const r of fquad.FAB_REGRESSION) console.log('  [' + r.id + '] v92arm=' + r.v92 + '  ' + JSON.stringify(r.text));
  console.log('');
}
if (fquad.FF_pp.length) {
  console.log('--- BOTH SHIP (v92 preserves too — informational, not a regression) ---');
  for (const r of fquad.FF_pp) console.log('  [' + r.id + '] ' + JSON.stringify(r.text));
  console.log('');
}
if (VERBOSE) {
  console.log('--- per row (label | v92 arm | candidate arm) ---');
  for (const r of CORPUS) {
    const names = MODE === 'empty' ? [] : (r.names || []);
    const c = makeCandDestroys(names)(r.text);
    console.log('  ' + r.label + ' ' + r.id.padEnd(14) + ' v92=' + String(v92Arm(r.text)).padEnd(16)
      + ' cand=' + String(c).padEnd(16) + ' ' + JSON.stringify(r.text));
  }
  console.log('');
}
console.log('--- per section (n / truthRegression / fabRegression / rescue / gain) ---');
for (const [k, v] of [...bySection.entries()].sort()) {
  console.log('  ' + k.padEnd(12) + ' n=' + String(v.n).padStart(4) + '  TR=' + v.tr + '  FR=' + v.fr + '  rescue=' + v.rescue + '  gain=' + v.gain);
}

const fail = quad.TRUTH_REGRESSION.length > 0 || fquad.FAB_REGRESSION.length > 0;
console.log('');
console.log(fail ? 'RESULT: DIFFERENTIAL NOT CLEAN' : 'RESULT: DIFFERENTIAL CLEAN (0 truth regressions, 0 fabrication regressions)');
process.exitCode = fail ? 1 : 0;
