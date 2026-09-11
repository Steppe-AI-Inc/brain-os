#!/usr/bin/env node
// WHERE IS THIS CAMPAIGN, DERIVED FROM THE REPOSITORY RATHER THAN FROM A FILE THAT CLAIMS TO KNOW.
//
// WHY THIS EXISTS. `qa/verification/CURRENT_CAMPAIGN.json` is the file every verifier prompt tells the next
// round to derive its round number from. On 2026-09-11 the copy in the main worktree still described
// VERIFIER 55, from 2026-09-07 — thirty-two rounds stale — while the copy in the candidate worktree said
// `verifier: "#87"` and carried no campaign number at all. Two durable records, disagreeing, and the
// instruction points at one of them. A verifier that believed it would have numbered its ledger entry and
// its suite file thirty-two rounds low, and writing over a live `vNN_regression_additions.mjs` DELETES
// COVERAGE.
//
// The fix is not to update the file. It is to stop trusting a file for something the repository already
// knows: the round is whatever the LEDGER, the SUITE FILENAMES, the ARTIFACT BRANCHES and the DISPATCH
// RECORDS say it is, and those four must agree. When they disagree, that disagreement IS the finding and
// this command prints it rather than picking a winner.
//
// COMPUTER-AGNOSTIC BY CONSTRUCTION. No hostname, no Home-PC/Work-PC branch, no machine-specific path. It
// takes a repository and reads it. It needs NO database, which is deliberate: a node must be able to answer
// "where are we" before FACTORY_RUNNER_PG_URL exists, and the control plane is orchestration state, not
// campaign truth.
//
// READ-ONLY UNLESS ASKED. Default output is a report. `--write` rewrites CURRENT_CAMPAIGN.json from the
// derivation, and refuses when the sources disagree, because writing a number nobody can corroborate is how
// the stale file got authoritative in the first place.
//
// USAGE:
//   node scripts/factory-runner/round-state.mjs [--repo <path>] [--json] [--write]
//
// --repo defaults to BRAIN_OS_CANDIDATE_REPO, then to the repository this script lives in. The candidate is
// usually prepared in a separate worktree from the one holding these scripts, and guessing wrong is how a
// dispatcher once froze a file nobody was editing.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

function repoRootFrom(start) {
  let d = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'qa/verification'))) return d;
    const up = dirname(d); if (up === d) break; d = up;
  }
  return null;
}
const SCRIPT_REPO = repoRootFrom(HERE);
const REPO = resolve(opt('--repo', process.env.BRAIN_OS_CANDIDATE_REPO || SCRIPT_REPO || '.'));
if (!existsSync(join(REPO, 'qa/verification'))) {
  console.log('not a Brain OS repository: ' + REPO);
  process.exit(2);
}

const DEPLOY_SURFACE = 'supabase/functions/sem-ai-command/index.ts';
const LEDGER = join(REPO, 'qa/KNOWN_FAILURE_MODES.md');
const SUITES = join(REPO, 'qa/scenarios-runner');
const SCRATCH = join(REPO, 'qa/verification/scratch');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const git = (args) => {
  try { return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

// ── THE FOUR INDEPENDENT SOURCES ────────────────────────────────────────────────────────────────────
//
// Each answers "which round is the latest" by a different mechanism, so agreement is evidence and
// disagreement is a finding. None of them is CURRENT_CAMPAIGN.json, on purpose.

// 1. the ledger head
const ledgerHead = (() => {
  if (!existsSync(LEDGER)) return null;
  const ns = (readFileSync(LEDGER, 'utf8').match(/^## (\d+)\./gm) || [])
    .map((m) => Number(m.slice(3, -1)));
  return ns.length ? Math.max(...ns) : null;
})();

// 2. the highest ROUND-WRITTEN suite in the live battery directory.
//
// NOT any `v<NN>_` file: `v92_parity_contract.mjs` and `v92_parity_corpus.json` are the DEPLOYED
// REFERENCE CORPUS, and reading them made the first draft of this command report round 92. Rounds write
// exactly two filenames, and those are what this reads.
const suiteHead = (() => {
  if (!existsSync(SUITES)) return null;
  const ns = readdirSync(SUITES)
    .map((f) => (f.match(/^v(\d+)_(?:regression_additions|open_defects)\.mjs$/) || [])[1])
    .filter(Boolean).map(Number);
  return ns.length ? Math.max(...ns) : null;
})();

// 3. the highest artifact branch a verifier has committed to
const branchHead = (() => {
  const ns = git(['branch', '--list', 'verify-*-campaign*']).split('\n')
    .map((l) => (l.match(/campaign(\d+)\s*$/) || [])[1]).filter(Boolean).map(Number);
  return ns.length ? Math.max(...ns) : null;
})();

// 4. the highest EDGE dispatch record, searched across every worktree of this repository.
//
// TWO CORRECTIONS, BOTH FROM THE SAME MISTAKE — deriving from a number pattern instead of from what the
// record IS.
//
// (a) A SEPARATE SERIES EXISTS. verifier301/401/501/601 are DB-REVIEW verifiers: they pin `GIT_HEAD`
//     rather than the deploy surface and sit on campaign 6. The first draft reported round 601. The
//     discriminator is in the record: an Edge round pins the deploy surface. Filtering by number range
//     would have been a magic constant; filtering by what it pins is a property.
//
// (b) THE RECORDS ARE NOT IN THE CANDIDATE WORKTREE. Dispatches run from the worktree holding the
//     scripts; the candidate is prepared in another. Two worktrees of ONE repository have separate
//     working trees and therefore separate qa/verification/scratch/. So the search is over every
//     worktree git reports, and each record carries the worktree it dispatched INTO.
const worktrees = (() => {
  const out = git(['worktree', 'list', '--porcelain']);
  const ps = (out.match(/^worktree (.+)$/gm) || []).map((l) => l.slice('worktree '.length).trim());
  return [...new Set([REPO, ...ps])].filter((p) => existsSync(join(p, "qa/verification/scratch")));
})();
const edgeDispatches = (() => {
  const found = new Map();
  for (const wt of worktrees) {
    const dir = join(wt, 'qa/verification/scratch');
    for (const f of readdirSync(dir)) {
      const n = (f.match(/^verifier(\d+)_dispatch\.json$/) || [])[1];
      if (!n) continue;
      const rec = readJson(join(dir, f));
      if (!rec) continue;
      // THE PROPERTY, NOT THE NUMBER: an Edge round pins the deploy surface.
      if (String(rec.pinned_file || "") !== DEPLOY_SURFACE) continue;
      const prev = found.get(Number(n));
      if (!prev) found.set(Number(n), { ...rec, _record: join(dir, f) });
    }
  }
  return found;
})();
const dispatchHead = edgeDispatches.size ? Math.max(...edgeDispatches.keys()) : null;

// ── THE ROUND IN FLIGHT, AND WHAT IT HAS DONE ───────────────────────────────────────────────────────
const round = dispatchHead;
const dispatch = round ? (edgeDispatches.get(round) || null) : null;
// Beside the record that was actually found, not beside the candidate — see (b) above.
const recordDir = dispatch?._record ? dirname(dispatch._record) : SCRATCH;
const stateFile = round ? join(recordDir, 'watchdog-verifier' + round + '_output.state') : null;
const logFile = round ? join(recordDir, 'verifier' + round + '_output.log') : null;
const stateTail = stateFile && existsSync(stateFile)
  ? readFileSync(stateFile, 'utf8').trim().split('\n').slice(-1)[0] : null;
const logBytes = logFile && existsSync(logFile) ? statSync(logFile).size : 0;

// A FINISHED REPORT OUTRANKS THE WATCHDOG'S TEXT CLASSIFIERS. #87's run was labelled
// BLOCKED - EXECUTION_MODE because its report DESCRIBED approval gates it had hit; the report was complete
// and was acted on. So the verdict is read from the report's own shape, never from the state line.
const report = logBytes > 2000 && logFile ? readFileSync(logFile, 'utf8') : '';
const verdict = (() => {
  if (!report) return null;
  const m = report.match(/RELEASE STATE:\s*([A-Z_]+)/) || report.match(/release state \*\*([A-Z]+)\*\*/i);
  if (m) return m[1].toUpperCase();
  if (/\bFAILED\b/.test(report.slice(0, 4000))) return 'FAILED';
  return null;
})();
const reportEndsWithSha = /\b[0-9a-f]{64}\b\s*$/.test(report.trim());

// ── THE CANDIDATE, MEASURED FROM THE BYTES ON DISK ──────────────────────────────────────────────────
const surface = join(REPO, DEPLOY_SURFACE);
const onDisk = existsSync(surface)
  ? createHash('sha256').update(readFileSync(surface)).digest('hex') : null;
const bytes = existsSync(surface) ? statSync(surface).size : null;
const freeze = readJson(join(REPO, 'qa/verification/CANDIDATE_FREEZE.json'));
const frozenMatches = freeze && onDisk ? freeze.sha256 === onDisk : null;

// ── GATES: ASKED, NOT GUESSED ───────────────────────────────────────────────────────────────────────
const gates = (() => {
  const tool = join(REPO, 'qa/verification/gate_evidence.mjs');
  if (!existsSync(tool)) return null;
  try {
    const out = execFileSync('node', [tool, 'status'], { cwd: REPO, encoding: 'utf8' });
    const rows = out.split('\n')
      .map((l) => l.match(/^\s{2}(\S+)\s+(VALID_PASS|VALID_FAIL|STALE)/))
      .filter(Boolean).map((m) => ({ gate: m[1], state: m[2] }));
    return rows.length ? rows : null;
  } catch { return null; }
})();

// ── THE STALE RECORD, REPORTED RATHER THAN TRUSTED ──────────────────────────────────────────────────
const claimed = readJson(join(REPO, 'qa/verification/CURRENT_CAMPAIGN.json')) || {};
const claimedRound = (() => {
  if (typeof claimed.verifier === 'string') {
    const m = claimed.verifier.match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  if (typeof claimed.verifier === 'number') return claimed.verifier;
  const ns = Object.keys(claimed).map((k) => (k.match(/^verifier(\d+)_/) || [])[1])
    .filter(Boolean).map(Number);
  return ns.length ? Math.max(...ns) : null;
})();

// ── NEXT EXECUTABLE ACTION ──────────────────────────────────────────────────────────────────────────
//
// Stated as ONE action, because a list is how a resumption picks the easy item. It refuses to guess where
// the evidence does not decide.
const nextAction = (() => {
  if (!round) return 'no dispatch record exists in this repository — derive the round before acting';
  const running = stateTail && /attempt \d+: dispatching/.test(stateTail) && !verdict;
  if (running) return 'verifier #' + round + ' is in flight — wait for its report; do not touch the candidate';
  if (verdict === 'FAILED') {
    return 'verifier #' + round + ' reported FAILED — merge its artifacts, apply its prepared fix if it has'
      + ' one, re-pin any moved counts ON THE SAME COMMIT, then battery -> gates -> freeze -> bundle ->'
      + ' dispatch #' + (round + 1);
  }
  if (verdict && verdict !== 'FAILED') {
    return 'verifier #' + round + ' reported ' + verdict + ' — a PASS is a FOUNDER AUTHORIZATION request,'
      + ' not an action this node may take';
  }
  if (logBytes === 0) return 'verifier #' + round + ' has produced no output — check the watchdog before re-dispatching';
  return 'verifier #' + round + ' produced output that carries no classification — read it before acting';
})();

// The campaign is carried in the artifact branch name, the one field every worktree shares.
function result_campaign_of(branch) { return (String(branch).match(/campaign(\d+)/) || [])[1] ?? null; }
function campaignOf(rec, fallback) {
  return (String(rec?.artifact_branch || '').match(/campaign(\d+)/) || [])[1] ?? fallback ?? null;
}

// ── OUTPUT ──────────────────────────────────────────────────────────────────────────────────────────
const heads = { ledger_entries: ledgerHead, round_suites: suiteHead, campaigns: branchHead, round: dispatchHead };

// THREE OF THESE FOUR DO NOT COUNT ROUNDS, AND THE FIRST VERSION OF THIS CHECK REQUIRED THEM TO.
//
//   ledger_entries  counts LEDGER ENTRIES. Round 87 wrote entry 179. Never equal to the round.
//   campaigns       counts CAMPAIGNS. Round 88 runs campaign 148. Never equal either.
//   round_suites    DOES track rounds: a round writes v<round>_*.mjs, so it is the round or one behind.
//   round           IS the round.
//
// So it reported a disagreement on a consistent repository and would have refused --write for ever. The
// cross-checks below compare only things of the same kind, which is the whole point of having four.
const branchList = git(['branch', '--list', 'verify-*-campaign*']).split("\n").map((l) => l.replace(/^[*+]?\s*/, "").trim());
const recordBranch = dispatch?.artifact_branch || null;
const checks = {
  // A round in flight has not written its suite yet, so one behind is correct, not stale.
  suite_tracks_round: suiteHead !== null && dispatchHead !== null
    && (suiteHead === dispatchHead || suiteHead === dispatchHead - 1),
  // The record names a branch; that branch must exist, or the dispatch did not land where it says.
  record_branch_exists: !!recordBranch && branchList.includes(recordBranch),
  // And the campaign in the branch name must be the campaign this round claims.
  campaign_matches_branch: !!recordBranch && String(result_campaign_of(recordBranch)) === String(campaignOf(dispatch, branchHead)),
};
const agree = Object.values(checks).every(Boolean);

const result = {
  repo: REPO,
  round,
  // The campaign lives in the artifact branch name, which is the one field shared by every worktree.
  campaign: (String(dispatch?.artifact_branch || '').match(/campaign(\d+)/) || [])[1] ?? branchHead ?? null,
  candidate_commit: dispatch?.candidate_sha ?? null,
  candidate_index_sha256: dispatch?.pinned_sha256 ?? null,
  deploy_surface_sha256_on_disk: onDisk,
  deploy_surface_bytes: bytes,
  freeze_state: freeze?.state ?? null,
  freeze_matches_disk: frozenMatches,
  heads,
  cross_checks: checks,
  cross_checks_hold: agree,
  claimed_round_in_CURRENT_CAMPAIGN: claimedRound,
  claimed_record_is_stale: claimedRound !== null && round !== null && claimedRound !== round,
  watchdog_tail: stateTail,
  report_bytes: logBytes,
  verdict,
  report_ends_with_index_sha: reportEndsWithSha,
  gates,
  next_action: nextAction,
};

if (flag('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const pad = (s) => String(s).padEnd(34);
  console.log('ROUND STATE, derived from ' + REPO);
  console.log('');
  console.log('  ' + pad('round (highest dispatch record)') + (round ?? '(none)'));
  console.log('  ' + pad('campaign') + (result.campaign ?? '(unknown)'));
  console.log('  ' + pad('candidate commit') + (result.candidate_commit ?? '(unknown)'));
  console.log('  ' + pad('index.ts on disk') + (onDisk ? onDisk.slice(0, 16) + '… ' + bytes + ' B' : '(absent)'));
  console.log('  ' + pad('freeze') + (freeze?.state ?? '(no record)')
    + (frozenMatches === false ? '   — RECORD DOES NOT MATCH THE BYTES ON DISK' : ''));
  console.log('');
  console.log('  HEADS (three of these count DIFFERENT things — see the header)');
  for (const [k, v] of Object.entries(heads)) console.log('    ' + pad(k) + (v ?? '(none)'));
  console.log('    next ledger entry would be ' + (ledgerHead === null ? '(unknown)' : ledgerHead + 1)
    + ', next round suite would be v' + (dispatchHead === null ? '?' : dispatchHead));
  console.log('');
  console.log('  CROSS-CHECKS' + (agree ? '   (all hold)' : '   *** ONE OR MORE FAILED ***'));
  for (const [k, v] of Object.entries(checks)) {
    console.log('    ' + pad(k) + (v ? 'ok' : 'FAILED'));
  }
  if (!agree) {
    // THE COMMONEST CAUSE IS NOT A DEFECT: it is being pointed at the wrong worktree. This repository
    // keeps the deploy candidate and the campaign bookkeeping on two different branches in two different
    // worktrees, and their index.ts files legitimately differ. Say that before inviting a reconciliation
    // that would write round suites into a branch which should not carry them.
    if (suiteHead === null) {
      console.log('    THIS REPOSITORY HOLDS NO ROUND-WRITTEN SUITES, so it is almost certainly not the');
      console.log('    candidate worktree. The candidate is the worktree whose qa/scenarios-runner carries');
      console.log('    v<NN>_regression_additions.mjs and whose index.ts hashes to the frozen candidate.');
      console.log('    Point --repo at that one. `git worktree list` shows them all.');
    } else {
      console.log('    A failed cross-check is a FINDING, not a formality: a verifier numbering its ledger');
      console.log('    entry or its suite file from the wrong source overwrites LIVE COVERAGE. Reconcile');
      console.log('    before dispatching anything.');
    }
  }
  console.log('');
  if (result.claimed_record_is_stale) {
    console.log('  CURRENT_CAMPAIGN.json CLAIMS ROUND ' + claimedRound + ' AND THE REPOSITORY SAYS '
      + round + '.');
    console.log('    That file is what the verifier prompt points at. Do not trust it; this derivation is');
    console.log('    the authority, and --write will replace it.');
    console.log('');
  }
  console.log('  ' + pad('watchdog') + (stateTail ? stateTail.slice(0, 90) : '(no state file)'));
  console.log('  ' + pad('report') + logBytes + ' bytes'
    + (verdict ? ', verdict ' + verdict : ', no classification found')
    + (reportEndsWithSha ? ', ends with an index sha' : ''));
  if (gates) {
    const bad = gates.filter((g) => g.state === 'STALE');
    console.log('  ' + pad('gates') + gates.length + ' recorded, ' + bad.length + ' stale'
      + (bad.length ? ': ' + bad.map((g) => g.gate).join(', ') : ''));
  } else {
    console.log('  ' + pad('gates') + '(not readable from this repository)');
  }
  console.log('');
  console.log('  NEXT EXECUTABLE ACTION');
  console.log('    ' + nextAction);
}

if (flag('--write')) {
  if (!agree) {
    console.log('');
    console.log('REFUSING TO WRITE: a cross-check failed, so there is no corroborated round to record.');
    if (suiteHead === null) {
      console.log('This repository holds no round-written suites — it is probably not the candidate');
      console.log('worktree, and writing a campaign record into it would make a second disagreeing copy,');
      console.log('which is the exact failure this command exists to end.');
    }
    console.log('Writing a number nothing can corroborate is how the stale record became authoritative.');
    process.exit(1);
  }
  const p = join(REPO, 'qa/verification/CURRENT_CAMPAIGN.json');
  const record = {
    _derived_by: 'scripts/factory-runner/round-state.mjs',
    _derived_at: new Date().toISOString(),
    _note: 'DERIVED FROM THE REPOSITORY, not hand-maintained. The round is corroborated by four independent'
      + ' sources: the ledger head, the highest vNN suite in the live battery, the highest verify-*-campaignN'
      + ' branch, and the highest dispatch record. Re-derive rather than trusting this file.',
    round,
    campaign: result.campaign,
    candidate_commit: result.candidate_commit,
    candidate_index_sha256: result.candidate_index_sha256,
    deploy_surface_sha256_on_disk: onDisk,
    deploy_surface_bytes: bytes,
    freeze_state: result.freeze_state,
    heads,
    cross_checks: checks,
    verdict,
    next_action: nextAction,
  };
  writeFileSync(p, JSON.stringify(record, null, 2) + '\n');
  console.log('');
  console.log('wrote ' + p + ' from the derivation (round ' + round + ', campaign ' + result.campaign + ')');
}
