// Worker and fixture leases for parallel QA execution.
//
// The single-supervisor lease in lease.mjs answers "who is in charge". This file answers the
// two questions that only arise once there is more than one worker:
//
//   1. WHICH WORKERS ARE ACTUALLY ALIVE?  A RUNNING status in a JSON file is a claim, not a
//      fact. Recovery must never trust it - CLAUDE.md #22 exists because prose was mistaken
//      for enforcement. Liveness here is a real PID probe on this host, same as lease.mjs.
//
//   2. WHO OWNS THIS FIXTURE?  Two workers mutating one synthetic fixture produces evidence
//      that looks like a product defect and is actually a test collision. That is the single
//      most dangerous failure mode of parallel QA: it manufactures false bugs. So a mutation
//      requires an exclusive lease, and a collision is REJECTED rather than queued - queuing
//      would hide the scheduling error that produced it.
//
// Leases live under qa/runs/<campaign>/_leases/ so they are durable across supervisor restarts
// and inspectable by a human without running anything.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { QA_DIR } from './paths.mjs';

export const WORKER_LEASE_TTL_MS = 120_000;
const HOST = hostname();

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function runsDir(campaignId) { return join(QA_DIR, 'runs', campaignId); }
export function leasesDir(campaignId) { return join(runsDir(campaignId), '_leases'); }
export function workerDir(campaignId, workerId) { return join(runsDir(campaignId), workerId); }

export function ensureRunDirs(campaignId, workerId) {
  const wd = workerDir(campaignId, workerId);
  mkdirSync(join(wd, 'EVIDENCE'), { recursive: true });
  mkdirSync(leasesDir(campaignId), { recursive: true });
  return wd;
}

/** Real liveness. A dead PID cannot be RUNNING no matter what its status file says. */
export function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

function leasePath(campaignId, key) {
  return join(leasesDir(campaignId), encodeURIComponent(key) + '.lease.json');
}

function readLease(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * Is a lease still binding? Only if its owner is provably alive AND it has not gone stale.
 * Both conditions matter: a hung worker keeps its PID but stops renewing, and a worker that
 * exited cleanly may leave the file behind.
 */
export function leaseIsLive(rec) {
  if (!rec) return false;
  const age = Date.now() - Date.parse(rec.renewed_at || rec.acquired_at || 0);
  if (age >= WORKER_LEASE_TTL_MS) return false;
  if (rec.host !== HOST) return true; // cannot probe a remote PID; TTL is the only guard
  return isPidAlive(rec.pid);
}

/**
 * Claim exclusive ownership of one key (a fixture id, a channel id, a browser context, or a
 * canonical artifact path). Atomic via O_EXCL - two workers racing cannot both win.
 *
 * @returns {{ok:true, rec:object} | {ok:false, reason:string, heldBy:object}}
 */
export function acquireLease(campaignId, key, { workerId, pid, scope = 'PRIVATE_WORKER', kind = 'fixture' }) {
  mkdirSync(leasesDir(campaignId), { recursive: true });
  const path = leasePath(campaignId, key);
  const rec = {
    key, kind, scope, worker_id: workerId, pid, host: HOST,
    acquired_at: nowIso(), renewed_at: nowIso(),
  };

  try {
    const fd = openSync(path, 'wx');
    writeSync(fd, JSON.stringify(rec, null, 2));
    closeSync(fd);
    return { ok: true, rec };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  const held = readLease(path);

  // Re-entrant: a worker may re-claim what it already owns.
  if (held && held.worker_id === workerId) {
    held.renewed_at = nowIso();
    writeFileSync(path, JSON.stringify(held, null, 2));
    return { ok: true, rec: held };
  }

  if (leaseIsLive(held)) {
    return { ok: false, reason: 'HELD_BY_LIVE_WORKER', heldBy: held };
  }

  // Previous holder is provably gone or stale - take over, and say so.
  const takenOver = { ...rec, took_over_from: held || null };
  writeFileSync(path, JSON.stringify(takenOver, null, 2));
  return { ok: true, rec: takenOver, tookOver: true };
}

/** Claim several keys as one unit. Partial ownership is never left behind. */
export function acquireLeaseSet(campaignId, keys, opts) {
  const got = [];
  for (const k of keys) {
    const r = acquireLease(campaignId, k, opts);
    if (!r.ok) {
      for (const g of got) releaseLease(campaignId, g, opts.workerId);
      return { ok: false, reason: r.reason, conflictKey: k, heldBy: r.heldBy };
    }
    got.push(k);
  }
  return { ok: true, keys: got };
}

export function releaseLease(campaignId, key, workerId) {
  const path = leasePath(campaignId, key);
  const held = readLease(path);
  if (held && held.worker_id === workerId && existsSync(path)) {
    try { unlinkSync(path); return true; } catch { return false; }
  }
  return false;
}

export function releaseAllFor(campaignId, workerId) {
  const dir = leasesDir(campaignId);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    const path = join(dir, f);
    const held = readLease(path);
    if (held && held.worker_id === workerId) { try { unlinkSync(path); n++; } catch {} }
  }
  return n;
}

export function renewLeasesFor(campaignId, workerId) {
  const dir = leasesDir(campaignId);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir)) {
    const path = join(dir, f);
    const held = readLease(path);
    if (held && held.worker_id === workerId) {
      held.renewed_at = nowIso();
      writeFileSync(path, JSON.stringify(held, null, 2));
      n++;
    }
  }
  return n;
}

/**
 * Release every lease whose owner is provably dead. Returns what it reaped so the supervisor
 * can log it - a silent reap would hide a crashing worker.
 */
export function reapDeadLeases(campaignId) {
  const dir = leasesDir(campaignId);
  if (!existsSync(dir)) return [];
  const reaped = [];
  for (const f of readdirSync(dir)) {
    const path = join(dir, f);
    const held = readLease(path);
    if (held && !leaseIsLive(held)) {
      reaped.push({ key: held.key, worker_id: held.worker_id, pid: held.pid, kind: held.kind });
      try { unlinkSync(path); } catch {}
    }
  }
  return reaped;
}

export function listLeases(campaignId) {
  const dir = leasesDir(campaignId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => readLease(join(dir, f)))
    .filter(Boolean)
    .map((r) => ({ ...r, live: leaseIsLive(r) }));
}
