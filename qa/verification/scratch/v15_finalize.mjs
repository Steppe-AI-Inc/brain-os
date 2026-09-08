import fs from 'node:fs';
import crypto from 'node:crypto';

const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const d = JSON.parse(fs.readFileSync(P, 'utf8'));
const sha = crypto.createHash('sha256')
  .update(fs.readFileSync('supabase/functions/sem-ai-command/index.ts')).digest('hex');

d.status = 'COMPLETED';
d.verdict = 'FAIL';
d.verdict_basis =
  'Classified from OUTPUT TEXT, never from an exit code. The committed battery is green ' +
  '(25 suites, exit 0, zero textual failures) but that is not the verdict: five NEW ' +
  'defects were demonstrated by executing the real shipped source, one of them a P1 ' +
  'wrong-entity DESTRUCTIVE bind (D116). No provider-capacity or session-limit text was ' +
  'seen at any point in this run.';
d.index_ts_sha256_observed_at_end = sha;
d.sha_intact_at_end = sha === d.index_ts_sha256_required;
d.new_defects = {
  D116: 'P1. matchDisambiguationOption short-circuits on matches.length===1 before every D106 guard, and models no negation, so a reply EXCLUDING an option binds it and arms archiveCompanyIds with no LLM in the loop. Traced end-to-end index.ts:2572->2583->2587->2604->3047->3076.',
  D117: 'The D112 negation lookahead is whole-summary ([^]*), so any later sentence containing a negation word disarms CONFIRMED_COMPLETION and with it all four arms. 6/33 fabricated summaries escape. RECURRENCE of the class struck down at KNOWN_FAILURE_MODES.md:5277.',
  D118: 'D112 was applied to CONFIRMED_COMPLETION only; LEGACY_PAST_COMPLETION and EXECUTION_IN_PROGRESS have no negation handling, so 7/7 same-class truthful negatives are still destroyed - including the postscript’s own example with "is" changed to "was". RECURRENCE of the class at :4905.',
  D119: 'The ABSENT-branch lexical fallback fails in both directions simultaneously: 10/13 real names destroyed AND 6/18 execution assertions surviving. Product decision, remedy must obtain canonical evidence rather than add a sixth grammar rule.',
  D120: 'safeOptionLabel never consults EXECUTION_IN_PROGRESS, so progressive execution assertions ship verbatim as option labels.',
  D121: 'Three guard limits unobserved (mutants M03, M06, M21) plus one equivalent mutant (M25: the ||\'archive\' default in commandContradictsActionType is dead).',
  D122: 'index.ts:2563 cites issue5_confirmation_action_type_binding.mjs as proof of the issue-5 P1 fix, but that suite reimplements the map and never reads index.ts. The invariant is observed elsewhere (source_invariants_drift_guard), so this is an inaccurate citation, not a vacuous guard.',
};
d.confirmed_closed = {
  D106: 'CLOSED and closed well. 34/40 probes pass; all 6 failures are D116, in code D106 never touched.',
  D113: 'CLOSED where canonical evidence exists: 0/18 assertions survive, 0/13 real names destroyed, every targeted probe correct.',
  D114: 'CLOSED and ends the four-campaign oscillation. Candidate 0 leaks / 1 lost STRICTLY DOMINATES ace9b6a (0/5) and f1722f2 (7/1) on both axes.',
  D112: 'PARTIALLY closed - see D117 and D118.',
  guards: 'All seven new guards observed in BOTH coverage and LIMIT directions by committed cases (20 of my 25 mutants killed).',
};
d.artifacts = {
  ledger_entry: 'qa/verification/proposed/v15_known_failure_modes_entry_75.md',
  promotion_note: 'qa/verification/proposed/v15_PROMOTION_NOTE.md',
  regression_cases: 'qa/verification/proposed/v15_regression_additions.mjs (46 cases, 17 pass / 29 fail, 0 CONTRACT failures, exits 1)',
  scratch: [
    'qa/verification/scratch/v15_extract.mjs',
    'qa/verification/scratch/v15_mutations.mjs',
    'qa/verification/scratch/v15_battery.mjs',
    'qa/verification/scratch/v15_s0_matcher_attack.mjs',
    'qa/verification/scratch/v15_s3_drift_corpora.mjs',
    'qa/verification/scratch/v15_s4_corroboration.mjs',
    'qa/verification/scratch/v15_s7_question_belt.mjs',
    'qa/verification/scratch/v15_s9_ledger_claims.mjs',
  ],
};
d.production_state = {
  function: 'sem-ai-command', version: 92, status: 'ACTIVE',
  ezbr_sha256: '33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475',
  updated_at_ms: 1788239725518,
  note: 'Production predates the entire run9->run14 sequence. NONE of D58-D122 is live. Every finding concerns a candidate branch.',
};
d.scope_not_covered = [
  'The 60 .sql suites were NOT run and no database query was issued. DB/RLS/lifecycle truth is OUT OF SCOPE for campaign #75 and is neither verified nor implied.',
  'No UI verification and no live AI-chat verification were performed.',
  'NO synthetic data was created: this campaign issued zero writes of any kind, so there is no QA-VERIFY-* cleanup to perform.',
  'No source file was modified and nothing was committed or deployed.',
];
d.attempts[d.attempts.length - 1].outcome = 'FAIL (completed, fully executed)';
d.last_checkpoint_at = new Date().toISOString();
fs.writeFileSync(P, JSON.stringify(d, null, 1));
console.log('FINAL index.ts sha256:', sha);
console.log('SHA INTACT:', d.sha_intact_at_end);
