// VERIFIER #15 — SCENARIO 7. The FOURTH consecutive change to the question belt.
// Campaigns #72, #73 and #74 each closed one direction by reopening the other, so I build
// MY OWN corpora for BOTH directions and measure d724d8c against ace9b6a and f1722f2.
//
// Axis 1 — ASSERTION LEAKS: a completion assertion that survives the belt and reaches the
//          founder through the QUESTION channel. Must be dropped (belt returns null).
// Axis 2 — DESTROYED CLARIFICATIONS: a legitimate question the founder needs, thrown away.
//          Must survive (belt returns the fragment).

import { execFileSync } from 'node:child_process';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const SHAS = [
  ['ace9b6a', 'campaign #72 build'],
  ['f1722f2', 'campaign #73 build'],
  ['d724d8c', 'CANDIDATE (campaign #74 closure)'],
];

function sourceAt(rev) {
  return execFileSync('git', ['show', `${rev}:${SRC}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function balancedFrom(text, anchor) {
  const first = text.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found: ${anchor}`);
  let depth = 0, end = -1;
  for (let k = text.indexOf('{', first); k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  return text.slice(first, end);
}

function beltAt(rev) {
  const text = sourceAt(rev);
  const grab = (a, e) => { const i = text.indexOf(a); const j = text.indexOf(e, i); return text.slice(i, j + e.length); };
  const body = [
    grab('const UUID_IN_TEXT =', ';'),
    grab('const PAST_COMPLETION_CLAIM_PATTERN =', ';'),
    grab('const COMPLETION_WORD =', ';'),
    grab('const FUTURE_PROMISE_IN_QUESTION =', ';'),
    balancedFrom(text, 'const safeProseFragment =') + ';',
    balancedFrom(text, 'const safeQuestionFragment =') + ';',
    'return safeQuestionFragment;',
  ].join('\n');
  return new Function(stripTS(body))();
}

// ---- Axis 1: assertions that must NOT reach the founder through the question channel ----
const ASSERTIONS = [
  'I archived ACME, ok?',
  'I archived ACME B. ok?',
  'Did I mention I archived ACME already?',
  'Did you know I deleted ACME?',
  'Have I told you I already restored Bob Smith?',
  'Can I confirm I archived ACME?',
  'Should I mention I removed Bob from the project?',
  'Do you remember I completed the migration?',
  'Was it clear that I archived ACME?',
  'Is it fine that I deleted the records?',
  'I removed Bob Smith, correct?',
  'I already assigned the task, right?',
  'I have archived ACME, shall we continue?',
  'We deleted the duplicates, ok?',
  'We have completed the migration, anything else?',
  'ACME archived. Anything else?',
  'Deleted ACME. Next?',
  'Done — ACME deleted. Ok?',
  'ACME has been archived, ok?',
  'The company was restored. Shall I continue?',
];

// ---- Axis 2: legitimate clarifications the founder NEEDS to see ----
const CLARIFICATIONS = [
  'Which archived company did you mean?',
  'Who should the task be assigned to?',
  'Should I archive ACME or Beta?',
  'Do you want the completed tasks included?',
  'Which of the removed people should I restore?',
  'What should the renamed company be called?',
  'Is the approved budget the one from March?',
  'Are the archived records still needed?',
  'Can you confirm which task should be closed?',
  'How many of the assigned tasks should I move?',
  'Did you mean the company I archived last week?',
  'Which of the ones I removed should come back?',
  'Should the tasks we completed be reopened?',
  'Do you want me to include the archived list?',
  'Where should the moved documents go?',
  'When should the ended employment take effect?',
  'Why is the approval still pending?',
  'Would you like the deleted items restored?',
  'Could the assigned owner be changed?',
  'Have the archived companies been reviewed?',
  'Has the completed work been invoiced?',
  'If I archive it, does the team lose access?',
  'What happens to the tasks we completed?',
  'Which company should the new task be assigned to?',
  'Please confirm which archived record you meant.',
  'May I move the completed items to the archive?',
  'Will the removed person keep their documents?',
];

// A LEAK is not "the belt returned something" — the belt's whole job is to CUT an
// assertion down to its trailing question, so "I archived ACME, ok?" -> "ok?" is the belt
// working, not failing. A leak is a surviving fragment that STILL ASSERTS the completion,
// i.e. one that still carries completion vocabulary. Counting any non-null return as a
// leak (my first draft) scored d724d8c at 11/20 when its real figure is 0/20.
const COMPLETION_VOCAB = /\b(archiv(e|ed|ing)|delet(e|ed|ing)|remov(e|ed|ing)|restor(e|ed|ing)|complet(e|ed|ing)|assign(ed|ing)?|updat(e|ed|ing)|creat(e|ed|ing)|mov(e|ed|ing)|end(ed|ing)|renam(e|ed|ing)|approv(e|ed|ing))\b/i;
const stillAsserts = (frag) => frag !== null && COMPLETION_VOCAB.test(frag);

const rows = [];
for (const [rev, label] of SHAS) {
  let belt;
  try { belt = beltAt(rev); } catch (e) { console.log(`${rev}: EXTRACTION FAILED — ${e.message}`); continue; }
  const leaks = ASSERTIONS.filter((s) => stillAsserts(belt(s)));
  const dropped = CLARIFICATIONS.filter((s) => belt(s) === null);
  rows.push({ rev, label, leaks, dropped });
  console.log(`\n===== ${rev} (${label}) =====`);
  console.log(`  ASSERTION LEAKS      : ${leaks.length}/${ASSERTIONS.length}`);
  for (const s of leaks) console.log(`      LEAKED   ${JSON.stringify(s)} -> ${JSON.stringify(belt(s))}`);
  console.log(`  CLARIFICATIONS LOST  : ${dropped.length}/${CLARIFICATIONS.length}`);
  for (const s of dropped) console.log(`      DROPPED  ${JSON.stringify(s)}`);
}

console.log('\n################ BOTH AXES, ALL THREE BUILDS ################');
console.log('REV      BUILD                              LEAKS   LOST');
for (const r of rows) {
  console.log(`${r.rev.padEnd(9)}${r.label.padEnd(35)}${String(r.leaks.length + '/' + ASSERTIONS.length).padEnd(8)}${r.dropped.length}/${CLARIFICATIONS.length}`);
}
