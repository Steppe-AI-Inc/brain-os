// STEP 2 Q1 — deploy surface, semantic delta, identifier delta. Re-derived, not restated.
import * as L from './lab.mjs';

const decls = (s) => {
  const o = new Map();
  const push = (n, k) => { if (!o.has(n)) o.set(n, k); };
  for (const m of s.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) push(m[1], 'binding');
  for (const m of s.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) push(m[1], 'function');
  for (const m of s.matchAll(/\btype\s+([A-Za-z_$][\w$]*)\s*=/g)) push(m[1], 'type');
  return o;
};
const a = decls(L.V92_LF), b = decls(L.SRC_LF);
const added = [...b.keys()].filter((x) => !a.has(x));
const removed = [...a.keys()].filter((x) => !b.has(x));
console.log('v92 declared identifiers      :', a.size);
console.log('candidate declared identifiers:', b.size);
console.log('ADDED  :', added.length);
console.log('REMOVED:', removed.length, removed.length ? JSON.stringify(removed) : '(none)');
console.log('\nadded identifiers:');
for (const n of added) console.log('   ', b.get(n).padEnd(9), n);

// TOP-LEVEL (column 0) declarations only — the thing verifier #37 pinned.
const top = (s) => new Set([...s.matchAll(/^(?:const|let|var|function|type)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
const ta = top(L.V92_LF), tb = top(L.SRC_LF);
console.log('\nTOP-LEVEL declarations  v92:', ta.size, ' candidate:', tb.size);
console.log('  top-level added  :', [...tb].filter((x) => !ta.has(x)).join(', ') || '(none)');
console.log('  top-level removed:', [...ta].filter((x) => !tb.has(x)).join(', ') || '(none)');

// Q3 — does the candidate reintroduce anything previously REMOVED from production?
const reintro = [
  ['D3 `&& !result.pendingAction` short-circuit on the past-completion gate',
    /claimsPastCompletion[^;]{0,400}?&&\s*!result\.pendingAction/s],
  ['#66/D40 drift check gated on `!rawClaims`', /!rawClaims\s*&&/],
  ['inline regex modifier groups (unsupported in Deno)', /\(\?[a-zA-Z]+[:)-]/],
];
console.log('\nQ3 reintroduction probes:');
for (const [what, re] of reintro) {
  let hit = re.test(L.SRC_LF);
  if (what.startsWith('inline')) {
    hit = (L.SRC_LF.match(/\(\?[a-zA-Z]+[:)-]/g) || []).filter((x) => !/^\(\?:/.test(x)).length > 0;
  }
  console.log('   ', hit ? 'PRESENT  <-- REINTRODUCED' : 'absent  ', what);
}
