// Singleton leadership lease.
//
// Two supervisors racing would produce two QA Directors writing the same central QA state,
// which is worse than no supervisor: the coverage ledger and bug queue would interleave and
// the evidence would be untrustworthy. So leadership is exclusive.
//
// A crashed supervisor must not lock the node out forever, so the lease EXPIRES. Takeover is
// allowed only when the holder is provably gone (dead PID on this host) or the lease has gone
// stale past its TTL - and every takeover is recorded, because a takeover that happens while
// the old holder is actually alive is a bug worth seeing in the log.
import { openSync, writeSync, closeSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { P } from './paths.mjs';
import { nowIso } from './state.mjs';

export const LEASE_TTL_MS = 90_000;
const HOST = hostname();

function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM = exists but not ours
}

function readLease() {
  try { return JSON.parse(readFileSync(P.lease, 'utf8')); } catch { return null; }
}

/**
 * @returns {{ok:true, id:string, tookOver?:object} | {ok:false, reason:string, holder:object}}
 */
export function acquireLease() {
  const id = randomUUID();
  const rec = { supervisor_id: id, pid: process.pid, host: HOST, acquired_at: nowIso(), renewed_at: nowIso() };

  try {
    const fd = openSync(P.lease, 'wx'); // atomic create-or-fail
    writeSync(fd, JSON.stringify(rec, null, 2));
    closeSync(fd);
    return { ok: true, id };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  const held = readLease();
  if (!held) { // unreadable lock file - treat as stale
    writeFileSync(P.lease, JSON.stringify(rec, null, 2));
    return { ok: true, id, tookOver: { reason: 'unreadable lease file' } };
  }

  const age = Date.now() - Date.parse(held.renewed_at || held.acquired_at || 0);
  const sameHost = held.host === HOST;
  const alive = sameHost && isPidAlive(held.pid);

  if (alive && age < LEASE_TTL_MS) {
    return { ok: false, reason: 'ACTIVE_SUPERVISOR_HOLDS_LEASE', holder: held };
  }
  // On another host we cannot inspect the PID, so only the TTL can justify takeover.
  if (!sameHost && age < LEASE_TTL_MS) {
    return { ok: false, reason: 'REMOTE_SUPERVISOR_HOLDS_FRESH_LEASE', holder: held };
  }

  writeFileSync(P.lease, JSON.stringify(rec, null, 2));
  return {
    ok: true, id,
    tookOver: { previous: held, age_ms: age, holder_pid_alive: alive,
      reason: alive ? 'lease went stale though PID still alive (supervisor hung?)' : 'previous holder is gone' },
  };
}

export function renewLease(id) {
  const held = readLease();
  if (!held || held.supervisor_id !== id) return false; // we were displaced - stop renewing
  held.renewed_at = nowIso();
  writeFileSync(P.lease, JSON.stringify(held, null, 2));
  return true;
}

export function releaseLease(id) {
  const held = readLease();
  if (held && held.supervisor_id === id && existsSync(P.lease)) {
    try { unlinkSync(P.lease); } catch {}
  }
}

export function inspectLease() { return readLease(); }
