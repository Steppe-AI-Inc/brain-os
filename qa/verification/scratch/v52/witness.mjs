// VERIFIER #52 — witness shapes for the two older fixes my corpus did not exercise (ppInternal, R-AUXGAP joiner),
// plus the four #51 closures' single-row witnesses. A fix is covered only if its revert flips a row here.
import * as H from './harness.mjs';
const NM = ['Khan Bank', 'Bold Munkhbat'];
const W = {
  ppInternal: [['F', 'The company with no active tasks was archived.'], ['F', 'The record with no owner was deleted.'], ['F', 'Khan Bank, despite no prior notice, was archived.'], ['F', 'The task with nothing attached was completed.'], ['T', 'The company with no active tasks was not archived.'], ['T', 'Khan Bank, despite no prior notice, was never archived.']],
  auxgap: [['F', 'Khan Bank was, with no errors, archived.'], ['F', 'Khan Bank was — with no issues — archived.'], ['F', 'Bold Munkhbat was, with no objections, removed.'], ['F', 'Khan Bank has been, with no further action needed, archived.'], ['T', 'Khan Bank was, with no errors, not archived.'], ['T', 'Khan Bank wasn’t, with no errors, archived.']],
  D1: [['T', 'Let me archive Khan Bank — shall I go ahead?'], ['F', 'I archived Khan Bank. Anything else?']],
  D3: [['F', 'I will restore Khan Bank if you approve so I just archived Bold Munkhbat.'], ['T', 'If I archived Khan Bank, its records would be hidden — I haven’t.']],
  D2: [['F', H.pad(4000 - 70) + 'renamed: "Ulaanbaatar Rail Depot and Logistics Services Northern Division" -> "URD North" ' + H.pad(140)]],
  D4: [['T', 'Confirmed — I archived nothing; Khan Bank is unchanged.'], ['F', 'Confirmed — I archived Khan Bank.']],
};
const MUT = { ppInternal: 'revert_ppInternal', auxgap: 'revert_auxgap_joiner', D1: 'revert_D1_question_guard', D3: 'revert_D3_linkers', D2: 'revert_D2_arrow_past_cap', D4: 'revert_D4_object_negator' };
for (const [fix, rows] of Object.entries(W)) {
  const mut = `qa/verification/scratch/v52/mut/${MUT[fix]}.ts`;
  let flipped = 0;
  console.log(`\n## ${fix}  (mutant ${MUT[fix]})`);
  for (const [dir, s] of rows) {
    const c = H.candArm(s, { names: NM }), m = H.candArm(s, { names: NM, src: mut }), v = H.v92Arm(s);
    const ok = dir === 'F' ? c !== null : c === null;
    if ((c === null) !== (m === null)) flipped++;
    console.log(`  ${ok ? 'OK ' : 'BAD'} ${dir} cand=${String(c).padEnd(14)} mutant=${String(m).padEnd(14)} v92=${String(v).padEnd(15)} ${s.length > 120 ? s.slice(0, 40) + '…' + s.slice(-60) : s}`);
  }
  console.log(`  -> rows flipped by reverting: ${flipped}/${rows.length}  ${flipped ? 'LOAD-BEARING' : 'NOT COVERED BY THESE WITNESSES'}`);
}
