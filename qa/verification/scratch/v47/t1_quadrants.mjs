import * as L from './lab.mjs';
import { CORPUS, TRUTH, FAB } from './corpus.mjs';

const MODEL = process.env.V92_ARMS === '2' ? L.v92Destroys2 : L.v92Destroys3;
console.log('v92 model =', process.env.V92_ARMS === '2' ? 'TWO-ARM (lib/v92_reference.mjs)' : 'THREE-ARM (v47 corrected)');
console.log('corpus: total', CORPUS.length, '| truthful', TRUTH.length, '| fabrication', FAB.length);

// four quadrants over the whole corpus
const q = { pp: [], pd: [], dp: [], dd: [] }; // v92Preserve/Destroy x candPreserve/Destroy
for (const r of CORPUS) {
  const v = MODEL(r.s), c = L.candDestroys(r.s);
  (!v && !c ? q.pp : !v && c ? q.pd : v && !c ? q.dp : q.dd).push(r);
}
console.log('\nQUADRANTS (all rows)');
console.log('  v92 preserve / cand preserve :', q.pp.length);
console.log('  v92 preserve / cand DESTROY  :', q.pd.length, '  <- truth regression candidates');
console.log('  v92 DESTROY  / cand preserve :', q.dp.length, '  <- fabrication regression candidates');
console.log('  v92 DESTROY  / cand DESTROY  :', q.dd.length);

// TRUTH REGRESSION: a TRUTHFUL row v92 preserves and the candidate destroys.
const truthReg = q.pd.filter((r) => r.label === 'T');
// FABRICATION REGRESSION: a FABRICATION v92 destroys and the candidate preserves.
const fabReg = q.dp.filter((r) => r.label === 'F');

console.log('\nTRUTH REGRESSION (truthful, v92 keeps, candidate destroys):', truthReg.length);
const bySec = new Map();
for (const r of truthReg) bySec.set(r.section, (bySec.get(r.section) || 0) + 1);
for (const [k, v] of [...bySec].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);
for (const r of truthReg.slice(0, 60)) console.log('    T-REG', r.section, '::', JSON.stringify(r.s));

console.log('\nFABRICATION REGRESSION (fabrication, v92 catches, candidate misses):', fabReg.length);
const bySec2 = new Map();
for (const r of fabReg) bySec2.set(r.section, (bySec2.get(r.section) || 0) + 1);
for (const [k, v] of [...bySec2].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);
for (const r of fabReg.slice(0, 60)) console.log('    F-REG', r.section, '::', JSON.stringify(r.s));

// also: fabrications NEITHER catches (shared blind spot, not a regression but worth naming)
const bothMiss = CORPUS.filter((r) => r.label === 'F' && !MODEL(r.s) && !L.candDestroys(r.s));
console.log('\nFABRICATIONS NEITHER v92 NOR CANDIDATE CATCHES:', bothMiss.length);
for (const r of bothMiss) console.log('    BLIND', r.section, '::', JSON.stringify(r.s));

// and: truthful rows BOTH destroy (v92 parity truth loss — pre-existing, not a regression)
const bothKill = CORPUS.filter((r) => r.label === 'T' && MODEL(r.s) && L.candDestroys(r.s));
console.log('\nTRUTHFUL ROWS BOTH DESTROY (v92 parity, pre-existing):', bothKill.length);
const bySec3 = new Map();
for (const r of bothKill) bySec3.set(r.section, (bySec3.get(r.section) || 0) + 1);
for (const [k, v] of [...bySec3].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);

// improvements: truthful rows v92 destroys and the candidate saves
const saved = CORPUS.filter((r) => r.label === 'T' && MODEL(r.s) && !L.candDestroys(r.s));
console.log('\nTRUTHFUL ROWS THE CANDIDATE SAVES THAT v92 DESTROYS:', saved.length);
const caught = CORPUS.filter((r) => r.label === 'F' && !MODEL(r.s) && L.candDestroys(r.s));
console.log('FABRICATIONS THE CANDIDATE CATCHES THAT v92 MISSES:', caught.length);
