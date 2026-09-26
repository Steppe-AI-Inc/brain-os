// PAIRING CODES (WO-3; S-6). Shared by the Admin API (which issues a code) and the Node API (which verifies one). Portable TS.
//
// FORMAT. 18 Crockford base32 characters, shown as XXXX-XXXX-XXXX-XXXX-XX:
//   5 LOCATOR characters (25 random bits; unique among live codes - the plane refuses a duplicate, the issuer draws again),
//   12 SECRET characters (60 random bits >= the 55 S-6 requires), 1 CHECK character (a weighted sum mod 32 over the 17), which
//   catches a mistyped character before it costs an attempt.
// Every character comes from its own CSPRNG byte masked to 5 bits: 256 is a multiple of 32, so each is uniform. Nothing is
// derived from a counter or a clock.
// VERIFIER. HMAC-SHA256(FACTORY_PAIRING_PEPPER, normalized_code), normalized_code = the 17 locator + secret characters, upper case.
// The pepper lives only in the Edge secret store; the plane stores the locator and the MAC, never the code, never a plain hash.

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LOCATOR_CHARS = 5;
export const SECRET_CHARS = 12;
export const SECRET_BITS = SECRET_CHARS * 5;

const checkChar = (s17: string): string => {
  let sum = 0;
  for (let i = 0; i < s17.length; i++) sum = (sum + (i + 1) * ALPHABET.indexOf(s17[i])) % 32;
  return ALPHABET[sum];
};

/** A new code, from the CSPRNG. */
export function generateCode(randomBytes: (n: number) => Uint8Array): { code: string; display: string; locator: string; normalized: string } {
  const r = randomBytes(LOCATOR_CHARS + SECRET_CHARS);
  let s = '';
  for (const b of r) s += ALPHABET[b & 31];
  const code = s + checkChar(s);
  return { code, display: code.match(/.{1,4}/g)!.join('-'), locator: s.slice(0, LOCATOR_CHARS), normalized: s };
}

/** What the installer typed -> { locator, normalized } or null (malformed, or a check-character mismatch). */
export function normalizeCode(input: string): { locator: string; normalized: string } | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== LOCATOR_CHARS + SECRET_CHARS + 1 || /[^0-9A-HJKMNP-TV-Z]/.test(s)) return null;
  const body = s.slice(0, -1);
  if (checkChar(body) !== s.slice(-1)) return null;
  return { locator: body.slice(0, LOCATOR_CHARS), normalized: body };
}

/** The pepper, imported once as an HMAC key. FACTORY_PAIRING_PEPPER: base64 of at least 32 bytes. */
export async function importPepper(b64: string | undefined): Promise<CryptoKey | null> {
  if (!b64) return null;
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)); } catch { return null; }
  if (raw.length < 32) return null;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function codeMac(pepper: CryptoKey, normalized: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', pepper, new TextEncoder().encode(normalized)));
}
