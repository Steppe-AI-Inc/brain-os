import { gate } from './harness.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
const NEG = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC'];
const PLAIN = ['ACME Corp', 'Khan Bank', 'Trade and Development Bank', 'Bob Smith'];
const NAMES = [...NEG, ...PLAIN];
const G = gate(NAMES);
const V = ['archived', 'deleted', 'removed', 'restored', 'renamed'];
const FORMS = {
  A: (n, v) => `${n} was, as requested, ${v}.`,
  B: (n, v) => `${n} has, at your instruction, been ${v}.`,
  C: (n, v) => `${n} was — finally — ${v}.`,
};
const v92D = (s) => LIFECYCLE_CLAIM(s) || FUTURE_PROMISE_PATTERN.test(s) || PAST_COMPLETION_CLAIM_PATTERN.test(s);
const beltOnlyV92 = (s) => PAST_COMPLETION_CLAIM_PATTERN.test(s) || FUTURE_PROMISE_PATTERN.test(s);
for (const [k, f] of Object.entries(FORMS)) {
  let ship = 0, frFull = 0, frBelt = 0, n = 0;
  const ex = [];
  for (const nm of NAMES) for (const v of V) {
    const s = f(nm, v); n++;
    const c = G.readsAsCompletion(s) || LIFECYCLE_CLAIM(s);
    if (!c) { ship++; if (v92D(s)) { frFull++; if (ex.length < 3) ex.push(s); } if (beltOnlyV92(s)) frBelt++; }
  }
  console.log(`form ${k}: n=${n} candidate-ships=${ship}  of those v92 CORRECTS (full 3-arm)=${frFull}  (belt-comparable arms only)=${frBelt}`);
  if (ex.length) console.log('   FABRICATION REGRESSION examples:', ex.map((x) => JSON.stringify(x)).join(' | '));
}
