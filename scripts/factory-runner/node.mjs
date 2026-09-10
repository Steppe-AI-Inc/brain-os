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

/**
 * Prove this node can reach the control plane, link by link.
 *
 * Each check is separate because each fails for a different reason and has a different fix: a missing
 * variable is a setup step, a refused superuser is a role choice, a missing table is an unapplied schema,
 * and a denied SELECT is a missing grant. "Not OK" would make all four look the same.
 */
export async function health() {
  const lines = [];
  let ok = true;
  const say = (good, label, detail) => {
    if (!good) ok = false;
    lines.push((good ? '  ok   ' : '  FAIL ') + label + (detail ? '  — ' + detail : ''));
  };

  // 1. The variable. Its ABSENCE is the designed refusal, so it is reported as a setup step and not as a
  // fault: nothing is broken, the node has simply not been told which database to use.
  const url = process.env.FACTORY_RUNNER_PG_URL || db.FACTORY_RUNNER_PG_URL || "";
  if (!url) {
    console.log("factory node health");
    console.log("  FAIL FACTORY_RUNNER_PG_URL is not set");
    console.log("");
    console.log("  This is the designed refusal, not a fault. The runner has no fallback: the mechanism it");
    console.log("  replaced worked by silently borrowing whatever production credential the machine held.");
    console.log("  Set an explicit least-privilege connection — see FACTORY_CONTROL_PLANE_SETUP.md §9.");
    return { ok: false, reason: "no-url" };
  }

  // Identify the connection WITHOUT exposing it. A health command that echoes its credential leaves one
  // in a scrollback buffer and, eventually, in a screenshot.
  let host = "?", database = "?", sslmode = "(none)";
  try {
    const u = new URL(url);
    host = u.hostname + (u.port ? ":" + u.port : "");
    database = u.pathname.replace(/^\//, "") || "?";
    sslmode = u.searchParams.get("sslmode") || "(none)";
  } catch { /* pg will reject it below */ }
  console.log("factory node health");
  console.log("  node    " + nodeId());
  console.log("  host    " + host);
  console.log("  db      " + database);
  console.log("  sslmode " + sslmode);
  console.log("");

  // TLS is FATAL for a remote host and ADVISORY for loopback. A connection to 127.0.0.1 does not cross a
  // network, so there is nothing for TLS to protect; a connection to anything else does. Treating both the
  // same made a healthy local node report NOT HEALTHY, and — worse — made a missing TLS on a REMOTE host
  // look like the same routine noise.
  const loopback = /^(127\.|\[?::1\]?$|localhost$)/.test(host);
  const tlsOn = sslmode === "require" || sslmode === "verify-full";
  if (loopback) {
    lines.push((tlsOn ? "  ok   " : "  note ") + "TLS " + (tlsOn ? "is requested" : "not requested, and not needed")
      + " — this is a loopback connection, which does not cross a network");
  } else {
    say(tlsOn, "TLS is requested for a REMOTE host",
      tlsOn ? "" : "sslmode=" + sslmode + " — add ?sslmode=require; a shared control plane is reached over a network");
  }

  // 2. Connection, identity and privilege, in one round trip.
  let who = null;
  try {
    const r = await db.read("select current_user usr, current_database() db, version() v");
    who = r.rows[0];
    say(true, "connected as " + who.usr + " to " + who.db);
    say(true, String(who.v).split(",")[0]);
  } catch (e) {
    say(false, "cannot connect", String(e && e.message || e).slice(0, 160));
    console.log(lines.join("\n"));
    return { ok: false, reason: "connect" };
  }

  // 3. Not a superuser. db.mjs refuses one before connecting, so reaching here already proves the URL is
  // not `postgres` — but a role can be a superuser under another name, and that is worth saying out loud.
  try {
    const su = await db.read("select rolsuper from pg_roles where rolname = current_user");
    say(su.rows.length > 0 && su.rows[0].rolsuper === false,
      "the connected role is NOT a superuser",
      su.rows.length && su.rows[0].rolsuper ? "it is — least privilege pointed at a superuser is not least privilege" : "");
  } catch { say(true, "superuser status not readable (the role cannot read pg_roles, which is itself fine)"); }

  // 4. The schema is applied and readable.
  const TABLES = ["nodes", "work_orders", "work_order_dependencies", "agent_runs", "surface_locks", "checkpoints"];
  try {
    const t = await db.read(
      "select table_name from information_schema.tables where table_schema = 'factory'");
    const found = t.rows.map((r) => r.table_name);
    const missing = TABLES.filter((x) => !found.includes(x));
    say(missing.length === 0, "the factory schema is present (" + found.length + " tables)",
      missing.length ? "missing: " + missing.join(", ") + " — apply 001_factory_control_plane.sql" : "");
  } catch (e) { say(false, "cannot read the factory schema", String(e && e.message || e).slice(0, 120)); }

  // 5. It can actually DO its job: read the queue, and write its own registration.
  try {
    const q = await db.read("select count(*)::int n from factory.work_orders");
    say(true, "can read the queue (" + q.rows[0].n + " work order(s))");
  } catch (e) { say(false, "cannot read the queue", String(e && e.message || e).slice(0, 120)); }

  try {
    await registerNode({ nodeId: nodeId(), capabilities: capabilities(), platform: process.platform,
      agentVersion: process.version });
    const n = await db.read("select count(*)::int n from factory.nodes");
    say(true, "registered itself (" + n.rows[0].n + " node(s) known to this control plane)");
  } catch (e) { say(false, "cannot register", String(e && e.message || e).slice(0, 120)); }

  console.log(lines.join("\n"));
  console.log("");
  console.log(ok ? "HEALTHY — this node can claim work." : "NOT HEALTHY — see the failing line above.");
  return { ok, host, database };
}
if (process.argv[1] && /node\.mjs$/.test(process.argv[1])) {
  const cmd = process.argv[2] || 'start';
  if (cmd === 'id') { console.log(nodeId()); }
  else if (cmd === 'health') { const r = await health(); process.exit(r.ok ? 0 : 1); }
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
    console.log('usage: node node.mjs [start [--once] | health | id | capabilities]');
    process.exit(2);
  }
}
