// A zip archive read strictly and entirely in memory, before anything touches the disk.
// It accepts one reading of the file only: every byte is either a file's record, the directory or the end record, in that order.
// Anything a second tool could read differently is refused (a prepended or hidden record, a gap, a comment, zip64, encryption,
// a data descriptor, a duplicate or unsafe name, a link, a size that is not the declared one).
import { inflateRawSync } from 'node:zlib';

export const LIMITS = { entries: 64, nameBytes: 200, fileBytes: 4 * 1048576, totalBytes: 8 * 1048576 };

export class ZipRefused extends Error {}
const refuse = (why) => { throw new ZipRefused(why); };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** null when `name` is a safe relative file path; otherwise why it is not */
export function unsafePathReason(name) {
  if (typeof name !== 'string' || name.length === 0) return 'an empty name';
  if (Buffer.byteLength(name) > LIMITS.nameBytes) return 'a name that is too long';
  if (!/^[A-Za-z0-9._\/-]+$/.test(name)) return 'a name with a character outside A-Z a-z 0-9 . _ - /';
  if (name.startsWith('/')) return 'an absolute path';
  if (name.endsWith('/')) return 'a directory entry';
  for (const part of name.split('/')) {
    if (part === '') return 'an empty path segment';
    if (part === '.' || part === '..') return 'a path that climbs with . or ..';
    if (part.endsWith('.')) return 'a segment that ends with a dot';
    if (part.startsWith('-')) return 'a segment that starts with a dash';
    if (RESERVED.test(part)) return 'a reserved device name';
  }
  return null;
}

/** reads the archive; returns [{ name, bytes }] in directory order, or throws ZipRefused with the reason */
export function readZipStrict(buf, limits = LIMITS) {
  if (!Buffer.isBuffer(buf)) refuse('not a buffer');
  const end = buf.length - 22;
  if (end < 0 || buf.readUInt32LE(end) !== 0x06054b50) refuse('the end record is not the last 22 bytes (a comment, trailing data, or not a zip)');
  const disk = buf.readUInt16LE(end + 4), cdDisk = buf.readUInt16LE(end + 6), onDisk = buf.readUInt16LE(end + 8), count = buf.readUInt16LE(end + 10);
  const cdSize = buf.readUInt32LE(end + 12), cdOffset = buf.readUInt32LE(end + 16);
  if (disk !== 0 || cdDisk !== 0 || onDisk !== count) refuse('a multi-disk archive');
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) refuse('a zip64 archive');
  if (count === 0) refuse('an empty archive');
  if (count > limits.entries) refuse('too many entries');
  if (cdOffset + cdSize !== end) refuse('bytes between the directory and the end record');

  const seen = new Set();
  const entries = [];
  let at = cdOffset, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || buf.readUInt32LE(at) !== 0x02014b50) refuse('a malformed directory');
    const madeBy = buf.readUInt16LE(at + 4), flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10), crc = buf.readUInt32LE(at + 16);
    const csize = buf.readUInt32LE(at + 20), usize = buf.readUInt32LE(at + 24), nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32), diskStart = buf.readUInt16LE(at + 34), extAttr = buf.readUInt32LE(at + 38), localOffset = buf.readUInt32LE(at + 42);
    if (at + 46 + nameLen + extraLen + commentLen > end) refuse('a malformed directory');
    const nameBytes = buf.subarray(at + 46, at + 46 + nameLen);
    const name = nameBytes.toString('latin1');
    const why = unsafePathReason(name);
    if (why) refuse('an unsafe entry name: ' + why);
    if (flags & ~0x0800) refuse(`"${name}" uses a feature that is not accepted (encryption, a data descriptor or another flag)`);
    if (method !== 0 && method !== 8) refuse(`"${name}" uses a compression method that is not accepted`);
    if (commentLen !== 0 || diskStart !== 0) refuse(`"${name}" carries a comment or a disk number`);
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) refuse('a zip64 entry');
    if (usize > limits.fileBytes) refuse(`"${name}" is larger than the limit`);
    total += usize;
    if (total > limits.totalBytes) refuse('the archive is larger than the limit when unpacked');
    // a link or a device, where the archive says it was made on a system that records file types
    const type = (extAttr >>> 16) & 0o170000;
    if ((madeBy >>> 8) === 3 && type !== 0 && type !== 0o100000) refuse(`"${name}" is not a regular file`);
    const folded = name.toLowerCase();
    if (seen.has(folded)) refuse(`the name "${name}" appears twice`);
    seen.add(folded);
    entries.push({ name, nameBytes, flags, method, crc, csize, usize, localOffset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  if (at !== end) refuse('bytes after the last directory entry');
  for (const e of entries) {
    for (const other of entries) if (other !== e && other.name.toLowerCase().startsWith(e.name.toLowerCase() + '/')) refuse(`"${e.name}" is both a file and a directory`);
  }

  // the file records must tile the bytes before the directory exactly: no gap, no overlap, nothing in front, nothing hidden
  const order = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  let cursor = 0;
  for (const e of order) {
    if (e.localOffset !== cursor) refuse('bytes that belong to no listed file');
    if (cursor + 30 > cdOffset || buf.readUInt32LE(cursor) !== 0x04034b50) refuse(`"${e.name}" has no file record where the directory says`);
    const flags = buf.readUInt16LE(cursor + 6), method = buf.readUInt16LE(cursor + 8), crc = buf.readUInt32LE(cursor + 14);
    const csize = buf.readUInt32LE(cursor + 18), usize = buf.readUInt32LE(cursor + 22), nameLen = buf.readUInt16LE(cursor + 26), extraLen = buf.readUInt16LE(cursor + 28);
    if (flags !== e.flags || method !== e.method || crc !== e.crc || csize !== e.csize || usize !== e.usize) refuse(`"${e.name}" is described differently by its record and the directory`);
    if (!buf.subarray(cursor + 30, cursor + 30 + nameLen).equals(e.nameBytes)) refuse(`"${e.name}" has another name in its record`);
    const start = cursor + 30 + nameLen + extraLen, stop = start + csize;
    if (stop > cdOffset) refuse(`"${e.name}" runs into the directory`);
    const packed = buf.subarray(start, stop);
    let bytes;
    if (method === 0) {
      if (csize !== usize) refuse(`"${e.name}" is stored with two sizes`);
      bytes = Buffer.from(packed);
    } else {
      let out;
      try { out = inflateRawSync(packed, { maxOutputLength: Math.max(usize, 1), info: true }); } catch { refuse(`"${e.name}" does not unpack to its declared size`); }
      if (out.engine.bytesWritten !== csize) refuse(`"${e.name}" has bytes after its compressed data`);
      bytes = out.buffer;
    }
    if (bytes.length !== usize) refuse(`"${e.name}" does not unpack to its declared size`);
    if (crc32(bytes) !== e.crc) refuse(`"${e.name}" fails its checksum`);
    e.bytes = bytes;
    cursor = stop;
  }
  if (cursor !== cdOffset) refuse('bytes between the last file and the directory');
  return entries.map((e) => ({ name: e.name, bytes: e.bytes }));
}
