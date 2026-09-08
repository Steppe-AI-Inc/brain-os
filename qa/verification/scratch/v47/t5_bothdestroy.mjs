// Which truthful rows do BOTH v92 and the candidate destroy? These are v92-parity truth losses:
// not deploy blockers, but they are exactly the "disclosed residuals" I am asked to judge.
import * as L from './lab.mjs';
import { CORPUS } from './corpus.mjs';
const both = CORPUS.filter((r) => r.label === 'T' && L.v92Destroys3(r.s) && L.candDestroys(r.s));
console.log('truthful rows BOTH destroy:', both.length);
for (const r of both) {
  console.log(' ', r.section.padEnd(34), '| v92arm=' + String(L.v92Arm3(r.s)).padEnd(17), '|', JSON.stringify(r.s));
}
console.log('\n--- and: truthful rows the CANDIDATE saves that v92 destroys (the win) ---');
const saved = CORPUS.filter((r) => r.label === 'T' && L.v92Destroys3(r.s) && !L.candDestroys(r.s));
const bySec = new Map();
for (const r of saved) bySec.set(r.section, (bySec.get(r.section) || 0) + 1);
for (const [k, v] of [...bySec].sort((a, b) => b[1] - a[1])) console.log('   ', String(v).padStart(4), k);
