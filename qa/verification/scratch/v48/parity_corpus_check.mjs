// VERIFIER #48 — run the PINNED v92 parity corpus through MY OWN harness (not the shipped gate).
import { readFileSync } from 'node:fs';
import { makeCandDestroys, v92Destroys, v92Arm } from './harness.mjs';

const C = JSON.parse(readFileSync('qa/scenarios-runner/v92_parity_corpus.json', 'utf8'));
console.log('pinned corpus: v92_commit=' + C.v92_commit + ' sha256=' + C.v92_sha256);
console.log('  (my own git-derived v92 sha256 is 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc)');

// Pack: every capitalised multi-word run that appears anywhere in the corpus, so the entity signal
// is exercised in its POSITIVE configuration. Also the empty configuration, separately.
const names = new Set();
for (const x of [...C.truthful, ...C.fabrications]) {
  for (const m of String(x.text).matchAll(/\b[A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*)+/g)) names.add(m[0]);
}
for (const mode of ['populated', 'empty']) {
  const cand = makeCandDestroys(mode === 'empty' ? [] : [...names]);
  let tr = []; let fr = []; let rescue = 0; let gain = 0;
  for (const x of C.truthful) {
    const v = v92Destroys(x.text); const c = cand(x.text) !== null;
    if (!v && c) tr.push(x); else if (v && !c) rescue++;
  }
  for (const x of C.fabrications) {
    const v = v92Destroys(x.text); const c = cand(x.text) !== null;
    if (v && !c) fr.push(x); else if (!v && c) gain++;
  }
  console.log('\n[' + mode + ' pack, ' + (mode === 'empty' ? 0 : names.size) + ' names]');
  console.log('  truthful ' + C.truthful.length + ': TRUTH REGRESSIONS=' + tr.length + '  rescued=' + rescue);
  for (const x of tr.slice(0, 12)) console.log('     TR [' + x.tag + '] ' + JSON.stringify(x.text));
  console.log('  fabrications ' + C.fabrications.length + ': FABRICATION REGRESSIONS=' + fr.length + '  gained=' + gain);
  for (const x of fr.slice(0, 12)) console.log('     FR [' + x.tag + '] v92arm=' + v92Arm(x.text) + ' ' + JSON.stringify(x.text));
  // Q5 specifically
  for (const tag of ['D16-prod', 'D25-prod', 'D27-prod', 'D40-prod', 'BUG-002', 'v92diff-fix']) {
    const items = C.fabrications.filter((x) => x.tag === tag);
    const missed = items.filter((x) => cand(x.text) === null);
    console.log('  Q5 ' + tag.padEnd(12) + ' rows=' + String(items.length).padStart(3)
      + '  still corrected=' + (items.length - missed.length) + '/' + items.length
      + (missed.length ? '  MISSED: ' + missed.map((x) => x.text).join(' | ') : ''));
  }
}
