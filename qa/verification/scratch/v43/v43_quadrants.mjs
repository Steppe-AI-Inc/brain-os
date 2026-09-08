import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
import { CORPUS, NEGATOR_NAMES, NEGATOR_TITLES, REAL_NAMES } from './v43_corpus.mjs';

const src = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const CONFIG = process.argv[2] || 'empty';
const known = CONFIG === 'known'
  ? [...REAL_NAMES, ...NEGATOR_NAMES, ...NEGATOR_TITLES, 'Archived Media Group', 'Closed Loop Systems', 'ACME', 'Media Group']
  : [];
const belt = buildBelt(src, { knownEntityNames: known });

const T = CORPUS.filter((r) => r.direction === 'truthful');
const F = CORPUS.filter((r) => r.direction === 'fabrication');
console.log(`CONFIG=${CONFIG}  corpus: ${T.length} truthful / ${F.length} fabrications  (total ${CORPUS.length})`);

const q = { tt: [], tr: [], resc: [], both: [], ff: [], fr: [], imp: [], miss: [] };
for (const r of T) { const v = v92(r.text), c = belt(r.text); if (!v && !c) q.tt.push(r); else if (!v && c) q.tr.push(r); else if (v && !c) q.resc.push(r); else q.both.push(r); }
for (const r of F) { const v = v92(r.text), c = belt(r.text); if (v && c) q.ff.push(r); else if (v && !c) q.fr.push(r); else if (!v && c) q.imp.push(r); else q.miss.push(r); }

console.log('\nTRUTHFUL quadrants');
console.log(`  v92 preserves & candidate preserves : ${q.tt.length}`);
console.log(`  v92 preserves & candidate DESTROYS  : ${q.tr.length}   <== TRUTH REGRESSION (must be 0)`);
console.log(`  v92 destroys  & candidate preserves : ${q.resc.length}   (rescued)`);
console.log(`  v92 destroys  & candidate destroys  : ${q.both.length}`);
console.log('\nFABRICATION quadrants');
console.log(`  v92 catches   & candidate catches   : ${q.ff.length}`);
console.log(`  v92 catches   & candidate MISSES    : ${q.fr.length}   <== FABRICATION REGRESSION (must be 0)`);
console.log(`  v92 misses    & candidate catches   : ${q.imp.length}   (improvement)`);
console.log(`  v92 misses    & candidate misses    : ${q.miss.length}   (residual, not a v92 regression)`);

const show = (name, arr) => { if (!arr.length) return; console.log(`\n--- ${name} (${arr.length})`); for (const r of arr) console.log(`  [${r.section}/${r.tag}] ${r.text}`); };
show('TRUTH REGRESSION vs v92', q.tr);
show('FABRICATION REGRESSION vs v92', q.fr);
if (process.env.V43_SHOW_ALL) { show('candidate destroys (v92 also destroys)', q.both); show('residual fabrications both miss', q.miss); }

// absolute candidate quality, independent of v92
const destroyed = T.filter((r) => belt(r.text));
const missed = F.filter((r) => !belt(r.text));
console.log(`\nABSOLUTE candidate: truthful destroyed ${destroyed.length}/${T.length}; fabrications missed ${missed.length}/${F.length}`);
if (process.env.V43_SHOW_ABS) { show('ABS destroyed truths', destroyed); show('ABS missed fabrications', missed); }

// per-section breakdown
const secs = [...new Set(CORPUS.map((r) => r.section))];
console.log('\nPER-SECTION (destroyed-truths / truths, missed-fabs / fabs)');
for (const s of secs) {
  const t = CORPUS.filter((r) => r.section === s && r.direction === 'truthful');
  const f = CORPUS.filter((r) => r.section === s && r.direction === 'fabrication');
  const dt = t.filter((r) => belt(r.text)).length, mf = f.filter((r) => !belt(r.text)).length;
  console.log(`  ${s.padEnd(24)} ${dt}/${t.length}   ${mf}/${f.length}`);
}
