// THE NODE KEY (S-2; WO-4 "the installer generates the node key pair locally and never exports the private key"): an Ed25519 key pair
// made on this computer; the private key is stored with DPAPI (CurrentUser) in an owner-only directory by lib/secure-store.mjs and never
// leaves this user profile; only the public key is sent (and stored by the plane).
// DPAPI IS REQUIRED: when it is unavailable here (not the reading user; Windows PowerShell not in FullLanguage mode), storeKey refuses
// with SecureStoreError code 'dpapi_required' and writes nothing. An owner-only ACL alone does not keep the key from an administrator,
// SYSTEM or an offline read of the disk, so a node key is never stored that way. Setup stores the key before it asks for a pairing
// code: without DPAPI it stops while no code has been used and the plane has issued nothing.
// THE KEY FILE IS THE SOURCE OF TRUTH: loadKey derives the public key from the stored private key (config.json's copy is for people
// to read), so a crash between a key write and a config write never pairs a key with another key's public half.
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { generateKeypair } from '../lib/ed25519.mjs';
import { readSecret, writeSecret } from '../lib/secure-store.mjs';

export async function newKey() {
  const k = generateKeypair();
  return { privateKeyDer: k.privateKeyDer, publicKey: Buffer.from(k.publicKeyRaw), privateKey: createPrivateKey({ key: k.privateKeyDer, format: 'der', type: 'pkcs8' }) };
}

/** store the private key, DPAPI-protected or not at all; returns the protection achieved ('dpapi'). `dpapi` passes options to
 *  lib/dpapi.mjs (a test simulates an unavailable DPAPI with it; it can only make DPAPI fail, never skip it). */
export async function storeKey(file, key, { dpapi } = {}) {
  const r = await writeSecret(file, key.privateKeyDer, { requireDpapi: true, ...(dpapi ? { dpapi } : {}) });
  return r.protection;
}

/** the raw 32-byte Ed25519 public key of a private KeyObject */
export function publicKeyOf(privateKey) {
  return Buffer.from(createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32));
}

/**
 * Read a stored node key. -> { ok: true, protection, privateKeyDer, key: { privateKey, publicKey }, mismatch } | { ok: false, code, fix }.
 * The public key is DERIVED from the private key; `expectedPublicKey` (base64url, config.json's copy) is only compared: `mismatch` says
 * the record and the key file disagree (the key file wins).
 */
export async function loadKey(file, expectedPublicKey = null) {
  const r = await readSecret(file);
  if (!r.ok) return { ok: false, code: r.code, fix: r.fix };
  const privateKeyDer = Buffer.from(r.buf);
  const privateKey = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  const publicKey = publicKeyOf(privateKey);
  const mismatch = !!expectedPublicKey && publicKey.toString('base64url') !== expectedPublicKey;
  return { ok: true, protection: r.protection, privateKeyDer, key: { privateKey, publicKey }, mismatch };
}
