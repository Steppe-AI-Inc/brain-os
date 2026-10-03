#!/usr/bin/env node
// THE RELEASE GATE IN ONE PROCESS - DEVELOPER VERIFICATION (S-5; B-5; L4-F1). Plain node on Windows: no database and no build. A stub
// Factory Node API on 127.0.0.1 answers the node's calls, and the rows call gateOffer, upgrade and runSetup directly. The unbundled
// runtime carries no trust set, so before any runtime module is loaded this suite defines __TRUST__ as the dev channel's committed
// trust set (scripts/factory-runner/enrolled/trust/dev.json, the value build-sea compiles into a dev artifact); manifests are signed
// with the published dev key. The offered "release" is a copy of a small Windows system executable: its PE image hash is all the gate
// reads, and it is never run.
//   GA1 the adopted release is taken from the plane's fresh answer and from nothing else: with status.json naming the offered older
//       release as adopted and the plane naming none, the gate refuses downgrade_refused; with the plane naming it, the gate passes
//   GA2 a plane that fails for a while is asked again, the session's opening included: two 502 answers to POST /v1/session and then
//       an answer - the gate passes on the third session request (retries 3); a plane that keeps failing - revocations_unavailable
//       after exactly retries + 1 session requests (retries 1)
//   GA3 current.json rewritten by someone else after the gate judged the offer and before the switch: `upgrade` answers
//       current_changed, and current.json holds what the other writer put there, with no previous.json written
//   GA4 the same in setup on an enrolled home: exit 3 with a named current_changed refusal, current.json as the other writer left it,
//       no previous.json
//   GA5 a release that is newer than the installed one but neither the plane's published release of its channel nor the one adopted
//       for this computer (superseded) is refused release_not_current before anything is copied (AC-5(m)); the published release of
//       ANOTHER channel does not count; published in its channel, or adopted (even superseded), it passes; a heartbeat answer that
//       does not state the published releases refuses release_state_unavailable
//   GA6 while a credential rotation of this home is pending, the gate decides nothing (rotation_pending) and sends no request
//   GA7 THE PUBLISHED RELEASE, TAKEN BY THE NODE (founder correction 2026-10-03; CR-028): the plane names a published release of this
//       channel that is not the one running; takePublished fetches its installer and signed manifest from the release storage it is
//       given (the artifact's own, in a built runtime), and the ONE gate installs it (current.json names it, previous.json the old one);
//       the fetched copies are removed
//   GA8 what is NOT taken: an admin adopt pins the computer, another channel's release, the release already running, no release
//       storage on the channel - nothing fetched; installer bytes that are not the manifest's (refused by the gate, nothing switched),
//       and storage that does not serve the release (release_unavailable) - each recorded and not fetched again inside the retry
//       window, and fetched again after it
//   GA9 the worker: one cycle with a published release of its channel that is not running fetches it, installs it through the gate and
//       exits SWITCH_RELEASE (4) - the supervisor's restart path - with nothing claimed; under an admin adopt the cycle takes nothing
// usage: node qa/factory/v1/gate_acceptance.mjs
import { createServer } from 'node:http';
import fs, { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = (p) => join(ROOT, ...p.split('/'));
const imp = (p) => import(pathToFileURL(R(p)).href);
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail && !ok ? ' - ' + String(detail).slice(0, 1500) : '')); };
const work = mkdtempSync(join(tmpdir(), 'bf-gate-'));

// the dev channel's trust set, defined BEFORE release.mjs (imported by everything below) is first evaluated
globalThis.__TRUST__ = JSON.parse(readFileSync(R('scripts/factory-runner/enrolled/trust/dev.json'), 'utf8'));
const { gateOffer, upgrade, takePublished, TAKE_RETRY_MS } = await imp('scripts/factory-runner/enrolled/upgrade.mjs');
const { runWorker, EXIT_WORKER } = await imp('scripts/factory-runner/enrolled/worker.mjs');
const { runSetup } = await imp('scripts/factory-runner/enrolled/setup.mjs');
const { paths, readJson, writeJson } = await imp('scripts/factory-runner/enrolled/home.mjs');
const { newKey, storeKey } = await imp('scripts/factory-runner/enrolled/keys.mjs');
const { makeManifest, signDev } = await imp('scripts/factory-build/release-manifest.mjs');

// ---- the stub plane
const plane = { sessionFailures: 0, adopted: null, published: [], statePublished: true, requests: [], storage: new Map(), claims: 0 };
const server = createServer((q, r) => {
  let body = ''; q.on('data', (d) => { body += d; });
  q.on('end', () => {
    const raw = new URL(q.url, 'http://stub').pathname;
    if (raw.startsWith('/releases/')) {   // the stand-in release storage (public, GET only)
      plane.requests.push('STORAGE ' + q.method + ' ' + raw);
      const b = q.method === 'GET' ? plane.storage.get(raw) : null;
      if (!b) { r.writeHead(404, { 'content-type': 'application/json' }); return r.end('{"error":"not_found"}'); }
      r.writeHead(200, { 'content-type': 'application/octet-stream' }); return r.end(b);
    }
    const path = raw.replace(/^.*\/v1\//, '/v1/');
    plane.requests.push(q.method + ' ' + path);
    const send = (status, j) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(j)); };
    if (path === '/v1/node/register') return send(200, { ok: true, node_id: 'node-stub', enrollment_state: 'ALIVE', release: { current: true }, envelope: { version: 1 }, revocations: { key_ids: [], releases: [] } });
    if (path === '/v1/node/release') return send(200, { ok: true, released: 0 });
    if (path === '/v1/node/claim') { plane.claims++; return send(200, { ok: true, claimed: null, server_time: new Date().toISOString() }); }
    if (path === '/v1/time') return send(200, { ok: true, server_time: new Date().toISOString(), protocol: 1 });
    if (path === '/v1/session') {
      if (plane.sessionFailures > 0) { plane.sessionFailures--; return send(502, { ok: false, refused: 'plane_unavailable', message: 'stub: not answering yet' }); }
      return send(200, { ok: true, session_token: 'stub-session-' + plane.requests.length, expires_in: 300 });
    }
    if (path === '/v1/node/heartbeat') return send(200, { ok: true, phase: 'AVAILABLE', release_current: true, revocations: { key_ids: [], releases: [] }, adopted_release: plane.adopted,
      ...(plane.statePublished ? { published_releases: plane.published } : {}) });
    if (path === '/v1/node/report-state') return send(200, { ok: true });
    return send(404, { ok: false, refused: 'not_found' });
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const API = 'http://127.0.0.1:' + server.address().port + '/functions/v1/factory-node-api';
const STORE = 'http://127.0.0.1:' + server.address().port + '/releases';
const storageGets = () => plane.requests.filter((x) => x.startsWith('STORAGE GET')).length;
const sessions = () => plane.requests.filter((x) => x === 'POST /v1/session').length;

// ---- an enrolled home (a DPAPI-stored key and the config setup writes), and a signed offer
async function enrolledHome(name) {
  const home = join(work, name); mkdirSync(home, { recursive: true });
  const key = await newKey();
  await storeKey(join(home, 'key', 'node.key'), key);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ api: API, channel: 'dev', node_id: 'node-stub', principal_id: 'p', computer_id: 'c', credential_id: 'cred-stub',
    public_key: key.publicKey.toString('base64url'), key_protection: 'dpapi', computer: 'Stub PC', tenant: 'operator' }, null, 2));
  return { home, p: paths(home) };
}
const ART = join(work, 'offered', 'BrainFactorySetup.exe');
mkdirSync(dirname(ART)); copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), ART);
const BYTES = readFileSync(ART);
const SRC = createHash('sha1').update('gate_acceptance').digest('hex');
const offer = (version) => signDev(makeManifest({ artifact: ART, channel: 'dev', version, source_sha: SRC, receipt_sha256: createHash('sha256').update('receipt ' + version).digest('hex') }));
// the offered bytes are the same in every row (one image hash): the plane publishes that digest in the dev channel unless a row says otherwise
const PUBLISHED = [{ release_id: 'stub-published', channel: 'dev', version: '0.1.0', digest: offer('0.1.0').digest }];
plane.published = PUBLISHED;
const installed = (home, version, ch) => ({ dir: join(home, 'runtime', version + '-' + ch.repeat(12)), version, digest: ch.repeat(64), installed_at: '2026-01-01T00:00:00.000Z', via: 'setup' });

/** run fn while the next copyFileSync (the gated release copy) is followed by `after` - a writer that moves current.json in between */
async function withCopyHook(after, fn) {
  const original = fs.copyFileSync;
  let fired = 0;
  fs.copyFileSync = function hooked(...a) { const r = original.apply(this, a); fired++; after(); return r; };
  syncBuiltinESMExports();
  try { return { value: await fn(), fired }; } finally { fs.copyFileSync = original; syncBuiltinESMExports(); }
}

try {
  // ---- GA1: the adopted release comes from the plane's fresh answer only
  {
    const { home, p } = await enrolledHome('ga1');
    writeJson(p.current, installed(home, '0.2.0', 'e'));
    const M = offer('0.1.0');
    writeJson(p.status, { state: 'AVAILABLE', adopted_release: { release_id: 'local-record', version: '0.1.0', digest: M.digest } });
    plane.adopted = null;
    const local = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.adopted = { release_id: 'plane-record', version: '0.1.0', digest: M.digest, state: 'published' };
    const fresh = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.adopted = null;
    row('GA1 an older release named as adopted only in status.json is refused downgrade_refused; the same release named as adopted in the plane\'s fresh heartbeat answer passes the gate',
      local.ok === false && local.refused === 'downgrade_refused' && fresh.ok === true && fresh.same === false && fresh.digest === M.digest,
      JSON.stringify({ local: local.ok ? 'passed' : local.refused, fresh: fresh.ok ? 'passed' : fresh.refused }));
  }

  // ---- GA2: a plane that does not answer is asked again, the session's opening included
  {
    const { home } = await enrolledHome('ga2');
    const M = offer('0.1.0');
    plane.sessionFailures = 2; const s0 = sessions();
    const passed = await gateOffer({ home, manifest: M, bytes: BYTES, retries: 3 });
    const tried = sessions() - s0;
    plane.sessionFailures = Number.POSITIVE_INFINITY; const s1 = sessions();
    const gaveUp = await gateOffer({ home, manifest: M, bytes: BYTES, retries: 1 });
    const triedOut = sessions() - s1;
    plane.sessionFailures = 0;
    row('GA2 the gate asks a failing plane again, session opening included: after two 502 answers the third session request succeeds and the gate passes (retries 3); a plane that keeps failing gets exactly retries + 1 session requests and then revocations_unavailable',
      passed.ok === true && tried === 3 && gaveUp.ok === false && gaveUp.refused === 'revocations_unavailable' && triedOut === 2,
      JSON.stringify({ passed: passed.ok ? 'passed' : passed.refused, tried, gaveUp: gaveUp.ok ? 'passed' : gaveUp.refused, triedOut }));
  }

  // ---- GA3: upgrade notices a current.json moved between the gate and the switch
  {
    const { home, p } = await enrolledHome('ga3');
    writeJson(p.current, installed(home, '0.0.9', 'a'));
    const mf = join(work, 'ga3-manifest.json'); writeFileSync(mf, JSON.stringify(offer('0.1.0')));
    const other = installed(home, '0.3.0', 'c');
    const r = await withCopyHook(() => writeJson(p.current, other), () => upgrade({ home, artifact: ART, manifest: mf }));
    row('GA3 when current.json is rewritten between the gate and the switch, upgrade answers current_changed: current.json keeps the other writer\'s record and no previous.json is written',
      r.fired === 1 && r.value.ok === false && r.value.refused === 'current_changed' && JSON.stringify(readJson(p.current)) === JSON.stringify(other) && !existsSync(p.previous),
      JSON.stringify({ fired: r.fired, answer: r.value.ok ? 'switched' : r.value.refused, current: (readJson(p.current) || {}).version, previous: existsSync(p.previous) }));
  }

  // ---- GA4: the same in setup on an enrolled home
  {
    const { home, p } = await enrolledHome('ga4');
    writeJson(p.current, installed(home, '0.0.9', 'a'));
    const mf = join(work, 'ga4-manifest.json'); writeFileSync(mf, JSON.stringify(offer('0.1.0')));
    const other = installed(home, '0.3.0', 'c');
    const said = [];
    const r = await withCopyHook(() => writeJson(p.current, other), () => runSetup({ home, exe: ART, manifest: mf, noTasks: true, noStart: true, out: (s) => said.push(String(s)) }));
    row('GA4 when current.json is rewritten while setup installs on an enrolled home, setup exits 3 with a named current_changed refusal: current.json keeps the other writer\'s record and no previous.json is written',
      r.fired === 1 && r.value === 3 && said.some((s) => /^REFUSED - current_changed/.test(s)) && JSON.stringify(readJson(p.current)) === JSON.stringify(other) && !existsSync(p.previous),
      JSON.stringify({ fired: r.fired, exit: r.value, last: said.slice(-1)[0], current: (readJson(p.current) || {}).version, previous: existsSync(p.previous) }));
  }

  // ---- GA5: the plane's published / adopted state decides whether a newer release may become current (AC-5(m))
  {
    const { home, p } = await enrolledHome('ga5');
    const cur = installed(home, '0.0.9', 'a');
    writeJson(p.current, cur);
    const M = offer('0.1.0');
    const mf = join(work, 'ga5-manifest.json'); writeFileSync(mf, JSON.stringify(M));
    const out = {};
    plane.published = []; plane.adopted = null;
    out.superseded = await gateOffer({ home, manifest: M, bytes: BYTES });
    out.upgrade = await upgrade({ home, artifact: ART, manifest: mf });
    const untouched = JSON.stringify(readJson(p.current)) === JSON.stringify(cur) && !existsSync(join(home, 'runtime', '0.1.0-' + M.digest.slice(0, 12))) && !existsSync(p.previous);
    plane.published = [{ release_id: 'other-channel', channel: 'production', version: '0.1.0', digest: M.digest }];
    out.otherChannel = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.published = [{ release_id: 'published', channel: 'dev', version: '0.1.0', digest: M.digest }];
    out.published = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.published = []; plane.adopted = { release_id: 'adopted', version: '0.1.0', digest: M.digest, state: 'superseded' };
    out.adopted = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.adopted = null; plane.statePublished = false;
    out.unstated = await gateOffer({ home, manifest: M, bytes: BYTES });
    plane.statePublished = true; plane.published = PUBLISHED;
    const n = (r) => (r.ok ? 'passed' : r.refused);
    row('GA5 a newer release that is neither published in its channel nor adopted here (superseded) is refused release_not_current, and upgrade copies and switches nothing; another channel\'s published release does not count; published in its channel, or adopted even though superseded, it passes; an answer without the published releases refuses release_state_unavailable',
      out.superseded.refused === 'release_not_current' && out.upgrade.ok === false && out.upgrade.refused === 'release_not_current' && untouched
        && out.otherChannel.refused === 'release_not_current' && out.published.ok === true && out.adopted.ok === true && out.unstated.refused === 'release_state_unavailable',
      JSON.stringify({ ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, n(v)])), untouched }));
  }

  // ---- GA6: a pending rotation is the runtime's to resolve; the gate decides nothing meanwhile
  {
    const { home, p } = await enrolledHome('ga6');
    writeJson(p.config, { ...readJson(p.config), pending_rotation: { public_key: 'x', started_at: '2026-01-01T00:00:00.000Z' } });
    const before = plane.requests.length;
    const r = await gateOffer({ home, manifest: offer('0.1.0'), bytes: BYTES });
    row('GA6 while a credential rotation of this home is pending, the gate refuses rotation_pending and sends nothing',
      r.ok === false && r.refused === 'rotation_pending' && plane.requests.length === before, JSON.stringify({ r: r.ok ? 'passed' : r.refused, sent: plane.requests.length - before }));
  }
  // ---- GA7 / GA8 / GA9: the published release, taken by the node itself (CR-028)
  const M2 = offer('0.2.0');
  const serve = (version, exe, manifest) => { plane.storage.clear(); plane.storage.set('/releases/' + version + '/BrainFactorySetup.exe', exe); plane.storage.set('/releases/' + version + '/BrainFactorySetup.manifest.json', Buffer.from(JSON.stringify(manifest))); };
  const PUB2 = [{ release_id: 'published-0.2.0', channel: 'dev', version: '0.2.0', digest: M2.digest }];
  const RUNNING = { digest: 'a'.repeat(64) };
  {
    const { home, p } = await enrolledHome('ga7');
    const cur = installed(home, '0.0.9', 'a'); writeJson(p.current, cur);
    plane.published = PUB2; plane.adopted = null; serve('0.2.0', BYTES, M2);
    const g0 = storageGets();
    const r = await takePublished({ home, published: PUB2, adopted: null, running: RUNNING, channel: 'dev', releaseBase: STORE });
    const now = readJson(p.current) || {};
    row('GA7 a published release of this channel that is not the one running is fetched from release storage (installer and signed manifest, once each) and installed through the one gate: current.json names it (via upgrade), previous.json the release it replaced, and the fetched copies are gone',
      r && r.ok === true && r.attempted === true && now.digest === M2.digest && now.version === '0.2.0' && now.via === 'upgrade' && (readJson(p.previous) || {}).digest === cur.digest
        && storageGets() - g0 === 2 && !existsSync(join(home, 'state', 'incoming', M2.digest.slice(0, 16))),
      JSON.stringify({ r: r && (r.ok ? 'installed' : r.refused), current: now.version, gets: storageGets() - g0 }));
  }
  {
    const { home, p } = await enrolledHome('ga8');
    const cur = installed(home, '0.0.9', 'a'); writeJson(p.current, cur);
    plane.published = PUB2; plane.adopted = null; serve('0.2.0', BYTES, M2);
    const g0 = storageGets();
    const none = {
      adopt: await takePublished({ home, published: PUB2, adopted: { release_id: 'x', version: '0.0.9', digest: cur.digest, state: 'superseded' }, running: RUNNING, channel: 'dev', releaseBase: STORE }),
      otherChannel: await takePublished({ home, published: [{ ...PUB2[0], channel: 'production' }], adopted: null, running: RUNNING, channel: 'dev', releaseBase: STORE }),
      running: await takePublished({ home, published: PUB2, adopted: null, running: { digest: M2.digest }, channel: 'dev', releaseBase: STORE }),
      noStorage: await takePublished({ home, published: PUB2, adopted: null, running: RUNNING, channel: 'dev', releaseBase: null }),
    };
    const fetchedForNone = storageGets() - g0;
    // installer bytes that are not the manifest's: another system executable under the same name
    serve('0.2.0', readFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'hostname.exe')), M2);
    let t = Date.now();
    const clock = () => t;
    const wrong = await takePublished({ home, published: PUB2, adopted: null, running: RUNNING, channel: 'dev', releaseBase: STORE, now: clock });
    const unchanged = JSON.stringify(readJson(p.current)) === JSON.stringify(cur);
    const g1 = storageGets();
    const again = await takePublished({ home, published: PUB2, adopted: null, running: RUNNING, channel: 'dev', releaseBase: STORE, now: clock });
    const refetchedInWindow = storageGets() - g1;
    plane.storage.clear();
    t += TAKE_RETRY_MS + 1000;
    const missing = await takePublished({ home, published: PUB2, adopted: null, running: RUNNING, channel: 'dev', releaseBase: STORE, now: clock });
    row('GA8 nothing is fetched under an admin adopt, for another channel\'s release, for the release already running, or without release storage; installer bytes that are not the manifest\'s are refused by the gate (nothing switched), the refusal is recorded and nothing is fetched again inside the retry window; after it the release is fetched again, and storage that does not serve it is release_unavailable',
      Object.values(none).every((x) => x === null) && fetchedForNone === 0 && wrong && wrong.ok === false && wrong.attempted === true && wrong.refused === 'digest_mismatch' && unchanged
        && again && again.skipped === true && refetchedInWindow === 0 && missing && missing.ok === false && missing.refused === 'release_unavailable',
      JSON.stringify({ none, fetchedForNone, wrong: wrong && (wrong.refused || 'taken'), unchanged, again, refetchedInWindow, missing: missing && missing.refused }));
  }
  {
    const { home, p } = await enrolledHome('ga9');
    writeJson(p.current, installed(home, '0.0.9', 'a'));
    plane.published = PUB2; plane.adopted = null; serve('0.2.0', BYTES, M2);
    const c0 = plane.claims;
    const runtime = { version: '0.0.9', digest: RUNNING.digest, channel: 'dev', release_base: STORE };
    const exit = await runWorker({ home, runtime, once: true, pollMs: 50 });
    const claimed = plane.claims - c0;
    const now = readJson(p.current) || {};
    const st = readJson(p.status, {});
    const { home: home2, p: p2 } = await enrolledHome('ga9-pinned');
    writeJson(p2.current, installed(home2, '0.0.9', 'a'));
    plane.adopted = { release_id: 'adopted-0.0.9', version: '0.0.9', digest: RUNNING.digest, state: 'superseded' };
    const g0 = storageGets();
    const exitPinned = await runWorker({ home: home2, runtime, once: true, pollMs: 50 });
    const pinnedGets = storageGets() - g0;
    plane.adopted = null;
    row('GA9 one worker cycle with a published release of its channel that is not running takes it - fetched, installed through the gate - and exits SWITCH_RELEASE (4) with nothing claimed, saying SWITCHING; under an admin adopt the cycle fetches nothing and ends normally',
      exit === EXIT_WORKER.SWITCH_RELEASE && now.digest === M2.digest && st.state === 'SWITCHING' && claimed === 0 && exitPinned === EXIT_WORKER.STOPPED && pinnedGets === 0 && (readJson(p2.current) || {}).version === '0.0.9',
      JSON.stringify({ exit, current: now.version, state: st.state, claimed, exitPinned, pinnedGets }));
  }
  plane.published = PUBLISHED; plane.storage.clear();
} catch (e) {
  row('X0 gate suite', false, e && e.stack || e);
} finally {
  server.closeAllConnections();
  await new Promise((ok) => server.close(ok));
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\ngate_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
