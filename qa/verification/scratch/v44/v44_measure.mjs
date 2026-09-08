// VERIFIER #44 — the four-quadrant differential, reported per half.
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
import * as C from './v44_corpus.mjs';

const candSrc = readSrc(CAND_PATH);
const v92Src = readSrc(V92_PATH);
const v92 = buildV92Gate(v92Src);

const POP = process.env.V44_PACK === 'populated' || process.argv.includes('--populated');
const allNames = [...C.CAP_NAMES, ...C.LOWER_NAMES, ...C.NEG_NAMES, ...C.TITLE_NAMES];
const cand = buildCandGate(candSrc, POP ? allNames : []);

const HALVES = [
  ['cap', C.CAP_NAMES],
  ['lower', C.LOWER_NAMES],
  ['negname', C.NEG_NAMES],
  ['titlename', C.TITLE_NAMES],
];

const rows = [];
const emit = (label, group, tag, half, text) => rows.push({ label, group, tag, half, text });
for (const [half, names] of HALVES) {
  for (const N of names) {
    for (const [tag, f] of C.TRUTH_TEMPLATES) emit('truth', 'negative', tag, half, f(N));
    for (const [tag, f] of C.HELP_TEMPLATES) emit('truth', 'help', tag, half, f(N));
    for (const [tag, f] of C.FAB_TEMPLATES) emit('fab', 'fabrication', tag, half, f(N));
    for (const [tag, f] of C.FAB_PLUS_TEMPLATES) emit('fabplus', 'fabrication+', tag, half, f(N));
  }
}

const q = (r) => (v92(r.text) ? 'V' : 'v') + (cand(r.text) ? 'C' : 'c');
for (const r of rows) r.q = q(r);

const counts = {};
const bucket = (k) => (counts[k] = counts[k] || { vc: 0, vC: 0, Vc: 0, VC: 0, rows: { vC: [], Vc: [] } });
for (const r of rows) {
  for (const k of [`${r.label}/${r.half}`, `${r.label}/ALL`]) {
    const b = bucket(k);
    b[r.q === 'vc' ? 'vc' : r.q === 'vC' ? 'vC' : r.q === 'Vc' ? 'Vc' : 'VC']++;
    if (r.q === 'vC') b.rows.vC.push(r);
    if (r.q === 'Vc') b.rows.Vc.push(r);
  }
}

console.log('candidate : ' + CAND_PATH);
console.log('pack      : ' + (POP ? 'POPULATED (' + allNames.length + ' names)' : 'EMPTY'));
console.log('rows      : ' + rows.length + '  (truth ' + rows.filter((r) => r.label === 'truth').length
  + ' / fab ' + rows.filter((r) => r.label === 'fab').length
  + ' / fab+ ' + rows.filter((r) => r.label === 'fabplus').length + ')');
console.log('\nquadrants  vc = neither fires | vC = ONLY candidate fires | Vc = ONLY v92 fires | VC = both');
console.log('key'.padEnd(22) + 'vc'.padStart(7) + 'vC'.padStart(7) + 'Vc'.padStart(7) + 'VC'.padStart(7));
for (const k of Object.keys(counts).sort()) {
  const b = counts[k];
  console.log(k.padEnd(22) + String(b.vc).padStart(7) + String(b.vC).padStart(7) + String(b.Vc).padStart(7) + String(b.VC).padStart(7));
}

// TRUTH REGRESSION  = truthful row, v92 preserves, candidate destroys  (vC on label=truth)
// FAB REGRESSION    = fabrication,   v92 catches,  candidate misses    (Vc on label=fab)
const truthReg = rows.filter((r) => r.label === 'truth' && r.q === 'vC');
const fabReg = rows.filter((r) => r.label === 'fab' && r.q === 'Vc');
const truthAlreadyLost = rows.filter((r) => r.label === 'truth' && (r.q === 'VC' || r.q === 'Vc'));
const fabPlusCaught = rows.filter((r) => r.label === 'fabplus' && r.q === 'vC');
const fabPlusMissed = rows.filter((r) => r.label === 'fabplus' && r.q === 'vc');

console.log('\nTRUTH REGRESSION (v92 preserves, candidate destroys): ' + truthReg.length);
const byTag = (list) => {
  const m = new Map();
  for (const r of list) { const k = r.tag + ' [' + r.half + ']'; m.set(k, (m.get(k) || []).concat(r.text)); }
  return m;
};
for (const [k, v] of byTag(truthReg)) console.log('   ' + k + '  x' + v.length + '  e.g. ' + JSON.stringify(v[0]));
console.log('\nFABRICATION REGRESSION (v92 catches, candidate misses): ' + fabReg.length);
for (const [k, v] of byTag(fabReg)) console.log('   ' + k + '  x' + v.length + '  e.g. ' + JSON.stringify(v[0]));
console.log('\n(context) truthful rows deployed v92 ALREADY destroys: ' + truthAlreadyLost.length);
console.log('(context) extra fabrications the candidate catches that v92 misses: ' + fabPlusCaught.length
  + ' of ' + (fabPlusCaught.length + fabPlusMissed.length));
for (const [k, v] of byTag(fabPlusMissed)) console.log('   still missed: ' + k + '  x' + v.length + '  e.g. ' + JSON.stringify(v[0]));

if (process.env.V44_DUMP) {
  for (const r of rows) if (r.q === process.env.V44_DUMP) console.log(r.q + ' ' + r.label + ' ' + r.tag + ' | ' + r.text);
}
process.exit(truthReg.length === 0 && fabReg.length === 0 ? 0 : 1);
