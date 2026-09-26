// BrainFactorySetup.exe / BrainFactory.exe - the ONE executable that is both setup and runtime (WO-4), built by
// scripts/factory-build/build-sea.mjs per release channel (the trust set and mode fixed in it at build time; WO-6, S-5).
//
//   BrainFactorySetup.exe                     (double-click) setup: verify this release, enter the pairing code, enroll, install, start
//   BrainFactorySetup.exe setup [--code C] [--api URL] [--yes] [--manifest F] [--home DIR] [--task-name N] [--no-tasks] [--no-start]
//   BrainFactory.exe supervise [--home DIR]     the logon task's command: verify the installed release, keep one worker running
//   BrainFactory.exe worker [--home DIR]        (internal) the runtime loop, started by the supervisor
//   BrainFactory.exe status | verify | start | stop | uninstall | logs  [--home DIR] [--task-name N]
//   BrainFactory.exe upgrade --artifact EXE --manifest F [--home DIR]   verify a release BEFORE anything of it runs; install; switch
//   BrainFactory.exe trust                      the trust set fixed in this artifact: (key id, sha256 of the public key), channel, mode
//   BrainFactory.exe version | selftest
//
// RULES for this file and everything it imports - build-sea.mjs enforces the first three and fails the build otherwise:
//   1. no top-level await: a SEA main script is CommonJS, and the bundle is emitted as CommonJS
//   2. at run time only node: builtins - a SEA's require() loads builtins only (anything else must be bundled)
//   3. no PostgreSQL client (pg, pg-*, postgres, ...), no scripts/factory-runner/db.mjs, no database URL: the runtime holds none
//   4. SEA-only APIs (node:sea getAsset & co.) only behind isSea() - they throw under plain node
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sea from 'node:sea';

export const EXIT_OK = 0;
export const EXIT_SELFTEST_FAILED = 1;
export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE

// Replaced at bundle time by an esbuild define ({runtime_version, source_commit, dirty, built_at}); absent when run unbundled.
const EMBEDDED_BUILD_INFO = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null;

export function isSea() {
  try { return typeof sea.isSea === 'function' && sea.isSea() === true; } catch { return false; }
}

export function buildInfo() {
  if (EMBEDDED_BUILD_INFO) {
    const { runtime_version, source_commit, dirty, built_at, channel } = EMBEDDED_BUILD_INFO;
    return { runtime_version, source_commit, dirty, built_at, channel };
  }
  return { runtime_version: null, source_commit: null, dirty: null, built_at: null, channel: null }; // unbundled source: not a build
}

// RFC 8032 section 7.1, TEST 1 (empty message): a known answer, so the check is against the standard and not only against itself.
const RFC8032_TEST1 = {
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  publicKey: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  signature: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
};
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex'); // PKCS#8 PrivateKeyInfo header for a raw 32-byte seed

function flipBit(buf, index = 0) { const b = Buffer.from(buf); b[index % b.length] ^= 0x01; return b; }

export function selftest(out = (line) => process.stdout.write(line + '\n')) {
  let passed = 0; let failed = 0;
  const row = (label, fn) => {
    let ok = false; let detail = '';
    try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? ' (' + r.detail + ')' : ''; } catch (e) { detail = ' (threw: ' + (e && e.message || e) + ')'; }
    if (ok) passed++; else failed++;
    out((ok ? 'PASS ' : 'FAIL ') + label + detail);
  };

  const inSea = isSea();
  row('runtime: ' + (inSea ? 'running as a single executable application (node:sea isSea() = true)' : 'running as plain node (node:sea isSea() = false)')
    + ', node ' + process.version + ' ' + process.platform + '-' + process.arch, () => {
    // a SEA must carry its build info (it was bundled with it); plain node of the unbundled source carries none
    if (inSea && !EMBEDDED_BUILD_INFO) return { ok: false, detail: 'a SEA without embedded build info' };
    return { ok: true, detail: EMBEDDED_BUILD_INFO ? 'build ' + EMBEDDED_BUILD_INFO.runtime_version + ' @ ' + String(EMBEDDED_BUILD_INFO.source_commit).slice(0, 12) + (EMBEDDED_BUILD_INFO.dirty ? ' dirty' : '') : 'unbundled source, no build info' };
  });

  row('ed25519 known answer (RFC 8032 7.1 TEST 1): public key and signature from the seed match the standard, and verify', () => {
    const privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(RFC8032_TEST1.seed, 'hex')]), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
    const signature = sign(null, Buffer.alloc(0), privateKey);
    return rawPublic === RFC8032_TEST1.publicKey && signature.toString('hex') === RFC8032_TEST1.signature
      && verify(null, Buffer.alloc(0), publicKey, signature) === true;
  });

  row('ed25519 fresh key pair: a signature verifies, and a changed message, a changed signature and another key are each rejected', () => {
    const a = generateKeyPairSync('ed25519');
    const b = generateKeyPairSync('ed25519');
    const message = randomBytes(64);
    const signature = sign(null, message, a.privateKey);
    const good = verify(null, message, a.publicKey, signature);
    const badMessage = verify(null, flipBit(message, 17), a.publicKey, signature);
    const badSignature = verify(null, message, a.publicKey, flipBit(signature, 5));
    const otherKey = verify(null, message, b.publicKey, signature);
    return { ok: signature.length === 64 && good === true && badMessage === false && badSignature === false && otherKey === false,
      detail: 'verify=' + good + ', changed message=' + badMessage + ', changed signature=' + badSignature + ', other key=' + otherKey };
  });

  out('selftest: ' + (failed === 0 ? 'PASS' : 'FAIL') + ' (' + passed + ' passed, ' + failed + ' failed; ' + (inSea ? 'SEA' : 'plain node') + ')');
  return failed === 0 ? EXIT_OK : EXIT_SELFTEST_FAILED;
}

function printable(cmd) {
  const s = String(cmd);
  return (s.length > 120 ? s.slice(0, 120) + '...' : s).replace(/[\u0000-\u001f\u007f]/g, '?');
}

// ---- the commands -------------------------------------------------------------------------------------------------------------------
function opts(argv) {
  const o = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(a + ' needs a value'); return v; };
    if (a === '--code') o.code = val(); else if (a === '--api') o.api = val(); else if (a === '--manifest') o.manifest = val();
    else if (a === '--home') o.home = val(); else if (a === '--task-name') o.taskName = val(); else if (a === '--artifact') o.artifact = val();
    else if (a === '--yes') o.yes = true; else if (a === '--no-tasks') o.noTasks = true; else if (a === '--no-start') o.noStart = true;
    else if (a === '--once') o.once = true; else if (a === '--standby') o.standby = true;
    else throw new Error('unknown option ' + printable(a));
  }
  return o;
}

/** what this process runs: the installed exe in a SEA, or node + this file unbundled (a developer's run, never an install) */
function selfCommand(args) {
  if (isSea()) return { exe: process.execPath, args };
  return { exe: process.execPath, args: [fileURLToPath(import.meta.url), ...args] };
}

async function runtimeFacts() {
  const info = buildInfo();
  let digest;
  if (isSea()) { const { authenticodeImageHash } = await import('../enrolled/pe-image.mjs'); const { readFileSync } = await import('node:fs'); digest = authenticodeImageHash(readFileSync(process.execPath)); }
  return { version: info.runtime_version || '0.0.0-unbundled', digest, source_commit: info.source_commit };
}

export async function mainAsync(argv) {
  const cmd = argv[0] || 'setup';
  const o = opts(argv);
  const { homeDir, paths, readJson, writeJson } = await import('../enrolled/home.mjs');
  const home = o.home || homeDir();
  const p = paths(home);
  if (cmd === 'setup') {
    const { runSetup } = await import('../enrolled/setup.mjs');
    return runSetup({ ...o, home, homeArg: !!o.home, exe: process.execPath,
      startSupervisor: (installedExe) => spawnSupervisor(installedExe, home) });
  }
  if (cmd === 'supervise') {
    const { runSupervisor } = await import('../enrolled/supervisor.mjs');
    return runSupervisor({ home, selfExe: isSea() ? process.execPath : null, startSupervisor: (exe) => spawnSupervisor(exe, home),
      workerCommand: (v, { standby } = {}) => { const a = ['worker', '--home', home, ...(standby ? ['--standby'] : [])]; return isSea() ? { exe: v.exe, args: a } : selfCommand(a); } });
  }
  if (cmd === 'worker') {
    const { runWorker } = await import('../enrolled/worker.mjs');
    return runWorker({ home, runtime: await runtimeFacts(), once: !!o.once, standbyOnly: !!o.standby });
  }
  if (cmd === 'status') {
    const cfg = readJson(p.config);
    const out = { home, enrolled: !!(cfg && cfg.credential_id), node_id: cfg && cfg.node_id, computer: cfg && cfg.computer, tenant: cfg && cfg.tenant,
      api: cfg && cfg.api, key_protection: cfg && cfg.key_protection, status: readJson(p.status), current: readJson(p.current), build: buildInfo() };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return EXIT_OK;
  }
  if (cmd === 'verify') {
    const { verifyInstalled } = await import('../enrolled/supervisor.mjs');
    const v = verifyInstalled(home);
    process.stdout.write(JSON.stringify(v.ok ? { ok: true, version: v.version, channel: v.channel, digest: v.digest, key_id: v.key_id } : v) + '\n');
    return v.ok ? EXIT_OK : 3;
  }
  if (cmd === 'stop') {
    writeJson(p.stop, { at: new Date().toISOString() });
    const lock = readJson(p.lock);
    for (let i = 0; i < 60 && readJson(p.lock); i++) await new Promise((ok) => setTimeout(ok, 500));
    process.stdout.write((readJson(p.lock) ? 'stop requested; the supervisor has not exited yet' : 'stopped') + (lock ? '' : ' (no supervisor was running)') + '\n');
    return EXIT_OK;
  }
  if (cmd === 'start') {
    const { rmSync } = await import('node:fs');
    rmSync(p.stop, { force: true });
    if (!o.noTasks) { const { startTask, DEFAULT_TASK } = await import('../enrolled/tasks.mjs'); const r = startTask(o.taskName || ((readJson(p.config) || {}).task || {}).name || DEFAULT_TASK); process.stdout.write((r.code === 0 ? 'started' : 'could not start the task: ' + r.err) + '\n'); return r.code === 0 ? EXIT_OK : 1; }
    const { spawn } = require_child(); const c = selfCommand(['supervise', '--home', home]); spawn(c.exe, c.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    process.stdout.write('supervisor started\n'); return EXIT_OK;
  }
  if (cmd === 'uninstall') {
    writeJson(p.stop, { at: new Date().toISOString() });
    for (let i = 0; i < 60 && readJson(p.lock); i++) await new Promise((ok) => setTimeout(ok, 500));
    if (!o.noTasks) { const { unregisterTasks, DEFAULT_TASK } = await import('../enrolled/tasks.mjs'); unregisterTasks(o.taskName || ((readJson(p.config) || {}).task || {}).name || DEFAULT_TASK); }
    const { rmSync } = await import('node:fs');
    rmSync(home, { recursive: true, force: true });
    process.stdout.write('uninstalled: the task, the runtime, the key and the state are removed. A Factory admin revokes or archives the computer in Brain OS.\n');
    return EXIT_OK;
  }
  if (cmd === 'logs') {
    const { readFileSync } = await import('node:fs');
    for (const f of ['setup', 'supervisor', 'worker']) { try { process.stdout.write('== ' + f + '.log\n' + readFileSync(p.logs + '\\' + f + '.log', 'utf8').split('\n').slice(-40).join('\n') + '\n'); } catch { /* none */ } }
    return EXIT_OK;
  }
  if (cmd === 'trust') {
    // the trust set FIXED IN THIS ARTIFACT, read back as (key id, sha256 of the public key), with its channel and mode (S-5)
    const { trustReadback } = await import('../enrolled/release.mjs');
    process.stdout.write(JSON.stringify(trustReadback()) + '\n');
    return EXIT_OK;
  }
  if (cmd === 'upgrade') {
    const { upgrade } = await import('../enrolled/upgrade.mjs');
    const r = await upgrade({ home, artifact: o.artifact, manifest: o.manifest });
    process.stdout.write(JSON.stringify(r) + '\n');
    return r.ok ? EXIT_OK : 3;
  }
  process.stderr.write(printable(cmd) + ': not a Brain Factory command (setup, supervise, status, verify, start, stop, uninstall, logs, upgrade, trust, version, selftest)\n');
  return EXIT_NOT_AVAILABLE;
}

// child_process through a function so the unbundled import of this file stays side-effect free
function require_child() { return process.getBuiltinModule('node:child_process'); }

/** start a supervisor, detached: the INSTALLED exe when one is named (in a SEA), else this program */
function spawnSupervisor(installedExe, home) {
  const { spawn } = require_child();
  const c = isSea() && installedExe ? { exe: installedExe, args: ['supervise', '--home', home] } : selfCommand(['supervise', '--home', home]);
  spawn(c.exe, c.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

export function main(argv = process.argv.slice(2), out = (line) => process.stdout.write(line + '\n')) {
  const cmd = argv[0];
  if (cmd === 'version') { out(JSON.stringify(buildInfo())); return EXIT_OK; }
  if (cmd === 'selftest') return selftest(out);
  return mainAsync(argv).catch((e) => { process.stderr.write('error: ' + (e && e.message || e) + '\n'); return 1; });
}

// The CLI runs when this is the program: the packaged exe, the bundle run with `node main.cjs`, or this file run with `node`.
// Importing it runs nothing. (`import.meta.url` is defined away in the bundle, which is decided by the first two cases.)
function invokedAsEntry() {
  if (isSea()) return true;
  if (EMBEDDED_BUILD_INFO) return true;
  const self = import.meta.url;
  if (typeof self !== 'string' || !process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(self)); } catch { return false; }
}

// process.exitCode, not process.exit(): stdout on a pipe is flushed before the process ends
if (invokedAsEntry()) Promise.resolve(main()).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('error: ' + (e && e.message || e) + '\n'); process.exitCode = 1; });
