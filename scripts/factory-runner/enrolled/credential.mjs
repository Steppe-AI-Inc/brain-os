// A CREDENTIAL CHANGE WHOSE ANSWER WAS LOST IS RESOLVED WITH THE SAME KEY, NEVER WITH A NEW CODE (contract §9 "partial backend
// failure ... retries with the same credential"; §2 Enrollment "a retry reuses it (no new code)"; §8 rotate; WO-4; P-4; S-2).
// The plane commits a rotation or an enrollment in one transaction, and its reply can still be lost (a network failure, the client's
// timeout, a crash). So the node makes the new key DURABLE and records what it is about to ask BEFORE it asks:
//   rotation    key\node.pending.key (DPAPI) and config.pending_rotation, then credential-rotate
//   enrollment  key\node.key (DPAPI) and config.pending_enrollment { enrollment_id, challenge }, then enroll/complete
// and afterwards asks the plane, with that key, what it holds. Only an answer that PROVES the outcome changes a key file or clears a
// record; every other answer - no answer, a gateway or proxy error, a rate limit, a body without a refusal name - is "unknown", and
// the node keeps both the key and the record and asks again later.
//   PROOF THAT A KEY IS REGISTERED: a session opened with it, or a refusal the session exchange gives only after it found the key's
//   credential (credential_revoked, credential_superseded, computer_archived, assertion_expired, assertion_replayed).
//   PROOF THAT IT IS NOT: unknown_key - final only once no request that could still register it can commit (for a rotation: after
//   the old credential was seen superseded or revoked, since the plane swaps credentials only while the old one is active and holds
//   its row lock while it does).
// The WORKER is the one resolver of a pending rotation (setup and upgrade refuse by name while one is pending, so two processes never
// race a discard against a promotion); SETUP is the one resolver of a pending enrollment.
// config.json is rewritten here only from what was read from it (readConfigForRewrite): when it cannot be read at that instant, a
// rotation is not started (config_unreadable, nothing stored or sent), and a promotion or a discard changes no file and is tried again.
import { existsSync, rmSync } from 'node:fs';
import { NodeApi } from './api.mjs';
import { loadKey, storeKey } from './keys.mjs';
import { paths, readConfigForRewrite, readJson, writeJsonDurable } from './home.mjs';

// refusals the session exchange (part 140) returns only after it found the credential of the presented key
export const KEY_IS_REGISTERED = new Set(['credential_revoked', 'credential_superseded', 'computer_archived', 'assertion_expired', 'assertion_replayed']);

/** is this answer one that proves nothing about whether the call committed? */
export function unknownOutcome(r) {
  if (!r || typeof r !== 'object') return true;
  if (r.ok === true) return false;
  if (typeof r.refused !== 'string' || !r.refused) return true;
  if (!r.http || r.http >= 500 || r.http === 429 || r.http === 408) return true;
  return ['unreachable', 'plane_unavailable', 'bad_response', 'harness_error', 'server_error'].includes(r.refused);
}

/** open a session with `key` (a probe): the plane's answer about that key */
export async function probeKey({ api, key, fetchImpl }) {
  const c = new NodeApi({ api, key, ...(fetchImpl ? { fetchImpl } : {}) });
  const t = await c.time();
  if (!t.ok && unknownOutcome(t)) return { ...t, client: null };
  const s = await c.session();
  return { ...s, client: s.ok ? c : null };
}

const b64u = (b) => Buffer.from(b).toString('base64url');

/** the pending rotation record, and whether a pending key file exists without one */
export function pendingRotation(home) {
  const p = paths(home);
  const cfg = readJson(p.config) || {};
  return { record: cfg.pending_rotation || null, orphanFile: !cfg.pending_rotation && existsSync(p.pendingKey), any: !!cfg.pending_rotation || existsSync(p.pendingKey) };
}

/** make the pending key the node key: node.key, then config.json (no pending record), then the pending file. Each step repeatable.
 *  config.json is read first: when it cannot be read now this throws (config_unreadable) before any file changes. */
export async function promotePending({ home, pk, credentialId, keyIo = { storeKey } }) {
  const p = paths(home);
  const cfg = readConfigForRewrite(p);
  await keyIo.storeKey(p.key, { privateKeyDer: pk.privateKeyDer });
  const next = { ...cfg, public_key: b64u(pk.key.publicKey), rotated_at: new Date().toISOString() };
  if (credentialId) next.credential_id = credentialId;
  delete next.pending_rotation;
  writeJsonDurable(p.config, next);
  rmSync(p.pendingKey, { force: true });
  return next;
}

/** drop a pending rotation that provably never registered: the record, then the file (throws config_unreadable, changing nothing,
 *  when config.json cannot be read now) */
function discardPending(home) {
  const p = paths(home);
  const cfg = readConfigForRewrite(p);
  if (cfg.pending_rotation) { const next = { ...cfg }; delete next.pending_rotation; writeJsonDurable(p.config, next); }
  rmSync(p.pendingKey, { force: true });
}

/**
 * Resolve a pending rotation. `api` is the live client of the CURRENT (old) key. Returns
 *   { state: 'none' }                        nothing was pending
 *   { state: 'promoted', key, credentialId } the pending key is the node key now (files written); the caller switches its client
 *   { state: 'discarded', why }              the pending key provably never registered and can never register now; files dropped
 *   { state: 'unknown', why }                nothing proves the outcome yet: key and record kept, asked again later
 */
export async function resolvePendingRotation({ home, api, fetchImpl, log = () => {}, keyIo = { loadKey, storeKey }, rounds = 3 }) {
  const p = paths(home);
  const cfg = readJson(p.config);
  if (!cfg) return existsSync(p.pendingKey) ? { state: 'unknown', why: 'config.json cannot be read now; the pending key is kept' } : { state: 'none' };
  if (!cfg.pending_rotation && !existsSync(p.pendingKey)) return { state: 'none' };
  // a discard proven final changes files only when config.json can be read now; otherwise nothing changes and it is asked again later
  const discard = (why, message) => {
    try { discardPending(home); } catch (e) { return { state: 'unknown', why: why + '; the pending rotation could not be dropped yet (' + ((e && e.code) || 'error') + ')' }; }
    log(message);
    return { state: 'discarded', why };
  };
  if (!existsSync(p.pendingKey)) {
    // a record without its key file: the key was stored before the record was written, so something removed it. The rotation can
    // have committed only if the old credential is no longer active - then nothing can be recovered here (the node is refused by name).
    const old = await probeKey({ api: cfg.api, key: api.key, fetchImpl });
    if (old.ok) return discard('pending key file missing; current credential active', 'a pending rotation had no key file and the current credential is active: the record is dropped');
    return { state: 'unknown', why: 'pending key file missing; the current credential answers ' + (old.refused || old.http) };
  }
  const pk = await keyIo.loadKey(p.pendingKey);
  if (!pk.ok) return { state: 'unknown', why: 'the pending key cannot be read now (' + (pk.code || pk.fix) + '); it is kept' };
  const promote = async (credentialId, how) => {
    try { await promotePending({ home, pk, credentialId, keyIo }); } catch (e) {
      // registered, but not yet saved as the node key: the record and the pending file stay; the caller may use the key in memory
      return { state: 'unknown', registered: true, key: pk.key, credentialId: credentialId || null,
        why: 'the new key is registered (' + how + ') but could not be saved as the node key yet (' + ((e && e.code) || 'error') + ')' };
    }
    log('credential rotation resolved (' + how + '): the new key is the node key');
    return { state: 'promoted', key: pk.key, credentialId: credentialId || null };
  };
  let oldInactive = false;
  for (let round = 0; round < rounds; round++) {
    const s = await probeKey({ api: cfg.api, key: pk.key, fetchImpl });
    if (s.ok) return promote(s.credential_id, 'a session opens with the new key');
    if (KEY_IS_REGISTERED.has(s.refused)) return promote(null, 'the new key holds a credential that is ' + s.refused);
    if (s.refused !== 'unknown_key' || s.http !== 401) return { state: 'unknown', why: 'the probe of the new key answered ' + (s.refused || s.http || 'nothing') };
    // the new key holds no credential at this instant
    if (oldInactive) return discard('not registered; the old credential is no longer active', 'rotation not registered and the old credential is no longer active: the pending key is dropped');
    // ask again, with the SAME key, through the OLD credential: the plane locks the old credential row while it swaps, so this
    // request is ordered with any earlier one still in flight
    const r = await api.rotate(pk.key);
    if (r.ok) return promote(r.credential_id, 'the rotation was asked again with the same key');
    if (r.refused === 'credential_superseded' || r.refused === 'credential_revoked' || r.refused === 'computer_archived' || r.refused === 'key_reused') {
      oldInactive = r.refused !== 'key_reused';
      continue; // probe again: from here on the probe's answer is final
    }
    if (!unknownOutcome(r) && ['enrollment_not_alive', 'bad_request'].includes(r.refused)) {
      return discard(r.refused, 'rotation refused by name (' + r.refused + ') while the old credential is active: nothing was issued; the pending key is dropped');
    }
    return { state: 'unknown', why: 'the repeated rotation answered ' + (r.refused || r.http || 'nothing') };
  }
  return { state: 'unknown', why: 'no final answer after ' + rounds + ' rounds' };
}

/** start a rotation: the new key and the record are durable BEFORE the request. Returns { sent: false, why } when nothing was sent. */
export async function beginRotation({ home, keyIo, newKey }) {
  const p = paths(home);
  let cfg;
  try { cfg = readConfigForRewrite(p); } catch (e) { return { sent: false, refused: 'config_unreadable', why: 'config.json cannot be read now, so the rotation cannot be recorded; nothing was stored' }; }
  const nk = await newKey();
  try { await keyIo.storeKey(p.pendingKey, nk); } catch (e) { return { sent: false, refused: (e && e.code) || 'key_store_failed', why: 'the new key cannot be stored with DPAPI' }; }
  try {
    writeJsonDurable(p.config, { ...cfg, pending_rotation: { public_key: b64u(nk.publicKey), started_at: new Date().toISOString() } });
  } catch (e) {
    rmSync(p.pendingKey, { force: true });
    return { sent: false, refused: 'config_write_failed', why: 'the pending rotation could not be recorded (' + ((e && e.code) || 'error') + ')' };
  }
  return { sent: true, nk };
}
