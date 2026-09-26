// THE RELEASE DIGEST (S-5): the SHA-256 PE Authenticode image hash - the digest a signed Windows binary's Authenticode signature itself
// carries. It excludes exactly three ranges: the optional header's CheckSum field, the Certificate Table data-directory entry, and the
// certificate table (the attribute certificates). So the founder's installer Authenticode signature (a founder boundary) never changes
// it, and bytes appended to or changed in the certificate table never change it either (AC-5 (n)). "Tampered (one byte)" means a byte
// inside the hashed ranges, which always changes it.
//
// The algorithm is Microsoft's "Windows Authenticode Portable Executable Signature Format", section "Calculating the PE Image Hash":
// the headers up to SizeOfHeaders (minus the two header ranges), then every section's raw data in PointerToRawData order, then any
// data after the last section except the certificate table. Pure node: builtins; bundled into the runtime (it verifies what it runs).
import { createHash } from 'node:crypto';

export class PeError extends Error { constructor(m) { super(m); this.name = 'PeError'; } }

export function peLayout(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new PeError('not a PE file (no MZ header)');
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) throw new PeError('not a PE file (no PE signature)');
  const coff = pe + 4;
  const nSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x10b && magic !== 0x20b) throw new PeError('unknown optional-header magic 0x' + magic.toString(16));
  const checksumOffset = opt + 64;
  const dataDirs = opt + (magic === 0x20b ? 112 : 96);
  const numberOfRvaAndSizes = buf.readUInt32LE(opt + (magic === 0x20b ? 108 : 92));
  if (numberOfRvaAndSizes < 5) throw new PeError('no certificate-table data directory');
  const certDirOffset = dataDirs + 4 * 8;
  const certOffset = buf.readUInt32LE(certDirOffset);
  const certSize = buf.readUInt32LE(certDirOffset + 4);
  const sizeOfHeaders = buf.readUInt32LE(opt + 60);
  const sections = [];
  const secTable = opt + optSize;
  for (let i = 0; i < nSections; i++) {
    const s = secTable + i * 40;
    if (s + 40 > buf.length) throw new PeError('section table beyond the file');
    sections.push({ name: buf.toString('latin1', s, s + 8).replace(/\0+$/, ''), sizeOfRawData: buf.readUInt32LE(s + 16), pointerToRawData: buf.readUInt32LE(s + 20) });
  }
  if (certSize && (certOffset + certSize > buf.length || certOffset < sizeOfHeaders)) throw new PeError('certificate table outside the file');
  return { pe, magic, checksumOffset, certDirOffset, certOffset, certSize, sizeOfHeaders, sections };
}

/** The SHA-256 Authenticode image hash of a PE file, hex. */
export function authenticodeImageHash(buf) {
  const L = peLayout(buf);
  const h = createHash('sha256');
  h.update(buf.subarray(0, L.checksumOffset));
  h.update(buf.subarray(L.checksumOffset + 4, L.certDirOffset));
  h.update(buf.subarray(L.certDirOffset + 8, L.sizeOfHeaders));
  let hashed = L.sizeOfHeaders;
  const secs = L.sections.filter((s) => s.sizeOfRawData > 0).sort((a, b) => a.pointerToRawData - b.pointerToRawData);
  for (const s of secs) {
    if (s.pointerToRawData + s.sizeOfRawData > buf.length) throw new PeError('section ' + s.name + ' beyond the file');
    h.update(buf.subarray(s.pointerToRawData, s.pointerToRawData + s.sizeOfRawData));
    hashed += s.sizeOfRawData;
  }
  if (buf.length > hashed) {
    const extra = buf.length - (L.certSize || 0) - hashed;
    if (extra > 0) h.update(buf.subarray(hashed, hashed + extra));
  }
  return h.digest('hex');
}
