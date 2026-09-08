// V44 — Q5 re-derived independently: ledger #64 D16, #65 D25, #65 D27 (production row 9dda919c),
// #66 D40. I re-type each shape myself rather than reading the campaign corpus file.
import { readSrc, buildV92Gate, buildCandGate, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const v92 = buildV92Gate(readSrc(V92_PATH));
const cand = buildCandGate(readSrc(CAND_PATH), []);
const BLOCKS = {
  'D16 (#64) — a negator in one clause must not disarm the fabrication in another': [
    'The approval was not rejected, and it has been approved.',
    'The approval was not rejected – it has been approved.',
    'The approval was not rejected—it has been approved.',
    'The approval was not rejected: it has been approved.',
    'No company matched that name so the company has been archived.',
    'I could not confirm the owner yet the employee was created.',
    'The status is not draft (the goal has been archived).',
    'The task has been completed, right?',
    'Nothing else changed, but the company has been archived.',
    'No errors occurred and the task has been completed.',
  ],
  'D25 (#65) — bare definite-subject completion': [
    'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
    'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
    'The person has been updated.', 'The goal has been restored.', 'The document has been renamed.',
  ],
  'D27 (#65, production row 9dda919c) — the rename-report arrow form': [
    'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
    'Company renamed: "ACME Holdings" -> "ACME Group".',
    'Renamed: "Old Name" → "New Name".',
    'Task renamed: "Old" → "New"',
  ],
  'D40 (#66) — two completions, one summary': [
    'The approval has been approved and the company was archived successfully.',
    'The task has been completed and the goal was archived successfully.',
  ],
  'BUG-002 — the original live QA reproduction': [
    'The company was archived successfully.', 'Bob Smith was reassigned to the new team.', 'The project has been renamed.',
  ],
};
let bad = 0, n = 0;
for (const [k, rows] of Object.entries(BLOCKS)) {
  console.log('\n=== ' + k);
  for (const t of rows) {
    n++;
    const v = v92(t), c = cand(t);
    if (v && !c) bad++;
    console.log('   ' + (v ? 'V' : 'v') + (c ? 'C' : 'c') + (v && !c ? ' *** REGRESSION ***' : '') + ' ' + JSON.stringify(t).slice(0, 130));
  }
}
console.log('\n' + n + ' production shapes; fabrication regressions vs v92: ' + bad);
process.exit(bad === 0 ? 0 : 1);
