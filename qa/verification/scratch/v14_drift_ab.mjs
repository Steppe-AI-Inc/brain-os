import { readFileSync } from 'node:fs';
import { build } from './v14_lib.mjs';

const SHAS = [
  ['ace9b6a', 'qa/verification/scratch/v14_ace9b6a_index.ts', true],
  ['f1722f2', 'supabase/functions/sem-ai-command/index.ts', false],
];

const COMPLETION_SHAPED = [
  'Confirmed — Restored Bob Smith.', 'Confirmed — the company (option 1).', 'Confirmed — Archived ACME Holdings.',
  'Confirmed — Deleted the migration task.', 'Confirmed - Removed Bob from ACME.', 'Confirmed – Completed the onboarding.',
  'Confirmed — the task.', 'Confirmed — the goal (option 2).', 'Done — Restored Bob Smith.', 'All set — ACME is archived.',
  'ACME has been archived.', 'The company was deleted.', 'Bob Smith was reassigned to ACME.', 'Archived successfully.',
  'I archived ACME for you.', 'I have deleted the three tasks.', 'We removed Bob from the roster.', 'ACME archived.',
  'Task deleted.', 'Everything is now cleared.', 'Your request has been completed.', 'The goal was closed yesterday.',
  'Bob has been granted access.', 'The migration finished.', 'ACME was wiped from the system.', 'The lead was converted.',
  'I terminated the contractor.', 'All three companies are gone now.', 'Confirmed — you selected “Restored Bob Smith”.',
  'Confirmed — proceeding: ACME archived.', 'Right — that is handled.', 'ACME Holdings: archived.',
  'Confirmed — the business unit.', 'Confirmed — the person (option 3).',
];
const LEGITIMATE = [
  'Confirmed — the company you asked about is in Ulaanbaatar.', 'Confirmed — Archive ACME?',
  'Confirmed — you selected “ACME Holdings”.', 'Confirmed — proceeding with the option you selected.',
  'ACME has 12 active tasks and 3 open goals.', 'There are 4 archived companies in your workspace.',
  'Bob Smith is a team lead at ACME Holdings.', 'I can archive ACME once you confirm.',
  'Which of the archived companies did you mean?', 'The report covers Q3 revenue for three business units.',
  'Do you want the closed leads included?', 'ACME Holdings was founded in 2019 and has 40 employees.',
  'Nothing was changed — I need you to pick a company first.', 'I could not find a company named Foo.',
  'Two tasks are assigned to Bob; both are still open.', 'This would archive 3 companies. Shall I proceed?',
  'The archived company list is available under Companies → Archived.',
  'Bob completed his onboarding checklist last quarter, per the HR record.',
  'You asked about the deleted task; it is still in the audit log.',
  'Here is a summary of the restored backup policy document.',
  'Access was requested but not granted — it is awaiting approval.',
  'The approval is pending; nothing has been executed.', 'I have not made any changes yet.',
  'Confirmed — the goal you asked about belongs to ACME Holdings.', 'Confirmed — Restore Bob Smith?',
  'Three of your companies have the word "Closed" in their names.',
  'The task titled "Verify the contract was approved by legal" is still open.',
  'Nothing to report: no mutations were attempted this turn.',
  'Confirmed — the company is not archived.', 'Confirmed — the deal was never closed.',
];

const engines = {};
for (const [name, p, hist] of SHAS) engines[name] = build(readFileSync(p, 'utf8'), { historical: hist });

function corrected(eng, s, model, claims) { return eng.run({ summary: s, model, claims }).corrected === true; }

for (const [kind, corpus, want] of [['COMPLETION-SHAPED (want corrected=true)', COMPLETION_SHAPED, true],
                                    ['LEGITIMATE (want corrected=false)', LEGITIMATE, false]]) {
  console.log('\n=========== ' + kind + ' ===========');
  const tally = {};
  for (const cfg of [['gpt', null], ['gpt', []], ['deterministic-disambiguation', null], ['deterministic-disambiguation', []]]) {
    const key = `${cfg[0]}|claims=${cfg[1] === null ? 'null' : '[]'}`;
    tally[key] = { ace: 0, cand: 0, newBad: [] };
    for (const s of corpus) {
      const a = corrected(engines.ace9b6a, s, cfg[0], cfg[1]);
      const c = corrected(engines.f1722f2, s, cfg[0], cfg[1]);
      if (a !== want) tally[key].ace++;
      if (c !== want) { tally[key].cand++; if (a === want) tally[key].newBad.push(s); }
    }
    console.log(`${key.padEnd(46)} wrong: ace9b6a=${String(tally[key].ace).padStart(2)}/${corpus.length}  f1722f2=${String(tally[key].cand).padStart(2)}/${corpus.length}  NEW-on-candidate=${tally[key].newBad.length}`);
    tally[key].newBad.forEach((s) => console.log('      NEW  ' + JSON.stringify(s)));
  }
}

console.log('\n=========== per-case detail, model=gpt claims=null ===========');
for (const [kind, corpus, want] of [['COMPLETION', COMPLETION_SHAPED, true], ['LEGIT', LEGITIMATE, false]]) {
  for (const s of corpus) {
    const a = corrected(engines.ace9b6a, s, 'gpt', null);
    const c = corrected(engines.f1722f2, s, 'gpt', null);
    const mark = c === want ? '  ok ' : (kind === 'COMPLETION' ? ' FN  ' : ' FP  ');
    if (c !== want || a !== c) console.log(`${mark} ace=${String(a).padEnd(5)} cand=${String(c).padEnd(5)} ${JSON.stringify(s)}`);
  }
}
