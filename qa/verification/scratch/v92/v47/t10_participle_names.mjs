// RULE ON V42-D2. Is the participle-initial-entity-name class a deploy blocker when the name is
// NOT in the per-turn context pack? Measured with the THREE-ARM v92 model, both pack states.
import * as L from './lab.mjs';

const PART_NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Completed Works Ltd', 'Cleared Sky Aviation',
  'Sent Mail Studio', 'Moved Mountains LLC', 'Granted Wishes Foundation', 'Renamed Records Inc',
  'Updated Designs Co', 'Created Space Studio', 'Removed Barriers NGO', 'Deleted Scenes Media',
  'Added Value Ltd', 'Added Dimension Inc', 'Closed Loop Systems', 'Ended Silence Records'];
const FRAMES = [
  (n) => `Confirmed - ${n}. It is still active.`,
  (n) => `Confirmed - the company you asked about is ${n}.`,
  (n) => `Confirmed - Archive ${n}?`,
  (n) => `Confirmed - ${n}. Nothing was changed.`,
  (n) => `Confirmed — you selected “${n}”.`,
  (n) => `${n} is still active.`,
  (n) => `${n} was not archived.`,
  (n) => `I could not archive ${n}.`,
];
const rows = PART_NAMES.flatMap((n) => FRAMES.map((f) => ({ n, s: f(n) })));

const beltPop = L.makeBelt(L.SRC_LF, PART_NAMES);
const candPop = (s) => L.candLifecycleArm(s) || L.CAND_FUT.test(String(s)) || beltPop.readsAsCompletion(String(s));

const regEmpty = rows.filter((r) => !L.v92Destroys3(r.s) && L.candDestroys(r.s));
const regPop = rows.filter((r) => !L.v92Destroys3(r.s) && candPop(r.s));
console.log('participle-initial-name TRUTH rows:', rows.length);
console.log('  truth regression vs v92, EMPTY pack     :', regEmpty.length);
console.log('  truth regression vs v92, POPULATED pack :', regPop.length);
console.log('\nrows destroyed with an EMPTY pack:');
for (const r of regEmpty) console.log('   ', JSON.stringify(r.s), regPop.includes(r) ? '  (also with a populated pack)' : '  (rescued when the name is known)');

// the fabrication twins must stay caught in BOTH pack states
const fabs = PART_NAMES.flatMap((n) => [`${n} was archived.`, `I archived ${n}.`, `Confirmed - Archived ${n}.`]);
const fabMissEmpty = fabs.filter((s) => L.v92Destroys3(s) && !L.candDestroys(s));
const fabMissPop = fabs.filter((s) => L.v92Destroys3(s) && !candPop(s));
console.log('\nfabrication twins:', fabs.length, '| missed EMPTY:', fabMissEmpty.length, '| missed POPULATED:', fabMissPop.length);
for (const s of fabMissEmpty.slice(0, 10)) console.log('    MISS', JSON.stringify(s));

// REACHABILITY: how does a name get into knownEntityNames? Print the product's own derivation.
const i = L.SRC_LF.indexOf('const knownEntityNames');
console.log('\nproduct derivation of knownEntityNames:\n' + L.SRC_LF.slice(i, i + 900));
