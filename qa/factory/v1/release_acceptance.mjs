#!/usr/bin/env node
// WO-6 / AC-5 DEVELOPER VERIFICATION with the BUILT artifacts (dev and production channel) and a SENTINEL artifact (sentinel.mjs: it
// writes a marker the moment it executes). A node installed from the dev build is offered releases through its own `upgrade` path;
// every refusal must come BEFORE execution - the sentinel's marker never appears (a positive control shows it would).
//   R-a one byte changed in a hashed range    R-b unsigned    R-e signed by a key outside the pinned set    R-l a key "added" by the
//   server (a release the plane records under a foreign key)    R-n bytes outside the hashed ranges: digest, trust, mode, behaviour
//   unchanged    R-f/k a production-channel build refuses a dev-key signature, pointed at a disposable plane, before any network call
//   R-h each channel's rebuild is byte-identical    R-i upgrade, then an admin adopt returns the node to the previous certified release
//   R-m a superseded release is refused without an adopt (no silent downgrade)    R-j a revoked release: its nodes stop claiming and say
//   so, never downgrading    R-d a revoked release is refused    R-c a revoked key is refused (and the node's own release with it)
//   R-i2 the supervisor hands off to the adopted release and the logon task follows    R-t a tampered supervisor starts nothing
//   R-m2 (AC-5(m)) a node on its ADOPTED release A, with B superseded by a published C (versions A < B < C): upgrade to B is refused
//   release_not_current before anything is copied (runtime\, current.json and the logon task unchanged; B is a sentinel that never
//   runs); upgrade to C passes; upgrade back to A's digest (adopted, the running exe) passes
// EVERY NAMED REFUSAL IS REACHED BY THE SENTINEL (AC-5 (a)-(f), (m); VERIFICATION_SPEC §3.10), each offer reaching only its own check:
//   R-bs1/2/3 bad_signature under the pinned dev key id: a signed field changed after signing; one signature bit flipped; another
//   key's signature naming the pinned key id and carrying that key    R-e2 an outside key carried in the manifest under every usual
//   spelling (and a trust block) adds no trust: key_outside_trust_set    R-cm a dev-signed PRODUCTION-channel manifest on the dev
//   runtime: channel_mismatch    R-mf a manifest without its receipt hash, or of another format version: malformed
//   R-f2 (AC-5(f)) the production-channel runtime's own upgrade path, offered a sentinel of its own (its own marker, offered nowhere
//   else) with a dev-key-signed production manifest, refuses dev_key_on_production_channel after it asked the plane, before anything
//   is copied    R-d the revoked release is refused
//   release_revoked - the revoked 0.1.1, and a sentinel published and then revoked (its own marker)    R-ru upgrade with no plane
//   answering: revocations_unavailable, nothing copied
// NOTHING RECEIVED AT RUN TIME CHANGES THE TRUST MODE OR ADDS A KEY (AC-5(k)): every runtime input declares dev - the environment,
// configuration files in the working directory, beside the exe and in the home, the home's revocation file, fields outside the signed
// bytes of the manifest, and the plane's answers (dev_declaring_proxy.mjs)
//   R-k0 the production build's trust, channel and version read-backs are the neutral ones    R-k1 production setup refuses the
//   dev-signed release by name and sends nothing    R-k2 the production supervisor refuses its own dev-signed release by name and
//   starts nothing (the sentinel installed as current never runs)    R-k3 production upgrade READS the dev-declaring answer and still
//   refuses dev_key_on_production_channel    R-k4 the dev supervisor, with every input naming an extra key K and the current
//   release signed by K, refuses key_outside_trust_set and never starts it
// THE CERTIFICATE TABLE ADDS NOTHING (AC-5(n)): R-n a trust block with a real key, a mode and a loopback API URL appended there leave the
// digest and the trust / channel / endpoint / version read-backs and selftest exactly the original's; R-n2 the dev copy's setup ends
// as the original's with no request to that URL, and its supervisor refuses a release signed by that key; R-n3 the same for the
// production copy (dev mode and the dev key in its table): its setup refuses dev_key_on_production_channel exactly as the original
// R-h (AC-5(h)) per channel: the rebuild is IDENTICAL; the embedded trust read back equals build-info's and an independent
// recomputation from trust/<channel>.json (key id and sha256 of the public key); ids bound and unique; production empty, dev only dev
// keys; the `channel` read-back names build-info's endpoint and release storage; the digest is the exe's image hash
// POSITIVE CONTROLS FOR THE NEGATIVE CLAIM ROWS: R-j0 before the revoke, a probe only N2 may take is claimed by N2 in the same 8 s
// window R-j then finds empty; R-c0 the same for N before the key revoke
// THE INSTALLER'S INPUTS AND ITS GATE (S-12; S-5; B-3, B-5; L4-F7). This suite hands every pairing code to setup through its standard
// input; run() checks each argument list first (canary.mjs) and lets only a declared canary row pass this process's canary codes.
//   R-B3d the built dev exe turns away every command line that carries a code (--code, --code=, as the command, as a positional or an
//   option value, spelled with O / I, inside a path or a URL), prints no fragment of it and creates nothing; then setup, given the
//   issued code on standard input, asks exactly one question and enrolls    R-B3p the production exe turns away the same arguments
//   R-F7 an http Factory Node API address off this computer's loopback gets endpoint_refused, and no request, key or config
//   R-B5a..d setup on an ENROLLED home stops at the upgrade gate before it installs anything, for an older superseded release
//   (downgrade_refused), a revoked release (release_revoked; the logon task keeps its action), a release whose key is revoked
//   (key_revoked), and a plane that does not answer (revocations_unavailable); current.json, previous.json and runtime\ stay as they
//   were, and the plane keeps recording the node on the release it ran before. (A sentinel build is not offered in these rows: setup
//   runs from the offered exe itself, and the proof that none of its supervisor or worker code runs afterwards is that current.json,
//   runtime\ and the task action - the only things the supervisor and the logon task start from - are byte-for-byte unchanged, plus
//   the fresh registration on the old release after a supervisor restart in R-B5a.)
// usage: node qa/factory/v1/release_acceptance.mjs [--evidence <file>]   (builds what it needs; ~10 min)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { ROOT } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { world, recorder } from './flows.mjs';
import { makeManifest, signDev, devKey } from '../../../scripts/factory-build/release-manifest.mjs';
import { canonicalManifestBytes, keyIdOf, KNOWN_DEV_KEY_IDS } from '../../../scripts/factory-runner/enrolled/release.mjs';
import { authenticodeImageHash, peLayout } from '../../../scripts/factory-runner/enrolled/pe-image.mjs';
import { buildSentinel } from './sentinel.mjs';
import { readTask, registerTasks, unregisterTasks } from '../../../scripts/factory-runner/enrolled/tasks.mjs';
import { storeKey } from '../../../scripts/factory-runner/enrolled/keys.mjs';
import { assertNoCodeInArgv, canaryCode, codeIn, leaksIn } from './canary.mjs';
import { startDevDeclaringProxy } from './dev_declaring_proxy.mjs';

const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const DIST = (ch) => join(ROOT, 'dist', 'brain-factory', V, ch, 'BrainFactorySetup.exe');
const work = mkdtempSync(join(tmpdir(), 'bf-release-'));
const MARKER = join(work, 'SENTINEL-EXECUTED.txt');
const MARKER_D = join(work, 'SENTINEL-D-EXECUTED.txt');
const MARKER_F2 = join(work, 'SENTINEL-F2-EXECUTED.txt');
// stdin: what setup reads at its one prompt (a pairing code, or nothing: every child's standard input is ended, so a prompt never waits).
// timeoutMs: a child still running then is ended and reported (a supervisor that went on instead of refusing must not hang the suite)
const run = (exe, args, { stdin = '', canary = false, cwd = work, env = null, timeoutMs = 0 } = {}) => new Promise((resolve) => {
  assertNoCodeInArgv(args, { canary });
  const c = spawn(exe, args, { windowsHide: true, cwd, ...(env ? { env: { ...process.env, ...env } } : {}) });
  let timedOut = false;
  const timer = timeoutMs ? setTimeout(() => { timedOut = true; try { c.kill(); } catch { /* gone */ } }, timeoutMs) : null;
  c.stdin.on('error', () => { /* the child may exit before reading */ });
  c.stdin.end(stdin);
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (status) => { if (timer) clearTimeout(timer); resolve({ status, timedOut, out: out.trim(), json: (() => { try { return JSON.parse(out.trim().split(/\r?\n/).pop()); } catch { return null; } })() }); });
});
// a key pair as a pinned-trust entry (key id = "ed25519:" + sha256 of the raw public key)
const rawKey = (kp) => Buffer.from(kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
const entryOf = (kp) => ({ key_id: keyIdOf(rawKey(kp)), public_key: rawKey(kp).toString('base64url') });
const signedBy = (m, kp) => { const x = { ...m, key_id: entryOf(kp).key_id }; x.signature = sign(null, canonicalManifestBytes(x), kp.privateKey).toString('base64url'); return x; };
// the certificate table (directory 4) replaced by one WIN_CERTIFICATE carrying `text`: bytes OUTSIDE the Authenticode-hashed ranges
const withCertTable = (exeBytes, text) => {
  const L0 = peLayout(exeBytes);
  const body = Buffer.from(text, 'utf8');
  const pad = Buffer.alloc((8 - ((body.length + 8) % 8)) % 8);
  const cert = Buffer.concat([Buffer.alloc(8), body, pad]); cert.writeUInt32LE(cert.length, 0); cert.writeUInt16LE(0x0200, 4); cert.writeUInt16LE(0x0002, 6);
  const out = Buffer.concat([exeBytes, cert]); out.writeUInt32LE(exeBytes.length, L0.certDirOffset); out.writeUInt32LE(cert.length, L0.certDirOffset + 4);
  return out;
};
const PROMPT = /Pairing code \(/;
// the home's install state, byte for byte: what a refused setup must leave exactly as it was
const snapshot = (h) => JSON.stringify({ current: (() => { try { return readFileSync(join(h, 'current.json'), 'utf8'); } catch { return null; } })(),
  previous: (() => { try { return readFileSync(join(h, 'previous.json'), 'utf8'); } catch { return null; } })(),
  runtime: (() => { try { return readdirSync(join(h, 'runtime')).sort(); } catch { return null; } })() });
const build = (args) => { const r = spawnSync(process.execPath, [join(ROOT, 'scripts/factory-build/build-sea.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 }); if (r.status !== 0) throw new Error('build failed: ' + r.stdout + r.stderr); };
const src = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rcpt = (s) => sha256('receipt ' + s);
const readJ = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const bi = (ch) => readJ(join(ROOT, 'dist', 'brain-factory', V, ch, 'build-info.json'));
// THE LIVE TRUST SET (WO-6). What a production build must read back: the committed production trust source, entry for entry (key id,
// sha256 of the public key) - the release signer's key WO-6 revision 5 records. And the key ids the Director's WO-6 names in this tree
// (held byte-identical to the designated Director commit by the static contract): the production set is exactly those.
const prodReadback = () => { const t = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/enrolled/trust/production.json'), 'utf8'));
  return { channel: t.channel, mode: t.mode, keys: t.keys.map((k) => ({ key_id: k.key_id, public_key_sha256: createHash('sha256').update(Buffer.from(k.public_key, 'base64url')).digest('hex') })) }; };
const WO6_KEY_IDS = [...new Set(readFileSync(join(ROOT, 'qa/work-orders/auto-enrollment-v1/WO-6.md'), 'utf8').match(/\bed25519:[0-9a-f]{64}\b/g) || [])].filter((id) => !KNOWN_DEV_KEY_IDS.includes(id)).sort();
const W = await world();
const homes = [];
const testTasks = [];
let proxy = null;
let trap = null;
try {
  const { founder, admin, sup } = W;
  // ---- the artifacts
  for (const ch of ['dev', 'production']) if (!existsSync(DIST(ch))) build(['--channel', ch]);
  const DEV = DIST('dev'), PROD = DIST('production');
  const v2dir = join(work, 'dev-0.1.1');
  const rv = join(ROOT, 'scripts/factory-runner/sea/runtime-version.json');
  const rvText = readFileSync(rv);
  try { writeFileSync(rv, JSON.stringify({ runtime_version: '0.1.1' })); build(['--channel', 'dev', '--out', v2dir]); } finally { writeFileSync(rv, rvText); }
  const DEV2 = join(v2dir, 'BrainFactorySetup.exe');
  const SENT = await buildSentinel(join(work, 'sentinel.exe'), MARKER);
  const manifest = (exe, version, channel = 'dev') => makeManifest({ artifact: exe, channel, version, source_sha: src, receipt_sha256: rcpt(version + channel) });
  const put = (name, m) => { const f = join(work, name); writeFileSync(f, JSON.stringify(m, null, 2)); return f; };
  const publish = (m) => admin.call('publish-release', { channel: m.channel, version: m.version, source_sha: m.source_sha, digest: m.digest, key_id: m.key_id,
    signature: m.signature, receipt_sha256: m.receipt_sha256, manifest: m }, W.brain.passwordToken(founder));   // a production publish needs a fresh password entry
  // a second sentinel with its own marker (so its own digest): R-d publishes and revokes it (a digest is published once per channel)
  const SENT_D = await buildSentinel(join(work, 'sentinel-d.exe'), MARKER_D);
  // a sentinel offered in R-f2 only: its marker can be written by nothing but the production-channel upgrade path of that row, so R-f2
  // judges its own "before execution" whatever an earlier row did
  const SENT_F2 = await buildSentinel(join(work, 'sentinel-f2.exe'), MARKER_F2);
  // ---- a dedicated enrolled computer (REL-P) whose credential the production-channel upgrade rows use, from homes of their own. It
  // runs no worker, so it never claims; N's credential and home are never cloned. Its key is stored through the runtime's own storeKey
  // (DPAPI), never copied as bytes.
  const KN = await W.enroll('REL-P', { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 });
  const knDer = KN.identity.privateKey.export({ format: 'der', type: 'pkcs8' });
  const nodeHome = async (name, cfgExtra = {}) => {
    const h = join(work, name); homes.push(h);
    await storeKey(join(h, 'key', 'node.key'), { privateKeyDer: knDer });
    writeFileSync(join(h, 'config.json'), JSON.stringify({ api: W.node.baseUrl, channel: 'production', node_id: KN.node_id, principal_id: KN.principal_id, computer_id: KN.computer_id,
      credential_id: KN.credential_id, public_key: KN.identity.publicKey.toString('base64url'), key_protection: 'dpapi', ...cfgExtra }, null, 2));
    return h;
  };
  // ---- EVERY RUNTIME INPUT DECLARING DEV (AC-5(k)): the environment, configuration files (working directory, beside the exe, the home),
  // the home's revocation file, fields outside the manifest's signed bytes, and the plane's answers (through the proxy)
  const DEV_ENTRY = { key_id: devKey().keyId, public_key: devKey().publicKey.toString('base64url') };
  const DECLARED_TRUST = { channel: 'production', mode: 'dev', keys: [DEV_ENTRY] };
  const DECLARE = { mode: 'dev', trust_mode: 'dev', channel: 'dev', dev: true, trust: DECLARED_TRUST, keys: [DEV_ENTRY], trusted_keys: [DEV_ENTRY] };
  const devEnv = (trust, keys) => ({ BRAIN_FACTORY_TRUST_MODE: 'dev', BRAIN_FACTORY_MODE: 'dev', BRAIN_FACTORY_CHANNEL: 'dev', BRAIN_FACTORY_DEV: '1',
    BRAIN_FACTORY_TRUST: JSON.stringify(trust), BRAIN_FACTORY_TRUST_KEYS: JSON.stringify(keys), FACTORY_TRUST_MODE: 'dev', FACTORY_CHANNEL: 'dev', NODE_ENV: 'development' });
  const DEV_ENV = devEnv(DECLARED_TRUST, [DEV_ENTRY]);
  const devFiles = (dir, decl, env) => {
    mkdirSync(dir, { recursive: true });
    for (const f of ['config.json', 'BrainFactorySetup.config.json', 'BrainFactory.config.json']) writeFileSync(join(dir, f), JSON.stringify(decl, null, 2));
    for (const f of ['trust.json', 'BrainFactorySetup.trust.json']) writeFileSync(join(dir, f), JSON.stringify(decl.trust, null, 2));
    writeFileSync(join(dir, '.env'), Object.entries(env).map(([k, v]) => k + '=' + v).join('\n') + '\n');
    return dir;
  };
  const devCwd = devFiles(join(work, 'dev-cwd'), DECLARE, DEV_ENV);
  proxy = await startDevDeclaringProxy({ targetOrigin: W.node.origin, basePath: W.node.basePath, declare: DECLARE });
  // a supervisor start in a home of its own: runtime\self (the supervisor's exe and its manifest) and runtime\cur (the release it is
  // asked to start), current -> cur, previous -> self. The rig's exe is the self copy: the supervisor finds itself installed there.
  const rig = (name, { selfExe, selfManifest, curExe, curManifest, config = null, revocations = null, beside = null }) => {
    const HS = join(work, name); homes.push(HS);
    const selfDir = join(HS, 'runtime', 'self'), curDir = join(HS, 'runtime', 'cur');
    for (const d of [selfDir, curDir, join(HS, 'state')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(selfDir, 'BrainFactory.exe'), readFileSync(selfExe)); writeFileSync(join(selfDir, 'manifest.json'), JSON.stringify(selfManifest));
    copyFileSync(curExe, join(curDir, 'BrainFactory.exe')); writeFileSync(join(curDir, 'manifest.json'), JSON.stringify(curManifest));
    writeFileSync(join(HS, 'current.json'), JSON.stringify({ dir: curDir, version: curManifest.version, digest: curManifest.digest }));
    writeFileSync(join(HS, 'previous.json'), JSON.stringify({ dir: selfDir, version: selfManifest.version, digest: selfManifest.digest }));
    if (config) writeFileSync(join(HS, 'config.json'), JSON.stringify(config, null, 2));
    if (revocations) writeFileSync(join(HS, 'state', 'revocations.json'), JSON.stringify(revocations, null, 2));
    if (beside) devFiles(selfDir, beside.decl, beside.env);
    return { HS, exe: join(selfDir, 'BrainFactory.exe') };
  };
  const rigRun = async (r, opts = {}) => {
    const out = await run(r.exe, ['supervise', '--home', r.HS], { timeoutMs: 90000, ...opts });
    await sleep(1500); // a handoff spawns the next supervisor detached: give it the time to run before the marker is looked for
    const st = readJ(join(r.HS, 'state', 'status.json')) || {};
    return { exit: out.status, timedOut: out.timedOut, state: st.state, refused: st.refused, lock: existsSync(join(r.HS, 'state', 'supervisor.lock.json')) };
  };

  // ---- a node installed from the dev build (R1 = 0.1.0)
  const dl = join(work, 'dl'); mkdirSync(dl);
  copyFileSync(DEV, join(dl, 'BrainFactorySetup.exe'));
  const M1 = signDev(manifest(join(dl, 'BrainFactorySetup.exe'), V));
  writeFileSync(join(dl, 'BrainFactorySetup.manifest.json'), JSON.stringify(M1));
  const R1 = await publish(M1);
  const add = await admin.call('add-computer', { display_name: 'REL-N', envelope: { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
  const H = join(work, 'home-N'); homes.push(H);
  // R-B3d, part one: command lines that carry a canary code, each of which the dev exe must turn away without echoing any of it
  const CAN = canaryCode();
  const attempts = async () => (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n;
  const enrollRequests = () => W.node.requests.filter((r) => r.path.includes('/v1/enroll/')).length; // what carries a code
  const a3 = await attempts(); const q3 = enrollRequests();
  // every canary spawn gets a home of its own under the work dir (never this user's real %LOCALAPPDATA%\BrainFactory): a build that
  // let a code through would create it, and the row checks that it does not exist
  const canaryHome = join(work, 'canary-home');
  const embedded = join(work, 'b3d-embedded');
  const argvCases = [['setup', '--code', CAN.display], ['setup', '--code=' + CAN.display], [CAN.display], ['setup', CAN.nodash],
    ['setup', '--home', CAN.lower], ['setup', '--task-name', CAN.spelled], ['setup', '--manifest', CAN.display], ['setup', '--api', CAN.display], ['version', CAN.display],
    ['setup', '--home', CAN.spelledNodash], ['setup', '--task-name', CAN.spacedSpelled], ['setup', '--home', join(embedded, CAN.display)],
    ['setup', '--api', 'https://h.example/functions/v1/' + CAN.display + '/x']];
  const argvRuns = [];
  for (const args of argvCases) argvRuns.push(await run(DEV, args, { canary: true, env: { BRAIN_FACTORY_HOME: canaryHome } }));
  const argvBad = argvRuns.map((r, i) => ({ i, status: r.status, refused: /^REFUSED - /m.test(r.out), leaks: leaksIn(r.out, CAN) })).filter((x) => x.status !== 64 || !x.refused || x.leaks.length);
  const noDirs = !readdirSync(work).some((f) => leaksIn(f, CAN).length) && !existsSync(canaryHome) && !existsSync(embedded);
  const a3after = await attempts(); const q3after = enrollRequests();
  // part two: the issued code written to setup's standard input; setup asks this one question and no other (no confirmation, no --yes)
  const set = await run(join(dl, 'BrainFactorySetup.exe'), ['setup', '--api', W.node.baseUrl, '--home', H, '--no-tasks'], { stdin: add.pairing_code + '\n' });
  const walked = (await sup.query(`select array_agg(t.to_state order by t.transition_id) s from factory.enrollment_transitions t join factory.enrollments e using (enrollment_id) where e.computer_id = $1`, [add.computer_id])).rows[0].s || [];
  row('R-B3d the built dev exe turns away ' + argvCases.length + ' command lines carrying a code (exit 64, a named refusal, no fragment of the code, no request, no attempt, no home or directory created); with the issued code on standard input, setup asks one question and enrolls',
    argvBad.length === 0 && noDirs && a3after === a3 && q3after === q3
      && set.status === 0 && walked.includes('RUNTIME_INSTALLING') && walked.includes('ALIVE') && !codeIn(set.out, add.pairing_code) && (set.out.match(new RegExp(PROMPT.source, 'g')) || []).length === 1,
    JSON.stringify({ argvBad, noDirs, setup: set.status, walked, tail: set.out.split(/\r?\n/).slice(-2) }).slice(0, 1500));
  if (set.status !== 0) throw new Error('setup failed: ' + set.out);
  // R-F7: two http addresses outside the endpoint rule - a TEST-NET host, and 127.0.0.2 (loopback, but not one of the three names the
  // rule accepts) where a listener counts requests; setup must stop with endpoint_refused and the listener must count none
  let spyHits = 0;
  const spy = createServer((q, r) => { spyHits++; r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true,"server_time":"2026-01-01T00:00:00Z"}'); });
  await new Promise((r) => spy.listen(0, '127.0.0.2', r));
  const f7 = [];
  for (const api of ['http://192.0.2.10:9/functions/v1/factory-node-api', 'http://127.0.0.2:' + spy.address().port + '/functions/v1/factory-node-api']) {
    const h = join(work, 'home-F7-' + f7.length);
    const r = await run(join(dl, 'BrainFactorySetup.exe'), ['setup', '--api', api, '--home', h, '--no-tasks']);
    f7.push({ status: r.status, named: /endpoint_refused/.test(r.out), prompt: PROMPT.test(r.out), config: existsSync(join(h, 'config.json')), key: existsSync(join(h, 'key', 'node.key')) });
  }
  await new Promise((r) => spy.close(r));
  row('R-F7 an http Factory Node API address that is not this computer\'s loopback ends setup with endpoint_refused: no question asked, no key or config written, and the listener at that address sees no request',
    f7.every((x) => x.status === 2 && x.named && !x.prompt && !x.config && !x.key) && spyHits === 0, JSON.stringify({ f7, spyHits }));
  const IEXE = () => join(readJ(join(H, 'current.json')).dir, 'BrainFactory.exe');
  const upgrade = (artifact, m) => run(IEXE(), ['upgrade', '--home', H, '--artifact', artifact, '--manifest', m]);
  const current0 = readFileSync(join(H, 'current.json'), 'utf8');
  // (the home's install state, read back around the unsigned offer alone: R-b0) current.json and previous.json byte for byte, and
  // every file under runtime\ by relative path and sha256 of its content (a runtime directory's files overwritten in place count)
  const homeState = () => {
    const files = [];
    const walk = (dir, rel) => { for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), r); else files.push(r + ' ' + createHash('sha256').update(readFileSync(join(dir, e.name))).digest('hex'));
    } };
    if (existsSync(join(H, 'runtime'))) walk(join(H, 'runtime'), '');
    const text = (f) => (existsSync(join(H, f)) ? readFileSync(join(H, f), 'utf8') : null);
    return { current: text('current.json'), previous: text('previous.json'), runtime: files };
  };

  // R-a / R-b / R-e: the sentinel, offered three ways
  const MS = signDev(manifest(SENT, '0.9.0'));
  const flipped = join(work, 'sentinel-1byte.exe');
  const fb = readFileSync(SENT); const L = peLayout(fb); const sec = L.sections.find((s) => s.sizeOfRawData > 4096); fb[sec.pointerToRawData + 1000] ^= 1; writeFileSync(flipped, fb);
  const ra = await upgrade(flipped, put('ms.json', MS));
  const beforeUnsigned = homeState();
  const rb = await upgrade(SENT, put('ms-unsigned.json', { ...MS, signature: null, key_id: null }));
  const afterUnsigned = homeState();
  const other = generateKeyPairSync('ed25519');
  const opk = other.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const MO = { ...manifest(SENT, '0.9.1'), key_id: keyIdOf(opk) }; MO.signature = sign(null, canonicalManifestBytes(MO), other.privateKey).toString('base64url');
  const re = await upgrade(SENT, put('ms-foreign.json', MO));
  row('R-a one byte changed inside the hashed ranges -> digest_mismatch, before execution', ra.json && ra.json.refused === 'digest_mismatch' && !existsSync(MARKER), ra.json && ra.json.refused);
  row('R-b unsigned -> unsigned, before execution', rb.json && rb.json.refused === 'unsigned' && !existsSync(MARKER), rb.json && rb.json.refused);
  // R-b0 (L7-12: AC-5 judged by state, not by the refusal's name): read back just before and just after the UNSIGNED offer alone,
  // the home's current.json and previous.json are byte-identical, every file under runtime\ has the same path and content, and the
  // sentinel never ran
  const sameHome = JSON.stringify(beforeUnsigned) === JSON.stringify(afterUnsigned);
  row('R-b0 the unsigned offer changed nothing, read back just before and after it: current.json and previous.json are byte-identical, every file under runtime\\ has the same path and sha256, and the sentinel never ran',
    sameHome && beforeUnsigned.current !== null && beforeUnsigned.runtime.length > 0 && !existsSync(MARKER),
    JSON.stringify({ same: sameHome, files: beforeUnsigned.runtime.length + ' -> ' + afterUnsigned.runtime.length, marker: existsSync(MARKER),
      changed: afterUnsigned.runtime.filter((x) => !beforeUnsigned.runtime.includes(x)).slice(0, 3) }));
  row('R-e correctly signed by a key OUTSIDE the pinned trust set -> key_outside_trust_set, before execution', re.json && re.json.refused === 'key_outside_trust_set' && !existsSync(MARKER), re.json && re.json.refused);
  // R-e2: the outside key travels IN the manifest - under every usual field name, and as a trust block - and still adds no trust
  const OE = entryOf(other);
  const carried = { public_key: OE.public_key, publicKey: OE.public_key, key: OE.public_key, pubkey: OE.public_key, public_keys: [OE], keys: [OE],
    trust: { channel: 'dev', mode: 'dev', keys: [OE] } };
  const re2 = await upgrade(SENT, put('ms-carried.json', { ...signedBy(manifest(SENT, '0.9.2'), other), ...carried }));
  row('R-e2 a release signed by an outside key that CARRIES that key in the manifest (public_key, publicKey, key, pubkey, public_keys, keys, a trust block) -> key_outside_trust_set, before execution: a key named by the manifest is never used',
    re2.json && re2.json.refused === 'key_outside_trust_set' && !existsSync(MARKER), re2.json && (re2.json.refused || re2.json.ok));
  // R-bs1 / R-bs2 / R-bs3: the pinned dev key id, the sentinel's true digest, a newer version - and a signature that does not verify
  const flipSig = (m) => { const b = Buffer.from(m.signature, 'base64url'); b[9] ^= 0x01; return { ...m, signature: b.toString('base64url') }; };
  const bs1 = await upgrade(SENT, put('ms-bs1.json', { ...MS, version: '0.9.3' }));
  const bs2 = await upgrade(SENT, put('ms-bs2.json', flipSig(MS)));
  const impostor = { ...manifest(SENT, '0.9.3'), key_id: devKey().keyId, public_key: OE.public_key };
  impostor.signature = sign(null, canonicalManifestBytes(impostor), other.privateKey).toString('base64url');
  const bs3 = await upgrade(SENT, put('ms-bs3.json', impostor));
  row('R-bs1 a dev-signed manifest whose version was changed after signing (the pinned key id, the sentinel\'s true digest) -> bad_signature, before execution',
    bs1.json && bs1.json.refused === 'bad_signature' && !existsSync(MARKER), bs1.json && (bs1.json.refused || bs1.json.ok));
  row('R-bs2 a dev-signed manifest with one signature bit flipped -> bad_signature, before execution',
    bs2.json && bs2.json.refused === 'bad_signature' && !existsSync(MARKER), bs2.json && (bs2.json.refused || bs2.json.ok));
  row('R-bs3 a manifest naming the pinned dev key id but signed by another key, which it carries -> bad_signature, before execution',
    bs3.json && bs3.json.refused === 'bad_signature' && !existsSync(MARKER), bs3.json && (bs3.json.refused || bs3.json.ok));
  // R-cm: a PRODUCTION-channel manifest signed by the dev key, offered to the dev runtime (the dev key is in its set)
  // signed by the dev key whatever the channel (signDev refuses a production manifest); extra fields lie outside the signed bytes
  const devSign = (m) => { const x = { ...m, key_id: devKey().keyId }; x.signature = sign(null, canonicalManifestBytes(x), devKey().privateKey).toString('base64url'); return x; };
  const prodDevSigned = (exe, version, extra = {}) => ({ ...devSign(manifest(exe, version, 'production')), ...extra });
  const rcm = await upgrade(SENT, put('ms-cm.json', prodDevSigned(SENT, '0.9.4')));
  row('R-cm a dev-key-signed PRODUCTION-channel release offered to the dev runtime -> channel_mismatch, before execution',
    rcm.json && rcm.json.refused === 'channel_mismatch' && !existsSync(MARKER), rcm.json && (rcm.json.refused || rcm.json.ok));
  // R-mf: the signed manifest without its receipt hash, and the same manifest as format version 2
  const noReceipt = { ...MS }; delete noReceipt.receipt_sha256;
  const mf1 = await upgrade(SENT, put('ms-mf1.json', noReceipt));
  const mf2 = await upgrade(SENT, put('ms-mf2.json', { ...MS, v: 2 }));
  row('R-mf a manifest without its receipt hash, and one of format version 2 -> malformed, before execution',
    mf1.json && mf1.json.refused === 'malformed' && mf2.json && mf2.json.refused === 'malformed' && !existsSync(MARKER),
    JSON.stringify({ noReceipt: mf1.json && (mf1.json.refused || mf1.json.ok), v2: mf2.json && (mf2.json.refused || mf2.json.ok) }));
  // R-l: the plane records a release under that foreign key (the server path); the node's trust set does not change
  const trustBefore = (await run(IEXE(), ['trust'])).json;
  const pubForeign = await publish(MO);
  const rl = await upgrade(SENT, put('ms-foreign2.json', MO));
  const trustAfter = (await run(IEXE(), ['trust'])).json;
  row('R-l a release the server records under a foreign key adds no key: the node\'s trust set is unchanged and the release is refused (key_outside_trust_set)',
    pubForeign.ok && rl.json && rl.json.refused === 'key_outside_trust_set' && JSON.stringify(trustBefore) === JSON.stringify(trustAfter)
      && trustAfter.keys.length === 1 && trustAfter.keys[0].key_id === devKey().keyId && !existsSync(MARKER), JSON.stringify(trustAfter));
  // R-n: bytes outside the hashed ranges. The certificate table carries a trust block with a REAL key (KC), a mode and an API URL on
  // this computer's loopback, where a listener counts requests
  let trapHits = 0;
  trap = createServer((q, r) => { trapHits++; r.writeHead(503, { 'content-type': 'application/json' }); r.end('{"ok":false,"refused":"unavailable"}'); });
  await new Promise((r) => trap.listen(0, '127.0.0.1', r));
  const TRAP = 'http://127.0.0.1:' + trap.address().port + '/functions/v1/factory-node-api';
  const KC = generateKeyPairSync('ed25519'); const KCE = entryOf(KC);
  const certText = (trust) => 'trust_key=' + trust.keys[0].public_key + ' mode=dev api=' + TRAP + '\nBRAIN-FACTORY-TRUST ' + JSON.stringify(trust)
    + '\nBRAIN-FACTORY-MODE dev\nBRAIN-FACTORY-API ' + TRAP + '\n';
  const nb = readFileSync(DEV);
  const nb2 = withCertTable(nb, certText({ channel: 'dev', mode: 'dev', keys: [KCE] }));
  const ncopy = join(work, 'dev-certtable.exe'); writeFileSync(ncopy, nb2);
  const readbacks = async (exe, opts = {}) => ({ trust: (await run(exe, ['trust'], opts)).json, channel: (await run(exe, ['channel'], opts)).json,
    version: (await run(exe, ['version'], opts)).json, selftest: (await run(exe, ['selftest'], opts)).out });
  const nRb = await readbacks(ncopy), dRb = await readbacks(DEV);
  row('R-n bytes in the certificate table (a trust block with a real key, a "mode dev", an API URL): the digest is unchanged, and the trust set, mode, channel, endpoint, release storage, build and selftest read back exactly as the original\'s',
    authenticodeImageHash(nb2) === authenticodeImageHash(nb) && JSON.stringify(nRb) === JSON.stringify(dRb) && dRb.trust && dRb.trust.keys.length === 1 && dRb.trust.keys[0].key_id === devKey().keyId
      && dRb.channel && dRb.channel.channel === 'dev' && dRb.channel.default_api === null && dRb.channel.trust_mode === 'dev' && /selftest: PASS/.test(dRb.selftest),
    JSON.stringify({ trust: nRb.trust, channel: nRb.channel }));
  // R-n2: the copy BEHAVES as the original. (i) setup of each, from its own folder with M1 named and no --api, stops at the same place
  // (a dev build has no default endpoint) and the listener at the table's URL sees nothing; (ii) each, installed with M1 as a
  // supervisor, is asked to start the sentinel signed by the table's key: both refuse key_outside_trust_set and start nothing
  const placeholder = 'XXXXX-XXXX-XXXX-XXXX-X\n';
  const setupFrom = async (exeBytes, name, args) => {
    const d = join(work, name); mkdirSync(d); const e = join(d, 'BrainFactorySetup.exe'); writeFileSync(e, exeBytes);
    const r = await run(e, ['setup', ...args, '--home', join(d, 'home'), '--no-tasks'], { stdin: placeholder });
    return { status: r.status, out: r.out, key: existsSync(join(d, 'home', 'key', 'node.key')) };
  };
  const hitsN2 = trapHits;
  const sN = await setupFrom(nb2, 'n2-copy', ['--manifest', join(dl, 'BrainFactorySetup.manifest.json')]);
  const sD = await setupFrom(nb, 'n2-orig', ['--manifest', join(dl, 'BrainFactorySetup.manifest.json')]);
  const MKc = signedBy(manifest(SENT, '0.9.8'), KC);
  const rigN = await rigRun(rig('rig-n2-copy', { selfExe: ncopy, selfManifest: M1, curExe: SENT, curManifest: MKc }));
  const rigD = await rigRun(rig('rig-n2-orig', { selfExe: DEV, selfManifest: M1, curExe: SENT, curManifest: MKc }));
  row('R-n2 the certificate-table copy behaves as the original: its setup ends exactly as the original\'s (exit 2, no default endpoint) with no request to the table\'s URL and no key made; as a supervisor it refuses a sentinel signed by the table\'s key (key_outside_trust_set, exit 3), exactly as the original, and the sentinel never runs',
    sN.status === 2 && sD.status === 2 && sN.out === sD.out && !sN.key && trapHits === hitsN2
      && [rigN, rigD].every((x) => x.exit === 3 && x.state === 'RELEASE_REFUSED' && x.refused === 'key_outside_trust_set' && !x.lock && !x.timedOut) && !existsSync(MARKER),
    JSON.stringify({ setup: [sN.status, sD.status, sN.out === sD.out, sN.out.split(/\r?\n/).pop()], trapHits: trapHits - hitsN2, rig: [rigN, rigD] }).slice(0, 1200));
  // R-f / R-k: the production-channel build
  const pdl = join(work, 'pdl'); mkdirSync(pdl); copyFileSync(PROD, join(pdl, 'BrainFactorySetup.exe'));
  const MP = { ...manifest(join(pdl, 'BrainFactorySetup.exe'), V, 'production'), key_id: devKey().keyId };
  MP.signature = sign(null, canonicalManifestBytes(MP), devKey().privateKey).toString('base64url');
  writeFileSync(join(pdl, 'BrainFactorySetup.manifest.json'), JSON.stringify(MP));
  const attemptsBefore = (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n;
  const requestsBefore = enrollRequests();
  // a placeholder code waits on standard input: a build that did not refuse first would read it and send it. Every production-channel
  // setup in this suite names its manifest and a loopback --api (S-15): without them it would look in the live release storage
  const rf = await run(join(pdl, 'BrainFactorySetup.exe'), ['setup', '--api', W.node.baseUrl, '--manifest', join(pdl, 'BrainFactorySetup.manifest.json'), '--home', join(work, 'home-P'), '--no-tasks'], { stdin: 'XXXXX-XXXX-XXXX-XXXX-X\n' });
  const attemptsAfter = (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n;
  const pTrust = (await run(PROD, ['trust'])).json;
  row('R-f/k a production-channel build (its trust set exactly the committed production set, mode production), pointed at a disposable plane, refuses a dev-key-signed release by name - before any network call',
    rf.status === 3 && /dev_key_on_production_channel/.test(rf.out) && attemptsBefore === attemptsAfter && enrollRequests() === requestsBefore && !PROMPT.test(rf.out)
      && pTrust.mode === 'production' && JSON.stringify(pTrust) === JSON.stringify(prodReadback()), JSON.stringify({ trust: pTrust, enrollRequests: enrollRequests() - requestsBefore }));
  // R-f2 (AC-5(f), the sentinel): the production-channel runtime's own upgrade path, in a home of the dedicated computer (neutral
  // inputs), offered ITS OWN SENTINEL (SENT_F2, marker MARKER_F2) with a dev-key-signed production manifest. It asks the plane first
  // (a heartbeat), then refuses by name; nothing is copied and that sentinel never runs
  const PX = join(pdl, 'BrainFactorySetup.exe');
  const HF2 = await nodeHome('home-F2');
  const heartbeats = () => W.node.requests.filter((r) => r.path.endsWith('/v1/node/heartbeat')).length;
  const hbF2 = heartbeats();
  const f2 = await run(PX, ['upgrade', '--home', HF2, '--artifact', SENT_F2, '--manifest', put('msp-f2.json', prodDevSigned(SENT_F2, '0.9.5'))]);
  const hbF2n = heartbeats() - hbF2;
  row('R-f2 the production-channel runtime\'s upgrade, offered the sentinel with a dev-key-signed production manifest, asks the plane and then refuses dev_key_on_production_channel: nothing is copied or made current, and the sentinel never runs',
    f2.json && f2.json.refused === 'dev_key_on_production_channel' && hbF2n >= 1 && !existsSync(MARKER_F2) && !existsSync(join(HF2, 'runtime')) && !existsSync(join(HF2, 'current.json')),
    JSON.stringify({ refused: f2.json && (f2.json.refused || f2.json.ok), heartbeats: hbF2n, markerF2: existsSync(MARKER_F2) }));
  // R-k0..R-k4 (AC-5(k)): every runtime input declares dev. The production copy PK sits in a folder whose configuration files declare
  // dev, beside a manifest whose unsigned fields declare dev; the runs get the dev environment and a working directory full of the
  // same declarations; the homes' config.json and revocation file declare dev and name the dev-declaring proxy as the plane
  const pk1 = join(work, 'pk1'); mkdirSync(pk1); copyFileSync(PROD, join(pk1, 'BrainFactorySetup.exe'));
  devFiles(pk1, DECLARE, DEV_ENV);
  const EXTRAS = { mode: 'dev', trust_mode: 'dev', trust: DECLARED_TRUST, public_key: DEV_ENTRY.public_key, keys: [DEV_ENTRY] };
  const MPX = { ...MP, ...EXTRAS };
  writeFileSync(join(pk1, 'BrainFactorySetup.manifest.json'), JSON.stringify(MPX));
  const PK = join(pk1, 'BrainFactorySetup.exe');
  const DEV_RUN = { env: DEV_ENV, cwd: devCwd };
  const k0 = await readbacks(PK, DEV_RUN), k0n = await readbacks(PROD);
  row('R-k0 with every runtime input declaring dev, the production build reads back exactly its neutral self: the committed production trust set in mode production, channel production with its fixed endpoint, the same build and selftest',
    JSON.stringify(k0) === JSON.stringify(k0n) && k0n.trust && k0n.trust.mode === 'production' && JSON.stringify(k0n.trust) === JSON.stringify(prodReadback()) && k0n.channel && k0n.channel.channel === 'production'
      && k0n.channel.trust_mode === 'production' && typeof k0n.channel.default_api === 'string' && k0n.channel.default_api === bi('production').default_api,
    JSON.stringify({ trust: k0.trust, channel: k0.channel }));
  const HK1 = join(work, 'home-K1'); homes.push(HK1);
  devFiles(HK1, { ...DECLARE, api: proxy.baseUrl }, DEV_ENV); // the home's config.json declares dev and names the proxy; no credential
  mkdirSync(join(HK1, 'state'), { recursive: true }); writeFileSync(join(HK1, 'state', 'revocations.json'), JSON.stringify({ key_ids: [], releases: [], ...DECLARE }));
  const pxK1 = proxy.hits.length; const aK1 = await attempts(); const qK1 = enrollRequests();
  const k1 = await run(PK, ['setup', '--api', proxy.baseUrl, '--manifest', join(pk1, 'BrainFactorySetup.manifest.json'), '--home', HK1, '--no-tasks'], { stdin: placeholder, ...DEV_RUN });
  row('R-k1 production setup with every runtime input declaring dev (and a dev-declaring plane named) refuses the dev-key-signed release by name (dev_key_on_production_channel, exit 3) before any request: the plane sees nothing, no attempt, no key, no question',
    k1.status === 3 && /dev_key_on_production_channel/.test(k1.out) && !PROMPT.test(k1.out) && proxy.hits.length === pxK1 && (await attempts()) === aK1 && enrollRequests() === qK1
      && !existsSync(join(HK1, 'key', 'node.key')),
    JSON.stringify({ exit: k1.status, last: k1.out.split(/\r?\n/).pop(), proxyHits: proxy.hits.length - pxK1 }));
  const pxK2 = proxy.hits.length;
  const rK2 = rig('rig-K2', { selfExe: PROD, selfManifest: MPX, curExe: SENT, curManifest: prodDevSigned(SENT, '0.9.6', EXTRAS),
    config: { ...DECLARE, api: proxy.baseUrl }, revocations: { key_ids: [], releases: [], ...DECLARE }, beside: { decl: DECLARE, env: DEV_ENV } });
  const k2 = await rigRun(rK2, DEV_RUN);
  row('R-k2 the production supervisor, with every runtime input declaring dev, refuses its own dev-key-signed release by name (RELEASE_REFUSED dev_key_on_production_channel, exit 3) and starts nothing: the sentinel installed as current never runs, no lock is left, the plane sees nothing',
    k2.exit === 3 && k2.state === 'RELEASE_REFUSED' && k2.refused === 'dev_key_on_production_channel' && !k2.lock && !k2.timedOut && !existsSync(MARKER) && proxy.hits.length === pxK2,
    JSON.stringify(k2));
  const HK3 = await nodeHome('home-K3', { ...DECLARE, api: proxy.baseUrl });
  mkdirSync(join(HK3, 'state'), { recursive: true }); writeFileSync(join(HK3, 'state', 'revocations.json'), JSON.stringify({ key_ids: [], releases: [], ...DECLARE }));
  const hbK3 = proxy.count('/v1/node/heartbeat');
  const k3 = await run(PK, ['upgrade', '--home', HK3, '--artifact', SENT, '--manifest', put('msp-k3.json', prodDevSigned(SENT, '0.9.5', EXTRAS))], DEV_RUN);
  const hbK3n = proxy.count('/v1/node/heartbeat') - hbK3;
  row('R-k3 production upgrade against a plane that declares itself dev (every answer names mode dev and the dev key) READS that answer and still refuses the dev-key-signed sentinel by name (dev_key_on_production_channel): nothing is copied, and the sentinel never runs',
    k3.json && k3.json.refused === 'dev_key_on_production_channel' && hbK3n >= 1 && !existsSync(MARKER) && !existsSync(join(HK3, 'runtime')) && !existsSync(join(HK3, 'current.json')),
    JSON.stringify({ refused: k3.json && (k3.json.refused || k3.json.ok), declaredHeartbeats: hbK3n }));
  // R-k4: the dev supervisor, every input naming an extra key K (environment, config, the revocation file, files beside it, the working
  // directory, the release's own manifest), asked to start the sentinel signed by K
  const KK = generateKeyPairSync('ed25519'); const KKE = entryOf(KK);
  const K_TRUST = { channel: 'dev', mode: 'dev', keys: [KKE] };
  const K_DECL = { ...DECLARE, trust: K_TRUST, keys: [KKE], trusted_keys: [KKE] };
  const K_ENV = devEnv(K_TRUST, [KKE]);
  const rK4 = rig('rig-K4', { selfExe: DEV, selfManifest: M1, curExe: SENT, curManifest: { ...signedBy(manifest(SENT, '0.9.9'), KK), public_key: KKE.public_key, trust: K_TRUST, keys: [KKE] },
    config: K_DECL, revocations: { key_ids: [], releases: [], ...K_DECL }, beside: { decl: K_DECL, env: K_ENV } });
  const k4 = await rigRun(rK4, { env: K_ENV, cwd: devFiles(join(work, 'k4-cwd'), K_DECL, K_ENV) });
  row('R-k4 the dev supervisor, with every runtime input naming an extra key K, refuses to start a release signed by K (RELEASE_REFUSED key_outside_trust_set, exit 3): nothing received at run time adds a key, and the sentinel never runs',
    k4.exit === 3 && k4.state === 'RELEASE_REFUSED' && k4.refused === 'key_outside_trust_set' && !k4.lock && !k4.timedOut && !existsSync(MARKER), JSON.stringify(k4));
  // R-ru: upgrade in a home whose plane does not answer - the revocation state is unknown, so nothing is installed
  const HRU = await nodeHome('home-RU', { api: 'http://127.0.0.1:9/functions/v1/factory-node-api' });
  const ru = await run(IEXE(), ['upgrade', '--home', HRU, '--artifact', SENT, '--manifest', put('ms-ru.json', MS)]);
  row('R-ru upgrade with no plane answering refuses revocations_unavailable: nothing is copied or made current, and the sentinel never runs',
    ru.json && ru.json.refused === 'revocations_unavailable' && !existsSync(MARKER) && !existsSync(join(HRU, 'runtime')) && !existsSync(join(HRU, 'current.json')),
    ru.json && (ru.json.refused || ru.json.ok));
  // R-n3 (AC-5(n), the production copy): the certificate table declares mode dev with the dev key in it and a loopback API URL
  const pb = readFileSync(PROD);
  const pb2 = withCertTable(pb, certText({ channel: 'production', mode: 'dev', keys: [DEV_ENTRY] }));
  const pcopy = join(work, 'prod-certtable.exe'); writeFileSync(pcopy, pb2);
  const pRb = await readbacks(pcopy);
  const hitsN3 = trapHits;
  const spN = await setupFrom(pb2, 'n3-copy', ['--api', TRAP, '--manifest', join(pdl, 'BrainFactorySetup.manifest.json')]);
  const spO = await setupFrom(pb, 'n3-orig', ['--api', TRAP, '--manifest', join(pdl, 'BrainFactorySetup.manifest.json')]);
  row('R-n3 the production copy with mode dev, the dev key and an API URL in its certificate table: the digest is unchanged, it reads back exactly as the original (mode production, no key), and its setup refuses the dev-key-signed release exactly as the original (dev_key_on_production_channel, exit 3) with no request to that URL',
    authenticodeImageHash(pb2) === authenticodeImageHash(pb) && JSON.stringify(pRb) === JSON.stringify(k0n) && spN.status === 3 && spO.status === 3 && spN.out === spO.out
      && /dev_key_on_production_channel/.test(spN.out) && !spN.key && trapHits === hitsN3,
    JSON.stringify({ trust: pRb.trust, setup: [spN.status, spO.status, spN.out === spO.out], trapHits: trapHits - hitsN3 }));
  // R-B3p: the production-channel exe, given the same kind of command lines: --code refused by name, nothing echoed, nothing sent
  const HP3 = join(work, 'home-P3');
  const pHome = join(work, 'canary-home-P');
  const b3p = await run(join(pdl, 'BrainFactorySetup.exe'), ['setup', '--code', CAN.display, '--home', HP3, '--no-tasks'], { canary: true, env: { BRAIN_FACTORY_HOME: pHome } });
  const b3p2 = await run(join(pdl, 'BrainFactorySetup.exe'), ['setup', '--home', HP3, CAN.lower], { canary: true, env: { BRAIN_FACTORY_HOME: pHome } });
  const b3p3 = await run(join(pdl, 'BrainFactorySetup.exe'), ['setup', '--task-name', CAN.spelledNodash], { canary: true, env: { BRAIN_FACTORY_HOME: pHome } });
  row('R-B3p the production-channel exe turns away the same command lines (--code refused by name, a positional code, a code spelled with O / I): exit 64, no fragment of the code, no request, no attempt, no home created',
    [b3p, b3p2, b3p3].every((r) => r.status === 64 && /^REFUSED - /m.test(r.out) && leaksIn(r.out, CAN).length === 0) && /--code is not an option/.test(b3p.out)
      && !existsSync(HP3) && !existsSync(pHome) && enrollRequests() === requestsBefore && (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n === attemptsAfter,
    JSON.stringify([b3p, b3p2, b3p3].map((r) => ({ status: r.status, first: r.out.split(/\r?\n/)[0].slice(0, 80), leaks: leaksIn(r.out, CAN) }))));
  // R-h: reproducible, both channels; every embedded trust entry read back from the exe and from build-info, and compared with a
  // recomputation from the committed trust source (key id, sha256 of the decoded 32-byte public key) - not with the build's own claim
  const vb = (ch) => spawnSync(process.execPath, [join(ROOT, 'scripts/factory-build/verify-build.mjs'), '--against', join(ROOT, 'dist', 'brain-factory', V, ch)], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  const hd = vb('dev'), hp = vb('production');
  const recompute = (ch) => { const t = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/enrolled/trust', ch + '.json'), 'utf8'));
    return { channel: t.channel, mode: t.mode, keys: t.keys.map((k) => ({ key_id: k.key_id, public_key_sha256: createHash('sha256').update(Buffer.from(k.public_key, 'base64url')).digest('hex') })) }; };
  const hFacts = {};
  for (const [ch, exe] of [['dev', DEV], ['production', PROD]]) {
    const info = bi(ch); const rb = (await run(exe, ['trust'])).json; const cf = (await run(exe, ['channel'])).json; const want = recompute(ch);
    const ids = info.trust.keys.map((k) => k.key_id);
    hFacts[ch] = {
      identical: (ch === 'dev' ? hd : hp).status === 0, commit: info.source_commit === src && info.channel === ch,
      readbackIsBuildInfo: JSON.stringify(rb) === JSON.stringify(info.trust), buildInfoIsSource: JSON.stringify(info.trust) === JSON.stringify(want),
      bound: info.trust.keys.every((k) => /^[0-9a-f]{64}$/.test(k.public_key_sha256) && k.key_id === 'ed25519:' + k.public_key_sha256), unique: new Set(ids).size === ids.length,
      mode: info.trust.channel === ch && info.trust.mode === ch,
      separation: ch === 'production' ? JSON.stringify([...ids].sort()) === JSON.stringify(WO6_KEY_IDS) && !ids.some((id) => KNOWN_DEV_KEY_IDS.includes(id)) : ids.length >= 1 && ids.every((id) => KNOWN_DEV_KEY_IDS.includes(id)),
      endpoint: !!cf && cf.channel === ch && cf.default_api === info.default_api && cf.release_base === info.release_base && cf.trust_mode === ch,
      digest: info.digest.value === authenticodeImageHash(readFileSync(exe)),
    };
  }
  row('R-h per channel: the verifier\'s rebuild is byte-identical; the trust set read back from the exe equals build-info\'s, and both equal a recomputation from the committed trust source (key id, sha256 of the public key); key ids bound and unique; production exactly the key ids the Director\'s WO-6 records (the release signer\'s key) and no dev key, dev only dev keys; the channel read-back names build-info\'s endpoint and release storage; the digest is the exe\'s image hash',
    Object.values(hFacts).every((f) => Object.values(f).every(Boolean)),
    JSON.stringify(hFacts) + ' | ' + (hd.stdout.match(/IDENTICAL[^\n]*|DIFFERENT[^\n]*/) || [hd.stdout.slice(-200)])[0] + ' | ' + (hp.stdout.match(/IDENTICAL[^\n]*|DIFFERENT[^\n]*/) || [hp.stdout.slice(-200)])[0]);

  // R-i / R-m: upgrade to 0.1.1, refuse the superseded 0.1.0 without an adopt, then an admin adopt returns the node to it
  const M2 = signDev(manifest(DEV2, '0.1.1'));
  const R2 = await publish(M2);
  const up = await upgrade(DEV2, put('m2.json', M2));
  const restart = async () => {
    await run(IEXE(), ['stop', '--home', H, '--no-tasks']);
    const c = spawn(IEXE(), ['supervise', '--home', H], { detached: true, stdio: 'ignore', windowsHide: true }); c.unref();
  };
  await restart();
  const onR = async (rid, ms = 90000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(2000)) { const r = (await sup.query(`select release_id from factory.nodes where computer_id = $1`, [add.computer_id])).rows[0]; if (r.release_id === rid) return true; } return false; };
  const onR2 = await onR(R2.release_id);
  const rm = await upgrade(DEV, put('m1.json', M1));
  row('R-m a superseded certified release (0.1.0) offered without an admin adopt is refused by name - no silent downgrade', up.json && up.json.ok && onR2 && rm.json && rm.json.refused === 'downgrade_refused', rm.json && rm.json.refused);
  // R-B5a: the 0.1.0 installer run again on this home (enrolled, now on 0.1.1) meets the upgrade gate and stops there; a supervisor
  // restart afterwards must produce a NEW registration (runtime_phase_at later than t0) that still names 0.1.1
  const snapA = snapshot(H);
  const b5a = await run(join(dl, 'BrainFactorySetup.exe'), ['setup', '--home', H, '--no-tasks']);
  const snapA2 = snapshot(H);
  const t0 = (await sup.query(`select now() t`)).rows[0].t;
  await restart();
  let freshReg = null;
  for (const end = Date.now() + 90000; Date.now() < end && !freshReg; await sleep(2000)) {
    const r = (await sup.query(`select release_id, runtime_digest, runtime_phase_at > $2 as fresh from factory.nodes where computer_id = $1`, [add.computer_id, t0])).rows[0];
    if (r && r.fresh) freshReg = r;
  }
  row('R-B5a running the older, superseded 0.1.0 setup on a home that is enrolled and runs 0.1.1 stops at the gate with downgrade_refused, before it installs anything: current.json, previous.json and runtime\\ keep their bytes, and after a supervisor restart the node registers again on 0.1.1',
    b5a.status === 3 && /downgrade_refused/.test(b5a.out) && /Setup stopped at the gate/.test(b5a.out) && !PROMPT.test(b5a.out) && snapA2 === snapA
      && freshReg && freshReg.release_id === R2.release_id && freshReg.runtime_digest === M2.digest,
    JSON.stringify({ exit: b5a.status, last: b5a.out.split(/\r?\n/).slice(-1)[0], unchanged: snapA2 === snapA, fresh: freshReg && { release: freshReg.release_id === R2.release_id ? 'R2' : freshReg.release_id } }).slice(0, 900));
  // the node's logon task (a test task), recorded as setup records it: an adopt must move the task to the adopted release too
  const TASK = 'BrainFactory Test-' + randomUUID().slice(0, 8); testTasks.push(TASK);
  const reg = registerTasks({ name: TASK, exe: IEXE(), home: H, watchdogMinutes: 60 });
  writeFileSync(join(H, 'config.json'), JSON.stringify({ ...readJ(join(H, 'config.json')), task: { name: TASK, home_arg: true } }, null, 2));
  const ad = await admin.call('adopt-release', { computer_id: add.computer_id, release_id: R1.release_id }, founder.token);
  const backOnR1 = await onR(R1.release_id, 120000);
  const aud = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'release.adopted' and target_id = $1`, [add.computer_id])).rows[0].n;
  row('R-i an admin adopt returns the node to the previous certified release: the runtime switches to it (verified again) and the plane records the node on it',
    ad.ok && backOnR1 && aud === 1 && readJ(join(H, 'current.json')).digest === M1.digest);
  // R-i2: the supervisor does not outlive the switch - it hands off to the adopted release's exe, and the logon task follows
  const procPath = (pid) => (spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Process -Id ' + Number(pid) + ' -ErrorAction SilentlyContinue).Path'], { encoding: 'utf8', windowsHide: true }).stdout || '').trim();
  let supExe = ''; for (let i = 0; i < 30; i++) { const l = readJ(join(H, 'state', 'supervisor.lock.json')); supExe = l && l.pid ? procPath(l.pid) : ''; if (supExe.toLowerCase() === IEXE().toLowerCase()) break; await sleep(2000); }
  const taskAfter = readTask(TASK);
  const supLog = (() => { try { return readFileSync(join(H, 'logs', 'supervisor.log'), 'utf8'); } catch { return ''; } })();
  row('R-i2 after the adopt the running supervisor IS the adopted release (it handed off; nothing keeps executing the superseded binary) and the logon task now starts the adopted exe',
    reg.ok && supExe.toLowerCase() === IEXE().toLowerCase() && String(taskAfter.arguments || '').toLowerCase().includes(IEXE().toLowerCase()) && /handed off to the supervisor of 0.1.0/.test(supLog),
    JSON.stringify({ reg: reg.ok, supExe, want: IEXE(), task: taskAfter.arguments }));
  // R-j / R-d: a second node on 0.1.1; revoke 0.1.1 while it runs
  // N2's envelope alone grants the capability rel-j: a work order requiring it can be claimed by N2 and by no other computer here
  const add2 = await admin.call('add-computer', { display_name: 'REL-N2', envelope: { roles: ['generic'], capabilities: ['rel-j'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
  const dl2 = join(work, 'dl2'); mkdirSync(dl2); copyFileSync(DEV2, join(dl2, 'BrainFactorySetup.exe')); writeFileSync(join(dl2, 'BrainFactorySetup.manifest.json'), JSON.stringify(M2));
  const H2 = join(work, 'home-N2'); homes.push(H2);
  const set2 = await run(join(dl2, 'BrainFactorySetup.exe'), ['setup', '--api', W.node.baseUrl, '--home', H2, '--no-tasks'], { stdin: add2.pairing_code + '\n' });
  const cur2 = readFileSync(join(H2, 'current.json'), 'utf8');
  // R-j0 (the positive control for R-j): BEFORE the revoke, a probe only N2 may take is claimed by N2 within the same 8 s window R-j
  // uses, and finishes (so N2 is idle again when R-j submits) - without it, R-j's 'nothing was claimed' would hold for a node that
  // never claims at all
  const runsOf = async (wo) => (await sup.query('select computer_id, status from factory.agent_runs where work_order_id = $1', [wo])).rows;
  const settled = async (wo, ms = 60000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(2000)) { const rs = await runsOf(wo); if (rs.length && rs.every((r) => r.status !== 'in_progress')) return true; } return false; };
  const wj0 = await W.submit({ title: 'control: a claim N2 alone may take', work_type: 'probe', priority: 90, requires_capabilities: ['rel-j'] });
  await sleep(8000);
  const took0 = (await runsOf(wj0)).filter((r) => r.computer_id === add2.computer_id).length;
  const done0 = took0 > 0 && await settled(wj0);
  row('R-j0 the positive control for R-j: before the revoke, a probe only N2 may take is claimed by N2 within the same 8 s window, and finishes',
    set2.status === 0 && took0 === 1 && done0, JSON.stringify({ took0, done0, runs: await runsOf(wj0) }));
  await admin.call('revoke-release', { release_id: R2.release_id, reason: 'rehearsal' }, founder.token);
  let st = null; for (let i = 0; i < 30 && !(st && st.state === 'RELEASE_REVOKED'); i++) { await sleep(2000); st = readJ(join(H2, 'state', 'status.json')); }
  const wj = await W.submit({ title: 'work while revoked', work_type: 'probe', priority: 90, requires_capabilities: ['rel-j'] });
  await sleep(8000);
  const took = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1 and computer_id = $2`, [wj, add2.computer_id])).rows[0].n;
  row('R-j a published release revoked while a node runs it: the node stops claiming and says so (RELEASE_REVOKED, standby), and never downgrades silently',
    set2.status === 0 && st && st.state === 'RELEASE_REVOKED' && took === 0 && readFileSync(join(H2, 'current.json'), 'utf8') === cur2, st && st.state);
  const rd = await upgrade(DEV2, put('m2b.json', M2));
  // ... and a SENTINEL release (its own digest and marker): published, then revoked - judged only when both actions succeeded
  const MSd = signDev(manifest(SENT_D, '0.9.7'));
  const pubD = await publish(MSd);
  const revD = pubD.ok ? await admin.call('revoke-release', { release_id: pubD.release_id, reason: 'rehearsal' }, founder.token) : { ok: false, refused: 'not published' };
  const rdS = pubD.ok && revD.ok ? await upgrade(SENT_D, put('msd.json', MSd)) : { json: null };
  row('R-d a revoked release, offered again, is refused by name (release_revoked) before execution: the revoked 0.1.1, and a sentinel release published and then revoked, which never runs',
    rd.json && rd.json.refused === 'release_revoked' && pubD.ok && revD.ok && rdS.json && rdS.json.refused === 'release_revoked' && !existsSync(MARKER_D),
    JSON.stringify({ rd: rd.json && (rd.json.refused || rd.json.ok), publish: pubD.ok || pubD.refused, revoke: revD.ok || revD.refused, sentinel: rdS.json && (rdS.json.refused || rdS.json.ok), marker: existsSync(MARKER_D) }));
  // R-B5b: the 0.1.1 installer (its release now revoked) run on H, which is enrolled and runs the adopted 0.1.0, with H's logon task
  // named on the command line; the gate must stop it, so the install records and the task's action stay as they are
  const snapB = snapshot(H); const taskB = JSON.stringify(readTask(TASK).arguments || null);
  const b5b = await run(join(dl2, 'BrainFactorySetup.exe'), ['setup', '--home', H, '--task-name', TASK]);
  const nodeB = (await sup.query(`select release_id from factory.nodes where computer_id = $1`, [add.computer_id])).rows[0];
  row('R-B5b running the revoked 0.1.1 setup, with the logon task named, on an enrolled home stops at the gate with release_revoked: the three install records keep their bytes, the task still starts the same command, and the plane still records the node on 0.1.0',
    b5b.status === 3 && /release_revoked/.test(b5b.out) && !PROMPT.test(b5b.out) && snapshot(H) === snapB && JSON.stringify(readTask(TASK).arguments || null) === taskB && taskB !== 'null'
      && nodeB && nodeB.release_id === R1.release_id,
    JSON.stringify({ exit: b5b.status, last: b5b.out.split(/\r?\n/).slice(-1)[0], unchanged: snapshot(H) === snapB, task: JSON.stringify(readTask(TASK).arguments || null) === taskB }).slice(0, 900));
  // R-m2 (AC-5(m)): H runs the ADOPTED 0.1.0 (A). Two sentinels are published in order, 0.1.2 (B) and 0.1.3 (C): C supersedes B. An
  // upgrade to B - newer than A, so the version test alone would take it - must be refused before anything is copied; C (published)
  // and A (adopted) pass. C is never started: the worker switches only on an adopt, and A is made current again at once.
  const MARKER_B = join(work, 'SENTINEL-B-EXECUTED.txt'), MARKER_C = join(work, 'SENTINEL-C-EXECUTED.txt');
  const SB = await buildSentinel(join(work, 'sentinel-b.exe'), MARKER_B), SC = await buildSentinel(join(work, 'sentinel-c.exe'), MARKER_C);
  const MB = signDev(manifest(SB, '0.1.2')), MC = signDev(manifest(SC, '0.1.3'));
  const pubB = await publish(MB), pubC = await publish(MC);
  const aExe = IEXE(); // (the upgrades run from A's own exe: after C becomes current, IEXE() would name the sentinel)
  const upgradeFromA = (artifact, m) => run(aExe, ['upgrade', '--home', H, '--artifact', artifact, '--manifest', m]);
  const snapM2 = snapshot(H); const taskM2 = JSON.stringify(readTask(TASK).arguments || null);
  const m2b = await upgradeFromA(SB, put('mb.json', MB));
  const bUntouched = snapshot(H) === snapM2 && JSON.stringify(readTask(TASK).arguments || null) === taskM2 && !existsSync(join(H, 'runtime', '0.1.2-' + MB.digest.slice(0, 12)));
  const m2c = await upgradeFromA(SC, put('mc.json', MC));
  const cCurrent = (readJ(join(H, 'current.json')) || {}).digest === MC.digest;
  const m2a = await upgradeFromA(DEV, put('ma.json', M1));
  const aCurrent = (readJ(join(H, 'current.json')) || {}).digest === M1.digest && String(readTask(TASK).arguments || '').toLowerCase().includes(IEXE().toLowerCase());
  row('R-m2 a node on its adopted release (0.1.0), with 0.1.2 superseded by the published 0.1.3: upgrade to 0.1.2 is refused release_not_current before anything is copied (runtime\\, current.json, previous.json and the logon task unchanged); upgrade to the published 0.1.3 passes; upgrade to the adopted 0.1.0 (the running exe) passes and makes it current again; neither sentinel ever runs',
    pubB.ok && pubC.ok && m2b.json && m2b.json.refused === 'release_not_current' && bUntouched && m2c.json && m2c.json.ok && cCurrent
      && m2a.json && m2a.json.ok && aCurrent && !existsSync(MARKER_B) && !existsSync(MARKER_C),
    JSON.stringify({ b: m2b.json && (m2b.json.refused || m2b.json.ok), bUntouched, c: m2c.json && (m2c.json.ok || m2c.json.refused), cCurrent, a: m2a.json && (m2a.json.ok || m2a.json.refused), aCurrent }).slice(0, 900));
  // R-c0 (the positive control for R-c): BEFORE the key revoke, a probe is claimed by N - on its adopted release; N2 stands by on the
  // revoked 0.1.1, and REL-P runs no worker - within the same 8 s window R-c then uses, and finishes
  const wc0 = await W.submit({ title: 'control: a claim N takes', work_type: 'probe', priority: 95 });
  await sleep(8000);
  const tookC0 = (await runsOf(wc0)).filter((r) => r.computer_id === add.computer_id).length;
  const doneC0 = tookC0 > 0 && await settled(wc0);
  row('R-c0 the positive control for R-c: before the key revoke, a probe is claimed by N within the same 8 s window, and finishes',
    tookC0 === 1 && doneC0, JSON.stringify({ tookC0, doneC0, runs: await runsOf(wc0) }));
  // R-c: revoke the dev key: offered releases AND the node's own release are refused
  await admin.call('revoke-key', { key_id: devKey().keyId, reason: 'rehearsal' }, founder.token);
  const rc = await upgrade(SENT, put('ms2.json', MS));
  // the running node finds its own release's key revoked: standby - it claims nothing and says so; a probe it would have taken waits
  let stN = null; for (let i = 0; i < 30 && !(stN && stN.state === 'RELEASE_REVOKED'); i++) { await sleep(2000); stN = readJ(join(H, 'state', 'status.json')); }
  const wc = await W.submit({ title: 'work while the key is revoked', work_type: 'probe', priority: 95 });
  await sleep(8000);
  const tookC = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1`, [wc])).rows[0].n;
  const again = { status: tookC };
  row('R-c a revoked key: a release it signed is refused before execution (key_revoked); the node whose own release it signed stops claiming and says so (RELEASE_REVOKED)',
    rc.json && rc.json.refused === 'key_revoked' && again.status === 0 && stN && stN.state === 'RELEASE_REVOKED', JSON.stringify({ rc: rc.out.slice(-300), again: again.status, st: stN, rev: readJ(join(H, 'state', 'revocations.json')) }).slice(0, 1200));
  // R-B5c: the 0.1.0 installer, whose signing key is now revoked, run on H2 (enrolled, standing by on the revoked 0.1.1); the gate
  // must stop it, so H2 never moves to an older release under a revoked key
  const snapC = snapshot(H2);
  const b5c = await run(join(dl, 'BrainFactorySetup.exe'), ['setup', '--home', H2, '--no-tasks']);
  const nodeC = (await sup.query(`select release_id from factory.nodes where computer_id = $1`, [add2.computer_id])).rows[0];
  row('R-B5c the 0.1.0 installer, whose signing key is now revoked, run on H2 (enrolled) stops at the gate with key_revoked: current.json, previous.json and runtime\\ keep their bytes, and the plane still records the node on the release it ran (0.1.1)',
    b5c.status === 3 && /key_revoked/.test(b5c.out) && !PROMPT.test(b5c.out) && snapshot(H2) === snapC && nodeC && nodeC.release_id === R2.release_id,
    JSON.stringify({ exit: b5c.status, last: b5c.out.split(/\r?\n/).slice(-1)[0], unchanged: snapshot(H2) === snapC, release: nodeC && (nodeC.release_id === R2.release_id ? 'R2' : nodeC.release_id) }).slice(0, 900));
  // R-B5d: no plane answers, so no current revocation list can be had; setup on the enrolled home must stop at the gate.
  // H is stopped first; its config names an address nothing listens on while the row runs, then is restored.
  await run(IEXE(), ['stop', '--home', H, '--no-tasks']);
  const cfgText = readFileSync(join(H, 'config.json'), 'utf8');
  const snapD = snapshot(H);
  let b5d;
  try {
    writeFileSync(join(H, 'config.json'), JSON.stringify({ ...JSON.parse(cfgText), api: 'http://127.0.0.1:9/functions/v1/factory-node-api' }, null, 2));
    b5d = await run(join(dl2, 'BrainFactorySetup.exe'), ['setup', '--home', H, '--no-tasks']);
  } finally { writeFileSync(join(H, 'config.json'), cfgText); }
  row('R-B5d with no plane answering at the configured address, setup on an enrolled home stops at the gate with revocations_unavailable, and current.json, previous.json and runtime\\ keep their bytes',
    b5d.status === 3 && /revocations_unavailable/.test(b5d.out) && !PROMPT.test(b5d.out) && snapshot(H) === snapD,
    JSON.stringify({ exit: b5d.status, last: b5d.out.split(/\r?\n/).slice(-1)[0], unchanged: snapshot(H) === snapD }).slice(0, 900));
  // R-t: a supervisor whose image is no release installed in its home (a one-byte-tampered copy) starts nothing
  const H4 = join(work, 'home-T'); mkdirSync(join(H4, 'state'), { recursive: true }); homes.push(H4);
  writeFileSync(join(H4, 'current.json'), readFileSync(join(H, 'current.json')));
  const tdir = join(work, 'tampered'); mkdirSync(tdir); const tex = join(tdir, 'BrainFactory.exe');
  const tb = readFileSync(IEXE()); tb[tb.indexOf(Buffer.from('This program cannot be run in DOS mode', 'latin1'))] ^= 0x20; writeFileSync(tex, tb);
  const rt = await run(tex, ['supervise', '--home', H4]);
  const stT = readJ(join(H4, 'state', 'status.json')) || {};
  row('R-t a supervisor whose own image is no release installed here (one byte changed) verifies itself first and starts nothing: exit 3, RELEASE_REFUSED (not_an_installed_release)',
    rt.status === 3 && stT.state === 'RELEASE_REFUSED' && stT.refused === 'not_an_installed_release' && !readJ(join(H4, 'state', 'supervisor.lock.json')), JSON.stringify({ exit: rt.status, st: stT.state, refused: stT.refused }));
  // the sentinel was never executed; the positive control shows it would have left its marker
  const neverRan = !existsSync(MARKER) && !existsSync(MARKER_D) && !existsSync(MARKER_F2) && !existsSync(join(work, 'SENTINEL-B-EXECUTED.txt')) && !existsSync(join(work, 'SENTINEL-C-EXECUTED.txt'));
  const ctl = spawnSync(SENT, ['control'], { windowsHide: true, timeout: 60000 });
  const ctlD = spawnSync(SENT_D, ['control'], { windowsHide: true, timeout: 60000 });
  const ctlF2 = spawnSync(SENT_F2, ['control'], { windowsHide: true, timeout: 60000 });
  row('R-s the sentinels were never executed through any refusal above; run directly (the positive control) each leaves its marker',
    neverRan && ctl.status === 0 && existsSync(MARKER) && readFileSync(MARKER, 'utf8').includes('control') && ctlD.status === 0 && existsSync(MARKER_D) && readFileSync(MARKER_D, 'utf8').includes('control')
      && ctlF2.status === 0 && existsSync(MARKER_F2) && readFileSync(MARKER_F2, 'utf8').includes('control'),
    JSON.stringify({ neverRan, ctl: ctl.status, ctlD: ctlD.status, ctlF2: ctlF2.status, err: String(ctl.error || ctlD.error || ctlF2.error || ''), marker: existsSync(MARKER) && readFileSync(MARKER, 'utf8').slice(0, 200), markerD: existsSync(MARKER_D), markerF2: existsSync(MARKER_F2) }));
  void current0; void randomUUID; void createHash;
} catch (e) {
  row('X0 release rehearsal', false, e && e.stack || e);
} finally {
  for (const t of testTasks) { try { unregisterTasks(t); } catch { /* gone */ } }
  for (const h of homes) { try { writeFileSync(join(h, 'state', 'stop.request'), '{}'); } catch { /* gone */ } }
  await sleep(4000);
  for (const h of homes) { const l = readJ(join(h, 'state', 'supervisor.lock.json')) || {}; for (const pid of [l.worker_pid, l.pid]) if (pid) try { process.kill(pid); } catch { /* gone */ } }
  if (proxy) await proxy.stop().catch(() => {});
  if (trap) await new Promise((r) => trap.close(r));
  await W.stop();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nrelease_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/release_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
