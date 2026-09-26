#!/usr/bin/env node
// UNIT TEST for pe-strip-signature.mjs, on a COPY of the real, officially signed node.exe (never the installed file itself).
//
//   node scripts/factory-build/pe-strip-signature.test.mjs [--exe <signed PE>]     default: process.execPath
//
// U1  the copy parses as PE32+ x64 and carries exactly the certificate table Authenticode writes (ends the file, after sections)
// U2  computePeChecksum reproduces the CheckSum Microsoft's tooling stored in the signed file - the algorithm is checked against an
//     implementation that is not ours, not against itself
// U3  stripSignature: length = the table offset, data directory 4 zeroed, CheckSum = the recomputed sum, and every other byte before
//     the table identical to the input; the input buffer is not modified
// U4  stripping the stripped image is a no-op (same bytes); two strips of one input are byte-identical (deterministic)
// U5  Windows' own verifier: Get-AuthenticodeSignature says Valid for the signed copy and NotSigned for the stripped one
// U6  the stripped node.exe still runs (a real child process prints the result of a computation) - the image was not damaged
// U7  refusals: not MZ; a byte appended after the table (the table no longer ends the file); a table pointing into section data;
//     a half-zero directory entry; a truncated file - each throws PeFormatError, none returns a buffer
// U8  quadword alignment is exact at and beyond 2^31 (the int32 `(n + 7) & ~7` it replaces wrapped negative there, and a
//     well-formed table with a >= 2 GiB WIN_CERTIFICATE threw a RangeError)
// U9  the CLI never writes its input: an output path that is the input through a directory junction, or a hard link to it, is
//     refused (exit 1) and the input keeps its bytes; a genuinely different output path is written (exit 0)
// The work dir's name contains U+2019 on purpose: U5 then proves a path with a typographic apostrophe (C:\Users\O’Brien\...)
// reaches Get-AuthenticodeSignature intact.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  parsePe, computePeChecksum, verifyPeChecksum, stripSignature, readCertificateTable, certificateDirectory, PeFormatError, quadAlign,
} from './pe-strip-signature.mjs';

const exeArg = process.argv.indexOf('--exe');
const SOURCE = exeArg > -1 ? process.argv[exeArg + 1] : process.execPath;
const isWin = process.platform === 'win32';
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(-900) : '')); } };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const refuses = (fn) => { try { fn(); return 'returned'; } catch (e) { return e instanceof PeFormatError ? 'PeFormatError: ' + e.message : 'other: ' + e; } };

const work = mkdtempSync(join(tmpdir(), 'pe-strip-test-O’Brien-'));
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'pe-strip-signature.mjs');
try {
  const copyPath = join(work, 'node-signed-copy.exe');
  copyFileSync(SOURCE, copyPath);
  const signed = readFileSync(copyPath);
  const signedSha = sha(signed);
  console.log('input: copy of ' + SOURCE + ' (' + signed.length + ' bytes, sha256 ' + signedSha + ')');

  // U1
  const pe = parsePe(signed);
  const table = readCertificateTable(signed, pe);
  check('U1 the copy is ' + pe.magic + ' machine 0x' + pe.machine.toString(16) + ' with a certificate table at ' + pe.certificateTable.offset + ' (' + pe.certificateTable.size + ' bytes, ' + table.entries.length + ' WIN_CERTIFICATE) that ends the file and follows all section data',
    pe.magic === 'PE32+' && pe.machine === 0x8664 && table.signed && table.entries.length >= 1
      && pe.certificateTable.offset + pe.certificateTable.size === signed.length && pe.certificateTable.offset >= pe.endOfSectionData
      && table.entries.every((e) => e.type === 2), JSON.stringify({ ct: pe.certificateTable, entries: table.entries, end: pe.endOfSectionData }));

  // U2
  const v = verifyPeChecksum(signed);
  check('U2 computePeChecksum reproduces the CheckSum stored by the signing toolchain (stored 0x' + v.stored.toString(16) + ', computed 0x' + v.computed.toString(16) + ')',
    v.ok && v.stored !== 0, JSON.stringify(v));

  // U3
  const before = Buffer.from(signed);
  const r = stripSignature(signed);
  const out = r.buffer;
  let othersIdentical = out.length === pe.certificateTable.offset;
  const skip = new Set([...Array(4).keys()].map((k) => pe.checksumOffset + k).concat([...Array(8).keys()].map((k) => pe.securityDirOffset + k)));
  if (othersIdentical) for (let i = 0; i < out.length; i++) { if (!skip.has(i) && out[i] !== signed[i]) { othersIdentical = false; break; } }
  const dir = certificateDirectory(out);
  check('U3 strip: ' + signed.length + ' -> ' + out.length + ' bytes (= table offset), directory 4 = {' + dir.offset + ',' + dir.size + '}, CheckSum 0x' + r.checksumBefore.toString(16) + ' -> 0x' + r.checksumAfter.toString(16) + ' (= recomputed), every other byte identical, input untouched',
    r.wasSigned && dir.empty && othersIdentical && out.readUInt32LE(pe.checksumOffset) === computePeChecksum(out) && r.checksumAfter === computePeChecksum(out)
      && signed.equals(before) && r.removed && r.removed.offset === pe.certificateTable.offset,
    JSON.stringify({ wasSigned: r.wasSigned, dir, othersIdentical, removed: r.removed }));

  // U4
  const again = stripSignature(out);
  const twice = stripSignature(signed);
  check('U4 stripping the stripped image changes nothing (wasSigned=' + again.wasSigned + ') and two strips of one input are byte-identical (' + sha(out).slice(0, 16) + ')',
    !again.wasSigned && again.buffer.equals(out) && twice.buffer.equals(out));

  const strippedPath = join(work, 'node-stripped.exe');
  writeFileSync(strippedPath, out);

  // U5
  if (isWin) {
    // the path goes through the environment, never into the -Command text (PowerShell also closes '...' at U+2018-U+201B)
    const ps = (p) => spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AuthenticodeSignature -LiteralPath $env:PE_TEST_FILE).Status.ToString()'], { encoding: 'utf8', env: { ...process.env, PE_TEST_FILE: p } });
    const a = ps(copyPath); const b = ps(strippedPath);
    check('U5 Get-AuthenticodeSignature, in a directory whose name holds U+2019: signed copy ' + a.stdout.trim() + ', stripped ' + b.stdout.trim(),
      work.includes('’') && a.stdout.trim() === 'Valid' && b.stdout.trim() === 'NotSigned', a.stderr + b.stderr);
  } else check('U5 Get-AuthenticodeSignature (Windows only) - SKIPPED on ' + process.platform, false, 'not Windows');

  // U6
  const run = spawnSync(strippedPath, ['-e', 'process.stdout.write(String(6*7) + " " + process.version)'], { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: '' } });
  check('U6 the stripped node.exe still runs: printed "' + String(run.stdout).trim() + '" (exit ' + run.status + ')',
    run.status === 0 && run.stdout.startsWith('42 ' + process.version.split('.')[0]), run.stderr || run.error);

  // U7
  const notMz = Buffer.from(signed.subarray(0, 4096)); notMz[0] = 0;
  const appended = Buffer.concat([signed, Buffer.from([0x41])]);
  const intoSections = Buffer.from(signed.subarray(0, 8192)); // a small image whose table now points far past its end...
  const sectionsPe = parsePe(Buffer.from(signed)); // ...and a full one whose table points into section data:
  const intoData = Buffer.from(signed); intoData.writeUInt32LE(sectionsPe.sections[0].pointerToRawData, sectionsPe.securityDirOffset);
  const halfZero = Buffer.from(signed); halfZero.writeUInt32LE(0, sectionsPe.securityDirOffset + 4);
  const cases = [
    ['not MZ', notMz, /no MZ/],
    ['a byte appended after the table', appended, /does not end the file/],
    ['the table pointing into section data', intoData, /overlaps section data/],
    ['a half-zero directory entry', halfZero, /one is zero/],
    ['a truncated file', intoSections, /truncated PE|past the end/],
  ];
  const results = cases.map(([name, buf, re]) => { const o = refuses(() => stripSignature(buf)); return { name, o, ok: o.startsWith('PeFormatError') && re.test(o) }; });
  check('U7 refused, each with its reason: ' + results.map((x) => x.name + (x.ok ? '' : ' [' + x.o + ']')).join('; '),
    results.every((x) => x.ok), results.map((x) => x.name + ' -> ' + x.o).join('\n'));

  // U8
  const aligns = [[0, 0], [1, 8], [8, 8], [9, 16], [0x7ffffff9, 0x80000000], [0x80000000, 0x80000000], [0x80000001, 0x80000008], [0xfffffff9, 0x100000000], [0xffffffff, 0x100000000]];
  const badAlign = aligns.filter(([n, want]) => quadAlign(n) !== want);
  check('U8 quadAlign is exact across 2^31 and 2^32 (' + aligns.length + ' cases; the old int32 form gave ' + ((0x80000000 + 7) & ~7) + ' for 2^31)',
    badAlign.length === 0, JSON.stringify(badAlign.map(([n, w]) => [n, w, quadAlign(n)])));

  // U9
  const cliIn = join(work, 'cli-in'); mkdirSync(cliIn);
  const input = join(cliIn, 'in.exe'); copyFileSync(copyPath, input);
  const junction = join(work, 'cli-junction'); symlinkSync(cliIn, junction, 'junction');
  const hardlink = join(work, 'in-hardlink.exe'); linkSync(input, hardlink);
  const cli = (a, b) => spawnSync(process.execPath, [CLI, a, b], { encoding: 'utf8' });
  const viaJunction = cli(input, join(junction, 'in.exe'));
  const viaHardlink = cli(input, hardlink);
  const untouched = sha(readFileSync(input)) === signedSha;
  const elsewhere = join(work, 'cli-out.exe');
  const ok = cli(input, elsewhere);
  check('U9 the CLI refuses to write its input: via a junction exit ' + viaJunction.status + ', via a hard link exit ' + viaHardlink.status + ', input unchanged ' + untouched + '; to a different path exit ' + ok.status,
    viaJunction.status === 1 && /refusing to overwrite the input/.test(viaJunction.stderr) && viaHardlink.status === 1 && /refusing to overwrite the input/.test(viaHardlink.stderr)
      && untouched && ok.status === 0 && existsSync(elsewhere) && readFileSync(elsewhere).equals(out),
    [viaJunction.stdout, viaJunction.stderr, viaHardlink.stdout, viaHardlink.stderr, ok.stdout, ok.stderr].join('\n'));
} catch (e) {
  check('U0 test setup', false, e && e.stack || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}

console.log('');
console.log('pe_strip_signature_test: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
