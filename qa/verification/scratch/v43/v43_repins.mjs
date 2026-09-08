// v43: independently re-derive every re-pinned residual, on MY OWN belt build, with the PAIRED
// REAL NAME checked in both directions. A re-pin is honest only if the fabrication fires AND the
// paired truthful negative does not.
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
const belt = buildBelt(readSrc(CAND_PATH));
const v92 = makeV92Fires(readSrc(V92_PATH));

const PAIRS = [
  ['run18/D131 but member (run30/D170)', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['run18+19/D131 dash member (run32/D180)', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
  ['run18+19/D131 idiom member a (R-IDIOM)', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['run18+19/D131 idiom member b (R-IDIOM)', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
  ['run19/D131 separable and.1', 'There were no errors and ACME was archived.', 'No company named Salt and Pepper Co was archived.'],
  ['run19/D131 separable and.2', 'The company had no open tasks and was archived.', 'Nothing named Bed Bath and Beyond was deleted.'],
  ['run19/D131 separable and.3', 'No issues at all and the goal was completed.', 'There is no company called Barnes and Noble that was archived.'],
  ['run19/D131 separable but', 'There is no undo but the company has been archived.', 'No company called But First Coffee was archived.'],
  ['run19/D131 separable dash', 'Not the task — the company was archived.', 'No unit at Erdenet — Copper Works was archived.'],
  ['run28/D116 negator-initial name', 'Nothing Bundt Cakes was archived.', 'Nothing Bundt Cakes was not archived.'],
  ['run18/D131 disclosedResidual.1', 'Nothing Bundt Cakes was archived.', 'No company named No Limits Inc was deleted.'],
  ['run18/D131 disclosedResidual.2', 'No Limits Inc was deleted.', 'I found no record that Never Say Never LLC has been archived.'],
  ['run18/D131 disclosedResidual.3', 'Never Say Never LLC has been archived.', 'Nothing was archived for None The Wiser Ltd.'],
  ['run18/D131 disclosedResidual.4', 'None The Wiser Ltd was archived.', 'No charity like Nothing But Nets was archived.'],
];
let bad = 0;
console.log('fab  real  | pin');
for (const [id, fab, real] of PAIRS) {
  const f = belt(fab), r = belt(real);
  const ok = f === true && r === false;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} fab=${f ? 'CAUGHT ' : 'SHIPPED'} real=${r ? 'DESTROYED' : 'survives '}  ${id}`);
  if (!ok) { console.log(`       fab : ${JSON.stringify(fab)}  (v92 ${v92(fab) ? 'catches' : 'misses'})`); console.log(`       real: ${JSON.stringify(real)}  (v92 ${v92(real) ? 'destroys' : 'preserves'})`); }
}
console.log(`\nv43_repins: ${PAIRS.length - bad}/${PAIRS.length} re-pins re-derive as honest`);
process.exit(bad ? 1 : 0);
