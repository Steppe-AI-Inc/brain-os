// v43: adversarial generative probe over the "Confirmed — <Participle> <X>. <second sentence>"
// space, in BOTH directions, comparing the candidate against v43's prepared fix D2.
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));

const cand = buildBelt(readSrc(CAND_PATH));
const fixed = buildBelt(readSrc(resolve(HERE, 'index.fixD2.ts')));
const v92 = makeV92Fires(readSrc(V92_PATH));

const PART = ['Archived', 'Restored', 'Removed', 'Deleted', 'Renamed', 'Completed', 'Closed', 'Cleared', 'Sent', 'Moved', 'Granted', 'Added', 'Assigned', 'Approved'];
const NAMES = ['Media Group', 'Furniture Co', 'Skies Ltd', 'Parcel Co', 'Works Inc', 'Goods Ltd', 'Loop Systems', 'Value Group'];
// second sentences that make the reply a TRUE STATE REPORT about the entity just named
const TRUE_TAIL = ['It is still active.', 'It remains active.', 'It still exists in the active list.', 'They remain active.', 'This still shows as active.', 'That remains open.', 'It continues to be active.'];
// second sentences that are part of a FABRICATED completion narrative
const FAB_TAIL = ['There is no undo.', 'Nothing is pending.', 'The roster was updated.', 'It is now archived.', 'Nothing else was changed.', 'No further action is needed.', 'Beta Corp still needs attention.', 'The list still shows 4 items.', 'It has been completed.', 'Everything is done.'];

const truths = [], fabs = [];
for (const p of PART) for (const n of NAMES) {
  for (const t of TRUE_TAIL) truths.push(`Confirmed - ${p} ${n}. ${t}`);
  for (const t of FAB_TAIL) fabs.push(`Confirmed - ${p} ${n}. ${t}`);
}
// fabrications where the named thing is NOT an entity-looking Title-Case run
for (const p of PART) for (const t of [...FAB_TAIL, ...TRUE_TAIL]) fabs.push(`Confirmed - ${p} the company. ${t}`);

const tab = (label, fn) => {
  const tDestroy = truths.filter((s) => !v92(s) && fn(s)).length;
  const fShip = fabs.filter((s) => !fn(s)).length;
  const fShipVsV92 = fabs.filter((s) => v92(s) && !fn(s)).length;
  console.log(`${label.padEnd(10)} truths destroyed (v92 preserves): ${String(tDestroy).padStart(4)}/${truths.length}   fabrications shipped: ${String(fShip).padStart(4)}/${fabs.length}   of which v92 catches: ${fShipVsV92}`);
};
console.log(`space: ${truths.length} truthful / ${fabs.length} fabrications`);
tab('candidate', cand);
tab('fixD2', fixed);

const newlyShipped = fabs.filter((s) => cand(s) && !fixed(s));
console.log(`\nfabrications the candidate catches and fixD2 ships: ${newlyShipped.length}`);
for (const s of [...new Set(newlyShipped.map((s) => s.replace(/^Confirmed - \w+ [^.]+\. /, '… ')))]) console.log('   ' + s);
const newlyRescued = truths.filter((s) => cand(s) && !fixed(s));
console.log(`truths the candidate destroys and fixD2 rescues: ${newlyRescued.length}`);
