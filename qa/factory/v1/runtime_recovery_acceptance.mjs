#!/usr/bin/env node
// THE ENROLLED RUNTIME AGAINST A REAL PLANE, IN ONE PROCESS - DEVELOPER VERIFICATION (contract §9, §2 Enrollment, §8 rotate; P-2, P-7,
// P-10; AC-6(e), AC-9, AC-16). A disposable plane with both APIs (flows.mjs world()); each "computer" is the runtime's own code - setup
// (setup.mjs enrollNew / resumeEnrollment / runSetup, the key stored with DPAPI) and worker.mjs runWorker - in its own home, speaking
// to the Node API through a fetch the row may interpose on: it lets a request reach the plane and COMMIT, then withholds the answer
// (a lost reply), or withholds the request itself. No scheduled task and no supervisor. The artifact setup installs is a copy of a
// small Windows system executable with a dev-signed manifest (its PE image hash is all the gate reads; it is never run), and the
// plane's published dev release is that image hash, so every runtime of this suite registers on a current release.
//   RC1  a credential-rotate answer withheld after the plane committed it: the SAME running worker resolves it with its stored new
//        key and goes on under the new credential - no admin action, no code, no REFUSED; the old credential stays superseded
//   RC2  the new key's store fails once before the request (nothing is sent, the old credential stays active, the rotation happens
//        after the pause), and the promotion's key write fails once (the record survives and the next pass promotes)
//   RC6  the rotate answer withheld AND the first session opened with the new key lost, so the worker cannot settle the rotation at
//        once: the next call under the old credential is refused credential_superseded, the worker settles it with the stored key and
//        ends with exit 7 (CREDENTIAL_ROTATED: the supervisor restarts it at once, never REFUSED); a new worker on the home runs
//        AVAILABLE under the new credential
//   RC7  a worker stopped while its rotation had committed but was not yet saved as the node key (the promotion's key write keeps
//        failing): the next worker resolves the rotation before its first request and runs AVAILABLE under the new credential
//   RC3  every enroll/complete answer withheld after the commit: setup ends NOT FINISHED with the key and the enrollment kept; setup
//        run again (runSetup) with an input carrying no code never asks for one, takes the stored key's credential, passes the
//        release gate and reports RUNTIME_INSTALLING, the key file unchanged; the runtime then reaches ALIVE; one ok completion, no
//        code_consumed, one credential
//   RC4  only the first enroll/complete answer lost: setup's own retry is told already_enrolled, a session with the key proves the
//        credential, and setup finishes enrolled in the same run
//   RC5  enroll/complete never reached the plane, and the retry meets a 429 (the per-address cap): the enrollment in progress and
//        node.key are kept byte for byte; a later run from another address finishes it
//   RL1  an envelope amended to add the verifier role while the runtime runs: with nobody touching the node it certifies the queued
//        verification it is the only eligible verifier of; once the role is removed again, no further verification run starts
//   RL2  a runtime authorized for both roles, with a priority-100 verification and priority-2 authoring work queued, starts on the
//        verification (one ranked pick across both kinds)
//   CK1  the first claim answer and the first checkpoint answer withheld after the commit: the orphaned run is given back at once
//        (the work completes long before its 120 s lease would lapse) and each probe step has exactly one checkpoint row
//   RN1  a run longer than its renewal interval on the real plane (the claim asks a 15 s lease): every renewal is granted 15 s by the
//        plane's own clock (lease_expires_at - server_time), agent_runs.lease_expires_at moves forward with each, and the run
//        completes as the one run of its work order
//   TR1  (C2-P1) every answer of one checkpoint lost, through the client's own retries: the run is NOT failed - the node sends nothing
//        more for it and goes on with other work; the run stays in progress until its lease lapses; a SECOND node then takes the work
//        over from the last checkpoint and completes it; the first owner's renewal, checkpoint and completion (done or failed) are
//        refused; one run is done, none failed, and every step has exactly one checkpoint row
//   TR2  (C2-P1) a checkpoint the plane's server itself refuses - a real lock wait past the front door's lock_timeout, SQLSTATE 55P03,
//        answered 500 server_refused - does not fail the run either: the lease lapses and the same node, the only eligible one, takes
//        the work back as a NEW run resumed from the checkpoint, and completes it once
// usage: node qa/factory/v1/runtime_recovery_acceptance.mjs [--evidence <file>]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { ROOT, connect } from './plane.mjs';
import { asEngine } from './fixtures.mjs';
import { world, recorder, RES } from './flows.mjs';

const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
// setup verifies its artifact against the trust set pinned in it. Unbundled, this suite pins the dev channel's committed trust set (the
// value build-sea compiles into a dev artifact) BEFORE any runtime module is first evaluated
globalThis.__TRUST__ = JSON.parse(readFileSync(join(ROOT, 'scripts', 'factory-runner', 'enrolled', 'trust', 'dev.json'), 'utf8'));
const { enrollNew, resumeEnrollment, runSetup } = await imp('scripts/factory-runner/enrolled/setup.mjs');
const { runWorker, EXIT_WORKER } = await imp('scripts/factory-runner/enrolled/worker.mjs');
const { NodeApi } = await imp('scripts/factory-runner/enrolled/api.mjs');
const { loadKey, newKey, storeKey } = await imp('scripts/factory-runner/enrolled/keys.mjs');
const { paths, readJson } = await imp('scripts/factory-runner/enrolled/home.mjs');
const { probeContent } = await imp('scripts/factory-runner/enrolled/handlers.mjs');
const { makeManifest, signDev } = await imp('scripts/factory-build/release-manifest.mjs');

const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const work = mkdtempSync(join(tmpdir(), 'bf-recovery-'));
// the release setup installs: its dev-signed manifest names the copy's PE image hash, which the plane publishes as the dev release
const ART = join(work, 'offered', 'BrainFactorySetup.exe');
mkdirSync(dirname(ART), { recursive: true });
copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), ART);
const OFFER = signDev(makeManifest({ artifact: ART, channel: 'dev', version: '0.1.0', source_sha: createHash('sha1').update('runtime_recovery_acceptance').digest('hex'),
  receipt_sha256: createHash('sha256').update('runtime_recovery_acceptance receipt').digest('hex') }));
const OFFER_FILE = join(work, 'offered', 'offer.manifest.json');
writeFileSync(OFFER_FILE, JSON.stringify(OFFER));
const W = await world({ releaseDigest: OFFER.digest });
const workers = [];
const waitFor = async (fn, ms, step = 250) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step); } };
const thumb = (pk) => createHash('sha256').update(pk).digest('hex');

// a fetch from a chosen loopback address (the S-6 per-address cap keys on the peer: each computer of this suite has its own)
let ipn = 110;
const fetchFrom = (localAddress) => (url, init = {}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const body = init.body === undefined || init.body === null ? null : Buffer.from(String(init.body));
  const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: init.method || 'GET', localAddress,
    headers: { ...(init.headers || {}), ...(body ? { 'content-length': body.length } : {}) } }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: { 'content-type': res.headers['content-type'] || 'application/json' } })));
  });
  req.on('error', reject);
  if (init.signal) init.signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
  req.end(body || undefined);
});
/** the request reaches the plane and commits; its answer is then withheld (a lost reply) for the first `times` matching calls */
const withholdAfterCommit = (base, match, times = 1, seen = { n: 0, withheld: 0 }) => {
  const f = async (url, init) => {
    const res = await base(url, init);
    if (match(url, init)) { seen.n++; if (seen.withheld < times) { seen.withheld++; await res.arrayBuffer(); throw new TypeError('fetch failed (the answer was withheld by the test)'); } }
    return res;
  };
  f.seen = seen; return f;
};
/** the request never reaches the plane, for the first `times` matching calls */
const dropBeforeSend = (base, match, times = Infinity, seen = { dropped: 0 }) => {
  const f = async (url, init) => { if (match(url, init) && seen.dropped < times) { seen.dropped++; throw new TypeError('fetch failed (the request was dropped by the test)'); } return base(url, init); };
  f.seen = seen; return f;
};
const isPath = (p) => (url) => new URL(url).pathname.endsWith(p);
/** the public key a session request's assertion presents (base64url), or null */
const assertionPk = (body) => { try { return JSON.parse(Buffer.from(String(JSON.parse(body).assertion).split('.')[0], 'base64url').toString('utf8')).pk; } catch { return null; } };

const { founder, admin, sup } = W;
const ENV = { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 };
// an author's report that out-ranks every other node (ranking compares CPU headroom, then free RAM, then disk): its own claims are never deferred
const TOP = { cpu_cores: 64, cpu_pct: 0, ram_free_mb: 40000000, disk_free_mb: 1000000000 };
// the computers of earlier rows are archived before a row whose claims ranking could otherwise defer (a stopped runtime stays AVAILABLE and fresh)
const used = [];
const archiveUsed = async () => { while (used.length) await admin.call('archive', { computer_id: used.pop() }, founder.token); };
/** Add Computer, then setup's enrollment in `home` (the code on its input, as a person types it) */
async function install(name, envelope = ENV, { enrollFetch } = {}) {
  const add = await admin.call('add-computer', { display_name: name, envelope }, founder.token);
  if (!add.ok) throw new Error('add-computer refused: ' + JSON.stringify(add));
  used.push(add.computer_id);
  const home = join(work, 'home-' + name);
  const from = fetchFrom('127.0.0.' + (ipn++));
  const said = [];
  const input = new PassThrough(); input.end(add.pairing_code + '\n');
  const e = await enrollNew({ api: W.node.baseUrl, home, channel: 'dev', say: (s) => said.push(String(s)), input, output: new PassThrough(), fetchImpl: enrollFetch ? enrollFetch(from) : from });
  return { name, add, home, from, e, said };
}
/** what setup reports after its gate: RUNTIME_INSTALLING, with the stored key */
async function installing(x) {
  const k = await loadKey(paths(x.home).key);
  const n = new NodeApi({ api: W.node.baseUrl, key: k.key });
  await n.time();
  return n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
}
function startWorker(x, opts = {}) {
  const w = { x, done: false, code: null };
  w.promise = runWorker({ home: x.home, runtime: { version: '0.1.0', digest: W.rel.digest }, pollMs: 200, ...opts }).then((c) => { w.done = true; w.code = c; return c; });
  workers.push(w);
  return w;
}
async function stopWorker(w) { if (w.done) return w.code; writeFileSync(paths(w.x.home).stop, '{}'); return Promise.race([w.promise, sleep(30000).then(() => 'timeout')]); }
const status = (x) => readJson(paths(x.home).status, {});
const cycled = (x) => waitFor(() => status(x).cycle_completed === true, 60000);
const creds = async (x) => (await sup.query(`select credential_id, status, key_thumbprint, issued_via from factory.node_credentials where computer_id = $1 order by issued_at, credential_id`, [x.add.computer_id])).rows;
const keyThumb = async (x) => { const k = await loadKey(paths(x.home).key); return k.ok ? thumb(k.key.publicKey) : null; };

try {
  // ================================================================ RC1: a rotate answer lost after the commit
  {
    const A = await install('RC1'); await installing(A);
    const rot = withholdAfterCommit(fetch, isPath('/v1/node/credential-rotate'), 1);
    const w = startWorker(A, { fetchImpl: rot });
    await cycled(A);
    const rq = await admin.call('request-rotation', { computer_id: A.add.computer_id }, founder.token);
    const settled = await waitFor(async () => {
      const c = await creds(A); const active = c.filter((r) => r.status === 'active');
      // (settled = the promotion finished: node.key is the active key AND the record and the pending key are gone - it writes them in that order)
      return c.length === 2 && active.length === 1 && c.some((r) => r.status === 'superseded') && active[0].key_thumbprint === (await keyThumb(A))
        && !(readJson(paths(A.home).config) || {}).pending_rotation && !existsSync(paths(A.home).pendingKey) ? c : null;
    }, 30000);
    const rotatedAt = (await sup.query(`select max(at) t from factory.audit_events where action = 'node.credential_rotate' and outcome = 'ok' and actor_id = $1`, [A.e.cfg ? A.e.cfg.principal_id : null])).rows[0].t;
    const beat = await waitFor(async () => { const r = (await sup.query(`select last_heartbeat_at > $2 as after from factory.nodes where computer_id = $1`, [A.add.computer_id, rotatedAt])).rows[0]; return r && r.after; }, 15000);
    const cfg = readJson(paths(A.home).config);
    const st = status(A);
    row('RC1 a credential-rotate answer lost after the plane committed it: the same running worker resolves it with the stored new key - exactly 2 credentials (the new one active, its key the one in node.key; the old superseded), a heartbeat under the new credential after the rotation, no REFUSED, no pending record or key left, one rotate request, the worker still running',
      A.e.ok && rq.ok && !!settled && beat === true && st.state !== 'REFUSED' && !cfg.pending_rotation && !existsSync(paths(A.home).pendingKey) && rot.seen.n === 1 && !w.done
        && cfg.credential_id === settled.find((r) => r.status === 'active').credential_id,
      JSON.stringify({ creds: settled && settled.map((r) => r.status + ':' + r.issued_via), beat, state: st.state, rotation: st.rotation, rotateRequests: rot.seen.n, done: w.done }));
    await stopWorker(w);
  }

  // ================================================================ RC2: the key store fails once - before the request; at the promotion
  {
    const B = await install('RC2a'); await installing(B);
    let failPending = 1; const sent = { n: 0 };
    const count = async (url, init) => { if (isPath('/v1/node/credential-rotate')(url)) sent.n++; return fetch(url, init); };
    const keyIo = { newKey, loadKey, storeKey: async (f, k, o) => { if (f === paths(B.home).pendingKey && failPending-- > 0) throw Object.assign(new Error('refused (test)'), { code: 'dpapi_required' }); return storeKey(f, k, o); } };
    const w = startWorker(B, { fetchImpl: count, keyIo, rotationPauseMs: 3000 });
    await cycled(B);
    await admin.call('request-rotation', { computer_id: B.add.computer_id }, founder.token);
    const refused = await waitFor(() => (status(B).rotation && status(B).rotation.state === 'ROTATION_REFUSED' ? status(B).rotation : null), 20000);
    const during = { sent: sent.n, creds: (await creds(B)).map((r) => r.status), pendingFile: existsSync(paths(B.home).pendingKey), record: !!(readJson(paths(B.home).config) || {}).pending_rotation };
    // (the promotion writes node.key, then config.json without the record, then removes the pending key: wait for its end, not a step of it)
    const rotated = await waitFor(async () => { const c = await creds(B); return c.length === 2 && c.filter((r) => r.status === 'active').length === 1 && c.find((r) => r.status === 'active').key_thumbprint === (await keyThumb(B))
      && !(readJson(paths(B.home).config) || {}).pending_rotation && !existsSync(paths(B.home).pendingKey) ? c : null; }, 30000);
    const after = { sent: sent.n, pendingFile: existsSync(paths(B.home).pendingKey), record: !!(readJson(paths(B.home).config) || {}).pending_rotation, state: status(B).state };
    await stopWorker(w);

    const C = await install('RC2b'); await installing(C);
    let failPromote = 1; const sentC = { n: 0 };
    const countC = async (url, init) => { if (isPath('/v1/node/credential-rotate')(url)) sentC.n++; return fetch(url, init); };
    const keyIoC = { newKey, loadKey, storeKey: async (f, k, o) => { if (f === paths(C.home).key && failPromote-- > 0) throw Object.assign(new Error('refused (test)'), { code: 'write' }); return storeKey(f, k, o); } };
    const wc = startWorker(C, { fetchImpl: countC, keyIo: keyIoC });
    await cycled(C);
    await admin.call('request-rotation', { computer_id: C.add.computer_id }, founder.token);
    const rotatedC = await waitFor(async () => { const c = await creds(C); return c.length === 2 && c.find((r) => r.status === 'active').key_thumbprint === (await keyThumb(C)) && !existsSync(paths(C.home).pendingKey) ? c : null; }, 30000);
    const logC = (() => { try { return readFileSync(join(C.home, 'logs', 'worker.log'), 'utf8'); } catch { return ''; } })();
    const cfgC = readJson(paths(C.home).config);
    row('RC2 the new key\'s store fails once: nothing is sent (0 rotate requests), the old credential stays the only one and active, the refusal is named (ROTATION_REFUSED); after the pause the rotation happens (2 credentials, node.key the active one). The promotion\'s key write fails once: the record survives that pass and the next pass promotes (node.key the active key, no record or pending key, one rotate request only)',
      B.e.ok && !!refused && during.sent === 0 && JSON.stringify(during.creds) === '["active"]' && !during.pendingFile && !during.record
        && !!rotated && after.sent === 1 && !after.pendingFile && !after.record && after.state !== 'REFUSED'
        && !!rotatedC && failPromote < 0 && /could not be saved as the node key yet/.test(logC) && !cfgC.pending_rotation && sentC.n === 1 && !wc.done,
      JSON.stringify({ refused, during, rotated: rotated && rotated.map((r) => r.status), after, rotatedC: rotatedC && rotatedC.map((r) => r.status), sentC: sentC.n }));
    await stopWorker(wc);
  }

  // ================================================================ RC6: the settle cannot finish at once; the old credential is refused
  {
    const A = await install('RC6'); await installing(A);
    const firstPk = (readJson(paths(A.home).config) || {}).public_key;
    const seen = { rotates: 0, newKeySessions: 0, dropped: 0 };
    const f = async (url, init) => {
      if (isPath('/v1/session')(url) && assertionPk(init && init.body) !== firstPk) {
        seen.newKeySessions++;
        if (seen.dropped < 1) { seen.dropped++; throw new TypeError('fetch failed (the request was dropped by the test)'); }
      }
      const res = await fetch(url, init);
      if (isPath('/v1/node/credential-rotate')(url) && ++seen.rotates === 1) { await res.arrayBuffer(); throw new TypeError('fetch failed (the answer was withheld by the test)'); }
      return res;
    };
    const w = startWorker(A, { fetchImpl: f });
    await cycled(A);
    const rq = await admin.call('request-rotation', { computer_id: A.add.computer_id }, founder.token);
    const code = await Promise.race([w.promise, sleep(60000).then(() => 'timeout')]);
    const log6 = (() => { try { return readFileSync(join(A.home, 'logs', 'worker.log'), 'utf8'); } catch { return ''; } })();
    const mid = { creds: await creds(A), key: await keyThumb(A), record: !!(readJson(paths(A.home).config) || {}).pending_rotation, file: existsSync(paths(A.home).pendingKey) };
    // a new worker on the same home (what the supervisor starts at once on exit 7), with no interposed fetch
    rmSync(paths(A.home).status, { force: true });
    const w2 = startWorker(A);
    const up = await cycled(A);
    const st = status(A);
    const c2 = await creds(A);
    const active = c2.filter((r) => r.status === 'active');
    row('RC6 a rotate answer withheld after the commit AND the first session with the new key lost: the worker cannot settle at once, the next call under the old credential is refused credential_superseded, and the worker settles the rotation with its stored key and ends with exit 7 (CREDENTIAL_ROTATED, not REFUSED 2); node.key is then the active key (2 credentials, the old superseded), no pending record or key left, one rotate request; a new worker on the home runs AVAILABLE under the new credential',
      rq.ok && code === EXIT_WORKER.CREDENTIAL_ROTATED && seen.dropped === 1 && seen.rotates === 1 && /restarting on the new key/.test(log6)
        && mid.creds.length === 2 && mid.creds.some((r) => r.status === 'superseded') && mid.creds.filter((r) => r.status === 'active').length === 1
        && mid.creds.find((r) => r.status === 'active').key_thumbprint === mid.key && !mid.record && !mid.file
        && !!up && !w2.done && st.state === 'AVAILABLE' && c2.length === 2 && active.length === 1 && active[0].key_thumbprint === (await keyThumb(A)),
      JSON.stringify({ code, seen, creds: mid.creds.map((r) => r.status), record: mid.record, file: mid.file, second: { up: !!up, state: st.state, done: w2.done, code: w2.code } }));
    await stopWorker(w2);
  }

  // ================================================================ RC7: a worker stopped between the commit and the promotion
  {
    const B = await install('RC7'); await installing(B);
    const oldThumb = await keyThumb(B);
    let failNodeKey = true;
    const keyIo = { newKey, loadKey, storeKey: async (file, k, o) => { if (failNodeKey && file === paths(B.home).key) throw Object.assign(new Error('refused (test)'), { code: 'write' }); return storeKey(file, k, o); } };
    const w = startWorker(B, { keyIo });
    await cycled(B);
    await admin.call('request-rotation', { computer_id: B.add.computer_id }, founder.token);
    const committed = await waitFor(async () => {
      const c = await creds(B); const cfg = readJson(paths(B.home).config) || {}; const rs = status(B).rotation;
      return c.length === 2 && c.some((r) => r.status === 'superseded') && cfg.pending_rotation && existsSync(paths(B.home).pendingKey) && rs && rs.state === 'ROTATION_PENDING' ? c : null;
    }, 30000);
    const firstExit = await stopWorker(w);
    const left = { record: !!(readJson(paths(B.home).config) || {}).pending_rotation, file: existsSync(paths(B.home).pendingKey), nodeKeyOld: (await keyThumb(B)) === oldThumb };
    // the next start: the key writes work again; the stop request of the first worker is gone (the supervisor removes it at its start)
    failNodeKey = false;
    rmSync(paths(B.home).stop, { force: true });
    rmSync(paths(B.home).status, { force: true });
    const w2 = startWorker(B);
    const up = await cycled(B);
    const st = status(B);
    const c = await creds(B);
    const active = c.filter((r) => r.status === 'active');
    const cfg = readJson(paths(B.home).config) || {};
    row('RC7 a worker stopped after its rotation committed but before the new key could be saved as node.key (the record and the pending key left, node.key still the superseded key): the next worker resolves the rotation before its first request - it runs AVAILABLE (never refused, never exit 7), node.key is the active key of 2 credentials, config names it, no pending record or key left',
      !!committed && firstExit === EXIT_WORKER.STOPPED && left.record && left.file && left.nodeKeyOld
        && !!up && !w2.done && st.state === 'AVAILABLE' && c.length === 2 && active.length === 1 && active[0].key_thumbprint === (await keyThumb(B))
        && cfg.credential_id === active[0].credential_id && !cfg.pending_rotation && !existsSync(paths(B.home).pendingKey),
      JSON.stringify({ committed: committed && committed.map((r) => r.status), firstExit, left, second: { up: !!up, state: st.state, done: w2.done, code: w2.code, rotation: st.rotation }, creds: c.map((r) => r.status) }));
    await stopWorker(w2);
  }

  // ================================================================ RC3 / RC4 / RC5: enrollment answers lost
  const attempts = async (codeId) => (await sup.query(`select outcome, count(*)::int n from factory.pairing_attempts where code_id = $1 and phase = 'complete' group by outcome`, [codeId])).rows
    .reduce((a, r) => ({ ...a, [r.outcome]: r.n }), {});
  const walk = async (x) => ((await sup.query(`select array_agg(t.to_state order by t.transition_id) s from factory.enrollment_transitions t join factory.enrollments e using (enrollment_id) where e.computer_id = $1`, [x.add.computer_id])).rows[0].s || []).join('>');
  const serverCred = async (x) => (await sup.query(`select credential_id from factory.enrollments where computer_id = $1 and credential_id is not null`, [x.add.computer_id])).rows.map((r) => r.credential_id);
  {
    const X = await install('RC3', ENV, { enrollFetch: (from) => withholdAfterCommit(from, isPath('/v1/enroll/complete'), Infinity) });
    const kept = readJson(paths(X.home).config) || {};
    const keyBytes = readFileSync(paths(X.home).key);
    // setup run again, as a person runs it: the same artifact and manifest, and an input that ends without any code
    const said2 = []; const shown = [];
    const input = new PassThrough(); input.end();
    const output = new PassThrough(); output.on('data', (d) => shown.push(String(d)));
    const exit2 = await runSetup({ home: X.home, exe: ART, manifest: OFFER_FILE, api: W.node.baseUrl, noTasks: true, noStart: true, input, output, fetchImpl: X.from, out: (s) => said2.push(String(s)) });
    const cfg = readJson(paths(X.home).config) || {};
    const walked = await walk(X);
    const keySame = readFileSync(paths(X.home).key).equals(keyBytes);
    const current = readJson(paths(X.home).current) || {};
    const code = await runWorker({ home: X.home, runtime: { version: '0.1.0', digest: W.rel.digest }, once: true, pollMs: 200 });
    const att = await attempts(X.add.code_id);
    const sc = await serverCred(X);
    const nCreds = (await creds(X)).length;
    row('RC3 every enroll/complete answer withheld after the plane committed: setup ends NOT FINISHED, keeping the key and the enrollment in progress; setup run again (runSetup) with an input carrying no code never shows the pairing prompt, takes the stored key\'s credential (config names it), passes the release gate and reports RUNTIME_INSTALLING (exit 0, the release installed), node.key byte-identical; the runtime then registers and reaches ALIVE; one ok completion, no code_consumed, one credential',
      X.e.ok === false && X.e.exit === 1 && X.said.some((s) => /^NOT FINISHED/.test(s)) && !!kept.pending_enrollment && !kept.credential_id
        && exit2 === 0 && shown.join('') === '' && !said2.some((s) => /pairing code/i.test(s)) && cfg.credential_id === sc[0] && sc.length === 1 && !cfg.pending_enrollment && keySame
        && current.digest === OFFER.digest && /NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING$/.test(walked)
        && code === EXIT_WORKER.STOPPED && /NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE$/.test(await walk(X))
        && att.ok === 1 && !att.code_consumed && nCreds === 1,
      JSON.stringify({ first: X.e.exit, said: X.said.slice(-1), setup: { exit: exit2, prompt: shown.join('').slice(0, 80), last: said2.slice(-2), keySame, installed: current.digest === OFFER.digest },
        cred: cfg.credential_id === sc[0], walked, walk: await walk(X), attempts: att, creds: nCreds }));
  }
  {
    const X = await install('RC4', ENV, { enrollFetch: (from) => withholdAfterCommit(from, isPath('/v1/enroll/complete'), 1) });
    const cfg = readJson(paths(X.home).config) || {};
    const att = await attempts(X.add.code_id);
    const sc = await serverCred(X);
    row('RC4 only the first enroll/complete answer lost: setup\'s own retry is told already_enrolled, a session with the key proves the credential, and the same run finishes enrolled with it; one ok completion, one credential',
      X.e.ok === true && cfg.credential_id === sc[0] && sc.length === 1 && !cfg.pending_enrollment && att.ok === 1 && (att.enrollment_node_credential_issued || 0) >= 1 && (await creds(X)).length === 1,
      JSON.stringify({ ok: X.e.ok, attempts: att, cred: cfg.credential_id === sc[0] }));
  }
  {
    const X = await install('RC5', ENV, { enrollFetch: (from) => dropBeforeSend(from, isPath('/v1/enroll/complete')) });
    const kept = readJson(paths(X.home).config) || {};
    const keyBytes = readFileSync(paths(X.home).key);
    // this address has used its hour: 20 attempts recorded for it (under another tenant, so the operator tenant's cap is untouched)
    const T2 = 'b7e0f000-0000-4000-8000-0000000000b7';
    const addr = '127.0.0.' + (ipn - 1);
    await asEngine(sup, async () => {
      await sup.query(`insert into factory.tenants (tenant_id, name) values ($1, 'recovery-seed') on conflict do nothing`, [T2]);
      await sup.query(`insert into factory.pairing_attempts (tenant_id, peer_ip, phase, outcome) select $1, $2::inet, 'start', 'invalid_code' from generate_series(1, 20)`, [T2, addr]);
    });
    const said2 = [];
    const r2 = await resumeEnrollment({ api: W.node.baseUrl, home: X.home, channel: 'dev', say: (s) => said2.push(String(s)), fetchImpl: X.from });
    const mid = { cfg: readJson(paths(X.home).config) || {}, key: readFileSync(paths(X.home).key).equals(keyBytes) };
    const said3 = [];
    const r3 = await resumeEnrollment({ api: W.node.baseUrl, home: X.home, channel: 'dev', say: (s) => said3.push(String(s)), fetchImpl: fetchFrom('127.0.0.' + (ipn++)) });
    const cfg = readJson(paths(X.home).config) || {};
    const att = await attempts(X.add.code_id);
    const sc = await serverCred(X);
    row('RC5 an enroll/complete that never reached the plane, retried into the per-address cap (429): the enrollment in progress and node.key are kept byte for byte (NOT FINISHED, no code asked); a later run from another address finishes it with the same key - one ok completion, one credential',
      X.e.ok === false && !!kept.pending_enrollment && r2.state === 'stopped' && said2.some((s) => /rate_limited_ip/.test(s)) && !!mid.cfg.pending_enrollment && mid.key
        && r3.state === 'enrolled' && cfg.credential_id === sc[0] && sc.length === 1 && readFileSync(paths(X.home).key).equals(keyBytes) && att.ok === 1 && att.rate_limited_ip === 1,
      JSON.stringify({ first: X.e.exit, r2: r2.state, said2: said2.slice(-1), r3: r3.state, attempts: att }));
  }

  // ================================================================ RL1: an envelope amendment reaches a running runtime
  {
    await archiveUsed();
    const R = await install('RL-R', ENV); await installing(R);
    const M = await W.enroll('RL-M', { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 }, { res: TOP });
    const w = startWorker(R);
    await cycled(R);
    const authored = async (title, salt) => {
      const handoff = JSON.stringify({ steps: 1, salt });
      const wo = await W.submit({ title, work_type: 'rl-author', requires_verification: true, priority: 50, handoff });
      await M.n.op('heartbeat', { phase: 'AVAILABLE', resources: TOP });
      const c = await M.n.op('claim', { only_work_order_id: wo, resources: TOP });
      if (!c.claimed) throw new Error('RL1: M could not claim its work order: ' + JSON.stringify(c).slice(0, 300));
      const pc = probeContent({ work_order_id: wo, handoff });
      const d = await M.n.op('complete', { run_id: c.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: pc.commit, candidate_tree: pc.tree });
      return { wo, v: d.verification_work_order_id };
    };
    const vRuns = async (v) => (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1`, [v])).rows[0].n;
    const w1 = await authored('RL1 authored by M', 'rl1');
    await sleep(2000);
    const before = { runs: await vRuns(w1.v), certs: (await sup.query(`select count(*)::int n from factory.certifications where work_order_id = $1`, [w1.wo])).rows[0].n };
    const am = await admin.call('amend-envelope', { computer_id: R.add.computer_id, expected_version: 1, envelope: { ...ENV, roles: ['generic', 'verifier'] } }, founder.token);
    const certified = await waitFor(async () => (await sup.query(`select c.verdict, w.verification_state s from factory.certifications c join factory.work_orders w using (work_order_id)
        where c.work_order_id = $1 and c.certifying_principal_id = $2`, [w1.wo, R.e.cfg.principal_id])).rows[0], 10000);
    const back = await admin.call('amend-envelope', { computer_id: R.add.computer_id, expected_version: 2, envelope: ENV }, founder.token);
    await sleep(1000);
    const w2 = await authored('RL1 second, after the reverse amendment', 'rl1b');
    await sleep(2500);
    const after = await vRuns(w2.v);
    row('RL1 an envelope amended to add verifier while the runtime runs: before it, the runtime takes no verification (0 runs of V for 2 s); after it - no restart, no stop file, nobody touching the node - it certifies W (PASS, W COMPLETE) within 10 s; once a second amendment removes verifier again, V2 gets 0 runs for 2.5 s',
      before.runs === 0 && before.certs === 0 && am.ok && certified && certified.verdict === 'PASS' && certified.s === 'COMPLETE' && back.ok && after === 0 && !w.done,
      JSON.stringify({ before, amend: am.ok || am.refused, certified, back: back.ok || back.refused, after, done: w.done }));
    await stopWorker(w);
    await admin.call('archive', { computer_id: M.computer_id }, founder.token); // (an author out-ranks later claimers: out of the way)
  }

  // ================================================================ RL2: one ranked pick across both kinds
  {
    await archiveUsed();
    const R2 = await install('RL2-R', { ...ENV, roles: ['generic', 'verifier'] }); await installing(R2);
    // (M2 reports more free memory than every other node of this plane, so ranking never defers its own claim)
    const M2 = await W.enroll('RL2-M', { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 }, { res: TOP });
    const handoff = JSON.stringify({ steps: 1, salt: 'rl2' });
    const wo = await W.submit({ title: 'RL2 p100 authored by M2', work_type: 'rl-author', requires_verification: true, priority: 100, handoff });
    await M2.n.op('heartbeat', { phase: 'AVAILABLE', resources: TOP });
    const c = await M2.n.op('claim', { only_work_order_id: wo, resources: TOP });
    if (!c.claimed) throw new Error('RL2: M2 could not claim its work order: ' + JSON.stringify(c).slice(0, 300));
    const pc = probeContent({ work_order_id: wo, handoff });
    const d = await M2.n.op('complete', { run_id: c.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: pc.commit, candidate_tree: pc.tree });
    const probes = [];
    for (let i = 0; i < 3; i++) probes.push(await W.submit({ title: 'RL2 p2 probe ' + i, work_type: 'probe', priority: 2, owned_surface: ['rl2/' + i], handoff: JSON.stringify({ steps: 1, step_ms: 100, salt: 'p' + i }) }));
    const w = startWorker(R2);
    const first = await waitFor(async () => (await sup.query(`select r.work_order_id, r.run_kind from factory.agent_runs r where r.computer_id = $1 order by r.started_at limit 1`, [R2.add.computer_id])).rows[0], 30000);
    row('RL2 a runtime authorized for both roles, with a priority-100 verification and three priority-2 probes queued, starts its FIRST run on the verification (one ranked pick; the server chose the kind)',
      !!d.verification_work_order_id && first && first.work_order_id === d.verification_work_order_id && first.run_kind === 'verification',
      JSON.stringify({ first, v: d.verification_work_order_id, probes: probes.length }));
    await admin.call('archive', { computer_id: M2.computer_id }, founder.token); // (it out-ranks R2 for the probes: out of the way)
    await waitFor(async () => (await sup.query(`select count(*)::int n from factory.work_orders where work_order_id = any ($1) and status = 'done'`, [probes])).rows[0].n === 3, 60000);
    await stopWorker(w);
  }

  // ================================================================ CK1: lost claim and checkpoint answers
  {
    await archiveUsed();
    const K = await install('CK1', ENV); await installing(K);
    const claimLost = withholdAfterCommit(fetch, isPath('/v1/node/claim'), 1);
    const both = withholdAfterCommit(claimLost, isPath('/v1/node/checkpoint'), 1);
    const P = await W.submit({ title: 'CK1 probe', work_type: 'probe', priority: 90, owned_surface: ['ck1/p'], handoff: JSON.stringify({ steps: 2, step_ms: 200, salt: 'ck1' }) });
    const t0 = Date.now();
    const w = startWorker(K, { fetchImpl: both });
    const doneAt = await waitFor(async () => ((await sup.query(`select status from factory.work_orders where work_order_id = $1`, [P])).rows[0].status === 'done' ? Date.now() : null), 60000);
    const runs = (await sup.query(`select run_id, status, attempt_count, (select count(*)::int from factory.checkpoints k where k.run_id = r.run_id) cps,
        (select count(distinct scenario)::int from factory.checkpoints k where k.run_id = r.run_id) steps from factory.agent_runs r where work_order_id = $1 order by started_at`, [P])).rows;
    const doneRun = runs.find((r) => r.status === 'done');
    row('CK1 the first claim answer and the first checkpoint answer withheld after the commit: the orphaned run is given back at once - the probe is done ' + (doneAt ? Math.round((doneAt - t0) / 1000) + ' s' : 'never') + ' after it was queued, long before a 120 s lease could lapse (2 runs: the orphan requeued, one done) - and each step has exactly one checkpoint row (2 rows for 2 steps)',
      claimLost.seen.withheld === 1 && both.seen.withheld === 1 && doneAt && doneAt - t0 < 40000 && runs.length === 2 && runs[0].status === 'queued' && runs[0].cps === 0 && doneRun && doneRun.cps === 2 && doneRun.steps === 2,
      JSON.stringify({ secs: doneAt && Math.round((doneAt - t0) / 1000), runs: runs.map((r) => r.status + ':' + r.cps + ':' + r.attempt_count), claimWithheld: claimLost.seen.withheld, checkpointWithheld: both.seen.withheld }));
    await stopWorker(w);
  }

  // ================================================================ RN1: renewals of a real lease on the real plane
  {
    await archiveUsed();
    const N = await install('RN1', ENV); await installing(N);
    // the claim asks the plane for a 15 s lease (a grant the plane may give any node), so the guard renews every 5 s and the run
    // below outlives two renewals; the renewals' requests and answers are recorded as they pass
    const renews = [];
    const f = async (url, init) => {
      if (isPath('/v1/node/claim')(url) && init && init.body) init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), lease_seconds: 15 }) };
      const res = await fetch(url, init);
      if (isPath('/v1/node/renew')(url)) renews.push({ asked: JSON.parse(init.body).lease_seconds, answer: await res.clone().json().catch(() => null) });
      return res;
    };
    const P = await W.submit({ title: 'RN1 probe', work_type: 'probe', priority: 95, owned_surface: ['rn1/p'], handoff: JSON.stringify({ steps: 3, step_ms: 4000, salt: 'rn1' }) });
    const w = startWorker(N, { fetchImpl: f });
    const leases = [];
    const doneAt = await waitFor(async () => {
      const r = (await sup.query(`select r.lease_expires_at from factory.agent_runs r where r.work_order_id = $1 and r.status = 'in_progress'`, [P])).rows;
      for (const x of r) if (x.lease_expires_at && !leases.includes(x.lease_expires_at.getTime())) leases.push(x.lease_expires_at.getTime());
      return (await sup.query(`select status from factory.work_orders where work_order_id = $1`, [P])).rows[0].status === 'done';
    }, 60000, 200);
    const runs = (await sup.query(`select status, attempt_count from factory.agent_runs where work_order_id = $1 order by started_at`, [P])).rows;
    const granted = renews.map((x) => (x.answer && x.answer.ok ? Date.parse(x.answer.lease_expires_at) - Date.parse(x.answer.server_time) : null));
    const renewedOnRow = renews.every((x) => x.answer && x.answer.ok && leases.some((l) => Math.abs(l - Date.parse(x.answer.lease_expires_at)) <= 1));
    const forward = leases.every((l, i) => i === 0 || l > leases[i - 1]);
    row('RN1 a run longer than its renewal interval on the real plane (a 15 s lease): at least 2 renewals, each asking 15 s and granted exactly 15 s by the plane\'s own clock (lease_expires_at - server_time); agent_runs.lease_expires_at takes each renewal\'s new end and only moves forward; the run completes, the one run of its work order',
      !!doneAt && runs.length === 1 && runs[0].status === 'done' && renews.length >= 2 && renews.every((x) => x.asked === 15) && granted.every((g) => g !== null && Math.abs(g - 15000) <= 1)
        && renewedOnRow && leases.length >= 3 && forward,
      JSON.stringify({ done: !!doneAt, runs: runs.map((r) => r.status + ':' + r.attempt_count), renews: renews.length, granted, leaseSteps: leases.map((l, i) => (i ? l - leases[i - 1] : 0)), renewedOnRow }));
    await stopWorker(w);
  }

  // what a node's link carries: the path under /v1/ and the parsed body
  const sentOf = (url, init) => {
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch { body = null; }
    return { path: new URL(url).pathname.replace(/^.*\/v1\//, '/v1/'), body };
  };
  const withLease = (init, body, seconds) => ({ ...init, body: JSON.stringify({ ...body, lease_seconds: seconds }) });
  const runsOf = async (wo) => (await sup.query(`select r.run_id, r.status, r.attempt_count, r.computer_id, r.termination_reason, r.started_at, r.finished_at, r.resumed_from_checkpoint_id,
      (select count(*)::int from factory.surface_locks l where l.run_id = r.run_id) locks from factory.agent_runs r where r.work_order_id = $1 order by r.started_at`, [wo])).rows;
  const checkpointsOf = async (wo) => (await sup.query(`select k.checkpoint_id, k.run_id, k.scenario from factory.checkpoints k where k.work_order_id = $1 order by k.scenario, k.created_at`, [wo])).rows;
  const woOf = async (wo) => (await sup.query(`select status, completed_at from factory.work_orders where work_order_id = $1`, [wo])).rows[0];

  // ================================================================ TR1: a checkpoint whose every answer is lost; a second node takes over
  {
    await archiveUsed();
    // A may hold two runs (its second keeps it busy while the first one's lease lapses, so the node that takes the work over is B)
    const A = await install('TR1-A', { ...ENV, max_concurrent_runs: 2 }); await installing(A);
    const B = await install('TR1-B', ENV); await installing(B);
    const handoff = JSON.stringify({ steps: 3, step_ms: 1500, salt: 'tr1' });
    const P = await W.submit({ title: 'TR1 probe', work_type: 'probe', priority: 90, owned_surface: ['tr1/p'], handoff });
    const Q = await W.submit({ title: 'TR1 other work of the first node', work_type: 'probe', priority: 80, owned_surface: ['tr1/q'], handoff: JSON.stringify({ steps: 6, step_ms: 4000, salt: 'tr1q' }) });
    // A's link: every claim asks a 15 s lease; each answer to the step-2 checkpoint of A's run of P is withheld AFTER the plane committed
    // it - the first attempt and the client's three retries (api.mjs: 1 s, 2 s and 4 s apart). Once the last one is withheld the handler
    // has nothing left to try: from then on, everything A sends that names that run is recorded
    const a = { run: null, lost: 0, ended: 0, after: [] };
    const linkA = async (url, init) => {
      const { path, body } = sentOf(url, init);
      if (path === '/v1/node/claim' && body) init = withLease(init, body, 15);
      if (a.ended && body && body.run_id === a.run) a.after.push(path.replace('/v1/node/', ''));
      if (a.ended && path === '/v1/node/release' && body && Array.isArray(body.keep_run_ids) && !body.keep_run_ids.includes(a.run)) a.after.push('release(every run but ' + JSON.stringify(body.keep_run_ids) + ')');
      const res = await fetch(url, init);
      if (path === '/v1/node/claim' && !a.run) { const j = await res.clone().json().catch(() => null); if (j && j.claimed && j.claimed.work_order.work_order_id === P) a.run = j.claimed.run_id; }
      if (path === '/v1/node/checkpoint' && body && body.run_id === a.run && body.scenario === 'step-2') {
        await res.arrayBuffer();
        if (++a.lost === 4) a.ended = Date.now();
        throw new TypeError('fetch failed (the answer was withheld by the test)');
      }
      return res;
    };
    const wA = startWorker(A, { fetchImpl: linkA });
    const ended = await waitFor(() => a.ended, 60000, 100);
    // two seconds after the handler ended: the run as the plane holds it
    await sleep(2000);
    const held = (await sup.query(`select r.status, r.lease_expires_at > now() live, r.lease_expires_at, w.status ws from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.run_id = $1`, [a.run])).rows[0] || {};
    // B starts once A is busy on its other work (so B cannot have taken that), and waits for nothing but the lease
    const busy = await waitFor(async () => (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1 and status = 'in_progress' and computer_id = $2`, [Q, A.add.computer_id])).rows[0].n === 1, 20000, 100);
    const wB = startWorker(B);
    const taken = await waitFor(async () => (await runsOf(P)).find((r) => r.computer_id === B.add.computer_id), 60000, 100);
    // the first owner, with its own credential, after the takeover
    const kA = await loadKey(paths(A.home).key);
    const first = new NodeApi({ api: W.node.baseUrl, key: kA.key });
    await first.time();
    const pc = probeContent({ work_order_id: P, handoff });
    const stale = {
      renew: await first.op('renew', { run_id: a.run, lease_seconds: 15 }),
      checkpoint: await first.op('checkpoint', { run_id: a.run, location: 'probe://' + P + '/stale', scenario: 'stale' }),
      done: await first.op('complete', { run_id: a.run, status: 'done', termination_reason: 'completed', head_commit: pc.commit, candidate_tree: pc.tree }),
      failed: await first.op('complete', { run_id: a.run, status: 'failed', termination_reason: 'handler_error' }),
    };
    const doneP = await waitFor(async () => (await woOf(P)).status === 'done', 60000, 200);
    const doneQ = await waitFor(async () => (await woOf(Q)).status === 'done', 90000, 200);
    const runs = await runsOf(P), cps = await checkpointsOf(P), wo = await woOf(P), runsQ = await runsOf(Q);
    const rA = runs.find((r) => r.run_id === a.run) || {}, rB = runs.find((r) => r.computer_id === B.add.computer_id) || {};
    const step = (s) => cps.filter((k) => k.scenario === s);
    const refusedAudit = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'node.complete' and target_id = $1 and outcome = 'refused' and reason = 'superseded'`, [a.run])).rows[0].n;
    row('TR1 every answer of a run\'s step-2 checkpoint lost (the first attempt and the client\'s three retries, each committed by the plane): the run is NOT failed - after the last one the node sends nothing that names the run (no completion, no release, no renewal, no checkpoint) and goes on to other work, which it completes; 2 s later the plane still holds the run in progress under its lease and the work order claimed; once that lease has lapsed the SECOND node takes the work over as a new run resumed from the step-2 checkpoint, does step 3 only and completes it; the first owner\'s renewal, checkpoint and completion (done and failed) are refused lease_lost / lease_lost / superseded / superseded; in the end ONE run of the work order is done and none failed, the first run is queued with attempt 2, no lock is left, and steps 1, 2 and 3 have exactly one checkpoint row each',
      !!ended && a.lost === 4 && a.after.length === 0
        && held.status === 'in_progress' && held.live === true && held.ws === 'claimed'
        && !!busy && !!taken && taken.started_at >= held.lease_expires_at
        && stale.renew.refused === 'lease_lost' && stale.checkpoint.refused === 'lease_lost' && stale.done.refused === 'superseded' && stale.done.landed === false
        && stale.failed.refused === 'superseded' && refusedAudit === 2
        && !!doneP && runs.length === 2 && rA.status === 'queued' && rA.attempt_count === 2 && rA.finished_at === null && rA.computer_id === A.add.computer_id
        && rB.status === 'done' && rB.termination_reason === 'completed' && rB.finished_at !== null
        && runs.filter((r) => r.status === 'done').length === 1 && !runs.some((r) => r.status === 'failed') && runs.every((r) => r.locks === 0)
        && wo.status === 'done' && wo.completed_at !== null
        && cps.length === 3 && step('step-1').length === 1 && step('step-1')[0].run_id === a.run && step('step-2').length === 1 && step('step-2')[0].run_id === a.run
        && step('step-3').length === 1 && step('step-3')[0].run_id === rB.run_id && rB.resumed_from_checkpoint_id === step('step-2')[0].checkpoint_id
        && !!doneQ && runsQ.length === 1 && runsQ[0].status === 'done' && runsQ[0].computer_id === A.add.computer_id,
      JSON.stringify({ lost: a.lost, sentAfter: a.after, held: { status: held.status, live: held.live, wo: held.ws }, tookOverAfterLeaseMs: taken && held.lease_expires_at ? taken.started_at - held.lease_expires_at : null,
        stale: Object.fromEntries(Object.entries(stale).map(([k, v]) => [k, v.ok ? 'ok' : v.refused])), refusedAudit,
        runs: runs.map((r) => (r.computer_id === A.add.computer_id ? 'A' : 'B') + ':' + r.status + ':' + r.attempt_count + ':' + (r.termination_reason || '-')), wo: wo.status,
        checkpoints: cps.map((k) => k.scenario + '@' + (k.run_id === a.run ? 'A' : 'B')), other: runsQ.map((r) => r.status) }));
    await stopWorker(wA); await stopWorker(wB);
  }

  // ================================================================ TR2: a real lock wait refuses a checkpoint (55P03); the node takes the work back
  {
    await archiveUsed();
    const S = await install('TR2', ENV); await installing(S);
    const P = await W.submit({ title: 'TR2 probe', work_type: 'probe', priority: 90, owned_surface: ['tr2/p'], handoff: JSON.stringify({ steps: 3, step_ms: 2000, salt: 'tr2' }) });
    // another session holds the run's row once its first checkpoint has landed, until the second checkpoint has been refused: that
    // checkpoint waits out the front door's lock_timeout (15 s) and the plane's server raises 55P03. The claim asks a 30 s lease.
    const holder = await connect(W.plane.superUrl);
    const s = { run: null, refusal: null, after: [], locked: false };
    const unlock = async () => { if (s.locked) { s.locked = false; await holder.query('rollback'); } };
    try {
      const link = async (url, init) => {
        const { path, body } = sentOf(url, init);
        if (path === '/v1/node/claim' && body) init = withLease(init, body, 30);
        if (s.refusal && body && body.run_id === s.run) s.after.push(path.replace('/v1/node/', ''));
        if (s.refusal && path === '/v1/node/release' && body && Array.isArray(body.keep_run_ids) && !body.keep_run_ids.includes(s.run)) s.after.push('release(every run but ' + JSON.stringify(body.keep_run_ids) + ')');
        const res = await fetch(url, init);
        if (path === '/v1/node/claim' && !s.run) { const j = await res.clone().json().catch(() => null); if (j && j.claimed) s.run = j.claimed.run_id; }
        if (path === '/v1/node/checkpoint' && body && body.run_id === s.run && !s.refusal) {
          const j = await res.clone().json().catch(() => null);
          if (j && j.ok === false) { s.refusal = { ...j, http: res.status }; await unlock(); }
        }
        return res;
      };
      const w = startWorker(S, { fetchImpl: link });
      const landed = await waitFor(async () => !!s.run && (await sup.query(`select count(*)::int n from factory.checkpoints where run_id = $1`, [s.run])).rows[0].n === 1, 30000, 100);
      if (landed) { await holder.query('begin'); await holder.query('select 1 from factory.agent_runs where run_id = $1 for update', [s.run]); s.locked = true; }
      const refusedAt = await waitFor(() => (s.refusal ? Date.now() : 0), 40000, 100);
      await sleep(3000);
      const held = (await sup.query(`select r.status, r.lease_expires_at > now() live, r.lease_expires_at, w.status ws from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.run_id = $1`, [s.run])).rows[0] || {};
      const done = await waitFor(async () => (await woOf(P)).status === 'done', 90000, 200);
      const runs = await runsOf(P), cps = await checkpointsOf(P), wo = await woOf(P);
      const r1 = runs.find((r) => r.run_id === s.run) || {}, r2 = runs.find((r) => r.run_id !== s.run) || {};
      const step = (n) => cps.filter((k) => k.scenario === n);
      const r = s.refusal || {};
      row('TR2 a checkpoint the plane\'s server refuses - the run\'s row held by another session past the front door\'s 15 s lock_timeout, so the answer is 500 server_refused with sqlstate 55P03 ("nothing changed") - does not fail the run: after it the node sends nothing that names the run, 3 s later the plane still holds it in progress under its lease, and once the lease has lapsed the same node (the only eligible one) takes the work back as a NEW run resumed from the step-1 checkpoint and completes it: one run done, none failed, the first run queued with attempt 2, one checkpoint row per step',
        !!landed && !!refusedAt && r.http === 500 && r.refused === 'server_refused' && r.sqlstate === '55P03' && /55P03/.test(String(r.message)) && s.after.length === 0
          && held.status === 'in_progress' && held.live === true && held.ws === 'claimed'
          && !!done && runs.length === 2 && r1.status === 'queued' && r1.attempt_count === 2 && r1.finished_at === null
          && r2.status === 'done' && r2.computer_id === S.add.computer_id && r2.started_at >= held.lease_expires_at
          && runs.filter((x) => x.status === 'done').length === 1 && !runs.some((x) => x.status === 'failed') && runs.every((x) => x.locks === 0) && wo.status === 'done'
          && cps.length === 3 && step('step-1').length === 1 && step('step-1')[0].run_id === s.run && step('step-2').length === 1 && step('step-2')[0].run_id === r2.run_id
          && step('step-3').length === 1 && step('step-3')[0].run_id === r2.run_id && r2.resumed_from_checkpoint_id === step('step-1')[0].checkpoint_id,
        JSON.stringify({ refusal: { http: r.http, refused: r.refused, sqlstate: r.sqlstate, message: r.message }, sentAfter: s.after, held: { status: held.status, live: held.live, wo: held.ws },
          tookBackAfterLeaseMs: r2.started_at && held.lease_expires_at ? r2.started_at - held.lease_expires_at : null,
          runs: runs.map((x) => x.status + ':' + x.attempt_count + ':' + (x.termination_reason || '-')), wo: wo.status, checkpoints: cps.map((k) => k.scenario + '@' + (k.run_id === s.run ? 'run1' : 'run2')) }));
      await stopWorker(w);
    } finally {
      await unlock().catch(() => {});
      await holder.end().catch(() => {});
    }
  }
} catch (e) {
  row('X0 runtime_recovery_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  for (const w of workers) { try { await stopWorker(w); } catch { /* stopped */ } }
  await W.stop();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nruntime_recovery_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = arg('--evidence');
if (ev) writeFileSync(ev, ['qa/factory/v1/runtime_recovery_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
