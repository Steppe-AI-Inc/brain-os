// RUNTIME UPGRADE, ADOPT AND ROLL BACK (WO-6; contract §2 Release; AC-5 (i), (j), (m)).
//   upgrade   a release offered to this node (an exe + its manifest) is VERIFIED BEFORE ANY OF IT RUNS, against the trust set pinned
//             in THIS installed runtime and the revocations the API delivered: unsigned, tampered, a revoked key, a revoked release, a
//             key outside the pinned set, a dev key on a production-channel runtime - each refused by name, and the offered bytes are
//             never executed. A version not newer than the running one is refused (a node never downgrades silently) unless it is the
//             release a Factory admin ADOPTED for this computer (the plane says so on the node's heartbeat). And a release that is
//             neither the plane's PUBLISHED release of its channel nor the one ADOPTED for this computer - a superseded release, however
//             new its version number - is refused (release_not_current; AC-5(m)): only an admin adopt moves a node to it.
//   adopt     the worker switches to the adopted release when it is installed here (the previous release is kept for exactly this).
//   take      THE PUBLISHED RELEASE, TAKEN BY THE NODE ITSELF (founder correction 2026-10-03; CR-028): when the plane names a published
//             release of this runtime's channel that is not the one running here, and no Factory admin adopted a release for this
//             computer, the worker fetches that release's installer and signed manifest from the release storage FIXED IN THIS
//             ARTIFACT (never an address the plane, the manifest or the environment names) and offers them to `upgrade` - so what may
//             run is decided exactly as before; only who offers it changed. Nothing is fetched while work runs (the worker asks
//             between claims), and a release that was not taken is not fetched again before TAKE_RETRY_MS.
// ONE GATE FOR EVERY RELEASE SWITCH (S-5; contract §2 Release, §6): gateOffer() is the only path by which an offered release becomes
// current in this home - `upgrade` and `setup` (a first install, a retry, or a setup run on a home that is already enrolled) both go
// through it BEFORE anything of the offered release is copied, recorded, registered or started. adoptIfInstalled below switches only
// to a release that the plane's heartbeat names as adopted for this computer by a Factory admin.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, readJson, writeJson } from './home.mjs';
import { authenticodeImageHash } from './pe-image.mjs';
import { verifyRelease } from './release.mjs';
import { NodeApi, TERMINAL } from './api.mjs';
import { loadKey } from './keys.mjs';
import { registerTasks } from './tasks.mjs';
import { mergeRevocations } from './revocations.mjs';
import { pendingRotation } from './credential.mjs';

const RUNTIME_PHASES = ['AVAILABLE', 'BUSY', 'DRAINING', 'RECOVERING'];
// this artifact's channel and its public release storage, fixed at build time (build-sea.mjs defines __CHANNEL__); none when unbundled
const CHANNEL = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : { channel: null, default_api: null, release_base: null };
export const INSTALLER_FILE = 'BrainFactorySetup.exe';
const RELEASE_MANIFEST_FILE = 'BrainFactorySetup.manifest.json';   // setup.mjs MANIFEST_FILE (setup imports this module)
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024, MAX_MANIFEST_BYTES = 65536;
export const TAKE_RETRY_MS = 15 * 60 * 1000;

/** THE PLANE'S FRESH STATE, through this node's own credential (a heartbeat answers it): the revocations, the release adopted for
 * this computer and the published release of each channel. A release is never installed on a stale list: when the plane cannot
 * answer, the offer is refused (revocation state unknown), and so it is when the answer does not state the published releases
 * (release_state_unavailable). The revocations are MERGED into the node's list, which only grows (revocations.mjs). The heartbeat
 * reports the phase the running runtime last recorded; with none recorded, `idlePhase`. While a credential rotation of this node is
 * pending, nothing is decided here (rotation_pending): the runtime resolves it first (credential.mjs). */
async function freshPlaneState(p, { retries = 1, idlePhase = 'AVAILABLE' } = {}) {
  const cfg = readJson(p.config);
  if (!cfg || !cfg.credential_id) return { ok: false, refused: 'not_enrolled', message: 'this computer is not enrolled' };
  if (pendingRotation(p.home).any) return { ok: false, refused: 'rotation_pending', message: 'a credential rotation of this computer is pending; the runtime resolves it with the stored key (start the runtime and try again)' };
  const k = await loadKey(p.key, cfg.public_key);
  if (!k.ok) return { ok: false, refused: 'no_key', message: k.fix };
  const api = new NodeApi({ api: cfg.api, key: k.key });
  const st = readJson(p.status, {});
  const phase = RUNTIME_PHASES.includes(st.state) ? st.state : idlePhase;
  // a plane that does not answer is asked again (the session's opening included, which op() does not retry), with backoff
  let hb;
  for (let attempt = 0; ; attempt++) {
    hb = await api.op('heartbeat', { phase }, { retries });
    const transient = !hb.ok && (hb.refused === 'unreachable' || hb.refused === 'plane_unavailable' || hb.http === 502 || hb.http === 504);
    if (!transient || attempt >= retries) break;
    await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
  }
  if (!hb.ok && TERMINAL.has(hb.refused)) return { ok: false, refused: hb.refused, message: (hb.message || 'this computer\'s credential is ' + hb.refused) + ' - a Factory admin re-pairs or restores it' };
  if (!hb.ok && hb.refused === 'endpoint_refused') return { ok: false, refused: hb.refused, message: hb.message };
  if (!hb.ok || !hb.revocations) return { ok: false, refused: 'revocations_unavailable', message: 'the plane did not answer the current revocations (' + (hb.refused || hb.http) + '): nothing is installed on a stale list' };
  const revocations = mergeRevocations(p.home, hb.revocations);
  if (!Array.isArray(hb.published_releases)) return { ok: false, refused: 'release_state_unavailable', message: 'the plane did not state its published releases: nothing is installed without knowing whether the offered release is current' };
  return { ok: true, revocations, adopted_release: hb.adopted_release || null, published_releases: hb.published_releases };
}

/**
 * THE PLANE-STATE PART OF THE GATE (pure): may the verified release `v` become current here, given current.json `cur` and the plane's
 * fresh `plane` ({ adopted_release, published_releases })? In order, each refused by name:
 *   downgrade_refused    a version not newer than the installed one, unless the plane names exactly its digest as adopted here
 *   release_not_current  neither the plane's published release of its channel nor the release adopted for this computer (a
 *                        superseded release, whatever its version number: contract §2 Release, AC-5(m))
 * The published and adopted state is used only to refuse: it never adds a key or changes the mode (S-5).
 */
export function releaseGate({ v, cur, plane }) {
  const adopted = !!(plane.adopted_release && plane.adopted_release.digest === v.digest && plane.adopted_release.state !== 'revoked');
  const published = (plane.published_releases || []).some((r) => r && r.channel === v.channel && r.digest === v.digest);
  if (cur && semverCmp(v.version, cur.version) <= 0 && !adopted) {
    return { ok: false, refused: 'downgrade_refused', message: 'the offered ' + v.version + ' is not newer than ' + cur.version + ' (installed here), and the plane has not recorded it as adopted for this node' };
  }
  if (!adopted && !published) {
    return { ok: false, refused: 'release_not_current', message: 'the offered ' + v.version + ' is neither the published release of the ' + v.channel + ' channel nor the release a Factory admin adopted for this computer (a superseded release runs only after an admin adopt)' };
  }
  return { ok: true, adopted, published };
}

/**
 * THE GATE: is this offered release (its manifest and its bytes) allowed to become current in this home? In order, each refused by
 * name: the plane's fresh state (revocations_unavailable, release_state_unavailable, rotation_pending, or the credential's terminal
 * state); the release against the trust set pinned in THIS runtime and the merged revocations (unsigned, key_outside_trust_set,
 * bad_signature, key_revoked, digest_mismatch, release_revoked, ...); then releaseGate - no silent downgrade (downgrade_refused) and no
 * superseded release without an admin adopt (release_not_current). status.json and every other local record are never consulted for
 * the plane's state. The current release offered again is { same: true } (an idempotent reinstall, never a switch).
 * Returns the verified release with `current` (the current.json it was judged against) or the refusal. Writes only revocations.json.
 */
export async function gateOffer({ home, manifest, bytes, retries = 1, idlePhase = 'AVAILABLE' }) {
  const p = paths(home);
  const fresh = await freshPlaneState(p, { retries, idlePhase });
  if (!fresh.ok) return fresh;
  const v = verifyRelease({ manifest, artifact: bytes, revocations: fresh.revocations });
  if (!v.ok) return v;
  const cur = readJson(p.current);
  if (cur && cur.digest === v.digest) return { ...v, same: true, current: cur };
  const g = releaseGate({ v, cur, plane: fresh });
  if (!g.ok) return g;
  return { ...v, same: false, current: cur };
}

/** current.json has not moved since the gate judged the offer against it (a concurrent upgrade or adopt would have moved it) */
export function currentUnchanged(p, judged) {
  const now = readJson(p.current);
  return ((now && now.digest) || null) === ((judged && judged.digest) || null);
}

export function semverCmp(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map(Number), pb = String(b).split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export async function upgrade({ home, artifact, manifest }) {
  const p = paths(home);
  if (!artifact || !manifest) return { ok: false, refused: 'bad_request', message: 'upgrade --artifact <exe> --manifest <manifest.json>' };
  const m = readJson(manifest);
  let bytes;
  try { bytes = readFileSync(artifact); } catch (e) { return { ok: false, refused: 'bad_request', message: 'the artifact cannot be read: ' + e.code }; }
  const v = await gateOffer({ home, manifest: m, bytes });
  if (!v.ok) return v;
  if (v.same) return { ok: true, already: true, version: v.version, digest: v.digest, message: 'release ' + v.version + ' is the one installed and current here: no change' };
  const dir = join(p.runtime, v.version + '-' + v.digest.slice(0, 12));
  const target = join(dir, 'BrainFactory.exe');
  // idempotent: a copy already carrying the verified image hash is kept (it may be the exe of a release this node runs right now - an
  // adopted release offered again - which cannot be overwritten while it runs)
  const present = existsSync(target) && (() => { try { return authenticodeImageHash(readFileSync(target)) === v.digest; } catch { return false; } })();
  if (!present) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(artifact, target);
    if (authenticodeImageHash(readFileSync(target)) !== v.digest) return { ok: false, refused: 'digest_mismatch', message: 'the installed copy changed' };
  }
  writeJson(join(dir, 'manifest.json'), m);
  if (!currentUnchanged(p, v.current)) return { ok: false, refused: 'current_changed', message: 'current.json was rewritten by something else (an adopt or another upgrade) while this upgrade ran, so it switched nothing' };
  const cur = v.current;
  if (cur && cur.dir !== dir) writeJson(p.previous, cur);
  writeJson(p.current, { dir, version: v.version, digest: v.digest, installed_at: new Date().toISOString(), via: 'upgrade' });
  // the logon task follows the current release at once (a reboot before the next worker start runs the new release, never the old one)
  const task = (readJson(p.config) || {}).task;
  const t = task && task.name ? registerTasks({ name: task.name, exe: join(dir, 'BrainFactory.exe'), home: task.home_arg ? home : null }) : null;
  return { ok: true, version: v.version, digest: v.digest, installed: dir, task: t ? (t.ok ? 'the logon task now starts ' + v.version : 'the logon task could not be re-pointed: ' + t.error) : 'no logon task registered for this home',
    note: 'the supervisor hands off to it at its next worker start (verified again then)' };
}

/**
 * TAKE THE PUBLISHED RELEASE (see "take" above). `published`, `adopted`: the heartbeat's answer; `running`: { digest } of this
 * process. Returns null when there is nothing to take (no release storage on this channel, an admin adopt pins this computer, no
 * published release of this channel, or it is the one running); { skipped } inside the retry window; { ok, already } when it is
 * installed here already (current.json names it) and only the switch is left; otherwise upgrade()'s answer, with attempted: true.
 * A fetch that fails is { ok: false, refused: 'release_unavailable' }. The fetched files live only until upgrade() has judged them.
 */
export async function takePublished({ home, published, adopted, running, channel = CHANNEL.channel, releaseBase = CHANNEL.release_base,
  fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  if (!channel || !releaseBase || !Array.isArray(published)) return null;
  if (adopted && adopted.digest && adopted.state !== 'revoked') return null;   // an admin's adopt pins this computer (contract §2 Release)
  const want = published.find((r) => r && r.channel === channel);
  if (!want || typeof want.version !== 'string' || !/^[0-9a-f]{64}$/.test(want.digest || '') || want.digest === (running && running.digest)) return null;
  const p = paths(home);
  const cur = readJson(p.current);
  if (cur && cur.digest === want.digest) return { ok: true, already: true, version: want.version, digest: want.digest, attempted: false };
  const file = join(p.state, 'published-take.json');
  const last = readJson(file, {});
  if (last.digest === want.digest && now() - Date.parse(last.at || 0) < TAKE_RETRY_MS) return { skipped: true, version: want.version };
  const record = (result) => { try { mkdirSync(p.state, { recursive: true }); writeJson(file, { digest: want.digest, version: want.version, at: new Date(now()).toISOString(), result }); } catch { /* it only spaces the retries */ } };
  const base = releaseBase.replace(/\/+$/, '') + '/' + encodeURIComponent(want.version) + '/';
  const dir = join(p.state, 'incoming', want.digest.slice(0, 16));
  const get = async (name, max) => {
    const r = await fetchImpl(base + name, { signal: AbortSignal.timeout(600000) });
    if (r.status !== 200) throw new Error(name + ': HTTP ' + r.status);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > max) throw new Error(name + ' is larger than it can be');
    return b;
  };
  let artifact, manifest;
  try {
    const exe = await get(INSTALLER_FILE, MAX_INSTALLER_BYTES), man = await get(RELEASE_MANIFEST_FILE, MAX_MANIFEST_BYTES);
    mkdirSync(dir, { recursive: true });
    artifact = join(dir, INSTALLER_FILE); manifest = join(dir, RELEASE_MANIFEST_FILE);
    writeFileSync(artifact, exe); writeFileSync(manifest, man);
  } catch (e) {
    record('release_unavailable');
    return { ok: false, attempted: true, refused: 'release_unavailable', version: want.version, message: 'the published release could not be fetched from release storage: ' + ((e && e.message) || e) };
  }
  let r;
  try { r = await upgrade({ home, artifact, manifest }); } finally { rmSync(dir, { recursive: true, force: true }); }
  record(r.ok ? 'installed' : r.refused);
  return { ...r, attempted: true };
}

/** the adopted release, if a Factory admin adopted one that is installed here and it is not the running one: switch to it */
export function adoptIfInstalled(home, adopted, runningDigest) {
  const p = paths(home);
  if (!adopted || !adopted.digest || adopted.digest === runningDigest) return null;
  for (const f of [p.previous, p.current]) {
    const r = readJson(f);
    if (r && r.digest === adopted.digest) {
      const cur = readJson(p.current);
      if (cur && cur.digest !== r.digest) writeJson(p.previous, cur);
      writeJson(p.current, { ...r, adopted_at: new Date().toISOString(), via: 'admin adopt' });
      return r;
    }
  }
  return { missing: true };
}
