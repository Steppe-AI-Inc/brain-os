// THE RECIPIENT'S CHECKS, tried against every bundle they must refuse. Each bad bundle is otherwise consistent (hashed and signed
// after the damage), so a refusal is the work of the check that is named, not of an earlier one.
//   node test/bundle_acceptance.mjs            (RELAY_LIB_DIR=<dir> points it at another copy of relay/lib: the mutation proof)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { CANDIDATE, makeBundle, newSigningKey, reporter, sha256Hex, sshSign } from './helpers.mjs';

const LIB = process.env.RELAY_LIB_DIR ? pathToFileURL(join(process.env.RELAY_LIB_DIR, '/')).href : new URL('../relay/lib/', import.meta.url).href;
const { verifyBundle, CHECKS } = await import(LIB + 'bundle.mjs');
const { crc32 } = await import(LIB + 'zipsafe.mjs');

const t = reporter('artifact relay bundle acceptance');
const run = (b, opts = {}) => verifyBundle({ archiveName: b.archiveName, archive: b.archive, sha256File: b.sha256File, signatureFile: b.signatureFile,
  trustFingerprint: 'trust' in opts ? opts.trust : b.fingerprint, candidateSha: opts.candidate ?? b.candidate, record: opts.record ?? null });
const verdict = (v) => (v.ok ? 'ok' : v.failed);

/** one row: every variant must be refused by `check`, must return no file, and must not run a later check */
function group(label, check, variants) {
  const wrong = [];
  for (const [what, make, opts] of variants) {
    let got;
    try {
      const v = run(make(), opts ?? {});
      const last = v.checks.at(-1);
      got = verdict(v);
      if (got === check && (v.files.length !== 0 || last.name !== check || last.ok || v.checks.length !== CHECKS.indexOf(check) + 1)) got = check + ' but the result is not a clean refusal';
    } catch (e) { got = 'THREW ' + e.message; }
    if (got !== check) wrong.push(what + ' -> ' + got);
  }
  t.row(label + ' (' + variants.length + ' ways)', wrong.length === 0, wrong.join(' | '));
}

const key = newSigningKey();
const bundle = (change = {}, more = {}) => makeBundle({ key, change, ...more });
const withEntry = (entry) => () => bundle({ entries: (list) => [...list, entry] });
const editEntry = (match, edit) => () => bundle({ entries: (list) => list.map((e) => (e.name.endsWith(match) ? { ...e, ...edit(e) } : e)) });

// ------------------------------------------------------------------------------------------------------------------ the good case
{
  const b = bundle();
  const v = run(b);
  const same = v.ok && v.files.length === 5 && [...b.files].every(([name, data]) => v.files.find((f) => f.path === name)?.bytes.equals(data))
    && v.files.every((f) => f.sha256 === sha256Hex(f.bytes) && f.size === f.bytes.length);
  t.row('B01 a consistent bundle passes all five checks in order and yields exactly its five files, byte for byte',
    same && v.checks.map((c) => c.name).join() === CHECKS.join() && v.checks.every((c) => c.ok) && v.signer === b.fingerprint && v.archiveSha256 === sha256Hex(b.archive), verdict(v));
  t.row('B02 the checksum the reader uses is the standard one', crc32(Buffer.from('123456789')) === 0xcbf43926, crc32(Buffer.from('123456789')).toString(16));
  const withRecord = run(b, { record: { archive_sha256: sha256Hex(b.archive), sender_signing_fingerprint: b.fingerprint } });
  t.row('B03 a bundle that matches the relay record passes', withRecord.ok, verdict(withRecord));
}

// a bundle signed by the real ssh-keygen, so that the reader is not only tried against this test's own writer
{
  const dir = mkdtempSync(join(tmpdir(), 'relay-keygen-'));
  let detail = '', ok = false, wrongNs = false;
  try {
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'relay-test', '-f', join(dir, 'k')]);
    const b = bundle();
    writeFileSync(join(dir, 'a.sha256'), b.sha256File);
    execFileSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', join(dir, 'k'), '-n', 'file', join(dir, 'a.sha256')], { stdio: 'pipe' });
    const fp = execFileSync('ssh-keygen', ['-l', '-f', join(dir, 'k.pub')]).toString().split(' ')[1];
    const v = run({ ...b, signatureFile: readFileSync(join(dir, 'a.sha256.sig')) }, { trust: fp });
    ok = v.ok && v.signer === fp; detail = verdict(v) + ' ' + fp;
    rmSync(join(dir, 'a.sha256.sig'));
    execFileSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', join(dir, 'k'), '-n', 'git', join(dir, 'a.sha256')], { stdio: 'pipe' });
    wrongNs = verdict(run({ ...b, signatureFile: readFileSync(join(dir, 'a.sha256.sig')) }, { trust: fp })) === 'signature';
  } catch (e) { detail = 'ssh-keygen: ' + e.message.split('\n')[0]; } finally { rmSync(dir, { recursive: true, force: true }); }
  t.row('B04 a signature written by ssh-keygen itself is read and verified, and one in another namespace is refused', ok && wrongNs, detail);
}

// ---------------------------------------------------------------------------------------------------------------------- signature
{
  const other = newSigningKey();
  const b = bundle();
  group('B10 a signature that is not the trusted identity\'s good "file" signature over the .sha256 is refused', 'signature', [
    ['signed by another key', () => bundle({}, { key: other }), { trust: b.fingerprint }],
    ['no trusted fingerprint', () => bundle(), { trust: undefined }],
    ['a malformed trusted fingerprint', () => bundle(), { trust: 'SHA256:short' }],
    ['the namespace git', () => bundle({ sign: { namespace: 'git' } })],
    ['an empty namespace', () => bundle({ sign: { namespace: '' } })],
    ['the .sha256 changed after signing', () => bundle({ sha256File: (f) => Buffer.from(f.toString().replace(/^./, (c) => (c === '0' ? '1' : '0'))) })],
    ['a signature over another file', () => ({ ...bundle(), signatureFile: sshSign(key, Buffer.from('another message\n')).file })],
    ['the signature of another bundle', () => ({ ...bundle(), signatureFile: bundle({ files: (m) => m.set('extra', Buffer.from('x')) }).signatureFile })],
    ['trailing bytes in the signature', () => bundle({ sign: { trailing: Buffer.from('x') } })],
    ['reserved data', () => bundle({ sign: { reserved: 'x' } })],
    ['an unknown version', () => bundle({ sign: { version: 2 } })],
    ['the hash md5', () => bundle({ sign: { hash: 'md5' } })],
    ['a key that says it is RSA', () => bundle({ sign: { keyType: 'ssh-rsa' } })],
    ['no armor', () => ({ ...bundle(), signatureFile: Buffer.from('not a signature\n') })],
    ['armor without its end', () => { const x = bundle(); return { ...x, signatureFile: Buffer.from(x.signatureFile.toString().replace('-----END SSH SIGNATURE-----\n', '')) }; }],
    ['armor with a foreign character', () => { const x = bundle(); return { ...x, signatureFile: Buffer.from(x.signatureFile.toString().replace('\n', '\n!')) }; }],
    ['an empty signature file', () => ({ ...bundle(), signatureFile: Buffer.alloc(0) })],
    ['the relay record names another signer', () => bundle(), { record: { archive_sha256: 'x', sender_signing_fingerprint: 'SHA256:' + 'A'.repeat(43) } }],
  ]);
}

// ----------------------------------------------------------------------------------------------------------------- archive sha256
group('B20 an archive that is not the one the signed .sha256 names is refused', 'archive_sha256', [
  ['one byte of the archive changed', () => { const x = bundle(); const a = Buffer.from(x.archive); a[40] ^= 1; return { ...x, archive: a }; }],
  ['one byte appended to the archive', () => { const x = bundle(); return { ...x, archive: Buffer.concat([x.archive, Buffer.from([0])]) }; }],
  ['the .sha256 names another file', () => bundle({ line: (l) => l.replace('CANDIDATE2_HANDOFF', 'CANDIDATE2_HANDOVER') })],
  ['the .sha256 carries another hash', () => bundle({ line: (l) => sha256Hex('x') + l.slice(64) })],
  ['two lines in the .sha256', () => bundle({ line: (l) => l + l })],
  ['an upper-case hash', () => bundle({ line: (l) => l.slice(0, 64).toUpperCase() + l.slice(64) })],
  ['a path in the .sha256', () => bundle({ line: (l) => l.replace(' *', ' *./') })],
  ['an empty .sha256', () => bundle({ line: () => '' })],
]);
{
  const b = bundle();
  const v = run(b, { record: { archive_sha256: sha256Hex('other'), sender_signing_fingerprint: b.fingerprint } });
  t.row('B21 an archive that does not hash to the value the relay recorded is refused', verdict(v) === 'archive_sha256' && v.files.length === 0, verdict(v));
}

// ------------------------------------------------------------------------------------------------------- archive paths and shape
const badNames = ['../evil.md', '../../evil.md', '/abs.md', 'a\\b.md', 'C:/x.md', 'C:x.md', 'a/../b.md', './a.md', 'a/./b.md', 'a//b.md', 'dir/', 'trail./x.md', 'x.md.',
  'nul', 'NUL.md', 'a/con.txt', 'com1', 'LPT9.md', 'caf\xe9.md', 'a b.md', '-rf.md', 'a/-x', 'tab\tname', 'x'.repeat(201), 'a?b', 'a*b', 'a|b', 'a<b', 'a"b', 'a\x00b', '~/x', '$x', 'a;b', "a'b"];
group('B30 an archive with an unsafe entry name is refused', 'archive_paths', [
  ...badNames.map((name) => [JSON.stringify(name).slice(0, 24), withEntry({ name, data: 'x' })]),
  ['an empty name', withEntry({ name: '', data: 'x' })],
]);
group('B31 an archive in which a name appears twice, or is both a file and a directory, is refused', 'archive_paths', [
  ['the same name twice', () => bundle({ entries: (l) => [...l, { ...l[1] }] })],
  ['the same name in another case', () => bundle({ entries: (l) => [...l, { name: l[1].name.toUpperCase(), data: 'x' }] })],
  ['a file and a directory of one name', () => bundle({ entries: (l) => [...l, { name: 'x', data: '1' }, { name: 'x/y', data: '2' }] })],
  ['a directory under an existing file', () => bundle({ entries: (l) => [...l, { name: l[1].name + '/inner', data: 'x' }] })],
]);
group('B32 an archive that a second tool could read differently is refused', 'archive_paths', [
  ['a file record that the directory does not list', () => bundle({ shape: { hidden: [{ name: 'hidden.md', data: 'hidden' }] } })],
  ['bytes in front of the first record', () => bundle({ shape: { prefix: Buffer.from('#!/bin/sh\n') } })],
  ['a whole archive in front', () => bundle({ shape: { prefix: bundle().archive } })],
  ['bytes between the files and the directory', () => bundle({ shape: { gap: Buffer.from('gap') } })],
  ['bytes after the end record', () => bundle({ shape: { trailer: Buffer.from('tail') } })],
  ['bytes between the directory and the end record', () => bundle({ shape: { cdGap: Buffer.from('gap') } })],
  ['a directory size that is wrong', () => bundle({ shape: { cdSizeDelta: -1 } })],
  ['a disk number', () => bundle({ shape: { disk: 1 } })],
  ['an archive comment', () => bundle({ shape: { comment: Buffer.from('a comment') } })],
  ['a zip64 marker', () => bundle({ shape: { zip64: true } })],
  ['bytes between two file records', editEntry('README.md', () => ({ after: Buffer.from('between') }))],
  ['an entry comment', editEntry('README.md', () => ({ comment: 'note' }))],
  ['another name in the file record', editEntry('README.md', (e) => ({ localName: e.name.replace('README', 'readme') }))],
  ['another flag in the file record', editEntry('README.md', () => ({ localFlags: 0x0800 }))],
  ['not an archive', () => bundle({ archive: () => Buffer.from('this is not a zip file at all, only some text that is long enough') })],
  ['an empty archive', () => bundle({ entries: () => [] })],
  ['a truncated archive', () => bundle({ archive: (a) => a.subarray(0, a.length - 30) })],
  ['65 entries', () => bundle({ entries: (l) => [...l, ...Array.from({ length: 60 }, (_, i) => ({ name: 'f' + i, data: 'x' }))] })],
]);
group('B33 an entry that is encrypted, deferred, a link, or packed in another way is refused', 'archive_paths', [
  ['the encryption flag', editEntry('README.md', () => ({ flags: 0x0001 }))],
  ['a data descriptor', editEntry('README.md', () => ({ flags: 0x0008 }))],
  ['strong encryption', editEntry('README.md', () => ({ flags: 0x0040 }))],
  ['a masked directory', editEntry('README.md', () => ({ flags: 0x2000 }))],
  ['bzip2', editEntry('README.md', () => ({ method: 12, packed: Buffer.from('BZh9') }))],
  // deflate data under another method's number: a reader that ignored the number would unpack it
  ['deflate64', editEntry('README.md', (e) => ({ method: 9, packed: deflateRawSync(Buffer.from(e.data)) }))],
  ['an unknown method', editEntry('README.md', (e) => ({ method: 99, packed: deflateRawSync(Buffer.from(e.data)) }))],
  ['a symbolic link', editEntry('README.md', () => ({ madeBy: 0x0314, extAttr: (0o120777 << 16) >>> 0, method: 0, data: '../../outside' }))],
  ['a device', editEntry('README.md', () => ({ madeBy: 0x0314, extAttr: (0o020644 << 16) >>> 0 }))],
  ['a directory by its type', editEntry('README.md', () => ({ madeBy: 0x0314, extAttr: (0o040755 << 16) >>> 0 }))],
]);
group('B34 an entry whose bytes are not what it declares is refused', 'archive_paths', [
  ['a wrong checksum', editEntry('README.md', () => ({ crc: 0x12345678 }))],
  ['more bytes than declared (a bomb)', editEntry('README.md', () => ({ usize: 10 }))],
  ['fewer bytes than declared', editEntry('README.md', (e) => ({ usize: Buffer.from(e.data).length + 5 }))],
  ['bytes after the compressed data', editEntry('README.md', (e) => ({ packed: Buffer.concat([deflateRawSync(Buffer.from(e.data)), Buffer.from('extra')]) }))],
  ['a cut compressed stream', editEntry('README.md', (e) => ({ packed: deflateRawSync(Buffer.from(e.data)).subarray(0, 5) }))],
  ['stored with two sizes', editEntry('README.md', (e) => ({ method: 0, usize: Buffer.from(e.data).length + 1 }))],
  ['a file over the size limit', withEntry({ name: 'big.bin', data: Buffer.alloc(4 * 1048576 + 1) })],
  ['a total over the size limit', () => bundle({ entries: (l) => [...l, ...[1, 2, 3].map((i) => ({ name: 'big' + i, data: Buffer.alloc(3 * 1048576) }))] })],
  ['a record that runs into the directory', editEntry('SHA256SUMS', (e) => ({ csize: 100000 }))],
]);

// ----------------------------------------------------------------------------------------------------------------------- file set
group('B40 an archive that does not hold exactly the expected files of this candidate is refused', 'file_set', [
  ['one file more', withEntry({ name: 'extra.md', data: 'x' })],
  ['one file more, inside the private folder', withEntry({ name: 'c2-private-c667367/extra.md', data: 'x' })],
  ['one file fewer', () => bundle({ entries: (l) => l.filter((e) => !e.name.endsWith('README.md')) })],
  ['the notice is missing', () => bundle({ entries: (l) => l.filter((e) => !e.name.includes('NOTICE')) })],
  ['a file under another name', () => bundle({ entries: (l) => l.map((e) => (e.name.endsWith('c2_residuals.md') ? { ...e, name: e.name.replace('residuals', 'residual') } : e)) })],
  ['a file in another folder', () => bundle({ entries: (l) => l.map((e) => (e.name.endsWith('README.md') ? { ...e, name: 'README.md' } : e)) })],
  ['a name in another case', () => bundle({ entries: (l) => l.map((e) => (e.name.endsWith('README.md') ? { ...e, name: e.name.replace('README.md', 'Readme.md') } : e)) })],
  ['an archive named for another purpose', () => bundle({ archiveName: 'OTHER_c667367.zip' })],
  ['an archive named for a path', () => bundle({ archiveName: '../CANDIDATE2_HANDOFF_c667367.zip' })],
  ['the inner names of another candidate', () => makeBundle({ key, short: 'aaaaaaa', change: { archiveName: 'CANDIDATE2_HANDOFF_c667367.zip' } })],
  ['the inner names of another candidate number', () => makeBundle({ key, n: 3, change: { archiveName: 'CANDIDATE2_HANDOFF_c667367.zip' } })],
  ['a delivery for another candidate', () => bundle(), { candidate: '412ac14e76f88fbd5e310d3e97dbf5acab2c1498' }],
  ['a candidate that is not a full commit id', () => bundle(), { candidate: 'c667367' }],
]);

// --------------------------------------------------------------------------------------------------------------------- sha256sums
group('B50 an archive whose own SHA256SUMS does not hold is refused', 'sha256sums', [
  ['one listed hash is wrong', () => bundle({ sums: (s) => (s[0] === '0' ? '1' : '0') + s.slice(1) })],
  ['a file changed after the list was made', () => bundle({ entries: (l) => l.map((e) => (e.name.endsWith('README.md') ? { ...e, data: 'changed\n' } : e)) })],
  ['the notice is not what makes it fail: the matrix changed', () => bundle({ entries: (l) => l.map((e) => (e.name.endsWith('c2_matrix.private.md') ? { ...e, data: 'changed\n' } : e)) })],
  ['the list names only two files', () => bundle({ sums: (s) => s.split('\n').slice(0, 2).join('\n') + '\n' })],
  ['the list names a file twice', () => bundle({ sums: (s) => s + s.split('\n')[0] + '\n' })],
  ['the list names the wrong three files', () => bundle({ sums: (s) => s.replace('README.md', 'SHA256SUMS') })],
  ['the list names a path', () => bundle({ sums: (s) => s.replace('*README.md', '*../README.md') })],
  ['an empty list', () => bundle({ sums: () => '' })],
  ['a list with no final newline', () => bundle({ sums: (s) => s.slice(0, -1) })],
  ['a list with a comment line', () => bundle({ sums: (s) => '# sums\n' + s })],
  ['a list with upper-case hashes', () => bundle({ sums: (s) => s.toUpperCase().replace(/README\.MD/, 'README.md') })],
]);

// ----------------------------------------------------------------------------------------------------------------- order and reach
{
  const other = newSigningKey();
  const twice = makeBundle({ key: other, change: { entries: (l) => [...l, { name: '../evil.md', data: 'x' }] } });
  const v = run(twice, { trust: bundle().fingerprint });
  const zipThenSet = run(bundle({ entries: (l) => [...l.filter((e) => !e.name.endsWith('README.md')), { name: '../evil.md', data: 'x' }] }));
  t.row('B60 the checks run in the stated order: the first one that fails is the one reported, and none after it runs',
    verdict(v) === 'signature' && v.checks.length === 1 && verdict(zipThenSet) === 'archive_paths' && zipThenSet.checks.length === 3, verdict(v) + ' / ' + verdict(zipThenSet));
  const reach = [];
  for (const f of ['bundle.mjs', 'zipsafe.mjs', 'sshsig.mjs']) {
    const src = readFileSync(new URL(f, LIB), 'utf8');
    for (const banned of ['node:fs', 'node:child_process', 'node:net', 'node:http', 'node:os', 'node:path', 'fetch(', 'process.env', 'eval(', 'Function(']) if (src.includes(banned)) reach.push(f + ' uses ' + banned);
  }
  t.row('B61 the verification code cannot write a file, start a process or open a connection: it is given bytes and returns a verdict', reach.length === 0, reach.join('; '));
  // the node command itself (always the real one, whatever copy of the verification code is under test)
  const command = { 'relay.mjs': readFileSync(new URL('../relay/relay.mjs', import.meta.url), 'utf8'), 'client.mjs': readFileSync(new URL('../relay/lib/client.mjs', import.meta.url), 'utf8') };
  const does = [];
  for (const [f, src] of Object.entries(command)) {
    for (const banned of ['node:child_process', 'node:net', 'node:http', 'node:https', 'node:dgram', 'node:worker_threads', 'node:vm', 'eval(', 'Function(', 'import(']) if (src.includes(banned)) does.push(f + ' uses ' + banned);
  }
  const connections = Object.values(command).reduce((n, src) => n + (src.match(/\bfetch\(/g) ?? []).length, 0);
  t.row('B62 the node command starts no process and loads no code at run time, and it has one place that opens a connection: the signed request to the relay address',
    does.length === 0 && connections === 1 && command['client.mjs'].includes('res = await fetch(url, {'), does.join('; ') + ' connections=' + connections);
}

process.exit(t.done());
