// RELEASE VERIFICATION (WO-6; S-5; AC-5). A node executes an artifact only after its manifest's signature, key id and digest verify,
// BEFORE execution, against the TRUST SET PINNED IN THE ARTIFACT THE NODE INSTALLED - never a key named by a manifest or received from
// the API. The trust set and the trust mode are fixed in the artifact at build time, per channel (esbuild defines __TRUST__); nothing
// received at runtime - an API answer, the plane's identity or URL, pairing, the manifest, the environment, a configuration file -
// adds a key or changes the mode. The API may deliver REVOCATIONS only (revoked key ids, revoked release digests).
// CHANNEL SEPARATION (S-5) IS HELD BY THE ARTIFACT: a live node runs a production-channel artifact, and that artifact refuses every
// dev-key signature by name (below), whatever its trust set holds; build-sea refuses to build a production trust set that holds a dev
// key, or a dev trust set that holds anything else. The plane records releases of either channel: no SQL object or Edge handler asks
// which plane it is (S-10, whose scope - with the VERIFICATION_SPEC §3.4 r3 plane-conditioned scan - is the SQL, the Edge handlers and
// the founder steps, not this runtime). The runtime does not ask either: a dev-channel artifact accepts any https endpoint, so keeping
// dev artifacts and dev releases off the live plane also rests on the founder's procedure. Whether a runtime-side refusal is wanted is
// a Director question (CR-020); the r3 behaviour is kept meanwhile.
//
// THE MANIFEST: { v: 1, channel, version, source_sha, digest, key_id, receipt_sha256, signature }. `digest` is the SHA-256 PE
// Authenticode image hash of the artifact (pe-image.mjs). `signature` is Ed25519 (base64url) by `key_id` over canonicalManifestBytes -
// the other seven fields as JSON with sorted keys. key_id = "ed25519:" + sha256(public key) hex: bound to the key one-to-one.
//
// REFUSALS, by name, in this order: malformed, unsigned, channel_mismatch, dev_key_on_production_channel, key_outside_trust_set,
// bad_signature, key_revoked, digest_mismatch, release_revoked. A refused artifact is never executed.
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { authenticodeImageHash } from './pe-image.mjs';

// fixed at build time (esbuild define); absent in an unbundled run, where nothing is trusted. This module reads no environment
// variable, no file, no network answer and loads no module dynamically: the trust set it verifies against is this constant, or one a
// build tool passes (no runtime caller passes one; release_trust_unit U4 checks both)
const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;
// the dev key ids, known to every build: a runtime that is not dev-mode refuses a signature by one of them by name, before its trust set
// is consulted; build-sea refuses a production trust set that holds one and a dev trust set that holds anything else. It must equal
// trust/dev.json's key ids and release-manifest.mjs devKey() (release_trust_unit U3 checks the three agree).
export const KNOWN_DEV_KEY_IDS = Object.freeze(['ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6']);

export function embeddedTrust() { return EMBEDDED_TRUST; }

export const keyIdOf = (publicKeyRaw) => 'ed25519:' + createHash('sha256').update(publicKeyRaw).digest('hex');

const MANIFEST_FIELDS = ['v', 'channel', 'version', 'source_sha', 'digest', 'key_id', 'receipt_sha256'];
export function canonicalManifestBytes(m) {
  const o = {};
  for (const k of [...MANIFEST_FIELDS].sort()) o[k] = m[k];
  return Buffer.from(JSON.stringify(o), 'utf8');
}

function edPublicKey(raw) {
  return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
}

/** The trust set as (key_id, sha256 of the public key) entries, with the channel and mode - what a receipt reads back. */
export function trustReadback(trust = EMBEDDED_TRUST) {
  if (!trust) return null;
  return { channel: trust.channel, mode: trust.mode, keys: trust.keys.map((k) => ({ key_id: k.key_id,
    public_key_sha256: createHash('sha256').update(Buffer.from(k.public_key, 'base64url')).digest('hex') })) };
}

/**
 * Verify a release before anything from it executes.
 * @param manifest   the parsed manifest
 * @param artifact   the artifact's bytes (a Buffer), or null to check the manifest alone
 * @param trust      the PINNED trust set (the installed artifact's embedded one); a caller never passes one taken from elsewhere
 * @param revocations { key_ids: [], releases: [{digest}] } - what the API delivered (revocations only). REQUIRED: a caller names the
 *                    list it checks against, or NO_REVOCATIONS with its reason - an omitted list is never read as "nothing revoked".
 */
export const NO_REVOCATIONS = Object.freeze({ key_ids: Object.freeze([]), releases: Object.freeze([]) });
export function verifyRelease({ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations }) {
  if (!revocations || typeof revocations !== 'object') throw new TypeError('verifyRelease: revocations are required (pass the delivered list, or NO_REVOCATIONS with the reason)');
  const refuse = (refused, message) => ({ ok: false, refused, message });
  if (!trust || !Array.isArray(trust.keys) || !trust.channel || !trust.mode) return refuse('no_trust_set', 'this runtime carries no trust set: it is not a built release artifact');
  const m = manifest;
  if (!m || typeof m !== 'object' || m.v !== 1 || typeof m.channel !== 'string' || !/^[0-9a-f]{64}$/.test(String(m.digest))
      || !/^[0-9a-f]{40}$/.test(String(m.source_sha)) || typeof m.version !== 'string' || !/^[0-9a-f]{64}$/.test(String(m.receipt_sha256))) {
    return refuse('malformed', 'the manifest is not {v:1, channel, version, source_sha, digest, key_id, receipt_sha256, signature}');
  }
  if (!m.signature || !m.key_id) return refuse('unsigned', 'the release is not signed');
  if (m.channel !== trust.channel) return refuse('channel_mismatch', 'a ' + m.channel + ' release offered to a ' + trust.channel + '-channel runtime');
  // S-5: a runtime whose trust mode is not dev refuses a dev-key signature by name WHATEVER its trust set holds - the check comes
  // before the lookup, so a dev entry that reached a production trust set still verifies nothing (build-sea also refuses to build one)
  if (trust.mode !== 'dev' && KNOWN_DEV_KEY_IDS.includes(m.key_id)) return refuse('dev_key_on_production_channel', 'a production-channel runtime refuses a dev-key signature');
  const k = trust.keys.find((x) => x.key_id === m.key_id);
  if (!k) return refuse('key_outside_trust_set', 'the signing key ' + String(m.key_id).slice(0, 24) + '... is not in this runtime\'s pinned trust set');
  const raw = Buffer.from(k.public_key, 'base64url');
  if (raw.length !== 32 || keyIdOf(raw) !== k.key_id) return refuse('key_outside_trust_set', 'the pinned entry is not bound to its key id');
  let sigOk = false;
  try { const sig = Buffer.from(String(m.signature), 'base64url'); sigOk = sig.length === 64 && edVerify(null, canonicalManifestBytes(m), edPublicKey(raw), sig); } catch { sigOk = false; }
  if (!sigOk) return refuse('bad_signature', 'the manifest signature does not verify (the manifest was changed or signed by another key)');
  if ((revocations.key_ids || []).includes(m.key_id)) return refuse('key_revoked', 'the signing key is revoked');
  if (artifact) {
    let d;
    try { d = authenticodeImageHash(artifact); } catch (e) { return refuse('digest_mismatch', 'the artifact is not a PE image: ' + e.message); }
    if (d !== m.digest) return refuse('digest_mismatch', 'the artifact is not the one the manifest signs (image hash ' + d.slice(0, 12) + '..., manifest ' + m.digest.slice(0, 12) + '...)');
  }
  if ((revocations.releases || []).some((r) => r && r.digest === m.digest)) return refuse('release_revoked', 'this release is revoked');
  return { ok: true, channel: trust.channel, version: m.version, digest: m.digest, key_id: m.key_id };
}
