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
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import { registerNode, claimWork, heartbeat, checkpoint, completeRun, DEFAULT_LEASE_SECONDS } from './claim.mjs';
import { HANDLER_VERSION } from './handlers/factory-acceptance.mjs';

// An error in words: a connection to a host with several addresses fails with an AggregateError whose message is EMPTY -
// its causes are in .errors ("UNREACHABLE - AggregateError" named nothing; verification 2026-09-24, round 3).
const errText = (e) => { if (!e) return String(e); if (e.message) return e.message; if (Array.isArray(e.errors) && e.errors.length) return (e.code ? e.code + ': ' : '') + e.errors.map((x) => (x && x.message) || String(x)).join('; '); return String(e); };
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

/** Stamp this node's record on the plane AND RE-ASSERT ITS ROLE. DML only; the row must already exist (registerNode).
 *  The running worker is the one authority on the node's role (its supervisor's --role, the task's): anything else that wrote the
 *  record - a health check from a plain shell used to demote a running verifier to generic (verification round 4) - is undone
 *  within one beat, and said. @returns {Promise<{found:boolean, was:string|null}>} */
// reg: { capabilities, agentVersion } - the WHOLE registration is re-asserted, not only the role. A script run on the same PC that
// registered the checkout's node id replaced its capabilities (its commit, its handler, factory_acceptance): the node silently stopped
// claiming acceptance work while every check read healthy (final verification 2, 2026-09-25). recordChanged says it happened.
export async function nodeBeat(id, role = nodeRole(), reg = null) {
  // the previous record is read UNDER THE ROW LOCK (for update waits for a concurrent writer and then reads what it committed): a
  // plain self-join read its snapshot, so a demotion committed during the beat was overwritten without being said (final
  // verification 2026-09-24)
  const r = await db.write(
    'with was as (select node_id, security_role, capabilities, agent_version from factory.nodes where node_id = $1 for update) update factory.nodes n set last_heartbeat_at = now(), security_role = $2, capabilities = coalesce($3::jsonb, n.capabilities), agent_version = coalesce($4, n.agent_version) from was where n.node_id = was.node_id returning was.security_role as was, was.capabilities as caps_was, was.agent_version as av_was',
    [id, role, reg ? JSON.stringify(reg.capabilities) : null, reg ? reg.agentVersion : null]);
  const row = r.rows[0];
  return { found: !!row, was: row ? row.was : null,
    recordChanged: !!(row && reg && (JSON.stringify(row.caps_was) !== JSON.stringify(reg.capabilities) || row.av_was !== reg.agentVersion)) };
}

// A PLANE ERROR THAT SAYS NOTHING ABOUT THE CONFIGURATION: the network or the server went away for a moment. One of them used to
// end the worker (an uncaught claim error), and the supervisor's backoff turned a run of 4-second losses into 5-minute outages
// (verification 2026-09-24, round 4). These are retried in the worker; a refusal, a password, a certificate or a missing table is
// not transient - the worker exits and its supervisor (which re-reads runner.env) takes over.
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN',
  '57P01', '57P02', '57P03', '53300', '08000', '08001', '08003', '08006', '25P03', '25P04', '57014']);
export function isTransientPlaneError(e) {
  if (!e || e.name === 'FactoryDbRefusal') return false;
  const codes = [e.code, ...(Array.isArray(e.errors) ? e.errors.map((x) => x && x.code) : [])].filter(Boolean).map(String);
  if (codes.some((c) => TRANSIENT_CODES.has(c))) return true;
  return /timeout expired|Connection terminated|Query read timeout|terminating connection|server closed the connection|socket hang up/i.test(errText(e));
}
/** How long a worker keeps retrying nothing but transient plane errors before it exits to its supervisor. */
export const TRANSIENT_GIVE_UP_MS = Math.max(1000, Number(process.env.FACTORY_TRANSIENT_GIVE_UP_MS) || 5 * 60_000);
async function retryTransient(fn, what, log) {
  let wait = 2000, since = 0;
  for (;;) {
    try {
      const v = await fn();
      if (since) log(what + ': the plane answers again after ' + Math.round((Date.now() - since) / 1000) + ' s of transient errors');
      return v;
    } catch (e) {
      if (!isTransientPlaneError(e)) throw e;
      if (!since) since = Date.now();
      if (Date.now() - since >= TRANSIENT_GIVE_UP_MS) { log(what + ': transient plane errors for ' + Math.round((Date.now() - since) / 1000) + ' s - given up' + (/^(claim|registration)$/.test(what) ? ': the worker exits to its supervisor' : '')); throw e; }
      log(what + ' failed on a transient plane error (' + errText(e).slice(0, 120) + ') - retrying in ' + Math.round(wait / 1000) + ' s');
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(30_000, wait * 2);
    }
  }
}

/**
 * READ-ONLY liveness, for a supervisor, an operator, or a fresh shell after a reboot: is the node this checkout owns
 * alive on the plane? Reads the row registerNode/nodeBeat wrote; registers nothing; prints no URL.
 * @returns {Promise<{state:'ALIVE'|'STALE'|'NOT REGISTERED'|'UNREACHABLE', ageMs:number|null, role:string|null, host:string|null, tls:boolean|null, plane:string}>}
 */
/** This checkout's node id if it has one - never creates it (a read-only status must not mint an identity). */
export function peekNodeId() {
  try { const v = readFileSync(NODE_ID_FILE, 'utf8').trim(); return v || null; } catch { return null; }
}

export async function nodeStatus() {
  const id = peekNodeId();
  let plane = '?';
  try { plane = new URL(process.env.FACTORY_RUNNER_PG_URL || '').hostname; } catch { /* judged by db.mjs */ }
  // no URL in this process is not a fact about the plane: it is said as what it is, not as UNREACHABLE
  if (!process.env.FACTORY_RUNNER_PG_URL) return { state: 'URL NOT SET', ageMs: null, role: null, host: null, tls: null, plane, nodeId: id, error: 'FACTORY_RUNNER_PG_URL is not set in this shell - pass --runner-env <runner.env>, or run install-autostart.ps1 -Status (it reads the task\'s env file)' };
  if (!id) return { state: 'NOT REGISTERED', ageMs: null, role: null, host: null, tls: null, plane, nodeId: null, error: 'this checkout has no node identity yet (' + NODE_ID_FILE + ')' };
  try {
    const r = await db.read(
      "select security_role, platform, capabilities, last_heartbeat_at, extract(epoch from (now() - last_heartbeat_at)) * 1000 as age_ms from factory.nodes where node_id = $1", [id]);
    let tls = null;
    try { tls = (await db.withClient((c) => c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()'))).rows[0].ssl === true; } catch { tls = null; }
    if (!r.rows.length) return { state: 'NOT REGISTERED', ageMs: null, role: null, host: null, tls, plane, nodeId: id };
    const row = r.rows[0];
    const ageMs = Number(row.age_ms);
    let admission = null, claimBusy = null;
    try { admission = JSON.parse(readFileSync(join(STATE_DIR, 'node-admission.json'), 'utf8')); } catch { /* never recorded */ }
    try { claimBusy = JSON.parse(readFileSync(join(STATE_DIR, 'node-claim-busy.json'), 'utf8')); } catch { /* never recorded */ }
    // registered without liveness (a check, or a worker that never completed a claim cycle) starts at the epoch
    const neverBeaten = new Date(row.last_heartbeat_at).getTime() <= 0;
    // the commit the running worker recorded (head:<sha>, and dirty) - -Verify compares it with the checkout
    const caps = Array.isArray(row.capabilities) ? row.capabilities : [];
    const headCap = caps.find((c) => String(c).startsWith('head:'));
    return { state: !neverBeaten && ageMs < NODE_STALE_MS ? 'ALIVE' : 'STALE', ageMs: neverBeaten ? null : ageMs, neverBeaten, head: headCap ? String(headCap).slice(5) : null, dirty: caps.includes('dirty'), role: row.security_role, host: String(row.platform || '').split(' ')[1] || null, tls, plane, nodeId: id, lastHeartbeatAt: neverBeaten ? null : row.last_heartbeat_at, admission, claimBusySince: claimBusy && claimBusy.since ? claimBusy.since : null };
  } catch (e) {
    return { state: 'UNREACHABLE', ageMs: null, role: null, host: null, tls: null, plane, nodeId: id, error: errText(e).slice(0, 160) };
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
  // THE COMMIT THIS NODE RUNS AND THE ACCEPTANCE HANDLER IT CARRIES, as facts a work order can require. Nothing recorded which
  // commit a node ran: a Work PC on an older checkout passed the two-machine acceptance, and completed an action its handler did
  // not know (final verification 2026-09-24). Uncommitted changes to tracked files are said as 'dirty'.
  try { caps.push('head:' + git(['rev-parse', 'HEAD'])); if (git(['status', '--porcelain', '--untracked-files=no']).length) caps.push('dirty'); } catch { /* not a checkout */ }
  caps.push('handler:' + HANDLER_VERSION);
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

/** An orphaned claim's lease, given back: a run of this node in progress that this process does not hold (see nodeStart). */
async function giveBackOrphans(nodeId, mine, log) {
  const r = await db.write(
    "with runs as (update factory.agent_runs set lease_expires_at = now() where node_id = $1 and status = 'in_progress' and lease_expires_at > now()"
    + " and not (run_id = any($2::uuid[])) returning run_id),"
    + " locks as (update factory.surface_locks set lease_expires_at = now() where run_id in (select run_id from runs))"
    + ' select run_id from runs', [nodeId, [...mine]]);
  for (const x of r.rows) log('gave back the lease of run ' + String(x.run_id).slice(0, 8) + ': a claim of this node committed but its reply was lost - the plane requeues it');
}

/** 8. Renew the lease on a timer for as long as the work is running (the heartbeat also stamps the node record - claim.mjs).
 *  Returns { stop, signal }: the signal ABORTS the run when its lease cannot be kept (see below). */
// claimedFrom: when the claim began (before its connect and BEGIN). The plane stamps the lease at the claim transaction's BEGIN; timed
// from the moment the claim RETURNED, a claim that had waited on the claim lock was aborted after its lease lapsed and another node
// had taken its surface (final verification 3, 2026-09-25). Earlier than BEGIN is the safe side.
export function startHeartbeat({ runId, id, leaseSeconds = DEFAULT_LEASE_SECONDS, reg = null, claimedFrom = Date.now() }) {
  const leaseMs = leaseSeconds * 1000;
  const everyMs = Math.max(5000, Math.floor(leaseMs / 3));
  // the lease the plane holds runs from the START of the last renewal that landed (the server stamps it while the statement runs)
  let lost = false, stopped = false, inFlight = false, leaseFrom = claimedFrom, retry = null;
  // settled: the run's work is over and only its completion is left (see settle below)
  let finishing = false;
  const ac = new AbortController();
  const say = (m) => console.log('[' + String(id).slice(0, 13) + '] run ' + String(runId).slice(0, 8) + ' ' + m);
  const abort = (why) => {
    if (ac.signal.aborted || stopped || finishing) return;
    say('ABORTED: ' + why);
    ac.abort(new Error('run aborted: ' + why));
    // ...and its lease is given back at once, so the plane and the Home PC do not show an abandoned run as a live claim (best effort:
    // the plane may be the thing that is unreachable)
    db.write("update factory.agent_runs set lease_expires_at = now() where run_id = $1 and node_id = $2 and status = 'in_progress'", [runId, id])
      .then(() => db.write('update factory.surface_locks set lease_expires_at = now() where run_id = $1', [runId])).catch(() => { /* the lease lapses by itself */ });
  };
  const renew = () => {
    if (stopped || inFlight || ac.signal.aborted) return;
    inFlight = true;
    const startedAt = Date.now();
    heartbeat({ runId, nodeId: id, leaseSeconds })
      // a lost lease is said once; the completion fence (claim.mjs completeRun) keeps this run's result off the work order
      // (never said of a run this node has already finished - its beat may land after the completion)
      .then((ok) => { if (stopped) return; if (ok) { leaseFrom = startedAt; return; } if (finishing) return; if (!lost) { lost = true; say('LOST its lease (taken over by another node); its result will not complete the work order'); abort('its lease was taken over by another node'); } })
      // A FAILED RENEWAL IS RETRIED IN SECONDS, not at the next tick: one failure left the next attempt racing the abort guard, and
      // over the internet (a renewal takes ~1.5 s through a remote pooler) it lost - a healthy run was aborted (final verification 2)
      .catch(() => { if (!stopped && !retry) { retry = setTimeout(() => { retry = null; renew(); }, 5000); if (typeof retry.unref === 'function') retry.unref(); } })
      .finally(() => { inFlight = false; });
  };
  const timer = setInterval(() => {
    if (stopped) return;
    renew();
    // ...and the role, while busy too (a long run no longer leaves a demotion standing until it ends)
    nodeBeat(id, nodeRole(), reg).then((b) => { if (b.found && b.was !== nodeRole()) console.log('[' + String(id).slice(0, 13) + '] the plane held role ' + b.was + ' for this node - re-asserted ' + nodeRole()); if (b.recordChanged) console.log('[' + String(id).slice(0, 13) + '] the plane held a different registration for this node - re-asserted'); }, () => { /* the next beat */ });
  }, everyMs);
  // A RUN THAT CANNOT RENEW ITS LEASE STOPS BEFORE THE LEASE CAN LAPSE. A node cut off from the plane kept working after its lease
  // lapsed and another node had taken the surface: two machines worked one surface at once, and the work ran twice (final
  // verification 2026-09-24). The run is aborted when its lease - as the plane holds it, from the start of the last renewal that landed -
  // is about to lapse: a third of the lease, at most 5 s, before it does. Not at two thirds of the lease: that aborted healthy runs
  // whose next renewal was still landing over a slow link (final verification 2, 2026-09-25).
  const margin = Math.min(5000, leaseMs / 3);
  const guard = setInterval(() => { if (!stopped && Date.now() - leaseFrom > leaseMs - margin) abort('no lease renewal for ' + Math.round((Date.now() - leaseFrom) / 1000) + ' s (lease ' + leaseSeconds + ' s) - stopped before the lease can lapse and another node takes its surface'); }, 1000);
  for (const t of [timer, guard]) if (typeof t.unref === 'function') t.unref();
  // SETTLE: THE WORK IS OVER, ONLY ITS COMPLETION IS LEFT. A renewal still in flight when the completion committed found no run in
  // progress and was read as a takeover: a run that completed normally was logged LOST and ABORTED (final verification 3, 2026-09-25,
  // over a slow link). Settled, the renewals go on (a slow completion keeps its lease), but a renewal that finds no run is no longer a
  // takeover and the guard no longer aborts: the completion is fenced by itself (claim.mjs completeRun - a run taken over is superseded).
  return { stop: () => { stopped = true; clearInterval(timer); clearInterval(guard); if (retry) clearTimeout(retry); }, settle: () => { finishing = true; }, signal: ac.signal };
}

/**
 * The loop. `runWork` is injected so this file can be tested without launching a provider — and so the
 * same bootstrap serves an Edge verifier, a DB review, or anything else the director schedules.
 */
// `worktree` is injectable for the same reason `runWork` is: the loop and the checkout are separate
// concerns, and a test of the loop that creates a 3 870-file checkout per iteration is testing git.
// The real ensureWorktree is exercised on its own.
// `workTypes`: the work types this node's runWork can actually do - the claim takes nothing else (null: every type, for a
// caller whose runWork dispatches on its own). The CLI node passes HANDLED_WORK_TYPES.
export async function nodeStart({ runWork, once = false, leaseSeconds = DEFAULT_LEASE_SECONDS, idleMs = 5000, maxIterations = Infinity, worktree = ensureWorktree, workTypes = null } = {}) {
  const id = nodeId();
  const caps = capabilities();
  const repo = reconcileRepository({ fetch: false });

  // THE ROLE IS STATED BY THE ENVIRONMENT AND ENFORCED FROM THE PLANE'S NODE RECORD. Before this, every start
  // re-registered the node as `generic`, so a Work PC bootstrapped as the verifier was silently demoted the first
  // time it started - and the claim would then have refused it verifier work while looking healthy.
  const log = (m) => console.log('[' + id.slice(0, 13) + '] ' + m);
  // registered WITHOUT liveness: the node reads ALIVE only once it has completed a claim cycle (below). A worker that registered
  // and then failed every claim read ALIVE while it crash-looped (final verification 2026-09-24).
  const reg = { capabilities: caps, agentVersion: process.version + ' ' + String(repo.head).slice(0, 12) + (caps.includes('dirty') ? '+dirty' : '') };
  const register = () => registerNode({ nodeId: id, capabilities: caps, securityRole: nodeRole(), platform: process.platform + ' ' + hostname(), agentVersion: reg.agentVersion, stamp: false });
  // THE COMMIT ON EVERY RUN AND CHECKPOINT CARRIES ITS DIRTINESS: a tree with uncommitted changes recorded plain <sha>, and its
  // evidence counted as the commit's (final verification 2, 2026-09-25). '<sha>+dirty' matches no commit under acceptance.
  const commit = String(repo.head) + (caps.includes('dirty') ? '+dirty' : '');
  await retryTransient(register, 'registration', log);
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
  log(workTypes ? 'claims only work types it can do: ' + workTypes.join(', ') : 'claims every work type (the caller dispatches)');
  let claimed = 0;
  // A REFUSED ADMISSION IS SAID, NOT SILENT. The gate records its verdict on claimWork.lastAdmission; before this nothing read
  // it, so a node below the free-memory floor read ALIVE while it never claimed (verification 2026-09-24, round 2). Every
  // change is logged, and the current verdict is written to <state dir>/node-admission.json, which status prints.
  let lastAdmit = null;
  const noteAdmission = () => {
    const g = claimWork.lastAdmission;
    if (!g || g.admit === lastAdmit) return;
    lastAdmit = g.admit;
    log(g.admit ? 'admission: claiming (' + g.reason + ')' : 'admission REFUSED - not claiming: ' + g.reason);
    try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(join(STATE_DIR, 'node-admission.json'), JSON.stringify({ admit: g.admit, reason: g.reason, at: new Date().toISOString() })); } catch { /* status only */ }
  };
  // AN IDLE NODE IS VISIBLY ALIVE. Before this, the node record was touched only at registration, so a node that ran for
  // days with nothing to claim looked dead on the plane (2026-09-22: last heartbeat four days old while nothing was wrong
  // but the absence of a worker after a reboot - two facts one timestamp could not tell apart). Every NODE_BEAT_MS the
  // idle loop stamps last_heartbeat_at; `node.mjs status` reads it back.
  let lastBeat = Date.now();
  // A CLAIM LOCK THAT STAYS BUSY IS SAID, like a refused admission: a claim that cannot take the plane-wide claim lock returns
  // "nothing claimed", and a node behind a claimer holding it read ALIVE and idle while nothing was claimed (final verification
  // 2026-09-24). Changes are logged; the state is written to <state dir>/node-claim-busy.json, which status prints.
  // undefined, not null: the first cycle always writes the record, so one left by an earlier worker (a crash, a reboot) is replaced
  // (it said NOT CLAIMING forever on a node that claimed - final verification 2, 2026-09-25)
  let busySeen;
  const noteBusy = () => {
    const since = claimWork.lastBusy || null;
    if (since === busySeen) return;
    busySeen = since;
    log(since ? 'claim lock BUSY since ' + since + ' - not claiming: another claimer holds the plane-wide claim lock past the lock timeout' : 'claim lock free again - claiming');
    try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(join(STATE_DIR, 'node-claim-busy.json'), JSON.stringify({ since, at: new Date().toISOString() })); } catch { /* status only */ }
  };
  let ready = false;
  // the runs this process claimed: any other run of this node in progress, found while this node is idle, is an orphan (below)
  const mine = new Set();
  for (let i = 0; i < maxIterations; i++) {
    let claimStart = Date.now(), claimTries = 0;
    const run = await retryTransient(async () => {
      claimStart = Date.now();
      // A CLAIM RETRIED AFTER A TRANSIENT ERROR may have committed before its reply was lost: its run stood in progress on this node,
      // unworked and never mentioned, for a whole lease (final verification 4, adversarial probe). This node is idle here, so a run of
      // its own in progress that this process did not claim is such an orphan: its lease is given back first, and the plane requeues it.
      if (claimTries++ > 0) await giveBackOrphans(id, mine, log);
      return claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel, workTypes, baseCommit: commit });
    }, 'claim', log);
    if (run) mine.add(run.run_id);
    noteAdmission();
    noteBusy();
    // READY = ONE COMPLETED CLAIM CYCLE. Only now is liveness stamped, and the line below is what the supervisor resets its
    // backoff on - not the registration, which a worker that fails every claim also reaches (final verification 2026-09-24).
    // (an admission refusal returns before any statement reaches the plane: that is not a claim cycle - a worker that could not claim
    // at all read ALIVE and reset its supervisor's backoff whenever its first cycle was refused - final verification 2, 2026-09-25)
    const admitted = !(claimWork.lastAdmission && claimWork.lastAdmission.admit === false);
    if (!ready && admitted) {
      try { await nodeBeat(id, nodeRole(), reg); ready = true; lastBeat = Date.now(); log('ready: first claim cycle completed - the node reads ALIVE on the plane'); }
      catch (e) { log('node heartbeat failed: ' + errText(e).slice(0, 100)); }
    }
    if (!run) {
      if (once) { log('nothing eligible'); break; }
      if (ready && Date.now() - lastBeat >= NODE_BEAT_MS) {
        try {
          const b = await nodeBeat(id, nodeRole(), reg);
          // a record removed from the plane is written again; a role or registration changed by anything but this worker is re-asserted, and said
          // (stamped at once: this worker has completed claim cycles, it is not "never beaten" - it read STALE for a whole beat)
          if (!b.found) { await register(); await nodeBeat(id, nodeRole(), reg); log('the plane had no record of this node - registered again as ' + nodeRole()); }
          else {
            if (b.was !== nodeRole()) log('the plane held role ' + b.was + ' for this node - re-asserted ' + nodeRole());
            if (b.recordChanged) log('the plane held a different registration for this node (capabilities or version - another script registered this node id?) - re-asserted: head ' + String(repo.head).slice(0, 12) + ', handler ' + HANDLER_VERSION);
          }
          lastBeat = Date.now();
        } catch (e) { log('node heartbeat failed: ' + errText(e).slice(0, 100)); }
      }
      await new Promise((r) => setTimeout(r, idleMs));
      continue;
    }
    claimed++;
    log('claimed work order ' + String(run.work_order_id).slice(0, 8) + ' as run ' + String(run.run_id).slice(0, 8));
    const hb = startHeartbeat({ runId: run.run_id, id, leaseSeconds, reg, claimedFrom: claimStart });
    const stopBeat = hb.stop;
    try {
      // The work order itself: its type decides whether a checkout is needed. A factory_acceptance work order has no code
      // to check out, and the 2026-09-22 acceptances left twelve full worktrees behind before this distinction existed.
      const woRow = (await db.read('select work_type, title, handoff, owned_surface, requires_security_role from factory.work_orders where work_order_id = $1', [run.work_order_id])).rows[0] || {};
      let wt = null;
      // (a bootstrap_probe has none either - it does no work by definition)
      if (woRow.work_type !== 'factory_acceptance' && woRow.work_type !== 'bootstrap_probe') {
        wt = await worktree({ runId: run.run_id, baseCommit: repo.head });
        log((wt.recovered ? 'recovered' : 'created') + ' worktree ' + wt.path);
        await db.write(
          'update factory.agent_runs set worktree = $2, branch = $3, base_commit = $4, updated_at = now() where run_id = $1',
          [run.run_id, wt.path, wt.branch, repo.head]);
      }

      // A CHECKPOINT OR A COMPLETION THAT DID NOT REACH THE PLANE IS RETRIED, like a claim: one transient loss while a run recorded its
      // progress, or while a finished run was being completed, threw the run away - its claim looked live for a whole lease while nothing
      // ran it, and the work was done again (final verification 3, Work-PC probe). A checkpoint carries its own id, so a retry after one
      // that landed writes it once; a retry stops as soon as the run is aborted (its lease could not be kept).
      const short = String(run.run_id).slice(0, 8);
      const result = await runWork({ run, workOrder: woRow, worktree: wt, nodeId: id, log, head: commit, signal: hb.signal,
        checkpoint: (location, scenario, payload) => {
          const checkpointId = randomUUID();
          return retryTransient(() => {
            if (hb.signal.aborted) throw hb.signal.reason || new Error('run aborted');
            return checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location, scenario, payload, nodeId: id, checkpointId });
          }, 'checkpoint of run ' + short, log);
        } });
      // an aborted run (its lease could not be kept) is not reported, whatever its worker returned
      if (hb.signal.aborted) throw hb.signal.reason || new Error('run aborted');
      // the work is over: only its completion is left (startHeartbeat - settle)
      hb.settle();

      // THE TERMINAL CONDITION COMES FROM THE WORKER, and where the worker reports none the fallback NAMES
      // THAT ABSENCE rather than claiming a clean finish. completeRun requires the field; defaulting it to
      // 'completed' here would move the invention one layer up and lose exactly the distinction the column
      // exists for. The 2026-08-24 failures were eight HTTP 200s whose bodies never terminated, and a runner
      // that writes 'completed' because its worker said nothing reproduces that defect in a new place.
      const finished = result && result.status === 'failed' ? 'failed' : 'done';
      // (a retry after a completion that DID land - its reply lost - finds the run no longer in progress: that is this node's own
      // completion, not a takeover, when the run stands finished by this node; see below)
      let completionAttempts = 0;
      const fin = await retryTransient(() => { completionAttempts++; return completeRun({
        runId: run.run_id, nodeId: id, status: finished,
        summary: result && result.summary, headCommit: result && result.headCommit,
        terminationReason: (result && result.terminationReason)
          || (finished === 'failed' ? 'worker_reported_failure_without_a_terminal_condition'
            : 'worker_reported_success_without_a_terminal_condition'),
        actualProvider: result && result.actualProvider,
        actualModel: result && result.actualModel,
        fallbackReason: result && result.fallbackReason,
        usage: result && result.usage,
      }); }, 'completion of run ' + short, log);
      let superseded = !!(fin && fin.superseded);
      if (superseded && completionAttempts > 1) {
        const mine = (await retryTransient(() => db.read('select status, node_id from factory.agent_runs where run_id = $1', [run.run_id]), 'completion check of run ' + short, log)).rows[0];
        if (mine && mine.node_id === id && mine.status === finished) { superseded = false; log('run ' + short + ': an earlier attempt of its completion had landed (its reply was lost)'); }
      }
      if (superseded) log('run ' + String(run.run_id).slice(0, 8) + ' finished AFTER its lease was taken over - its result is not recorded as the work order\'s (the node that holds it completes it)');
      // a failure is said as one ('completed run' was logged for failed runs too - verification round 4)
      else if (finished === 'failed') log('FAILED run ' + String(run.run_id).slice(0, 8) + ' (' + ((result && result.terminationReason) || 'no terminal condition stated') + ') - its work order is failed; ' + String((result && result.summary) || '').slice(0, 160));
      else log('completed run ' + String(run.run_id).slice(0, 8));
    } catch (e) {
      // A thrown worker does NOT mark the run failed: it may be a transient provider error, and the lease
      // is the honest arbiter. Leaving it to expire lets any eligible node resume from the last checkpoint,
      // which is the behaviour a crashed process should have.
      // EXCEPT A DATA EXCEPTION (SQLSTATE class 22): the same input fails the same way on every attempt, and a verify naming a run id
      // that is not a uuid was re-claimed and re-thrown every lease period, holding its dependents forever (final verification
      // 2026-09-24). That run fails, by name, and its work order with it.
      const code = String((e && e.code) || '');
      if (hb.signal.aborted) {
        log('run ' + String(run.run_id).slice(0, 8) + ' not completed: it was aborted (' + errText(hb.signal.reason || e).slice(0, 140) + '); its lease is left to expire - the work is recoverable');
      } else if (/^22/.test(code)) {
        try {
          hb.settle();
          await completeRun({ runId: run.run_id, nodeId: id, status: 'failed', terminationReason: 'data_exception_' + code, summary: errText(e).slice(0, 300) });
          log('FAILED run ' + String(run.run_id).slice(0, 8) + ' (data exception ' + code + ': ' + errText(e).slice(0, 120) + ') - the same input fails every time; its work order is failed');
        } catch (e2) { log('run ' + String(run.run_id).slice(0, 8) + ' hit a data exception and could not be recorded failed: ' + errText(e2).slice(0, 120)); }
      } else {
        log('run ' + String(run.run_id).slice(0, 8) + ' threw: ' + errText(e).slice(0, 120));
        log('leaving the lease to expire so the work is recoverable rather than lost');
      }
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
  const loopback = /^(127\.|\[?::1\]?$|localhost$)/.test(host.replace(/:\d+$/, ''));
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
    say(false, "cannot connect", errText(e).slice(0, 160));
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
  } catch (e) { say(false, "cannot read the factory schema", errText(e).slice(0, 120)); }

  // 5. It can actually DO its job: read the queue, and write its own registration.
  try {
    const q = await db.read("select count(*)::int n from factory.work_orders");
    say(true, "can read the queue (" + q.rows[0].n + " work order(s))");
  } catch (e) { say(false, "cannot read the queue", errText(e).slice(0, 120)); }

  // A CHECK DOES NOT CHANGE WHO THE NODE IS. This re-registered the node with FACTORY_NODE_ROLE || 'generic': run from a plain
  // shell on the Work PC (the documented check), it demoted the running verifier to generic, and verifier work waited while every
  // check passed (verification 2026-09-24, round 4). The role the plane holds is kept; only a node with no record yet is registered,
  // with the role this shell states. A different FACTORY_NODE_ROLE here is said, not written - the supervisor's --role decides.
  try {
    const held = (await db.read("select security_role from factory.nodes where node_id = $1", [nodeId()])).rows[0];
    const stated = process.env.FACTORY_NODE_ROLE ? nodeRole() : null;
    const role = held ? held.security_role : (stated || "generic");
    // ...nor whether it is alive: only a working node stamps liveness (a check on a PC whose node was dead made it read ALIVE for
    // three minutes - final verification 2026-09-24)
    // ...nor what it runs: an existing record is the running worker's (its commit and handler version) and is left as it is
    await registerNode({ nodeId: nodeId(), capabilities: capabilities(), securityRole: role,
      platform: process.platform + ' ' + hostname(), agentVersion: process.version, stamp: false, onlyIfAbsent: true });
    const n = await db.read("select count(*)::int n from factory.nodes");
    say(true, (held ? "left its record as the running worker wrote it, role " + role + " kept as the plane holds it" : "registered itself as " + role)
      + " (" + n.rows[0].n + " node(s) known to this control plane)");
    if (held && stated && stated !== held.security_role) lines.push("  note FACTORY_NODE_ROLE here says " + stated + " but the plane holds "
      + held.security_role + " for this node - a health check does not change a role (install-autostart.ps1 -Role " + stated + " does)");
  } catch (e) { say(false, "cannot register", errText(e).slice(0, 120)); }

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
  } catch (e) { say(false, "cannot read the repository", errText(e).slice(0, 120)); }

  // ---- PostgreSQL version as a CHECKED FLOOR, not a printed string ----------------------------------
  // The schema needs gen_random_uuid(), core since 13. Printing the version tells you nothing unless
  // something compares it to what the schema requires.
  try {
    const v = await db.read("select current_setting('server_version_num')::int n");
    const num = v.rows[0].n;
    say(num >= 130000, "PostgreSQL is new enough (" + Math.floor(num / 10000) + ")",
      num < 130000 ? "the schema needs gen_random_uuid(), core since 13" : "");
  } catch (e) { say(false, "cannot read the server version", errText(e).slice(0, 100)); }

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
  } catch (e) { say(false, "cannot check for business tables", errText(e).slice(0, 100)); }

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
    // WORK THAT NOTHING WILL MOVE, NAMED. A work order 'claimed' with no run in progress is held by nobody - the lease recovery
    // only requeues runs in progress - and its dependents wait forever; health said HEALTHY with "no stale leases" over two of
    // them (verification round 4). A failed work order is terminal and holds its dependents too. Both are said by id.
    const stranded = await db.read(
      "select wo.work_order_id, wo.title from factory.work_orders wo where wo.status = 'claimed'"
      + " and not exists (select 1 from factory.agent_runs r where r.work_order_id = wo.work_order_id and r.status = 'in_progress')"
      + " order by wo.updated_at limit 5");
    const cnt = (await db.read("select count(*) filter (where status = 'claimed' and not exists (select 1 from factory.agent_runs r where r.work_order_id = w.work_order_id and r.status = 'in_progress'))::int stranded,"
      + " count(*) filter (where status = 'failed')::int failed from factory.work_orders w")).rows[0];
    if (cnt.stranded) lines.push("  note " + cnt.stranded + " work order(s) 'claimed' with NO run in progress - nothing will move them and their dependents wait: "
      + stranded.rows.map((x) => String(x.work_order_id).slice(0, 8) + " " + JSON.stringify(String(x.title).slice(0, 40))).join("; "));
    if (cnt.failed) lines.push("  note " + cnt.failed + " work order(s) FAILED - their dependents wait; each run's termination_reason says why");
    // queued work no node will ever pick (a NULL, empty or oversized surface - the claim excludes it), by id
    const bad = (await db.read("select wo.work_order_id, wo.title from factory.work_orders wo where wo.status = 'queued' and exists (select 1 from unnest(wo.owned_surface) s where s is null or btrim(s) = '' or octet_length(s) > 1000) order by wo.created_at limit 5")).rows;
    if (bad.length) lines.push("  note queued work order(s) with a NULL, empty or oversized surface - no node will claim them, fix or remove them: "
      + bad.map((x) => String(x.work_order_id).slice(0, 8) + " " + JSON.stringify(String(x.title).slice(0, 40))).join("; "));
  } catch (e) { say(false, "cannot read claims and leases", errText(e).slice(0, 100)); }
  console.log(lines.join("\n"));
  console.log("");
  // THE LINKS ARE HEALTHY; WHETHER ANYTHING CLAIMS IS A SEPARATE FACT. "can claim work" was printed on a PC whose supervisor was
  // dead (final verification 2026-09-24): the supervisor of this node is asked, and its absence said.
  let sup = null;
  try { const { askSupervisor } = await import("./proc.mjs"); sup = await askSupervisor(STATE_DIR, "whois", 1500); } catch { sup = null; }
  // ...and a supervisor is not a working node: "can claim work" was also printed while it sat in backoff with no worker (final
  // verification 2, 2026-09-25). Only a running worker that has completed a claim cycle claims.
  const working = !!(sup && sup.state === 'running' && sup.childPid && sup.readyAt);
  // ...and a ready worker that is refused by admission, or cannot take the claim lock, is not claiming either: the node's own records say
  // so (node.mjs status reads them) - health said "can claim work" over them (final verification 3, 2026-09-25)
  let notClaiming = null;
  try { const a = JSON.parse(readFileSync(join(STATE_DIR, 'node-admission.json'), 'utf8')); if (a && a.admit === false) notClaiming = 'admission refused since ' + a.at + ' (' + a.reason + ')'; } catch { /* never recorded */ }
  try { const b = JSON.parse(readFileSync(join(STATE_DIR, 'node-claim-busy.json'), 'utf8')); if (b && b.since) notClaiming = (notClaiming ? notClaiming + '; ' : '') + 'the plane-wide claim lock busy since ' + b.since; } catch { /* never recorded */ }
  const claiming = working && !notClaiming;
  console.log(claiming ? "  ok   a supervisor runs this node here (pid " + sup.pid + ", role " + sup.role + "; worker " + sup.childPid + " claiming since " + sup.readyAt + ")"
    : working ? "  note a supervisor runs this node here (pid " + sup.pid + ", role " + sup.role + ", worker " + sup.childPid + ") but it is NOT CLAIMING: " + notClaiming
    : sup ? "  note a supervisor runs this node here (pid " + sup.pid + ", role " + sup.role + ") but NO WORKER CLAIMS: it is " + sup.state + (sup.nextStartAt ? " until " + sup.nextStartAt : "") + (sup.state === 'running' ? ", its worker has not completed a claim cycle" : "") + " - install-autostart.ps1 -Status names why"
    : "  note no supervisor runs this node here - nothing on this machine claims its work (install-autostart.ps1 -Start)");
  console.log("");
  console.log(ok ? (claiming ? "HEALTHY — this node can claim work." : sup ? "HEALTHY — the plane is reachable and usable; this node's worker is not claiming (see the note above)." : "HEALTHY — the plane is reachable and usable; start the node to claim work.") : "NOT HEALTHY — see the failing line above.");
  return { ok, host, database };
}
if (process.argv[1] && /node\.mjs$/.test(process.argv[1])) {
  const cmd = process.argv[2] || 'start';
  // --runner-env <file>: read the URL from that env file, through the same judge the supervisor uses. Explicit only: the
  // default file is never read implicitly, so a harness that blanks FACTORY_RUNNER_PG_URL can never reach the live plane.
  const reIdx = process.argv.indexOf('--runner-env');
  // (it takes precedence over a URL already in this shell: asked about a file, the answer must be about that file)
  if (reIdx > -1 && process.argv[reIdx + 1]) {
    const { loadRunnerUrl } = await import('./runner-env.mjs');
    const r = loadRunnerUrl(process.argv[reIdx + 1]);
    if (!r.usable) { console.log('REFUSED — ' + r.note); process.exit(2); }
    // db.mjs reads the URL when it is imported (statically, above), so the command runs once more with the URL in the
    // CHILD's environment only - never printed, never in an argument
    const { spawnSync } = await import('node:child_process');
    const args = process.argv.slice(1).filter((a, i, all) => a !== '--runner-env' && all[i - 1] !== '--runner-env');
    const child = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, FACTORY_RUNNER_PG_URL: r.url } });
    process.exit(child.status === null ? 1 : child.status);
  }
  // THE COMMANDS THAT LOAD THE DRIVER REFUSE BY NAME WITHOUT IT. `start` and `status` import pg through db.mjs; with a
  // dependency missing they used to end in a raw ERR_MODULE_NOT_FOUND stack (start) or a connection-worded UNREACHABLE
  // (status). Same check, same exit code (5) as the supervisor; `health` reports it as its own row.
  if (cmd === 'start' || cmd === 'status') {
    const { checkDependencies, describe: describeDeps } = await import('./deps.mjs');
    const deps = checkDependencies();
    if (!deps.ok) {
      const idNow = peekNodeId();
      // human line first, JSON last - the same order as the normal status path, which consumers parse from the last line
      console.log((cmd === 'status' ? 'DEPENDENCIES_MISSING — node ' + (idNow ? idNow.slice(0, 13) : '(none yet)') + ' — ' : 'REFUSED — ') + describeDeps(deps));
      if (cmd === 'status' && process.argv.includes('--json')) console.log(JSON.stringify({ state: 'DEPENDENCIES_MISSING', nodeId: idNow, error: describeDeps(deps) }));
      process.exit(5);
    }
  }
  if (cmd === 'id') { console.log(nodeId()); }
  else if (cmd === 'health') { const r = await health(); process.exit(r.ok ? 0 : 1); }
  else if (cmd === 'capabilities') { console.log(JSON.stringify(capabilities(), null, 2)); }
  else if (cmd === 'status') {
    const s = await nodeStatus();
    const age = s.neverBeaten ? ' (never beaten: registered, but no worker has completed a claim cycle)' : s.ageMs == null ? '' : ' (heartbeat ' + Math.round(s.ageMs / 1000) + ' s ago)';
    console.log(s.state + age + ' — node ' + (s.nodeId ? s.nodeId.slice(0, 13) : '(none yet)') + (s.role ? ', role ' + s.role : '') + (s.head ? ', commit ' + s.head.slice(0, 12) + (s.dirty ? '+dirty' : '') : '') + (s.host ? ', host ' + s.host : '')
      + ', plane ' + s.plane + (s.tls == null ? '' : ', tls ' + (s.tls ? 'on' : 'OFF')) + (s.error ? ' — ' + s.error : '')
      + (s.admission && s.admission.admit === false ? ' — NOT CLAIMING: admission refused since ' + s.admission.at + ' (' + s.admission.reason + ')' : '')
      + (s.claimBusySince ? ' — NOT CLAIMING: the plane-wide claim lock has been busy since ' + s.claimBusySince : ''));
    if (process.argv.includes('--json')) console.log(JSON.stringify(s));
    process.exit(s.state === 'ALIVE' ? 0 : 1);
  }
  else if (cmd === 'start') {
    // ONE WORKER PER NODE IDENTITY. A bare "node.mjs start" beside the supervised worker ran a second worker under the same node
    // id: the two re-asserted different roles on every beat and both claimed (final verification 2026-09-24). A worker holds a
    // lock for its state dir; and a bare start does not run while a supervisor holds that state dir. Exit 4, not REFUSED: a
    // supervisor restarts a worker that lost this race (an orphan still dying), it does not give up.
    {
      const { holdControlPipe, askSupervisor } = await import('./proc.mjs');
      const mine = process.argv.includes('--supervisor-instance') ? process.argv[process.argv.indexOf('--supervisor-instance') + 1] : null;
      const sup = await askSupervisor(STATE_DIR, 'whois', 1500);
      if (sup && sup.instance !== mine) { console.log('NOT STARTED - a supervisor (pid ' + sup.pid + ', role ' + sup.role + ') already runs the node of ' + STATE_DIR + ': one worker per node identity. Use install-autostart.ps1 -Status / -Stop, or give this worker its own FACTORY_STATE_DIR.'); process.exit(4); }
      const lockDir = join(STATE_DIR, 'worker-lock'); mkdirSync(lockDir, { recursive: true });
      const wl = await holdControlPipe(lockDir, () => ({ pid: process.pid, kind: 'worker', role: nodeRole(), instance: mine }), () => { /* the supervisor stops its worker */ });
      if (!wl.held) { const other = await askSupervisor(lockDir, 'whois', 1500); console.log('NOT STARTED - another worker already runs the node of ' + STATE_DIR + (other ? ' (pid ' + other.pid + ', role ' + other.role + ')' : '') + ': one worker per node identity.'); process.exit(4); }
      // THE NODE'S CLAIMING RECORDS ARE THIS WORKER'S: a previous worker's admission refusal (or busy claim lock) was repeated by status
      // and quoted by -Start for a worker that had not reached its first claim cycle (final verification 4, adversarial probe). Removed
      // here - the lock is held - and written again by this worker's first claim cycle.
      for (const f of ['node-admission.json', 'node-claim-busy.json']) { try { rmSync(join(STATE_DIR, f), { force: true }); } catch { /* none */ } }
    }
    const { factoryAcceptance } = await import('./handlers/factory-acceptance.mjs');
    // THE WORK TYPES THIS NODE CAN DO, and nothing else is claimed. factory_acceptance: the Factory's own acceptance
    // (handlers/factory-acceptance.mjs). bootstrap_probe: a work order whose whole purpose is to be claimed and completed - it
    // proves the claim/lease/complete path and does no work by definition, which its summary says.
    const HANDLED_WORK_TYPES = ['factory_acceptance', 'bootstrap_probe'];
    // a refusal (no FACTORY_RUNNER_PG_URL, a superuser, the production project) is the designed answer, printed as one line
    // with the fix instead of an uncaught stack; the supervisor provides the URL from the env file, a bare shell does not
    try {
    await nodeStart({
      runWork: async ({ run, workOrder, checkpoint: cp, nodeId: nid, log: l, head, signal }) => {
        // The Factory's own acceptance work is the one thing the generic bootstrap runs itself (handlers/factory-acceptance.mjs).
        if (workOrder && workOrder.work_type === 'factory_acceptance') return factoryAcceptance({ run, workOrder, checkpoint: cp, nodeId: nid, log: l, head, signal });
        if (workOrder && workOrder.work_type === 'bootstrap_probe') {
          await cp('qa/verification/CHECKPOINT.md', 'bootstrap_probe');
          return { status: 'done', terminationReason: 'bootstrap_probe_completed', summary: 'bootstrap probe ' + run.work_order_id + ' claimed and completed; a probe does no work by definition' };
        }
        // Unreachable while the claim is filtered to HANDLED_WORK_TYPES - and if it is ever reached, the run is NOT reported
        // done: the throw leaves the lease to expire and the work order to a node that can do it.
        throw new Error('no worker for work type ' + (workOrder && workOrder.work_type) + ' on this node; nothing was done');
      },
      once: process.argv.includes('--once'),
      workTypes: HANDLED_WORK_TYPES,
      // the lease length (default 120 s); shorter only for the acceptance that proves a cut-off run stops before its lease lapses
      leaseSeconds: Number(process.env.FACTORY_LEASE_SECONDS) > 0 ? Number(process.env.FACTORY_LEASE_SECONDS) : DEFAULT_LEASE_SECONDS,
    });
    } catch (e) {
      // anything else (a password refused, a certificate, a host that does not answer) is ONE line naming it, then exit 1: the
      // installer's -Start/-Verify quote that line (they quoted the last field of pg's error dump - verification round 4)
      if (!(e && e.name === 'FactoryDbRefusal')) { console.log('error: ' + errText(e) + (e && e.code ? ' (' + e.code + ')' : '')); process.exit(1); }
      console.log(e.message);
      console.log('(the supervisor reads the env file itself: node scripts/factory-runner/node-supervisor.mjs --runner-env <runner.env> --role <role>)');
      process.exit(2);
    }
  } else {
    console.log('usage: node node.mjs [start [--once] | health | status [--json] | id | capabilities] [--runner-env <runner.env>]');
    process.exit(2);
  }
}
