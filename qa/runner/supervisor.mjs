#!/usr/bin/env node
// ============================================================================
// BRAIN OS - WORK-PC AUTONOMOUS QA SUPERVISOR
//
// Turn on the Work PC, do nothing, QA continues.
//
// This is a real long-running process, not documentation. It holds an exclusive lease,
// decides what to test from repository state, launches Fable 5 QA Directors programmatically,
// watches them, and - the load-bearing behaviour - RE-EVALUATES AND RELAUNCHES when one exits.
//
// The single most important rule in this file:
//
//     A Claude turn ending is a WORKER LIFECYCLE EVENT.
//     It is NOT a statement that the QA program is complete.
//
// Everything else is bookkeeping around that.
// ============================================================================
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { P, RUNNER_DIR, REPO_ROOT, QA_BRANCH } from './lib/paths.mjs';
import { readState, writeState, transition, heartbeat, nowIso } from './lib/state.mjs';
import { acquireLease, renewLease, releaseLease } from './lib/lease.mjs';
import { readWorld, selectNextWork, summarise } from './lib/scheduler.mjs';
import { launchDirector, EXPECTED_CANONICAL_MODEL } from './lib/director.mjs';
import { ensureLaunchConfigs } from './lib/config.mjs';
import { checkNetwork, repoState, deployedBuild } from './lib/env.mjs';

const pexec = promisify(execFile);

const OPTS = {
  once: process.argv.includes('--once'),
  dryRun: process.argv.includes('--dry-run'),
  pollMs: 60_000,
  heartbeatMs: 20_000,
  maxBackoffMs: 15 * 60_000,
};

if (!existsSync(P.logsDir)) mkdirSync(P.logsDir, { recursive: true });
const LOG = join(P.logsDir, 'supervisor.log');

function log(level, msg, extra) {
  const line = [nowIso(), level, msg, extra ? JSON.stringify(extra) : ''].filter(Boolean).join(' ');
  try { appendFileSync(LOG, line + '\n'); } catch {}
  console.log(line);
}

let LEASE_ID = null;
let STOPPING = false;
let currentDirectorPid = null;

// --- backoff -----------------------------------------------------------------
// One shared bounded backoff for every transient condition (network, auth, launch failure).
// Without it a failing launch becomes a rapid relaunch loop that burns budget and fills the
// log with identical errors - the classic autonomous-agent failure, and explicitly called out
// as unacceptable in the charter.
let consecutiveFailures = 0;
const backoffMs = () => Math.min(OPTS.maxBackoffMs, 30_000 * Math.pow(2, Math.max(0, consecutiveFailures - 1)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function interruptibleSleep(ms) {
  const step = 5_000;
  let waited = 0;
  while (waited < ms && !STOPPING) {
    await sleep(Math.min(step, ms - waited));
    waited += step;
    if (LEASE_ID && !renewLease(LEASE_ID)) {
      log('WARN', 'Lease lost while idle - another supervisor took leadership. Standing down.');
      STOPPING = true;
    }
  }
}

// --- git ---------------------------------------------------------------------
async function git(args, timeout = 60_000) {
  try {
    const { stdout } = await pexec('git', args, { cwd: REPO_ROOT, timeout, windowsHide: true, maxBuffer: 8e6 });
    return { ok: true, out: stdout.trim() };
  } catch (e) { return { ok: false, err: (e.stderr || e.message || '').slice(0, 400) }; }
}

/**
 * Commit and push whatever QA evidence the director left behind.
 *
 * The director is instructed to push its own work, but a director that crashed, hung or ran out
 * of budget will not have. Losing that evidence to a later `git checkout` would be worse than a
 * messy commit, so the supervisor sweeps it up. It only ever touches qa/ paths.
 */
async function checkpointQaArtifacts(reason) {
  const status = await git(['status', '--porcelain', '--', 'qa']);
  if (!status.ok || !status.out) return { committed: false, reason: 'nothing to commit' };

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.ok && branch.out !== QA_BRANCH) {
    // Refuse to sweep QA artefacts onto a non-QA branch. Silently committing evidence to master
    // would violate the branch-ownership model the founder asked to be reconciled, not fixed.
    log('WARN', 'Not on ' + QA_BRANCH + ' (on ' + branch.out + ') - skipping supervisor checkpoint', {});
    return { committed: false, reason: 'wrong branch: ' + branch.out };
  }

  await git(['add', '--', 'qa']);
  const msg = 'qa(supervisor): checkpoint - ' + reason + '\n\n'
    + 'Swept up by the autonomous supervisor after a director invocation ended without pushing\n'
    + 'its own evidence. Committed so the work is not lost; the next director resumes from it.\n\n'
    + 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>';
  const c = await git(['commit', '-m', msg]);
  if (!c.ok) return { committed: false, reason: c.err };
  const push = await git(['push', 'origin', QA_BRANCH], 120_000);
  const sha = await git(['rev-parse', '--short', 'HEAD']);
  return { committed: true, pushed: push.ok, sha: sha.ok ? sha.out : null, push_error: push.ok ? null : push.err };
}

// --- main cycle --------------------------------------------------------------
async function cycle() {
  // 1. Network. Not a test failure - an environment condition.
  const net = await checkNetwork();
  if (!net.ok) {
    consecutiveFailures++;
    transition('WAITING_FOR_NETWORK', {
      last_error: 'No network reachable', last_error_at: nowIso(),
      retry_count: consecutiveFailures,
      next_action: 'Waiting for network. QA work is QUEUED, not failed - no capability may be marked FAIL for this.',
    });
    log('WARN', 'Network unreachable - backing off', { checks: net.checks, backoff_ms: backoffMs() });
    await interruptibleSleep(backoffMs());
    return;
  }

  // 2. Repository + deployed build.
  const repo = await repoState();
  const build = await deployedBuild();
  const prev = readState();

  const newBuild = build.edge_function_version
    && String(build.edge_function_version) !== String(prev.deployed_edge_function_version ?? '');
  const newMaster = repo.origin_master_sha && repo.origin_master_sha !== prev.latest_origin_master_sha;

  if (newBuild || newMaster) {
    transition(newBuild ? 'NEW_BUILD_DETECTED' : 'FIX_REPORT_DETECTED', {
      latest_origin_master_sha: repo.origin_master_sha || prev.latest_origin_master_sha,
      deployed_edge_function_version: build.edge_function_version ?? prev.deployed_edge_function_version ?? null,
      deployed_build_source: build.source,
      next_action: 'New build/commit detected - re-establish provenance and prioritise retests against it.',
    });
    log('INFO', 'Build or master changed', {
      new_build: newBuild, new_master: newMaster,
      edge_version: build.edge_function_version, master: (repo.origin_master_sha || '').slice(0, 8),
    });
  }

  // 3. Refresh the coverage ledger so the scheduler reads current arithmetic, not a stale file.
  try {
    await pexec(process.execPath, [P.computeCoverage], { cwd: REPO_ROOT, timeout: 60_000, windowsHide: true });
  } catch (e) {
    log('WARN', 'compute-coverage failed (continuing on last ledger)', { err: String(e.message).slice(0, 200) });
  }

  // 4. Decide what to do. This is where "Fable exited" does NOT mean "QA finished".
  const world = readWorld();
  const summary = summarise(world);
  const work = selectNextWork(world, {
    deployedSha: build.deployed_product_sha || null,
    lastTestedDeployedSha: prev.last_tested_deployed_sha || null,
  });

  log('INFO', 'Scheduler selected work', { kind: work.kind, priority: work.priority, label: work.label, summary });

  if (work.state === 'WAITING_FOR_DEPLOYMENT') {
    transition('WAITING_FOR_DEPLOYMENT', {
      next_action: work.label,
      last_heartbeat: nowIso(),
    });
    await interruptibleSleep(OPTS.pollMs * 5);
    return;
  }

  if (OPTS.dryRun) {
    log('INFO', 'DRY RUN - would launch director', { directive: work.directive.slice(0, 300) });
    transition('WATCHING', { next_action: work.label });
    return;
  }

  // 5. Launch.
  const governor = prev.resource_governor || {};
  transition(work.state === 'RETEST_STARTING' ? 'RETEST_STARTING' : 'QA_STARTING', {
    next_action: work.label,
    current_work_kind: work.kind,
    current_work_label: work.label,
    campaign_id: world.campaignQueue?.campaign_id || prev.campaign_id || 'C002',
    last_director_start: nowIso(),
  });

  const started = Date.now();
  const outcome = await launchDirector({
    directive: work.directive,
    maxBudgetUsd: governor.max_director_budget_usd ?? 12,
    hardCapMs: (governor.max_campaign_runtime_minutes_before_checkpoint ?? 90) * 60_000 * 1.35,
    onHeartbeat: ({ idle_ms, elapsed_ms }) => {
      heartbeat({ qa_director_idle_ms: idle_ms, qa_director_elapsed_ms: elapsed_ms });
      if (LEASE_ID) renewLease(LEASE_ID);
    },
    onEvent: (ev) => {
      if (ev.kind === 'init') {
        writeState({
          qa_director_browser_available: ev.mcp_ok,
          qa_director_tool_count: ev.tools,
        });
        if (!ev.mcp_ok) {
          log('WARN', 'Director started WITHOUT Playwright MCP - browser verification is unavailable this shift');
        }
      }
    },
  });

  currentDirectorPid = outcome.pid;
  writeState({
    qa_director_pid: outcome.pid,
    qa_director_session_id: outcome.session_id,
    supervisor_state: 'QA_RUNNING',
  });

  log('INFO', 'Director exited', {
    exit_code: outcome.exit_code, killed: outcome.killed_reason, is_error: outcome.is_error,
    model: outcome.canonical_model, cost_usd: outcome.total_cost_usd, turns: outcome.num_turns,
    browser: outcome.mcp_ok, minutes: Math.round((Date.now() - started) / 60000),
  });

  // 6. Model assertion. A silent fallback to a different model is not a Fable run and must not
  //    be recorded as one - the charter names Fable 5 specifically.
  if (outcome.canonical_model && outcome.canonical_model !== EXPECTED_CANONICAL_MODEL) {
    log('WARN', 'Director did not run on the expected model', {
      expected: EXPECTED_CANONICAL_MODEL, actual: outcome.canonical_model,
    });
  }

  // 7. Auth failure gets its own state - crash-looping against an expired login is pure waste.
  if (outcome.auth_failure) {
    consecutiveFailures++;
    transition('BLOCKED_CLAUDE_AUTH', {
      last_error: 'Claude authentication failed: ' + (outcome.stderr_tail || outcome.result_text || '').slice(0, 300),
      last_error_at: nowIso(), retry_count: consecutiveFailures,
      next_action: 'BLOCKED - CLAUDE AUTHENTICATION REQUIRED. Run `claude` once on this machine and log in. '
        + 'The supervisor keeps retrying on a bounded backoff and resumes automatically once auth works.',
    });
    log('ERROR', 'BLOCKED - CLAUDE AUTHENTICATION REQUIRED', { backoff_ms: backoffMs() });
    await interruptibleSleep(backoffMs());
    return;
  }

  // 8. Checkpoint. Sweep up evidence the director did not push itself.
  transition('QA_CHECKPOINTING', {});
  const cp = await checkpointQaArtifacts(work.label.slice(0, 120));
  if (cp.committed) log('INFO', 'Supervisor checkpointed leftover QA evidence', cp);

  const qaSha = await git(['rev-parse', 'HEAD']);

  const abnormal = outcome.killed_reason || outcome.exit_code !== 0 || outcome.is_error === true;
  if (abnormal) {
    consecutiveFailures++;
    transition('RECOVERING', {
      last_error: outcome.killed_reason || ('exit=' + outcome.exit_code)
        + (outcome.result_text ? ' :: ' + outcome.result_text.slice(0, 200) : ''),
      last_error_at: nowIso(),
      retry_count: consecutiveFailures,
      qa_artifact_sha: qaSha.ok ? qaSha.out : null,
      next_action: 'Director ended abnormally. Recovering from persisted repository state - NOT repeating '
        + 'the last mutation blindly; the next director re-reads fixture and DB state before acting.',
    });
    log('WARN', 'Abnormal director exit - recovering', { failures: consecutiveFailures, backoff_ms: backoffMs() });

    if (consecutiveFailures >= (governor.retry_ceiling ?? 3)) {
      // Ceiling reached: pause, but keep the work QUEUED. A resource/retry pause must never be
      // allowed to look like a completed or passing run.
      transition('PAUSED_RESOURCE_LIMIT', {
        next_action: 'Retry ceiling reached (' + consecutiveFailures + '). Work remains QUEUED, never PASS. '
          + 'Cooling down before the next attempt.',
      });
      await interruptibleSleep((governor.cooldown_minutes_between_idle_exploratory_campaigns ?? 30) * 60_000);
      consecutiveFailures = 0;
      return;
    }
    await interruptibleSleep(backoffMs());
    return;
  }

  // 9. Clean exit. This is the branch that must NOT conclude "QA finished".
  consecutiveFailures = 0;
  writeState({
    supervisor_state: 'WATCHING',
    last_successful_checkpoint: nowIso(),
    last_tested_deployed_sha: build.deployed_product_sha || prev.last_tested_deployed_sha || null,
    deployed_edge_function_version: build.edge_function_version ?? prev.deployed_edge_function_version ?? null,
    qa_artifact_sha: qaSha.ok ? qaSha.out : null,
    qa_director_pid: null,
    last_director_cost_usd: outcome.total_cost_usd,
    last_director_turns: outcome.num_turns,
    next_action: 'Director shift ended cleanly. Re-consulting the scheduler - a finished turn is not a '
      + 'finished QA program.',
  });
  log('INFO', 'Director shift complete - re-consulting scheduler (NOT treating this as QA complete)');
}

// --- lifecycle ---------------------------------------------------------------
async function main() {
  const cfg = ensureLaunchConfigs();
  if (!cfg.hookExists) {
    log('ERROR', 'Safety hook missing - refusing to run unattended', { expected: cfg.hookPath });
    process.exit(3);
  }

  const lease = acquireLease();
  if (!lease.ok) {
    log('ERROR', 'LEASE DENIED - another supervisor holds leadership. Standing down.', lease.holder);
    console.error('LEASE_DENIED');
    process.exit(4);
  }
  LEASE_ID = lease.id;
  if (lease.tookOver) log('WARN', 'Took over a stale lease', lease.tookOver);

  transition('STARTING', {
    supervisor_pid: process.pid,
    supervisor_lease_id: LEASE_ID,
    supervisor_started_at: nowIso(),
    retry_count: 0, last_error: null, last_error_at: null,
    _bootstrap_note: undefined,
  });
  log('INFO', 'Supervisor STARTING', { pid: process.pid, lease: LEASE_ID, once: OPTS.once, dry_run: OPTS.dryRun });

  const renewer = setInterval(() => {
    if (LEASE_ID && !renewLease(LEASE_ID)) { log('WARN', 'Lease lost - standing down'); STOPPING = true; }
    heartbeat();
  }, OPTS.heartbeatMs);

  const shutdown = (sig) => {
    if (STOPPING) return;
    STOPPING = true;
    log('INFO', 'Shutdown signal received', { sig });
    try { transition('STOPPED_BY_POLICY', { supervisor_pid: null, next_action: 'Supervisor stopped (' + sig + '). QA work remains QUEUED.' }); } catch {}
    clearInterval(renewer);
    releaseLease(LEASE_ID);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  while (!STOPPING) {
    try {
      await cycle();
    } catch (err) {
      consecutiveFailures++;
      log('ERROR', 'Cycle threw', { err: String(err && err.stack || err).slice(0, 800) });
      try {
        transition('ERROR', {
          last_error: String(err && err.message || err).slice(0, 400), last_error_at: nowIso(),
          retry_count: consecutiveFailures,
          next_action: 'Supervisor cycle error. Retrying on bounded backoff; QA work remains QUEUED.',
        });
      } catch {}
      await interruptibleSleep(backoffMs());
    }
    if (OPTS.once) break;
    if (!STOPPING) await interruptibleSleep(5_000);
  }

  clearInterval(renewer);
  releaseLease(LEASE_ID);
  transition('STOPPED_BY_POLICY', { supervisor_pid: null });
  log('INFO', 'Supervisor stopped');
}

main().catch((e) => {
  log('ERROR', 'Fatal', { err: String(e && e.stack || e).slice(0, 1000) });
  try { releaseLease(LEASE_ID); } catch {}
  process.exit(1);
});
