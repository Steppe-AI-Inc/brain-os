import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
import { CORPUS, NEGATOR_NAMES, NEGATOR_TITLES, REAL_NAMES } from './v43_corpus.mjs';
const src = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const known = process.argv[2] === 'known'
  ? [...REAL_NAMES, ...NEGATOR_NAMES, ...NEGATOR_TITLES, 'Archived Media Group', 'Closed Loop Systems', 'ACME', 'Media Group'] : [];
const belt = buildBelt(src, { knownEntityNames: known });
console.log('--- TRUTHFUL rows the CANDIDATE destroys (with v92 verdict)');
for (const r of CORPUS) if (r.direction === 'truthful' && belt(r.text)) console.log(`  v92=${v92(r.text) ? 'ALSO-destroys' : 'PRESERVES  '} [${r.section}/${r.tag}] ${r.text}`);
console.log('\n--- FABRICATIONS the CANDIDATE misses (with v92 verdict), non-ORD sections + a sample of ORD');
const missed = CORPUS.filter((r) => r.direction === 'fabrication' && !belt(r.text));
const bySec = {};
for (const r of missed) (bySec[r.section] ||= []).push(r);
for (const [s, arr] of Object.entries(bySec)) {
  console.log(`  ${s}: ${arr.length} missed`);
  const shown = s.startsWith('ORD') || s.startsWith('NEG-NAME') ? arr.slice(0, 6) : arr;
  for (const r of shown) console.log(`     v92=${v92(r.text) ? 'CATCHES' : 'misses '} [${r.tag}] ${r.text}`);
}
