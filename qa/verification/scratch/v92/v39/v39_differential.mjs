// VERIFIER #39 — candidate-vs-deployed-v92 differential over MY OWN corpus.
// Reports all four quadrants and lists every regression in both directions.
import { loadPair } from './belt39.mjs';
import { TRUTHFUL, FABRICATIONS } from './corpus39.mjs';

const P = loadPair();
const rows = [];
const q = { truthBothPreserve: 0, truthRescued: 0, truthRegression: [], truthBothDestroy: [] };
const g = { fabBothCatch: 0, fabExtraCaught: 0, fabRegression: [], fabBothMiss: [] };

for (const { tag, text } of TRUTHFUL) {
  const v = P.v92Fires(text), c = P.candFires(text);
  if (!v && !c) q.truthBothPreserve++;
  else if (v && !c) q.truthRescued++;
  else if (!v && c) q.truthRegression.push(`[${tag}] ${text}`);
  else q.truthBothDestroy.push(`[${tag}] ${text}`);
  rows.push({ kind: 'truthful', tag, text, v92: v, cand: c });
}
for (const { tag, text } of FABRICATIONS) {
  const v = P.v92Fires(text), c = P.candFires(text);
  if (v && c) g.fabBothCatch++;
  else if (!v && c) g.fabExtraCaught++;
  else if (v && !c) g.fabRegression.push(`[${tag}] ${text}`);
  else g.fabBothMiss.push(`[${tag}] ${text}`);
  rows.push({ kind: 'fabrication', tag, text, v92: v, cand: c });
}

const namesWithNegator = TRUTHFUL.filter((x) => x.tag.startsWith('B.'));
console.log('CORPUS: ' + TRUTHFUL.length + ' truthful, ' + FABRICATIONS.length + ' fabrications');
console.log('  (negator-token-name truthful section: ' + namesWithNegator.length
  + '; negator-token-name fabrication section: ' + FABRICATIONS.filter((x) => x.tag.startsWith('B.')).length + ')');
console.log('\nTRUTHFUL QUADRANTS');
console.log('  both preserve        : ' + q.truthBothPreserve);
console.log('  rescued by candidate : ' + q.truthRescued + '   (v92 destroyed, candidate preserves)');
console.log('  TRUTH REGRESSION     : ' + q.truthRegression.length + '   (v92 preserved, candidate destroys)');
console.log('  both destroy         : ' + q.truthBothDestroy.length + '   (not a regression; v92 also wrong)');
console.log('\nFABRICATION QUADRANTS');
console.log('  both catch           : ' + g.fabBothCatch);
console.log('  extra caught by cand : ' + g.fabExtraCaught);
console.log('  FABRICATION REGRESS. : ' + g.fabRegression.length + '   (v92 caught, candidate ships)');
console.log('  both miss            : ' + g.fabBothMiss.length + '   (not a regression; v92 also missed)');

if (q.truthRegression.length) { console.log('\nTRUTH REGRESSIONS:'); q.truthRegression.forEach((x) => console.log('  ! ' + x)); }
if (g.fabRegression.length) { console.log('\nFABRICATION REGRESSIONS:'); g.fabRegression.forEach((x) => console.log('  ! ' + x)); }
if (q.truthBothDestroy.length) { console.log('\nTRUTHFUL DESTROYED BY BOTH (absolute quality, not a regression):'); q.truthBothDestroy.forEach((x) => console.log('  ~ ' + x)); }
if (g.fabBothMiss.length) { console.log('\nFABRICATIONS MISSED BY BOTH (absolute quality, not a regression):'); g.fabBothMiss.forEach((x) => console.log('  ~ ' + x)); }

if (process.env.V39_DUMP) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.V39_DUMP, JSON.stringify(rows, null, 1));
}
const bad = q.truthRegression.length + g.fabRegression.length;
console.log('\nRESULT: ' + (bad === 0 ? 'NO REGRESSIONS vs v92' : bad + ' REGRESSIONS vs v92'));
process.exit(bad === 0 ? 0 : 1);
