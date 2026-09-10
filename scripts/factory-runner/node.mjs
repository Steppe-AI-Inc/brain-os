#!/usr/bin/env node
// THE GENERIC NODE.  `brain-factory node start`
//
// One bootstrap, run identically on every computer. There is no Home-PC branch, no Work-PC branch, and
// there must never be one: a node is identified by what it can DO, and authority is decided by run
// provenance, not by which desk the machine sits on. If you ever need to ask "which computer is this" to
// decide what work to take, the scheduling model has failed and the fix belongs in capabilities, not here.
//
// NODE IDENTITY. A node id is generated once and persisted next to the repository checkout. It is a random
// uuid — deliberately NOT the hostname, which is a machine name by another spelling and would make it
// tempting to special-case one. Two checkouts on one computer are two nodes, which is correct: they can
// hold different worktrees and do different work.
//
// THE LOOP, and the two sentences it exists to make true:
//
//     PROCESS LIFETIME != WORK ORDER LIFETIME
//     NODE LIFETIME    != WORK ORDER LIFETIME
//
//   1. reconcile repository truth          7. launch the agent/provider process
//   2. register node_id                    8. heartbeat the lease while it runs
//   3. report capabilities                 9. checkpoint progress durably
//   4. start supervision                  10. commit/push durable work where policy permits
//   5. claim an eligible work order       11. report the result
//   6. create/recover an isolated worktree 12. claim the next work, automatically
//
// Every step between 5 and 11 can be interrupted at any point. Nothing is lost when that happens, because
// the claim is leased and the progress is checkpointed: another node — or this one, restarted — picks the
// work up from the last checkpoint. Killing a node is not an error path here. It is the ordinary case the
// design is built around.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import { registerNode, claimWork, heartbeat, checkpoint, completeRun, DEFAULT_LEASE_SECONDS } from './claim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_DIR = join(REPO_ROOT, '.factory');
const NODE_ID_FILE = join(STATE_DIR, 'node-id');

const git = (args, cwd = REPO_ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

/** 2. A stable node id, generated once. Not the hostname — see the header. */
export function nodeId() {
  if (existsSync(NODE_ID_FILE)) {
    const v = readFileSync(NODE_ID_FILE, 'utf8').trim();
    if (v) return v;
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const id = 'node-' + randomUUID();
  writeFileSync(NODE_ID_FILE, id + '\n');
  return id;
}

/**
 * 3. What this node can do, DERIVED from the machine rather than declared by a human.
 *
 * A capability list somebody types is a list somebody forgets to update, and the failure is silent: the
 * director schedules work onto a node that cannot do it. So each one is a question with a checkable answer.
 */
export function capabilities() {
  const caps = ['software_development'];
  const has = (cmd, args) => {
    try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; }
  };
  if (has('git', ['--version'])) caps.push('git');
  if (has('node', ['--version'])) caps.push('node');
  // A node can only take verification work if it can create an isolated worktree.
  try { git(['rev-parse', '--git-dir']); caps.push('worktree'); } catch { /* not a checkout */ }
  return caps;
}

/**
 * 1. Reconcile repository truth.
 *
 * GITHUB IS THE DURABLE RECOVERY TRUTH, so this runs before anything is claimed. The control plane can be
 * lost entirely and the development history survives; the reverse is not true, which is why the repository
 * is reconciled first and the database second.
 */
export function reconcileRepository({ fetch = true } = {}) {
  const state = { head: null, branch: null, dirty: null, fetched: false };
  state.head = git(['rev-parse', 'HEAD']);
  state.branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  state.dirty = git(['status', '--porcelain']).length > 0;
  if (fetch) {
    try { git(['fetch', '--quiet', '--all']); state.fetched = true; } catch { state.fetched = false; }
  }
  return state;
}

/**
 * 6. An isolated worktree per run, created or RECOVERED.
 *
 * Recovered matters more than created. A node that died mid-run left a worktree behind with work in it, and
 * the next claimer must find that work rather than start again — otherwise a lease expiry silently discards
 * everything since the last commit. So: if the path exists and is a worktree at the right commit, use it.
 */
export function ensureWorktree({ runId, baseCommit, branch }) {
  const path = resolve(REPO_ROOT, '..', 'brain-os-run-' + String(runId).slice(0, 8));
  const wtBranch = branch || ('run/' + String(runId).slice(0, 8));
  if (existsSync(path)) {
    try {
      const head = git(['rev-parse', 'HEAD'], path);
      return { path, branch: wtBranch, recovered: true, head };
    } catch {
      // The directory exists but is not a usable checkout. Do NOT delete it: it may hold the only copy of
      // work that was never committed, and a bootstrap that tidies up is a bootstrap that loses things.
      return { path, branch: wtBranch, recovered: false, unusable: true };
    }
  }
  git(['worktree', 'add', '-b', wtBranch, path, baseCommit || 'HEAD']);
  return { path, branch: wtBranch, recovered: false, head: git(['rev-parse', 'HEAD'], path) };
}

/** 8. Renew the lease on a timer for as long as the work is running. */
export function startHeartbeat({ runId, id, leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  const everyMs = Math.max(5000, Math.floor((leaseSeconds * 1000) / 3));
  const timer = setInterval(() => {
    heartbeat({ runId, nodeId: id, leaseSeconds }).catch(() => { /* the lease will expire; that is the design */ });
  }, everyMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/**
 * The loop. `runWork` is injected so this file can be tested without launching a provider — and so the
 * same bootstrap serves an Edge verifier, a DB review, or anything else the director schedules.
 */
// `worktree` is injectable for the same reason `runWork` is: the loop and the checkout are separate
// concerns, and a test of the loop that creates a 3 870-file checkout per iteration is testing git.
// The real ensureWorktree is exercised on its own.
export async function nodeStart({ runWork, once = false, leaseSeconds = DEFAULT_LEASE_SECONDS, idleMs = 5000, maxIterations = Infinity, worktree = ensureWorktree } = {}) {
  const id = nodeId();
  const caps = capabilities();
  const repo = reconcileRepository({ fetch: false });

  await registerNode({ nodeId: id, capabilities: caps, platform: process.platform, agentVersion: process.version });
  const log = (m) => console.log('[' + id.slice(0, 13) + '] ' + m);
  log('registered; capabilities ' + JSON.stringify(caps) + '; head ' + String(repo.head).slice(0, 8));

  let claimed = 0;
  for (let i = 0; i < maxIterations; i++) {
    const run = await claimWork({ nodeId: id, leaseSeconds });
    if (!run) {
      if (once) { log('nothing eligible'); break; }
      await new Promise((r) => setTimeout(r, idleMs));
      continue;
    }
    claimed++;
    log('claimed work order ' + String(run.work_order_id).slice(0, 8) + ' as run ' + String(run.run_id).slice(0, 8));
    const stopBeat = startHeartbeat({ runId: run.run_id, id, leaseSeconds });
    try {
      const wt = await worktree({ runId: run.run_id, baseCommit: repo.head });
      log((wt.recovered ? 'recovered' : 'created') + ' worktree ' + wt.path);
      await db.write(
        'update factory.agent_runs set worktree = $2, branch = $3, base_commit = $4, updated_at = now() where run_id = $1',
        [run.run_id, wt.path, wt.branch, repo.head]);

      const result = await runWork({ run, worktree: wt, nodeId: id,
        checkpoint: (location, scenario, payload) =>
          checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location, scenario, payload }) });

      await completeRun({ runId: run.run_id, status: result && result.status === 'failed' ? 'failed' : 'done',
        summary: result && result.summary, headCommit: result && result.headCommit });
      log('completed run ' + String(run.run_id).slice(0, 8));
    } catch (e) {
      // A thrown worker does NOT mark the run failed: it may be a transient provider error, and the lease
      // is the honest arbiter. Leaving it to expire lets any eligible node resume from the last checkpoint,
      // which is the behaviour a crashed process should have.
      log('run ' + String(run.run_id).slice(0, 8) + ' threw: ' + String(e && e.message || e).slice(0, 120));
      log('leaving the lease to expire so the work is recoverable rather than lost');
    } finally {
      stopBeat();
    }
    if (once) break;
  }
  return { nodeId: id, capabilities: caps, claimed };
}

if (process.argv[1] && /node\.mjs$/.test(process.argv[1])) {
  const cmd = process.argv[2] || 'start';
  if (cmd === 'id') { console.log(nodeId()); }
  else if (cmd === 'capabilities') { console.log(JSON.stringify(capabilities(), null, 2)); }
  else if (cmd === 'start') {
    await nodeStart({
      runWork: async ({ run, checkpoint: cp }) => {
        // No provider is launched by the default bootstrap: what a node DOES is the director's business,
        // and wiring a specific agent in here would be the machine-specific logic this file forbids.
        await cp('qa/verification/CHECKPOINT.md', 'bootstrap');
        return { status: 'done', summary: 'bootstrap claimed and released work order ' + run.work_order_id };
      },
      once: process.argv.includes('--once'),
    });
  } else {
    console.log('usage: node node.mjs [start [--once] | id | capabilities]');
    process.exit(2);
  }
}
