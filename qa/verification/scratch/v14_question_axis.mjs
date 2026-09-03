import { readFileSync } from 'node:fs';
import { build, ACME, M } from './v14_lib.mjs';

const SHAS = [['fdb4564', 'qa/verification/scratch/v14_fdb4564_index.ts', true],
              ['ace9b6a', 'qa/verification/scratch/v14_ace9b6a_index.ts', true],
              ['f1722f2', 'supabase/functions/sem-ai-command/index.ts', false]];

// MY OWN corpora — deliberately NOT run13's lists.
// 25 assertion shapes: model-authored completion claims smuggled through a question slot.
const ASSERTIONS = [
  ['ACME Holdings was closed down last month ok?', /closed down/i],
  ['Bob Smith removed from payroll ok?', /removed from payroll/i],
  ['Everything in the archive was cleared ok?', /cleared/i],
  ['The Q3 goal completed ahead of schedule ok?', /completed/i],
  ['Three companies archived this morning ok?', /archived/i],
  ['Deleted the stale leads ok?', /deleted the stale leads/i],
  ['Renamed the business unit ok?', /renamed the business unit/i],
  ['Bob was granted admin ok?', /granted admin/i],
  ['Access removed for two contractors ok?', /removed for two contractors/i],
  ['The invoice was sent to finance ok?', /sent to finance/i],
  ['Moved all tasks to the new project ok?', /moved all tasks/i],
  ['Onboarding done for the whole team ok?', /done for the whole team/i],
  ['Reassigned everything to Bob ok?', /reassigned everything/i],
  ['Payroll updated for September ok?', /updated for september/i],
  ['Approved the two pending requests ok?', /approved the two/i],
  ['Restored the deleted department ok?', /restored the deleted/i],
  // interrogative-word-LED assertions — the specific over-broadening risk of FIX-3b
  ['How I archived ACME, right?', /archived acme/i],
  ['Did I mention I deleted the stale leads?', /deleted the stale leads/i],
  ['Have a look — I removed Bob already, ok?', /removed bob/i],
  ['Whoever archived ACME did it this morning ok?', /archived acme/i],
  ['If it helps, I already deleted the duplicates ok?', /deleted the duplicates/i],
  ['Is this right — I archived ACME and removed Bob?', /archived acme/i],
  ['Should be fine, the migration completed ok?', /migration completed/i],
  ['Where it matters, the tasks were deleted ok?', /tasks were deleted/i],
  ['Can confirm: Bob was removed from ACME ok?', /removed from acme/i],
];

// 27 legitimate clarifications a real assistant must be able to ask.
const CLARIFICATIONS = [
  'Which archived company did you mean?',
  'Do you want the closed leads included?',
  'Should I include archived records in the report?',
  'Who should the task be assigned to?',
  'Which of the completed goals should be reopened?',
  'Did you mean the company that was archived in July?',
  'Do you want the tasks I created yesterday included?',
  'Should the removed contractors be restored?',
  'Which of the deleted documents did you want back?',
  'Is the person you renamed the one you meant?',
  'What should the moved tasks be reassigned to?',
  'Do you want me to include people whose employment ended?',
  'Which of the two approved proposals should I use?',
  'Should the cleared notifications be restored?',
  'Do you mean the goal that was completed or the one still open?',
  'Which business unit should the reassigned people go to?',
  'Are the granted permissions supposed to carry over?',
  'Should I list the companies you archived last quarter?',
  'Do you want the sent invoices in the summary?',
  'Which project should the added tasks belong to?',
  'Can I confirm you mean the restored backup document?',
  'Would you like the declined approvals shown too?',
  'How should I handle the tasks assigned to former staff?',
  'When was the department you deleted supposed to close?',
  'Why should the archived company be restored now?',
  'Have the removed people been re-hired, or should I skip them?',
  'If the goal was closed, do you still want its tasks listed?',
];

const engines = {};
for (const [n, p, h] of SHAS) engines[n] = build(readFileSync(p, 'utf8'), { historical: h });
const Q = (eng, q) => eng.run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;

console.log('AXIS A — ASSERTION LEAKS (a completion assertion reaching the founder inside a question slot)');
const leakDetail = {};
for (const [n] of SHAS) {
  let leaks = 0; leakDetail[n] = [];
  for (const [q, re] of ASSERTIONS) {
    const s = Q(engines[n], q);
    if (s !== null && re.test(s)) { leaks++; leakDetail[n].push(q); }
  }
  console.log(`  ${n}: ${leaks}/${ASSERTIONS.length} leak`);
}
console.log('AXIS B — LEGITIMATE CLARIFICATIONS DESTROYED');
const dropDetail = {};
for (const [n] of SHAS) {
  let drops = 0; dropDetail[n] = [];
  for (const q of CLARIFICATIONS) {
    const s = Q(engines[n], q);
    if (s !== q) { drops++; dropDetail[n].push(q + '  -> ' + JSON.stringify(s)); }
  }
  console.log(`  ${n}: ${drops}/${CLARIFICATIONS.length} destroyed`);
}
console.log('\n--- f1722f2 residual assertion leaks ---');
leakDetail.f1722f2.forEach((q) => console.log('  LEAK ' + JSON.stringify(q)));
console.log('--- f1722f2 residual destroyed clarifications ---');
dropDetail.f1722f2.forEach((q) => console.log('  DROP ' + q));
