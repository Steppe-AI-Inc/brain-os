// VERIFIER #38 — candidate vs DEPLOYED v92 four-quadrant differential on my own corpus.
import { loadPair } from './harness.mjs';
import { CORPUS, TNs, FABs, DISAMBIG } from './corpus.mjs';

const p = loadPair();
const rows = CORPUS.map((c) => ({ ...c, v92: p.v92Fires(c.text), cand: p.candFires(c.text) }));

// Quadrants for truthful negatives (firing DESTROYS a true answer)
const tn = rows.filter((r) => r.kind === 'TN');
const tnBothPreserve = tn.filter((r) => !r.v92 && !r.cand);
const tnV92DestroysCandPreserves = tn.filter((r) => r.v92 && !r.cand);   // improvement
const tnBothDestroy = tn.filter((r) => r.v92 && r.cand);                  // no change (v92 already bad)
const tnRegression = tn.filter((r) => !r.v92 && r.cand);                  // P1 TRUTH REGRESSION

// Quadrants for fabrications (firing CORRECTS)
const fb = rows.filter((r) => r.kind === 'FAB');
const fbBothCatch = fb.filter((r) => r.v92 && r.cand);
const fbCandOnly = fb.filter((r) => !r.v92 && r.cand);                    // improvement
const fbNeither = fb.filter((r) => !r.v92 && !r.cand);                    // pre-existing gap
const fbRegression = fb.filter((r) => r.v92 && !r.cand);                  // P1 FAB REGRESSION

const out = [];
const say = (s) => { out.push(s); console.log(s); };

say('=== VERIFIER #38 CANDIDATE vs DEPLOYED-v92 DIFFERENTIAL ===');
say(`corpus: ${rows.length} cases  (TN=${tn.length}, FAB=${fb.length})  disambiguation shapes=${DISAMBIG.length}`);
say('');
say('TRUTHFUL NEGATIVES (firing = a true answer is destroyed)');
say(`  both preserve .................. ${tnBothPreserve.length}`);
say(`  v92 destroys, candidate saves .. ${tnV92DestroysCandPreserves.length}   (improvement)`);
say(`  both destroy ................... ${tnBothDestroy.length}   (v92 already destroyed; not a regression)`);
say(`  TRUTH REGRESSION (v92 saved, candidate destroys) = ${tnRegression.length}`);
say('');
say('FABRICATIONS (firing = corrected)');
say(`  both catch ..................... ${fbBothCatch.length}`);
say(`  candidate only ................. ${fbCandOnly.length}   (improvement)`);
say(`  neither ........................ ${fbNeither.length}   (pre-existing gap, not a regression)`);
say(`  FABRICATION REGRESSION (v92 caught, candidate ships) = ${fbRegression.length}`);
say('');

if (tnRegression.length) {
  say('--- P1 TRUTH REGRESSIONS ---');
  for (const r of tnRegression) say(`  [${r.section}] ${JSON.stringify(r.text)}  ${r.note}`);
  say('');
}
if (fbRegression.length) {
  say('--- P1 FABRICATION REGRESSIONS ---');
  for (const r of fbRegression) say(`  [${r.section}] ${JSON.stringify(r.text)}  ${r.note}`);
  say('');
}
say('--- fabrications NEITHER catches (pre-existing gaps, informational) ---');
for (const r of fbNeither) say(`  [${r.section}] ${JSON.stringify(r.text)}  ${r.note}`);
say('');
say('--- truthful negatives BOTH destroy (v92 baseline already destroys; informational) ---');
const bySec = {};
for (const r of tnBothDestroy) bySec[r.section] = (bySec[r.section] || 0) + 1;
for (const k of Object.keys(bySec)) say(`  ${k}: ${bySec[k]}`);

import('node:fs').then((fs) => {
  fs.writeFileSync(new URL('./differential_report.txt', import.meta.url), out.join('\n') + '\n');
  fs.writeFileSync(new URL('./differential_rows.json', import.meta.url), JSON.stringify(rows, null, 1));
});

process.exitCode = (tnRegression.length || fbRegression.length) ? 1 : 0;
