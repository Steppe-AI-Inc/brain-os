// THE ENROLLED WORKER (WO-4 runtime): one process, started and restarted by the supervisor. It speaks ONLY to the Factory Node API.
//
// START (contract §2 Runtime: any -> RECOVERING -> AVAILABLE): register (the release it runs, its fingerprint, hostname, OS, resources),
// heartbeat RECOVERING, then RECONCILE - every run this node still holds on the plane is given back (a restarted process holds no work;
// the plane requeues it for the certified takeover), so no resumed work continues without a fresh claim - then heartbeat AVAILABLE.
// LOOP: heartbeat (liveness, phase, resources); an admin-requested rotation is honoured; while draining nothing is claimed; otherwise
// claim authoring work of the types it has handlers for, and - when its envelope authorizes the verifier role - verification work.
// A claimed run is worked under a LEASE GUARD on the monotonic clock: renewed well before expiry; a renewal the plane refuses
// (lease_lost) or that cannot land before the lease ends ABORTS the work; the node never completes work it no longer holds.
// TERMINAL refusals (credential revoked / superseded, computer archived) stop the worker with exit 2 "REFUSED" - the supervisor does not
// restart it (no restart loop). A refused registration exits 3 (the supervisor retries it later with the same credential).
import { performance } from 'node:perf_hooks';
import { NodeApi, TERMINAL } from './api.mjs';
import { HANDLERS, AUTHORING_TYPES } from './handlers.mjs';
import { hostname, machineFingerprint, osName, resources } from './identity.mjs';
import { loadKey, newKey, storeKey } from './keys.mjs';
import { logger, paths, readJson, writeJson } from './home.mjs';
import { adoptIfInstalled } from './upgrade.mjs';

export const EXIT_WORKER = { STOPPED: 0, ERROR: 1, REFUSED: 2, REGISTRATION: 3, SWITCH_RELEASE: 4, RELEASE_REVOKED: 5 };

/** does a revocation the API just delivered hit the release this worker runs (its digest, or the key that signed it)? */
function ownReleaseRevoked(p, runtime, rev) {
  const cur = readJson(p.current);
  const m = cur && cur.dir ? readJson(cur.dir + '\\manifest.json') : null;
  return ((rev && rev.releases) || []).some((r) => r && r.digest === runtime.digest) || (m && ((rev && rev.key_ids) || []).includes(m.key_id));
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

class Terminal extends Error { constructor(r) { super('REFUSED: ' + r.refused + ' - ' + (r.message || '')); this.refusal = r; } }

export async function runWorker({ home, runtime = {}, pollMs = 5000, once = false, fetchImpl, standbyOnly = false } = {}) {
  const p = paths(home);
  const log = logger('worker', home, { echo: !!process.env.BRAIN_FACTORY_ECHO });
  const cfg = readJson(p.config);
  if (!cfg || !cfg.credential_id) { log('not enrolled: run setup with a pairing code first'); return EXIT_WORKER.ERROR; }
  const k = await loadKey(p.key, cfg.public_key);
  if (!k.ok) { log('the node key cannot be read: ' + k.fix); return EXIT_WORKER.ERROR; }
  const api = new NodeApi({ api: cfg.api, key: k.key, fetchImpl, log });
  const status = (s) => writeJson(p.status, { ...readJson(p.status, {}), ...s, at: new Date().toISOString(), pid: process.pid });
  const check = (r, what) => { if (r && TERMINAL.has(r.refused)) throw new Terminal(r); return r; };
  const res = () => resources(home);
  const fp = machineFingerprint();

  try {
    await api.time();
    const s = check(await api.session(), 'session');
    if (!s.ok) { log('no session: ' + s.refused + ' ' + (s.message || '')); status({ state: 'NO_SESSION', refused: s.refused }); return EXIT_WORKER.ERROR; }
    const reg = check(await api.op('register', { runtime_version: runtime.version || '0.0.0', runtime_digest: runtime.digest || undefined,
      fingerprint: fp || undefined, hostname: hostname(), os: osName(), resources: res() }), 'register');
    if (!reg.ok) {
      log('registration refused: ' + reg.refused + ' - ' + (reg.message || ''));
      status({ state: reg.enrollment_state || 'REGISTRATION_FAILED', refused: reg.refused, reason: reg.reason || reg.message });
      return EXIT_WORKER.REGISTRATION;
    }
    const roles = (reg.envelope && reg.envelope.roles) || [];
    log('registered ' + reg.node_id + ' (' + reg.enrollment_state + ', release ' + (reg.release && reg.release.current ? 'current' : 'NOT current') + ', envelope v' + (reg.envelope && reg.envelope.version) + ')');
    if (reg.revocations) writeJson(p.revocations, reg.revocations);
    let standby = !!standbyOnly || (reg.revocations && ownReleaseRevoked(p, runtime, reg.revocations));
    status({ state: 'RECOVERING', node_id: reg.node_id, enrollment_state: reg.enrollment_state, release_current: !!(reg.release && reg.release.current) });
    check(await api.op('heartbeat', { phase: 'RECOVERING', resources: res() }), 'heartbeat');
    const rec = check(await api.op('release', { keep_run_ids: [] }), 'reconcile');
    if (rec.ok && rec.released) log('reconciled: gave back ' + rec.released + ' run(s) this node held before its restart');
    let hb = check(await api.op('heartbeat', { phase: 'AVAILABLE', resources: res() }), 'heartbeat');
    status({ state: hb.ok ? hb.phase : 'ERROR', cycle_completed: false });

    for (;;) {
      if (process.env.BRAIN_FACTORY_STOP_FILE_CHECK !== '0') { const stop = readJson(p.stop); if (stop) { log('stop requested'); break; } }
      hb = check(await api.op('heartbeat', { phase: 'AVAILABLE', resources: res() }), 'heartbeat');
      if (!hb.ok) { log('heartbeat refused: ' + hb.refused); await sleep(pollMs); continue; }
      if (hb.revocations) writeJson(p.revocations, hb.revocations);
      if (hb.revocations && ownReleaseRevoked(p, runtime, hb.revocations)) standby = true;
      status({ adopted_release: hb.adopted_release || null });
      const sw = hb.adopted_release ? adoptIfInstalled(home, hb.adopted_release, runtime.digest) : null;
      if (sw && !sw.missing) { log('a Factory admin adopted release ' + hb.adopted_release.version + ': switching to it (never a silent downgrade)'); status({ state: 'SWITCHING', message: 'adopting ' + hb.adopted_release.version }); return EXIT_WORKER.SWITCH_RELEASE; }
      if (sw && sw.missing) log('a Factory admin adopted release ' + hb.adopted_release.version + ', which is not installed here: install it with `upgrade`');
      // STANDBY: the release this node runs is revoked (its digest or its signing key). It claims and runs nothing, says so, and never
      // downgrades on its own - it waits for a Factory admin to adopt a certified release (contract §6), then switches to it.
      if (standby) { status({ state: 'RELEASE_REVOKED', message: 'the release this node runs is revoked: no work is claimed until a Factory admin adopts a certified release' }); await sleep(pollMs); if (once) break; continue; }
      if (hb.rotate_required) await rotateKey({ api, p, cfg, log });
      if (!hb.release_current) { status({ state: 'RELEASE_NOT_CURRENT', message: 'this node runs a release that is not current (revoked or superseded without an adopt): it claims nothing and waits for an adopted certified release' }); await sleep(pollMs); if (once) break; continue; }
      if (hb.draining) { status({ state: 'DRAINING' }); await sleep(pollMs); if (once) break; continue; }
      let did = false;
      const c = check(await api.op('claim', { work_types: AUTHORING_TYPES, resources: res(), fingerprint: fp || undefined, base_commit: runtime.source_commit || undefined }), 'claim');
      if (c.ok && c.claimed) { did = true; await work({ api, claimed: c.claimed, kind: 'authoring', log, status, check }); }
      else if (!c.ok && c.refused !== 'claim_lock_busy') log('claim refused: ' + c.refused + ' ' + (c.message || ''));
      if (!did && roles.includes('verifier')) {
        const v = check(await api.op('verification-claim', { resources: res(), fingerprint: fp || undefined }), 'verification-claim');
        if (v.ok && v.claimed) { did = true; await work({ api, claimed: v.claimed, kind: 'verification', log, status, check }); }
      }
      status({ state: 'AVAILABLE', cycle_completed: true, last_cycle: new Date().toISOString() });
      if (once) break;
      if (!did) await sleep(pollMs);
    }
    await api.op('heartbeat', { phase: 'AVAILABLE' }).catch(() => {});
    return EXIT_WORKER.STOPPED;
  } catch (e) {
    if (e instanceof Terminal) {
      log(e.message);
      status({ state: 'REFUSED', refused: e.refusal.refused, message: e.refusal.message });
      return EXIT_WORKER.REFUSED;
    }
    log('worker error: ' + (e && e.message || e));
    status({ state: 'ERROR', message: String(e && e.message || e) });
    return EXIT_WORKER.ERROR;
  }
}

/** one claimed run, under the lease guard; a lease that cannot be held aborts the work, which then never completes */
async function work({ api, claimed, kind, log, status, check }) {
  const leaseMs = Math.max(5000, Date.parse(claimed.lease_expires_at) - Date.now());
  const ac = new AbortController();
  let leaseEnd = performance.now() + leaseMs;
  let stopped = false;
  status({ state: 'BUSY', run_id: claimed.run_id, work_order_id: claimed.work_order.work_order_id, kind });
  log('claimed ' + kind + ' ' + claimed.work_order.work_order_id.slice(0, 8) + ' run ' + claimed.run_id.slice(0, 8) + ' (lease ' + Math.round(leaseMs / 1000) + ' s)');
  const renewEvery = Math.max(1000, Math.min(30000, Math.floor(leaseMs / 3)));
  const guard = (async () => {
    while (!stopped) {
      await sleep(Math.min(renewEvery, Math.max(250, leaseEnd - performance.now() - 2000)));
      if (stopped) break;
      if (performance.now() >= leaseEnd - 1000) { ac.abort('the lease could not be renewed before it ends'); break; }
      const r = await api.op('renew', { run_id: claimed.run_id, lease_seconds: Math.round(leaseMs / 1000) }, { retries: 0 });
      if (r.ok) leaseEnd = performance.now() + leaseMs;
      else if (r.refused === 'lease_lost' || TERMINAL.has(r.refused)) { ac.abort(r.refused); break; }
    }
  })();
  let outcome;
  try {
    outcome = await HANDLERS[kind === 'verification' ? 'verification' : claimed.work_order.work_type]({ api, claimed, signal: ac.signal, log });
  } catch (e) {
    outcome = { error: e };
  }
  stopped = true;
  await guard.catch(() => {});
  if (ac.signal.aborted) {
    log('ABORTED run ' + claimed.run_id.slice(0, 8) + ': ' + ac.signal.reason + ' - the work is not completed by this node');
    await api.op('release', { run_id: claimed.run_id }, { retries: 0 }).catch(() => {});
    return;
  }
  if (outcome.error) {
    const refusal = outcome.error.refusal;
    if (refusal) check(refusal);
    log('run ' + claimed.run_id.slice(0, 8) + ' failed: ' + outcome.error.message);
    if (kind === 'authoring') await api.op('complete', { run_id: claimed.run_id, status: 'failed', termination_reason: 'handler_error', summary: String(outcome.error.message).slice(0, 500) });
    else await api.op('release', { run_id: claimed.run_id });
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

/** an admin-requested rotation: a new key made here, proved by signing, swapped atomically on the plane; the old credential superseded */
async function rotateKey({ api, p, cfg, log }) {
  const nk = await newKey();
  const r = await api.rotate(nk);
  if (!r.ok) { log('rotation refused: ' + r.refused); return; }
  await storeKey(p.key, nk);
  cfg.credential_id = r.credential_id;
  cfg.public_key = nk.publicKey.toString('base64url');
  cfg.rotated_at = new Date().toISOString();
  writeJson(p.config, cfg);
  api.key = { privateKey: nk.privateKey, publicKey: nk.publicKey };
  api.token = null;
  log('credential rotated: the new key is registered, the old credential is superseded');
}
