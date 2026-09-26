// THE SUPERVISOR (WO-4): the process the logon task and the watchdog start. One per home (an instance lock). It VERIFIES THE RELEASE
// it is about to run (the start-path verification point of WO-6: manifest signature, key id and PE image hash against the trust set
// fixed in this artifact, and the revocations the API delivered) BEFORE it starts a worker from it, then keeps one worker running:
//   worker exit 0     stopped on request              -> the supervisor stops
//   worker exit 2     REFUSED (credential revoked / superseded, computer archived) -> NOT restarted: recorded, and a later supervisor
//                     start does not retry it until the credential changes (re-pair) - no restart loop
//   worker exit 3     registration refused             -> retried with the same credential, backing off
//   a REVOKED installed release (its digest or its signing key): the worker runs in STANDBY - heartbeats only, no work - until an admin
//   adopts a certified release; a release that fails verification for any other reason (tampered, unsigned, untrusted) never runs
//   worker exit 4     it switched to another installed release (an admin adopt): started again at once, verified again
//   anything else     crash                            -> restarted with a backoff 5 s .. 5 min on the MONOTONIC clock, reset once a
//                                                          worker completed a claim cycle
// A killed runtime is therefore restarted (by this supervisor, or by the watchdog when the supervisor itself was killed).
//
// THE SUPERVISOR ITSELF (S-5), when it runs as a built artifact (selfExe): it VERIFIES ITSELF FIRST, as setup does - it runs only as a
// release installed in this home (current or previous) whose signed manifest verifies against the trust set pinned in it (a revoked
// one may still stand by or hand off; a tampered, unsigned or untrusted one starts nothing). And it never outlives a switch: when
// the current certified release is not its own (an adopt, an upgrade), it RE-POINTS the logon task to that release's exe, starts that
// exe's supervisor and exits - so the task never keeps executing a superseded or revoked binary. A revoked current release is never
// handed to (it stands by), and nothing is ever downgraded.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { logger, paths, readJson, writeJson } from './home.mjs';
import { verifyRelease } from './release.mjs';
import { authenticodeImageHash } from './pe-image.mjs';
import { registerTasks } from './tasks.mjs';

export const EXIT_SUPERVISOR = { STOPPED: 0, ALREADY: 0, RELEASE_REFUSED: 3, REFUSED: 2 };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

/** take the home's instance lock, or say who holds it */
export function takeLock(home) {
  const p = paths(home);
  const cur = readJson(p.lock);
  if (cur && cur.pid && cur.pid !== process.pid && alive(cur.pid)) return { ok: false, holder: cur };
  const mine = { pid: process.pid, token: randomBytes(8).toString('hex'), started: new Date().toISOString() };
  writeJson(p.lock, mine);
  const back = readJson(p.lock);
  return back && back.token === mine.token ? { ok: true, lock: mine } : { ok: false, holder: back };
}

/** the start-path check: the installed release, verified against THIS artifact's pinned trust set */
export function verifyInstalled(home, { ignoreRevocations = false } = {}) {
  const p = paths(home);
  const cur = readJson(p.current);
  if (!cur || !cur.dir) return { ok: false, refused: 'not_installed', message: 'no runtime is installed in ' + home };
  const exe = cur.dir + '\\BrainFactory.exe';
  const manifest = readJson(cur.dir + '\\manifest.json');
  if (!existsSync(exe) || !manifest) return { ok: false, refused: 'not_installed', message: 'the installed runtime is incomplete' };
  const revocations = ignoreRevocations ? { key_ids: [], releases: [] } : readJson(p.revocations, { key_ids: [], releases: [] });
  const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations });
  return v.ok ? { ...v, exe, manifest } : v;
}

/** which installed release is THIS process (by image hash), verified like any start (revocations aside: a revoked one may hand off) */
export function verifySelf(home, selfExe) {
  const p = paths(home);
  let digest;
  try { digest = authenticodeImageHash(readFileSync(selfExe)); } catch (e) { return { ok: false, refused: 'self_unreadable', message: 'this supervisor cannot read its own image: ' + (e.code || e.message) }; }
  // installed here = a release directory under runtime/ (current, previous or older) whose signed manifest names this image hash
  let dirs = [];
  try { dirs = readdirSync(p.runtime, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(p.runtime, d.name)); } catch { /* none */ }
  const dir = [readJson(p.current), readJson(p.previous)].filter((r) => r && r.dir).map((r) => r.dir).concat(dirs)
    .find((d) => { const m = readJson(join(d, 'manifest.json')); return m && m.digest === digest; });
  if (!dir) return { ok: false, refused: 'not_an_installed_release', message: 'this supervisor (image hash ' + digest.slice(0, 16) + '...) is no release installed in ' + home + ': it starts nothing', digest };
  return { ...verifyRelease({ manifest: readJson(join(dir, 'manifest.json')), artifact: readFileSync(selfExe) }), digest };
}

export async function runSupervisor({ home, workerCommand, selfExe = null, startSupervisor = null }) {
  const p = paths(home);
  const log = logger('supervisor', home, { echo: !!process.env.BRAIN_FACTORY_ECHO });
  const lock = takeLock(home);
  if (!lock.ok) { log('another supervisor runs for this home (pid ' + (lock.holder && lock.holder.pid) + '): nothing to do'); return EXIT_SUPERVISOR.ALREADY; }
  const cfg = readJson(p.config);
  const status = readJson(p.status, {});
  if (status.state === 'REFUSED' && cfg && status.credential_id === cfg.credential_id) {
    log('this credential was REFUSED (' + status.refused + '): the worker is not started again; a Factory admin re-pairs the computer');
    rmSync(p.lock, { force: true });
    return EXIT_SUPERVISOR.REFUSED;
  }
  // ITSELF FIRST (S-5)
  let selfDigest = null;
  if (selfExe) {
    const sv = verifySelf(home, selfExe);
    if (!sv.ok) {
      log('SUPERVISOR REFUSED before it starts anything: ' + sv.refused + ' - ' + sv.message);
      writeJson(p.status, { ...readJson(p.status, {}), state: 'RELEASE_REFUSED', refused: sv.refused, message: sv.message, at: new Date().toISOString() });
      rmSync(p.lock, { force: true });
      return EXIT_SUPERVISOR.RELEASE_REFUSED;
    }
    selfDigest = sv.digest;
  }
  let backoffMs = 5000;
  rmSync(p.stop, { force: true });
  for (;;) {
    // VERIFIED AT EVERY WORKER START - an upgrade or an adopted release is checked again before it runs
    let v = verifyInstalled(home);
    let standby = false;
    if (!v.ok && (v.refused === 'release_revoked' || v.refused === 'key_revoked')) {
      // a REVOKED installed release (not a forged or tampered one): the worker runs in STANDBY only - heartbeats, no claims, no work -
      // so it hears a Factory admin's adopt of a certified release (contract §6); it never downgrades on its own
      const vs = verifyInstalled(home, { ignoreRevocations: true });
      if (vs.ok) { log('the installed release is revoked (' + v.refused + '): standby only - no work until a Factory admin adopts a certified release'); v = vs; standby = true; }
    }
    if (!v.ok) {
      log('RELEASE REFUSED before execution: ' + v.refused + ' - ' + v.message);
      writeJson(p.status, { ...readJson(p.status, {}), state: 'RELEASE_REFUSED', refused: v.refused, message: v.message, at: new Date().toISOString() });
      rmSync(p.lock, { force: true });
      return EXIT_SUPERVISOR.RELEASE_REFUSED;
    }
    log('release verified: ' + v.version + ' (' + v.channel + ', image hash ' + v.digest.slice(0, 16) + '..., key ' + v.key_id.slice(0, 20) + '...)');
    // HAND OFF when the current certified release is not this supervisor's own (never to a revoked one: standby stays here)
    if (selfDigest && !standby && v.digest !== selfDigest && startSupervisor) {
      const task = (readJson(p.config) || {}).task;
      if (task && task.name) {
        const t = registerTasks({ name: task.name, exe: v.exe, home: task.home_arg ? home : null });
        log(t.ok ? 'logon task "' + task.name + '" now starts ' + v.version + ' (' + v.exe + ')' : 'the logon task could not be re-pointed (' + t.error + '): this supervisor keeps running ' + v.version + ' workers');
        if (!t.ok) { /* no handoff without the task following: fall through and keep supervising */ }
        else { rmSync(p.lock, { force: true }); startSupervisor(v.exe); log('handed off to the supervisor of ' + v.version); return EXIT_SUPERVISOR.STOPPED; }
      } else { rmSync(p.lock, { force: true }); startSupervisor(v.exe); log('handed off to the supervisor of ' + v.version + ' (no logon task registered for this home)'); return EXIT_SUPERVISOR.STOPPED; }
    }
    const started = performance.now();
    const cmd = workerCommand(v, { standby });
    const child = spawn(cmd.exe, cmd.args, { stdio: 'ignore', windowsHide: true, env: { ...process.env, BRAIN_FACTORY_HOME: home } });
    writeJson(p.lock, { ...readJson(p.lock), worker_pid: child.pid });
    const code = await new Promise((ok) => child.on('exit', (c) => ok(c === null ? 1 : c)));
    const st = readJson(p.status, {});
    if (existsSync(p.stop) || code === 0) { log('worker stopped (exit ' + code + ')'); break; }
    if (code === 2) {
      log('worker REFUSED (' + (st.refused || '?') + '): not restarted');
      writeJson(p.status, { ...st, credential_id: (readJson(p.config) || {}).credential_id });
      break;
    }
    if (code === 4) { log('worker switched releases (' + (st.message || 'adopt / upgrade') + '): starting the new current release now'); backoffMs = 5000; continue; }
    if (st.cycle_completed && performance.now() - started > 10000) backoffMs = 5000;
    log('worker exited ' + code + (code === 3 ? ' (registration refused: ' + (st.refused || '') + ')' : '') + '; restart in ' + Math.round(backoffMs / 1000) + ' s');
    const until = performance.now() + backoffMs;
    while (performance.now() < until) { if (existsSync(p.stop)) break; await sleep(Math.min(1000, until - performance.now())); }
    if (existsSync(p.stop)) { log('stop requested during backoff'); break; }
    backoffMs = Math.min(300000, backoffMs * 2);
  }
  rmSync(p.lock, { force: true });
  return EXIT_SUPERVISOR.STOPPED;
}
