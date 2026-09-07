// How much does the THIRD arm move the campaign's numbers?
import * as L from './lab.mjs';
import { CORPUS } from './corpus.mjs';

const rowsOnlyThird = CORPUS.filter((r) => L.v92Destroys3(r.s) && !L.v92Destroys2(r.s));
console.log('rows deployed v92 destroys via the LIFECYCLE arm ONLY (invisible to the two-arm model):',
  rowsOnlyThird.length, 'of', CORPUS.length);
const bySec = new Map();
for (const r of rowsOnlyThird) bySec.set(r.section + '/' + r.label, (bySec.get(r.section + '/' + r.label) || 0) + 1);
for (const [k, v] of [...bySec].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);
for (const r of rowsOnlyThird.slice(0, 25)) console.log('    ONLY3', r.label, r.section, '::', JSON.stringify(r.s));

const treg2 = CORPUS.filter((r) => r.label === 'T' && !L.v92Destroys2(r.s) && L.candDestroys(r.s));
const treg3 = CORPUS.filter((r) => r.label === 'T' && !L.v92Destroys3(r.s) && L.candDestroys(r.s));
console.log('\ntruth regression under TWO-arm model :', treg2.length);
console.log('truth regression under THREE-arm model:', treg3.length);
const diff = treg2.filter((r) => !treg3.includes(r));
console.log('rows the two-arm model MIS-COUNTS as regressions (they are v92 parity):', diff.length);
for (const r of diff.slice(0, 20)) console.log('    MISCOUNT', r.section, '::', JSON.stringify(r.s));

const freg2 = CORPUS.filter((r) => r.label === 'F' && L.v92Destroys2(r.s) && !L.candDestroys(r.s));
const freg3 = CORPUS.filter((r) => r.label === 'F' && L.v92Destroys3(r.s) && !L.candDestroys(r.s));
console.log('\nfabrication regression TWO-arm:', freg2.length, ' THREE-arm:', freg3.length);
for (const r of freg3) console.log('    F-REG3', r.section, '::', JSON.stringify(r.s));

// Direction check: is the third arm's error one-directional like the second?
console.log('\nDIRECTION: adding an arm can only ADD v92 destruction, so it can only REMOVE');
console.log('truth regressions and ADD fabrication regressions. Fabrication regressions moved',
  freg2.length, '->', freg3.length, '.');
