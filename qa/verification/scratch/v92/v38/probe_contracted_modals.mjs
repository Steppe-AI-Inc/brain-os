// V31-F3b re-derivation: NEGATED_CLAUSE omits couldn't/wouldn't/shouldn't/won't.
// The only question that decides deployability: does that destroy a truthful answer
// DEPLOYED v92 PRESERVES?
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const base = buildBelt(readSrc(CAND_PATH));
const v92 = buildV92Gate(readSrc(V92_PATH));

const NAMES = ['ACME Corp', 'Beta Corp', 'Gobi Cashmere'];
const FRAMES = [
  (n) => `${n} couldn’t have been archived.`,
  (n) => `${n} couldn't have been archived.`,
  (n) => `${n} wouldn’t have been archived.`,
  (n) => `${n} shouldn’t have been archived.`,
  (n) => `${n} won’t have been archived.`,
  (n) => `${n} couldn’t be archived.`,
  (n) => `${n} wouldn’t be deleted.`,
  (n) => `${n} won’t be archived.`,
  (n) => `${n} couldn’t have been deleted, so it is still active.`,
  (n) => `I couldn’t archive ${n}.`,
  (n) => `We wouldn’t have deleted ${n}.`,
  (n) => `${n} shouldn’t have been renamed.`,
];
let reg = 0, shared = 0, total = 0;
const regs = [];
for (const n of NAMES) for (const f of FRAMES) {
  const s = f(n); total++;
  const v = v92(s) === true, c = base(s) === true;
  if (!v && c) { reg++; regs.push(s); }
  else if (v && c) shared++;
}
console.log(`contracted-modal truthful negatives tested: ${total}`);
console.log(`TRUTH REGRESSIONS vs v92 (v92 preserves, candidate destroys): ${reg}`);
for (const s of regs) console.log('   P1:', JSON.stringify(s));
console.log(`destroyed by BOTH (v92 has no negation awareness either): ${shared}`);
console.log('');
console.log('detail:');
for (const n of NAMES.slice(0, 1)) for (const f of FRAMES) {
  const s = f(n);
  console.log(`   v92=${v92(s) ? 1 : 0} cand=${base(s) ? 1 : 0}  ${JSON.stringify(s)}`);
}
