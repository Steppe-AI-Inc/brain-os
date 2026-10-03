// THE ENROLLED WORKER (WO-4 runtime): one process, started and restarted by the supervisor. It speaks ONLY to the Factory Node API.
//
// ONE WORKER PER HOME: before anything else it holds the home's worker pipe (instance.mjs); a second worker finds it held and exits
// ALREADY (6) before any call, and the supervisor's "stop" on that pipe ends the loop as the stop file does.
// START (contract §2 Runtime: any -> RECOVERING -> AVAILABLE): a rotation an earlier run left pending is resolved first
// (credential.mjs), then register (the release it runs, its fingerprint, hostname, OS, resources), heartbeat RECOVERING, then
// RECONCILE - every run this node still holds on the plane is given back (a restarted process holds no work; the plane requeues it for
// the certified takeover), so no resumed work continues without a fresh claim - then heartbeat AVAILABLE.
// LOOP: heartbeat (liveness, phase, resources); a published release of this channel that is not the one running is taken (upgrade.mjs
// "take"); an admin-requested rotation is honoured; while draining nothing is claimed; otherwise
// ONE claim that names every type this runtime has a handler for, the reserved type 'verification' included. The SERVER ranks
// authoring and verification work together (numeric priority, then queue age) under the credential's CURRENT envelope and picks the
// assignment kind (contract §2 "chosen automatically by the scheduler"; P-7): the worker caches no role, so an envelope amendment
// takes effect at the next claim with nobody touching the node (AC-6(e), P-10), and it dispatches on the kind the plane chose.
// A claim is sent once: when its answer is lost, whatever it may have taken is given back at once and again before the next claim,
// so no orphaned run waits out its lease. The give-back names the runs this process itself claimed and may have left to their lease
// (below), which are not orphans (69df2f52 node.mjs:402).
// A HANDLER THAT THROWS does not fail its run (69df2f52 node.mjs:522): nothing more is sent for it, its renewals have stopped, and its
// lease lapses - any eligible node then resumes the work from the last checkpoint. Only a failure the same input meets on every attempt
// (a data exception the plane's server raised, a request the API refused as malformed) fails the run, by name (terminalFailure).
// A claimed run is worked under a LEASE GUARD that uses DURATIONS ONLY, on the monotonic clock: the length of each grant is the
// plane's lease_expires_at minus its server_time (both from the same answer), and each grant starts at the moment its request (the
// claim, or that renewal) was SENT - never when its answer arrived. It is renewed with that same length well before it ends; a renewal
// the plane refuses (lease_lost), or one that cannot land before the lease ends, ABORTS the work - the node never completes work it
// no longer holds, whatever its wall clock says (P-2; 69df2f52 node.mjs:253).
// TERMINAL refusals (credential revoked / superseded, computer archived) stop the worker with exit 2 "REFUSED" - the supervisor does not
// restart it (no restart loop) - unless a pending rotation of this node explains a superseded credential: then the rotation is
// resolved with the stored key and the worker continues (or exits 7 so the supervisor restarts it on the new key at once).
// A refused registration exits 3 (the supervisor retries it later with the same credential), except the S-14 refusal
// (s16a_bound_fingerprint), which every retry meets again: it is REFUSED too.
import { performance } from 'node:perf_hooks';
import { NodeApi, TERMINAL } from './api.mjs';
import { HANDLERS, AUTHORING_TYPES } from './handlers.mjs';
import { fingerprintProblem, hostname, machineFingerprintAsync, osName, resources } from './identity.mjs';
import { loadKey, newKey, storeKey } from './keys.mjs';
import { logger, paths, readJson, writeJson } from './home.mjs';
import { adoptIfInstalled, takePublished } from './upgrade.mjs';
import { mergeRevocations } from './revocations.mjs';
import { holdPipe } from './instance.mjs';
import { beginRotation, pendingRotation, promotePending, resolvePendingRotation, unknownOutcome } from './credential.mjs';

export const EXIT_WORKER = { STOPPED: 0, ERROR: 1, REFUSED: 2, REGISTRATION: 3, SWITCH_RELEASE: 4, RELEASE_REVOKED: 5, ALREADY: 6, CREDENTIAL_ROTATED: 7 };
/** what the claim names: every authoring type this runtime has a handler for, and the reserved type of verification work */
export const CLAIM_TYPES = Object.freeze([...AUTHORING_TYPES, 'verification']);
const ROTATION_PAUSE_MS = 10 * 60 * 1000;
const PENDING_RETRY_MS = 30000;

/** does the revocation list hit the release this worker runs (its digest, or the key that signed it)? */
function ownReleaseRevoked(p, runtime, rev) {
  const cur = readJson(p.current);
  const m = cur && cur.dir ? readJson(cur.dir + '\\manifest.json') : null;
  return ((rev && rev.releases) || []).some((r) => r && r.digest === runtime.digest) || !!(m && ((rev && rev.key_ids) || []).includes(m.key_id));
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));

class Terminal extends Error { constructor(r) { super('REFUSED: ' + r.refused + ' - ' + (r.message || '')); this.refusal = r; } }

/** the lease the plane granted, as a duration: its lease_expires_at minus its server_time (one transaction's clock); held to 5..600 s,
 *  and 5 s (the shortest the plane grants) when the answer does not state both */
export function grantedLeaseMs(expiresAt, serverTime) {
  const g = Date.parse(expiresAt) - Date.parse(serverTime);
  return Number.isFinite(g) && g > 0 ? Math.max(5000, Math.min(600000, g)) : 5000;
}

/** a claim answer that proves nothing about whether the claim committed (a SQLSTATE rollback and the named lock refusal do) */
export const claimAnswerLost = (c) => unknownOutcome(c) && !['server_refused', 'claim_lock_busy'].includes(c && c.refused);

// refusals of the REQUEST ITSELF, whoever sends it and whenever: the API's reading of the caller's own bytes, and a body naming an identity
const REQUEST_REFUSALS = new Set(['bad_request', 'identity_from_body_refused', 'body_too_large']);

/**
 * WHAT A HANDLER'S ERROR MEANS FOR ITS AUTHORING RUN (P-2 restart / recovery): the certified rule of 69df2f52, node.mjs:522-540.
 * A thrown worker does NOT mark its run failed: the error may be transient, and the lease is the arbiter. Nothing more is sent for
 * the run - no completion, no release - and its renewals have stopped, so its lease lapses and any eligible node resumes the work
 * from the last checkpoint (the next claim's reaper), the first owner fenced in renew, checkpoint and complete.
 * EXCEPT a failure the same input meets on every attempt, which would be claimed and thrown again every lease period, holding its
 * dependents forever (node.mjs:525). That run fails, by name, and its work order with it:
 *   data_exception_<SQLSTATE>   the plane's SERVER raised a data exception (class 22) and rolled the call back: 500 server_refused,
 *                               its sqlstate stated by the API;
 *   request_refused_<name>      the API ANSWERED that the request itself is malformed (bad_request, identity_from_body_refused,
 *                               body_too_large). At 69df2f52 such a value reached the database and raised that data exception; the
 *                               API reads the request first and names it.
 * Returns the termination reason of a terminal failure, or null: the run is left to its lease.
 */
export function terminalFailure(error) {
  const r = error && error.refusal;
  if (!r || typeof r !== 'object') return null;
  if (r.refused === 'server_refused') return typeof r.sqlstate === 'string' && /^22[0-9A-Z]{3}$/.test(r.sqlstate) ? 'data_exception_' + r.sqlstate : null;
  return !unknownOutcome(r) && REQUEST_REFUSALS.has(r.refused) ? 'request_refused_' + r.refused : null;
}

// keyIo and rotationPauseMs are test seams (the developer suites make a key write fail once, and shorten the pause after it)
export async function runWorker({ home, runtime = {}, pollMs = 5000, once = false, fetchImpl, standbyOnly = false, keyIo = { newKey, storeKey, loadKey }, rotationPauseMs = ROTATION_PAUSE_MS } = {}) {
  const log = logger('worker', home, { echo: !!process.env.BRAIN_FACTORY_ECHO });
  const started = new Date().toISOString();
  const ctl = { stop: false, state: 'STARTING', abort: null, wake: null };
  const pipe = await holdPipe(home, 'worker', () => ({ role: 'worker', pid: process.pid, state: ctl.state, started }), (cmd) => {
    if (cmd !== 'stop') return;
    ctl.stop = true;
    if (ctl.abort) ctl.abort.abort('the supervisor asked this worker to stop');
    if (ctl.wake) ctl.wake();
  });
  if (!pipe.held) { log('another worker runs for this home (its pipe is held' + (pipe.error ? ': ' + pipe.error : '') + '): this one exits before any call'); return EXIT_WORKER.ALREADY; }
  try { return await runHeld({ home, runtime, pollMs, once, fetchImpl, standbyOnly, keyIo, rotationPauseMs, log, ctl }); } finally { await pipe.close(); }
}

async function runHeld({ home, runtime, pollMs, once, fetchImpl, standbyOnly, keyIo, rotationPauseMs, log, ctl }) {
  const p = paths(home);
  let cfg = readJson(p.config);
  if (!cfg || !cfg.credential_id) { log('not enrolled: run setup with a pairing code first'); return EXIT_WORKER.ERROR; }
  const k = await keyIo.loadKey(p.key, cfg.public_key);
  if (!k.ok) { log('the node key cannot be read: ' + k.fix); return EXIT_WORKER.ERROR; }
  if (k.mismatch) log('config.json names another public key than the stored node key: the stored key is used');
  const api = new NodeApi({ api: cfg.api, key: k.key, fetchImpl, log });
  const status = (s) => writeJson(p.status, { ...readJson(p.status, {}), ...s, at: new Date().toISOString(), pid: process.pid });
  const setState = (s) => { ctl.state = s.state || ctl.state; status(s); };
  const check = (r) => { if (r && TERMINAL.has(r.refused)) throw new Terminal(r); return r; };
  const res = () => resources(home);
  let fpNamed = null;
  // (read without blocking: the pipe keeps answering "whois" and "stop" while PowerShell runs; the request waits for the value)
  const fp = async () => {
    const f = await machineFingerprintAsync();
    const why = f ? null : fingerprintProblem();
    if (why !== fpNamed) { if (why) log(why + ': the machine fingerprint is not reported until it can be read'); status({ fingerprint_problem: why }); fpNamed = why; }
    return f || undefined;
  };
  const stopFile = () => process.env.BRAIN_FACTORY_STOP_FILE_CHECK !== '0' && !!readJson(p.stop);
  const nap = (ms) => new Promise((ok) => { const t = setTimeout(() => { ctl.wake = null; ok(); }, Math.max(0, ms)); ctl.wake = () => { clearTimeout(t); ctl.wake = null; ok(); }; });

  // ---- the credential: a rotation whose answer was lost is resolved with the stored key (credential.mjs); the worker is its resolver
  let rotationPausedUntil = 0, pendingRetryAt = 0;
  const useKey = (key) => { api.key = key; api.token = null; cfg = readJson(p.config) || cfg; };
  const settleRotation = async () => {
    const out = await resolvePendingRotation({ home, api, fetchImpl, log, keyIo });
    if (out.key && (out.state === 'promoted' || out.registered)) useKey(out.key);
    if (out.state === 'promoted') status({ rotation: { state: 'ROTATED', at: new Date().toISOString() } });
    else if (out.state === 'discarded') status({ rotation: { state: 'ROTATION_DISCARDED', why: out.why, at: new Date().toISOString() } });
    else if (out.state === 'unknown') { pendingRetryAt = performance.now() + PENDING_RETRY_MS; status({ rotation: { state: 'ROTATION_PENDING', why: out.why, at: new Date().toISOString() } }); log('rotation outcome not known yet: ' + out.why); }
    return out;
  };
  const rotateKey = async () => {
    if (performance.now() < rotationPausedUntil) return;
    if (pendingRotation(home).any) { await settleRotation(); return; }
    // the new key and the record are durable before the request (credential.mjs beginRotation); nothing is sent otherwise
    const b = await beginRotation({ home, keyIo, newKey: keyIo.newKey });
    if (!b.sent) {
      rotationPausedUntil = performance.now() + rotationPauseMs;
      log('rotation postponed (' + b.refused + '): ' + b.why + '; nothing was sent and the current credential stays in use');
      status({ rotation: { state: 'ROTATION_REFUSED', refused: b.refused, at: new Date().toISOString() } });
      return;
    }
    const r = await api.rotate(b.nk);
    if (!r.ok) { log('rotation answer: ' + (r.refused || r.http || 'none') + ' - resolved with the stored new key'); await settleRotation(); return; }
    const nk = { privateKey: b.nk.privateKey, publicKey: b.nk.publicKey };
    useKey(nk); // the plane swapped: the old credential is superseded from now on
    try {
      await promotePending({ home, pk: { privateKeyDer: b.nk.privateKeyDer, key: nk }, credentialId: r.credential_id, keyIo });
      cfg = readJson(p.config) || cfg;
      log('credential rotated: the new key is registered, the old credential is superseded');
      status({ rotation: { state: 'ROTATED', at: new Date().toISOString() } });
    } catch (e) {
      log('credential rotated, but the new key could not be saved as the node key yet (' + ((e && e.code) || 'error') + '): the pending record stays and is resolved on the next pass');
      status({ rotation: { state: 'ROTATION_PENDING', why: 'saving the new key failed', at: new Date().toISOString() } });
    }
  };

  try {
    // a rotation an earlier run of this home left pending (its answer lost, or its promotion not finished) is resolved before the
    // first request, with the stored key: the node starts on the credential the plane holds, not on one it superseded
    const leftPending = pendingRotation(home).any;
    if (leftPending) {
      const out = await settleRotation();
      if (out.state === 'unknown' && !out.registered) { setState({ state: 'ROTATION_PENDING', message: out.why }); return EXIT_WORKER.ERROR; }
    }
    await api.time();
    const s = check(await api.session());
    if (!s.ok) { log('no session: ' + s.refused + ' ' + (s.message || '')); setState({ state: 'NO_SESSION', refused: s.refused }); return EXIT_WORKER.ERROR; }
    const reg = check(await api.op('register', { runtime_version: runtime.version || '0.0.0', runtime_digest: runtime.digest || undefined,
      fingerprint: await fp(), hostname: hostname(), os: osName(), resources: res() }));
    if (!reg.ok) {
      log('registration refused: ' + reg.refused + ' - ' + (reg.message || ''));
      // S-14: this computer reported a fingerprint that a record carrying the S-16(a) binding reported. Every retry is refused the same
      // way, so the worker ends with state REFUSED and the REFUSED exit, which the supervisor treats as final (no retry loop); only
      // Add Computer with the binding enrolls this computer again during this milestone
      if (reg.reason === 's16a_bound_fingerprint') {
        setState({ state: 'REFUSED', refused: reg.refused, reason: reg.reason, enrollment_state: reg.enrollment_state || null, message: reg.message });
        return EXIT_WORKER.REFUSED;
      }
      setState({ state: reg.enrollment_state || 'REGISTRATION_FAILED', refused: reg.refused, reason: reg.reason || reg.message });
      return EXIT_WORKER.REGISTRATION;
    }
    log('registered ' + reg.node_id + ' (' + reg.enrollment_state + ', release ' + (reg.release && reg.release.current ? 'current' : 'NOT current') + ', envelope v' + (reg.envelope && reg.envelope.version) + ')');
    // the revocation list only grows (revocations.mjs); the standby check reads the merged list
    const rev0 = reg.revocations ? mergeRevocations(home, reg.revocations) : readJson(p.revocations, null);
    let standby = !!standbyOnly || !!(rev0 && ownReleaseRevoked(p, runtime, rev0));
    setState({ state: 'RECOVERING', node_id: reg.node_id, enrollment_state: reg.enrollment_state, release_current: !!(reg.release && reg.release.current) });
    check(await api.op('heartbeat', { phase: 'RECOVERING', resources: res() }));
    const rec = check(await api.op('release', { keep_run_ids: [] }));
    if (rec.ok && rec.released) log('reconciled: gave back ' + rec.released + ' run(s) this node held before its restart');
    let hb = check(await api.op('heartbeat', { phase: 'AVAILABLE', resources: res() }));
    setState({ state: hb.ok ? hb.phase : 'ERROR', cycle_completed: false });

    let giveBack = 0; // lost claim answers whose possible run is still to be given back before the next claim
    // THE RUNS THIS PROCESS CLAIMED, each until three of its leases after it stopped working on it (69df2f52 node.mjs:402 `mine`). A run
    // it left to its lease - a thrown handler, a completion that did not land - is not an orphan: the give-back after a lost claim
    // answer keeps it, and gives back only what the lost claim may have taken. A finished or released run is not in progress, so
    // naming it changes nothing; only a run within a few leases can still be in progress, so older entries are dropped.
    const mine = new Map();
    const kept = () => { for (const [run, until] of mine) if (performance.now() > until) mine.delete(run); return [...mine.keys()]; };
    for (;;) {
      if (ctl.stop || stopFile()) { log('stop requested'); break; }
      if (pendingRotation(home).any && performance.now() >= pendingRetryAt) await settleRotation();
      hb = check(await api.op('heartbeat', { phase: 'AVAILABLE', resources: res() }));
      if (!hb.ok) { log('heartbeat refused: ' + hb.refused); await nap(pollMs); continue; }
      if (hb.revocations) { const rev = mergeRevocations(home, hb.revocations); if (ownReleaseRevoked(p, runtime, rev)) standby = true; }
      status({ adopted_release: hb.adopted_release || null });
      const sw = hb.adopted_release ? adoptIfInstalled(home, hb.adopted_release, runtime.digest) : null;
      if (sw && !sw.missing) { log('a Factory admin adopted release ' + hb.adopted_release.version + ': switching to it (never a silent downgrade)'); setState({ state: 'SWITCHING', message: 'adopting ' + hb.adopted_release.version }); return EXIT_WORKER.SWITCH_RELEASE; }
      if (sw && sw.missing) log('a Factory admin adopted release ' + hb.adopted_release.version + ', which is not installed here: install it with `upgrade`');
      // THE PUBLISHED RELEASE, TAKEN BY ITSELF (upgrade.mjs "take"; CR-028): a published release of this channel that is not the one
      // running here, with no admin adopt pinning this computer, is fetched from this artifact's release storage and offered to the one
      // upgrade gate; once installed the worker switches to it exactly as for an adopt (the supervisor verifies it again before it runs)
      const tk = await takePublished({ home, published: hb.published_releases, adopted: hb.adopted_release, running: runtime,
        ...(runtime.channel ? { channel: runtime.channel } : {}), ...(runtime.release_base ? { releaseBase: runtime.release_base } : {}), ...(fetchImpl ? { fetchImpl } : {}) });
      if (tk && tk.ok && tk.digest && tk.digest !== runtime.digest) { log('the published release ' + tk.version + ' is installed: switching to it'); setState({ state: 'SWITCHING', message: 'taking the published release ' + tk.version }); return EXIT_WORKER.SWITCH_RELEASE; }
      if (tk && tk.attempted && !tk.ok) log('the published release ' + tk.version + ' was not taken: ' + tk.refused + (tk.message ? ' - ' + tk.message : ''));
      // STANDBY: the release this node runs is revoked (its digest or its signing key). It claims and runs nothing, says so, and never
      // downgrades on its own - it waits for a Factory admin to adopt a certified release (contract §6), then switches to it.
      if (standby) { setState({ state: 'RELEASE_REVOKED', message: 'the release this node runs is revoked: no work is claimed until a Factory admin adopts a certified release' }); await nap(pollMs); if (once) break; continue; }
      if (hb.rotate_required) await rotateKey();
      if (!hb.release_current) { setState({ state: 'RELEASE_NOT_CURRENT', message: 'this node runs a release that is not current (revoked or superseded without an adopt): it claims nothing and waits for an adopted certified release' }); await nap(pollMs); if (once) break; continue; }
      if (hb.draining) { setState({ state: 'DRAINING' }); await nap(pollMs); if (once) break; continue; }
      if (giveBack > 0) { await api.op('release', { keep_run_ids: kept() }, { retries: 0 }).catch(() => {}); giveBack--; }
      const fpv = await fp();
      if (ctl.stop) continue;
      let did = false;
      const sentAt = performance.now();
      const c = check(await api.op('claim', { work_types: [...CLAIM_TYPES], resources: res(), fingerprint: fpv, base_commit: runtime.source_commit || undefined }, { retries: 0 }));
      if (c.ok && c.claimed) {
        did = true;
        await workClaimed({ api, claimed: c.claimed, log, status: setState, check, sentAt, serverTime: c.server_time, onAbortable: (ac) => { ctl.abort = ac; } });
        ctl.abort = null;
        mine.set(c.claimed.run_id, performance.now() + 3 * grantedLeaseMs(c.claimed.lease_expires_at, c.server_time));
      } else if (claimAnswerLost(c)) {
        log('the claim\'s answer was lost (' + (c && (c.refused || c.http)) + '): whatever it may have taken is given back now and again before the next claim');
        await api.op('release', { keep_run_ids: kept() }, { retries: 0 }).catch(() => {});
        giveBack = 1;
      } else if (!c.ok && c.refused !== 'claim_lock_busy' && c.refused !== 'server_refused') log('claim refused: ' + c.refused + ' ' + (c.message || ''));
      setState({ state: 'AVAILABLE', cycle_completed: true, last_cycle: new Date().toISOString() });
      if (once) break;
      if (!did) await nap(pollMs);
    }
    await api.op('heartbeat', { phase: 'AVAILABLE' }).catch(() => {});
    return EXIT_WORKER.STOPPED;
  } catch (e) {
    if (e instanceof Terminal) {
      // a superseded credential while a rotation of this node is pending (or after its new key was stored): the rotation committed
      // and its answer was lost - resolve it with the stored key instead of stopping REFUSED
      if (e.refusal.refused === 'credential_superseded') {
        if (pendingRotation(home).any) {
          const out = await settleRotation().catch((x) => ({ state: 'unknown', why: String(x && x.message || x) }));
          if (out.state === 'promoted' || out.registered) { log('the superseded credential was this node\'s own rotation: restarting on the new key'); return EXIT_WORKER.CREDENTIAL_ROTATED; }
          if (out.state === 'unknown') { setState({ state: 'ROTATION_PENDING', message: out.why }); return EXIT_WORKER.ERROR; }
        }
        const disk = await keyIo.loadKey(p.key).catch(() => ({ ok: false }));
        if (disk.ok && !disk.key.publicKey.equals(api.key.publicKey)) { log('the node key on disk is newer than the one in use: restarting on it'); return EXIT_WORKER.CREDENTIAL_ROTATED; }
      }
      log(e.message);
      setState({ state: 'REFUSED', refused: e.refusal.refused, message: e.refusal.message });
      return EXIT_WORKER.REFUSED;
    }
    log('worker error: ' + (e && e.message || e));
    setState({ state: 'ERROR', message: String(e && e.message || e) });
    return EXIT_WORKER.ERROR;
  }
}

/** a promise that settles with `value` after `ms` unless `p` settles first (the timer is cleared either way) */
function within(p, ms, value) {
  let t;
  return Promise.race([p, new Promise((ok) => { t = setTimeout(() => ok(value), Math.max(0, ms)); })]).finally(() => clearTimeout(t));
}

/**
 * ONE CLAIMED RUN, under the lease guard. sentAt: performance.now() taken just before the claim was sent; serverTime: the claim
 * answer's server_time. A lease that cannot be held aborts the work, which then never completes. Exported for the unit rows.
 */
export async function workClaimed({ api, claimed, log = () => {}, status = () => {}, check = (r) => r, sentAt = performance.now(), serverTime, onAbortable = () => {} }) {
  const kind = claimed.kind === 'verification' ? 'verification' : 'authoring';
  const grantedMs = grantedLeaseMs(claimed.lease_expires_at, serverTime);
  const leaseSeconds = Math.max(5, Math.min(600, Math.round(grantedMs / 1000)));
  const margin = Math.min(5000, Math.floor(grantedMs / 3));
  const renewEvery = Math.max(1000, Math.min(30000, Math.floor(grantedMs / 3)));
  let leaseEnd = sentAt + grantedMs; // on the monotonic clock, from the moment the claim was sent
  const ac = new AbortController();
  onAbortable(ac);
  let stopped = false, wake = null;
  const nap = (ms) => new Promise((ok) => { const t = setTimeout(() => { wake = null; ok(); }, Math.max(0, ms)); wake = () => { clearTimeout(t); wake = null; ok(); }; });
  const wt = claimed.work_order && claimed.work_order.work_type;
  const handler = kind === 'verification' ? HANDLERS.verification : (AUTHORING_TYPES.includes(wt) ? HANDLERS[wt] : null);
  status({ state: 'BUSY', run_id: claimed.run_id, work_order_id: claimed.work_order.work_order_id, kind });
  if (!handler) {
    // never completed as failed: a work order this runtime has no handler for is given back for a node that has one
    log('claimed ' + kind + ' work of type ' + wt + ', which this runtime has no handler for: the run is given back');
    await api.op('release', { run_id: claimed.run_id }, { retries: 0 }).catch(() => {});
    return;
  }
  log('claimed ' + kind + ' ' + claimed.work_order.work_order_id.slice(0, 8) + ' run ' + claimed.run_id.slice(0, 8) + ' (lease ' + leaseSeconds + ' s)');
  const guard = (async () => {
    let lastFailed = false;
    while (!stopped) {
      const left = leaseEnd - margin - performance.now();
      if (left <= 0) { ac.abort('the lease could not be renewed before it ends'); break; }
      await nap(Math.min(lastFailed ? 1000 : renewEvery, left));
      if (stopped) break;
      const rs = performance.now();
      if (rs >= leaseEnd - margin) { ac.abort('the lease could not be renewed before it ends'); break; }
      const r = await within(api.op('renew', { run_id: claimed.run_id, lease_seconds: leaseSeconds }, { retries: 0 }), leaseEnd - margin - rs, { ok: false, refused: 'renew_timeout' });
      if (stopped) break;
      // (the renewed grant starts when the renewal was sent - rs - not when its answer arrived)
      if (r && r.ok) { leaseEnd = rs + grantedLeaseMs(r.lease_expires_at, r.server_time); lastFailed = false; }
      else if (r && (r.refused === 'lease_lost' || r.refused === 'renew_timeout' || TERMINAL.has(r.refused))) { ac.abort(r.refused); break; }
      else lastFailed = true;
    }
  })();
  let outcome;
  try {
    outcome = await handler({ api, claimed, signal: ac.signal, log });
  } catch (e) {
    outcome = { error: e };
  }
  stopped = true;
  if (wake) wake();
  await guard.catch(() => {});
  if (ac.signal.aborted) {
    log('ABORTED run ' + claimed.run_id.slice(0, 8) + ': ' + ac.signal.reason + ' - the work is not completed by this node');
    await api.op('release', { run_id: claimed.run_id }, { retries: 0 }).catch(() => {});
    return;
  }
  if (outcome.error) {
    const refusal = outcome.error.refusal;
    if (refusal) check(refusal);
    const short = claimed.run_id.slice(0, 8), said = String(outcome.error.message).slice(0, 500);
    if (kind === 'verification') {
      log('verification run ' + short + ' threw: ' + said + ' - its claim is given back');
      await api.op('release', { run_id: claimed.run_id });
      return;
    }
    // a thrown handler does not fail its run, except a failure the same input meets on every attempt (terminalFailure above)
    const reason = terminalFailure(outcome.error);
    if (reason) {
      const r = await api.op('complete', { run_id: claimed.run_id, status: 'failed', termination_reason: reason, summary: said });
      if (r && r.ok) log('FAILED run ' + short + ' (' + reason + ': ' + said.slice(0, 120) + ') - the same input fails every time; its work order is failed');
      else log('run ' + short + ' met ' + reason + ' and could not be recorded failed (' + ((r && (r.refused || r.http)) || 'no answer') + '): its lease is left to expire');
      return;
    }
    if (refusal && refusal.refused === 'lease_lost') { log('run ' + short + ' is no longer this node\'s (lease_lost): nothing is completed - the node that holds the work completes it'); return; }
    log('run ' + short + ' threw: ' + said.slice(0, 120));
    log('leaving the lease to expire so the work is recoverable rather than lost');
    return;
  }
  if (kind === 'verification') {
    const r = check(await api.op('certify', { run_id: claimed.run_id, ...outcome.certify }));
    log('certify ' + outcome.certify.verdict + ' for ' + outcome.certify.work_order_id.slice(0, 8) + ': ' + (r.ok ? 'recorded' : 'refused ' + r.refused + ' ' + (r.message || '')));
  } else {
    const r = check(await api.op('complete', { run_id: claimed.run_id, ...outcome }));
    log('complete ' + claimed.run_id.slice(0, 8) + ': ' + (r.ok ? 'done' : 'refused ' + r.refused + (r.landed ? ' (it had landed)' : '')));
  }
}

