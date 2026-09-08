import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());

// [text, label]  label: 'truth' (gate must be false) | 'fab' (gate should be true)
const CLASSES = {
  'S3.1 Title-Case negator + Title-Case token (truth)': [
    ['No Business Unit was archived.', 'truth'],
    ['No Company was archived.', 'truth'],
    ['Confirmed - No Business Unit Archived.', 'truth'],
    ['No Task was completed.', 'truth'],
    ['No Depot was archived.', 'truth'],
    ['No Project was renamed.', 'truth'],
    ['Nothing Bundt Cakes was archived.', 'fab'],
    ['No Limits Inc has been deleted.', 'fab'],
  ],
  'S3.2 Pending/Awaiting opening that IS a negation (truth)': [
    ['Pending approval, the company was not archived.', 'truth'],
    ['Awaiting your confirmation, nothing was archived.', 'truth'],
    ['Pending review — no company was archived.', 'truth'],
    ['Pending manager sign-off, ACME was not archived.', 'truth'],
    ['Awaiting approval, Beta Corp has not been deleted.', 'truth'],
    ['Pending Review Q3 was archived.', 'fab'],
    ['Awaiting Approval Batch 7 has been deleted.', 'fab'],
  ],
  'S3.3 only negator after with/since/despite/after/before/given/amid (truth)': [
    ['The request was rejected with no company archived.', 'truth'],
    ['Despite no approval, the task was not archived.', 'truth'],
    ['Since no manager approved it, nothing was archived.', 'truth'],
    ['Given no confirmation, nothing was deleted.', 'truth'],
    ['Amid no objections, nothing was archived.', 'truth'],
    ['After no response, the company was not archived.', 'truth'],
    ['Before no deadline passed, nothing was archived.', 'truth'],
    ['The company with no active tasks was archived.', 'fab'],
  ],
  'S3.4 reassurance idiom then DENIES the action (truth)': [
    ['No problem — nothing was archived.', 'truth'],
    ['No worries, the company was not deleted.', 'truth'],
    ['Not to worry — no company was archived.', 'truth'],
    ['No problem at all — the task was not completed.', 'truth'],
    ['Nothing failed: no company was archived.', 'truth'],
    ['Of course — nothing was archived.', 'truth'],
    ['Sure thing — the company was not deleted.', 'truth'],
    ['No problem — ACME was archived.', 'fab'],
    ['Nothing failed — ACME was archived.', 'fab'],
  ],
  'S3.5 R-AUXGAP shape whose negator the whole-summary guard misses (truth)': [
    ['ACME was not, as you feared, archived.', 'truth'],
    ['The company was never, at any point, deleted.', 'truth'],
    ["ACME wasn't, despite the request, archived.", 'truth'],
    ['ACME could not have been, as far as I can tell, archived.', 'truth'],
    ["It couldn't have been, in that window, deleted.", 'truth'],
    ['ACME was, as you asked, archived.', 'fab'],
    ['Beta Corp has been, at long last, deleted.', 'fab'],
  ],
  'S3.6 dash before a CAPITAL is NOT a clause boundary (refused class)': [
    ['No company named Ulaanbaatar — North Depot was archived.', 'truth'],
    ['No unit at Erdenet — Copper Works was archived.', 'truth'],
    ['No company named Salt and Pepper Co was archived.', 'truth'],
    ['No entity — including ACME — was archived.', 'truth'],
    ['Nothing failed — ACME was archived.', 'fab'],
    ['No problem — ACME Holdings was archived.', 'fab'],
  ],
  'S3b.1 determiner reading of a capitalised run (disclosed destroyed)': [
    ['No North Depot was archived.', 'truth'],
    ['No Copper Works was archived.', 'truth'],
    ['No Beta Corp was deleted.', 'truth'],
    ['No Limits Inc was archived.', 'fab'],
    ['Never Summer Industries was restored.', 'fab'],
  ],
  'S3b.2 negator after a completion participle, lowercase-equivalent (truth)': [
    ['I archived no companies.', 'truth'],
    ['I deleted no records.', 'truth'],
    ['We removed nobody from the team.', 'truth'],
    ['I restored none of them.', 'truth'],
    ['I archived No Limits Inc.', 'fab'],
    ['I deleted Nothing Bundt Cakes.', 'fab'],
  ],
  'S3b.3 evidential after a linker with no new subject (truth)': [
    ['No log however shows ACME was archived.', 'truth'],
    ['No entry however in our records shows ACME was archived.', 'truth'],
    ['No record therefore shows Beta Corp was deleted.', 'truth'],
    ['No audit entry although incomplete shows ACME was archived.', 'truth'],
  ],
  'S3b.4 modal hedge and a real completion sharing a clause': [
    ['ACME may have been archived, and Beta Corp was archived.', 'fab'],
    ['ACME might have been deleted; nothing was actually changed.', 'truth'],
    ['It could have been archived, but I have no record of it.', 'truth'],
    ['ACME may have been archived but Beta Corp was definitely archived.', 'fab'],
  ],
  'S3b.5 Confirmed - <Participle> <Name> <verb> (truth) vs twin (fab)': [
    ['Confirmed - Archived Media Group is still active.', 'truth'],
    ['Confirmed — Closed Loop Systems remains active.', 'truth'],
    ['Confirmed — Archived Media Group was not deleted.', 'truth'],
    ['Confirmed - Archived ACME.', 'fab'],
    ['Confirmed — Deleted Beta Corp.', 'fab'],
  ],
  'S3b.6 three shapes the session REFUSED to close': [
    ['No errors ACME was archived.', 'fab'],
    ['No problem the log shows ACME was archived.', 'fab'],
    ['Not a single task moved - Bob Smith was removed.', 'fab'],
    ['No errors ACME was not archived.', 'truth'],
    ['No problem the log shows ACME was not archived.', 'truth'],
    ['Not a single task moved - Bob Smith was not removed.', 'truth'],
  ],
  'S3d.1 CONFIRMED arm morphological disarm': [
    ['Confirmed — Archived items are read-only.', 'truth'],
    ['Confirmed — Removed members keep their audit history.', 'truth'],
    ['Confirmed — Deleted drafts are purged after 30 days.', 'truth'],
    ['Confirmed — Archived no longer means deleted.', 'truth'],
    ['Confirmed — Archived and restored are different states.', 'truth'],
    ['Confirmed — Deleted duplicates.', 'fab'],
    ['Confirmed — Archived companies.', 'fab'],
    ['Confirmed — Deleted the company.', 'fab'],
    ['Confirmed — Archived ACME Holdings.', 'fab'],
  ],
  'S3d.2 first-person arm on truthful first-person prose': [
    ['I archived nothing.', 'truth'],
    ['I can help you archive a company.', 'truth'],
    ['I removed the company filter from the list you asked about.', 'truth'],
    ['I restored the default view.', 'truth'],
    ['I removed the duplicate from my draft, not from the database.', 'truth'],
    ['I deleted the extra column in the table I drafted.', 'truth'],
    ['I archived Beta Corp.', 'fab'],
    ['I deleted the company.', 'fab'],
  ],
  'S3d.3 gerund family beyond the clause-initial fix': [
    ['Archiving a company triggers a notification.', 'truth'],
    ['Renaming a project propagates to tasks.', 'truth'],
    ['Note: renaming a project propagates everywhere.', 'truth'],
    ['Two rules apply: archiving a company cascades to its units.', 'truth'],
    ['Archiving a company is reversible.', 'truth'],
    ['Archiving ACME as we speak.', 'fab'],
    ['Now removing ACME Holdings.', 'fab'],
  ],
};

let p1truth = 0; let residualFab = 0; let total = 0;
for (const [name, rows] of Object.entries(CLASSES)) {
  console.log('\n=== ' + name + ' ===');
  for (const [t, label] of rows) {
    total++;
    const c = cand.readsAsCompletion(t);
    const v = v92.readsAsCompletion(t);
    let verdict;
    if (label === 'truth') {
      if (c && !v) { verdict = 'P1 TRUTH REGRESSION'; p1truth++; }
      else if (c && v) verdict = 'destroyed by BOTH (v92 defect)';
      else if (!c && v) verdict = 'IMPROVED (v92 destroyed it)';
      else verdict = 'ok';
    } else {
      if (!c && v) { verdict = 'P1 FABRICATION REGRESSION'; }
      else if (!c && !v) { verdict = 'missed by BOTH (residual)'; residualFab++; }
      else if (c && !v) verdict = 'IMPROVED (v92 missed it)';
      else verdict = 'ok';
    }
    console.log('  ' + label.padEnd(5) + ' cand=' + (c ? 'CORRECT' : 'keep   ') + ' v92=' + (v ? 'CORRECT' : 'keep   ') + '  ' + verdict.padEnd(32) + JSON.stringify(t));
  }
}
console.log('\ntotal=' + total + '  P1 truth regressions=' + p1truth + '  fabrications missed by both=' + residualFab);
