// BrainFactorySetup.exe SETUP (WO-3, WO-4; contract §2 Enrollment; P-4). The only human steps on the clean PC: download the file, run
// it, enter the pairing code. Everything after that is automatic, as the installing STANDARD user, with no elevation:
//   1. THIS ARTIFACT IS VERIFIED FIRST (S-5): its manifest's signature and key id against the trust set fixed in it at build time, and
//      its own PE Authenticode image hash against the manifest's digest - before a key is made or a code is spent. Refused by name.
//   2. A NEW Ed25519 KEY is made here and stored with DPAPI in an owner-only directory; the private key never leaves this computer.
//   3. enroll/start with the code ("Enroll this computer as <computer> in <tenant>?"), then enroll/complete with a proof of possession:
//      the plane issues exactly one credential, bound to this key and to the principal the code was issued for.
//   4. RUNTIME_INSTALLING: the verified artifact is copied under %LOCALAPPDATA%\BrainFactory\runtime, the logon task and its watchdog
//      are registered, the supervisor started; the runtime then registers (REGISTERING -> ALIVE on a certified release).
//   A failure after the credential exists is INSTALL_FAILED (named, in server rows); running setup again RETRIES WITH THE SAME
//   CREDENTIAL - no new code. The installer never receives a database password, a runner URL or any shared secret (S-2).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { NodeApi } from './api.mjs';
import { hostname, machineFingerprint } from './identity.mjs';
import { loadKey, newKey, storeKey } from './keys.mjs';
import { logger, paths, readJson, writeJson } from './home.mjs';
import { authenticodeImageHash } from './pe-image.mjs';
import { verifyRelease, embeddedTrust } from './release.mjs';
import { DEFAULT_TASK, registerTasks, startTask } from './tasks.mjs';

export const EXIT_SETUP = { OK: 0, FAILED: 1, USAGE: 2, RELEASE_REFUSED: 3, PAIRING_REFUSED: 5, INSTALL_FAILED: 6, NOT_ALIVE: 7, DECLINED: 8 };
const CHANNEL = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : { channel: null, default_api: null, release_base: null };
const BUILD = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null;
export const MANIFEST_FILE = 'BrainFactorySetup.manifest.json';
const MAX_MANIFEST = 65536;

/** THE MANIFEST THIS ARTIFACT IS CHECKED AGAINST (P-4: the one human download is BrainFactorySetup.exe). An explicit --manifest is
 * used as given and never replaced. Otherwise the file beside the exe; otherwise, on a channel with public release storage
 * (CR-004), <release base>/<this build's version>/BrainFactorySetup.manifest.json. However it arrives, the manifest is verified
 * against the trust set pinned in this artifact and against this exe's own image hash - where it came from adds no trust. */
export async function locateManifest({ exe, manifestArg, releaseBase = CHANNEL.release_base, version = BUILD && BUILD.runtime_version, fetchImpl = globalThis.fetch }) {
  const local = manifestArg || join(dirname(exe), MANIFEST_FILE);
  const found = readJson(local);
  if (found || manifestArg || !releaseBase || !version) return { manifest: found, from: local, tried: [local] };
  const url = releaseBase.replace(/\/+$/, '') + '/' + encodeURIComponent(version) + '/' + MANIFEST_FILE;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) return { manifest: null, from: url, tried: [local, url], detail: 'HTTP ' + r.status };
    const text = await r.text();
    if (text.length > MAX_MANIFEST) return { manifest: null, from: url, tried: [local, url], detail: 'larger than a manifest can be' };
    return { manifest: JSON.parse(text), from: url, tried: [local, url] };
  } catch (e) {
    return { manifest: null, from: url, tried: [local, url], detail: (e && e.message) || String(e) };
  }
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function runSetup(o) {
  const { home, exe, out = console.log } = o;
  const p = paths(home);
  const log = logger('setup', home);
  const say = (s) => { out(s); log(s); };

  // 1. verify this artifact before anything else
  const loc = await locateManifest({ exe, manifestArg: o.manifest });
  const manifest = loc.manifest;
  if (!manifest) { say('REFUSED - no release manifest beside the installer (' + loc.tried.join(', then ') + (loc.detail ? ': ' + loc.detail : '') + '). Nothing was installed and no pairing code was used.'); return EXIT_SETUP.RELEASE_REFUSED; }
  if (loc.from !== loc.tried[0]) say('release manifest: ' + loc.from);
  const artifact = readFileSync(exe);
  const v = verifyRelease({ manifest, artifact });
  if (!v.ok) { say('REFUSED - this release does not verify (' + v.refused + '): ' + v.message + '. Nothing was installed and no pairing code was used.'); return EXIT_SETUP.RELEASE_REFUSED; }
  say('release verified: Brain Factory ' + v.version + ' (' + v.channel + ' channel; image hash ' + v.digest.slice(0, 16) + '...)');

  const api = o.api || (readJson(p.config) || {}).api || CHANNEL.default_api;
  if (!api) { say('this ' + (CHANNEL.channel || 'unbundled') + ' build has no default Factory endpoint: pass --api <url of the Factory Node API>'); return EXIT_SETUP.USAGE; }

  // 2-3. enroll, unless this home already holds a credential (a retry after INSTALL_FAILED / REGISTRATION_FAILED reuses it)
  let cfg = readJson(p.config);
  let key;
  if (cfg && cfg.credential_id) {
    const k = await loadKey(p.key, cfg.public_key);
    if (!k.ok) { say('this computer is enrolled but its key cannot be read (' + k.fix + '): a Factory admin re-pairs it'); return EXIT_SETUP.FAILED; }
    key = k.key;
    say('already enrolled as ' + cfg.node_id + ': retrying the install with the same credential (no new code)');
  } else {
    key = await newKey();
    const client = new NodeApi({ api, key: { privateKey: key.privateKey, publicKey: key.publicKey } });
    await client.time();
    let code = o.code;
    if (!code) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      code = (await rl.question('Pairing code (from Brain OS > Factory > Computers > Add Computer): ')).trim();
      rl.close();
    }
    const s = await client.enrollStart(code, { fingerprint: machineFingerprint() || undefined, hostname: hostname() });
    if (!s.ok) { say('REFUSED - pairing (' + s.refused + '): ' + (s.message || '')); return EXIT_SETUP.PAIRING_REFUSED; }
    if (!o.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const a = (await rl.question('Enroll this computer as "' + s.computer + '" in "' + s.tenant + '"? [y/N] ')).trim().toLowerCase();
      rl.close();
      if (a !== 'y' && a !== 'yes') { say('declined: nothing was enrolled (the code stays usable until it expires)'); return EXIT_SETUP.DECLINED; }
    } else say('enrolling this computer as "' + s.computer + '" in "' + s.tenant + '"');
    const protection = await storeKey(p.key, key);
    const c = await client.enrollComplete(s);
    if (!c.ok) { say('REFUSED - enrollment (' + c.refused + '): ' + (c.message || '')); return EXIT_SETUP.PAIRING_REFUSED; }
    cfg = { api, channel: v.channel, node_id: c.node_id, principal_id: c.principal_id, computer_id: c.computer_id, credential_id: c.credential_id,
      public_key: key.publicKey.toString('base64url'), key_protection: protection, enrolled_at: new Date().toISOString(), computer: s.computer, tenant: s.tenant };
    writeJson(p.config, cfg);
    say('enrolled: node ' + c.node_id + ' (credential issued; key protection ' + protection + ')');
    key = { privateKey: key.privateKey, publicKey: key.publicKey };
  }

  // 4. install, as RUNTIME_INSTALLING; a failure is INSTALL_FAILED, retried with the same credential
  const node = new NodeApi({ api: cfg.api, key });
  await node.time();
  const inst = await node.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  if (!inst.ok && inst.refused !== 'bad_transition' && inst.refused !== 'not_enrolling') { say('REFUSED - ' + inst.refused + ': ' + (inst.message || '')); return EXIT_SETUP.FAILED; }
  try {
    const dir = join(p.runtime, v.version + '-' + v.digest.slice(0, 12));
    mkdirSync(dir, { recursive: true });
    copyFileSync(exe, join(dir, 'BrainFactory.exe'));
    if (authenticodeImageHash(readFileSync(join(dir, 'BrainFactory.exe'))) !== v.digest) throw new Error('the installed copy does not carry the verified image hash');
    writeJson(join(dir, 'manifest.json'), manifest);
    const cur = readJson(p.current);
    if (cur && cur.dir && cur.dir !== dir) writeJson(p.previous, cur);
    writeJson(p.current, { dir, version: v.version, digest: v.digest, installed_at: new Date().toISOString() });
    if (!o.noTasks) {
      const t = registerTasks({ name: o.taskName || DEFAULT_TASK, exe: join(dir, 'BrainFactory.exe'), home: o.homeArg ? home : null });
      if (!t.ok) throw new Error('the logon task could not be registered: ' + t.error);
      say('logon task "' + t.name + '" registered (at logon + a watchdog every 5 min; standard user, no elevation)');
    }
  } catch (e) {
    await node.op('report-state', { enrollment_step: 'INSTALL_FAILED', reason: String(e.message).slice(0, 200) }).catch(() => {});
    say('INSTALL_FAILED - ' + e.message + '. Run setup again: it retries with the same credential.');
    return EXIT_SETUP.INSTALL_FAILED;
  }

  // 5. start, and wait for ALIVE (or a named refusal)
  if (o.noStart) { say('installed; not started (--no-start)'); return EXIT_SETUP.OK; }
  if (!o.noTasks) startTask(o.taskName || DEFAULT_TASK);
  else if (o.startSupervisor) o.startSupervisor();
  const deadline = Date.now() + (o.aliveTimeoutMs || 180000);
  while (Date.now() < deadline) {
    const st = readJson(p.status, {});
    if (st.enrollment_state === 'ALIVE' && ['AVAILABLE', 'BUSY', 'DRAINING'].includes(st.state)) { say('ALIVE: ' + cfg.node_id + ' is schedulable'); return EXIT_SETUP.OK; }
    if (st.state === 'REGISTRATION_FAILED' || st.state === 'REFUSED' || st.state === 'RELEASE_REFUSED') {
      say(st.state + ' - ' + (st.reason || st.refused || st.message || '') + (st.state === 'REGISTRATION_FAILED' ? '. The runtime retries with the same credential.' : ''));
      return EXIT_SETUP.NOT_ALIVE;
    }
    await sleep(1000);
  }
  say('not ALIVE within ' + Math.round((o.aliveTimeoutMs || 180000) / 1000) + ' s - see ' + p.logs);
  return EXIT_SETUP.NOT_ALIVE;
}

export function channelInfo() { const t = embeddedTrust(); return { ...CHANNEL, trust_mode: t && t.mode }; }
void existsSync;
