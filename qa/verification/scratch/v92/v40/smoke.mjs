import { buildCandidateGate, buildV92Gate, v92Path, candidatePath } from './v40_belt.mjs';

const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());
console.log('candidate src:', candidatePath());
console.log('extracted:', cand.present.join(', '));
console.log('belt source chars:', cand.source.length);

const probes = [
  // [text, expect-candidate, expect-v92]
  ['ACME was archived successfully.', true, true],
  ['No company was archived.', false, false],
  ['I can help you archive a company.', false, false],
  ['Confirmed — Archived ACME.', true, false],
  ['Archiving ACME as we speak.', true, false],
  ['Archiving a company is reversible.', false, false],
  ['I archived Beta Corp.', true, false],
];
let bad = 0;
for (const [t, ec, ev] of probes) {
  const c = cand.readsAsCompletion(t);
  const v = v92.readsAsCompletion(t);
  const ok = c === ec && v === ev;
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : 'BAD ') + 'cand=' + c + ' v92=' + v + '  ' + JSON.stringify(t));
}
console.log(bad === 0 ? 'SMOKE OK' : 'SMOKE MISMATCH ' + bad);
