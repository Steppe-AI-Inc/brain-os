// Is v92's third (lifecycle) prose arm carried into the candidate UNCHANGED, in body and in
// gating? If yes, arm 3 can never produce a fabrication regression and the correction's
// one-directionality holds. If no, that is a P0.
import * as L from './lab.mjs';

function fnBody(txt, name) {
  const a = txt.indexOf('function ' + name);
  let depth = 0, end = -1;
  for (let k = txt.indexOf('{', a); k < txt.length; k++) {
    if (txt[k] === '{') depth++; else if (txt[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  return txt.slice(a, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\s+/g, ' ').trim();
}
const a = fnBody(L.V92_LF, 'claimsLifecycleClaim');
const b = fnBody(L.SRC_LF, 'claimsLifecycleClaim');
console.log('claimsLifecycleClaim body identical v92 vs candidate:', a === b);
if (a !== b) { console.log('V92 :', a); console.log('CAND:', b); }

for (const v of ['claimsCompanyDeleted', 'claimsTaskDeleted', 'claimsGoalDeleted', 'claimsPersonDeleted']) {
  const one = (t) => {
    const i = t.indexOf('const ' + v + ' =');
    if (i < 0) return null;
    const j = t.indexOf(';', i);
    return t.slice(i, j + 1).split('\n').filter((l) => !/^\s*\/\//.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  };
  const x = one(L.V92_LF), y = one(L.SRC_LF);
  console.log(v, 'identical:', x === y);
  if (x !== y) { console.log('  V92 :', x); console.log('  CAND:', y); }
}
// and the overwrite site
const site = (t) => {
  const i = t.indexOf('lifecycleMismatchCorrections.length > 0) {');
  return t.slice(i, i + 200).split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ');
};
console.log('\nv92 overwrite site :', site(L.V92_LF));
console.log('cand overwrite site:', site(L.SRC_LF));

// exhaustive: on a generated lifecycle-arm space, can the candidate ever preserve what arm 3 kills?
const V = ['deleted', 'deleting', 'archived', 'archiving', 'removed', 'removing', 'restored', 'restoring', 'ended', 'ending'];
const N = ['company', 'task', 'goal', 'employee', 'person', 'staff'];
const FRAMES = [(v, n) => `I ${v} the ${n}.`, (v, n) => `The ${n} was ${v}.`, (v, n) => `${v} the ${n} now.`,
  (v, n) => `Erdenet Copper Works ${n} ${v}.`, (v, n) => `${n.replace(/^./, (c) => c.toUpperCase())} ${v} successfully.`,
  (v, n) => `Nothing: the ${n} was not ${v}.`, (v, n) => `No ${n} was ${v}.`];
let bad = 0, tot = 0;
for (const v of V) for (const n of N) for (const f of FRAMES) {
  const s = f(v, n); tot++;
  if (L.v92LifecycleArm(s) && !L.candDestroys(s)) { bad++; if (bad <= 20) console.log('  ARM3-ONLY-MISS', JSON.stringify(s)); }
}
console.log('\ngenerated lifecycle space:', tot, 'rows; v92-arm3-kills-but-candidate-preserves:', bad);
