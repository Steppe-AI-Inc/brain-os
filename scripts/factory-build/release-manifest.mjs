#!/usr/bin/env node
// RELEASE MANIFESTS (WO-6; S-5): make, sign (dev channel only), attach a signature made elsewhere, print the signing input, verify.
//
//   make    --artifact <exe> --channel production|dev --version <semver> --source-sha <40 hex> --receipt-sha256 <64 hex> --out <file>
//   sign-dev             --manifest <file>        sign with the DEV key (dev channel only; its seed is published, below)
//   signing-input        --manifest <file>        print the exact bytes a key signs (base64) - for a signer outside this tool
//   attach-signature     --manifest <file> --key-id <ed25519:...> --signature <base64url>     (the production path: see below)
//   verify               --manifest <file> --artifact <exe> --channel production|dev
//
// THE PRODUCTION SIGNING INTERFACE (C-3: production release-signing key custody is FOUNDER-GATED and UNRESOLVED). This tool never
// creates, holds or uses a production key and names no custody option. What a production key must satisfy:
//   * algorithm   Ed25519 (RFC 8032), a 32-byte public key;
//   * key id      "ed25519:" + the lowercase hex SHA-256 of the 32-byte public key (bound to the key one-to-one; never shared);
//   * signature   Ed25519 over `signing-input` (the manifest's seven fields as JSON with sorted keys), base64url without padding;
//   * trust       the public key and key id enter scripts/factory-runner/enrolled/trust/production.json only through a Director WO-6
//                 revision after C-3; the next candidate is certified with them (a node trusts only the keys fixed in its artifact);
//   * rotation    a new key is added the same way (a new certified release carries it); a key is retired by a revocation the API
//                 delivers (revoke-key, founder-only) - a revoked key's signatures are refused by every node from its next heartbeat.
//
// THE DEV KEY is derived from a PUBLISHED seed, on purpose: anyone rehearsing on a disposable plane can sign a dev release, and that is
// safe because a production-channel artifact never trusts it (it refuses a dev-key signature by name).
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticodeImageHash } from '../factory-runner/enrolled/pe-image.mjs';
import { canonicalManifestBytes, keyIdOf, verifyRelease } from '../factory-runner/enrolled/release.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEV_SEED_TEXT = 'brain-factory dev release key v1 - PUBLIC seed; disposable planes only; never a live trust root';

export function devKey() {
  const seed = createHash('sha256').update(DEV_SEED_TEXT).digest();
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { privateKey, publicKey: Buffer.from(pub), keyId: keyIdOf(pub) };
}

export function channelTrustFile(channel) { return JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/enrolled/trust', channel + '.json'), 'utf8')); }

export function makeManifest({ artifact, channel, version, source_sha, receipt_sha256 }) {
  if (!['production', 'dev'].includes(channel)) throw new Error('--channel production|dev');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$/.test(version)) throw new Error('--version is semver');
  if (!/^[0-9a-f]{40}$/.test(source_sha)) throw new Error('--source-sha is a 40-hex commit');
  if (!/^[0-9a-f]{64}$/.test(receipt_sha256)) throw new Error('--receipt-sha256 is the sha256 of the certifying receipt');
  return { v: 1, channel, version, source_sha, digest: authenticodeImageHash(readFileSync(artifact)), key_id: null, receipt_sha256, signature: null };
}

export function signDev(m) {
  if (m.channel !== 'dev') throw new Error('the dev key signs dev-channel manifests only');
  const k = devKey();
  const withKey = { ...m, key_id: k.keyId };
  return { ...withKey, signature: sign(null, canonicalManifestBytes(withKey), k.privateKey).toString('base64url') };
}

const isMain = (() => { try { return fileURLToPath(import.meta.url).toLowerCase() === join(process.cwd(), process.argv[1] || '').toLowerCase() || /release-manifest\.mjs$/.test(process.argv[1] || ''); } catch { return false; } })();
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = {}; for (let i = 0; i < rest.length; i += 2) a[rest[i].replace(/^--/, '')] = rest[i + 1];
  try {
    if (cmd === 'make') { writeFileSync(a.out, JSON.stringify(makeManifest({ artifact: a.artifact, channel: a.channel, version: a.version, source_sha: a['source-sha'], receipt_sha256: a['receipt-sha256'] }), null, 2) + '\n'); console.log('manifest written (unsigned): ' + a.out); }
    else if (cmd === 'sign-dev') { const m = JSON.parse(readFileSync(a.manifest, 'utf8')); writeFileSync(a.manifest, JSON.stringify(signDev(m), null, 2) + '\n'); console.log('signed with the DEV key ' + devKey().keyId); }
    else if (cmd === 'signing-input') { const m = JSON.parse(readFileSync(a.manifest, 'utf8')); if (!m.key_id) throw new Error('set key_id first (attach-signature sets it with the signature)'); console.log(canonicalManifestBytes(m).toString('base64')); }
    else if (cmd === 'attach-signature') {
      const m = JSON.parse(readFileSync(a.manifest, 'utf8'));
      if (!/^ed25519:[0-9a-f]{64}$/.test(a['key-id'] || '') || !/^[A-Za-z0-9_-]{86}$/.test(a.signature || '')) throw new Error('--key-id ed25519:<64 hex> --signature <86 base64url>');
      writeFileSync(a.manifest, JSON.stringify({ ...m, key_id: a['key-id'], signature: a.signature }, null, 2) + '\n'); console.log('signature attached (not verified here: verify it)');
    } else if (cmd === 'verify') {
      const v = verifyRelease({ manifest: JSON.parse(readFileSync(a.manifest, 'utf8')), artifact: readFileSync(a.artifact), trust: channelTrustFile(a.channel) });
      console.log(JSON.stringify(v)); process.exitCode = v.ok ? 0 : 3;
    } else { console.log('usage: release-manifest.mjs make | sign-dev | signing-input | attach-signature | verify  (see the header)'); process.exitCode = 2; }
  } catch (e) { console.log('FAILED - ' + e.message); process.exitCode = 1; }
}
