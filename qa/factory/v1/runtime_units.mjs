#!/usr/bin/env node
// THE ENROLLED RUNTIME'S UNITS - DEVELOPER VERIFICATION, no plane and no database (Windows: named pipes, the registry reader).
// Stub Node API answers and in-memory key seams stand in for the plane where a row needs one; each row names the defect it pins.
//   FP1-FP6  the machine fingerprint (contract §1 r3): sha256 of the UTF-8 bytes of the MachineGuid string exactly as stored - known
//            answers (case kept, braces kept, non-ASCII as UTF-8), the reader's base64 transport, this machine's value equal to the
//            registry's read independently, and a failed read named and tried again (never cached as "no fingerprint"); FP7 the
//            worker's read leaves the event loop free while PowerShell runs, and callers asking at once share one read
//   RV1-RV2  the local revocation list only grows (L4-F8): a union; a worker whose register delivered a revoked release and whose
//            heartbeats then deliver empty lists still holds it, stands by, and the supervisor's start-path check (verifyInstalled)
//            of the installed release still refuses it
//   LC1-LC3  the lease guard measures durations only (L5-F6): whatever the wall-clock offset (+-200 s, +-700 s), a lease whose
//            renewals fail aborts the work before the granted lease ends, and renewals ask for exactly the granted lease; a renewal
//            whose answer arrives late extends the lease from the moment it was sent, never from its answer
//   CL1-CL2  a claim answer that proves nothing gives back what the claim may have taken (a SQLSTATE rollback and the named lock
//            refusal do prove it); a claimed work type without a handler is given back, never completed as failed
//   HF1-HF9  what a handler's failure means for its run (C2-P1; contract P-2 restart / recovery; 69df2f52 node.mjs:522-540): a thrown
//            handler does NOT fail its run - nothing more is sent for it and its lease is left to lapse, so any eligible node resumes
//            the work - except a failure the same input meets on every attempt (a data exception the plane's server raised, a
//            request the API refused as malformed), which fails the run by name; a lost lease completes nothing; a terminal
//            credential refusal still stops the worker REFUSED; a verification handler's error still gives its claim back; and a
//            claim answer lost while such a run waits out its lease gives back every OTHER run of the node, keeping that one; a completion that
//            meets a transient refusal is left to the lease the same way
//   SI1-SI3  one supervisor and one worker per home by named pipe (L4-F3): a lock record naming a foreign or unrelated live pid never
//            blocks a start; two supervisors started at once start exactly one worker; a second worker exits ALREADY before any call;
//            an orphaned worker is asked to stop and does; a pipe holder that ignores "stop" and names another process's pid is left
//            alone - no process is ended by a pid, and no second worker is started
//   SV1-SV2  the supervisor and a rotation: a REFUSED record does not keep the worker from starting while a rotation of the home is
//            pending (record or key file); a worker's exit 7 (CREDENTIAL_ROTATED) is restarted at once, without the crash backoff
//   RR1-RR6  a rotation whose answer was lost (L3-F5), resolved with the stored key: only a proof changes a key file; a late commit is
//            promoted, never discarded; discarded only once the old credential is no longer active; an unreadable pending key is kept;
//            a pending key without its record is probed, not deleted; a failed promotion keeps the record
//   CF1      config.json that cannot be read at the instant it would be rewritten is never rewritten from {}: a rotation is not
//            started (config_unreadable, no request, no key stored), a promotion and a discard change no file
// usage: node qa/factory/v1/runtime_units.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = (p) => join(ROOT, ...p.split('/'));
const imp = (p) => import(pathToFileURL(R(p)).href);
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + String(detail).slice(0, 1500) : '')); };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const work = mkdtempSync(join(tmpdir(), 'bf-units-'));
const children = [];

// the dev channel's trust set, defined BEFORE release.mjs (imported by everything below) is first evaluated (SI2 installs a release)
globalThis.__TRUST__ = JSON.parse(readFileSync(R('scripts/factory-runner/enrolled/trust/dev.json'), 'utf8'));
const id = await imp('scripts/factory-runner/enrolled/identity.mjs');
const { mergeRevocations } = await imp('scripts/factory-runner/enrolled/revocations.mjs');
const { runWorker, workClaimed, claimAnswerLost, terminalFailure, EXIT_WORKER } = await imp('scripts/factory-runner/enrolled/worker.mjs');
const { HANDLERS } = await imp('scripts/factory-runner/enrolled/handlers.mjs');
const { runSupervisor, verifyInstalled } = await imp('scripts/factory-runner/enrolled/supervisor.mjs');
const inst = await imp('scripts/factory-runner/enrolled/instance.mjs');
const { promotePending, resolvePendingRotation } = await imp('scripts/factory-runner/enrolled/credential.mjs');
const { NodeApi, TERMINAL } = await imp('scripts/factory-runner/enrolled/api.mjs');
const { newKey, publicKeyOf } = await imp('scripts/factory-runner/enrolled/keys.mjs');
const { paths, readJson, writeJson } = await imp('scripts/factory-runner/enrolled/home.mjs');
const { verifyRelease, keyIdOf, canonicalManifestBytes } = await imp('scripts/factory-runner/enrolled/release.mjs');
const { makeManifest, signDev } = await imp('scripts/factory-build/release-manifest.mjs');
const { registryFingerprint } = await imp('qa/factory/v1/realnode.mjs');

const newHome = (name) => { const h = join(work, name); mkdirSync(join(h, 'state'), { recursive: true }); return h; };
/** an installed dev-signed release in `home` (a copy of a small system executable: its PE image hash is all the check reads) */
const installRelease = (home, tag) => {
  const art = join(home, 'runtime', '0.1.0-' + tag, 'BrainFactory.exe'); mkdirSync(dirname(art), { recursive: true });
  copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), art);
  const m = signDev(makeManifest({ artifact: art, channel: 'dev', version: '0.1.0', source_sha: 'a'.repeat(40), receipt_sha256: 'b'.repeat(64) }));
  writeFileSync(join(dirname(art), 'manifest.json'), JSON.stringify(m));
  writeJson(paths(home).current, { dir: dirname(art), version: '0.1.0', digest: m.digest, via: 'setup' });
  return m;
};
// an in-memory stand-in for the DPAPI key store (the rows that need no DPAPI): the key file holds the DER, read back as the runtime does
const fileKeyIo = (opts = {}) => {
  const io = {
    newKey,
    storeKey: async (file, key) => { if (io.failStore && io.failStore(file)) throw Object.assign(new Error('store refused (test)'), { code: 'dpapi_required' }); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, key.privateKeyDer); return 'test'; },
    loadKey: async (file) => {
      try { const der = readFileSync(file); const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }); return { ok: true, protection: 'test', privateKeyDer: der, key: { privateKey, publicKey: publicKeyOf(privateKey) } }; }
      catch (e) { return { ok: false, code: e && e.code === 'ENOENT' ? 'missing' : 'unreadable', fix: 'unreadable (test)' }; }
    },
    ...opts,
  };
  return io;
};
const json = (status, j) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
const pkOfAssertion = (body) => JSON.parse(Buffer.from(String(body.assertion).split('.')[0], 'base64url').toString('utf8')).pk;
const API = 'http://127.0.0.1:9/functions/v1/factory-node-api';

try {
  // ================================================================ FP: the machine fingerprint
  {
    const k = {
      lower: id.fingerprintOf('4c4c4544-0036-3510-8052-b4c04f4a4d32'), upper: id.fingerprintOf('4C4C4544-0036-3510-8052-B4C04F4A4D32'),
      braced: id.fingerprintOf('{4c4c4544-0036-3510-8052-b4c04f4a4d32}'), nonAscii: id.fingerprintOf('caf\u00e9-guid'),
    };
    const want = { lower: '4939f29c700a29160f86d82a405d4add2da6f0818b0212a69d30b9b5bb78ff38', upper: 'b06019febee8dba8692efb8fea2af9d5664e35d7e1336024e05ccb14819cebe7',
      braced: '32c7e568745139a06c0556da560d429f0c34b6a3b472ba0411b4eabd137afe41', nonAscii: 'ec5973e54cab94b88100262e186f3cea92f611a4dd4e649cb80f0e9ca44b0fdc' };
    const latin1 = createHash('sha256').update(Buffer.from('caf\u00e9-guid', 'latin1')).digest('hex');
    row('FP1 known answers: the lower- and upper-case spellings of one GUID hash differently (no case change), each the sha256 of its UTF-8 bytes; every value is 64 lowercase hex',
      k.lower === want.lower && k.upper === want.upper && k.lower !== k.upper && Object.values(k).every((x) => /^[0-9a-f]{64}$/.test(x)), JSON.stringify({ lower: k.lower.slice(0, 12), upper: k.upper.slice(0, 12) }));
    row('FP2 a braced value is hashed as stored (no shape filter): its own known answer, never "no fingerprint"', k.braced === want.braced, k.braced);
    row('FP3 a non-ASCII value is hashed as UTF-8 bytes (not Latin-1)', k.nonAscii === want.nonAscii && k.nonAscii !== latin1, k.nonAscii.slice(0, 12) + ' latin1 ' + latin1.slice(0, 12));
    // the reader's transport: the helper writes the UTF-8 bytes as base64; anything else is no value, named
    const b64 = (v) => 'B64:' + Buffer.from(v, 'utf8').toString('base64') + '\r\n';
    const parsed = ['  4C4C4544-0036-3510-8052-B4C04F4A4D32 ', 'caf\u00e9-guid', ''].map((v) => { const r = id.machineGuidFromHelperOutput(b64(v)); return r.ok && id.fingerprintOf(r.bytes) === id.fingerprintOf(v); });
    const refused = ['NO_VALUE', 'NOT_A_STRING', 'NO_KEY', 'B64:***', 'B64:QUJD=', 'MachineGuid    REG_SZ    x'].map((o) => id.machineGuidFromHelperOutput(o));
    const spawned = id.readMachineGuid({ spawn: () => ({ status: 0, stdout: b64('stub-guid') }) });
    const failedSpawn = id.readMachineGuid({ spawn: () => ({ status: 1, stdout: '' }) });
    row('FP6 the reader takes the value\'s bytes from base64 (spaces, non-ASCII and an empty string exactly as stored); no value, a non-string value, a missing key and any output that is not strict base64 are no value, named',
      parsed.every(Boolean) && refused.every((r) => !r.ok && r.reason) && spawned.ok && spawned.bytes.toString('utf8') === 'stub-guid' && !failedSpawn.ok && /helper_exit_1/.test(failedSpawn.reason),
      JSON.stringify({ parsed, refused: refused.map((r) => r.reason), failedSpawn: failedSpawn.reason }));
    if (process.platform === 'win32') {
      const here = registryFingerprint();
      const mine = id.machineFingerprint();
      row('FP4 on this machine the runtime\'s fingerprint equals the sha256 of the MachineGuid bytes read independently (PowerShell Get-ItemProperty)',
        !!mine && mine === here.fingerprint && id.fingerprintProblem() === null, JSON.stringify({ mine: mine && mine.slice(0, 12), registry: here.fingerprint && here.fingerprint.slice(0, 12) }));
    }
    // a failed read is named and tried again; a value, once read, is kept
    let n = 0; let t = 0;
    const src = id.makeFingerprintSource({ read: () => (++n === 1 ? { ok: false, reason: 'helper_exit_1' } : { ok: true, bytes: Buffer.from('later-guid', 'utf8') }), retryMs: 1000, now: () => t });
    const first = src(); const problem = src.problem();
    const tooSoon = src(); const readsSoon = n;
    t = 1500; const second = src(); const third = src();
    row('FP5 a failed read is not cached as "no fingerprint": it is named (fingerprint_unavailable (reason)), not tried again within the retry interval, then read again and kept',
      first === null && /^fingerprint_unavailable \(helper_exit_1\)$/.test(problem) && tooSoon === null && readsSoon === 1 && second === id.fingerprintOf('later-guid') && third === second && n === 2 && src.problem() === null,
      JSON.stringify({ first, problem, readsSoon, second: second && second.slice(0, 12), reads: n }));

    // FP7: the worker's read does not hold the event loop (its pipe and timers keep running while PowerShell runs); two callers asking
    // at once share one read
    let shared = 0;
    const s7 = id.makeFingerprintSource({ readAsync: () => { shared++; return new Promise((ok) => setTimeout(() => ok({ ok: true, bytes: Buffer.from('shared-guid', 'utf8') }), 50)); } });
    const both7 = await Promise.all([s7.async(), s7.async()]);
    let ticks = null, ms = null, v7 = null;
    if (process.platform === 'win32') {
      const real = id.makeFingerprintSource();
      let t7 = 0; const iv = setInterval(() => { t7++; }, 10);
      const t0 = performance.now(); v7 = await real.async(); ms = performance.now() - t0;
      clearInterval(iv); ticks = t7;
    }
    row('FP7 the worker\'s fingerprint read leaves the event loop free while PowerShell runs (a 10 ms timer keeps firing during the read) and yields the value the synchronous read gives; two callers asking at once share one read',
      shared === 1 && both7.every((x) => x === id.fingerprintOf('shared-guid'))
        && (process.platform !== 'win32' || (!!v7 && v7 === id.machineFingerprint() && ticks >= 2)),
      JSON.stringify({ shared, ticks, ms: ms && Math.round(ms), same: !!v7 && v7 === id.machineFingerprint() }));
  }

  // ================================================================ RV: the revocation list only grows
  {
    const h = newHome('rv1');
    const K = 'ed25519:' + 'a'.repeat(64), D = 'd'.repeat(64);
    const m1 = mergeRevocations(h, { key_ids: [K], releases: [{ release_id: 'r1', digest: D }] });
    const m2 = mergeRevocations(h, { key_ids: [], releases: [] });
    const onDisk = readJson(paths(h).revocations);
    row('RV1 a delivered list is merged as a union: a later answer that omits a revoked key id and a revoked release removes neither from state\\revocations.json',
      m1.key_ids.includes(K) && m2.key_ids.includes(K) && m2.releases.some((r) => r.digest === D) && onDisk.key_ids.includes(K) && onDisk.releases.some((r) => r.digest === D),
      JSON.stringify(onDisk));

    // a worker whose register delivers { TK, DI } (DI: the release installed in its home, which it runs) and whose heartbeats then
    // deliver empty lists
    const h2 = newHome('rv2');
    const installed = installRelease(h2, 'rv2');
    const DI = installed.digest;
    const startBefore = verifyInstalled(h2);
    const tk = generateKeyPairSync('ed25519');
    const tpk = tk.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const TK = keyIdOf(tpk);
    const oldKey = await newKey();
    const io = fileKeyIo();
    await io.storeKey(paths(h2).key, oldKey);
    writeJson(paths(h2).config, { api: API, channel: 'dev', credential_id: 'cred-rv2', node_id: 'node-rv2', public_key: oldKey.publicKey.toString('base64url') });
    const calls = [];
    const fetchImpl = async (url, init) => {
      const path = new URL(url).pathname.replace(/^.*\/v1\//, '/v1/'); calls.push(path);
      if (path === '/v1/time') return json(200, { ok: true, server_time: new Date().toISOString() });
      if (path === '/v1/session') return json(200, { ok: true, session_token: 'T'.repeat(43) });
      if (path === '/v1/node/register') return json(200, { ok: true, node_id: 'node-rv2', enrollment_state: 'ALIVE', release: { current: true }, envelope: { version: 1 }, revocations: { key_ids: [TK], releases: [{ release_id: 'rD', digest: DI }] } });
      if (path === '/v1/node/heartbeat') return json(200, { ok: true, phase: 'AVAILABLE', release_current: true, revocations: { key_ids: [], releases: [] }, published_releases: [] });
      if (path === '/v1/node/release') return json(200, { ok: true, released: 0 });
      return json(404, { ok: false, refused: 'no_such_route' });
    };
    const exit = await runWorker({ home: h2, runtime: { version: '0.1.0', digest: DI }, once: true, pollMs: 50, fetchImpl, keyIo: io });
    const rev = readJson(paths(h2).revocations);
    const st = readJson(paths(h2).status, {});
    // the supervisor's start-path check of the installed release, after the empty lists
    const startAfter = verifyInstalled(h2);
    const trust = { channel: 'dev', mode: 'dev', keys: [{ key_id: TK, public_key: Buffer.from(tpk).toString('base64url') }] };
    const signed = (digest) => { const m = { v: 1, channel: 'dev', version: '0.1.0', source_sha: 'a'.repeat(40), digest, key_id: TK, receipt_sha256: 'b'.repeat(64) }; m.signature = edSign(null, canonicalManifestBytes(m), tk.privateKey).toString('base64url'); return m; };
    const byKey = verifyRelease({ manifest: signed('e'.repeat(64)), trust, revocations: rev });
    const other = generateKeyPairSync('ed25519'); const opk = other.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const trust2 = { channel: 'dev', mode: 'dev', keys: [{ key_id: keyIdOf(opk), public_key: Buffer.from(opk).toString('base64url') }] };
    const m2d = { v: 1, channel: 'dev', version: '0.1.0', source_sha: 'a'.repeat(40), digest: DI, key_id: keyIdOf(opk), receipt_sha256: 'b'.repeat(64) };
    m2d.signature = edSign(null, canonicalManifestBytes(m2d), other.privateKey).toString('base64url');
    const byRelease = verifyRelease({ manifest: m2d, trust: trust2, revocations: rev });
    row('RV2 a worker whose register delivered a revoked key and the revoked digest of the release installed in its home, and whose heartbeats then deliver empty lists, still holds both in state\\revocations.json and stands by (RELEASE_REVOKED); the supervisor\'s start-path check (verifyInstalled), which passed the installed release before, refuses it release_revoked; checked against that file, a manifest signed by the revoked key is refused key_revoked',
      exit === EXIT_WORKER.STOPPED && rev.key_ids.includes(TK) && rev.releases.some((r) => r.digest === DI) && st.state === 'RELEASE_REVOKED'
        && startBefore.ok === true && startAfter.ok === false && startAfter.refused === 'release_revoked'
        && byKey.refused === 'key_revoked' && byRelease.refused === 'release_revoked' && calls.filter((c) => c === '/v1/node/heartbeat').length >= 3 && !calls.includes('/v1/node/claim'),
      JSON.stringify({ exit, rev, state: st.state, startBefore: startBefore.ok || startBefore.refused, startAfter: startAfter.ok || startAfter.refused, byKey: byKey.refused, byRelease: byRelease.refused, calls: calls.length }));
  }

  // ================================================================ LC: the lease guard on durations only
  {
    const realNow = Date.now;
    const runOnce = async (offsetMs, { renewOk, stepMs }) => {
      const ops = [];
      const serverNow = () => realNow.call(Date);
      const api = {
        op: async (name, body) => {
          ops.push({ name, body, at: performance.now() });
          if (name === 'renew') return renewOk ? { ok: true, lease_expires_at: new Date(serverNow() + body.lease_seconds * 1000).toISOString(), server_time: new Date(serverNow()).toISOString() } : { ok: false, refused: 'unreachable', http: 0 };
          return { ok: true };
        },
      };
      Date.now = () => realNow.call(Date) + offsetMs;
      try {
        const sentAt = performance.now();
        const s0 = serverNow();
        const claimed = { run_id: '00000000-0000-4000-8000-0000000000c1', kind: 'authoring', lease_expires_at: new Date(s0 + 6000).toISOString(),
          work_order: { work_order_id: '00000000-0000-4000-8000-0000000000w1', work_type: 'probe', handoff: JSON.stringify({ steps: 1, step_ms: stepMs }) } };
        await Promise.race([workClaimed({ api, claimed, sentAt, serverTime: new Date(s0).toISOString() }), sleep(stepMs + 15000)]);
        const release = ops.find((o) => o.name === 'release');
        return { ops, release: release ? release.at - sentAt : null, completed: ops.some((o) => o.name === 'complete'), renews: ops.filter((o) => o.name === 'renew').map((o) => o.body.lease_seconds) };
      } finally { Date.now = realNow; }
    };
    const offsets = [200000, -200000, 700000, -700000];
    const lc1 = []; for (const d of offsets) lc1.push({ d, ...(await runOnce(d, { renewOk: false, stepMs: 20000 })) });
    row('LC1 with every renewal failing, a 6 s lease aborts the work before it ends - measured from before the claim was sent - and gives the run back, whatever the wall clock\'s offset (+200 s, -200 s, +700 s, -700 s); nothing is completed',
      lc1.every((x) => x.release !== null && x.release < 6000 && !x.completed), JSON.stringify(lc1.map((x) => ({ d: x.d / 1000, abortedAfterMs: x.release && Math.round(x.release), completed: x.completed }))));
    const lc2 = []; for (const d of offsets) lc2.push({ d, ...(await runOnce(d, { renewOk: true, stepMs: 5000 })) });
    row('LC2 with renewals succeeding, every renewal asks for exactly the granted 6 s and the work completes, whatever the wall clock\'s offset',
      lc2.every((x) => x.renews.length >= 1 && x.renews.every((s) => s === 6) && x.completed && x.release === null), JSON.stringify(lc2.map((x) => ({ d: x.d / 1000, renews: x.renews, completed: x.completed }))));

    // LC3: the first renewal is granted, but its answer arrives 1.5 s after it was sent; every later renewal fails. The renewed 6 s run
    // from the moment the renewal was SENT, so the work is abandoned no later than (that send + 6 s - the 2 s margin); counted from the
    // late answer it would run 1.5 s longer
    {
      const ops = []; let renewN = 0;
      const api = {
        op: async (name) => {
          ops.push({ name, at: performance.now() });
          if (name === 'renew') {
            if (++renewN > 1) return { ok: false, refused: 'unreachable', http: 0 };
            await sleep(1500);
            const now = realNow.call(Date);
            return { ok: true, lease_expires_at: new Date(now + 6000).toISOString(), server_time: new Date(now).toISOString() };
          }
          return { ok: true };
        },
      };
      const sentAt = performance.now(); const s0 = realNow.call(Date);
      const claimed = { run_id: '00000000-0000-4000-8000-0000000000c3', kind: 'authoring', lease_expires_at: new Date(s0 + 6000).toISOString(),
        work_order: { work_order_id: '00000000-0000-4000-8000-0000000000w3', work_type: 'probe', handoff: JSON.stringify({ steps: 1, step_ms: 20000 }) } };
      await Promise.race([workClaimed({ api, claimed, sentAt, serverTime: new Date(s0).toISOString() }), sleep(35000)]);
      const first = ops.find((o) => o.name === 'renew'); const release = ops.find((o) => o.name === 'release');
      const afterSend = first && release ? release.at - first.at : null;
      row('LC3 a renewal granted 6 s whose answer arrives 1.5 s late: the lease it gave runs from the moment it was sent - with every later renewal failing, the work is given back no later than 4 s (6 s - the 2 s margin) after that renewal was sent (+0.4 s timer tolerance), not 1.5 s later; nothing is completed',
        afterSend !== null && afterSend <= 4400 && renewN >= 2 && !ops.some((o) => o.name === 'complete'),
        JSON.stringify({ givenBackAfterRenewalSentMs: afterSend && Math.round(afterSend), renewals: renewN }));
    }
  }

  // ================================================================ CL: lost claim answers; no handler
  {
    const cases = [[{ ok: false, refused: 'unreachable', http: 0 }, true], [{ ok: false, refused: 'plane_unavailable', http: 503 }, true], [{ ok: false, refused: 'bad_response', http: 502 }, true],
      [{ ok: false, refused: 'server_refused', http: 500 }, false], [{ ok: false, refused: 'claim_lock_busy', http: 503 }, false], [{ ok: true, claimed: null }, false], [{ ok: false, refused: 'bad_request', http: 400 }, false]];
    row('CL1 a claim answer that proves nothing (no answer, a gateway or availability error, a body that is not JSON) is a lost answer; a SQLSTATE rollback, the named lock refusal, a named refusal and an ordinary answer are not',
      cases.every(([c, want]) => claimAnswerLost(c) === want), JSON.stringify(cases.map(([c, w]) => [c.refused || 'ok', claimAnswerLost(c), w])));
    const ops = [];
    const api = { op: async (name, body) => { ops.push({ name, body }); return { ok: true }; } };
    const s0 = Date.now();
    for (const wt of ['verification', 'unknown-type']) {
      await workClaimed({ api, claimed: { run_id: 'r-' + wt, kind: 'authoring', lease_expires_at: new Date(s0 + 60000).toISOString(), work_order: { work_order_id: 'w-' + wt, work_type: wt } }, serverTime: new Date(s0).toISOString() });
    }
    row('CL2 an authoring claim of a work type this runtime has no handler for (one named "verification", or an unknown one) is given back, never completed as failed',
      ops.filter((o) => o.name === 'release').length === 2 && !ops.some((o) => o.name === 'complete'), JSON.stringify(ops.map((o) => o.name)));
  }

  // ================================================================ HF: what a handler's failure means for its run
  {
    const RUN = '00000000-0000-4000-8000-0000000000f1', WO = '00000000-0000-4000-8000-0000000000f2';
    // the worker's own check (worker.mjs runHeld): a terminal credential refusal is thrown, everything else is returned
    const stops = (r) => { if (r && TERMINAL.has(r.refused)) throw new Error('REFUSED: ' + r.refused); return r; };
    // ONE claimed run under a 60 s lease - a probe of three 10 ms steps - whose SECOND checkpoint, and every one after it, is answered
    // `refusal`. Returns what the worker sent to the plane, in order, and what workClaimed threw (if it did)
    const worked = async (refusal, { kind = 'authoring' } = {}) => {
      const sent = []; let cps = 0;
      const api = { op: async (name, body) => {
        sent.push(name === 'complete' ? 'complete:' + body.status + ':' + body.termination_reason : name);
        if (name === 'checkpoint' && ++cps >= 2) return refusal;
        return { ok: true };
      } };
      const s0 = Date.now();
      const claimed = { run_id: RUN, kind, lease_expires_at: new Date(s0 + 60000).toISOString(),
        work_order: { work_order_id: WO, work_type: kind === 'verification' ? 'verification' : 'probe', handoff: JSON.stringify({ steps: 3, step_ms: 10 }) } };
      let threw = null;
      try { await workClaimed({ api, claimed, serverTime: new Date(s0).toISOString(), check: stops }); } catch (e) { threw = (e && e.message) || String(e); }
      return { sent: sent.join(' '), threw };
    };
    const reasonOf = (refusal) => (typeof terminalFailure === 'function' ? terminalFailure({ refusal }) : 'terminalFailure is not exported');
    const LEFT = 'checkpoint checkpoint'; // the two checkpoints and nothing after them: no completion, no release
    const refused = (name, http, extra = {}) => ({ ok: false, refused: name, http, ...extra });

    const transient = [
      ['a lock wait past the front door\'s lock_timeout (500 server_refused, 55P03)', refused('server_refused', 500, { sqlstate: '55P03' })],
      ['a cancelled statement (57014)', refused('server_refused', 500, { sqlstate: '57014' })],
      ['a deadlock (40P01)', refused('server_refused', 500, { sqlstate: '40P01' })],
      ['a constraint violation (23505: not a data exception)', refused('server_refused', 500, { sqlstate: '23505' })],
      ['a server refusal that states no SQLSTATE', refused('server_refused', 500)],
      ['a server refusal whose sqlstate is not five characters ("22")', refused('server_refused', 500, { sqlstate: '22' })],
      ['a server refusal whose sqlstate is not a string (22012)', refused('server_refused', 500, { sqlstate: 22012 })],
      ['the plane unavailable (503 plane_unavailable)', refused('plane_unavailable', 503)],
      ['no answer (unreachable)', refused('unreachable', 0)],
      ['an answer that is not JSON (502 bad_response)', refused('bad_response', 502)],
      ['a gateway\'s 429 that carries no refusal name', { http: 429 }],
      ['a front door that returned nothing (500 server_error)', refused('server_error', 500)],
      ['an API that serves nothing (503 crypto_unavailable)', refused('crypto_unavailable', 503)],
      ['an API without its database (503 misconfigured)', refused('misconfigured', 503)],
      ['a session that could not be opened again (401 session_invalid)', refused('session_invalid', 401)],
      ['a route the API does not have (404 no_such_route)', refused('no_such_route', 404)],
      ['a refusal this runtime does not know (409)', refused('a_later_refusal', 409)],
      ['a request refusal\'s name on a gateway status (502 bad_request)', refused('bad_request', 502)],
    ];
    const t = []; for (const [what, r] of transient) t.push({ what, ...(await worked(r)), reason: reasonOf(r) });
    row('HF1 a checkpoint refusal that is transient or of unknown cause does NOT fail its authoring run (' + t.length + ' kinds): after it the worker sends nothing more for the run - no completion, no release, no further checkpoint - so the lease is left to lapse and any eligible node resumes the work (69df2f52 node.mjs:522-540: "leaving the lease to expire so the work is recoverable rather than lost")',
      t.every((x) => x.sent === LEFT && x.threw === null && x.reason === null), JSON.stringify(t.filter((x) => x.sent !== LEFT || x.threw !== null || x.reason !== null).map((x) => [x.what, x.sent, x.threw, x.reason])));

    const deterministic = [
      ['a malformed request (400 bad_request)', refused('bad_request', 400), 'request_refused_bad_request'],
      ['a body that is not application/json (415 bad_request)', refused('bad_request', 415), 'request_refused_bad_request'],
      ['a body naming an identity (400 identity_from_body_refused)', refused('identity_from_body_refused', 400), 'request_refused_identity_from_body_refused'],
      ['a body past the size cap (413 body_too_large)', refused('body_too_large', 413), 'request_refused_body_too_large'],
      ['a data exception the plane\'s server raised (500 server_refused, 22P05)', refused('server_refused', 500, { sqlstate: '22P05' }), 'data_exception_22P05'],
      ['a data exception (22001)', refused('server_refused', 500, { sqlstate: '22001' }), 'data_exception_22001'],
    ];
    const d = []; for (const [what, r, want] of deterministic) d.push({ what, want, ...(await worked(r)), reason: reasonOf(r) });
    row('HF2 a failure the same input meets on every attempt still FAILS its run, by name (' + d.length + ' kinds): a data exception the plane\'s server raised (SQLSTATE class 22: data_exception_<code>, node.mjs:525 at 69df2f52) and a request the API refused as malformed (request_refused_<name>) are completed failed with that termination reason, never left to be claimed and thrown again every lease',
      d.every((x) => x.sent === LEFT + ' complete:failed:' + x.want && x.threw === null && x.reason === x.want), JSON.stringify(d.map((x) => [x.what, x.sent, x.threw, x.reason])));

    const lost = await worked(refused('lease_lost', 409));
    row('HF3 a checkpoint refused lease_lost (the run is no longer this node\'s) completes nothing and gives nothing back: the node that holds the work completes it',
      lost.sent === LEFT && lost.threw === null && reasonOf(refused('lease_lost', 409)) === null, JSON.stringify(lost));

    const term = []; for (const name of ['credential_revoked', 'credential_superseded', 'computer_archived']) term.push({ name, ...(await worked(refused(name, name === 'computer_archived' ? 403 : 401))) });
    row('HF4 a terminal credential refusal met by a checkpoint (credential_revoked, credential_superseded, computer_archived) still stops the worker: it is thrown out of the run, and nothing is completed or given back with a credential that is no longer the node\'s',
      term.every((x) => x.sent === LEFT && /^REFUSED: /.test(String(x.threw))), JSON.stringify(term));

    const realProbe = HANDLERS.probe;
    let own = null, named = null;
    try {
      HANDLERS.probe = async () => { throw new Error('the handler broke'); };
      own = await worked(null);
      HANDLERS.probe = async () => ({ status: 'failed', termination_reason: 'probe_input_refused', summary: 'the handler names its own terminal condition' });
      named = await worked(null);
    } finally { HANDLERS.probe = realProbe; }
    row('HF5 a handler that throws an error of its own (no refusal of the plane behind it) does not fail its run either - nothing is sent and the lease is left to lapse; a failure the handler RETURNS, with the terminal condition it observed, is completed failed by that name (the terminal condition comes from the handler)',
      own.sent === '' && own.threw === null && named.sent === 'complete:failed:probe_input_refused' && named.threw === null, JSON.stringify({ own, named }));

    // the handler succeeds and the COMPLETION meets a transient refusal: the same rule - nothing more is sent for the run
    const done = [];
    {
      const api = { op: async (name, body) => { done.push(name === 'complete' ? 'complete:' + body.status + ':' + body.termination_reason : name); return name === 'complete' ? refused('plane_unavailable', 503) : { ok: true }; } };
      const s0 = Date.now();
      await workClaimed({ api, check: stops, serverTime: new Date(s0).toISOString(), claimed: { run_id: RUN, kind: 'authoring', lease_expires_at: new Date(s0 + 60000).toISOString(),
        work_order: { work_order_id: WO, work_type: 'probe', handoff: JSON.stringify({ steps: 2, step_ms: 10 }) } } });
    }
    row('HF9 a completion that meets a transient refusal is not turned into a failure and the run is not given back: after the refused completion the worker sends nothing more for the run, which is left to its lease (the node that next holds the work resumes from the last checkpoint and completes it)',
      done.join(' ') === 'checkpoint checkpoint complete:done:completed', done.join(' '));

    const ver = await worked(null, { kind: 'verification' });
    row('HF6 a verification handler\'s error still gives its claim back at once (release), never completing or certifying anything: the verification returns to WAITING for another verifier',
      ver.sent === 'release' && ver.threw === null, JSON.stringify(ver));

    // ---- the whole worker against a scripted Node API: its first claim is the run above (three 10 ms steps, a 60 s lease)
    const scripted = async (name, { checkpoint2, claims }) => {
      const h = newHome(name);
      const key = await newKey(); const io = fileKeyIo(); await io.storeKey(paths(h).key, key);
      writeJson(paths(h).config, { api: API, channel: 'dev', credential_id: 'cred-' + name, node_id: 'node-' + name, public_key: key.publicKey.toString('base64url') });
      const calls = []; let cps = 0, claimN = 0;
      const fetchImpl = async (url, init) => {
        const path = new URL(url).pathname.replace(/^.*\/v1\//, '/v1/');
        let body = {}; try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
        calls.push({ path, body, claims: claimN });
        const now = new Date().toISOString();
        if (path === '/v1/time') return json(200, { ok: true, server_time: now });
        if (path === '/v1/session') return json(200, { ok: true, session_token: 'T'.repeat(43) });
        if (path === '/v1/node/register') return json(200, { ok: true, node_id: 'node-' + name, enrollment_state: 'ALIVE', release: { current: true }, envelope: { version: 1 }, revocations: { key_ids: [], releases: [] } });
        if (path === '/v1/node/heartbeat') return json(200, { ok: true, phase: 'AVAILABLE', release_current: true, revocations: { key_ids: [], releases: [] }, published_releases: [] });
        if (path === '/v1/node/release') return json(200, { ok: true, released: 0 });
        if (path === '/v1/node/complete') return json(200, { ok: true });
        if (path === '/v1/node/checkpoint') return ++cps >= 2 ? checkpoint2() : json(200, { ok: true, written: true });
        if (path === '/v1/node/claim') {
          const answer = claims[Math.min(claimN, claims.length - 1)]; claimN++;
          if (claimN >= claims.length) writeFileSync(paths(h).stop, '{}'); // the script is over: the worker stops at its next cycle
          return answer(now);
        }
        return json(404, { ok: false, refused: 'no_such_route' });
      };
      const exit = await Promise.race([runWorker({ home: h, runtime: { version: '0.1.0', digest: 'd'.repeat(64) }, pollMs: 50, fetchImpl, keyIo: io }), sleep(60000).then(() => 'timeout')]);
      return { exit, calls, state: readJson(paths(h).status, {}).state };
    };
    const theRun = (now) => json(200, { ok: true, server_time: now, claimed: { run_id: RUN, kind: 'authoring', lease_expires_at: new Date(Date.parse(now) + 60000).toISOString(), resume_from: null,
      work_order: { work_order_id: WO, work_type: 'probe', handoff: JSON.stringify({ steps: 3, step_ms: 10 }) } } });
    const nothing = (now) => json(200, { ok: true, server_time: now, claimed: null, considered: [] });

    // HF7: the second checkpoint is refused 55P03; the NEXT claim's answer is lost (a 502 that is not JSON); then nothing is queued
    const k = await scripted('hf7', { checkpoint2: () => json(500, { ok: false, refused: 'server_refused', sqlstate: '55P03', message: 'the control plane refused the call (55P03); nothing changed' }),
      claims: [theRun, () => new Response('<html>bad gateway</html>', { status: 502 }), nothing] });
    const afterClaim = k.calls.filter((c) => c.claims >= 1);
    const giveBacks = afterClaim.filter((c) => c.path === '/v1/node/release' && Array.isArray(c.body.keep_run_ids));
    row('HF7 a claim answer lost while a run this worker claimed waits out its lease: both give-backs (at once, and again before the next claim) keep that run (keep_run_ids names it) and give back only what the lost claim may have taken; the run is never completed and never released by name (69df2f52 node.mjs:402: the runs this process claimed are not orphans)',
      k.exit === EXIT_WORKER.STOPPED && giveBacks.length === 2 && giveBacks.every((c) => c.body.keep_run_ids.length === 1 && c.body.keep_run_ids[0] === RUN)
        && !afterClaim.some((c) => c.path === '/v1/node/complete') && !afterClaim.some((c) => c.path === '/v1/node/release' && c.body.run_id),
      JSON.stringify({ exit: k.exit, giveBacks: giveBacks.map((c) => c.body.keep_run_ids), sent: afterClaim.map((c) => c.path.replace('/v1/node/', '')).join(' ') }));

    // HF8: the second checkpoint is refused credential_revoked
    const x = await scripted('hf8', { checkpoint2: () => json(401, { ok: false, refused: 'credential_revoked', message: 'the credential is revoked' }), claims: [theRun, nothing] });
    const afterX = x.calls.filter((c) => c.claims >= 1);
    row('HF8 the whole worker, its checkpoint refused credential_revoked: it stops REFUSED (exit 2, state REFUSED) without completing or giving back anything, and makes no further claim',
      x.exit === EXIT_WORKER.REFUSED && x.state === 'REFUSED' && !afterX.some((c) => c.path === '/v1/node/complete' || c.path === '/v1/node/release') && x.calls.filter((c) => c.path === '/v1/node/claim').length === 1,
      JSON.stringify({ exit: x.exit, state: x.state, sent: afterX.map((c) => c.path.replace('/v1/node/', '')).join(' ') }));
  }

  // ================================================================ SI: one supervisor and one worker per home
  {
    // SI1: a record naming pid 4 (System: a signal-0 probe answers EPERM) or a live unrelated process never blocks a start
    const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true }); children.push(sleeper);
    const si1 = [];
    for (const [name, pid] of [['system', 4], ['unrelated', sleeper.pid]]) {
      const h = newHome('si1-' + name);
      writeJson(paths(h).lock, { pid, token: 'stale', started: '2026-01-01T00:00:00.000Z' });
      const a = await inst.acquireSupervisor(h, () => ({ pid: process.pid }), () => {}, { waitMs: 1000 });
      const held = a.held; if (a.held) await a.close();
      const code = await runSupervisor({ home: h, workerCommand: () => { throw new Error('no worker in SI1'); } });
      const log = (() => { try { return readFileSync(join(h, 'logs', 'supervisor.log'), 'utf8'); } catch { return ''; } })();
      si1.push({ name, pid, held, code, refused: readJson(paths(h).status, {}).refused, blocked: /another supervisor runs/.test(log) });
    }
    row('SI1 a supervisor record naming pid 4 (a SYSTEM process) or the pid of a live unrelated process of this user never blocks a start: the pipe is acquired and the supervisor goes on to its release check (not_installed here), never "another supervisor runs"',
      si1.every((x) => x.held && x.code === 3 && x.refused === 'not_installed' && !x.blocked), JSON.stringify(si1));

    // SI2: an installed (dev-signed) release, two supervisors started at the same instant, a worker stand-in that records each spawn
    const h = newHome('si2');
    const art = join(h, 'runtime', '0.1.0-si2', 'BrainFactory.exe'); mkdirSync(dirname(art), { recursive: true });
    copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), art);
    const m = signDev(makeManifest({ artifact: art, channel: 'dev', version: '0.1.0', source_sha: 'a'.repeat(40), receipt_sha256: 'b'.repeat(64) }));
    writeFileSync(join(dirname(art), 'manifest.json'), JSON.stringify(m));
    writeJson(paths(h).current, { dir: dirname(art), version: '0.1.0', digest: m.digest, via: 'setup' });
    const spawns = join(work, 'si2-spawns.txt'); writeFileSync(spawns, '');
    const stub = join(work, 'si2-worker.mjs');
    writeFileSync(stub, "import { appendFileSync } from 'node:fs';\nconst { holdPipe } = await import(" + JSON.stringify(pathToFileURL(R('scripts/factory-runner/enrolled/instance.mjs')).href) + ");\n"
      + "appendFileSync(process.argv[3], 'spawn ' + process.pid + '\\n');\nconst p = await holdPipe(process.argv[2], 'worker', () => ({ pid: process.pid }));\nif (!p.held) process.exit(6);\nsetTimeout(() => process.exit(0), 4000);\n");
    const driver = join(work, 'si2-supervisor.mjs');
    writeFileSync(driver, 'globalThis.__TRUST__ = ' + JSON.stringify(globalThis.__TRUST__) + ';\n'
      + 'const { runSupervisor } = await import(' + JSON.stringify(pathToFileURL(R('scripts/factory-runner/enrolled/supervisor.mjs')).href) + ');\n'
      + 'const code = await runSupervisor({ home: process.argv[2], workerCommand: () => ({ exe: process.execPath, args: [' + JSON.stringify(stub) + ', process.argv[2], ' + JSON.stringify(spawns) + '] }) });\n'
      + "process.stdout.write('SUPERVISOR_EXIT ' + code + '\\n');\n");
    const runDriver = () => new Promise((ok) => { const c = spawn(process.execPath, [driver, h], { windowsHide: true }); children.push(c); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('exit', () => ok(out)); });
    const both = Promise.all([runDriver(), runDriver()]);
    const holders = new Set(); let maxAtOnce = 0;
    for (let i = 0; i < 25; i++) { const w = await inst.askPipe(h, 'worker', 'whois', 500); if (w) { holders.add(w.pid); maxAtOnce = Math.max(maxAtOnce, 1); } await sleep(200); }
    const outs = await both;
    const spawned = readFileSync(spawns, 'utf8').split('\n').filter(Boolean);
    const log = (() => { try { return readFileSync(join(h, 'logs', 'supervisor.log'), 'utf8'); } catch { return ''; } })();
    row('SI2 two supervisors started at the same instant on one home: exactly one holds the pipe and starts a worker, the other exits ALREADY ("another supervisor runs", answering on its pipe) - exactly one worker spawn, one worker pipe holder',
      spawned.length === 1 && holders.size === 1 && (log.match(/another supervisor runs for this home \(pid \d+, answering on its pipe\)/g) || []).length === 1 && outs.every((o) => /SUPERVISOR_EXIT 0/.test(o)),
      JSON.stringify({ spawned, holders: [...holders], outs: outs.map((o) => o.trim()), tail: log.split('\n').slice(-6) }));

    // SI3: a second worker exits ALREADY before any call; an orphaned worker is asked to stop, and one that ignores it is ended
    const h3 = newHome('si3');
    const key3 = await newKey(); const io3 = fileKeyIo();
    await io3.storeKey(paths(h3).key, key3);
    writeJson(paths(h3).config, { api: API, channel: 'dev', credential_id: 'cred-si3', node_id: 'node-si3', public_key: key3.publicKey.toString('base64url') });
    const orphan = (ignoreStop) => new Promise((ok) => {
      const src = "const { holdPipe } = await import(" + JSON.stringify(pathToFileURL(R('scripts/factory-runner/enrolled/instance.mjs')).href) + ");\n"
        + 'const p = await holdPipe(process.argv[1], \'worker\', () => ({ pid: process.pid }), (c) => { if (c === \'stop\' && !' + ignoreStop + ') process.exit(0); });\n'
        + "process.stdout.write(p.held ? 'HELD\\n' : 'NOT_HELD\\n'); setTimeout(() => {}, 120000);\n";
      const c = spawn(process.execPath, ['--input-type=module', '-e', src, h3], { windowsHide: true }); children.push(c);
      c.stdout.on('data', (d) => { if (/HELD/.test(String(d))) ok(c); });
    });
    const a = await orphan(false);
    let fetches = 0;
    // (a worker that throws fails this row by name, never the suite)
    const second = await runWorker({ home: h3, runtime: { version: '0.1.0' }, once: true, fetchImpl: async () => { fetches++; return json(503, { ok: false, refused: 'plane_unavailable' }); }, keyIo: io3 })
      .catch((e) => 'threw: ' + ((e && e.message) || e));
    const t0 = performance.now();
    const retired = await inst.retireStrayWorker(h3, () => {}, { stopWaitMs: 5000 });
    const retireMs = performance.now() - t0;
    const free = await inst.holdPipe(h3, 'worker', () => ({}));
    if (free.held) await free.close();
    // a pipe holder that ignores "stop" and answers "whois" with the pid of ANOTHER live process of this user (what a squatter can say)
    const bystander = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true }); children.push(bystander);
    const b = await new Promise((ok) => {
      const src = "const { holdPipe } = await import(" + JSON.stringify(pathToFileURL(R('scripts/factory-runner/enrolled/instance.mjs')).href) + ");\n"
        + "const p = await holdPipe(process.argv[1], 'worker', () => ({ pid: Number(process.argv[2]) }), () => {});\n"
        + "process.stdout.write(p.held ? 'HELD\\n' : 'NOT_HELD\\n'); setTimeout(() => {}, 120000);\n";
      const c = spawn(process.execPath, ['--input-type=module', '-e', src, h3, String(bystander.pid)], { windowsHide: true }); children.push(c);
      c.stdout.on('data', (d) => { if (/HELD/.test(String(d))) ok(c); });
    });
    const said3 = [];
    const retired2 = await inst.retireStrayWorker(h3, (s) => said3.push(String(s)), { stopWaitMs: 1500 });
    await sleep(500);
    const alive = (c) => c.exitCode === null && c.signalCode === null && (() => { try { process.kill(c.pid, 0); return true; } catch { return false; } })();
    const stillHeld = !!(await inst.askPipe(h3, 'worker', 'whois', 1000));
    const kept = { bystander: alive(bystander), holder: alive(b) };
    row('SI3 while a worker holds the home\'s worker pipe, a second worker exits ALREADY (6) before any call (no request); an orphan is asked to stop and exits (the pipe is then free); a holder that ignores "stop" and names another live process\'s pid is left alone - retire answers false (no second worker), neither that process nor the holder is ended, the refusal to end anything is logged',
      second === EXIT_WORKER.ALREADY && fetches === 0 && retired && retireMs < 5000 && free.held && a.exitCode !== null
        && retired2 === false && stillHeld && kept.bystander && kept.holder && said3.some((s) => /no process is ended by a pid/.test(s)),
      JSON.stringify({ second, fetches, retired, retireMs: Math.round(retireMs), free: free.held, aExit: a.exitCode, retired2, stillHeld, kept, said: said3.slice(-1) }));
    try { b.kill(); } catch { /* gone */ }
  }

  // ================================================================ SV: the supervisor and a rotation
  {
    // a worker stand-in: it records each start (a timestamp line) and exits with argv[3] at its first start, 0 afterwards
    const stubW = join(work, 'sv-worker.mjs');
    writeFileSync(stubW, "import { appendFileSync, readFileSync } from 'node:fs';\nconst f = process.argv[2];\n"
      + "const n = readFileSync(f, 'utf8').split('\\n').filter(Boolean).length;\nappendFileSync(f, Date.now() + '\\n');\nprocess.exit(n === 0 ? Number(process.argv[3]) : 0);\n");
    const supervise = async (name, { config, status, firstExit = 0, pendingFile = false }) => {
      const h = newHome(name);
      installRelease(h, name);
      writeJson(paths(h).config, config);
      if (status) writeJson(paths(h).status, status);
      if (pendingFile) { mkdirSync(dirname(paths(h).pendingKey), { recursive: true }); writeFileSync(paths(h).pendingKey, 'pending (test)'); }
      const starts = join(work, name + '-starts.txt'); writeFileSync(starts, '');
      const code = await runSupervisor({ home: h, workerCommand: () => ({ exe: process.execPath, args: [stubW, starts, String(firstExit)] }) });
      return { code, starts: readFileSync(starts, 'utf8').split('\n').filter(Boolean).map(Number) };
    };
    const cfg = { api: API, channel: 'dev', credential_id: 'cred-sv', node_id: 'node-sv' };
    const refusedSt = { state: 'REFUSED', refused: 'credential_superseded', credential_id: 'cred-sv' };
    const rec = await supervise('sv1-record', { config: { ...cfg, pending_rotation: { public_key: 'x', started_at: '2026-01-01T00:00:00.000Z' } }, status: refusedSt });
    const file = await supervise('sv1-file', { config: cfg, status: refusedSt, pendingFile: true });
    const none = await supervise('sv1-none', { config: cfg, status: refusedSt });
    row('SV1 a REFUSED record for the current credential keeps the worker from starting (exit 2, no start) - but not while a rotation of the home is pending (its record, or its key file alone): then the worker is started, since only the worker can resolve it',
      none.code === 2 && none.starts.length === 0 && rec.code === 0 && rec.starts.length === 1 && file.code === 0 && file.starts.length === 1,
      JSON.stringify({ none, rec: { code: rec.code, starts: rec.starts.length }, file: { code: file.code, starts: file.starts.length } }));
    const r7 = await supervise('sv2', { config: cfg, firstExit: 7 });
    const gap = r7.starts.length === 2 ? r7.starts[1] - r7.starts[0] : null;
    row('SV2 a worker that exits 7 (CREDENTIAL_ROTATED: its own rotation superseded the credential it started with) is started again at once - the next start within 3 s, not after the 5 s crash backoff',
      r7.code === 0 && r7.starts.length === 2 && gap !== null && gap < 3000, JSON.stringify({ code: r7.code, starts: r7.starts.length, gapMs: gap }));
  }

  // ================================================================ RR: a rotation whose answer was lost, resolved with the stored key
  {
    // a home holding the old key (node.key) and a pending new key with its record; a stub plane scripted per row
    const setupHome = async (name, { record = true, pendingFile = true } = {}) => {
      const h = newHome(name); const io = fileKeyIo();
      const oldKey = await newKey(); const pend = await newKey();
      await io.storeKey(paths(h).key, oldKey);
      if (pendingFile) await io.storeKey(paths(h).pendingKey, pend);
      writeJson(paths(h).config, { api: API, channel: 'dev', credential_id: 'cred-old', node_id: 'node-rr', public_key: oldKey.publicKey.toString('base64url'),
        ...(record ? { pending_rotation: { public_key: pend.publicKey.toString('base64url'), started_at: '2026-01-01T00:00:00.000Z' } } : {}) });
      return { h, io, oldKey, pend, oldDer: readFileSync(paths(h).key) };
    };
    // script: { probe: [answers for sessions opened with the NEW key, in order], rotate: [answers], oldSession: answer }
    const stub = (x, script) => {
      const seen = { probes: 0, rotates: 0, calls: [] };
      const newPk = x.pend.publicKey.toString('base64url');
      const fetchImpl = async (url, init) => {
        const path = new URL(url).pathname.replace(/^.*\/v1\//, '/v1/'); seen.calls.push(path);
        const body = init && init.body ? JSON.parse(init.body) : {};
        if (path === '/v1/time') return json(200, { ok: true, server_time: new Date().toISOString() });
        if (path === '/v1/session') {
          if (pkOfAssertion(body) === newPk) { const a = script.probe[Math.min(seen.probes++, script.probe.length - 1)]; return json(a[0], a[1]); }
          const a = script.oldSession || [200, { ok: true, session_token: 'O'.repeat(43) }]; return json(a[0], a[1]);
        }
        if (path === '/v1/node/credential-rotate') { const a = script.rotate[Math.min(seen.rotates++, script.rotate.length - 1)]; return json(a[0], a[1]); }
        return json(404, { ok: false, refused: 'no_such_route' });
      };
      return { fetchImpl, seen };
    };
    const OK = (cred) => [200, { ok: true, session_token: 'N'.repeat(43), credential_id: cred, node_id: 'node-rr', principal_id: 'p', computer_id: 'c' }];
    const UNKNOWN = [401, { ok: false, refused: 'unknown_key', message: 'no node credential has this key' }];
    const resolveIn = async (x, s) => {
      const api = new NodeApi({ api: API, key: { privateKey: x.oldKey.privateKey, publicKey: x.oldKey.publicKey }, fetchImpl: s.fetchImpl });
      return resolvePendingRotation({ home: x.h, api, fetchImpl: s.fetchImpl, keyIo: x.io });
    };
    const state = (x) => ({ key: readFileSync(paths(x.h).key).equals(x.oldDer) ? 'old' : (existsSync(paths(x.h).key) && readFileSync(paths(x.h).key).equals(x.pend.privateKeyDer) ? 'new' : 'other'),
      record: !!(readJson(paths(x.h).config) || {}).pending_rotation, pendingFile: existsSync(paths(x.h).pendingKey), cred: (readJson(paths(x.h).config) || {}).credential_id });

    // RR1: answers that prove nothing never change a key file
    const rr1 = [];
    for (const [label, ans] of [['404 no_such_route', [404, { ok: false, refused: 'no_such_route' }]], ['400 bad_assertion', [400, { ok: false, refused: 'bad_assertion' }]],
      ['a body without a refusal name', [200, {}]], ['401 bad_signature', [401, { ok: false, refused: 'bad_signature' }]], ['429 rate limited', [429, { ok: false, refused: 'rate_limited' }]]]) {
      const x = await setupHome('rr1-' + rr1.length); const s = stub(x, { probe: [ans], rotate: [[200, { ok: true, credential_id: 'never' }]] });
      const out = await resolveIn(x, s);
      rr1.push({ label, state: out.state, ...state(x), rotates: s.seen.rotates });
    }
    row('RR1 a probe of the pending key answered 404, 400 bad_assertion, 200 without a refusal name, 401 bad_signature or 429 proves nothing: unknown - node.key byte-identical, the record and the pending key kept, and no rotation is asked again',
      rr1.every((r) => r.state === 'unknown' && r.key === 'old' && r.record && r.pendingFile && r.rotates === 0), JSON.stringify(rr1));

    // RR2: the rotation committed late (the first request was still in flight): the repeat is refused superseded, and the final probe promotes
    const x2 = await setupHome('rr2'); const s2 = stub(x2, { probe: [UNKNOWN, OK('cred-new')], rotate: [[401, { ok: false, refused: 'credential_superseded' }]] });
    const o2 = await resolveIn(x2, s2);
    row('RR2 a rotation that commits late - the probe first says unknown_key, the repeated rotation is then refused credential_superseded - is PROMOTED on the final probe, never discarded: node.key is the new key, the credential id recorded, no record or pending file left',
      o2.state === 'promoted' && state(x2).key === 'new' && state(x2).cred === 'cred-new' && !state(x2).record && !state(x2).pendingFile, JSON.stringify({ out: o2.state, ...state(x2), probes: s2.seen.probes }));

    // RR3: discarded only once the old credential is no longer active; a named refusal while it is active; an unknown answer keeps
    const x3 = await setupHome('rr3'); const s3 = stub(x3, { probe: [UNKNOWN, UNKNOWN], rotate: [[401, { ok: false, refused: 'credential_superseded' }]] });
    const o3 = await resolveIn(x3, s3);
    const x3b = await setupHome('rr3b'); const s3b = stub(x3b, { probe: [UNKNOWN], rotate: [[409, { ok: false, refused: 'enrollment_not_alive' }]] });
    const o3b = await resolveIn(x3b, s3b);
    const x3c = await setupHome('rr3c'); const s3c = stub(x3c, { probe: [UNKNOWN], rotate: [[503, { ok: false, refused: 'plane_unavailable' }]] });
    const o3c = await resolveIn(x3c, s3c);
    const x3d = await setupHome('rr3d'); const s3d = stub(x3d, { probe: [UNKNOWN, OK('cred-3d')], rotate: [[200, { ok: true, credential_id: 'cred-3d' }]] });
    const o3d = await resolveIn(x3d, s3d);
    row('RR3 the pending key is dropped only on proof: after the old credential was seen superseded AND a later probe still says unknown_key, or on a named refusal while the old credential is active (enrollment_not_alive); a 503 keeps it; a repeated rotation that succeeds promotes it',
      o3.state === 'discarded' && state(x3).key === 'old' && !state(x3).record && !state(x3).pendingFile && s3.seen.probes === 2
        && o3b.state === 'discarded' && state(x3b).key === 'old' && o3c.state === 'unknown' && state(x3c).record && state(x3c).pendingFile
        && o3d.state === 'promoted' && state(x3d).key === 'new' && state(x3d).cred === 'cred-3d',
      JSON.stringify({ o3: [o3.state, state(x3)], o3b: [o3b.state, state(x3b).key], o3c: [o3c.state, state(x3c).record], o3d: [o3d.state, state(x3d).key] }));

    // RR4: an unreadable pending key is kept (it may be registered)
    const x4 = await setupHome('rr4'); writeFileSync(paths(x4.h).pendingKey, 'not a key');
    const s4 = stub(x4, { probe: [OK('x')], rotate: [[200, { ok: true }]] });
    const o4 = await resolveIn(x4, s4);
    row('RR4 a pending key that cannot be read now is kept with its record (unknown): nothing is sent and node.key is unchanged',
      o4.state === 'unknown' && state(x4).record && existsSync(paths(x4.h).pendingKey) && state(x4).key === 'old' && s4.seen.calls.length === 0, JSON.stringify({ o4: o4.state, why: o4.why, calls: s4.seen.calls }));

    // RR5: a pending key file whose record was lost is probed, never deleted unseen: registered -> promoted
    const x5 = await setupHome('rr5', { record: false }); const s5 = stub(x5, { probe: [OK('cred-5')], rotate: [[200, { ok: true }]] });
    const o5 = await resolveIn(x5, s5);
    row('RR5 a pending key file without its record (the record lost) is probed before anything is deleted: its key holds a credential, so it is promoted',
      o5.state === 'promoted' && state(x5).key === 'new' && state(x5).cred === 'cred-5' && !state(x5).pendingFile, JSON.stringify({ o5: o5.state, ...state(x5) }));

    // RR6: the promotion's key write fails once: the record and the pending key stay; the next pass promotes
    const x6 = await setupHome('rr6'); let fails = 1;
    x6.io.failStore = (file) => file === paths(x6.h).key && fails-- > 0;
    const s6 = stub(x6, { probe: [OK('cred-6')], rotate: [[200, { ok: true }]] });
    const o6a = await resolveIn(x6, s6); const mid = state(x6);
    const o6b = await resolveIn(x6, s6);
    row('RR6 a promotion whose key write fails keeps the record and the pending key (the key is registered and can be used in memory); the next pass promotes it',
      o6a.state === 'unknown' && o6a.registered === true && mid.key === 'old' && mid.record && mid.pendingFile && o6b.state === 'promoted' && state(x6).key === 'new' && !state(x6).record,
      JSON.stringify({ first: [o6a.state, o6a.registered, mid], second: [o6b.state, state(x6)] }));

    // ================================================================ CF1: a config.json that cannot be read now is never rewritten from {}
    const TORN = '{"api": "http://127.0.0.1:9/functions/v1/factory-node-api", "node_'; // caught mid-write by another program: not JSON
    // (a) a rotation the plane asks for while config.json cannot be read: nothing is stored or sent, config.json is left as it is
    const xa = await setupHome('cf1a', { record: false, pendingFile: false });
    const callsA = []; let beats = 0;
    const fetchA = async (url) => {
      const path = new URL(url).pathname.replace(/^.*\/v1\//, '/v1/'); callsA.push(path);
      if (path === '/v1/time') return json(200, { ok: true, server_time: new Date().toISOString() });
      if (path === '/v1/session') return json(200, { ok: true, session_token: 'S'.repeat(43) });
      if (path === '/v1/node/register') return json(200, { ok: true, node_id: 'node-rr', enrollment_state: 'ALIVE', release: { current: true }, envelope: { version: 1 }, revocations: { key_ids: [], releases: [] } });
      if (path === '/v1/node/heartbeat') {
        // from the first heartbeat of the loop on, config.json is torn and the plane asks for a rotation
        if (++beats >= 3) writeFileSync(paths(xa.h).config, TORN);
        return json(200, { ok: true, phase: 'AVAILABLE', release_current: true, rotate_required: beats >= 3, revocations: { key_ids: [], releases: [] }, published_releases: [] });
      }
      if (path === '/v1/node/release') return json(200, { ok: true, released: 0 });
      return json(404, { ok: false, refused: 'no_such_route' });
    };
    const exitA = await runWorker({ home: xa.h, runtime: { version: '0.1.0' }, once: true, pollMs: 50, fetchImpl: fetchA, keyIo: xa.io });
    const stA = readJson(paths(xa.h).status, {});
    const a = { exit: exitA, rotateSent: callsA.includes('/v1/node/credential-rotate'), config: readFileSync(paths(xa.h).config, 'utf8') === TORN, pendingFile: existsSync(paths(xa.h).pendingKey),
      rotation: stA.rotation && stA.rotation.state, refused: stA.rotation && stA.rotation.refused };
    // (b) a promotion while config.json cannot be read: refused before any file changes
    const xb = await setupHome('cf1b'); writeFileSync(paths(xb.h).config, TORN);
    const pb = await xb.io.loadKey(paths(xb.h).pendingKey);
    const promo = await promotePending({ home: xb.h, pk: pb, credentialId: 'cred-new', keyIo: xb.io }).then(() => 'promoted', (e) => (e && e.code) || 'error');
    const b = { promo, key: state(xb).key, config: readFileSync(paths(xb.h).config, 'utf8') === TORN, pendingFile: existsSync(paths(xb.h).pendingKey) };
    // (c) a discard proven final (unknown_key, the old credential superseded, unknown_key again) while config.json turned unreadable
    const xc = await setupHome('cf1c');
    const sc = stub(xc, { probe: [UNKNOWN, UNKNOWN], rotate: [[401, { ok: false, refused: 'credential_superseded' }]] });
    const tearing = async (url, init) => { if (new URL(url).pathname.endsWith('/v1/node/credential-rotate')) writeFileSync(paths(xc.h).config, TORN); return sc.fetchImpl(url, init); };
    const oc = await resolveIn(xc, { fetchImpl: tearing, seen: sc.seen });
    const c = { out: oc.state, key: readFileSync(paths(xc.h).key).equals(xc.oldDer), config: readFileSync(paths(xc.h).config, 'utf8') === TORN, pendingFile: existsSync(paths(xc.h).pendingKey) };
    row('CF1 config.json that cannot be read at the instant it would be rewritten is never rewritten from {}: a rotation the plane asks for then is not started (ROTATION_REFUSED config_unreadable; no rotate request, no pending key, config.json untouched); a promotion then refuses (config_unreadable) with node.key, config.json and the pending key unchanged; a discard then changes nothing (unknown; the pending key kept)',
      a.exit === EXIT_WORKER.STOPPED && !a.rotateSent && a.config && !a.pendingFile && a.rotation === 'ROTATION_REFUSED' && a.refused === 'config_unreadable'
        && b.promo === 'config_unreadable' && b.key === 'old' && b.config && b.pendingFile
        && c.out === 'unknown' && c.key && c.config && c.pendingFile,
      JSON.stringify({ a, b, c }));
  }
} catch (e) {
  row('X0 runtime units', false, (e && e.stack) || e);
} finally {
  for (const c of children) { try { c.kill(); } catch { /* gone */ } }
  await sleep(500);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nruntime_units: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
