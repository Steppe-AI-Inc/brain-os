// RELEASE VERIFICATION (WO-6; S-5; AC-5). A node executes an artifact only after its manifest's signature, key id and digest verify,
// BEFORE execution, against the TRUST SET PINNED IN THE ARTIFACT THE NODE INSTALLED - never a key named by a manifest or received from
// the API. The trust set and the trust mode are fixed in the artifact at build time, per channel (esbuild defines __TRUST__); nothing
// received at runtime - an API answer, the plane's identity or URL, pairing, the manifest, the environment, a configuration file -
// adds a key or changes the mode. The API may deliver REVOCATIONS only (revoked key ids, revoked release digests).
//
// THE MANIFEST: { v: 1, channel, version, source_sha, digest, key_id, receipt_sha256, signature }. `digest` is the SHA-256 PE
// Authenticode image hash of the artifact (pe-image.mjs). `signature` is Ed25519 (base64url) by `key_id` over canonicalManifestBytes -
// the other seven fields as JSON with sorted keys. key_id = "ed25519:" + sha256(public key) hex: bound to the key one-to-one.
//
// REFUSALS, by name, in this order: malformed, unsigned, channel_mismatch, dev_key_on_production_channel, key_outside_trust_set,
// bad_signature, key_revoked, digest_mismatch, release_revoked. A refused artifact is never executed.
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { authenticodeImageHash } from './pe-image.mjs';

// fixed at build time (esbuild define); absent in an unbundled run, where nothing is trusted
const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;
// the dev key ids, known to every build so a production-channel artifact can NAME a dev signature it refuses (never to trust it)
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
 * @param revocations { key_ids: [], releases: [{digest}] } - what the API delivered (revocations only)
 */
export function verifyRelease({ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations = { key_ids: [], releases: [] } }) {
  const refuse = (refused, message) => ({ ok: false, refused, message });
  if (!trust || !Array.isArray(trust.keys) || !trust.channel || !trust.mode) return refuse('no_trust_set', 'this runtime carries no trust set: it is not a built release artifact');
  const m = manifest;
  if (!m || typeof m !== 'object' || m.v !== 1 || typeof m.channel !== 'string' || !/^[0-9a-f]{64}$/.test(String(m.digest))
      || !/^[0-9a-f]{40}$/.test(String(m.source_sha)) || typeof m.version !== 'string' || !/^[0-9a-f]{64}$/.test(String(m.receipt_sha256))) {
    return refuse('malformed', 'the manifest is not {v:1, channel, version, source_sha, digest, key_id, receipt_sha256, signature}');
  }
  if (!m.signature || !m.key_id) return refuse('unsigned', 'the release is not signed');
  if (m.channel !== trust.channel) return refuse('channel_mismatch', 'a ' + m.channel + ' release offered to a ' + trust.channel + '-channel runtime');
  const k = trust.keys.find((x) => x.key_id === m.key_id);
  if (!k) {
    if (trust.mode === 'production' && KNOWN_DEV_KEY_IDS.includes(m.key_id)) return refuse('dev_key_on_production_channel', 'a production-channel runtime refuses a dev-key signature');
    return refuse('key_outside_trust_set', 'the signing key ' + String(m.key_id).slice(0, 24) + '... is not in this runtime\'s pinned trust set');
  }
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
