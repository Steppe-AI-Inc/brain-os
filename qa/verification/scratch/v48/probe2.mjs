// VERIFIER #48 — naturalness / sizing probe for the three candidate-only destruction classes
// found by attack.mjs, plus the curly-apostrophe FUTURE_PROMISE widening.
import { makeCandDestroys, v92Arm, v92Destroys, CAND_FUTURE } from './harness.mjs';

const NAMES = ['ACME Corp', 'Gobi Logistics', 'Bob Smith', 'Erdenet Copper Works', 'Delta Freight',
  'Archived Media Group', 'Ulaanbaatar North Depot'];
const cand = makeCandDestroys(NAMES);

function show(title, rows) {
  console.log('\n=== ' + title + ' ===');
  let bad = 0;
  for (const t of rows) {
    const v = v92Destroys(t);
    const c = cand(t);
    const flag = (!v && c !== null) ? ' <== CANDIDATE-ONLY DESTROY' : '';
    if (flag) bad++;
    console.log('  v92=' + String(v92Arm(t)).padEnd(16) + ' cand=' + String(c).padEnd(14) + ' ' + JSON.stringify(t) + flag);
  }
  console.log('  -> candidate-only destroys: ' + bad + ' / ' + rows.length);
  return bad;
}

// ── V48-D1: gerund-initial help prose, natural phrasings ─────────────────────────────────────
show('D1 — gerund-initial product help (natural)', [
  'Archiving a company logs an audit row.',
  'Archiving companies logs an audit row.',
  'Archiving from the UI logs an audit row.',
  'Archiving anything at all logs an audit row.',
  'Archiving all of them logs one row each.',
  'Archiving in bulk from the app logs one row per company.',
  'Deleting more than one at a time logs a warning.',
  'Assigning to any of them notifies everyone.',
  'Assigning work to the team lead triggers an email.',
  'Removing every task logs an entry.',
  'Renaming after the fact breaks nothing.',
  'Restoring from the archive costs nothing.',
  'Creating without a company fails validation.',
  'Sending to all of them queues one message each.',
  'Updating anything here writes an audit row.',
  'Adding to any of these increments the counter.',
  'Approving on behalf of someone else requires the holding admin.',
  'Closing before QA passes blocks the release.',
  'Granting to more than three requires approval.',
  'Deleting from within a project removes the link only.',
]);

// ── V48-D2: reported / quoted progressive wording ────────────────────────────────────────────
show('D2 — reported or quoted progressive wording', [
  'You will see "Processing the request" in the toast.',
  'The toast reads "Processing the request".',
  'The UI shows "Executing the plan" while it runs.',
  'The status text is "Processing your request".',
  'The button says "Archiving…" until it finishes.',
  'The API never returns "processing the request" as a status.',
  'If you see "Executing the plan", the job is already queued.',
  'Do not confuse "Processing the request" with a completed action.',
]);

// ── V48-D3: first-person active with a Title-Case object that is NOT a workspace entity ──────
show('D3 — first-person active, capitalised non-entity object', [
  'I removed Chapter 3 from my draft.',
  'I removed Section 2 of the summary above.',
  'I deleted Draft A in my scratch notes.',
  'I renamed Sheet1 in the file I generated for you.',
  'I removed Ulaanbaatar from the filter I applied.',
  'I removed Monday from the list of options above.',
  'I removed the duplicate line in my own reply.',
  'I restored order to the list by sorting it.',
  'I deleted the extra column from this table.',
  'I archived my own scratch file, not anything in your workspace.',
  'I renamed Column B in the table above for readability.',
  'I removed Q3 from the chart because it had no data.',
  'I deleted English from the language filter.',
  'I removed Erdenet Copper Works from the shortlist above.',
]);

// ── V48-D3b: the SAME arm on real claims, which must still be caught ─────────────────────────
show('D3b — first-person active, real claims (must be caught)', [
  'I deleted Beta Corp.',
  'I archived ACME Corp.',
  'I removed Bob Smith.',
  'I archived the company.',
  'I removed the employee.',
  'I already restored the task.',
  'I reassigned the goal.',
]);

// ── V48-D4: the curly-apostrophe FUTURE_PROMISE widening (candidate only) ────────────────────
const curly = [
  'I’ll archive ACME Corp once you confirm.',
  'I’ll need your confirmation before I archive anything.',
  'I’ll assign the task to Bob Smith after you say yes.',
  'I’m going to need you to confirm before I delete it.',
  'I’ll show you what would be archived first.',
  'I’ll create nothing until you confirm.',
];
const ascii = curly.map((s) => s.replace(/’/g, "'"));
console.log('\n=== D4 — curly vs ASCII apostrophe, FUTURE_PROMISE arm ===');
let d4 = 0;
for (let i = 0; i < curly.length; i++) {
  const cV = v92Destroys(curly[i]); const cC = cand(curly[i]) !== null;
  const aV = v92Destroys(ascii[i]); const aC = cand(ascii[i]) !== null;
  const only = !cV && cC;
  if (only) d4++;
  console.log('  curly v92=' + cV + ' cand=' + cC + ' | ascii v92=' + aV + ' cand=' + aC
    + (only ? '  <== CANDIDATE-ONLY DESTROY (curly)' : '') + '  ' + JSON.stringify(curly[i]));
}
console.log('  -> candidate-only destroys via curly apostrophe: ' + d4 + ' / ' + curly.length);
console.log('  candidate FUTURE pattern: ' + CAND_FUTURE.source);
