#!/usr/bin/env node
// RUNTIME_CRYPTO_REGRESSION — the device-key primitives a node runtime will hold a key with, measured on THIS PC.
//
//   scripts/factory-runner/lib/ed25519.mjs       sign / verify / keys / thumbprint / strict base64url
//   scripts/factory-runner/lib/dpapi.mjs         Windows DPAPI (CurrentUser) through PowerShell over stdin
//   scripts/factory-runner/lib/secure-store.mjs  one secret per file: owner-only directory, DPAPI or acl_only
//
// MECHANISM ONLY. Nothing here encodes a protocol: no assertion layout, no pairing code, no credential schema —
// those are the Director contract's. What is proven is that the primitives do what they claim, and fail the way
// they claim, on a real Windows user profile, with real DPAPI, real icacls, real WebCrypto.
//
// EVIDENCE DISCIPLINE. Every ACL claim is checked by this file INDEPENDENTLY of the module under test: it runs
// icacls itself and parses the SDDL itself, and cross-checks with the human-readable icacls listing. The
// event-log leak check carries a POSITIVE CONTROL: it first proves the event log does record script text on
// this machine; if it cannot prove that, the leak check is reported SKIPPED, never passed.
//
// Disposable resources only: temporary directories under os.tmpdir(), removed at the end. No network. Nothing
// under ~/.brain-factory is read or written.
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '../../scripts/factory-runner/lib');
const ed = await import(pathToFileURL(path.join(LIB, 'ed25519.mjs')).href);
const dp = await import(pathToFileURL(path.join(LIB, 'dpapi.mjs')).href);
const ss = await import(pathToFileURL(path.join(LIB, 'secure-store.mjs')).href);

let pass = 0;
const failures = [];
const skips = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); } else {
    failures.push(name);
    console.log('FAIL ' + name + (detail ? NL + '       ' + String(detail).slice(0, 600) : ''));
  }
};
const skip = (name, why) => { skips.push(name); console.log('SKIP ' + name + NL + '       ' + why); };
// A check whose expression THROWS is a failure of that check, not the end of the run.
const noThrow = (fn) => { try { return fn(); } catch (e) { return false; } };
// …and anything that escapes anyway still ends with the counted final line.
const crashed = (e) => {
  failures.push('CRASH ' + (e && e.name || 'error'));
  console.log('FAIL the regression crashed: ' + (e && e.stack || e));
  console.log('runtime_crypto_regression: ' + pass + ' passed, ' + failures.length + ' failed');
  process.exit(1);
};
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);
const throwsLike = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(String(e && e.message)) : true; } };
const hex = (b) => Buffer.from(b).toString('hex');
// Every textual form a leaked secret could take.
const encodings = (b) => [hex(b), Buffer.from(b).toString('base64'), Buffer.from(b).toString('base64url')];
const leaks = (text, b) => encodings(b).some((e) => String(text).includes(e)) || Buffer.from(String(text), 'latin1').includes(Buffer.from(b));

const WIN = process.platform === 'win32';
const SYS32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const PS = path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// =============================================================================================================
// ED25519
// =============================================================================================================
console.log('--- ed25519 ---');
{
  const kp = ed.generateKeypair();
  check('E1 generateKeypair: 32-byte raw public key, PKCS#8 DER private key, and the private key derives the same public key',
    Buffer.isBuffer(kp.publicKeyRaw) && kp.publicKeyRaw.length === 32 && Buffer.isBuffer(kp.privateKeyDer)
    && kp.privateKeyDer.length === 48 && kp.privateKeyDer.subarray(0, 16).equals(Buffer.from('302e020100300506032b657004220420', 'hex'))
    && ed.publicKeyFromPrivate(kp.privateKeyDer).equals(kp.publicKeyRaw));

  const msg = randomBytes(100);
  const sig = ed.sign(kp.privateKeyDer, msg);
  const flipped = Buffer.from(msg); flipped[7] ^= 1;
  const badSig = Buffer.from(sig); badSig[10] ^= 1;
  const other = ed.generateKeypair();
  check('E2 sign/verify: 64-byte signature verifies; a 1-bit change to message or signature, or another key, does not',
    sig.length === 64 && ed.verify(kp.publicKeyRaw, msg, sig) === true && ed.verify(kp.publicKeyRaw, flipped, sig) === false
    && ed.verify(kp.publicKeyRaw, msg, badSig) === false && ed.verify(other.publicKeyRaw, msg, sig) === false);

  // Signature malleability: S' = S + L is the same point equation but a non-canonical scalar. RFC 8032 §5.1.7
  // requires rejecting it; a verifier that accepts it lets one signature be re-encoded into a "new" one.
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  const leToBig = (b) => b.reduceRight((acc, x) => (acc << 8n) + BigInt(x), 0n);
  const bigToLe = (n, len) => { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; } return out; };
  const malleated = Buffer.concat([sig.subarray(0, 32), bigToLe(leToBig(sig.subarray(32)) + L, 32)]);
  check('E3 verify rejects a malleated signature (S + L, non-canonical scalar)', ed.verify(kp.publicKeyRaw, msg, malleated) === false);

  const totalCases = [
    ['63-byte signature', () => ed.verify(kp.publicKeyRaw, msg, sig.subarray(0, 63))],
    ['65-byte signature', () => ed.verify(kp.publicKeyRaw, msg, Buffer.concat([sig, Buffer.alloc(1)]))],
    ['empty signature', () => ed.verify(kp.publicKeyRaw, msg, Buffer.alloc(0))],
    ['31-byte key', () => ed.verify(kp.publicKeyRaw.subarray(0, 31), msg, sig)],
    ['33-byte key', () => ed.verify(Buffer.concat([kp.publicKeyRaw, Buffer.alloc(1)]), msg, sig)],
    ['0xff key (y >= p)', () => ed.verify(Buffer.alloc(32, 0xff), msg, sig)],
    ['all-zero signature', () => ed.verify(kp.publicKeyRaw, msg, Buffer.alloc(64))],
  ];
  const notFalse = totalCases.filter(([, f]) => noThrow(() => f() === false) !== true).map(([n]) => n);
  check('E4 verify is total on attacker-controlled input: wrong-length / malformed signatures and keys are false, never exceptions',
    notFalse.length === 0, 'threw or returned non-false: ' + notFalse.join(', '));

  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'der' }, publicKeyEncoding: { type: 'spki', format: 'der' } });
  const garbage = randomBytes(48);
  let garbageMsg = '';
  try { ed.sign(garbage, msg); } catch (e) { garbageMsg = String(e.message); }
  check('E5 sign refuses a non-Ed25519 key (P-256) and garbage by name, without echoing key bytes; non-bytes are a TypeError',
    throwsLike(() => ed.sign(ec.privateKey, msg), /not ed25519/) && garbageMsg.length > 0 && !leaks(garbageMsg, garbage)
    && throwsLike(() => ed.sign(kp.privateKeyDer, 'a string'), /Buffer/) && throwsLike(() => ed.verify('x', msg, sig), /Buffer/));

  // RFC 8032 §7.1 TEST 1 (empty message) — the task's bit-exact bar — and TEST 2 (one byte).
  const vectors = [
    ['TEST 1', '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '',
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'],
    ['TEST 2', '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', '72',
      '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'],
  ];
  for (const [name, seedHex, pubHex, msgHex, sigHex] of vectors) {
    const der = ed.privateKeyDerFromSeed(Buffer.from(seedHex, 'hex'));
    const pub = ed.publicKeyFromPrivate(der);
    const s = ed.sign(der, Buffer.from(msgHex, 'hex'));
    check('E6 RFC 8032 ' + name + ': the seed derives the published public key, signs to the published signature bit-exactly, and it verifies',
      hex(pub) === pubHex && hex(s) === sigHex && ed.verify(Buffer.from(pubHex, 'hex'), Buffer.from(msgHex, 'hex'), Buffer.from(sigHex, 'hex')),
      'pub ' + hex(pub) + NL + '       sig ' + hex(s));
  }

  // WebCrypto interop, both directions, positives AND negatives.
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) {
    check('E7 WebCrypto is available (globalThis.crypto.subtle)', false);
  } else {
    const wcPub = await subtle.importKey('raw', kp.publicKeyRaw, { name: 'Ed25519' }, false, ['verify']);
    const okWc = await subtle.verify('Ed25519', wcPub, sig, msg);
    const badWc = await subtle.verify('Ed25519', wcPub, badSig, msg);
    const malWc = await subtle.verify('Ed25519', wcPub, malleated, msg);
    check('E7 node-signed signature verifies under WebCrypto (importKey raw, Ed25519); WebCrypto agrees on the tampered and malleated ones',
      okWc === true && badWc === false && malWc === false);

    const wkp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const wRaw = Buffer.from(await subtle.exportKey('raw', wkp.publicKey));
    const wPkcs8 = Buffer.from(await subtle.exportKey('pkcs8', wkp.privateKey));
    const wSig = Buffer.from(await subtle.sign('Ed25519', wkp.privateKey, msg));
    const oursWithTheirKey = ed.sign(wPkcs8, msg);
    check('E8 WebCrypto-signed verifies here; a WebCrypto-exported PKCS#8 key signs here to the SAME bytes (Ed25519 is deterministic) and derives the same public key',
      ed.verify(wRaw, msg, wSig) === true && oursWithTheirKey.equals(wSig) && ed.publicKeyFromPrivate(wPkcs8).equals(wRaw));

    const wImportedPriv = await subtle.importKey('pkcs8', kp.privateKeyDer, { name: 'Ed25519' }, false, ['sign']);
    const wSig2 = Buffer.from(await subtle.sign('Ed25519', wImportedPriv, msg));
    check('E9 our PKCS#8 private key imports into WebCrypto and signs to the same bytes as node:crypto', wSig2.equals(sig));

    const tp = ed.sha256Thumbprint(kp.publicKeyRaw);
    const wcDigest = Buffer.from(await subtle.digest('SHA-256', kp.publicKeyRaw)).toString('base64url');
    check('E10 sha256Thumbprint = base64url(SHA-256(raw public key)), unpadded, 43 chars, decodes strictly to 32 bytes (checked against WebCrypto digest)',
      tp === wcDigest && tp.length === 43 && ed.base64urlDecode(tp).length === 32
      && ed.sha256Thumbprint(Buffer.from(vectors[0][2], 'hex')) === createHash('sha256').update(Buffer.from(vectors[0][2], 'hex')).digest('base64url')
      && throwsLike(() => ed.sha256Thumbprint(randomBytes(31)), /32/));
  }

  // base64url strictness
  let roundTrips = true;
  for (let n = 0; n <= 70; n++) {
    const b = randomBytes(n);
    const s = ed.base64urlEncode(b);
    if (!/^[A-Za-z0-9_-]*$/.test(s) || !ed.base64urlDecode(s).equals(b)) roundTrips = false;
  }
  check('E11 base64url round-trips every length 0..70 with no padding and only [A-Za-z0-9_-]', roundTrips);
  const rejected = ['AA==', 'AAA=', 'A+B/', 'ab/c', 'AB C', 'ABC' + NL, ' ABC', 'A', 'ABCDE', 'AB', 'AAB', 'Zg=', 'ÄBCD', '\u0000AAA'];
  const accepted = [['', ''], ['AA', '00'], ['AAA', '0000'], ['_-8', 'ffef'], ['Zm9v', '666f6f']];
  const notRejected = rejected.filter((s) => !throwsLike(() => ed.base64urlDecode(s)));
  const notAccepted = accepted.filter(([s, h]) => { try { return hex(ed.base64urlDecode(s)) !== h; } catch { return true; } });
  check('E12 base64urlDecode is strict: rejects padding, +/, whitespace/newline, impossible length, non-canonical trailing bits, non-ASCII, non-strings',
    notRejected.length === 0 && notAccepted.length === 0 && throwsLike(() => ed.base64urlDecode(null)) && throwsLike(() => ed.base64urlDecode(Buffer.from('AA'))),
    'not rejected: ' + JSON.stringify(notRejected) + ' not accepted: ' + JSON.stringify(notAccepted));
  check('E13 (control) Buffer.from(…, "base64url") alone accepts what E12 rejects — the reason the strict decoder exists',
    ['AA==', 'A+B/', 'AB C', 'AB'].every((s) => { try { Buffer.from(s, 'base64url'); return true; } catch { return false; } }));

  // Small-order public keys (review 2026-09-26). Under a key of order 1/2/4/8, a signature (R = torsion point, S = 0)
  // satisfies the cofactorless equation for a large share of ALL messages unless the verifier screens such keys.
  // The 8 encodings are proven torsion points HERE, with independent BigInt edwards25519 arithmetic ([8]P = O), so
  // the check cannot pass on a wrong constant; they match libsodium's published small-order blocklist.
  const TORSION = ['0100000000000000000000000000000000000000000000000000000000000000', 'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    '0000000000000000000000000000000000000000000000000000000000000000', '0000000000000000000000000000000000000000000000000000000000000080',
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85', 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05'];
  const P = (1n << 255n) - 19n;
  const md = (a) => ((a % P) + P) % P;
  const pw = (b, e) => { let r = 1n; b = md(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; };
  const D = md(-121665n * pw(121666n, P - 2n));
  const SQRTM1 = pw(2n, (P - 1n) / 4n);
  const decodePoint = (hx) => {
    const b = Buffer.from(hx, 'hex'); const sign = b[31] >> 7; b[31] &= 0x7f;
    const y = leToBig(b); if (y >= P) return null;
    const x2 = md((y * y - 1n) * pw(D * y * y + 1n, P - 2n));
    let x = pw(x2, (P + 3n) / 8n); if (md(x * x - x2) !== 0n) x = x * SQRTM1 % P; if (md(x * x - x2) !== 0n) return null;
    if (Number(x & 1n) !== sign) x = md(-x);
    return [x, y];
  };
  const padd = ([x1, y1], [x2, y2]) => { const t = D * x1 % P * x2 % P * y1 % P * y2 % P; return [md((x1 * y2 + x2 * y1) * pw(1n + t, P - 2n)), md((y1 * y2 + x1 * x2) * pw(1n - t, P - 2n))]; };
  const isTorsion = (hx) => { let Q = decodePoint(hx); if (!Q) return false; for (let i = 0; i < 3; i++) Q = padd(Q, Q); return Q[0] === 0n && Q[1] === 1n; };
  const provenTorsion = TORSION.filter(isTorsion).length;
  let forged = 0;
  let tried = 0;
  for (const A of TORSION) for (const R of TORSION) for (let k = 0; k < 3; k++) {
    tried++;
    if (noThrow(() => ed.verify(Buffer.from(A, 'hex'), randomBytes(24), Buffer.concat([Buffer.from(R, 'hex'), Buffer.alloc(32)])))) forged++;
  }
  check('E14 verify rejects forgeries under all 8 small-order public keys (each proven [8]P = O here): ' + tried + ' (A, R = torsion, S = 0) signatures over random messages, none accepted',
    provenTorsion === 8 && forged === 0, 'proven torsion ' + provenTorsion + '/8; forgeries accepted ' + forged + '/' + tried);
}

if (!WIN) {
  skip('DPAPI and secure-store sections', 'this is ' + process.platform + '; they are Windows mechanisms');
  finish();
}

// =============================================================================================================
// DPAPI
// =============================================================================================================
console.log('--- dpapi ---');
const testStart = new Date(Date.now() - 2000);
const secret = randomBytes(32);
const entropy = randomBytes(16);
let blob = null;
let unprotectedB64 = null;
{
  const st = await dp.selfTest();
  check('D1 selfTest on this PC: round-trip, and the same blob refused under other entropy', st.ok === true, JSON.stringify(st));

  const p = await dp.protect(secret, { entropy });
  blob = p.ok ? p.buf : null;
  const u = p.ok ? await dp.unprotect(p.buf, { entropy }) : { ok: false };
  if (u.ok) unprotectedB64 = u.buf.toString('base64');
  check('D2 DPAPI round-trip with entropy: blob differs from and does not contain the plaintext; unprotect returns it exactly',
    p.ok && u.ok && !p.buf.includes(secret) && u.buf.equals(secret) && p.payloadSent === true, JSON.stringify({ p: p.reason, u: u.reason }));

  const p0 = await dp.protect(secret);
  const u0 = p0.ok ? await dp.unprotect(p0.buf) : { ok: false };
  const u0e = p0.ok ? await dp.unprotect(p0.buf, { entropy }) : { ok: true };
  check('D3 DPAPI round-trip without entropy; that blob is refused when entropy IS given', p0.ok && u0.ok && u0.buf.equals(secret) && !u0e.ok);

  const wrong = blob ? await dp.unprotect(blob, { entropy: randomBytes(16) }) : { ok: true };
  const none = blob ? await dp.unprotect(blob) : { ok: true };
  check('D4 wrong entropy -> unprotect fails (DPAPI refused, a CryptographicException); missing entropy -> fails; neither throws',
    !wrong.ok && wrong.dpapiRefused === true && /Cryptographic/.test(wrong.reason) && !none.ok && none.dpapiRefused === true,
    JSON.stringify({ wrong, none }));

  // Review 2026-09-26: the first version flipped bytes 0, 20, middle and last only — which skips exactly the 16
  // bytes (offsets 4..19, the provider GUID) DPAPI does NOT authenticate (a full per-byte map measured: 262 of 278
  // refused, 16 accepted with the IDENTICAL plaintext, 0 with a different one). The property checked now is the
  // true one: no flip anywhere yields a DIFFERENT plaintext, and every flip outside 4..19 is refused.
  const GUID_LO = 4;
  const GUID_HI = 19;
  const positions = blob ? [0, 1, 3, ...Array.from({ length: GUID_HI - GUID_LO + 1 }, (_, k) => GUID_LO + k), 20, 24, 40, 60, 100,
    Math.floor(blob.length / 2), blob.length - 2, blob.length - 1] : [];
  const tamperResults = new Array(positions.length);
  let nextPos = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (nextPos < positions.length) {
      const k = nextPos++;
      const t = Buffer.from(blob); t[positions[k]] ^= 0x01;
      tamperResults[k] = await dp.unprotect(t, { entropy });
    }
  }));
  const truncated = blob ? await dp.unprotect(blob.subarray(0, blob.length - 1), { entropy }) : { ok: true };
  const inGuid = (i) => i >= GUID_LO && i <= GUID_HI;
  const otherPlaintext = positions.filter((i, k) => tamperResults[k].ok && !tamperResults[k].buf.equals(secret));
  const outsideAccepted = positions.filter((i, k) => !inGuid(i) && !(tamperResults[k].ok === false && tamperResults[k].dpapiRefused === true));
  const guidSame = positions.filter((i, k) => inGuid(i) && tamperResults[k].ok).length;
  check('D5 a tampered blob never yields a different plaintext: ' + positions.length + ' single-bit flips (all 16 provider-GUID bytes 4..19 included) — '
    + 'every flip outside 4..19 and a truncated blob are refused by DPAPI; ' + guidSame + ' of 16 GUID-byte flips returned the IDENTICAL plaintext (DPAPI does not authenticate them)',
    blob !== null && Array.from({ length: 16 }, (_, k) => GUID_LO + k).every((i) => positions.includes(i)) && tamperResults.every(Boolean)
    && otherPlaintext.length === 0 && outsideAccepted.length === 0 && !truncated.ok && truncated.dpapiRefused === true,
    JSON.stringify({ otherPlaintext, outsideAccepted, truncated: truncated.ok }));

  const shown = u.ok ? JSON.stringify(u) + util.inspect(u) : '';
  check('D6 an unprotect result does not print its plaintext: buf is non-enumerable (JSON.stringify and util.inspect omit it)',
    u.ok && !leaks(shown, secret) && !/Buffer/.test(shown) && Object.keys(u).indexOf('buf') === -1,
    'printed form leaks the plaintext: ' + (u.ok && leaks(shown, secret)) + '; enumerable keys: ' + (u.ok ? Object.keys(u).join(',') : '-'));

  const reasons = [wrong.reason, none.reason, ...tamperResults.map((r) => r.reason), truncated.reason].join(NL);
  check('D7 no failure reason carries the plaintext or the entropy', !leaks(reasons, secret) && !leaks(reasons, entropy) && reasons.length > 0);

  // THE FALLBACK PATHS: unavailable DPAPI must be a result, not an exception, and the payload must not leave node.
  const missing = await dp.protect(secret, { powershellPath: path.join(os.tmpdir(), 'no-such-dir-' + hex(randomBytes(4)), 'powershell.exe') });
  const notPs = await dp.protect(secret, { powershellPath: process.execPath });
  const clm = await dp.protect(secret, { entropy, _simulateConstrainedLanguage: true });
  const clmSelf = await dp.selfTest({ _simulateConstrainedLanguage: true });
  check('D8 PowerShell missing -> { ok:false, unavailable, reason }, payload never sent', !missing.ok && missing.unavailable && missing.payloadSent === false && /not installed/.test(missing.reason), JSON.stringify(missing));
  check('D9 an executable that is not PowerShell -> { ok:false, unavailable }, payload never sent (it never printed READY)', !notPs.ok && notPs.unavailable && notPs.payloadSent === false, JSON.stringify(notPs));
  check('D10 a REAL Constrained Language Mode session -> { ok:false, unavailable, reason names it }, payload never sent; selfTest reports it too',
    !clm.ok && clm.unavailable && clm.payloadSent === false && /ConstrainedLanguage/.test(clm.reason) && !clmSelf.ok && clmSelf.unavailable,
    JSON.stringify({ clm, clmSelf }));
  const fallbackReasons = [missing.reason, notPs.reason, clm.reason, clmSelf.reason].join(NL);
  check('D11 no fallback reason carries the payload', !leaks(fallbackReasons, secret) && !leaks(fallbackReasons, entropy));

  const bad = [await dp.protect('not bytes'), await dp.protect(Buffer.alloc(0)), await dp.unprotect(Buffer.alloc(0)), await dp.protect(Buffer.alloc(1024 * 1024 + 1))];
  check('D12 invalid input (non-bytes, empty, over 1 MiB) is a { ok:false } result, not an exception, and nothing is sent',
    bad.every((r) => !r.ok && r.payloadSent === false && /invalid argument/.test(r.reason)), JSON.stringify(bad));

  // The transport: fixed argv; the script text is a constant with no data in it.
  const marker = 'Zm9vYmFyYmF6cXV4';
  check('D13 the PowerShell argv is fixed (no payload slot) and the scripts are constants that carry no data',
    JSON.stringify(dp.POWERSHELL_ARGS) === JSON.stringify(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'])
    && Object.isFrozen(dp.POWERSHELL_ARGS) && !dp.SCRIPTS.protect.includes(marker) && !/\r|\n/.test(dp.SCRIPTS.protect + dp.SCRIPTS.unprotect)
    && dp.SCRIPTS.protect.includes('[Console]::In.ReadLine()') && dp.SCRIPTS.protect.indexOf('READY') < dp.SCRIPTS.protect.indexOf('[Console]::In.ReadLine()')
    && dp.defaultPowerShellPath().toLowerCase() === PS.toLowerCase()
    && ![dp.SCRIPTS.protect, dp.SCRIPTS.unprotect].some((s) => s.includes('BOSDPAPI:READY;') || s.includes('BOSDPAPI:OK:')));

  // Review 2026-09-26: a program that ECHOES its stdin (cmd.exe here) used to print the script text, whose literal
  // READY fired the handshake — the payload was sent to it (payloadSent: true, and no `unavailable`).
  const cmdExe = path.join(SYS32, 'cmd.exe');
  const t15 = Date.now();
  const echoing = await dp.protect(secret, { entropy, powershellPath: cmdExe });
  const ms15 = Date.now() - t15;
  check('D15 an interpreter that echoes its stdin (cmd.exe as powershellPath) -> { ok:false, unavailable }, payload NEVER sent, answered at once (no timeout), nothing of the payload in the reason',
    !echoing.ok && echoing.unavailable === true && echoing.payloadSent === false && ms15 < 15000 && !leaks(echoing.reason, secret) && !leaks(echoing.reason, entropy),
    JSON.stringify({ echoing, ms15 }));

  // Review 2026-09-26: protect() accepted 1 MiB of plaintext, returned a 1,048,806-byte blob, and unprotect() refused
  // any blob over 1 MiB — a maximal secret could be protected into something that can never be read.
  const max = randomBytes(1024 * 1024);
  const pMax = await dp.protect(max);
  const uMax = pMax.ok ? await dp.unprotect(pMax.buf) : { ok: false, reason: 'protect: ' + pMax.reason };
  check('D16 the maximal plaintext (1 MiB) round-trips: unprotect() accepts every blob protect() returns',
    pMax.ok && pMax.buf.length > max.length && uMax.ok && uMax.buf.equals(max), JSON.stringify({ blob: pMax.ok ? pMax.buf.length : null, u: uMax.reason }));
}

// THE EVENT LOG. PowerShell 5.1 auto-logs "suspicious" script blocks (Event 4104) with no policy set. Prove the
// log records script text here (positive control), then prove the round-trip's secret, entropy and output are
// not in it.
{
  const probe = 'BOSLOGPROBE' + hex(randomBytes(12));
  // The probe carries the same auto-log trigger the DPAPI script does (Add-Type; measured: FromBase64String
  // alone does NOT trigger auto-logging on this build, Add-Type and "Cryptography" do).
  const ctl = spawnSync(PS, dp.POWERSHELL_ARGS, { input: "$probe = '" + probe + "'; Add-Type -AssemblyName System.Security\r\n", encoding: 'utf8', windowsHide: true });
  const since = testStart.toISOString();
  const readLog = () => {
    const q = "$ErrorActionPreference='Stop'; try { Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104; StartTime=[DateTime]::Parse('"
      + since + "').ToLocalTime() } -MaxEvents 2000 | ForEach-Object { [Console]::Out.WriteLine($_.Message) } } catch { [Console]::Out.WriteLine('BOSLOGQUERY:ERR:' + $_.Exception.Message) }\r\n";
    return spawnSync(PS, dp.POWERSHELL_ARGS, { input: q, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 }).stdout || '';
  };
  let log = '';
  for (let i = 0; i < 4 && !log.includes(probe); i++) {
    if (i) await new Promise((r) => setTimeout(r, 750));
    log = readLog();
  }
  if (ctl.status !== 0 || !log.includes(probe)) {
    skip('D14 the DPAPI round-trip leaves no secret in the PowerShell event log',
      'positive control not observed (probe exit ' + ctl.status + '; log query ' + (log.startsWith('BOSLOGQUERY:ERR:') ? log.trim().slice(0, 200) : log.length + ' chars') + ') — the log cannot be shown to record script text here, so its silence proves nothing');
  } else {
    const ourScriptLogged = log.includes('BOSDPAPI:READY');
    const found = [];
    if (leaks(log, secret)) found.push('plaintext');
    if (leaks(log, entropy)) found.push('entropy');
    if (unprotectedB64 && log.includes(unprotectedB64)) found.push('unprotect output');
    check('D14 the DPAPI round-trip leaves no secret in the PowerShell event log (control: a probe script WAS logged'
      + (ourScriptLogged ? ', and so was the DPAPI script text itself' : '') + ')', found.length === 0, 'found in Event 4104: ' + found.join(', '));
  }
}

// =============================================================================================================
// SECURE STORE
// =============================================================================================================
console.log('--- secure-store ---');
const whoami = spawnSync(path.join(SYS32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' }).stdout.trim();
const [ME_NAME, ME_SID] = whoami.split(',').map((s) => s.replace(/"/g, ''));
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-rcr-'));

// The test's OWN ACL readers — deliberately not the module's.
function sddlOf(p) {
  const f = path.join(os.tmpdir(), 'bos-rcr-acl-' + hex(randomBytes(6)) + '.txt');
  try {
    const r = spawnSync(path.join(SYS32, 'icacls.exe'), [p, '/save', f], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return null;
    return fs.readFileSync(f).toString('utf16le').split(/\r?\n/).find((l) => l.startsWith('D:')) || null;
  } finally { try { fs.unlinkSync(f); } catch { /* none */ } }
}
function acesOf(sddl) {
  return [...String(sddl).matchAll(/\(([^()]*)\)/g)].map((m) => { const f = m[1].split(';'); return { type: f[0], flags: f[1], rights: f[2], sid: f[5] }; });
}
function listingAccounts(p) {
  const r = spawnSync(path.join(SYS32, 'icacls.exe'), [p], { encoding: 'utf8', windowsHide: true });
  const lines = r.stdout.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (i === 0) { if (!l.startsWith(p)) return null; l = l.slice(p.length); }
    l = l.trim();
    if (!l) break;
    out.push(l.slice(0, l.indexOf(':(')));
  }
  return out;
}
const onlyMeDir = (p) => {
  const s = sddlOf(p); const a = acesOf(s);
  return !!s && /^D:P/.test(s) && a.length === 1 && a[0].type === 'A' && a[0].sid === ME_SID && a[0].rights === 'FA' && a[0].flags === 'OICI';
};
const onlyMeFile = (p) => { const s = sddlOf(p); const a = acesOf(s); return !!s && a.length > 0 && a.every((x) => x.sid === ME_SID); };
const listedOnlyMe = (p) => { const acc = listingAccounts(p); return !!acc && acc.length === 1 && acc[0].toLowerCase() === ME_NAME.toLowerCase(); };
const icacls = (...args) => spawnSync(path.join(SYS32, 'icacls.exe'), args, { encoding: 'utf8', windowsHide: true }).status;
// A refusal's re-lock command, PASTED into a real shell exactly as a person would (review 2026-09-26: the first
// version's command failed in cmd.exe and half-failed in PowerShell; a substring check could not see that).
// Everything from the first `icacls "` to the end of that clause (" — " or the end of the text) is pasted as is.
function pasteFix(fix, shell) {
  const f = String(fix || '');
  const at = f.indexOf('icacls "');
  if (at === -1) return { status: 'no icacls command found in the fix' };
  const end = f.indexOf(' — ', at);
  const cmd = f.slice(at, end === -1 ? undefined : end);
  const r = shell === 'cmd'
    ? spawnSync(path.join(SYS32, 'cmd.exe'), ['/d', '/s', '/c', cmd], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
    : spawnSync(PS, dp.POWERSHELL_ARGS, { input: cmd + '\r\n', encoding: 'utf8', windowsHide: true });
  const text = r.stdout + r.stderr;
  return { status: r.status, cmd, errors: /not recognized|Invalid parameter|Failed processing [1-9]|ParserError|Exception/.test(text) ? text.replace(/\s+/g, ' ').slice(0, 300) : '' };
}
const writeRes = async (...a) => { try { return await ss.writeSecret(...a); } catch (e) { return { threw: e }; } };

try {
  // P — the module's SDDL parser against known shapes (pure).
  const me = ME_SID;
  const locked = ss.parseDacl('D:PAI(A;OICI;FA;;;' + me + ')', me);
  check('P1 SDDL parser: the exact lock shape is recognised; an extra BU ACE, an inherited flag, a missing P, a null DACL, an inherit-only ACE are not',
    ss.isLockedDirDacl(locked, me)
    && !ss.isLockedDirDacl(ss.parseDacl('D:PAI(A;OICI;FA;;;' + me + ')(A;OICI;FR;;;BU)', me), me)
    && !ss.isLockedDirDacl(ss.parseDacl('D:PAI(A;OICIID;FA;;;' + me + ')', me), me)
    && !ss.isLockedDirDacl(ss.parseDacl('D:AI(A;OICI;FA;;;' + me + ')', me), me)
    && !ss.isLockedDirDacl(ss.parseDacl('D:NO_ACCESS_CONTROL', me), me)
    && !ss.isLockedDirDacl(ss.parseDacl('D:PAI(A;OICIIO;FA;;;' + me + ')', me), me));
  const cond = ss.parseDacl('D:PAI(A;OICI;FA;;;' + me + ')(XA;;FX;;;WD;(@User.Title == "PM"))', me);
  check('P2 SDDL parser: aliases resolve to SIDs (SY, BA, WD) and a conditional ACE with nested parentheses is one foreign ACE, not a parse slip',
    cond.ok && cond.aces.length === 2 && cond.aces[1].sid === 'S-1-1-0' && !ss.isOwnerOnlyDacl(cond, me)
    && ss.parseDacl('D:(A;;FA;;;SY)(A;;FA;;;BA)', me).aces.map((a) => a.sid).join() === 'S-1-5-18,S-1-5-32-544');

  // S1..S5 — the DPAPI path end to end.
  const dirA = path.join(base, 'storeA');
  const fileA = path.join(dirA, 'device.key');
  const s1 = randomBytes(32);
  const w1 = await writeRes(fileA, s1, { entropy });
  check('S1 writeSecret into a new directory -> protection "dpapi"', w1.ok === true && w1.protection === 'dpapi', w1.threw ? w1.threw.fix : JSON.stringify(w1));

  const stored = fs.existsSync(fileA) ? fs.readFileSync(fileA) : Buffer.alloc(0);
  check('S2 the stored file never contains the raw secret (bytes, hex, base64, base64url); it is a dpapi envelope',
    stored.length > 0 && !leaks(stored.toString('latin1'), s1) && !stored.includes(s1) && stored.toString('latin1').startsWith('BOS-SECURE-STORE/1 dpapi '));

  const r1 = await ss.readSecret(fileA, { entropy });
  const shown = JSON.stringify(r1) + util.inspect(r1);
  check('S3 readSecret returns the same bytes, says "dpapi", and the result cannot print them (non-enumerable buf)',
    r1.ok && r1.protection === 'dpapi' && r1.buf.equals(s1) && !leaks(shown, s1) && !/Buffer/.test(shown),
    'ok ' + r1.ok + '; printed form leaks the secret: ' + leaks(shown, s1) + '; enumerable keys: ' + Object.keys(r1).join(','));

  check('S4 ACL read back independently (own icacls /save + own SDDL parse): the directory is protected with ONE ACE — '
    + 'the current user (' + ME_SID + '), full control, inherited by files and folders — and nothing else', onlyMeDir(dirA), sddlOf(dirA));
  check('S5 ACL read back a second way (the human-readable icacls listing): exactly one account on the directory and on the file — the current user (' + ME_NAME + ')',
    listedOnlyMe(dirA) && listedOnlyMe(fileA) && onlyMeFile(fileA), JSON.stringify({ dir: listingAccounts(dirA), file: listingAccounts(fileA) }));

  const s1b = randomBytes(48);
  const w1b = await writeRes(fileA, s1b, { entropy });
  const r1b = await ss.readSecret(fileA, { entropy });
  const leftovers = fs.readdirSync(dirA);
  check('S6 overwrite is atomic and clean: the new value reads back, and the directory holds only the one file (no temp left behind)',
    w1b.ok && r1b.ok && r1b.buf.equals(s1b) && leftovers.length === 1 && leftovers[0] === 'device.key', JSON.stringify(leftovers));

  // S7..S10 — refusals, each naming its fix, none throwing, none carrying the secret.
  const refusals = [];
  const wrongE = await ss.readSecret(fileA, { entropy: randomBytes(16) });
  refusals.push(wrongE);
  check('S7 readSecret with the wrong entropy refuses (dpapi_refused) and the fix names it: same user + same entropy, or writeSecret() again',
    !wrongE.ok && wrongE.code === 'dpapi_refused' && /entropy/.test(wrongE.fix) && /writeSecret\(\)/.test(wrongE.fix), JSON.stringify(wrongE));

  const good = fs.readFileSync(fileA);
  const flip = Buffer.from(good); flip[flip.length - 3] ^= 0x01; fs.writeFileSync(fileA, flip);
  const tampered = await ss.readSecret(fileA, { entropy });
  fs.writeFileSync(fileA, good.subarray(0, good.length - 1));
  const truncated = await ss.readSecret(fileA, { entropy });
  fs.writeFileSync(fileA, Buffer.concat([Buffer.from('NOT-A-STORE 1\n'), good.subarray(good.indexOf(0x0a) + 1)]));
  const foreignHeader = await ss.readSecret(fileA, { entropy });
  fs.writeFileSync(fileA, good);
  const restored = await ss.readSecret(fileA, { entropy });
  refusals.push(tampered, truncated, foreignHeader);
  check('S8 a tampered file is refused (dpapi_refused), a truncated one (length), a foreign header (format) — and the untouched bytes still read',
    !tampered.ok && tampered.code === 'dpapi_refused' && !truncated.ok && truncated.code === 'length' && !foreignHeader.ok && foreignHeader.code === 'format'
    && restored.ok && restored.buf.equals(s1b), JSON.stringify({ tampered, truncated, foreignHeader }));

  const missing = await ss.readSecret(path.join(dirA, 'nope.key'));
  fs.mkdirSync(path.join(dirA, 'adir.key'));
  const notFile = await ss.readSecret(path.join(dirA, 'adir.key'));
  fs.rmdirSync(path.join(dirA, 'adir.key'));
  const garbageArgs = [await ss.readSecret(undefined), await ss.readSecret(123), await ss.readSecret('relative\\x.key'), await ss.readSecret(null, null)];
  refusals.push(missing, notFile, ...garbageArgs);
  check('S9 readSecret never throws: missing file (fix: writeSecret()), a directory in its place, and non-path arguments are all { ok:false, fix }',
    !missing.ok && missing.code === 'missing' && /writeSecret\(\)/.test(missing.fix) && !notFile.ok && notFile.code === 'not_file'
    && garbageArgs.every((r) => r && r.ok === false && typeof r.fix === 'string' && r.fix.length > 10));

  // Broaden the DIRECTORY: Users get read. The reader must refuse and say exactly how to re-lock.
  icacls(dirA, '/grant', '*S-1-5-32-545:(OI)(CI)R');
  const broadDir = await ss.readSecret(fileA, { entropy });
  refusals.push(broadDir);
  check('S10 a directory readable by Users is refused (acl_dir); the fix names the icacls re-lock and the SID to remove',
    !broadDir.ok && broadDir.code === 'acl_dir' && broadDir.fix.includes('/inheritance:r /grant:r "*' + ME_SID + ':(OI)(CI)F"') && broadDir.fix.includes('/remove "*S-1-5-32-545"'),
    JSON.stringify(broadDir));

  // S10b: the fix, pasted into cmd.exe, re-locks. Then the harder shape (inheritance re-enabled AND an explicit
  // Users ACE), refused, and ITS fix pasted into PowerShell, re-locks. Then broaden again for S11.
  const viaCmd = pasteFix(broadDir.fix, 'cmd');
  const lockedByCmd = onlyMeDir(dirA);
  const readAfterCmd = await ss.readSecret(fileA, { entropy });
  icacls(dirA, '/inheritance:e');
  icacls(dirA, '/grant', '*S-1-5-32-545:(OI)(CI)R');
  const inheriting = await ss.readSecret(fileA, { entropy });
  refusals.push(inheriting);
  const viaPs = pasteFix(inheriting.fix, 'powershell');
  const lockedByPs = onlyMeDir(dirA);
  const readAfterPs = await ss.readSecret(fileA, { entropy });
  check('S10b the re-lock command in a refusal WORKS when pasted: into cmd.exe (protected dir + Users ACE) and into PowerShell (inheriting dir + Users ACE) — both leave exactly the lock and the secret reads again',
    viaCmd.status === 0 && !viaCmd.errors && lockedByCmd && readAfterCmd.ok && !inheriting.ok && inheriting.code === 'acl_dir' && /inherits/.test(inheriting.fix)
    && viaPs.status === 0 && !viaPs.errors && lockedByPs && readAfterPs.ok && readAfterPs.buf.equals(s1b),
    JSON.stringify({ viaCmd, lockedByCmd, viaPs, lockedByPs, inheriting: inheriting.fix }));
  icacls(dirA, '/grant', '*S-1-5-32-545:(OI)(CI)R');

  // A second store file in the same (now broadened) directory, then re-lock through writeSecret.
  const fileA2 = path.join(dirA, 'other.key');
  const s2 = randomBytes(32);
  const w2 = await writeRes(fileA2, s2, { entropy });
  const r2 = await ss.readSecret(fileA2, { entropy });
  const rA = await ss.readSecret(fileA, { entropy });
  check('S11 writeSecret re-locks a broadened directory that holds only store files: the explicit Users ACE is removed, BOTH files read, both ACLs read back owner-only',
    w2.ok && r2.ok && r2.buf.equals(s2) && rA.ok && rA.buf.equals(s1b) && onlyMeDir(dirA) && onlyMeFile(fileA) && onlyMeFile(fileA2),
    JSON.stringify({ w2: w2.threw ? w2.threw.fix : w2.protection, dir: sddlOf(dirA), fileA: sddlOf(fileA) }));

  // Broaden the FILE only.
  icacls(fileA, '/grant', '*S-1-5-32-545:R');
  const broadFile = await ss.readSecret(fileA, { entropy });
  refusals.push(broadFile);
  const viaCmdFile = pasteFix(broadFile.fix, 'cmd');
  const readFileAfterFix = await ss.readSecret(fileA, { entropy });
  const fileOnlyMeAfterFix = onlyMeFile(fileA) && listedOnlyMe(fileA);
  icacls(fileA, '/grant', '*S-1-5-32-545:R');
  const w3 = await writeRes(fileA, s1b, { entropy });
  check('S12 a FILE readable by Users is refused (acl_file); its re-lock command pasted into cmd.exe makes it readable again; writing it again also replaces it with an owner-only file',
    !broadFile.ok && broadFile.code === 'acl_file' && broadFile.fix.includes('/remove "*S-1-5-32-545"') && viaCmdFile.status === 0 && !viaCmdFile.errors
    && readFileAfterFix.ok && fileOnlyMeAfterFix && w3.ok && onlyMeFile(fileA), JSON.stringify({ broadFile, viaCmdFile, after: readFileAfterFix.code, fileOnlyMeAfterFix }));

  // A shared directory is never taken over.
  const dirS = path.join(base, 'shared');
  fs.mkdirSync(dirS);
  fs.writeFileSync(path.join(dirS, 'someone-elses.txt'), 'not ours');
  const beforeS = sddlOf(dirS);
  const wS = await writeRes(path.join(dirS, 'device.key'), randomBytes(32));
  check('S13 writeSecret refuses a directory that is not locked and holds a foreign file (dir_shared), and leaves its ACL and contents untouched',
    wS.threw && wS.threw.code === 'dir_shared' && sddlOf(dirS) === beforeS && !fs.existsSync(path.join(dirS, 'device.key')),
    wS.threw ? wS.threw.fix : JSON.stringify(wS));

  const guards = [
    await writeRes('relative\\device.key', randomBytes(32)),
    await writeRes(path.parse(os.tmpdir()).root + 'bos-device-' + hex(randomBytes(4)) + '.key', randomBytes(32)),
    await writeRes(path.join(os.tmpdir(), 'bos-device-' + hex(randomBytes(4)) + '.key'), randomBytes(32)),
    await writeRes(path.join(os.homedir(), 'bos-device-' + hex(randomBytes(4)) + '.key'), randomBytes(32)),
    await writeRes('\\\\server\\share\\d\\device.key', randomBytes(32)),
    // review 2026-09-26: names Win32 does not store as written
    await writeRes(path.join(base, 'g1', 'device.key:stream'), randomBytes(32)),
    await writeRes(path.join(base, 'g2', 'device.key.'), randomBytes(32)),
    await writeRes(path.join(base, 'g3', 'device.key '), randomBytes(32)),
    await writeRes(path.join(base, 'g4', 'NUL'), randomBytes(32)),
    await writeRes(path.join(base, 'g5', 'con.key'), randomBytes(32)),
    await writeRes(path.join(base, 'LPT1', 'device.key'), randomBytes(32)),
  ];
  const guardReads = [await ss.readSecret(path.join(base, 'g1', 'device.key:stream')), await ss.readSecret(path.join(base, 'g4', 'NUL'))];
  refusals.push(...guardReads);
  check('S14 path guards refuse before touching disk: relative path, drive root, the temp root, the profile root, UNC, an alternate data stream, a trailing dot / space, a DOS device name (bare, with extension, as a directory) — and nothing was created',
    guards.every((g) => g.threw && g.threw.code === 'path') && guardReads.every((r) => !r.ok && r.code === 'path')
    && ['g1', 'g2', 'g3', 'g4', 'g5', 'LPT1'].every((d) => !fs.existsSync(path.join(base, d))),
    JSON.stringify(guards.map((g) => g.threw ? g.threw.code : 'NOT REFUSED')));

  // S15..S18 — the acl_only fallback, honestly labeled.
  const dirB = path.join(base, 'storeB');
  const fileB = path.join(dirB, 'device.key');
  const sB = randomBytes(32);
  const noPs = { powershellPath: path.join(base, 'no-such', 'powershell.exe') };
  const wB = await writeRes(fileB, sB, { dpapi: noPs });
  const storedB = fs.existsSync(fileB) ? fs.readFileSync(fileB) : Buffer.alloc(0);
  const rB = await ss.readSecret(fileB, { dpapi: noPs });
  check('S15 DPAPI unavailable -> writeSecret falls back to protection "acl_only", says why, and the label is honest (the file holds the raw bytes, header acl_only)',
    wB.ok && wB.protection === 'acl_only' && /not installed/.test(wB.dpapiReason || '') && storedB.includes(sB)
    && storedB.toString('latin1').startsWith('BOS-SECURE-STORE/1 acl_only 32\n') && rB.ok && rB.protection === 'acl_only' && rB.buf.equals(sB)
    && onlyMeDir(dirB) && onlyMeFile(fileB), wB.threw ? wB.threw.fix : JSON.stringify(wB));

  const wC = await writeRes(path.join(base, 'storeC', 'device.key'), randomBytes(32), { dpapi: { _simulateConstrainedLanguage: true } });
  check('S16 Constrained Language Mode (real) -> writeSecret falls back to acl_only and names the language mode', wC.ok && wC.protection === 'acl_only' && /ConstrainedLanguage/.test(wC.dpapiReason || ''),
    wC.threw ? wC.threw.fix : JSON.stringify(wC));

  const wReq = await writeRes(path.join(base, 'storeD', 'device.key'), randomBytes(32), { requireDpapi: true, dpapi: noPs });
  const rReq = await ss.readSecret(fileB, { requireDpapi: true });
  refusals.push(rReq);
  check('S17 requireDpapi: writeSecret refuses to fall back (dpapi_required, NOTHING created — not even the directory) and readSecret refuses an acl_only file',
    wReq.threw && wReq.threw.code === 'dpapi_required' && !fs.existsSync(path.join(base, 'storeD'))
    && !rReq.ok && rReq.code === 'dpapi_required', JSON.stringify({ w: wReq.threw && wReq.threw.fix, r: rReq }));

  const rUnavail = await ss.readSecret(fileA, { entropy, dpapi: noPs });
  refusals.push(rUnavail);
  check('S18 a dpapi file read where DPAPI is unavailable is refused (dpapi_unavailable) and the fix names the same-user / FullLanguage requirement',
    !rUnavail.ok && rUnavail.code === 'dpapi_unavailable' && /same Windows user/.test(rUnavail.fix) && /FullLanguage/.test(rUnavail.fix), JSON.stringify(rUnavail));

  // S21 (review 2026-09-26): the maximal secret used to be protected into a blob unprotect() refused, AFTER the
  // rename — a good stored secret was replaced by a file that could never be read.
  const dirE = path.join(base, 'storeE');
  const fileE = path.join(dirE, 'device.key');
  const sE = randomBytes(48);
  const wE1 = await writeRes(fileE, sE);
  const sMax = randomBytes(1024 * 1024);
  const wE2 = await writeRes(fileE, sMax);
  const rE = await ss.readSecret(fileE);
  check('S21 a maximal (1 MiB) secret overwrites a stored one under DPAPI and reads back exactly (it no longer destroys the old secret with an unreadable file)',
    wE1.ok && wE2.ok && wE2.protection === 'dpapi' && rE.ok && rE.buf.equals(sMax),
    JSON.stringify({ w1: wE1.threw ? wE1.threw.code : wE1.protection, w2: wE2.threw ? wE2.threw.code + ': ' + wE2.threw.fix.slice(0, 200) : wE2.protection, r: rE.ok ? 'ok' : rE.code }));

  // S22 (review 2026-09-26): failures outside the planned steps escaped as raw Node errors (ENOTDIR from mkdir,
  // EPERM from readdir) although writeSecret documents "throws SecureStoreError (.code, .fix)".
  const aFile = path.join(base, 'a-file.txt');
  fs.writeFileSync(aFile, 'x');
  const underFile = await writeRes(path.join(aFile, 'sub', 'device.key'), randomBytes(32));
  const dirNoList = path.join(base, 'nolist');
  fs.mkdirSync(dirNoList);
  fs.writeFileSync(path.join(dirNoList, 'x.txt'), 'x');
  icacls(dirNoList, '/deny', '*' + ME_SID + ':(RD)');
  const unlistable = await writeRes(path.join(dirNoList, 'device.key'), randomBytes(32));
  icacls(dirNoList, '/remove:d', '*' + ME_SID);
  check('S22 a parent that is a file, and an existing directory this user cannot list, are SecureStoreErrors with a fix — not raw Node errors',
    [underFile, unlistable].every((g) => g.threw instanceof ss.SecureStoreError && g.threw.code === 'dir' && /directory/.test(g.threw.fix)),
    JSON.stringify([underFile, unlistable].map((g) => g.threw ? g.threw.name + '/' + g.threw.code + ': ' + String(g.threw.message).slice(0, 120) : 'NOT THROWN')));

  // S23 (review 2026-09-26): any non-"unavailable" DPAPI failure was reported as dpapi_refused ("written by a
  // different Windows user or machine, with different entropy, or it was modified") — including an oversize body
  // DPAPI never even saw. Only a CryptographicException is a refusal now.
  const fileBig = path.join(dirA, 'oversize.key');
  const bigBody = randomBytes(1024 * 1024 + 64 * 1024 + 1);
  fs.writeFileSync(fileBig, Buffer.concat([Buffer.from('BOS-SECURE-STORE/1 dpapi ' + bigBody.length + '\n', 'latin1'), bigBody]));
  const rBig = await ss.readSecret(fileBig);
  fs.unlinkSync(fileBig);
  refusals.push(rBig);
  check('S23 a DPAPI failure that is not DPAPI refusing the blob (an oversize body) is dpapi_failed, not dpapi_refused, and does not claim another user / entropy; wrong entropy (S7) and a tampered blob (S8) stay dpapi_refused',
    !rBig.ok && rBig.code === 'dpapi_failed' && !/different Windows user|entropy/.test(rBig.fix) && /writeSecret\(\)/.test(rBig.fix)
    && wrongE.code === 'dpapi_refused' && tampered.code === 'dpapi_refused', JSON.stringify(rBig));

  // Every refusal: a sentence that names a fix, and never the secret.
  const allSecrets = [s1, s1b, s2, sB, sE, entropy];
  const bads = refusals.filter((r) => !(r && r.ok === false && typeof r.fix === 'string' && r.fix.length > 20
    && /(writeSecret\(\)|icacls|Windows user|FullLanguage|NTFS|dedicated)/.test(r.fix) && !allSecrets.some((s) => leaks(r.fix, s))));
  const errTexts = [wS, wReq, ...guards, underFile, unlistable].map((g) => g.threw ? g.threw.message + g.threw.fix : '').join(NL);
  check('S19 every refusal (' + refusals.length + ') and every thrown write error is a sentence naming a fix, with no secret bytes in it',
    bads.length === 0 && !allSecrets.some((s) => leaks(errTexts, s)), JSON.stringify(bads));
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
check('S20 cleanup: the disposable store directories are gone (locked directories stay deletable by their owner)', !fs.existsSync(base));

finish();

function finish() {
  console.log('');
  if (skips.length) console.log('skipped (not counted as passed): ' + skips.length + ' — ' + skips.join('; '));
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); }
  console.log('runtime_crypto_regression: ' + pass + ' passed, ' + failures.length + ' failed');
  process.exit(failures.length ? 1 : 0);
}
