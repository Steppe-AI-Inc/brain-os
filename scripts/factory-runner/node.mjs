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
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import { registerNode, claimWork, heartbeat, checkpoint, completeRun, DEFAULT_LEASE_SECONDS } from './claim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
// FACTORY_STATE_DIR lets a second node (a rehearsal, an acceptance) live beside this checkout's real node without sharing
// its id, status or pid files. Unset, it is the checkout's own .factory/.
const STATE_DIR = process.env.FACTORY_STATE_DIR ? resolve(process.env.FACTORY_STATE_DIR) : join(REPO_ROOT, '.factory');
const NODE_ID_FILE = join(STATE_DIR, 'node-id');

const git = (args, cwd = REPO_ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

/** The security role this node registers with: FACTORY_NODE_ROLE, validated, default generic. Not a machine
 *  name - a Work PC is the verifier because its operator SAID so at bootstrap, and the plane's record enforces it. */
export function nodeRole() {
  const r = (process.env.FACTORY_NODE_ROLE || 'generic').trim();
  if (!['generic', 'verifier', 'release_broker'].includes(r)) {
    throw new Error('FACTORY_NODE_ROLE must be generic | verifier | release_broker (got ' + JSON.stringify(r) + ')');
  }
  return r;
}

/** How often an idle node stamps its own record, and how old a stamp may be before `status` calls the node STALE. */
export const NODE_BEAT_MS = Math.max(1000, Number(process.env.FACTORY_NODE_BEAT_MS) || 60_000);
export const NODE_STALE_MS = Math.max(2000, Number(process.env.FACTORY_NODE_STALE_MS) || 3 * 60_000);

/** Stamp this node's record on the plane. DML only; the row must already exist (registerNode). */
export async function nodeBeat(id) {
  await db.write('update factory.nodes set last_heartbeat_at = now() where node_id = $1', [id]);
}

/**
 * READ-ONLY liveness, for a supervisor, an operator, or a fresh shell after a reboot: is the node this checkout owns
 * alive on the plane? Reads the row registerNode/nodeBeat wrote; registers nothing; prints no URL.
 * @returns {Promise<{state:'ALIVE'|'STALE'|'NOT REGISTERED'|'UNREACHABLE', ageMs:number|null, role:string|null, host:string|null, tls:boolean|null, plane:string}>}
 */
export async function nodeStatus() {
  const id = nodeId();
  let plane = '?';
  try { plane = new URL(process.env.FACTORY_RUNNER_PG_URL || '').hostname; } catch { /* judged by db.mjs */ }
  try {
    const r = await db.read(
      "select security_role, platform, last_heartbeat_at, extract(epoch from (now() - last_heartbeat_at)) * 1000 as age_ms from factory.nodes where node_id = $1", [id]);
    let tls = null;
    try { tls = (await db.withClient((c) => c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()'))).rows[0].ssl === true; } catch { tls = null; }
    if (!r.rows.length) return { state: 'NOT REGISTERED', ageMs: null, role: null, host: null, tls, plane, nodeId: id };
    const row = r.rows[0];
    const ageMs = Number(row.age_ms);
    return { state: ageMs < NODE_STALE_MS ? 'ALIVE' : 'STALE', ageMs, role: row.security_role, host: String(row.platform || '').split(' ')[1] || null, tls, plane, nodeId: id, lastHeartbeatAt: row.last_heartbeat_at };
  } catch (e) {
    return { state: 'UNREACHABLE', ageMs: null, role: null, host: null, tls: null, plane, nodeId: id, error: String(e && e.message || e).slice(0, 160) };
  }
}

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
  // Facts about THIS node that a work order may require: the Factory's own acceptance work (only real supervised nodes
  // carry it - the test workers register a different capability), and the node's identity, so an acceptance work order
  // can be addressed to one node (the takeover half of a failover). Still checkable answers, not a typed list.
  caps.push('factory_acceptance');
  caps.push('node:' + nodeId());
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

  // THE ROLE IS STATED BY THE ENVIRONMENT AND ENFORCED FROM THE PLANE'S NODE RECORD. Before this, every start
  // re-registered the node as `generic`, so a Work PC bootstrapped as the verifier was silently demoted the first
  // time it started - and the claim would then have refused it verifier work while looking healthy.
  await registerNode({ nodeId: id, capabilities: caps, securityRole: nodeRole(), platform: process.platform + ' ' + hostname(), agentVersion: process.version });
  const log = (m) => console.log('[' + id.slice(0, 13) + '] ' + m);
  log('security role ' + nodeRole() + ' (FACTORY_NODE_ROLE); host ' + hostname());
  log('registered; capabilities ' + JSON.stringify(caps) + '; head ' + String(repo.head).slice(0, 8));

  // THE NODE SAYS WHICH PROVIDER AND MODEL IT INTENDS TO RUN, AT CLAIM TIME (Factory V1 milestone 6). Without this the
  // claim's assurance gate never fires on a real node and the no-silent-fallback constraints compare against null - a
  // verifier round could be handed to a model with no run evidence, and any actual model would pass as "requested".
  // Read from the environment, stated in the log, never guessed: FACTORY_MODEL_PROVIDER / FACTORY_MODEL.
  const requestedProvider = process.env.FACTORY_MODEL_PROVIDER || null;
  const requestedModel = process.env.FACTORY_MODEL || null;
  log(requestedModel ? 'intends ' + (requestedProvider || '?') + ' / ' + requestedModel + ' (FACTORY_MODEL); the claim gates verifier work on its run evidence'
    : 'no FACTORY_MODEL set: claims carry no requested model, so the assurance gate and the no-silent-fallback constraints do not apply to this node');
  let claimed = 0;
  // AN IDLE NODE IS VISIBLY ALIVE. Before this, the node record was touched only at registration, so a node that ran for
  // days with nothing to claim looked dead on the plane (2026-09-22: last heartbeat four days old while nothing was wrong
  // but the absence of a worker after a reboot - two facts one timestamp could not tell apart). Every NODE_BEAT_MS the
  // idle loop stamps last_heartbeat_at; `node.mjs status` reads it back.
  let lastBeat = Date.now();
  for (let i = 0; i < maxIterations; i++) {
    const run = await claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel });
    if (!run) {
      if (once) { log('nothing eligible'); break; }
      if (Date.now() - lastBeat >= NODE_BEAT_MS) {
        try { await nodeBeat(id); lastBeat = Date.now(); } catch (e) { log('node heartbeat failed: ' + String(e && e.message || e).slice(0, 100)); }
      }
      await new Promise((r) => setTimeout(r, idleMs));
      continue;
    }
    claimed++;
    log('claimed work order ' + String(run.work_order_id).slice(0, 8) + ' as run ' + String(run.run_id).slice(0, 8));
    const stopBeat = startHeartbeat({ runId: run.run_id, id, leaseSeconds });
    try {
      // The work order itself: its type decides whether a checkout is needed. A factory_acceptance work order has no code
      // to check out, and the 2026-09-22 acceptances left twelve full worktrees behind before this distinction existed.
      const woRow = (await db.read('select work_type, title, handoff, owned_surface, requires_security_role from factory.work_orders where work_order_id = $1', [run.work_order_id])).rows[0] || {};
      let wt = null;
      if (woRow.work_type !== 'factory_acceptance') {
        wt = await worktree({ runId: run.run_id, baseCommit: repo.head });
        log((wt.recovered ? 'recovered' : 'created') + ' worktree ' + wt.path);
        await db.write(
          'update factory.agent_runs set worktree = $2, branch = $3, base_commit = $4, updated_at = now() where run_id = $1',
          [run.run_id, wt.path, wt.branch, repo.head]);
      }

      const result = await runWork({ run, workOrder: woRow, worktree: wt, nodeId: id, log,
        checkpoint: (location, scenario, payload) =>
          checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location, scenario, payload }) });

      // THE TERMINAL CONDITION COMES FROM THE WORKER, and where the worker reports none the fallback NAMES
      // THAT ABSENCE rather than claiming a clean finish. completeRun requires the field; defaulting it to
      // 'completed' here would move the invention one layer up and lose exactly the distinction the column
      // exists for. The 2026-08-24 failures were eight HTTP 200s whose bodies never terminated, and a runner
      // that writes 'completed' because its worker said nothing reproduces that defect in a new place.
      const finished = result && result.status === 'failed' ? 'failed' : 'done';
      await completeRun({
        runId: run.run_id, status: finished,
        summary: result && result.summary, headCommit: result && result.headCommit,
        terminationReason: (result && result.terminationReason)
          || (finished === 'failed' ? 'worker_reported_failure_without_a_terminal_condition'
            : 'worker_reported_success_without_a_terminal_condition'),
        actualProvider: result && result.actualProvider,
        actualModel: result && result.actualModel,
        fallbackReason: result && result.fallbackReason,
        usage: result && result.usage,
      });
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
  const tlsOn = sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full";
  if (loopback) {
    lines.push((tlsOn ? "  ok   " : "  note ") + "TLS " + (tlsOn ? "is requested" : "not requested, and not needed")
      + " — this is a loopback connection, which does not cross a network");
  } else {
    say(tlsOn, "TLS is requested for a REMOTE host",
      tlsOn ? "" : "sslmode=" + sslmode + " — add ?sslmode=require; a shared control plane is reached over a network");
  }

  // 1b. The driver this node needs, installed at its locked version. Checked BEFORE connecting, because a missing `pg`
  // otherwise surfaces as "cannot connect - Cannot find package" - a connection fault in the wording of a packaging one
  // (2026-09-24: a fresh clone of a branch with no package-lock.json).
  {
    const { checkDependencies, describe: describeDeps } = await import("./deps.mjs");
    const deps = checkDependencies();
    say(deps.ok, deps.ok ? describeDeps(deps) : "runtime dependencies are not installed at their locked versions", deps.ok ? "" : describeDeps(deps));
    if (!deps.ok) { console.log(lines.join("\n")); return { ok: false, reason: "dependencies" }; }
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
    await registerNode({ nodeId: nodeId(), capabilities: capabilities(), securityRole: nodeRole(),
      platform: process.platform + ' ' + hostname(), agentVersion: process.version });
    const n = await db.read("select count(*)::int n from factory.nodes");
    say(true, "registered itself as " + nodeRole() + " (" + n.rows[0].n + " node(s) known to this control plane)");
  } catch (e) { say(false, "cannot register", String(e && e.message || e).slice(0, 120)); }

  // ---- the repository this node would work in -------------------------------------------------------
  try {
    const repo = reconcileRepository({ fetch: false });
    say(!!repo.head, "repository at " + String(repo.head).slice(0, 8) + " on " + repo.branch
      + (repo.dirty ? " (uncommitted changes present)" : ""));
    // GITHUB IS THE DURABLE RECOVERY TRUTH, so a node that cannot reach a remote cannot recover work if
    // the control plane is lost. That is not fatal — it can still do work — but it must be SAID.
    let remote = "";
    try { remote = execFileSync("git", ["remote"], { cwd: REPO_ROOT, encoding: "utf8" }).trim(); } catch { remote = ""; }
    if (remote) lines.push("  ok   GitHub recovery is available (remote: " + remote.split("\n")[0] + ")");
    else lines.push("  note no git remote — this node can work, but cannot RECOVER work from GitHub if the"
      + " control plane is lost");
  } catch (e) { say(false, "cannot read the repository", String(e && e.message || e).slice(0, 120)); }

  // ---- PostgreSQL version as a CHECKED FLOOR, not a printed string ----------------------------------
  // The schema needs gen_random_uuid(), core since 13. Printing the version tells you nothing unless
  // something compares it to what the schema requires.
  try {
    const v = await db.read("select current_setting('server_version_num')::int n");
    const num = v.rows[0].n;
    say(num >= 130000, "PostgreSQL is new enough (" + Math.floor(num / 10000) + ")",
      num < 130000 ? "the schema needs gen_random_uuid(), core since 13" : "");
  } catch (e) { say(false, "cannot read the server version", String(e && e.message || e).slice(0, 100)); }

  // ---- THIS MUST NOT BE BRAIN OS --------------------------------------------------------------------
  // The realistic mistake is not a typo. It is pointing a node at the database that is already
  // configured, and that database is the product.
  try {
    const biz = await db.read(
      "select table_schema, table_name from information_schema.tables where table_name = any($1::text[])",
      [["companies", "people", "profiles", "goals", "tasks", "memories", "agents", "person_assignments"]]);
    say(biz.rows.length === 0, "this database holds NO Brain OS business tables",
      biz.rows.length ? "found " + biz.rows.length + " (" + biz.rows.slice(0, 3).map((r) => r.table_schema + "." + r.table_name).join(", ")
        + ") — this looks like the PRODUCT database, not a control plane" : "");
    // NOT NAMED IN SQL. The accessor forbids the literal migration-history table name, and it cannot
    // tell a catalog READ from a history WRITE by reading the text — so it refuses both, which is the
    // right direction for a rule about privilege. The names are matched here instead.
    const PLATFORM = ["auth", "storage", "realtime", "supabase" + "_migrations", "_realtime"];
    const all = await db.read("select nspname from pg_namespace");
    const supa = all.rows.map((r) => r.nspname).filter((n) => PLATFORM.includes(n));
    if (supa.length) lines.push("  note platform schemas present (" + supa.join(", ")
      + ") — acceptable only if this is a dedicated non-production project");
  } catch (e) { say(false, "cannot check for business tables", String(e && e.message || e).slice(0, 100)); }

  // ---- no ambient fallback, checked STRUCTURALLY ---------------------------------------------------
  //
  // The first version searched db.mjs for the phrase "supabase db query --linked" and found it — inside
  // the REFUSAL MESSAGE that names the mechanism being replaced. A guard cannot tell a mechanism from a
  // description of one by searching for its name, and this repository has now paid for that lesson four
  // times.
  //
  // The unambiguous property: the accessor reaches PostgreSQL over a socket, so it spawns NOTHING. No
  // child_process, no execFile, no spawn. A file that shells out to anything is not this file, whatever
  // its strings say.
  try {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "db.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
    const spawns = /(from|require\()\s*['"]node:child_process['"]|\b(execFileSync|execFile|spawnSync|spawn|execSync)\s*\(/.test(code);
    say(!spawns, "the accessor spawns no process, so it cannot borrow an ambient credential",
      spawns ? "db.mjs starts a child process — the only way back to an ambient CLI credential" : "");
  } catch { lines.push("  note could not read db.mjs to confirm it spawns nothing"); }
  // ---- what is actually happening on this control plane ---------------------------------------------
  try {
    const active = await db.read(
      "select count(*) filter (where lease_expires_at > now())::int live,"
      + " count(*) filter (where lease_expires_at is not null and lease_expires_at <= now())::int stale,"
      + " count(*) filter (where node_id = $1 and lease_expires_at > now())::int mine"
      + " from factory.agent_runs where status = 'in_progress'", [nodeId()]);
    const a = active.rows[0];
    lines.push("  ok   active claims: " + a.live + " live (" + a.mine + " on this node)");
    // A stale lease is not an error — it is the recovery path working — but a PERSISTENT one means no
    // node is claiming, and that is worth seeing before it is a morning surprise.
    if (Number(a.stale) > 0) lines.push("  note " + a.stale + " expired lease(s) awaiting takeover"
      + " — normal briefly; persistent means nothing is claiming");
    else lines.push("  ok   no stale leases");
  } catch (e) { say(false, "cannot read claims and leases", String(e && e.message || e).slice(0, 100)); }
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
  else if (cmd === 'status') {
    const s = await nodeStatus();
    const age = s.ageMs == null ? '' : ' (heartbeat ' + Math.round(s.ageMs / 1000) + ' s ago)';
    console.log(s.state + age + ' — node ' + s.nodeId.slice(0, 13) + (s.role ? ', role ' + s.role : '') + (s.host ? ', host ' + s.host : '')
      + ', plane ' + s.plane + (s.tls == null ? '' : ', tls ' + (s.tls ? 'on' : 'OFF')) + (s.error ? ' — ' + s.error : ''));
    if (process.argv.includes('--json')) console.log(JSON.stringify(s));
    process.exit(s.state === 'ALIVE' ? 0 : 1);
  }
  else if (cmd === 'start') {
    const { factoryAcceptance } = await import('./handlers/factory-acceptance.mjs');
    await nodeStart({
      runWork: async ({ run, workOrder, checkpoint: cp, nodeId: nid, log: l }) => {
        // The Factory's own acceptance work is the one thing the generic bootstrap runs itself (handlers/factory-acceptance.mjs).
        if (workOrder && workOrder.work_type === 'factory_acceptance') return factoryAcceptance({ run, workOrder, checkpoint: cp, nodeId: nid, log: l });
        // No provider is launched by the default bootstrap: what a node DOES is the director's business,
        // and wiring a specific agent in here would be the machine-specific logic this file forbids.
        await cp('qa/verification/CHECKPOINT.md', 'bootstrap');
        return { status: 'done', summary: 'bootstrap claimed and released work order ' + run.work_order_id };
      },
      once: process.argv.includes('--once'),
    });
  } else {
    console.log('usage: node node.mjs [start [--once] | health | status [--json] | id | capabilities]');
    process.exit(2);
  }
}
