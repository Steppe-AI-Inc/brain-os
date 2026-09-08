// V54 — size the first-person TRUTHFUL-HISTORY class and the fourth-path class.
import { gate } from './harness.mjs';
import { PACK, O1_PACK_EXTRA } from './corpus.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
const G = gate([...PACK, ...O1_PACK_EXTRA]);
const v92 = (s) => LIFECYCLE_CLAIM(s) || FUTURE_PROMISE_PATTERN.test(s) || PAST_COMPLETION_CLAIM_PATTERN.test(s);

const rows = [];
const NAMES = ['ACME Corp', 'Khan Bank', 'Trade and Development Bank', 'Bob Smith', 'Golomt Bank', 'North Depot', 'No Limits Inc'];
const VERBS = ['archived', 'deleted', 'removed', 'restored', 'reassigned', 'renamed'];
const TAILS = ['yesterday.', 'last week, as you asked.', 'on 2026-03-01.', 'earlier in this conversation.', ' — you confirmed it then.'];
for (const n of NAMES) for (const v of VERBS) for (const t of TAILS) rows.push(`I ${v} ${n} ${t}`.replace(/\s+([—.])/, '$1'));
for (const n of NAMES) for (const v of VERBS) rows.push(`Yes — I ${v} ${n} yesterday.`);
for (const n of NAMES) for (const v of VERBS) rows.push(`Earlier today I ${v} ${n}.`);

let onlyCand = 0, both = 0, neither = 0, onlyV92 = 0;
const examples = [];
for (const s of rows) {
  const a = v92(s), b = G.readsAsCompletion(s);
  if (!a && b) { onlyCand++; if (examples.length < 12) examples.push(s); }
  else if (a && b) both++; else if (a && !b) onlyV92++; else neither++;
}
console.log('FIRST-PERSON HISTORY SHAPES: total', rows.length);
console.log('  v92 preserves + candidate destroys (differential):', onlyCand);
console.log('  both destroy:', both, '| both preserve:', neither, '| only v92 destroys:', onlyV92);
console.log('  examples:'); for (const e of examples) console.log('    ', JSON.stringify(e));

// Fourth-path sizing: LIFECYCLE fires, state claim confirms true, candidate belt fires.
const STATE = [];
for (const n of ['ACME Company', 'No Limits Inc']) for (const v of VERBS) {
  STATE.push(`${n} is active. I ${v} ${n} yesterday.`);
  STATE.push(`${n} is active — the company was ${v} last week.`);
}
console.log('\nFOURTH-PATH (state-claim suppression) SHAPES:');
for (const s of STATE) {
  const lc = LIFECYCLE_CLAIM(s);
  console.log(`  lifecycleRaw=${lc} v92arms=${v92(s)} cand=${G.readsAsCompletion(s)}  ${JSON.stringify(s)}`);
}
