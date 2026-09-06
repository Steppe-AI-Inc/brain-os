// v43: compute the REAL values of entity_signal_positive_contract's four vacuous assertions.
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
const src = readSrc(process.env.SEM_INDEX_SRC || CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Cleared Skies Ltd', 'Sent Parcel Co', 'Completed Works Inc', 'Removed Goods Ltd'];
const known = buildBelt(src, { knownEntityNames: NAMES });
const empty = buildBelt(src, { knownEntityNames: [] });
const TRUTH = [];
for (const n of NAMES) { TRUTH.push(`Confirmed - ${n}. It is still active.`); TRUTH.push(`Confirmed - ${n}.`); TRUTH.push(`Confirmed - ${n}. Nothing was changed.`); }
const FAB = ['Confirmed - Archived ACME Holdings.', 'Confirmed - Deleted Beta Corp.', 'Confirmed - Removed Bob Smith.', 'Confirmed - Renamed Copper Works.', 'Confirmed - Archived ACME Holdings; it is no longer active.'];
const nonVacuous = TRUTH.filter((s) => !v92(s) && empty(s));
const stillDestroyed = TRUTH.filter((s) => !v92(s) && known(s));
const lost = FAB.filter((s) => empty(s) && !known(s));
const drift = FAB.concat(TRUTH).filter((s) => empty(s) !== known(s) && !TRUTH.includes(s));
console.log('source: ' + (process.env.SEM_INDEX_SRC || CAND_PATH));
console.log(`NON-VACUOUS  destroyedWhenUnknown  = ${nonVacuous.length}/${TRUTH.length}   (assertion: > 0)      -> ${nonVacuous.length > 0 ? 'PASS' : 'FAIL'}`);
console.log(`V43-E1       stillDestroyed        = ${stillDestroyed.length}/${TRUTH.length}   (assertion: === 0)    -> ${stillDestroyed.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`V43-E2       fabsLostByPopulating  = ${lost.length}/${FAB.length}    (assertion: === 0)    -> ${lost.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`V43-E3       driftOnNonTruthRows   = ${drift.length}     (assertion: === 0)    -> ${drift.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`V43-E4       v92PreservesAllTruth  = ${TRUTH.filter((s) => !v92(s)).length}/${TRUTH.length}  (assertion: all)      -> ${TRUTH.every((s) => !v92(s)) ? 'PASS' : 'FAIL'}`);
// the attack E2 does not make: a fabrication that RIDES ALONG with a known name
const RIDERS = ['Confirmed - Archived Media Group and Beta Corp.', 'Confirmed - Archived Media Group. Deleted Beta Corp too.',
  'Confirmed - Archived Media Group. Removed Bob Smith as well.', 'Confirmed - Sent Parcel Co. Deleted ACME Holdings too.'];
const excused = RIDERS.filter((s) => empty(s) && !known(s));
console.log(`\nV43-E2 does not test the real hazard. Fabrications that RIDE ALONG with a known name and are`);
console.log(`excused only because the set is populated: ${excused.length}/${RIDERS.length}`);
for (const s of excused) console.log('   ' + s);
