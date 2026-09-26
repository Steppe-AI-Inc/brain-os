// THE SUPERVISOR (WO-4): the process the logon task and the watchdog start. One per home (an instance lock). It VERIFIES THE RELEASE
// it is about to run (the start-path verification point of WO-6: manifest signature, key id and PE image hash against the trust set
// fixed in this artifact, and the revocations the API delivered) BEFORE it starts a worker from it, then keeps one worker running:
//   worker exit 0     stopped on request              -> the supervisor stops
//   worker exit 2     REFUSED (credential revoked / superseded, computer archived) -> NOT restarted: recorded, and a later supervisor
//                     start does not retry it until the credential changes (re-pair) - no restart loop
//   worker exit 3     registration refused             -> retried with the same credential, backing off
//   worker exit 5     its own release (digest or signing key) was revoked: verified again at once - and refused
//   worker exit 4     it switched to another installed release (an admin adopt): started again at once, verified again
//   anything else     crash                            -> restarted with a backoff 5 s .. 5 min on the MONOTONIC clock, reset once a
//                                                          worker completed a claim cycle
// A killed runtime is therefore restarted (by this supervisor, or by the watchdog when the supervisor itself was killed).
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { logger, paths, readJson, writeJson } from './home.mjs';
import { verifyRelease } from './release.mjs';

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
export function verifyInstalled(home) {
  const p = paths(home);
  const cur = readJson(p.current);
  if (!cur || !cur.dir) return { ok: false, refused: 'not_installed', message: 'no runtime is installed in ' + home };
  const exe = cur.dir + '\\BrainFactory.exe';
  const manifest = readJson(cur.dir + '\\manifest.json');
  if (!existsSync(exe) || !manifest) return { ok: false, refused: 'not_installed', message: 'the installed runtime is incomplete' };
  const revocations = readJson(p.revocations, { key_ids: [], releases: [] });
  const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations });
  return v.ok ? { ...v, exe, manifest } : v;
}

export async function runSupervisor({ home, workerCommand }) {
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
  let backoffMs = 5000;
  rmSync(p.stop, { force: true });
  for (;;) {
    // VERIFIED AT EVERY WORKER START - an upgrade or an adopted release is checked again before it runs
    const v = verifyInstalled(home);
    if (!v.ok) {
      log('RELEASE REFUSED before execution: ' + v.refused + ' - ' + v.message);
      writeJson(p.status, { ...readJson(p.status, {}), state: 'RELEASE_REFUSED', refused: v.refused, message: v.message, at: new Date().toISOString() });
      rmSync(p.lock, { force: true });
      return EXIT_SUPERVISOR.RELEASE_REFUSED;
    }
    log('release verified: ' + v.version + ' (' + v.channel + ', image hash ' + v.digest.slice(0, 16) + '..., key ' + v.key_id.slice(0, 20) + '...)');
    const started = performance.now();
    const cmd = workerCommand(v);
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
    if (code === 5) { log('the worker found its own release revoked: verifying again (it will be refused)'); continue; }
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
