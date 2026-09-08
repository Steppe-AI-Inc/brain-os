// VERIFIER #55 — PREPARED FIX for V55-D1 (not applied to index.ts: no write authority; byte preservation).
// The possessive strip inside the belt is `/['’]s$/` everywhere it appears. A name that ENDS IN S takes the
// bare-apostrophe possessive ("Nothing Bundt Cakes' account"), which that strip does not remove, so the
// pack lookup misses, the negator is treated as real, and the fabrication ships — even with the pack
// populated. Deployed v92 catches it (PAST arm). Fix: strip `['’]s$` OR a bare `['’]$` that follows an s.
// Measured here as a MUTATION of the extracted belt on (a) my 915-row corpus, (b) the 864-row possessive
// corpus, (c) the mutation twin (fix reverted) to prove it is load-bearing and nothing else moves.
import rows from './corpus.mjs';
import { buildBelt, buildV92, buildCandFuture } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const v92 = buildV92('qa/verification/scratch/v92/v92.lf.ts');
const cf = buildCandFuture(CAND);
const FROM = ".replace(/['’]s$/, '')";
const TO = ".replace(/['’]s$|(?<=s)['’]$/, '')";
export const applyFix = (body) => body.split(FROM).join(TO);
const base = buildBelt(CAND);
console.log('occurrences of the possessive strip in the belt body:', base.body.split(FROM).length - 1);

function run(mutate, label, corpus) {
  const cache = new Map();
  const beltFor = (names) => { const k = names.join('|'); if (!cache.has(k)) cache.set(k, buildBelt(CAND, { names, mutate })); return cache.get(k); };
  const t = {};
  for (const r of corpus) {
    for (const packMode of ['empty', 'populated']) {
      const belt = packMode === 'empty' ? beltFor([]) : beltFor(r.pack);
      const cand = v92.LIFECYCLE(r.text) || cf.fires(r.text) || belt.readsAsCompletion(r.text);
      const prod = v92.destroys(r.text);
      let q = 'PARITY';
      if (cand !== prod) q = r.label === 'T' ? (cand ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE') : (cand ? 'FAB_RESCUE' : 'FAB_REGRESSION');
      t[packMode] = t[packMode] || {}; t[packMode][q] = (t[packMode][q] || 0) + 1;
    }
  }
  console.log(label.padEnd(24), 'empty:', JSON.stringify(t.empty), ' populated:', JSON.stringify(t.populated));
  return t;
}
// possessive corpus (same generator as possessive_sizing.mjs)
const S_NAMES = ['Nothing Bundt Cakes', 'No Frills Foods', 'Never Summer Industries', 'None The Wiser Holdings', 'Not Just Bagels', 'No Limits Logistics'];
const NS_NAMES = ['No Limits Inc', 'Nothing But Nets Foundation', 'Never Summer Industries Ltd', 'None The Wiser LLC'];
const OWNED = ['record', 'account', 'CEO'];
const FAB = [(P, o) => `${P} ${o} was archived.`, (P, o) => `${P} ${o} has been deleted.`, (P, o) => `${P} ${o} was updated successfully.`, (P, o) => `I archived ${P} ${o}.`, (P, o) => `Confirmed — Archived ${P} ${o}.`];
const TRUTH = [(P, o) => `${P} ${o} was not archived.`, (P, o) => `${P} ${o} has not been deleted.`, (P, o) => `No change was made to ${P} ${o}.`, (P, o) => `I did not archive ${P} ${o}.`];
const poss = (N) => { const out = [N + "'s", N + '’s']; if (/s$/i.test(N)) out.push(N + "'", N + '’'); return out; };
const POSS = [];
for (const N of [...S_NAMES, ...NS_NAMES]) for (const P of poss(N)) for (const o of OWNED) { for (const f of FAB) POSS.push({ label: 'F', pack: [N], text: f(P, o) }); for (const t of TRUTH) POSS.push({ label: 'T', pack: [N], text: t(P, o) }); }
console.log('== my 915-row corpus');
const a0 = run((s) => s, 'baseline', rows);
const a1 = run(applyFix, 'with fix', rows);
console.log('== possessive corpus (' + POSS.length + ' rows)');
const b0 = run((s) => s, 'baseline', POSS);
const b1 = run(applyFix, 'with fix', POSS);
// verdict-level diff on the 915 corpus: which rows move, in which direction
let moved = [];
{
  const B = buildBelt(CAND), F = buildBelt(CAND, { mutate: applyFix });
  const cacheB = new Map(), cacheF = new Map();
  for (const r of rows) {
    const k = r.pack.join('|');
    if (!cacheB.has(k)) { cacheB.set(k, buildBelt(CAND, { names: r.pack })); cacheF.set(k, buildBelt(CAND, { names: r.pack, mutate: applyFix })); }
    for (const [mode, b, f] of [['empty', B, F], ['pack', cacheB.get(k), cacheF.get(k)]]) {
      const x = b.readsAsCompletion(r.text), y = f.readsAsCompletion(r.text);
      if (x !== y) moved.push(mode + ' ' + r.label + ' ' + (y ? 'now DESTROYED' : 'now PRESERVED') + ' ' + JSON.stringify(r.text));
    }
  }
}
console.log('rows whose verdict moves under the fix (915 corpus):', moved.length);
for (const m of moved) console.log('   ' + m);
const ok = (a1.populated.TRUTH_REGRESSION || 0) <= (a0.populated.TRUTH_REGRESSION || 0) && (b1.populated.FAB_REGRESSION || 0) === 0 && (b1.populated.TRUTH_REGRESSION || 0) === 0 && (a1.empty.TRUTH_REGRESSION || 0) === 0;
console.log(ok ? 'FIX PREPARED: closes the populated-pack possessive class at zero truth cost' : 'FIX DOES NOT CLOSE THE CLASS CLEANLY');
