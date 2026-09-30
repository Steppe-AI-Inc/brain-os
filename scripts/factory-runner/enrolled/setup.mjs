// BrainFactorySetup.exe SETUP (WO-3, WO-4; contract §2 Enrollment; P-4). On a clean PC a person downloads the file, runs it and types
// the pairing code; everything after that runs by itself, as the installing STANDARD user, without elevation:
//   1. THE ARTIFACT CHECKS ITSELF FIRST (S-5): its manifest's signature and key id against the trust set compiled into it, and its own
//      PE Authenticode image hash against the manifest's digest, before a key exists or a code is read. A failure is refused by name.
//      The Factory Node API address must pass api.mjs endpointRefusal (https, or plain http to this computer's loopback) before any
//      request is made.
//   2. A NEW Ed25519 KEY is generated here and stored DPAPI-protected in an owner-only directory; the private key stays on this
//      computer. Without DPAPI, setup stops with dpapi_required before it asks for a code.
//   3. THE PAIRING CODE is the only thing setup asks for, read from standard input (typed by a person, or piped in by a test). No
//      argument carries it (S-12; sea/argv-guard.mjs) and setup never prints it. enroll/start sends the code, enroll/complete proves
//      possession of the key, and the plane then issues one credential for this key and for the principal the code belongs to.
//   4. THE GATE (upgrade.mjs gateOffer, shared with `upgrade`) runs before any install step. It fetches the current revocations over
//      this node's credential and refuses by name when it cannot get them; it checks this release against them (key_revoked,
//      release_revoked, ...); and it refuses a release that is not newer than the installed one unless the plane's answer names it as
//      adopted for this computer (downgrade_refused). It applies to a first install, to a retry, and to setup on an enrolled home.
//   5. RUNTIME_INSTALLING: the verified exe is copied under %LOCALAPPDATA%\BrainFactory\runtime, the logon task and its watchdog are
//      registered and the supervisor starts; the runtime then registers (REGISTERING -> ALIVE on a certified release).
//   A LOST ANSWER IS RESUMED, NEVER RE-PAIRED (contract §9; §2 Enrollment "a retry reuses it (no new code)"; credential.mjs): the
//   enrollment in flight (enrollment_id and the plane's challenge - a nonce, no secret) is recorded in config.json BEFORE
//   enroll/complete is sent, beside the DPAPI-stored key. When the answer is lost, setup asks again with the same key (up to three
//   times), and a later run of setup - with no code - resumes it: a session opened with the stored key proves the credential, or
//   enroll/complete is sent again with the same key. The record is dropped only when the plane refused the enrollment by name AND a
//   session with the key proves it holds no credential; every other answer keeps it.
//   WHERE A FAILURE IS RECORDED. After RUNTIME_INSTALLING is reported, a failed copy or task registration is reported to the plane as
//   INSTALL_FAILED. Every refusal before that point is named locally only (setup's output, its exit code and setup.log): a gate
//   refusal on a first install leaves the enrollment at NODE_CREDENTIAL_ISSUED, since contract §2 has no transition from there to
//   INSTALL_FAILED. A current_changed refusal (current.json moved while setup ran) is also named locally only. Running setup again
//   reuses the same credential, with no new code, and passes the same gate. The installer never receives a database password, a
//   runner URL or a shared secret (S-2).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { NodeApi, TERMINAL, endpointRefusal } from './api.mjs';
import { hostname, machineFingerprint } from './identity.mjs';
import { loadKey, newKey, storeKey } from './keys.mjs';
import { logger, paths, readConfigForRewrite, readJson, writeJson, writeJsonDurable } from './home.mjs';
import { KEY_IS_REGISTERED, probeKey, unknownOutcome } from './credential.mjs';
import { authenticodeImageHash } from './pe-image.mjs';
import { NO_REVOCATIONS, verifyRelease, embeddedTrust } from './release.mjs';
import { DEFAULT_TASK, registerTasks, startTask } from './tasks.mjs';
import { currentUnchanged, gateOffer } from './upgrade.mjs';

export const EXIT_SETUP = { OK: 0, FAILED: 1, USAGE: 2, RELEASE_REFUSED: 3, PAIRING_REFUSED: 5, INSTALL_FAILED: 6, NOT_ALIVE: 7 };
const CHANNEL = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : { channel: null, default_api: null, release_base: null };
const BUILD = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null;
export const MANIFEST_FILE = 'BrainFactorySetup.manifest.json';
export const PAIRING_PROMPT = 'Pairing code (from Brain OS > Factory > Computers > Add Computer): ';
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

/**
 * SETUP'S ONLY QUESTION: the pairing code, taken from the first line of `input` (a console, or a pipe a test writes to). The prompt
 * goes to `output`; this function writes the code nowhere. A stream that closes before a full line yields null immediately (no wait,
 * no default value), and so does Ctrl+C.
 */
export async function readPairingCode({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output, terminal: !!(input.isTTY && output.isTTY), historySize: 0 });
  try {
    return await new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      rl.on('line', (line) => finish(String(line).trim() || null));
      rl.once('close', () => finish(null));
      rl.once('SIGINT', () => rl.close());
      rl.setPrompt(PAIRING_PROMPT);
      rl.prompt();
    });
  } finally { rl.close(); }
}

/**
 * A NEW ENROLLMENT (steps 2-3): the key first (DPAPI, or a refusal before any code is asked or any request is sent), then the plane's
 * clock, then the one input, then enroll/start and enroll/complete. Returns { ok: true, cfg, key } or { ok: false, exit }.
 * `input`, `output`, `dpapi` and `fetchImpl` are test seams for the developer suites; main.mjs passes none of them (the static
 * contract checks it) - they can only change where the code is read from, make DPAPI fail, or observe the requests.
 */
export async function enrollNew({ api, home, channel, say, input, output, dpapi, fetchImpl }) {
  const p = paths(home);
  const key = await newKey();
  let protection;
  try { protection = await storeKey(p.key, key, { dpapi }); } catch (e) {
    if (e && e.code === 'dpapi_required') {
      say('REFUSED - dpapi_required: ' + (e.fix || e.message) + ' Setup stopped before asking for a pairing code; this computer is not enrolled.');
      return { ok: false, exit: EXIT_SETUP.FAILED };
    }
    throw e;
  }
  // the enrollment calls may wait on the plane's locks longer than an ordinary call: a longer client timeout
  const client = new NodeApi({ api, key: { privateKey: key.privateKey, publicKey: key.publicKey }, timeoutMs: 90000, ...(fetchImpl ? { fetchImpl } : {}) });
  let t = await client.time();
  for (let i = 0; i < 2 && !t.ok && t.refused === 'unreachable'; i++) { await sleep(1000 * 2 ** i); t = await client.time(); }
  if (!t.ok) {
    say('REFUSED - ' + (t.refused || 'unreachable') + ': ' + (t.message || 'the Factory Node API did not answer') + '. Setup stopped before asking for a pairing code; this computer is not enrolled.');
    return { ok: false, exit: EXIT_SETUP.FAILED };
  }
  const code = await readPairingCode({ ...(input ? { input } : {}), ...(output ? { output } : {}) });
  if (!code) { say('REFUSED - the input ended without a pairing code; this computer is not enrolled.'); return { ok: false, exit: EXIT_SETUP.USAGE }; }
  const s = await client.enrollStart(code, { fingerprint: machineFingerprint() || undefined, hostname: hostname() });
  if (!s.ok) { say('REFUSED - pairing (' + s.refused + '): ' + (s.message || '')); return { ok: false, exit: EXIT_SETUP.PAIRING_REFUSED }; }
  say('enrolling this computer as "' + s.computer + '" in "' + s.tenant + '"');
  // the enrollment in flight, recorded (durably) BEFORE enroll/complete is sent: a lost answer is resumed with this key, no new code
  const pending = { enrollment_id: s.enrollment_id, challenge: s.challenge, started_at: new Date().toISOString() };
  try {
    writeJsonDurable(p.config, { api, channel, public_key: key.publicKey.toString('base64url'), key_protection: protection, computer: s.computer, tenant: s.tenant, pending_enrollment: pending });
  } catch (e) {
    say('REFUSED - config_write_failed (' + ((e && e.code) || 'error') + '): the enrollment in progress could not be recorded, so enroll/complete was not sent. Run setup again with the same pairing code.');
    return { ok: false, exit: EXIT_SETUP.FAILED };
  }
  const c = await completeEnrollment(client, pending, await client.enrollComplete(pending));
  return settleEnrollment({ answer: c, home, api, channel, key: { privateKey: key.privateKey, publicKey: key.publicKey }, protection, pending, names: { computer: s.computer, tenant: s.tenant }, say, fetchImpl });
}

/** enroll/complete with the same key, asked again (up to 3 times, 1 / 2 / 4 s apart) while its answer proves nothing */
async function completeEnrollment(client, pending, first = null) {
  let c = first || await client.enrollComplete(pending);
  for (let i = 0; i < 3 && unknownOutcome(c) && c.http !== 429; i++) { await sleep(1000 * 2 ** i); c = await client.enrollComplete(pending); }
  return c;
}

// refusals that end an enrollment attempt by name (part 150) - acted on only once a session with the key proves it holds no credential
const ENROLLMENT_ENDED = new Set(['invalid_enrollment', 'code_expired', 'code_revoked', 'code_consumed', 'principal_has_active_credential', 'bad_proof', 'enrollment_expired']);

/** write the enrolled configuration (the pending record dropped) */
function finalizeEnrollment({ home, api, channel, ids, key, protection, names, say }) {
  const p = paths(home);
  const cfg = { api, channel, node_id: ids.node_id, principal_id: ids.principal_id, computer_id: ids.computer_id, credential_id: ids.credential_id,
    public_key: key.publicKey.toString('base64url'), key_protection: protection, enrolled_at: new Date().toISOString(), computer: names.computer, tenant: names.tenant };
  writeJsonDurable(p.config, cfg);
  say('enrolled: node ' + ids.node_id + ' (credential issued; key protection ' + protection + ')');
  return { ok: true, cfg, key };
}

/**
 * THE ANSWER TO enroll/complete, DECIDED (a new enrollment and a resumed one alike). ok -> enrolled. already_enrolled, or a named
 * refusal -> a session with the key decides: it opens -> enrolled with the credential it names; unknown_key after a named refusal ->
 * the record is dropped and the refusal is named. Anything else keeps the key and the record: setup is run again, with no code.
 */
async function settleEnrollment({ answer: c, home, api, channel, key, protection, pending, names, say, fetchImpl }) {
  const p = paths(home);
  if (c.ok) return finalizeEnrollment({ home, api, channel, ids: c, key, protection, names, say });
  const keep = (why) => {
    say('NOT FINISHED - ' + why + '. Nothing is lost: the key and the enrollment in progress are kept on this computer. Run setup again: it continues with the same key and needs no new code.');
    return { ok: false, exit: EXIT_SETUP.FAILED };
  };
  if (c.refused === 'already_enrolled' || (ENROLLMENT_ENDED.has(c.refused) && !unknownOutcome(c))) {
    const probe = await probeKey({ api, key, fetchImpl });
    if (probe.ok) return finalizeEnrollment({ home, api, channel, ids: probe, key, protection, names, say });
    if (KEY_IS_REGISTERED.has(probe.refused)) { say('REFUSED - ' + probe.refused + ': this computer\'s key holds a credential that is ' + probe.refused.replace('credential_', '') + '. Open a terminal in the folder that holds BrainFactorySetup.exe, run .\\BrainFactorySetup.exe uninstall, then run it again with a new code from a Factory admin.'); return { ok: false, exit: EXIT_SETUP.PAIRING_REFUSED }; }
    if (probe.refused === 'unknown_key' && probe.http === 401 && c.refused !== 'already_enrolled') {
      const cfg = readJson(p.config) || {};
      if (cfg.pending_enrollment && cfg.pending_enrollment.enrollment_id === pending.enrollment_id) { const next = { ...cfg }; delete next.pending_enrollment; writeJsonDurable(p.config, next); }
      say('REFUSED - enrollment (' + c.refused + '): ' + (c.message || '') + ' No credential was issued for this computer\'s key.');
      return { ok: false, exit: EXIT_SETUP.PAIRING_REFUSED };
    }
    return keep('the plane answered ' + c.refused + ', and whether this computer\'s key holds a credential is not known yet (' + (probe.refused || probe.http || 'no answer') + ')');
  }
  return keep('the answer to enroll/complete was lost or deferred (' + (c.refused || c.http || 'no answer') + (c.message ? ': ' + c.message : '') + ')');
}

/**
 * AN ENROLLMENT ALREADY IN THIS HOME, before a new one is started: config.pending_enrollment (a completion whose answer was lost), or
 * a stored key with no credential recorded (its record lost, e.g. by a crash). Returns { state: 'none' } (a new enrollment may start),
 * { state: 'enrolled', cfg, key }, or { state: 'stopped', exit } (named; the key and the record are kept).
 */
export async function resumeEnrollment({ api, home, channel, say, fetchImpl }) {
  const p = paths(home);
  const cfg = readJson(p.config) || {};
  const pending = cfg.pending_enrollment || null;
  if (!pending && !existsSync(p.key)) return { state: 'none' };
  const k = await loadKey(p.key, cfg.public_key);
  if (!k.ok) {
    if (!pending) return { state: 'none' };
    say('NOT FINISHED - key_unreadable: the key of the enrollment in progress cannot be read now (' + (k.code || k.fix) + '). It is kept; run setup again as the same Windows user.');
    return { state: 'stopped', exit: EXIT_SETUP.FAILED };
  }
  const at = pending ? (cfg.api || api) : api;
  const names = { computer: cfg.computer, tenant: cfg.tenant };
  const probe = await probeKey({ api: at, key: k.key, fetchImpl });
  if (probe.ok) {
    say('this computer\'s stored key already holds its credential: setup continues with it (no new code)');
    const done = finalizeEnrollment({ home, api: at, channel: cfg.channel || channel, ids: probe, key: k.key, protection: k.protection, names, say });
    return { state: 'enrolled', cfg: done.cfg, key: done.key };
  }
  if (KEY_IS_REGISTERED.has(probe.refused)) {
    say('REFUSED - ' + probe.refused + ': this computer\'s key holds a credential that is ' + probe.refused.replace('credential_', '') + '. Open a terminal in the folder that holds BrainFactorySetup.exe, run .\\BrainFactorySetup.exe uninstall, then run it again with a new code from a Factory admin.');
    return { state: 'stopped', exit: EXIT_SETUP.PAIRING_REFUSED };
  }
  if (!(probe.refused === 'unknown_key' && probe.http === 401)) {
    say('NOT FINISHED - the plane did not say whether this computer\'s stored key is enrolled (' + (probe.refused || probe.http || 'no answer') + '). Nothing was changed; run setup again.');
    return { state: 'stopped', exit: EXIT_SETUP.FAILED };
  }
  if (!pending) return { state: 'none' }; // a stored key that holds no credential and no enrollment in progress: a new one replaces it
  say('continuing the enrollment in progress with this computer\'s key (no new code)');
  const client = new NodeApi({ api: at, key: k.key, timeoutMs: 90000, ...(fetchImpl ? { fetchImpl } : {}) });
  const c = await completeEnrollment(client, pending);
  const r = await settleEnrollment({ answer: c, home, api: at, channel: cfg.channel || channel, key: k.key, protection: k.protection, pending, names, say, fetchImpl });
  return r.ok ? { state: 'enrolled', cfg: r.cfg, key: r.key } : { state: 'stopped', exit: r.exit };
}

export async function runSetup(o) {
  const { home, exe, out = console.log } = o;
  const p = paths(home);
  const log = logger('setup', home);
  const say = (s) => { out(s); log(s); };

  // 1. verify this artifact before anything else (a path named by --manifest is never printed: an argument is never echoed)
  const loc = await locateManifest({ exe, manifestArg: o.manifest });
  const manifest = loc.manifest;
  if (!manifest) {
    say('REFUSED - no release manifest ' + (o.manifest ? 'at the path named by --manifest' : 'beside the installer (' + loc.tried.join(', then ') + (loc.detail ? ': ' + loc.detail : '') + ')')
      + '. Nothing was installed and no pairing code was used.');
    return EXIT_SETUP.RELEASE_REFUSED;
  }
  if (loc.from !== loc.tried[0]) say('release manifest: ' + loc.from);
  const artifact = readFileSync(exe);
  // the pre-credential self-check, against the trust set pinned in this artifact. Revocations cannot be read before a credential
  // exists (NO_REVOCATIONS here); the gate (step 4) applies the plane's fresh revocations before anything is installed.
  const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS });
  if (!v.ok) { say('REFUSED - this release does not verify (' + v.refused + '): ' + v.message + '. Nothing was installed and no pairing code was used.'); return EXIT_SETUP.RELEASE_REFUSED; }
  say('release verified: Brain Factory ' + v.version + ' (' + v.channel + ' channel; image hash ' + v.digest.slice(0, 16) + '...)');

  const api = o.api || (readJson(p.config) || {}).api || CHANNEL.default_api;
  if (!api) { say('this ' + (CHANNEL.channel || 'unbundled') + ' build has no default Factory endpoint: pass --api <url of the Factory Node API>'); return EXIT_SETUP.USAGE; }
  const badEndpoint = endpointRefusal(api);
  if (badEndpoint) { say('REFUSED - endpoint_refused: ' + badEndpoint.message + '. Nothing was sent, and nothing was enrolled or installed.'); return EXIT_SETUP.USAGE; }

  // 2-3. enroll, unless this home already holds a credential (a retry after INSTALL_FAILED / REGISTRATION_FAILED reuses it)
  let cfg = readJson(p.config);
  let key;
  const enrolledBefore = !!(cfg && cfg.credential_id);
  if (enrolledBefore) {
    const k = await loadKey(p.key, cfg.public_key);
    if (!k.ok) { say('this computer is enrolled but its key cannot be read (' + k.fix + '): a Factory admin re-pairs it'); return EXIT_SETUP.FAILED; }
    key = k.key;
    say('already enrolled as ' + cfg.node_id + ': this release is checked against the plane before anything is installed (the same credential, no new code)');
  } else {
    // an enrollment already started here (its answer lost) is continued with the same key; only a home with none enrolls anew
    const r = await resumeEnrollment({ api, home, channel: v.channel, say, fetchImpl: o.fetchImpl });
    if (r.state === 'stopped') return r.exit;
    if (r.state === 'enrolled') { cfg = r.cfg; key = r.key; } else {
      const e = await enrollNew({ api, home, channel: v.channel, say, input: o.input, output: o.output, dpapi: o.dpapi, fetchImpl: o.fetchImpl });
      if (!e.ok) return e.exit;
      cfg = e.cfg; key = e.key;
    }
  }

  // 4. THE GATE - before any report-state, copy, current.json / previous.json write, task registration or start
  const g = await gateOffer({ home, manifest, bytes: artifact, retries: 3, idlePhase: 'RECOVERING' });
  if (!g.ok) {
    say('REFUSED - ' + g.refused + ': ' + (g.message || '') + '. Setup stopped at the gate: no file was copied, no state was reported, no task was registered and nothing was started' + (readJson(p.current) ? '; the release installed here stays current' : '') + '.'
      + (TERMINAL.has(g.refused) ? ' To pair this computer with a new code: open a terminal in the folder that holds BrainFactorySetup.exe and run .\\BrainFactorySetup.exe uninstall (it removes the old key, the state and the task), then run BrainFactorySetup.exe again and type the new code when it asks.'
        : enrolledBefore ? '' : ' This computer is enrolled: setup of a current release reuses its credential (no new code).'));
    return EXIT_SETUP.RELEASE_REFUSED;
  }
  if (g.same) say('release ' + g.version + ' is installed and current here already: re-checking its files, its logon task and the runtime');

  // 5. install, as RUNTIME_INSTALLING; a failure is INSTALL_FAILED, retried with the same credential
  const node = new NodeApi({ api: cfg.api, key });
  await node.time();
  const inst = await node.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  if (!inst.ok && inst.refused !== 'bad_transition' && inst.refused !== 'not_enrolling') { say('REFUSED - ' + inst.refused + ': ' + (inst.message || '')); return EXIT_SETUP.FAILED; }
  try {
    const dir = join(p.runtime, g.version + '-' + g.digest.slice(0, 12));
    const target = join(dir, 'BrainFactory.exe');
    // idempotent: a copy already carrying the verified image hash is kept (it may be the running release's own exe)
    const present = existsSync(target) && (() => { try { return authenticodeImageHash(readFileSync(target)) === g.digest; } catch { return false; } })();
    if (!present) {
      mkdirSync(dir, { recursive: true });
      copyFileSync(exe, target);
      if (authenticodeImageHash(readFileSync(target)) !== g.digest) throw new Error('the installed copy does not carry the verified image hash');
    }
    const mf = join(dir, 'manifest.json');
    if (JSON.stringify(readJson(mf)) !== JSON.stringify(manifest)) writeJson(mf, manifest);
    if (!currentUnchanged(p, g.current)) {
      say('REFUSED - current_changed: current.json was rewritten by something else (an adopt or an upgrade) while setup ran, so setup switched nothing. Run setup again.');
      return EXIT_SETUP.RELEASE_REFUSED;
    }
    const cur = g.current;
    if (!(cur && cur.dir === dir && cur.digest === g.digest)) {
      if (cur && cur.dir && cur.dir !== dir) writeJson(p.previous, cur);
      writeJson(p.current, { dir, version: g.version, digest: g.digest, installed_at: new Date().toISOString(), via: 'setup' });
    }
    if (!o.noTasks) {
      const t = registerTasks({ name: o.taskName || DEFAULT_TASK, exe: target, home: o.homeArg ? home : null });
      if (!t.ok) throw new Error('the logon task could not be registered: ' + t.error);
      // (read for a rewrite: an unreadable config.json fails this install step, retried with the same credential - never written as {})
      writeJson(p.config, { ...readConfigForRewrite(p), task: { name: t.name, home_arg: !!o.homeArg } });
      say('logon task "' + t.name + '" registered (at logon + a watchdog every 5 min; standard user, no elevation)');
    }
  } catch (e) {
    await node.op('report-state', { enrollment_step: 'INSTALL_FAILED', reason: String(e.message).slice(0, 200) }).catch(() => {});
    say('INSTALL_FAILED - ' + e.message + '. Run setup again: it retries with the same credential.');
    return EXIT_SETUP.INSTALL_FAILED;
  }

  // 6. start, and wait for ALIVE (or a named refusal)
  if (o.noStart) { say('installed; not started (--no-start)'); return EXIT_SETUP.OK; }
  if (!o.noTasks) startTask(o.taskName || DEFAULT_TASK);
  else if (o.startSupervisor) o.startSupervisor(join((readJson(p.current) || {}).dir || '', 'BrainFactory.exe'));
  const deadline = performance.now() + (o.aliveTimeoutMs || 180000); // a duration: the monotonic clock
  while (performance.now() < deadline) {
    const st = readJson(p.status, {});
    if (st.enrollment_state === 'ALIVE' && ['AVAILABLE', 'BUSY', 'DRAINING'].includes(st.state)) { say('ALIVE: ' + cfg.node_id + ' is schedulable'); return EXIT_SETUP.OK; }
    if (st.reason === 's16a_bound_fingerprint') {
      say('REFUSED - registration_failed (s16a_bound_fingerprint): this computer reported the machine fingerprint of a computer record that carries the S-16(a) binding. '
        + 'During this milestone it is enrolled again only through Add Computer WITH the binding, done by a Factory admin (S-14); a retry is refused the same way, so the runtime does not retry.');
      return EXIT_SETUP.NOT_ALIVE;
    }
    if (st.state === 'REGISTRATION_FAILED' || st.state === 'REFUSED' || st.state === 'RELEASE_REFUSED') {
      say(st.state + ' - ' + (st.reason || st.refused || st.message || '') + (st.state === 'REGISTRATION_FAILED' ? '. The runtime retries with the same credential.' : ''));
      return EXIT_SETUP.NOT_ALIVE;
    }
    await sleep(1000);
  }
  say('not ALIVE within ' + Math.round((o.aliveTimeoutMs || 180000) / 1000) + ' s - see ' + p.logs);
  return EXIT_SETUP.NOT_ALIVE;
}

/** the channel facts fixed in this artifact at build time (`channel` command): the channel, its default Node API endpoint and release
 *  storage (__CHANNEL__), and the embedded trust mode - never a configuration file, the environment or an answer */
export function channelInfo() { const t = embeddedTrust(); return { ...CHANNEL, trust_mode: t && t.mode }; }
