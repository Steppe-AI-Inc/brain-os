// V47-D2 probe. The belt (readsAsCompletion) is NOT the last word on the founder-visible
// summary. `lifecycleMismatchCorrections` (identical in v92 and the candidate) overwrites
// result.summary at an EARLIER point in the same else-if chain. Any truthful row the belt
// "saves" but the lifecycle arm kills is a belt win that never reaches the founder.
import * as L from './lab.mjs';
import { CORPUS } from './corpus.mjs';

const beltSaves = CORPUS.filter((r) => r.label === 'T' && !L.fires(r.s) && !L.CAND_FUT.test(r.s));
const stillKilled = beltSaves.filter((r) => L.candLifecycleArm(r.s));
console.log('truthful rows the BELT preserves (belt-level win):', beltSaves.length);
console.log('   of which the lifecycle arm overwrites anyway :', stillKilled.length,
  '(' + (100 * stillKilled.length / beltSaves.length).toFixed(1) + '%)');
console.log('   product-level truthful rows actually preserved:', beltSaves.length - stillKilled.length);
const bySec = new Map();
for (const r of stillKilled) bySec.set(r.section, (bySec.get(r.section) || 0) + 1);
console.log('\nunreachable belt wins by section:');
for (const [k, v] of [...bySec].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);

console.log('\nthe campaign\'s own headline C3 rows, checked at PRODUCT level not belt level:');
for (const s of ['No company named Ulaanbaatar — North Depot was archived.',
                 'No unit at Erdenet — Copper Works was archived.',
                 'No Limits Inc was not archived.',
                 'No company named No Limits Inc was archived.',
                 'Not processing the request.']) {
  console.log('   ', JSON.stringify(s).padEnd(58),
    'belt=' + (L.fires(s) ? 'FIRE ' : 'keep '),
    'lifecycleArm=' + (L.candLifecycleArm(s) ? 'OVERWRITE' : 'keep     '),
    '=> founder sees ' + (L.candDestroys(s) ? 'CANNED CORRECTION' : 'the real answer'));
}
