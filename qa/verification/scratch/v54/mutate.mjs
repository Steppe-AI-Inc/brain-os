// V54 — INDEPENDENT mutation proof. Each shipped fix is reverted in the EXTRACTED belt source and
// the corpus is re-measured. A fix that is load-bearing must RE-OPEN its shapes when reverted.
// A mutation that changes nothing is a DEAD fix and is reported as such.
import { gate } from './harness.mjs';
import { PACK, O1_PACK_EXTRA, ROWS } from './corpus.mjs';

const NAMES = [...PACK, ...O1_PACK_EXTRA];
const base = gate(NAMES);
const SRC = base.source;

function anchor(re, label) {
  const m = SRC.match(re);
  if (!m) throw new Error('MUTATION ANCHOR NOT FOUND (' + label + ') — the mutation would be vacuous');
  return m[0];
}

const MUTANTS = [];
const add = (id, desc, fn) => MUTANTS.push({ id, desc, fn });

// M1 — V53-D1: the positive-only word-prefix search inside the first-person arm.
add('M1_V53D1_prefix_search', 'remove the word-prefix pack search from the first-person arm', (s) => {
  const a = anchor(/\|\| \(\(__t\) => __t\.split\(\/\(\?<=\\S\)\(\?=\\s\)\/\)[\s\S]{0,400}?\)\)\(c\.slice\(\(__f\.index \?\? 0\) \+ __f\[0\]\.length - String\(__f\[1\]\)\.length\)\)/, 'M1');
  return s.replace(a, '');
});
// M2 — V53-R2: prefix cap 16 -> 8 (the pre-R2 value).
add('M2_V53R2_cap16to8', 'revert the prefix cap from 16 back to 8', (s) => {
  const a = anchor(/\.slice\(0, 16\)/, 'M2');
  return s.replace(a, '.slice(0, 8)');
});
// M3 — V52-D1: the name-safe negator scan inside completionIsNegated.
add('M3_V52D1_name_safe_negator', 'neutralise nameInternal (negator-inside-a-name scan)', (s) => {
  const a = anchor(/const nameInternal = /, 'M3');
  return s.replace(a, 'const nameInternal = false && ');
});
add('M3b_titleHead', 'neutralise titleHead', (s) => {
  const a = anchor(/const titleHead = /, 'M3b');
  return s.replace(a, 'const titleHead = false && ');
});
add('M3c_ppInternal', 'neutralise ppInternal', (s) => {
  const a = anchor(/const ppInternal = /, 'M3c');
  return s.replace(a, 'const ppInternal = false && ');
});
// M4 — the widened reassurance-idiom strip.
add('M4_idiom_strip', 'remove the reassurance-idiom leading strip', (s) => {
  const a = anchor(/\.replace\(\/\^\\s\*\(\?:\(\?:no problem\|no worries[\s\S]{0,300}?\/i, ''\)/, 'M4');
  return s.replace(a, '');
});
// M5 — R-AUXGAP whole-summary arm.
add('M5_R_AUXGAP', 'remove the R-AUXGAP whole-summary adverbial-blanking arm', (s) => {
  const a = anchor(/String\(s\)\.replace\(new RegExp\('\(\?<!\\\\b\(\?:couldn[\s\S]{0,700}?'gi'\), '\$1 '\)/, 'M5');
  return s.replace(a, 'String(s)');
});
// M6 — the entity positive signal consulted by the CONFIRMED arm.
add('M6_entity_signal', 'make knownEntityNames always empty (kill the positive entity signal)', (s) => s,
);

function measure(G, label) {
  let trTruth = 0, shipFab = 0;
  for (const r of ROWS) {
    const d = G.readsAsCompletion(r.text);
    if (r.truthful && d) trTruth++;
    if (!r.truthful && !d) shipFab++;
  }
  return { label, truthfulDestroyed: trTruth, fabricationsShipped: shipFab };
}

const b = measure(base, 'BASELINE');
console.log('BASELINE (candidate as committed, populated pack):',
  'truthful destroyed =', b.truthfulDestroyed, '| fabrications shipped =', b.fabricationsShipped,
  '(of', ROWS.filter((r) => r.truthful).length, 'truthful /', ROWS.filter((r) => !r.truthful).length, 'fabrications)');
console.log('');
let dead = 0;
for (const m of MUTANTS) {
  let G, err = null;
  try { G = m.id === 'M6_entity_signal' ? gate([]) : gate(NAMES, m.fn); } catch (e) { err = e.message; }
  if (err) { console.log(`${m.id.padEnd(28)} ANCHOR FAILURE: ${err}`); dead++; continue; }
  const r = measure(G, m.id);
  const reopened = r.fabricationsShipped - b.fabricationsShipped;
  const lost = r.truthfulDestroyed - b.truthfulDestroyed;
  const verdict = (reopened !== 0 || lost !== 0) ? 'LOAD-BEARING' : 'NO EFFECT ON MY CORPUS';
  if (verdict !== 'LOAD-BEARING') dead++;
  console.log(`${m.id.padEnd(28)} fabs shipped ${String(r.fabricationsShipped).padStart(3)} (${reopened >= 0 ? '+' : ''}${reopened})  truthful destroyed ${String(r.truthfulDestroyed).padStart(3)} (${lost >= 0 ? '+' : ''}${lost})  ${verdict}`);
  console.log(`     ${m.desc}`);
}
console.log('\nmutants with no measurable effect on my corpus:', dead, 'of', MUTANTS.length);
