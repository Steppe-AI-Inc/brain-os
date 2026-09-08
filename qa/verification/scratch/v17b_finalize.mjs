import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(P, 'utf8'));
const sha = createHash('sha256').update(readFileSync('supabase/functions/sem-ai-command/index.ts')).digest('hex');

j.scenarios.S7_question_belt_untouched = {
  status: 'PASS',
  evidence: 'qa/verification/scratch/v17b_s7_question.mjs. Nine question-belt constructs (safeQuestionFragment, INTERROGATIVE_LEAD, FIRST_PERSON_MAIN_CLAUSE_COMPLETION, COMPLETION_WORD, safeProseFragment, safeOptionLabel, safeDisplayLabel, PAST_COMPLETION_CLAIM_PATTERN, safePendingSummary) are BYTE-IDENTICAL across d724d8c -> 52e830f -> the candidate (sha of each extracted slice compared), and 0/16 behavioural drift on a question corpus through the REAL safeQuestionFragment. The candidate touched the COMPLETION belt only.',
  at: new Date().toISOString(),
};
j.verdict = 'FAIL';
j.status = 'COMPLETE';
j.verdict_classification = 'FAIL';
j.index_sha256_observed_at_end = sha;
j.index_sha256_matches_required = sha === 'e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69';
j.defects_found = [
  { id: 'D128', severity: 'P1', title: "D125's widened clause splitter destroys truthful negatives about entities whose real names contain and/but/without/a dash/a parenthesis/a colon", regression_against: '52e830f', measured: '97/130 (75%) false positives vs 0/130 on 52e830f; 0/30 false negatives vs 15/30 on 52e830f', downstream: 'index.ts:5583 legacyProseFallback replaces the whole truthful answer; index.ts:5466 rewriteFromStructure discards the prose', class: 'run14/D112, ledger #4905 — recurrence', disclosure: "the candidate's disclosed residual mentions only the false-negative direction" },
  { id: 'D127', severity: 'P2', title: "SELECTION_FILLER is a static union of every lifecycle verb and entity noun, not 'the pending action's own verbs' as the comment and the #76 postscript both state", preexisting_at: ['52e830f', 'd724d8c'], measured: "'activate acme' and 'reject bob smith' arm archiveCompanyIds / endEmploymentPersonIds; 'activate' is absent from RESTORE_VERB_PATTERN which knows only 'reactivate'; entity-type nouns flip the operation's target" },
  { id: 'D129', severity: 'P3', title: 'the D95 seam — the product renders "(option N)" and then refuses the numbered reply, because no digit is selection filler while the words option/number are', measured: 'candidate binds 57/78 legitimate naming replies vs 78/78 on both priors' },
];
j.coverage_gaps = [
  "cleanSelection's second-option guard survives all 22 assertion-bearing suites (264/4,942,140 fuzzed combinations decide on it — not vacuous, but unobserved)",
  "adding 'or' to the clause splitter is caught by NO committed suite — the battery has zero false-positive coverage for splitter widening",
];
j.blocked_coverage = {
  ui_truth: 'BLOCKED — no browser/MCP tooling in this process',
  live_ai_chat_truth: 'BLOCKED — same, and nothing is deployed to test against',
  db_rls_lifecycle_truth: 'OUT OF SCOPE — the 60 *.sql suites were NOT run',
};
j.production_read_only = {
  checked_by: 'verifier #17, self-run',
  command: 'npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk',
  function: 'sem-ai-command', version: 92, status: 'ACTIVE',
  ezbr_sha256: '33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475',
  updated_at: 1788239725518,
  conclusion: 'unchanged since #75/#76; none of D58-D129 is live; the candidate is NOT deployed',
};
j.artifacts = [
  'qa/verification/proposed/v17_known_failure_modes_entry_77.md',
  'qa/verification/proposed/v17_regression_additions.mjs (39 cases: 19 pass / 20 fail, all 20 DEFECT-by-design, 0 CONTRACT failures)',
  'qa/verification/proposed/v17_PROMOTION_NOTE.md',
  'qa/verification/scratch/v17b_lib.mjs and v17b_{battery,s0,s0b,s3,s3b,s4,s6,s7_question,s8,s9,mutate,mutate2,m4}.mjs',
];
j.sha_discipline = {
  asserted_at_start: true,
  temporary_source_mutations: 28,
  restored_and_reasserted_after_each: true,
  final_observed: sha,
};
j.remaining_scenarios = [];
j.last_checkpoint_at = new Date().toISOString();
writeFileSync(P, JSON.stringify(j, null, 1));
console.log('verdict=' + j.verdict + '  final sha=' + sha + '  matches=' + j.index_sha256_matches_required);
console.log('scenarios recorded: ' + Object.keys(j.scenarios).join(', '));
