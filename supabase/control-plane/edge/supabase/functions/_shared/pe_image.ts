// THE RELEASE DIGEST (S-5) for the Admin API's staged check: WO-6 r4 - "The Admin API checks the Director's signature over the staged
// values and the served installer's digest" - and contract §2 Release: an installer at the staged path without the staged digest is
// not_staged. It is the SHA-256 PE Authenticode image hash, computed exactly as the runtime computes it
// (scripts/factory-runner/enrolled/pe-image.mjs; release_stage_acceptance SG7 holds the two equal): the headers up to SizeOfHeaders
// minus the CheckSum field and the Certificate Table directory entry, every section's raw data in PointerToRawData order, then the
// data after the last section except the certificate table. Bytes that are not a PE file it can hash give null, never an error: they
// are simply not the staged installer. Hashed incrementally, so the installer is never copied.
import { createHash } from 'node:crypto';

export function peImageDigest(b: Uint8Array): string | null {
  if (!(b instanceof Uint8Array) || b.length < 0x40) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o: number): number => (o >= 0 && o + 2 <= b.length ? v.getUint16(o, true) : -1);
  const u32 = (o: number): number => (o >= 0 && o + 4 <= b.length ? v.getUint32(o, true) : -1);
  if (u16(0) !== 0x5a4d) return null;
  const pe = u32(0x3c);
  if (pe < 0 || pe + 24 > b.length || u32(pe) !== 0x00004550) return null;
  const coff = pe + 4, nSections = u16(coff + 2), optSize = u16(coff + 16), opt = coff + 20, magic = u16(opt);
  if (magic !== 0x10b && magic !== 0x20b) return null;
  const checksumOffset = opt + 64, dataDirs = opt + (magic === 0x20b ? 112 : 96);
  const numberOfRvaAndSizes = u32(opt + (magic === 0x20b ? 108 : 92));
  if (numberOfRvaAndSizes < 5) return null;
  const certDirOffset = dataDirs + 4 * 8, certOffset = u32(certDirOffset), certSize = u32(certDirOffset + 4), sizeOfHeaders = u32(opt + 60);
  if (nSections < 0 || optSize < 0 || certOffset < 0 || certSize < 0 || sizeOfHeaders < 0) return null;
  const sections: Array<{ size: number; ptr: number }> = [];
  const secTable = opt + optSize;
  for (let i = 0; i < nSections; i++) {
    const s = secTable + i * 40;
    if (s + 40 > b.length) return null;
    sections.push({ size: u32(s + 16), ptr: u32(s + 20) });
  }
  if (certSize && (certOffset + certSize > b.length || certOffset < sizeOfHeaders)) return null;
  const h = createHash('sha256');
  h.update(b.subarray(0, checksumOffset));
  h.update(b.subarray(checksumOffset + 4, certDirOffset));
  h.update(b.subarray(certDirOffset + 8, sizeOfHeaders));
  let hashed = sizeOfHeaders;
  for (const s of sections.filter((x) => x.size > 0).sort((x, y) => x.ptr - y.ptr)) {
    if (s.ptr + s.size > b.length) return null;
    h.update(b.subarray(s.ptr, s.ptr + s.size));
    hashed += s.size;
  }
  if (b.length > hashed) {
    const extra = b.length - (certSize || 0) - hashed;
    if (extra > 0) h.update(b.subarray(hashed, hashed + extra));
  }
  return h.digest('hex');
}
