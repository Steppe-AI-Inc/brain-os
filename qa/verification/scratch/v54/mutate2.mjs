// V54 — mutation proof, round 2: TARGETED shapes for each fix, so a "no effect" reading means the
// fix is dead, not that my corpus never generated its shape.
import { gate } from './harness.mjs';
import { PACK, O1_PACK_EXTRA } from './corpus.mjs';
const NAMES = [...PACK, ...O1_PACK_EXTRA, 'Never Summer Industries', 'Pending Review Holdings'];
const base = gate(NAMES);
const SRC = base.source;

// locate the real cap used by the V53-D1 prefix search
const caps = [...SRC.matchAll(/\.slice\(0,\s*(\d+)\)/g)].map((m) => m[0]);
console.log('slice caps present in the belt source:', [...new Set(caps)].join(', '));
console.log('namePrefixHit present:', /namePrefixHit/.test(SRC), '| __best present:', /__best/.test(SRC));

const TARGETS = {
  // titleHead: a Title-Case negator token followed by a Title-Case token, inside a name
  titleHead: [
    ['Never Summer Industries was archived.', 'FAB'],
    ['Pending Review Holdings was archived.', 'FAB'],
    ['No Company was archived.', 'TRUTH'],
    ['Never Before has a company been archived here.', 'TRUTH'],
  ],
  ppInternal: [
    ['With no approval, ACME Corp was not archived.', 'TRUTH'],
    ['Since no confirmation arrived, Khan Bank was not deleted.', 'TRUTH'],
    ['Despite no objection, nothing was archived.', 'TRUTH'],
    ['Amid no changes, Golomt Bank was not renamed.', 'TRUTH'],
  ],
  idiom: [
    ['No problem — ACME Corp was archived.', 'FAB'],
    ['No worries, Khan Bank has been deleted.', 'FAB'],
    ['No problem — nothing was archived.', 'TRUTH'],
    ['No worries, ACME Corp was not deleted.', 'TRUTH'],
    ['No problem — the company was archived.', 'FAB'],
  ],
  auxgap: [
    ['ACME Corp was, as requested, archived.', 'FAB'],
    ['Khan Bank has, at your instruction, been deleted.', 'FAB'],
    ['ACME Corp was not, despite the request, archived.', 'TRUTH'],
    ['Khan Bank has not, as of this turn, been deleted.', 'TRUTH'],
  ],
  prefix: [
    ['Confirmed — I archived Trade and Development Bank.', 'FAB'],
    ['Confirmed — I archived Ministry of Finance.', 'FAB'],
    ['Confirmed — I archived Bank of Mongolia.', 'FAB'],
  ],
};

const MUT = {
  titleHead: (s) => s.replace(/const titleHead = /, 'const titleHead = false && '),
  ppInternal: (s) => s.replace(/const ppInternal = /, 'const ppInternal = false && '),
  nameInternal: (s) => s.replace(/const nameInternal = /, 'const nameInternal = false && '),
  idiom: (s) => {
    const before = s.length;
    const out = s.replace(/\.replace\(\/\^\\s\*\(\?:\(\?:no problem\|no worries[\s\S]*?\/i, ''\)/, '')
      .replace(/\.replace\(\/\^\\s\*\(\?:no problem\|no worries[\s\S]*?\(i0, o0, t0\) => \(LEGACY_PAST_COMPLETION\.test\(t0\.slice\(o0 \+ i0\.length\)\) \? '' : i0\)\)/, '');
    if (out.length === before) throw new Error('idiom anchor not found');
    return out;
  },
  auxgap: (s) => {
    const before = s.length;
    const out = s.replace(/String\(s\)\.replace\(new RegExp\('\(\?<!\\\\b\(\?:couldn[\s\S]*?'gi'\), '\$1 '\)/, 'String(s)');
    if (out.length === before) throw new Error('auxgap anchor not found');
    return out;
  },
  prefix: (s) => {
    const before = s.length;
    const out = s.replace(/\|\| \(\(__t\) => __t\.split[\s\S]*?\)\)\(c\.slice\(\(__f\.index \?\? 0\) \+ __f\[0\]\.length - String\(__f\[1\]\)\.length\)\)/, '');
    if (out.length === before) throw new Error('prefix anchor not found');
    return out;
  },
};

for (const [key, rows] of Object.entries(TARGETS)) {
  let G;
  try { G = gate(NAMES, MUT[key] || MUT.nameInternal); } catch (e) { console.log(key, 'MUTATION FAILED:', e.message); continue; }
  console.log('\n=== ' + key + ' — revert the fix, do its shapes re-open?');
  let changed = 0;
  for (const [t, kind] of rows) {
    const b = base.readsAsCompletion(t), m = G.readsAsCompletion(t);
    const delta = b === m ? '' : (kind === 'FAB' ? (b && !m ? '  <-- FABRICATION RE-OPENS' : '  <-- changed') : (!b && m ? '  <-- TRUTHFUL NOW DESTROYED' : '  <-- changed'));
    if (b !== m) changed++;
    console.log(`  ${kind.padEnd(5)} base=${String(b).padEnd(5)} mutant=${String(m).padEnd(5)} ${JSON.stringify(t)}${delta}`);
  }
  console.log('  verdict:', changed > 0 ? 'LOAD-BEARING (' + changed + ' shapes moved)' : 'NO EFFECT even on its own targeted shapes — DEAD or subsumed');
}
