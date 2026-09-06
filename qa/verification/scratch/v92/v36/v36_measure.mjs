// VERIFIER #36 — four-quadrant differential of the candidate vs deployed v92 on my own corpus.
// Truth side: end-to-end "destroyed" (ungrounded turn, claims:null). Fab side: end-to-end "ships"
// (neither claims:null nor claims:[] fires). v92 side: PAST_COMPLETION_CLAIM_PATTERN on the summary.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGate, v92LiteralFromGit } from './v36_harness.mjs';
import { ROWS, SECTIONS } from './v36_corpus.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const g = makeGate(process.env.SEM_INDEX_SRC);
const gitLit = v92LiteralFromGit();
console.log('PCCP literal sha256', g.v92.sha, '| identical to git c9dfab5bd433 literal:', gitLit === g.v92.literal);
const out = { truth: {}, fab: {}, rows: [] };
const agg = (o, k) => (o[k] = (o[k] || 0) + 1);
for (const [section, kind, s] of ROWS) {
  const v = g.v92fires(s);
  if (kind === 'T') {
    const d = g.destroyed(s);
    const q = !v && !d ? 'preserved' : !v && d ? 'TRUTH_REGRESSION' : v && !d ? 'rescued' : 'shared_loss';
    agg(out.truth, q); out.rows.push({ section, kind, s, v92: v ? 'FIRE' : 'keep', cand: d ? 'DESTROY' : 'keep', q });
  } else {
    const sh = g.ships(s);
    const q = v && !sh ? 'both_catch' : v && sh ? 'FAB_REGRESSION' : !v && !sh ? 'improvement' : 'shared_miss';
    agg(out.fab, q); out.rows.push({ section, kind, s, v92: v ? 'FIRE' : 'ship', cand: sh ? 'SHIP' : 'catch', q });
  }
}
const nT = ROWS.filter((r) => r[1] === 'T').length, nF = ROWS.length - nT;
console.log(`corpus: ${nT} truthful / ${nF} fabrications, ${SECTIONS.length} sections`);
console.log('TRUTH quadrants:', out.truth);
console.log('FAB quadrants:', out.fab);
for (const sec of SECTIONS) {
  const rs = out.rows.filter((r) => r.section === sec);
  const c = {}; rs.forEach((r) => agg(c, r.q));
  console.log(`  ${sec.padEnd(36)} n=${String(rs.length).padStart(3)}  ${JSON.stringify(c)}`);
}
const bad = out.rows.filter((r) => /REGRESSION/.test(r.q));
console.log(`\nREGRESSIONS vs deployed v92: ${bad.length}`);
for (const r of bad) console.log(`  ${r.q} [${r.section}] ${JSON.stringify(r.s)}`);
const miss = out.rows.filter((r) => r.q === 'shared_miss');
console.log(`\nshared misses (both ship; reported, not gate items): ${miss.length}`);
for (const r of miss.slice(0, 40)) console.log(`  [${r.section}] ${JSON.stringify(r.s)}`);
writeFileSync(join(here, 'v36_measure_result.json'), JSON.stringify(out, null, 1));
process.exit(bad.length ? 1 : 0);
