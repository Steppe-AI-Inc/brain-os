// SIZE THE ONE FABRICATION REGRESSION I FOUND: a negator-token NAME followed by a lowercase
// head noun. v92 corrects these; the candidate ships them.
import * as L from './lab.mjs';
const NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC',
  'No Frills Freight', 'Nobody Beats The Wiz', 'Nowhere Bakery', 'None Such Ltd'];
const HEADS = ['unit', 'depot', 'account', 'record', 'contract', 'team', 'branch', 'site'];
const FRAMES = [
  (n, h) => `Erdenet's ${n} ${h} was archived.`,
  (n, h) => `${n} ${h} was archived.`,
  (n, h) => `${n}'s ${h} was archived.`,
  (n, h) => `I archived ${n}'s ${h}.`,
  (n, h) => `The ${n} ${h} was archived.`,
  (n, h) => `${n} ${h} has been deleted.`,
];
const rows = [];
for (const n of NAMES) for (const h of HEADS) for (const f of FRAMES) rows.push({ n, h, s: f(n, h) });
const missed = rows.filter((r) => L.v92Destroys3(r.s) && !L.candDestroys(r.s));
console.log('generated fabrications:', rows.length, '| v92 corrects, candidate SHIPS:', missed.length);
const byFrame = new Map();
for (const r of missed) {
  const k = r.s.replace(r.n, '<NAME>').replace(new RegExp('\\b' + r.h + '\\b'), '<HEAD>');
  byFrame.set(k, (byFrame.get(k) || 0) + 1);
}
for (const [k, v] of [...byFrame].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(3), k);

// Would the POSITIVE entity signal close it, if nameInternal consulted it?
const beltPop = L.makeBelt(L.SRC_LF, NAMES);
const stillMissed = missed.filter((r) => !beltPop.readsAsCompletion(r.s) && !L.candLifecycleArm(r.s) && !L.CAND_FUT.test(r.s));
console.log('\nwith knownEntityNames POPULATED with the same names, still shipped:', stillMissed.length,
  '-> the positive entity signal is NOT consulted by nameInternal');

// the TRUTHFUL twin the design deliberately protects — must stay preserved
const TRUTH = ['No ACME Holdings task was completed.', 'No Erdenet Copper Works unit was archived.',
  'No Gobi Cashmere Trading record was deleted.', 'No Khan Bank Services account was closed.'];
console.log('\nthe truthful determiner reading this design protects:');
for (const s of TRUTH) console.log('   ', (L.candDestroys(s) ? 'DESTROYED' : 'preserved'),
  '| v92=' + String(L.v92Arm3(s)).padEnd(17), JSON.stringify(s));
