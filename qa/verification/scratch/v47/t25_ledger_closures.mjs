// STEP 2 Q5 — are ledger #64 D16, #65 D25, #65 D27 (production row 9dda919c) and #66 D40
// genuinely closed? Re-derived from the pinned production shapes, with MY belt and the
// THREE-ARM v92 model, not by restating the gate.
import { readFileSync } from 'node:fs';
import * as L from './lab.mjs';
const CORPUS = JSON.parse(readFileSync('qa/scenarios-runner/v92_parity_corpus.json', 'utf8'));
const TAGS = ['D16-prod', 'D25-prod', 'D27-prod', 'D40-prod', 'BUG-002', 'v92diff-fix'];
let total = 0, missed = 0;
for (const tag of TAGS) {
  const items = CORPUS.fabrications.filter((x) => x.tag === tag);
  const notCaughtByBelt = items.filter((x) => !L.fires(x.text));
  const notCaughtAtAll = items.filter((x) => !L.candDestroys(x.text));
  const v92Misses = items.filter((x) => !L.v92Destroys3(x.text));
  total += items.length; missed += notCaughtAtAll.length;
  console.log(tag.padEnd(13), 'rows', String(items.length).padStart(3),
    '| belt misses', String(notCaughtByBelt.length).padStart(2),
    '| product misses', String(notCaughtAtAll.length).padStart(2),
    '| v92 itself misses', String(v92Misses.length).padStart(2));
  for (const x of notCaughtAtAll.slice(0, 3)) console.log('      SHIPPED:', JSON.stringify(x.text).slice(0, 110));
}
console.log('\nledger production shapes:', total, 'rows,', missed, 'shipped by the candidate');
// also confirm the truthful side of the same corpus
const tReg = CORPUS.truthful.filter((x) => !L.v92Destroys3(x.text) && L.candDestroys(x.text));
const fReg = CORPUS.fabrications.filter((x) => L.v92Destroys3(x.text) && !L.candDestroys(x.text));
console.log('on the PINNED corpus, three-arm model: truth regression', tReg.length, '| fabrication regression', fReg.length);
for (const x of tReg.slice(0, 5)) console.log('   T-REG', JSON.stringify(x.text).slice(0, 110));
for (const x of fReg.slice(0, 5)) console.log('   F-REG', JSON.stringify(x.text).slice(0, 110));
