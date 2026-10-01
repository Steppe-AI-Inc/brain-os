// Test material: a zip writer that can also write the archives the verifier must refuse, and a detached-signature writer.
// Every bundle made here is throwaway content signed by a throwaway key. Nothing private is ever read by a test.
import { deflateRawSync } from 'node:zlib';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { crc32 } from '../relay/lib/zipsafe.mjs';

export const sha256Hex = (b) => createHash('sha256').update(b).digest('hex');
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };

/**
 * entries: [{ name, data, method = 8, flags = 0, madeBy = 0x14, extAttr = 0, comment = '', localName, localFlags, crc, usize, packed, after }]
 * shape: { prefix, gap, cdGap, cdSizeDelta, trailer, comment, hidden: [entries with a file record but no directory entry], zip64 }
 */
export function makeZip(entries, shape = {}) {
  const parts = [shape.prefix ?? Buffer.alloc(0)];
  let offset = parts[0].length;
  const directory = [];
  const add = (e, listed) => {
    const data = Buffer.from(e.data ?? '');
    const method = e.method ?? 8, flags = e.flags ?? 0;
    const packed = e.packed ?? (method === 8 ? deflateRawSync(data) : data);
    const crc = e.crc ?? crc32(data), usize = e.usize ?? data.length, csize = e.csize ?? packed.length;
    const name = Buffer.from(e.name, 'latin1'), localName = Buffer.from(e.localName ?? e.name, 'latin1');
    const record = Buffer.concat([u32(0x04034b50), u16(20), u16(e.localFlags ?? flags), u16(method), u16(0), u16(0), u32(crc), u32(csize), u32(usize),
      u16(localName.length), u16(0), localName, packed, e.after ?? Buffer.alloc(0)]);
    if (listed) {
      const comment = Buffer.from(e.comment ?? '');
      directory.push(Buffer.concat([u32(0x02014b50), u16(e.madeBy ?? 0x14), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(csize), u32(usize),
        u16(name.length), u16(0), u16(comment.length), u16(0), u16(0), u32(e.extAttr ?? 0), u32(offset), name, comment]));
    }
    parts.push(record); offset += record.length;
  };
  for (const e of entries) add(e, true);
  for (const e of shape.hidden ?? []) add(e, false);
  const gap = shape.gap ?? Buffer.alloc(0);
  parts.push(gap); offset += gap.length;
  const cd = Buffer.concat(directory), cdGap = shape.cdGap ?? Buffer.alloc(0), comment = shape.comment ?? Buffer.alloc(0);
  const count = shape.zip64 ? 0xffff : directory.length;
  parts.push(cd, cdGap, u32(0x06054b50), u16(shape.disk ?? 0), u16(0), u16(count), u16(count), u32(cd.length + cdGap.length + (shape.cdSizeDelta ?? 0)), u32(offset), u16(comment.length), comment,
    shape.trailer ?? Buffer.alloc(0));
  return Buffer.concat(parts);
}

export const newSigningKey = () => generateKeyPairSync('ed25519').privateKey;
const sshString = (b) => { const data = Buffer.from(b); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, data]); };

/** what `ssh-keygen -Y sign -n <namespace>` writes, made here so that a test can also make the signatures a verifier must refuse */
export function sshSign(privateKey, message, { namespace = 'file', hash = 'sha512', reserved = '', keyType = 'ssh-ed25519', trailing = Buffer.alloc(0), version = 1 } = {}) {
  const pub = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x, 'base64url');
  const keyBlob = Buffer.concat([sshString(keyType), sshString(pub)]);
  const signed = Buffer.concat([Buffer.from('SSHSIG'), sshString(namespace), sshString(reserved), sshString(hash), sshString(createHash(hash).update(message).digest())]);
  const sigBlob = Buffer.concat([sshString('ssh-ed25519'), sshString(sign(null, signed, privateKey))]);
  const v = Buffer.alloc(4); v.writeUInt32BE(version);
  const raw = Buffer.concat([Buffer.from('SSHSIG'), v, sshString(keyBlob), sshString(namespace), sshString(reserved), sshString(hash), sshString(sigBlob), trailing]);
  const b64 = raw.toString('base64').replace(/(.{70})/g, '$1\n').replace(/\n$/, '');
  return {
    file: Buffer.from('-----BEGIN SSH SIGNATURE-----\n' + b64 + '\n-----END SSH SIGNATURE-----\n'),
    fingerprint: 'SHA256:' + createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, ''),
  };
}

export const CANDIDATE = 'c667367b6d0fcf02a4d575f050aaa475c644ca7b';

/**
 * A candidate private handoff with throwaway content. `change` edits any stage of it:
 *   files(map)         the content files before SHA256SUMS is computed
 *   sums(text)         the SHA256SUMS text
 *   entries(list)      the zip entries
 *   shape              the zip shape (makeZip)
 *   archive(buf)       the finished archive, before it is hashed
 *   line(text)         the .sha256 line, before it is signed
 *   sha256File(buf)    the .sha256 file, AFTER it was signed
 *   sign               options for sshSign
 */
export function makeBundle({ key = newSigningKey(), n = 2, short = 'c667367', change = {} } = {}) {
  const dir = `c${n}-private-${short}`;
  let files = new Map([
    [`CANDIDATE${n}_NOTICE_${short}.md`, Buffer.from(`# test notice for ${short}\n` + 'not a real notice\n'.repeat(40))],
    [`${dir}/README.md`, Buffer.from('test readme\n'.repeat(30))],
    [`${dir}/c${n}_matrix.private.md`, Buffer.from('| id | state |\n' + '| T-1 | TEST |\n'.repeat(200))],
    [`${dir}/c${n}_residuals.md`, Buffer.from('test residuals\n'.repeat(50))],
  ]);
  if (change.files) files = change.files(files) ?? files;
  let sums = [`c${n}_matrix.private.md`, `c${n}_residuals.md`, 'README.md'].map((f) => `${sha256Hex(files.get(`${dir}/${f}`) ?? Buffer.alloc(0))} *${f}\n`).join('');
  if (change.sums) sums = change.sums(sums);
  let entries = [...files].map(([name, data]) => ({ name, data }));
  entries.push({ name: `${dir}/SHA256SUMS`, data: Buffer.from(sums) });
  if (change.entries) entries = change.entries(entries) ?? entries;
  let archive = makeZip(entries, change.shape ?? {});
  if (change.archive) archive = change.archive(archive);
  const archiveName = change.archiveName ?? `CANDIDATE${n}_HANDOFF_${short}.zip`;
  let line = `${sha256Hex(archive)} *${archiveName}\n`;
  if (change.line) line = change.line(line);
  let sha256File = Buffer.from(line);
  const signature = sshSign(key, sha256File, change.sign ?? {});
  if (change.sha256File) sha256File = change.sha256File(sha256File);
  return { archiveName, archive, sha256File, signatureFile: signature.file, fingerprint: signature.fingerprint, files, candidate: CANDIDATE };
}

/** the row reporter every relay test uses: OK / FAIL lines and a counted summary; a crash is a named row, never a silent exit */
export function reporter(name) {
  let ok = 0; const failed = [];
  const row = (label, cond, detail = '') => {
    if (cond) { ok++; console.log('OK   ' + label + (detail ? ' - ' + detail : '')); }
    else { failed.push(label.split(' ')[0]); console.log('FAIL ' + label + (detail ? ' - ' + detail : '')); }
  };
  const done = () => {
    console.log('\n' + name + ': ' + ok + '/' + (ok + failed.length) + ' OK' + (failed.length ? '; FAILED: ' + failed.join(' ') : ''));
    return failed.length ? 1 : 0;
  };
  return { row, done };
}
