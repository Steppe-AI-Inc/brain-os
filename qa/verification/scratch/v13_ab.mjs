// verifier #13 A/B: run the D92 corpora against whichever index.ts SEM_INDEX_SRC names.
import * as P from './v13_probe.mjs';
const ASSERT = [
  'ACME archived everything ok?', 'ACME deleted everything B. ok?', 'ACME Holdings deleted all the tasks ok?',
  'The company deleted the tasks ok?', 'Bob removed 3 people from ACME ok?', 'The migration completed ok?',
  'Everything archived ok?', 'Archived everything B. ok?', 'Deleted all the tasks ok?', 'Removed the whole team ok?',
  'ACME now archived ok?', 'All tasks now deleted ok?', 'The team archived ACME ok?', 'My assistant deleted the project ok?',
  'I successfully archived ACME ok?', 'I have archived ACME ok?', 'We finally deleted the project ok?',
  'I quietly removed the person ok?', 'I archived ACME B. ok?', 'I archived ACME ok?',
];
const LEGIT = [
  'Which archived company did you mean?', 'Do you want me to restore the archived one?',
  'Which of the completed tasks should I reopen?', 'Do you mean the person whose employment ended?',
  'Should the removed member be re-invited?', 'Which goal should this task be assigned to?',
  'Is this the approved budget?', 'Do you want the closed leads included?',
  'Should I include archived records in the report?', 'Who should the task be assigned to?',
  'Do you want the deleted document recovered?', 'Shall I confirm the rejected approval?',
  'Which of the tasks we completed should be reopened?', 'Do you want the ones I removed restored?',
  'Have we archived ACME already, or should I do it now?', 'Did you mean the company I archived last week?',
  'Should I reopen the goal we closed in July?', 'Is the invoice I sent the one you meant?',
  'Which of the people I assigned should be moved?', 'Do you want the report we created yesterday?',
  'If we archive it, does the team lose access?', 'When the company is archived, do its tasks stay visible?',
  'Since the task was assigned to Bob, should I reassign it?', 'Given the goal is closed, do you still want the report?',
  'If I archive ACME, will the tasks be deleted too?', 'Which one - the archived company or the active one?',
  'Which company did you mean and should I archive it?',
];
const leaks = ASSERT.filter((q) => (P.Qarr(q)[0] ?? null) !== null);
const dropped = LEGIT.filter((q) => (P.Qarr(q)[0] ?? null) === null);
const truncated = LEGIT.filter((q) => { const k = P.Qarr(q)[0] ?? null; return k !== null && k !== q; });
console.log(JSON.stringify({
  src: process.env.SEM_INDEX_SRC || 'HEAD',
  assertion_leaks: leaks.length + '/' + ASSERT.length, leaks,
  legit_dropped: dropped.length + '/' + LEGIT.length, dropped,
  legit_truncated: truncated.length + '/' + LEGIT.length, truncated,
}, null, 1));
