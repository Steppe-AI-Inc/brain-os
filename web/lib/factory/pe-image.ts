import { createHash } from "node:crypto";

// THE RELEASE DIGEST (S-5), measured on the installer as the public storage serves it: the SHA-256 PE Authenticode image hash.
// A line-for-line port of scripts/factory-runner/enrolled/pe-image.mjs (the runtime's own check). It excludes exactly the optional
// header's CheckSum field, the Certificate Table data-directory entry and the certificate table, so the founder's Authenticode
// signature never changes it. qa/factory/v1/web_computers_contract.mjs checks that this port and the runtime's agree on a built exe.

export class PeError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "PeError";
  }
}

type Layout = { checksumOffset: number; certDirOffset: number; certOffset: number; certSize: number; sizeOfHeaders: number; sections: { name: string; sizeOfRawData: number; pointerToRawData: number }[] };

export function peLayout(buf: Buffer): Layout {
  if (!Buffer.isBuffer(buf) || buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) throw new PeError("not a PE file (no MZ header)");
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) throw new PeError("not a PE file (no PE signature)");
  const coff = pe + 4;
  const nSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x10b && magic !== 0x20b) throw new PeError("unknown optional-header magic 0x" + magic.toString(16));
  const checksumOffset = opt + 64;
  const dataDirs = opt + (magic === 0x20b ? 112 : 96);
  const numberOfRvaAndSizes = buf.readUInt32LE(opt + (magic === 0x20b ? 108 : 92));
  if (numberOfRvaAndSizes < 5) throw new PeError("no certificate-table data directory");
  const certDirOffset = dataDirs + 4 * 8;
  const certOffset = buf.readUInt32LE(certDirOffset);
  const certSize = buf.readUInt32LE(certDirOffset + 4);
  const sizeOfHeaders = buf.readUInt32LE(opt + 60);
  const sections: Layout["sections"] = [];
  const secTable = opt + optSize;
  for (let i = 0; i < nSections; i++) {
    const s = secTable + i * 40;
    if (s + 40 > buf.length) throw new PeError("section table beyond the file");
    sections.push({ name: buf.toString("latin1", s, s + 8).replace(/\0+$/, ""), sizeOfRawData: buf.readUInt32LE(s + 16), pointerToRawData: buf.readUInt32LE(s + 20) });
  }
  if (certSize && (certOffset + certSize > buf.length || certOffset < sizeOfHeaders)) throw new PeError("certificate table outside the file");
  return { checksumOffset, certDirOffset, certOffset, certSize, sizeOfHeaders, sections };
}

/** The SHA-256 Authenticode image hash of a PE file, hex. */
export function authenticodeImageHash(buf: Buffer): string {
  const L = peLayout(buf);
  const h = createHash("sha256");
  h.update(buf.subarray(0, L.checksumOffset));
  h.update(buf.subarray(L.checksumOffset + 4, L.certDirOffset));
  h.update(buf.subarray(L.certDirOffset + 8, L.sizeOfHeaders));
  let hashed = L.sizeOfHeaders;
  const secs = L.sections.filter((s) => s.sizeOfRawData > 0).sort((a, b) => a.pointerToRawData - b.pointerToRawData);
  for (const s of secs) {
    if (s.pointerToRawData + s.sizeOfRawData > buf.length) throw new PeError("section " + s.name + " beyond the file");
    h.update(buf.subarray(s.pointerToRawData, s.pointerToRawData + s.sizeOfRawData));
    hashed += s.sizeOfRawData;
  }
  if (buf.length > hashed) {
    const extra = buf.length - (L.certSize || 0) - hashed;
    if (extra > 0) h.update(buf.subarray(hashed, hashed + extra));
  }
  return h.digest("hex");
}

/** the Authenticode certificate table's place in the file ({0, 0} when the file carries none) */
export function certificateTable(buf: Buffer): { offset: number; size: number } {
  const L = peLayout(buf);
  return { offset: L.certOffset, size: L.certSize };
}
