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
// usage: node qa/factory/v1/release_acceptance.mjs [--evidence <file>]   (builds what it needs; ~6 min)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { ROOT } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { world, recorder } from './flows.mjs';
import { makeManifest, signDev, devKey } from '../../../scripts/factory-build/release-manifest.mjs';
import { canonicalManifestBytes, keyIdOf } from '../../../scripts/factory-runner/enrolled/release.mjs';
import { authenticodeImageHash, peLayout } from '../../../scripts/factory-runner/enrolled/pe-image.mjs';
import { buildSentinel } from './sentinel.mjs';

const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const DIST = (ch) => join(ROOT, 'dist', 'brain-factory', V, ch, 'BrainFactorySetup.exe');
const work = mkdtempSync(join(tmpdir(), 'bf-release-'));
const MARKER = join(work, 'SENTINEL-EXECUTED.txt');
const run = (exe, args) => new Promise((resolve) => {
  const c = spawn(exe, args, { windowsHide: true });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (status) => resolve({ status, out: out.trim(), json: (() => { try { return JSON.parse(out.trim().split(/\r?\n/).pop()); } catch { return null; } })() }));
});
const build = (args) => { const r = spawnSync(process.execPath, [join(ROOT, 'scripts/factory-build/build-sea.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 }); if (r.status !== 0) throw new Error('build failed: ' + r.stdout + r.stderr); };
const src = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rcpt = (s) => sha256('receipt ' + s);
const readJ = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const W = await world();
const homes = [];
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
    signature: m.signature, receipt_sha256: m.receipt_sha256, manifest: m }, founder.token);

  // ---- a node installed from the dev build (R1 = 0.1.0)
  const dl = join(work, 'dl'); mkdirSync(dl);
  copyFileSync(DEV, join(dl, 'BrainFactorySetup.exe'));
  const M1 = signDev(manifest(join(dl, 'BrainFactorySetup.exe'), V));
  writeFileSync(join(dl, 'BrainFactorySetup.manifest.json'), JSON.stringify(M1));
  const R1 = await publish(M1);
  const add = await admin.call('add-computer', { display_name: 'REL-N', envelope: { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
  const H = join(work, 'home-N'); homes.push(H);
  const set = await run(join(dl, 'BrainFactorySetup.exe'), ['setup', '--code', add.pairing_code, '--api', W.node.baseUrl, '--yes', '--home', H, '--no-tasks']);
  if (set.status !== 0) throw new Error('setup failed: ' + set.out);
  const IEXE = () => join(readJ(join(H, 'current.json')).dir, 'BrainFactory.exe');
  const upgrade = (artifact, m) => run(IEXE(), ['upgrade', '--home', H, '--artifact', artifact, '--manifest', m]);
  const current0 = readFileSync(join(H, 'current.json'), 'utf8');

  // R-a / R-b / R-e: the sentinel, offered three ways
  const MS = signDev(manifest(SENT, '0.9.0'));
  const flipped = join(work, 'sentinel-1byte.exe');
  const fb = readFileSync(SENT); const L = peLayout(fb); const sec = L.sections.find((s) => s.sizeOfRawData > 4096); fb[sec.pointerToRawData + 1000] ^= 1; writeFileSync(flipped, fb);
  const ra = await upgrade(flipped, put('ms.json', MS));
  const rb = await upgrade(SENT, put('ms-unsigned.json', { ...MS, signature: null, key_id: null }));
  const other = generateKeyPairSync('ed25519');
  const opk = other.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const MO = { ...manifest(SENT, '0.9.1'), key_id: keyIdOf(opk) }; MO.signature = sign(null, canonicalManifestBytes(MO), other.privateKey).toString('base64url');
  const re = await upgrade(SENT, put('ms-foreign.json', MO));
  row('R-a one byte changed inside the hashed ranges -> digest_mismatch, before execution', ra.json && ra.json.refused === 'digest_mismatch' && !existsSync(MARKER), ra.json && ra.json.refused);
  row('R-b unsigned -> unsigned, before execution', rb.json && rb.json.refused === 'unsigned' && !existsSync(MARKER), rb.json && rb.json.refused);
  row('R-e correctly signed by a key OUTSIDE the pinned trust set -> key_outside_trust_set, before execution', re.json && re.json.refused === 'key_outside_trust_set' && !existsSync(MARKER), re.json && re.json.refused);
  // R-l: the plane records a release under that foreign key (the server path); the node's trust set does not change
  const trustBefore = (await run(IEXE(), ['trust'])).json;
  const pubForeign = await publish(MO);
  const rl = await upgrade(SENT, put('ms-foreign2.json', MO));
  const trustAfter = (await run(IEXE(), ['trust'])).json;
  row('R-l a release the server records under a foreign key adds no key: the node\'s trust set is unchanged and the release is refused (key_outside_trust_set)',
    pubForeign.ok && rl.json && rl.json.refused === 'key_outside_trust_set' && JSON.stringify(trustBefore) === JSON.stringify(trustAfter)
      && trustAfter.keys.length === 1 && trustAfter.keys[0].key_id === devKey().keyId && !existsSync(MARKER), JSON.stringify(trustAfter));
  // R-n: bytes outside the hashed ranges
  const ncopy = join(work, 'dev-certtable.exe');
  const nb = readFileSync(DEV); const NL = peLayout(nb);
  const junk = Buffer.from('trust_key=' + Buffer.alloc(32, 7).toString('base64url') + ' mode=dev api=https://evil.example/functions/v1/x', 'utf8');
  const pad = Buffer.alloc((8 - ((junk.length + 8) % 8)) % 8);
  const cert = Buffer.concat([Buffer.alloc(8), junk, pad]); cert.writeUInt32LE(cert.length, 0); cert.writeUInt16LE(0x0200, 4); cert.writeUInt16LE(0x0002, 6);
  const nb2 = Buffer.concat([nb, cert]); nb2.writeUInt32LE(nb.length, NL.certDirOffset); nb2.writeUInt32LE(cert.length, NL.certDirOffset + 4);
  writeFileSync(ncopy, nb2);
  const nTrust = (await run(ncopy, ['trust'])).json, dTrust = (await run(DEV, ['trust'])).json;
  const nVer = (await run(ncopy, ['version'])).json, dVer = (await run(DEV, ['version'])).json;
  row('R-n bytes appended in the certificate table (a "trust key", a "mode", an "API URL"): the digest is unchanged, and the trust set, mode and build are exactly the original\'s',
    authenticodeImageHash(nb2) === authenticodeImageHash(nb) && JSON.stringify(nTrust) === JSON.stringify(dTrust) && JSON.stringify(nVer) === JSON.stringify(dVer), JSON.stringify(nTrust));
  // R-f / R-k: the production-channel build
  const pdl = join(work, 'pdl'); mkdirSync(pdl); copyFileSync(PROD, join(pdl, 'BrainFactorySetup.exe'));
  const MP = { ...manifest(join(pdl, 'BrainFactorySetup.exe'), V, 'production'), key_id: devKey().keyId };
  MP.signature = sign(null, canonicalManifestBytes(MP), devKey().privateKey).toString('base64url');
  writeFileSync(join(pdl, 'BrainFactorySetup.manifest.json'), JSON.stringify(MP));
  const attemptsBefore = (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n;
  const rf = await run(join(pdl, 'BrainFactorySetup.exe'), ['setup', '--code', 'XXXXX-XXXX-XXXX-XXXX-X', '--api', W.node.baseUrl, '--yes', '--home', join(work, 'home-P'), '--no-tasks']);
  const attemptsAfter = (await sup.query(`select count(*)::int n from factory.pairing_attempts`)).rows[0].n;
  const pTrust = (await run(PROD, ['trust'])).json;
  row('R-f/k a production-channel build (trust set empty before C-3, mode production), pointed at a disposable plane, refuses a dev-key-signed release by name - before any network call',
    rf.status === 3 && /dev_key_on_production_channel/.test(rf.out) && attemptsBefore === attemptsAfter && pTrust.mode === 'production' && pTrust.keys.length === 0, JSON.stringify(pTrust));
  // R-h: reproducible, both channels
  const vb = (ch) => spawnSync(process.execPath, [join(ROOT, 'scripts/factory-build/verify-build.mjs'), '--against', join(ROOT, 'dist', 'brain-factory', V, ch)], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  const hd = vb('dev'), hp = vb('production');
  const bi = (ch) => readJ(join(ROOT, 'dist', 'brain-factory', V, ch, 'build-info.json'));
  row('R-h the verifier\'s rebuild of each channel is byte-identical; each channel\'s digest is the manifest\'s; the trust set read back per channel',
    hd.status === 0 && hp.status === 0 && bi('dev').digest.value === authenticodeImageHash(readFileSync(DEV)) && bi('production').trust.keys.length === 0
      && bi('dev').trust.keys[0].key_id === devKey().keyId, (hd.stdout.match(/IDENTICAL[^\n]*/) || [hd.stdout.slice(-200)])[0] + ' | ' + (hp.stdout.match(/IDENTICAL[^\n]*/) || [hp.stdout.slice(-200)])[0]);

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
  const ad = await admin.call('adopt-release', { computer_id: add.computer_id, release_id: R1.release_id }, founder.token);
  const backOnR1 = await onR(R1.release_id, 120000);
  const aud = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'release.adopted' and target_id = $1`, [add.computer_id])).rows[0].n;
  row('R-i an admin adopt returns the node to the previous certified release: the runtime switches to it (verified again) and the plane records the node on it',
    ad.ok && backOnR1 && aud === 1 && readJ(join(H, 'current.json')).digest === M1.digest);
  // R-j / R-d: a second node on 0.1.1; revoke 0.1.1 while it runs
  const add2 = await admin.call('add-computer', { display_name: 'REL-N2', envelope: { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
  const dl2 = join(work, 'dl2'); mkdirSync(dl2); copyFileSync(DEV2, join(dl2, 'BrainFactorySetup.exe')); writeFileSync(join(dl2, 'BrainFactorySetup.manifest.json'), JSON.stringify(M2));
  const H2 = join(work, 'home-N2'); homes.push(H2);
  const set2 = await run(join(dl2, 'BrainFactorySetup.exe'), ['setup', '--code', add2.pairing_code, '--api', W.node.baseUrl, '--yes', '--home', H2, '--no-tasks']);
  const cur2 = readFileSync(join(H2, 'current.json'), 'utf8');
  await admin.call('revoke-release', { release_id: R2.release_id, reason: 'rehearsal' }, founder.token);
  let st = null; for (let i = 0; i < 30 && !(st && st.state === 'RELEASE_NOT_CURRENT'); i++) { await sleep(2000); st = readJ(join(H2, 'state', 'status.json')); }
  const wj = await W.submit({ title: 'work while revoked', work_type: 'probe', priority: 90 });
  await sleep(8000);
  const took = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1 and computer_id = $2`, [wj, add2.computer_id])).rows[0].n;
  row('R-j a published release revoked while a node runs it: the node stops claiming and says so (RELEASE_NOT_CURRENT), and never downgrades silently',
    set2.status === 0 && st && st.state === 'RELEASE_NOT_CURRENT' && took === 0 && readFileSync(join(H2, 'current.json'), 'utf8') === cur2, st && st.state);
  const rd = await upgrade(DEV2, put('m2b.json', M2));
  row('R-d the revoked release, offered again, is refused by name (release_revoked)', rd.json && rd.json.refused === 'release_revoked', rd.json && rd.json.refused);
  // R-c: revoke the dev key: offered releases AND the node's own release are refused
  await admin.call('revoke-key', { key_id: devKey().keyId, reason: 'rehearsal' }, founder.token);
  const rc = await upgrade(SENT, put('ms2.json', MS));
  // the running node finds its own release revoked on its next heartbeat and stops; a new start is refused before execution
  for (let i = 0; i < 30 && readJ(join(H, 'state', 'supervisor.lock.json')); i++) await sleep(2000);
  const again = await run(IEXE(), ['supervise', '--home', H]);
  const stN = readJ(join(H, 'state', 'status.json'));
  row('R-c a revoked key: a release it signed is refused (key_revoked), and the node\'s OWN release is refused at its next start (RELEASE_REFUSED) - before execution',
    rc.json && rc.json.refused === 'key_revoked' && again.status === 3 && stN.state === 'RELEASE_REFUSED' && stN.refused === 'key_revoked', JSON.stringify({ rc: rc.out.slice(-300), again: again.status, againOut: again.out.slice(-200), st: stN, rev: readJ(join(H, 'state', 'revocations.json')) }).slice(0, 1200));
  // the sentinel was never executed; the positive control shows it would have left its marker
  const neverRan = !existsSync(MARKER);
  const ctl = spawnSync(SENT, ['control'], { windowsHide: true, timeout: 60000 });
  row('R-s the sentinel was never executed through any refusal above; run directly (the positive control) it leaves its marker',
    neverRan && ctl.status === 0 && existsSync(MARKER) && readFileSync(MARKER, 'utf8').includes('control'), JSON.stringify({ neverRan, ctl: ctl.status, err: String(ctl.error || ''), marker: existsSync(MARKER) && readFileSync(MARKER, 'utf8').slice(0, 200) }));
  void current0; void randomUUID; void createHash;
} catch (e) {
  row('X0 release rehearsal', false, e && e.stack || e);
} finally {
  for (const h of homes) { try { writeFileSync(join(h, 'state', 'stop.request'), '{}'); } catch { /* gone */ } }
  await sleep(4000);
  for (const h of homes) { const l = readJ(join(h, 'state', 'supervisor.lock.json')) || {}; for (const pid of [l.worker_pid, l.pid]) if (pid) try { process.kill(pid); } catch { /* gone */ } }
  await W.stop();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nrelease_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/release_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
