#!/usr/bin/env node
// EVERY ROW HERE PINS A MISTAKE THE FIRST DRAFT OF round-state.mjs ACTUALLY MADE.
//
// It was written, run, and reported: round 601, campaign 6, suite head 92, and *** DISAGREE *** on a
// repository that is perfectly consistent. Four errors, one cause — deriving from a number's SIZE instead of
// from what the number MEANS:
//
//   1. `v92_parity_contract.mjs` is the DEPLOYED REFERENCE CORPUS, not round 92.
//   2. verifier301/401/501/601 are a SEPARATE SERIES of DB-review verifiers that pin GIT_HEAD.
//   3. dispatch records live in the worktree that RAN the dispatch, not the one holding the candidate.
//   4. the ledger counts ENTRIES and the branch counts CAMPAIGNS; neither has ever equalled the round.
//
// A regression test that only checked "it prints a number" would have passed on all four.
//
// THIS TEST READS THE REAL REPOSITORY, and says so rather than passing vacuously when it cannot. Fixtures
// would need a git repository with worktrees and two parallel verifier series, and a fixture that elaborate
// is a second implementation of the thing under test.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CMD = join(HERE, 'round-state.mjs');
const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};

const run = (args) => {
  try { return { rc: 0, out: execFileSync('node', [CMD, ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { rc: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

// The two worktrees this repository actually keeps: the deploy candidate, and the campaign bookkeeping.
const CANDIDATE = 'C:/Users/Dell/dev/brain-os-wo-resolver';
const BOOKKEEPING = 'C:/Users/Dell/dev/brain-os';

check('RS-C0 the command exists and both worktrees are present to read',
  existsSync(CMD) && existsSync(CANDIDATE) && existsSync(BOOKKEEPING),
  'without both worktrees this test cannot distinguish the candidate case from the wrong-repo case, and a'
  + ' pass would mean nothing');
if (failures.length) { console.log(NL + 'round-state.regression.test: ' + pass + ' passed, ' + failures.length + ' failed');
  console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }

const cand = run(['--repo', CANDIDATE, '--json']);
let J = null;
try { J = JSON.parse(cand.out); } catch { /* reported by the row below */ }

check('RS-C1 the candidate worktree yields machine-readable state',
  J !== null && typeof J.round === 'number',
  'exit ' + cand.rc + ', first 200 chars: ' + JSON.stringify(cand.out.slice(0, 200)));

if (J) {
  // 1. the suite head must come from round-written suites, never from the v92 reference corpus.
  check('RS-C2 the suite head is a ROUND suite, not the v92 reference corpus',
    J.heads.round_suites !== 92 && J.heads.round_suites !== null
      && Math.abs(J.heads.round_suites - J.round) <= 1,
    'round_suites=' + J.heads.round_suites + ' round=' + J.round
      + ' — v92_parity_contract.mjs is the DEPLOYED reference corpus; reading it reported round 92');

  // 2. the DB-review series must not be mistaken for an Edge round.
  check('RS-C3 the round is an EDGE round, not one of the DB-review series (301/401/501/601)',
    J.round < 300,
    'round=' + J.round + ' — those records pin GIT_HEAD rather than the deploy surface, and the first draft'
      + ' of this command reported round 601 on campaign 6');

  // 3. the record must have been found across worktrees, and must name the deploy candidate.
  check('RS-C4 the dispatch record was found and names a candidate commit and an index sha',
    /^[0-9a-f]{40}$/.test(String(J.candidate_commit))
      && /^[0-9a-f]{64}$/.test(String(J.candidate_index_sha256)),
    'commit=' + J.candidate_commit + ' index=' + J.candidate_index_sha256
      + ' — dispatch records live in the worktree that RAN the dispatch, not beside the candidate');

  // 4. the cross-checks must compare comparable things, so a consistent repository must pass them.
  check('RS-C5 a consistent candidate worktree passes every cross-check',
    J.cross_checks_hold === true,
    JSON.stringify(J.cross_checks) + ' — the first version required the ledger (entries) and the branch'
      + ' (campaigns) to equal the round, which neither has ever done, so it reported DISAGREE for ever');

  // The thing the command exists for.
  check('RS-C6 a stale CURRENT_CAMPAIGN.json is DETECTED rather than believed',
    typeof J.claimed_round_in_CURRENT_CAMPAIGN === 'number'
      && typeof J.claimed_record_is_stale === 'boolean'
      && (J.claimed_record_is_stale === (J.claimed_round_in_CURRENT_CAMPAIGN !== J.round)),
    'claimed=' + J.claimed_round_in_CURRENT_CAMPAIGN + ' derived=' + J.round
      + ' stale=' + J.claimed_record_is_stale);

  // The candidate bytes are measured, not assumed.
  check('RS-C7 the deploy surface is hashed from the bytes on disk',
    /^[0-9a-f]{64}$/.test(String(J.deploy_surface_sha256_on_disk)) && J.deploy_surface_bytes > 100000,
    'sha=' + J.deploy_surface_sha256_on_disk + ' bytes=' + J.deploy_surface_bytes);

  // And it refuses to act while a verifier holds the candidate.
  check('RS-C8 the next action is ONE action and respects a round in flight',
    typeof J.next_action === 'string' && J.next_action.length > 20
      && (J.verdict === null ? /in flight|no output|no classification/.test(J.next_action) : true),
    JSON.stringify(J.next_action));
}

// The wrong-worktree case, which must NAME itself rather than invite a reconciliation.
const book = run(['--repo', BOOKKEEPING]);
check('RS-C9 the bookkeeping worktree is identified as not-the-candidate, by name',
  /HOLDS NO ROUND-WRITTEN SUITES/.test(book.out) && /not the/i.test(book.out),
  'a bare FAILED here invites writing round suites into a branch that must not carry them');

const refuse = run(['--repo', BOOKKEEPING, '--write']);
check('RS-C10 --write REFUSES on a worktree whose cross-checks fail',
  refuse.rc !== 0 && /REFUSING TO WRITE/.test(refuse.out),
  'exit ' + refuse.rc + ' — writing a campaign record into the wrong worktree would create a second'
    + ' disagreeing copy, which is the exact failure this command exists to end');

// Read-only by default: the default invocation must not have written anything.
const before = run(['--repo', CANDIDATE, '--json']);
const after = run(['--repo', CANDIDATE, '--json']);
check('RS-C11 the default invocation is READ-ONLY and repeatable',
  before.out === after.out,
  'two consecutive reports differ, so the command is changing something it only claims to read');

console.log('');
console.log('round-state.regression.test: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
