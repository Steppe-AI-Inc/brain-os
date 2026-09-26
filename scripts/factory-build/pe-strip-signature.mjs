#!/usr/bin/env node
// PE AUTHENTICODE SIGNATURE STRIPPER - pure Node, no signtool.
//
// Why: the SEA base binary is the official, Authenticode-signed node.exe. Injecting the SEA blob changes the image, so the
// signature would no longer match what it signs; Node's SEA procedure removes it first (`signtool remove /s`). signtool is not
// on every build host, and the build must not depend on a Windows SDK, so this does the same removal from the PE format itself:
//
//   1. find the certificate table: optional-header data directory 4 (IMAGE_DIRECTORY_ENTRY_SECURITY). Unlike every other data
//      directory its VirtualAddress is a FILE OFFSET, not an RVA;
//   2. refuse unless the table is where Authenticode puts it - quadword aligned, after every section's raw data, made of well-formed
//      WIN_CERTIFICATE entries, and ending the file (at most 7 zero bytes of alignment after it). Anything else would mean the
//      truncation drops bytes that are not the signature, and that is refused, never guessed;
//   3. zero the directory entry (both fields), truncate the file at the table's offset;
//   4. recompute the PE optional-header CheckSum (the CheckSumMappedFile algorithm: 16-bit one's-complement-style sum of the
//      file with the CheckSum field taken as zero, plus the file length).
//
// Nothing is written to the input: stripSignature() returns a new Buffer. The CLI writes to a separate output path.
//
//   node scripts/factory-build/pe-strip-signature.mjs --info <file>         print the PE facts as JSON
//   node scripts/factory-build/pe-strip-signature.mjs <in.exe> <out.exe>    write an unsigned copy (exit 0), or refuse (exit 1)
//
// Its unit test, on a copy of the real node.exe: scripts/factory-build/pe-strip-signature.test.mjs
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE_DIRECTORY_ENTRY_SECURITY = 4;
const PE32 = 0x10b;
const PE32_PLUS = 0x20b;
const WIN_CERT_REVISION_1_0 = 0x0100;
const WIN_CERT_REVISION_2_0 = 0x0200;

class PeFormatError extends Error {}

const need = (cond, msg) => { if (!cond) throw new PeFormatError(msg); };

// n rounded up to a multiple of 8, in exact arithmetic. (Not `(n + 7) & ~7`: JS bitwise operators work on int32, so a dwLength of
// 2^31 or more wrapped negative and the certificate walk read at a negative offset - a RangeError instead of an answer.)
export const quadAlign = (n) => Math.ceil(n / 8) * 8;

// The facts every other function works from. Throws PeFormatError on anything that is not a well-formed PE image.
export function parsePe(buf) {
  need(Buffer.isBuffer(buf), 'parsePe: a Buffer is required');
  need(buf.length >= 0x40, 'not a PE image: shorter than a DOS header');
  need(buf[0] === 0x4d && buf[1] === 0x5a, 'not a PE image: no MZ signature');
  const peOffset = buf.readUInt32LE(0x3c);
  need(peOffset + 24 <= buf.length, 'not a PE image: e_lfanew points past the end of the file');
  need(buf.readUInt32LE(peOffset) === 0x00004550, 'not a PE image: no PE\\0\\0 signature at e_lfanew');
  const coff = peOffset + 4;
  const machine = buf.readUInt16LE(coff);
  const numberOfSections = buf.readUInt16LE(coff + 2);
  const sizeOfOptionalHeader = buf.readUInt16LE(coff + 16);
  const optOffset = coff + 20;
  need(optOffset + sizeOfOptionalHeader <= buf.length, 'truncated PE: the optional header runs past the end of the file');
  need(sizeOfOptionalHeader >= 2, 'no optional header (an object file, not an image)');
  const magic = buf.readUInt16LE(optOffset);
  need(magic === PE32 || magic === PE32_PLUS, 'unknown optional-header magic 0x' + magic.toString(16));
  const checksumOffset = optOffset + 64; // same place in PE32 and PE32+
  const nrvaOffset = optOffset + (magic === PE32_PLUS ? 108 : 92);
  const dataDirOffset = optOffset + (magic === PE32_PLUS ? 112 : 96);
  need(nrvaOffset + 4 <= optOffset + sizeOfOptionalHeader, 'optional header too small for NumberOfRvaAndSizes');
  const numberOfRvaAndSizes = buf.readUInt32LE(nrvaOffset);
  need(dataDirOffset + Math.min(numberOfRvaAndSizes, 16) * 8 <= optOffset + sizeOfOptionalHeader, 'optional header too small for its data directories');
  const sectionTable = optOffset + sizeOfOptionalHeader;
  need(sectionTable + numberOfSections * 40 <= buf.length, 'truncated PE: the section table runs past the end of the file');
  let endOfSectionData = 0;
  const sections = [];
  for (let i = 0; i < numberOfSections; i++) {
    const s = sectionTable + i * 40;
    const name = buf.toString('latin1', s, s + 8).replace(/\0+$/, '');
    const sizeOfRawData = buf.readUInt32LE(s + 16);
    const pointerToRawData = buf.readUInt32LE(s + 20);
    if (sizeOfRawData > 0) endOfSectionData = Math.max(endOfSectionData, pointerToRawData + sizeOfRawData);
    sections.push({ name, pointerToRawData, sizeOfRawData });
  }
  need(endOfSectionData <= buf.length, 'truncated PE: section raw data runs past the end of the file');
  const hasSecurityDir = numberOfRvaAndSizes > IMAGE_DIRECTORY_ENTRY_SECURITY;
  const securityDirOffset = hasSecurityDir ? dataDirOffset + IMAGE_DIRECTORY_ENTRY_SECURITY * 8 : null;
  const certificateTable = hasSecurityDir
    ? { offset: buf.readUInt32LE(securityDirOffset), size: buf.readUInt32LE(securityDirOffset + 4) }
    : { offset: 0, size: 0 };
  return {
    machine, magic: magic === PE32_PLUS ? 'PE32+' : 'PE32', peOffset, optOffset, checksumOffset,
    storedChecksum: buf.readUInt32LE(checksumOffset), numberOfRvaAndSizes, securityDirOffset,
    certificateTable, sections, endOfSectionData, fileLength: buf.length,
  };
}

// Microsoft's CheckSumMappedFile: sum the file as little-endian 16-bit words (a trailing odd byte counts alone), folding the carry
// back in after every add, with the 4-byte CheckSum field read as zero; fold once more; add the file length.
export function computePeChecksum(buf, checksumOffset = parsePe(buf).checksumOffset) {
  const len = buf.length;
  const skipLo = checksumOffset, skipHi = checksumOffset + 4;
  const byteAt = (i) => (i >= skipLo && i < skipHi ? 0 : buf[i]);
  let sum = 0;
  const even = len - (len & 1);
  if ((checksumOffset & 1) === 0) {
    // the common case (the field is word aligned): skip whole words, no per-byte test in the hot loop
    for (let i = 0; i < even; i += 2) {
      if (i === skipLo) { i += 2; continue; }
      sum += buf[i] | (buf[i + 1] << 8);
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  } else {
    for (let i = 0; i < even; i += 2) {
      sum += byteAt(i) | (byteAt(i + 1) << 8);
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  if (len & 1) { sum += byteAt(len - 1); sum = (sum & 0xffff) + (sum >>> 16); }
  sum = (sum & 0xffff) + (sum >>> 16);
  return (sum + len) >>> 0;
}

export function verifyPeChecksum(buf) {
  const pe = parsePe(buf);
  const computed = computePeChecksum(buf, pe.checksumOffset);
  return { stored: pe.storedChecksum, computed, ok: pe.storedChecksum === computed };
}

// Writes the correct CheckSum into buf (in place) and returns it. Used after the SEA injection too: postject rewrites the image and
// does not maintain the field.
export function updatePeChecksum(buf) {
  const pe = parsePe(buf);
  const sum = computePeChecksum(buf, pe.checksumOffset);
  buf.writeUInt32LE(sum, pe.checksumOffset);
  return sum;
}

// The WIN_CERTIFICATE entries of the table, validated. Throws PeFormatError when the table is not what Authenticode writes.
export function readCertificateTable(buf, pe = parsePe(buf)) {
  const { offset, size } = pe.certificateTable;
  if (offset === 0 && size === 0) return { signed: false, entries: [] };
  need(offset !== 0 && size !== 0, 'malformed certificate directory: offset ' + offset + ', size ' + size + ' (one is zero, the other is not)');
  need(offset % 8 === 0, 'certificate table offset ' + offset + ' is not quadword aligned');
  need(offset >= pe.endOfSectionData, 'certificate table at ' + offset + ' overlaps section data (ends at ' + pe.endOfSectionData + ')');
  need(offset + size <= buf.length, 'certificate table [' + offset + ', ' + (offset + size) + ') runs past the end of the file (' + buf.length + ')');
  const tail = buf.subarray(offset + size);
  need(tail.length < 8 && tail.every((b) => b === 0),
    'the certificate table does not end the file: ' + tail.length + ' byte(s) follow it - stripping would drop data that is not the signature');
  const entries = [];
  let p = offset;
  while (p < offset + size) {
    need(p + 8 <= offset + size, 'truncated WIN_CERTIFICATE header at ' + p);
    const dwLength = buf.readUInt32LE(p);
    const wRevision = buf.readUInt16LE(p + 4);
    const wCertificateType = buf.readUInt16LE(p + 6);
    need(dwLength >= 8 && p + dwLength <= offset + size, 'WIN_CERTIFICATE at ' + p + ' has length ' + dwLength + ' outside the table');
    need(wRevision === WIN_CERT_REVISION_1_0 || wRevision === WIN_CERT_REVISION_2_0, 'WIN_CERTIFICATE at ' + p + ' has unknown revision 0x' + wRevision.toString(16));
    entries.push({ offset: p, length: dwLength, revision: wRevision, type: wCertificateType });
    p += quadAlign(dwLength); // entries are quadword aligned
  }
  need(p === offset + size || (p > offset + size && p - (offset + size) < 8), 'WIN_CERTIFICATE entries do not tile the table');
  return { signed: true, entries };
}

// Returns { buffer, wasSigned, removed: {offset,size}|null, checksumBefore, checksumAfter }. The input is never modified. An image
// with no certificate table comes back as an identical copy (wasSigned false) with its checksum made correct.
export function stripSignature(input) {
  const pe = parsePe(input);
  need(pe.securityDirOffset !== null, 'the image has no security data directory (NumberOfRvaAndSizes ' + pe.numberOfRvaAndSizes + ')');
  const table = readCertificateTable(input, pe);
  const checksumBefore = pe.storedChecksum;
  const out = Buffer.from(table.signed ? input.subarray(0, pe.certificateTable.offset) : input);
  out.writeUInt32LE(0, pe.securityDirOffset);
  out.writeUInt32LE(0, pe.securityDirOffset + 4);
  const checksumAfter = updatePeChecksum(out);
  return {
    buffer: out, wasSigned: table.signed,
    removed: table.signed ? { offset: pe.certificateTable.offset, size: pe.certificateTable.size, entries: table.entries.length } : null,
    checksumBefore, checksumAfter,
  };
}

export function certificateDirectory(buf) {
  const pe = parsePe(buf);
  return { ...pe.certificateTable, empty: pe.certificateTable.offset === 0 && pe.certificateTable.size === 0 };
}

export { PeFormatError };

// Whether two paths name one file however they are spelled: case, a junction or symlink (realpath), a hard link (dev + ino).
// A spelling comparison alone let `<dir>\in.exe <junction-to-dir>\in.exe` overwrite the input.
export function sameFile(a, b) {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (!existsSync(a) || !existsSync(b)) return false;
  const ra = realpathSync.native(a); const rb = realpathSync.native(b);
  if (process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb) return true;
  const sa = statSync(a, { bigint: true }); const sb = statSync(b, { bigint: true });
  return sa.dev === sb.dev && sa.ino === sb.ino && sa.ino !== 0n;
}

// the CLI runs when this file is the program, however it was spelled (case, junction, symlink); importing it runs nothing
const isMain = (() => { try { const a = realpathSync(process.argv[1] || ''); const b = realpathSync(fileURLToPath(import.meta.url)); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--info' && args[1]) {
      const buf = readFileSync(args[1]);
      const pe = parsePe(buf);
      const table = readCertificateTable(buf, pe);
      console.log(JSON.stringify({ ...pe, sections: pe.sections.length, certificates: table.entries, checksum: verifyPeChecksum(buf) }, null, 2));
    } else if (args.length === 2 && !args[0].startsWith('--')) {
      const src = resolve(args[0]); const dst = resolve(args[1]);
      if (sameFile(src, dst)) throw new Error('refusing to overwrite the input; give a different output path');
      const r = stripSignature(readFileSync(src));
      writeFileSync(dst, r.buffer);
      console.log(JSON.stringify({ wasSigned: r.wasSigned, removed: r.removed, checksumBefore: r.checksumBefore, checksumAfter: r.checksumAfter, bytes: r.buffer.length }));
    } else {
      console.error('usage: pe-strip-signature.mjs --info <file> | <in.exe> <out.exe>');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error('pe-strip-signature: REFUSED: ' + (e && e.message || e));
    process.exitCode = 1;
  }
}
