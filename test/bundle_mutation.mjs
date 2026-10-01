// MUTATION PROOF for the recipient's checks: each mutant removes one rule from a copy of relay/lib; the bundle acceptance must go
// red for it. A mutant that cannot be applied, that breaks the code outright, or that the acceptance does not notice fails this proof.
//   node test/bundle_mutation.mjs [V01 V02 ...]
import { applySwaps, mutationProof, runNode } from './classify.mjs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['bundle.mjs', 'zipsafe.mjs', 'sshsig.mjs'];
const SRC = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(ROOT, 'relay', 'lib', f), 'utf8').replace(/\r\n/g, '\n')]));

const MUTANTS = [
  // the signature
  ['V01', 'sshsig.mjs', 'any namespace is accepted', `if (sig.namespace !== namespace) return`, `if (false) return`],
  ['V02', 'sshsig.mjs', 'the signature is not checked', `good = verify(null, signed,`, `good = true || verify(null, signed,`],
  ['V03', 'sshsig.mjs', 'reserved data is accepted', `if (reserved.length !== 0) throw`, `if (false) throw`],
  ['V04', 'sshsig.mjs', 'any signature version is accepted', `if (r.take(4).readUInt32BE(0) !== 1) throw`, `if (r.take(4).readUInt32BE(0) === 0) throw`],
  ['V05', 'sshsig.mjs', 'trailing bytes are accepted', `end() { if (this.at !== this.buf.length) throw`, `end() { if (false) throw`],
  ['V06', 'sshsig.mjs', 'any hash algorithm is accepted', `if (hashAlgorithm !== 'sha512' && hashAlgorithm !== 'sha256') throw`, `if (false) throw`],
  ['V07', 'sshsig.mjs', 'a key of another type is accepted', `if (keyType !== 'ssh-ed25519') throw`, `if (false) throw`],
  ['V08', 'bundle.mjs', 'the signer is not compared with the trusted identity', `if (sig.fingerprint !== trustFingerprint) return fail(`, `if (false) return fail(`],
  ['V09', 'bundle.mjs', 'the signer is not compared with the relay record', `if (record && record.sender_signing_fingerprint !== sig.fingerprint) return fail(`, `if (false) return fail(`],
  ['V10', 'bundle.mjs', 'the signature is checked over the archive name, not the .sha256', `message: sha256File, namespace: 'file'`, `message: Buffer.from(archiveName), namespace: 'file'`],
  // the archive hash
  ['V11', 'bundle.mjs', 'the .sha256 may name another file', `if (declared.name !== archiveName) return fail(`, `if (false) return fail(`],
  ['V12', 'bundle.mjs', 'the archive is not compared with the signed hash', `if (actual !== declared.sha256) return fail(`, `if (false) return fail(`],
  ['V13', 'bundle.mjs', 'the archive is not compared with the relay record', `if (record && record.archive_sha256 !== actual) return fail(`, `if (false) return fail(`],
  ['V14', 'bundle.mjs', 'a .sha256 of several lines is accepted', `\\r?\\n?$/.exec(buf.toString('latin1'))`, `\\r?\\n?/.exec(buf.toString('latin1'))`],
  // the file set
  ['V15', 'bundle.mjs', 'an extra file is accepted', `if (missing.length || extra.length) return fail(`, `if (missing.length) return fail(`],
  ['V16', 'bundle.mjs', 'a missing file is accepted', `if (missing.length || extra.length) return fail(`, `if (extra.length) return fail(`],
  ['V17', 'bundle.mjs', 'an archive for another candidate is accepted', `if (!candidateSha.startsWith(short)) return`, `if (false) return`],
  ['V18', 'bundle.mjs', 'an archive under any name is accepted', `if (!m) return { error: 'the archive is not named like a candidate private handoff' };`,
    `if (!m) return { name: 'x', notice: 'x', sums: 'c2-private-c667367/SHA256SUMS', sumsDir: 'c2-private-c667367', listed: ['README.md', 'c2_matrix.private.md', 'c2_residuals.md'], files: ['CANDIDATE2_NOTICE_c667367.md', 'c2-private-c667367/README.md', 'c2-private-c667367/c2_matrix.private.md', 'c2-private-c667367/c2_residuals.md', 'c2-private-c667367/SHA256SUMS'] };`],
  // the SHA256SUMS inside
  ['V19', 'bundle.mjs', 'a listed hash is not compared', 'if (sha256Hex(byName.get(`${profile.sumsDir}/${s.name}`)) !== s.sha256) return fail(', 'if (false) return fail('],
  ['V20', 'bundle.mjs', 'the list may name other files, or fewer', `if (listedNames.length !== profile.listed.length || new Set(listedNames).size !== listedNames.length || !profile.listed.every((f) => listedNames.includes(f))) {`, `if (false) {`],
  ['V21', 'bundle.mjs', 'a list with no final newline is accepted', `if (text.length === 0 || !text.endsWith('\\n')) return null;`, `if (text.length === 0) return null; if (!text.endsWith('\\n')) return parseSha256Sums(Buffer.from(text + '\\n'));`],
  // the archive's paths
  ['V30', 'zipsafe.mjs', 'no name is unsafe', `export function unsafePathReason(name) {`, `export function unsafePathReason(name) { return null;`],
  ['V31', 'zipsafe.mjs', 'any character is accepted in a name', `if (!/^[A-Za-z0-9._\\/-]+$/.test(name)) return`, `if (false) return`],
  // a ".." segment is stopped twice (by name, and as a segment that ends with a dot): the mutant removes both, V34 removes the second alone
  ['V32', 'zipsafe.mjs', 'a path may climb', `if (part === '.' || part === '..') return`, `if (false) return`, `if (part.endsWith('.')) return`, `if (false) return`],
  ['V33', 'zipsafe.mjs', 'an empty segment is accepted', `if (part === '') return 'an empty path segment';`, ``, `if (name.startsWith('/')) return 'an absolute path';`, ``, `if (name.endsWith('/')) return 'a directory entry';`, ``],
  ['V34', 'zipsafe.mjs', 'a segment may end with a dot', `if (part.endsWith('.')) return`, `if (false) return`],
  ['V35', 'zipsafe.mjs', 'a segment may start with a dash', `if (part.startsWith('-')) return`, `if (false) return`],
  ['V36', 'zipsafe.mjs', 'a device name is accepted', `if (RESERVED.test(part)) return`, `if (false) return`],
  ['V37', 'zipsafe.mjs', 'a name of any length is accepted', `if (Buffer.byteLength(name) > LIMITS.nameBytes) return`, `if (false) return`],
  ['V38', 'zipsafe.mjs', 'a name may appear twice', `if (seen.has(folded)) refuse(`, `if (false) refuse(`],
  ['V39', 'zipsafe.mjs', 'names that differ only in case are two names', `const folded = name.toLowerCase();`, `const folded = name;`],
  ['V40', 'zipsafe.mjs', 'a name may be a file and a directory', `if (other !== e && other.name.toLowerCase().startsWith(e.name.toLowerCase() + '/')) refuse(`, `if (false) refuse(`],
  // the archive's shape
  ['V41', 'zipsafe.mjs', 'the end record is searched for, not required at the end', `const end = buf.length - 22;`, `const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));`],
  ['V42', 'zipsafe.mjs', 'the directory offsets are trusted', `if (e.localOffset !== cursor) refuse('bytes that belong to no listed file');`, `cursor = e.localOffset;`],
  ['V43', 'zipsafe.mjs', 'bytes after the last file are accepted', `if (cursor !== cdOffset) refuse('bytes between the last file and the directory');`, ``],
  ['V44', 'zipsafe.mjs', 'bytes after the last directory entry are accepted', `if (at !== end) refuse('bytes after the last directory entry');`, ``],
  ['V45', 'zipsafe.mjs', 'a wrong directory size is accepted', `if (cdOffset + cdSize !== end) refuse('bytes between the directory and the end record');`, ``],
  ['V46', 'zipsafe.mjs', 'an entry comment is accepted', `if (commentLen !== 0 || diskStart !== 0) refuse(`, `if (false) refuse(`],
  ['V47', 'zipsafe.mjs', 'any entry flag is accepted', `if (flags & ~0x0800) refuse(`, `if (false) refuse(`],
  ['V48', 'zipsafe.mjs', 'any compression method is accepted', `if (method !== 0 && method !== 8) refuse(`, `if (false) refuse(`],
  ['V49', 'zipsafe.mjs', 'a link is accepted', `if ((madeBy >>> 8) === 3 && type !== 0 && type !== 0o100000) refuse(`, `if (false) refuse(`],
  ['V50', 'zipsafe.mjs', 'the record may differ from the directory', `if (flags !== e.flags || method !== e.method || crc !== e.crc || csize !== e.csize || usize !== e.usize) refuse(`, `if (false) refuse(`],
  ['V51', 'zipsafe.mjs', 'the record may carry another name', `if (!buf.subarray(cursor + 30, cursor + 30 + nameLen).equals(e.nameBytes)) refuse(`, `if (false) refuse(`],
  ['V52', 'zipsafe.mjs', 'the checksum is not checked', `if (crc32(bytes) !== e.crc) refuse(`, `if (false) refuse(`],
  ['V53', 'zipsafe.mjs', 'bytes after the compressed data are accepted', `if (out.engine.bytesWritten !== csize) refuse(`, `if (false) refuse(`],
  ['V54', 'zipsafe.mjs', 'a file may unpack to another size than declared', "    if (bytes.length !== usize) refuse(`\"${e.name}\" does not unpack to its declared size`);\n", ''],
  ['V55', 'zipsafe.mjs', 'a file of any size is accepted', 'if (usize > limits.fileBytes) refuse(', 'if (false) refuse('],
  ['V56', 'zipsafe.mjs', 'an archive of any total size is accepted', `if (total > limits.totalBytes) refuse(`, `if (false) refuse(`],
  ['V57', 'zipsafe.mjs', 'any number of entries is accepted', `if (count > limits.entries) refuse('too many entries');`, ``],
  ['V58', 'zipsafe.mjs', 'a disk number is accepted', `if (disk !== 0 || cdDisk !== 0 || onDisk !== count) refuse('a multi-disk archive');`, ``],
];

const tmp = mkdtempSync(join(tmpdir(), 'relay-lib-'));
let code = 1;
try {
  code = mutationProof({
    name: 'artifact relay bundle mutation proof',
    only: process.argv.slice(2).filter((a) => /^V\d+$/.test(a)),
    mutants: MUTANTS,
    describe: ([id, , what]) => [id, what],
    // a copy of relay/lib with one file mutated
    mutate: ([, file, , ...swaps]) => {
      const { text, missing } = applySwaps(SRC[file], swaps);
      if (text === null) return { verdict: 'NOT APPLIED', reason: 'expected exactly one "' + missing.slice(0, 60).replace(/\n/g, ' ') + '"' };
      for (const f of FILES) writeFileSync(join(tmp, f), f === file ? text : SRC[f]);
      return { file: join(tmp, file), env: { RELAY_LIB_DIR: tmp } };
    },
    accept: (env) => { if (!env.RELAY_LIB_DIR) for (const f of FILES) writeFileSync(join(tmp, f), SRC[f]); return runNode(join(ROOT, 'test', 'bundle_acceptance.mjs'), [], { RELAY_LIB_DIR: tmp, ...env }, 180000); },
    shape: { rowId: 'B\\d+', summary: /^artifact relay bundle acceptance: \d+\/\d+ OK/m },
  });
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(code);
