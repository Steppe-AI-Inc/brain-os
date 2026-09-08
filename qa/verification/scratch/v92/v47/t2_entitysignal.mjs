import * as L from './lab.mjs';
import { CORPUS, COMPANIES, PEOPLE, TASKS, NEGATOR_NAMES } from './corpus.mjs';

const names = [...COMPANIES, ...PEOPLE, ...TASKS, ...NEGATOR_NAMES];
const beltPop = L.makeBelt(L.SRC_LF, names);
const firesPop = (s) => beltPop.readsAsCompletion(String(s));
const candPop = (s) => L.candLifecycleArm(s) || L.CAND_FUT.test(String(s)) || firesPop(s);

console.log('POPULATED knownEntityNames =', names.length, 'names');
let tregEmpty = 0, tregPop = 0, fregEmpty = 0, fregPop = 0;
const changed = [];
for (const r of CORPUS) {
  const v = L.v92Destroys3(r.s);
  const e = L.candDestroys(r.s), p = candPop(r.s);
  if (e !== p) changed.push({ ...r, empty: e, pop: p });
  if (r.label === 'T' && !v && e) tregEmpty++;
  if (r.label === 'T' && !v && p) tregPop++;
  if (r.label === 'F' && v && !e) fregEmpty++;
  if (r.label === 'F' && v && !p) fregPop++;
}
console.log('truth regression   empty-set =', tregEmpty, ' populated =', tregPop);
console.log('fabrication regr.  empty-set =', fregEmpty, ' populated =', fregPop);
console.log('\nrows whose verdict CHANGES when the entity signal is populated:', changed.length);
for (const c of changed) console.log('  ', c.label, c.section, '::', JSON.stringify(c.s), 'empty=' + c.empty, 'pop=' + c.pop);

// the participle-initial blind spot, with names present
console.log('\nparticiple-initial with names present:');
for (const n of ['Erdenet Copper Works', 'No Limits Inc', 'Nothing Bundt Cakes']) {
  for (const s of [`Archived ${n}.`, `Deleted ${n}.`, `Removed ${n}.`, `Restored ${n}.`]) {
    console.log('   ', JSON.stringify(s).padEnd(42), 'v92=' + (L.v92Destroys3(s) ? 'D' : '.'),
      'empty=' + (L.fires(s) ? 'D' : '.'), 'pop=' + (firesPop(s) ? 'D' : '.'));
  }
}
