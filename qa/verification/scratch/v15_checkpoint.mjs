// Verifier #15 checkpoint writer. Usage:
//   node qa/verification/scratch/v15_checkpoint.mjs init
//   node qa/verification/scratch/v15_checkpoint.mjs set <scenario> <status> <evidence...>
import fs from 'node:fs';

const P = 'qa/verification/CURRENT_CAMPAIGN.json';
const read = () => JSON.parse(fs.readFileSync(P, 'utf8'));
const write = (d) => fs.writeFileSync(P, JSON.stringify(d, null, 1));
const now = () => new Date().toISOString();

const [, , cmd, ...rest] = process.argv;
const d = read();

if (cmd === 'init') {
  d.started_at = now();
  d.actual_head_commit_at_start = '32f18917710308ccf9e3627a73a124935153a347';
  d.head_vs_base_note =
    'HEAD 32f1891 is 2 commits after base d724d8c (f651b76 campaign rotation, 32f1891 ' +
    'checkpoint). git diff d724d8c..HEAD touches ONLY qa/verification/* bookkeeping. ' +
    'supabase/functions/sem-ai-command/index.ts is BYTE-IDENTICAL at d724d8c and at HEAD ' +
    '(both sha256 1b291f37...ef64), verified via `git show d724d8c:<path> | sha256sum`. ' +
    'Source under test is unambiguous.';
  d.index_ts_sha256_observed_at_start =
    '1b291f370d285ae79844c7f363a3959d2c668ab5d368a69805b0c9a16227ef64';
  d.sha_baseline_match = true;
  d.status = 'RUNNING';
  d.attempt_count = 2;
  d.attempts.push({
    attempt: 2,
    started_at: now(),
    outcome: 'IN_PROGRESS',
    note: 'Verifier #15 attempt 2. Attempt 1 blocked pre-baseline with zero scenarios ' +
          'completed, so this starts at scenario 0 legitimately.',
  });
  d.scenarios = {
    s0_d106_matcher_attack: { status: 'PENDING' },
    s1_sha_full_battery: { status: 'PENDING' },
    s2_independent_mutation: { status: 'PENDING' },
    s3_drift_belt_corpora: { status: 'PENDING' },
    s4_d100_corroboration: { status: 'PENDING' },
    s5_d102_raw_fallback_misbind: { status: 'PENDING' },
    s6_no_prior_closure_reopened: { status: 'PENDING' },
    s7_question_belt_both_axes: { status: 'PENDING' },
    s8_absent_branch_lexical_judgement: { status: 'PENDING' },
    s9_ledger_bookkeeping_truth: { status: 'PENDING' },
    sF_founder_directed_lexical_branch_verdict: { status: 'PENDING' },
  };
} else if (cmd === 'set') {
  const [scenario, status, ...ev] = rest;
  d.scenarios[scenario] = d.scenarios[scenario] || {};
  d.scenarios[scenario].status = status;
  if (ev.length) {
    d.scenarios[scenario].evidence = ev.join(' ');
  }
  d.scenarios[scenario].checkpointed_at = now();
} else if (cmd === 'merge') {
  // merge a JSON blob from a file into scenarios
  const blob = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
  Object.assign(d.scenarios, blob);
} else if (cmd === 'field') {
  d[rest[0]] = rest.slice(1).join(' ');
}

d.last_checkpoint_at = now();
write(d);
console.log('checkpoint updated:', cmd, rest[0] ?? '');
