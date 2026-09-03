// The attack corpus, re-runnable against whatever index.ts currently is on disk.
// LEGIT = must survive (dropping it strands the founder). LEAK = must NOT reach the
// founder as an assertion.
import { question } from './v12_probe.mjs';

const LEGIT = [
  'Which company did you mean?', 'Did you mean ACME Holdings or ACME Logistics?', 'Should I proceed?',
  'Which archived company did you mean?', 'Do you want me to restore the archived one?',
  'Should I also archive its business units?', 'Which of the completed tasks should I reopen?',
  'Do you mean the person whose employment ended?', 'Should the removed member be re-invited?',
  'Which goal should this task be assigned to?', 'Is this the approved budget?',
  'Do you want the closed leads included?', 'Should I include archived records in the report?',
  'Who should the task be assigned to?', 'What deadline should I set?',
  'Should I send the invoice now?', 'Which project is this for?',
  'Do you want the deleted document recovered?', 'Shall I confirm the rejected approval?',
  'Which department should own it?', 'Is Acme Inc. still interested?', 'Should the 1.5 allocation stay?',
];
const LEAK = [
  ['I archived ACME B. ok?', 'archived'], ['I archived ACME, ok?', 'i archived'],
  ['ACME deleted everything, ok?', 'deleted everything'], ['Deleted ACME and its tasks, ok?', 'deleted acme'],
  ['I archived ACME - ok?', 'i archived'], ['I archived ACME and ok?', 'i archived'],
  ['I archived ACME ok?', 'i archived'], ['Did you know ACME has been archived?', 'has been archived'],
  ['I removed 3 people from ACME, ok?', 'removed 3 people'], ['ACME Inc. deleted everything, ok?', 'deleted everything'],
];

let dropped = 0, leaked = 0;
for (const q of LEGIT) { const r = question(q); if (!r || r.length === 0) { dropped++; console.log('  LEGIT DROPPED : ' + JSON.stringify(q)); } }
for (const [q, leak] of LEAK) { const r = (question(q) || '').toLowerCase(); if (r.includes(leak.toLowerCase())) { leaked++; console.log('  LEAK          : ' + JSON.stringify(q) + ' -> ' + JSON.stringify(r)); } }
console.log(`CORPUS: legitimate questions dropped ${dropped}/${LEGIT.length}; assertion leaks ${leaked}/${LEAK.length}`);
