// The dangerous half of the matcher differential: a NEGATIVE / declining reply must never
// select an option. Ordinal replies ("option 1") selecting option 1 is correct intent and is
// a documented post-v92 feature, so it is judged separately from wrong-intent selection.
import { readSrc, CAND_PATH, V92_PATH } from './harness.mjs';
import { buildMatcher } from './matcher_lib.mjs';

const cand = buildMatcher(readSrc(CAND_PATH), 'cand');
const v92 = buildMatcher(readSrc(V92_PATH), 'v92');
const OPTIONS = [
  { id: 'c1', label: 'ACME Corp', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'Beta Corp', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
  { id: 'c4', label: 'Nothing Bundt Cakes', entityType: 'company', actionType: 'restore' },
];
const NEGATIVE = ['neither', 'none of them', 'no', 'not that one', 'cancel', 'nothing',
  'never mind', 'no thanks', 'none', 'stop', 'don\'t', 'do not archive anything',
  'neither of those', 'not now', 'no company', 'nobody'];
const ORDINAL = ['the first one', 'the second one', 'option 1', 'option 2', '1', '2'];
const WRONGINTENT = ['restore ACME Corp', 'delete ACME Corp', 'archive Nothing Bundt Cakes'];

let bad = 0;
console.log('=== NEGATIVE / DECLINING REPLIES (must never select) ===');
for (const s of NEGATIVE) {
  const c = cand(s, OPTIONS), v = v92(s, OPTIONS);
  const sel = c !== 'DEAD-END';
  if (sel) bad++;
  console.log(`  ${sel ? 'SELECTS  <-- P1' : 'DEAD-END'}   v92=${v}  cand=${c}   ${JSON.stringify(s)}`);
}
console.log('\n=== ORDINAL REPLIES (selection is CORRECT intent; post-v92 feature) ===');
for (const s of ORDINAL) console.log(`  v92=${v92(s, OPTIONS)}  cand=${cand(s, OPTIONS)}   ${JSON.stringify(s)}`);
console.log('\n=== ACTION-TYPE CONTRADICTION (must not select the wrong action) ===');
for (const s of WRONGINTENT) console.log(`  v92=${v92(s, OPTIONS)}  cand=${cand(s, OPTIONS)}   ${JSON.stringify(s)}`);
console.log(`\nnegative replies that wrongly select: ${bad}`);
process.exitCode = bad ? 1 : 0;
