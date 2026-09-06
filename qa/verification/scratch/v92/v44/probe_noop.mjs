// V44 — are the five remaining no-ops DEAD, or merely unreached? Search hard for one row each.
import { readSrc, buildCandGate, CAND_PATH } from './v44_harness.mjs';
const src = readSrc(CAND_PATH);
const sub = (needle, repl) => (s) => (s.includes(needle) ? s.split(needle).join(repl) : s);
const nth = (hay, needle, n, repl) => { let i = -1; for (let k = 0; k <= n; k++) { i = hay.indexOf(needle, i + 1); if (i < 0) return hay; } return hay.slice(0, i) + repl + hay.slice(i + needle.length); };

const CASES = {
  'relInternal': [sub('const relInternal = /\\w,?\\s+(?:that|which', 'const relInternal = false && /\\w,?\\s+(?:that|which'), [
    'The company, which had no open tasks, was archived.',
    'The company which had no open tasks was archived.',
    'The record that shows no errors was updated.',
    'The task, which no one owns, was completed.',
    'The person who had no assignments was removed.',
    'The company, that had nothing pending, was archived.',
    'The unit, which has no staff, was archived.',
    'The approval, which required no review, was granted.',
  ]],
  'quotedHead': [sub('const quotedHead = /["“‘\']\\s*$/', 'const quotedHead = false && /["“‘\']\\s*$/'), [
    '“Nothing” was the old label and ACME was archived.',
    'The company "No Limits" was archived.',
    'The task “Nothing to do” was completed.',
    'The label ‘none’ was renamed.',
    'We kept "no change" and the company was archived.',
    'The old title was "Pending" and the task was completed.',
  ]],
  'idiomStrip-bare': [(s) => nth(s, '(?:no problem|no worries', 1, '(?:zzno problem|no worries'), [
    'No problem the company was archived.',
    'No worries the task was completed.',
    'No problem at all the company was archived.',
    'Not to worry the approval was granted.',
    'No issue the document was deleted.',
    'No problem our company was archived.',
    'Nothing to worry about the task was completed.',
    'Sure thing the company was archived.',
    'Of course the company was archived.',
    'Absolutely the company was archived.',
    'No harm done the record was updated.',
  ]],
  'V43D6-secondSentence': [sub('(?:It|They|This|That)\\b', '(?:zzIt|They|This|That)\\b'), [
    'Confirmed — Closed Loop Systems. It is still active.',
    'Confirmed — Archived Metals Co. It remains active.',
    'Confirmed — Restored Depot Ltd. It still exists.',
    'Confirmed — Completed Works Group. This remains open.',
    'Confirmed — Removed Metals Co. That stays open.',
    'Confirmed — Granted Capital Partners. It continues to trade.',
  ]],
  'modalBlank': [sub('|conceivably|previously|recently', '|zzconceivably|previously|recently'), [
    'The company should have been archived.',
    'The task would have been completed by now.',
    'It might already have been deleted.',
    'The record may possibly have been updated.',
    'The company could conceivably have been archived.',
    'ACME should already have been archived and the task is open.',
    'The task should have been completed, and nothing else changed.',
    'It could previously have been archived.',
  ]],
};

for (const [name, [mut, rows]] of Object.entries(CASES)) {
  const before = buildCandGate(src, []);
  const applied = mut(src) !== src;
  const after = buildCandGate(src, [], mut);
  console.log('\n=== ' + name + '  (mutation applied: ' + applied + ')');
  let moved = 0;
  for (const t of rows) {
    const a = before(t), b = after(t);
    if (a !== b) moved++;
    console.log('   ' + (a ? 'C' : 'c') + '->' + (b ? 'C' : 'c') + (a !== b ? ' *MOVED*' : '        ') + ' ' + JSON.stringify(t));
  }
  console.log('   moved: ' + moved + ' / ' + rows.length);
}
