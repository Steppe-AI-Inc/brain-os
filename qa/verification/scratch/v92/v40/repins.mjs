// Independent re-derivation of the four re-pinned residuals + their paired real names,
// measured on VERIFIER #40's own harness (not the suites' extractor).
import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());

const PAIRS = [
  ['run18 D131 dash member (run32/D180 closed)', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
  ['run18 D131 name-initial (run30/D170 closed)', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['run18 D131 idiom member A', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['run18 D131 idiom member B', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['run28 D116 negator-initial name', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
  ['run18 D131 disclosedResidual 1', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
  ['run18 D131 disclosedResidual 2', 'No Limits Inc was deleted.', 'No company named No Limits Inc was deleted.'],
  ['run18 D131 disclosedResidual 3', 'Never Say Never LLC has been archived.', 'I found no record that Never Say Never LLC has been archived.'],
  ['run18 D131 disclosedResidual 4', 'None The Wiser Ltd was archived.', 'Nothing was archived for None The Wiser Ltd.'],
  ['run19 D131 separable 1', 'No record and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
];

let bad = 0;
for (const [label, fab, real] of PAIRS) {
  const cf = cand.readsAsCompletion(fab);
  const cr = cand.readsAsCompletion(real);
  const vf = v92.readsAsCompletion(fab);
  const vr = v92.readsAsCompletion(real);
  const okFab = cf === true;
  const okReal = cr === false;
  if (!okFab || !okReal) bad++;
  console.log((okFab && okReal ? 'ok   ' : 'RED  ') + label.padEnd(44)
    + ' fab:cand=' + (cf ? 'caught ' : 'SHIPPED') + '/v92=' + (vf ? 'caught ' : 'shipped')
    + '  real:cand=' + (cr ? 'DESTROYED' : 'survives ') + '/v92=' + (vr ? 'destroyed' : 'survives'));
  if (!okFab || !okReal) console.log('       fab=' + JSON.stringify(fab) + '\n       real=' + JSON.stringify(real));
}
console.log('\nre-pins honest: ' + (PAIRS.length - bad) + '/' + PAIRS.length);
