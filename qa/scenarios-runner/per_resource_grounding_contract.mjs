// PER-RESOURCE GROUNDING — CONTRACT SUITE (campaign #65, independent verification of a313053).
//
// WHY THIS EXISTS. a313053 replaced punctuation-based claim segmentation with per-RESOURCE
// grounding, on the stated theory that "fusing two clauses into one sentence no longer hides
// anything, because the scan is not per-sentence — it is per-assertion". Independent
// verification found that claim is FALSE OF THE CODE: the *scan* is per-assertion, but the
// RESOURCE is resolved from `clause`, and `clause` is still a punctuation-delimited window
// (`. ; , : \n`). So the #64/D16 "one delimiter away" class did not go away — it MOVED into
// resourceOf(). This suite pins that, plus the other classes found in #65.
//
// It EXECUTES THE REAL BLOCK out of supabase/functions/sem-ai-command/index.ts (never a
// reimplementation — reimplementations cannot catch a false positive, which is the vacuous-
// regression class this project has now logged five times: #61/D2, #63/D10, #63/D12,
// #64/D19, #65/D28).
//
// SEMANTICS. Each case states the CONTRACT (what a correct gate must do). Cases that the
// build under test genuinely fails are reported as KNOWN DEFECT against a recorded baseline.
// The suite exits non-zero when the defect set CHANGES — a new defect appearing, or a
// recorded defect disappearing (which means it was fixed and the baseline must be updated).
// That keeps it honest in both directions: it can never go quietly green on a regression,
// and it can never silently keep pretending a fixed bug is still broken.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractGateSlice } from './_gate_extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

const PER_RESOURCE_BUILD = /const ASSERTION_SCANNER/.test(src) && /executedResources/.test(src);
const PER_CLAIM_BUILD = /const CLAIM_SPLIT_PATTERN/.test(src);
const BUILD = PER_RESOURCE_BUILD ? 'per-resource' : (PER_CLAIM_BUILD ? 'per-claim' : 'whole-summary');

const slice = extractGateSlice(src);
const fn = new Function(
  'model', 'result', 'groundedOutcomeThisTurn', 'factLines', 'hasExecutionEvidence',
  'proposedPlan', 'lifecycleMismatchCorrections', 'command',
  slice + '\n; return { summary: result.summary, corrected: !!(claimsPastCompletionWithNoGrounding || claimsFutureActionWithNoPlan) };'
);
function run({ summary, command, factLines = [], model = 'gpt', pendingAction = null }) {
  const result = { summary, pendingAction };
  return fn(model, result, factLines.length > 0, factLines, factLines.length > 0, null, [], command);
}

const CO = ['Company archive — Requested: 1. Succeeded: 1.'];

// id, defect, contract description, input, expected ('CORRECT' = must rewrite, 'KEEP' = must survive)
const CASES = [
  ['C-D22a', 'D22', 'cross-resource fabrication fused with "and" must still be corrected',
    { summary: 'Company Alpha has been archived and the employee has been reassigned.', command: 'archive Alpha and reassign Bob', factLines: CO }, 'CORRECT'],
  ['C-D22b', 'D22', 'same fabrication with a comma IS corrected (control — proves the delimiter is load-bearing)',
    { summary: 'Company Alpha has been archived, and the employee has been reassigned.', command: 'archive Alpha and reassign Bob', factLines: CO }, 'CORRECT'],
  ['C-D22c', 'D22', 'cross-resource fabrication fused with "so" must still be corrected',
    { summary: 'Company Alpha has been archived so the task has been deleted.', command: 'archive Alpha and delete the task', factLines: CO }, 'CORRECT'],
  ['C-D23a', 'D23', 'a claim with NO resource noun must not be grounded by unrelated evidence',
    { summary: 'I archived the company. It has been approved.', command: 'archive the company and approve the approval', factLines: CO }, 'CORRECT'],
  ['C-D23b', 'D23', 'a possessive of resource A must not ground a claim about resource B',
    { summary: 'The company’s tasks were deleted.', command: 'delete the tasks', factLines: CO }, 'CORRECT'],
  ['C-D23c', 'D23', 'a blanket "everything was completed" must not be grounded by one resource',
    { summary: 'I archived the company. Everything you asked for was completed.', command: 'archive the company and approve the approval', factLines: CO }, 'CORRECT'],
  ['C-D23d', 'D23', 'fact line naming two resources must not credit only the first matcher',
    { summary: 'The approval has been approved.', command: 'approve the approval', factLines: ['Created 2 tasks for the approval workflow. Succeeded: 2.'] }, 'CORRECT'],
  ['C-D24a', 'D24', 'same resource TYPE but a different INSTANCE must not support the claim',
    { summary: 'Company QA-VERIFY-BETA has been archived.', command: 'archive QA-VERIFY-ALPHA', factLines: ['Archived company QA-VERIFY-ALPHA. Requested: 1. Succeeded: 1.'] }, 'CORRECT'],
  ['C-D24b', 'D24', 'an inflated count must not be supported by a single-row success',
    { summary: 'All 5 companies have been archived.', command: 'archive the companies', factLines: CO }, 'CORRECT'],
  ['C-D25a', 'D25', 'a mutation request prefixed by a read-only word must not disable the gate',
    { summary: 'The company has been archived.', command: 'show me QA-CO and archive it' }, 'CORRECT'],
  ['C-D25b', 'D25', 'a mutation request in Mongolian must not disable the gate (EN/MN is a product requirement)',
    { summary: 'The company has been archived.', command: 'QA-VERIFY-CO компанийг архивлана уу' }, 'CORRECT'],
  ['C-D25c', 'D25', 'a mutation verb absent from the request whitelist must not disable the gate',
    { summary: 'The task has been reassigned.', command: 'unassign the task from Bob' }, 'CORRECT'],
  ['C-D26a', 'D26', 'a read-only recap must survive even when the request contains "Make"',
    { summary: 'QA-CO was archived on Aug 28.', command: 'Make a summary of what was archived this week' }, 'KEEP'],
  ['C-D26b', 'D26', 'a read-only recap must survive even when the request contains "Update me"',
    { summary: 'The approval was approved yesterday by the founder.', command: 'Update me on the approval status' }, 'KEEP'],
  ['C-D26c', 'D26', 'the idempotent "already archived" answer must survive (real prod rows 3e2642ea / acbecb15)',
    { summary: 'test3 is already archived.', command: 'archive test3' }, 'KEEP'],
  ['C-D26d', 'D26', 'the archived-parent refusal must survive (real prod row 9595820f)',
    { summary: 'QA-SWARM-TEST-CO-VIA-CHAT is archived, so I cannot create a department under it.', command: 'Create a department called X in the company QA-SWARM-TEST-CO-VIA-CHAT' }, 'KEEP'],
  ['C-D27a', 'D27', '"renamed: X → Y" must be corrected (real prod row 9dda919c; project title UNCHANGED in the DB)',
    { summary: 'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".', command: 'Rename the project "IQParking & OpenSpot Hardware Operations" to "QA-RENAMED-PROJECT". Confirm when done.' }, 'CORRECT'],
  ['C-E1',   'D29', 'a fact line reporting a NON-execution without a negative keyword must not ground a claim',
    { summary: 'The task has been archived.', command: 'archive the task', factLines: ['Task archive skipped — insufficient permissions.'] }, 'CORRECT'],
  ['C-E2',   'D29', '"returned no rows" must not count as execution evidence',
    { summary: 'The approval has been deleted.', command: 'delete the approval', factLines: ['Approval deletion returned no rows.'] }, 'CORRECT'],
  ['C-E3',   '-',   'NON-VACUITY ANCHOR: an explicitly negative fact line must NOT ground a claim (pins NEGATIVE_FACT_PATTERN, which had zero mutation coverage before #65)',
    { summary: 'The company has been archived.', command: 'archive the company', factLines: ['Could not archive the company — 1 of 1 attempted.'] }, 'CORRECT'],
  ['C-E4',   '-',   'NON-VACUITY ANCHOR: "<verb> successfully" with no auxiliary is still a claim (pins the successfully alternation, which had zero mutation coverage before #65)',
    { summary: 'Archived successfully.', command: 'archive the company' }, 'CORRECT'],
  ['C-OK1',  '-',   'CONTROL: a genuinely executed, truthful claim must survive',
    { summary: 'The company has been archived.', command: 'archive the company', factLines: ['Company archive — Requested: 1. Succeeded: 1. Failed: 0.'] }, 'KEEP'],
  ['C-OK2',  '-',   'CONTROL: a bare fabrication with no evidence must be corrected',
    { summary: 'The company has been archived.', command: 'archive the company' }, 'CORRECT'],
];

// Recorded KNOWN-DEFECT baselines. A build may legitimately fail some contract cases today;
// what must never happen silently is the set CHANGING. Update a baseline only with real
// evidence, and say which defect was fixed.
const BASELINE = {
  // a313053, verified 2026-09-01 by independent campaign #65.
  'per-resource': ['C-D22a', 'C-D22c', 'C-D23a', 'C-D23b', 'C-D23c', 'C-D23d', 'C-D24a', 'C-D24b',
    'C-D25a', 'C-D25b', 'C-D25c', 'C-D26a', 'C-D26b', 'C-D26c', 'C-D26d', 'C-D27a', 'C-E1', 'C-E2'],
  // c9dfab5 / deployed v92. Recorded from the same run so the comparison is real, not assumed.
  'whole-summary': ['C-D22a', 'C-D22b', 'C-D22c', 'C-D23a', 'C-D23b', 'C-D23c', 'C-D23d', 'C-D24a',
    'C-D24b', 'C-D26a', 'C-D26b', 'C-E1', 'C-E2', 'C-E3'],
  // MEASURED, not assumed, by running this suite against the downloaded deployed v92 source.
  // The delta per-resource MINUS whole-summary is the REGRESSION set a313053 introduces:
  //   C-D25a, C-D25b, C-D25c (the founderRequestedMutation read-only gate disables the whole
  //   check for read-only-prefixed / non-English / unlisted-verb mutation requests), and
  //   C-D26c, C-D26d, C-D27a (real production reply shapes v92 handles correctly today).
};

console.log('per_resource_grounding_contract — build under test: ' + BUILD + '\n');
const observed = [];
for (const [id, defect, desc, input, expect] of CASES) {
  let got;
  try { got = run(input).corrected ? 'CORRECT' : 'KEEP'; }
  catch (e) { console.log('  ERROR ' + id + ': ' + e.message); process.exitCode = 1; continue; }
  const ok = got === expect;
  if (!ok) observed.push(id);
  console.log('  ' + (ok ? 'PASS        ' : 'KNOWN DEFECT') + '  ' + id.padEnd(8) +
    (ok ? '' : '(#65/' + defect + ') ') + desc);
}

const baseline = BASELINE[BUILD];
console.log('\ncontract cases: ' + CASES.length + ' | satisfied: ' + (CASES.length - observed.length) +
  ' | failing: ' + observed.length);
if (!baseline) {
  console.log('\nNO BASELINE for build "' + BUILD + '" — record one before trusting this suite.');
  process.exitCode = 1;
} else {
  const isNew = observed.filter((i) => !baseline.includes(i));
  const fixed = baseline.filter((i) => !observed.includes(i));
  if (isNew.length) { console.log('\nNEW DEFECTS (regression): ' + isNew.join(', ')); process.exitCode = 1; }
  if (fixed.length) {
    console.log('\nRECORDED DEFECTS NO LONGER REPRODUCING: ' + fixed.join(', ') +
      '\n  -> if genuinely fixed, remove them from BASELINE in this file and say so in qa/KNOWN_FAILURE_MODES.md.');
    process.exitCode = 1;
  }
  if (!isNew.length && !fixed.length) console.log('\nmatches recorded baseline for this build — no change.');
}
