// A detached OpenSSH signature (ssh-keygen -Y sign), read and verified without ssh-keygen: format PROTOCOL.sshsig, Ed25519 only.
// The caller supplies the namespace it expects and compares the returned fingerprint with the one IT trusts.
import { createHash, createPublicKey, verify } from 'node:crypto';

const MAGIC = Buffer.from('SSHSIG');
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const BEGIN = '-----BEGIN SSH SIGNATURE-----';
const END = '-----END SSH SIGNATURE-----';

class Reader {
  constructor(buf) { this.buf = buf; this.at = 0; }
  take(n) {
    if (!Number.isInteger(n) || n < 0 || this.at + n > this.buf.length) throw new Error('the signature is truncated');
    const out = this.buf.subarray(this.at, this.at + n); this.at += n; return out;
  }
  string() { return this.take(this.take(4).readUInt32BE(0)); }
  end() { if (this.at !== this.buf.length) throw new Error('the signature has trailing bytes'); }
}

const sshString = (b) => { const len = Buffer.alloc(4); len.writeUInt32BE(b.length); return Buffer.concat([len, b]); };

/** the SHA256:... form ssh-keygen prints for a public key blob */
export const fingerprintOf = (publicKeyBlob) => 'SHA256:' + createHash('sha256').update(publicKeyBlob).digest('base64').replace(/=+$/, '');

function dearmor(file) {
  const text = Buffer.isBuffer(file) ? file.toString('latin1') : String(file);
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 3 || lines[0] !== BEGIN || lines.at(-1) !== END) throw new Error('not an armored SSH signature');
  const b64 = lines.slice(1, -1).join('');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) throw new Error('the signature armor is not base64');
  const raw = Buffer.from(b64, 'base64');
  if (raw.toString('base64') !== b64) throw new Error('the signature armor is not canonical base64');
  return raw;
}

/** parses the armored signature; throws with the reason when it is not a well-formed Ed25519 SSH signature */
export function parseSshSignature(file) {
  const r = new Reader(dearmor(file));
  if (!r.take(6).equals(MAGIC)) throw new Error('not an SSH signature');
  if (r.take(4).readUInt32BE(0) !== 1) throw new Error('an unknown SSH signature version');
  const publicKeyBlob = r.string();
  const namespace = r.string().toString('utf8');
  const reserved = r.string();
  const hashAlgorithm = r.string().toString('utf8');
  const signatureBlob = r.string();
  r.end();
  const k = new Reader(publicKeyBlob);
  const keyType = k.string().toString('utf8');
  if (keyType !== 'ssh-ed25519') throw new Error('the signing key is not Ed25519');
  const publicKey = k.string(); k.end();
  if (publicKey.length !== 32) throw new Error('the signing key is malformed');
  const s = new Reader(signatureBlob);
  if (s.string().toString('utf8') !== 'ssh-ed25519') throw new Error('the signature is not Ed25519');
  const signature = s.string(); s.end();
  if (signature.length !== 64) throw new Error('the signature is malformed');
  if (reserved.length !== 0) throw new Error('the signature carries reserved data');
  if (hashAlgorithm !== 'sha512' && hashAlgorithm !== 'sha256') throw new Error('an unknown hash algorithm');
  return { publicKey, publicKeyBlob, namespace, reserved, hashAlgorithm, signature, fingerprint: fingerprintOf(publicKeyBlob) };
}

/**
 * Verifies `signatureFile` over `message` in `namespace`.
 * Returns { ok: true, fingerprint } - the fingerprint of the key that really signed - or { ok: false, reason }.
 * A good signature proves only that SOME key signed: the caller must compare the fingerprint with the one it trusts.
 */
export function verifySshSignature({ signatureFile, message, namespace }) {
  let sig;
  try { sig = parseSshSignature(signatureFile); } catch (e) { return { ok: false, reason: e.message }; }
  if (sig.namespace !== namespace) return { ok: false, reason: `the signature is for the namespace "${sig.namespace}", not "${namespace}"` };
  const signed = Buffer.concat([MAGIC, sshString(Buffer.from(sig.namespace, 'utf8')), sshString(sig.reserved), sshString(Buffer.from(sig.hashAlgorithm, 'utf8')),
    sshString(createHash(sig.hashAlgorithm).update(message).digest())]);
  let good = false;
  try {
    good = verify(null, signed, createPublicKey({ key: Buffer.concat([ED25519_SPKI, sig.publicKey]), format: 'der', type: 'spki' }), sig.signature);
  } catch { good = false; }
  return good ? { ok: true, fingerprint: sig.fingerprint } : { ok: false, reason: 'the signature does not match the signed file' };
}
