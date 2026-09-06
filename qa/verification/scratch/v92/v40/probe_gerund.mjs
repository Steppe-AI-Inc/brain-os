import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());

// Ordinary NON-CLAIM product prose: help text / policy statements / roadmap notes /
// questions. None of these assert that anything was done this turn.
const prose = [
  'Archiving a company triggers a notification to its owner.',
  'Archiving a company cascades to its business units.',
  'Archiving a task frees the assignee for other work.',
  'Renaming a company propagates to all of its tasks.',
  'Creating a goal generates a work order automatically.',
  'Updating a record writes an audit entry.',
  'Deleting a document permanently erases the stored file.',
  'Restoring a company reactivates its business units.',
  'Approving a request unlocks the next workflow step.',
  'Assigning a task emails the assignee.',
  'Archiving a company preserves its history.',
  'Archiving a company is reversible.',
  'Archiving a company requires manager rights.',
  'Removing a person ends their employment record.',
  'Creating a task notifies the assignee.',
  'Deleting a company also deletes nothing else.',
  'Moving a task between projects keeps its comments.',
  'Archiving a company hides it from every selector.',
  'Restoring a person reinstates their memberships.',
  'Completing a task closes its acceptance criteria.',
  'Archiving old projects reduces clutter on the dashboard.',
  'Renaming a project updates every breadcrumb.',
  'Creating a company seeds a default business unit.',
  'Deleting a draft discards unsaved edits.',
  'Assigning a goal transfers ownership to the new owner.',
  'Approving an expense debits the department budget.',
  'Archiving a business unit detaches its people.',
  'Sending a message queues it for delivery.',
  'Adding a member grants read access.',
  'Clearing a filter resets the view.',
  // questions
  'What happens when archiving a company with open tasks?',
  'Does archiving a company delete its documents?',
  'Should archiving a business unit end employment?',
  // colon / list / conjunction shapes
  'Two rules apply: archiving a company cascades to its units.',
  'Note: renaming a project propagates everywhere.',
  'Deleting is permanent and archiving is reversible.',
  'Both archiving and deleting are recorded in the audit log.',
  'Archiving, restoring, and deleting are all audited.',
  'Roadmap: archiving a goal will cascade to its tasks in Q3.',
  'Policy: approving a salary change requires two signatures.',
];

let regressions = 0;
for (const t of prose) {
  const c = cand.readsAsCompletion(t);
  const v = v92.readsAsCompletion(t);
  const tag = (c && !v) ? 'TRUTH-REGRESSION' : (c && v) ? 'both-flag' : (!c && v) ? 'v92-only' : 'clean';
  if (c && !v) regressions++;
  console.log(tag.padEnd(18), 'cand=' + (c ? 'CORRECT' : 'keep '), 'v92=' + (v ? 'CORRECT' : 'keep '), JSON.stringify(t));
}
console.log('\nTRUTH REGRESSIONS (candidate destroys, v92 preserves): ' + regressions + ' / ' + prose.length);
