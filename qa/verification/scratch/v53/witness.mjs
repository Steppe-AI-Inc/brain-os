// VERIFIER #53 — witnesses for the two fixes my corpus did not exercise (ppInternal, R-AUXGAP joiner). A fix is covered
// only if its revert flips a row here.
import * as H from './harness.mjs';
const NM = ['Khan Bank', 'Batbold Sukhbaatar'];
const W = {
  ppInternal: [['F', 'The company with no active tasks was archived.'], ['F', 'The record with no owner was deleted.'], ['F', 'Khan Bank, despite no prior notice, was archived.'], ['F', 'The task with nothing attached was completed.'], ['T', 'The company with no active tasks was not archived.'], ['T', 'Khan Bank, despite no prior notice, was never archived.']],
  auxgap: [['F', 'Khan Bank was, with no errors, archived.'], ['F', 'Khan Bank was — with no issues — archived.'], ['F', 'Batbold Sukhbaatar was, with no objections, removed.'], ['T', 'Khan Bank was, with no errors, not archived.'], ['T', 'Khan Bank wasn’t, with no errors, archived.'], ['T', 'Khan Bank couldn’t, with no errors, have been archived.']],
};
const MUT = { ppInternal: 'revert_ppInternal', auxgap: 'revert_auxgap_joiner' };
for (const [fix, rows] of Object.entries(W)) {
  const mut = `qa/verification/scratch/v53/mut/${MUT[fix]}.ts`; let flipped = 0;
  console.log(`\n## ${fix}  (mutant ${MUT[fix]})`);
  for (const [dir, s] of rows) {
    const c = H.candArm(s, { names: NM }), m = H.candArm(s, { names: NM, src: mut }), v = H.v92Arm(s);
    const ok = dir === 'F' ? c !== null : c === null; if ((c === null) !== (m === null)) flipped++;
    console.log(`  ${ok ? 'OK ' : 'BAD'} ${dir} cand=${String(c).padEnd(14)} mutant=${String(m).padEnd(14)} v92=${String(v).padEnd(15)} ${s}`);
  }
  console.log(`  -> rows flipped by reverting: ${flipped}/${rows.length}  ${flipped ? 'LOAD-BEARING' : 'NOT COVERED'}`);
}
