// ed25519.mjs — Ed25519 device-key primitives on node:crypto only.
//
// MECHANISM ONLY. This module signs and verifies BYTES. It deliberately knows nothing about what is signed:
// no assertion/JWS layout, no signed-message prefix, no pairing code, no credential schema. Those belong to
// the Director contract; a caller builds the exact byte string the contract defines and hands it here.
//
// Key representations:
//   public key  : the 32 raw bytes of RFC 8032 (what WebCrypto importKey('raw', …, 'Ed25519') takes).
//   private key : PKCS#8 DER (48 bytes for Ed25519, the form node:crypto and WebCrypto 'pkcs8' both use).
//
// Every function validates its inputs and fails loudly on programmer error (wrong type, wrong key kind).
// verify() is the exception on purpose: its signature and message are attacker-controlled input, so a
// malformed signature is a `false`, never a throw.
import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync,
  sign as nodeSign, verify as nodeVerify,
} from 'node:crypto';

// Fixed DER prefixes for Ed25519 (RFC 8410). Both are exact: an Ed25519 SPKI is always these 12 bytes followed
// by the 32-byte key, and an Ed25519 PKCS#8 (v1, no attributes, no public key) is always these 16 bytes
// followed by the 32-byte seed.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export const PUBLIC_KEY_BYTES = 32;
export const SEED_BYTES = 32;
export const SIGNATURE_BYTES = 64;

function asBuffer(v, name) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  throw new TypeError(name + ' must be a Buffer or Uint8Array');
}

function privateKeyObject(privateKeyDer) {
  const der = asBuffer(privateKeyDer, 'privateKeyDer');
  let key;
  try {
    key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    // Never echo the key bytes in an error.
    throw new TypeError('privateKeyDer is not a parseable PKCS#8 DER private key');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('privateKeyDer is a ' + key.asymmetricKeyType + ' key, not ed25519');
  }
  return key;
}

function rawFromSpki(spkiDer) {
  if (spkiDer.length !== SPKI_PREFIX.length + PUBLIC_KEY_BYTES
    || !spkiDer.subarray(0, SPKI_PREFIX.length).equals(SPKI_PREFIX)) {
    throw new Error('unexpected Ed25519 SPKI encoding from node:crypto');
  }
  return Buffer.from(spkiDer.subarray(SPKI_PREFIX.length));
}

/** A fresh Ed25519 keypair: { publicKeyRaw: Buffer(32), privateKeyDer: Buffer (PKCS#8 DER) }. */
export function generateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKeyRaw: rawFromSpki(publicKey), privateKeyDer: Buffer.from(privateKey) };
}

/** PKCS#8 DER for a 32-byte RFC 8032 seed (the "secret key" of the RFC test vectors). */
export function privateKeyDerFromSeed(seed) {
  const s = asBuffer(seed, 'seed');
  if (s.length !== SEED_BYTES) throw new RangeError('an Ed25519 seed is ' + SEED_BYTES + ' bytes');
  const der = Buffer.concat([PKCS8_PREFIX, s]);
  privateKeyObject(der); // prove node:crypto accepts it
  return der;
}

/** The 32 raw public-key bytes for a PKCS#8 DER Ed25519 private key. */
export function publicKeyFromPrivate(privateKeyDer) {
  const pub = createPublicKey(privateKeyObject(privateKeyDer));
  return rawFromSpki(pub.export({ type: 'spki', format: 'der' }));
}

/** Sign `bytes` (pure Ed25519, no pre-hash, no context). Returns the 64-byte signature. */
export function sign(privateKeyDer, bytes) {
  const msg = asBuffer(bytes, 'bytes');
  const sig = nodeSign(null, msg, privateKeyObject(privateKeyDer));
  if (sig.length !== SIGNATURE_BYTES) throw new Error('node:crypto returned a ' + sig.length + '-byte Ed25519 signature');
  return sig;
}

/**
 * true only when `sig` is a valid Ed25519 signature of `bytes` under the raw public key.
 * Malformed key or signature (wrong length, not a point, S out of range) is `false`, not an exception.
 */
export function verify(publicKeyRaw, bytes, sig) {
  const pub = asBuffer(publicKeyRaw, 'publicKeyRaw');
  const msg = asBuffer(bytes, 'bytes');
  const s = asBuffer(sig, 'sig');
  if (pub.length !== PUBLIC_KEY_BYTES || s.length !== SIGNATURE_BYTES) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, pub]), format: 'der', type: 'spki' });
    return nodeVerify(null, msg, key, s) === true;
  } catch {
    return false;
  }
}

/**
 * base64url( SHA-256( the 32 raw public-key bytes ) ), unpadded.
 * NOTE: this is a hash of the RAW key bytes. It is NOT an RFC 7638 JWK thumbprint (which hashes a canonical
 * JSON object). Which identifier the enrollment contract uses is the Director's decision, not this module's.
 */
export function sha256Thumbprint(publicKeyRaw) {
  const pub = asBuffer(publicKeyRaw, 'publicKeyRaw');
  if (pub.length !== PUBLIC_KEY_BYTES) throw new RangeError('an Ed25519 public key is ' + PUBLIC_KEY_BYTES + ' raw bytes');
  return base64urlEncode(createHash('sha256').update(pub).digest());
}

// ---- base64url (RFC 4648 §5), strict ------------------------------------------------------------------------

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

/** Unpadded base64url. */
export function base64urlEncode(bytes) {
  return asBuffer(bytes, 'bytes').toString('base64url');
}

/**
 * Strict unpadded base64url decode. Throws on: a non-string, padding ('='), any character outside
 * [A-Za-z0-9_-] (including '+', '/', whitespace), an impossible length (len % 4 === 1), and non-canonical
 * encodings whose unused trailing bits are not zero (two strings must never decode to the same bytes).
 * Buffer.from(s, 'base64url') alone accepts all of these silently, which is why it is not used bare.
 */
export function base64urlDecode(str) {
  if (typeof str !== 'string') throw new TypeError('base64url input must be a string');
  if (!B64URL_RE.test(str)) throw new TypeError('base64url input contains padding or a character outside [A-Za-z0-9_-]');
  if (str.length % 4 === 1) throw new TypeError('base64url input has an impossible length');
  const out = Buffer.from(str, 'base64url');
  if (out.toString('base64url') !== str) throw new TypeError('base64url input is not canonical (non-zero trailing bits)');
  return out;
}
