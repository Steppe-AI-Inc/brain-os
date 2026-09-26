// THE NODE KEY (S-2; WO-4 "the installer generates the node key pair locally and never exports the private key"): an Ed25519 key pair
// made on this computer; the private key is stored with DPAPI (CurrentUser) in an owner-only directory by lib/secure-store.mjs and never
// leaves this user profile; only the public key is sent (and stored by the plane).
import { createPrivateKey } from 'node:crypto';
import { generateKeypair } from '../lib/ed25519.mjs';
import { readSecret, writeSecret } from '../lib/secure-store.mjs';

export async function newKey() {
  const k = generateKeypair();
  return { privateKeyDer: k.privateKeyDer, publicKey: Buffer.from(k.publicKeyRaw), privateKey: createPrivateKey({ key: k.privateKeyDer, format: 'der', type: 'pkcs8' }) };
}

/** store the private key; returns the protection actually achieved ('dpapi' | 'acl_only') */
export async function storeKey(file, key) {
  const r = await writeSecret(file, key.privateKeyDer);
  return r.protection;
}

export async function loadKey(file, publicKey) {
  const r = await readSecret(file);
  if (!r.ok) return { ok: false, fix: r.fix };
  const privateKey = createPrivateKey({ key: r.buf, format: 'der', type: 'pkcs8' });
  return { ok: true, protection: r.protection, key: { privateKey, publicKey: Buffer.from(publicKey, 'base64url') } };
}
