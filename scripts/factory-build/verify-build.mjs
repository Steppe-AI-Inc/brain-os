#!/usr/bin/env node
// VERIFY BUILD - reproducibility: rebuild BrainFactorySetup.exe into a separate directory and require the identical sha256.
//
//   node scripts/factory-build/verify-build.mjs [--against <build dir>] [--node-exe <official node.exe>] [--rebuild-dir <dir>] [--keep]
//
//   --against      the build to check (default dist/brain-factory/<runtime_version>/). It must hold build-info.json, the exe,
//                  bundle.metafile.json and a SHA256SUMS that covers exactly those three, and they must agree with each other
//                  before any rebuild is attempted.
//   --node-exe     passed through to build-sea.mjs (the rebuild must start from the same pinned bytes; its sha256 is compared too)
//   --rebuild-dir  where the rebuild goes (default: a fresh temp dir, removed afterwards unless --keep). Never the reference's own
//                  directory: build-sea clears its output directory first, which would destroy the build being judged.
//   A flag that takes a value and has none is refused - it never silently falls back to the default.
//
// The rebuild runs build-sea.mjs as a separate process, never with --sign (a signature is not reproducible; the UNSIGNED exe is
// what must reproduce). A signed reference is judged by its IMAGE: the exe with its certificate table removed (pe-strip-signature),
// which must equal its recorded exe.unsigned_sha256 - so a signing step that changed more than the signature is caught here too,
// not only at build time. SOURCE_DATE_EPOCH is set to the reference's if the reference was built with one, and removed otherwise
// (under any spelling: Windows environment names are case-insensitive, so a stray source_date_epoch would reach the rebuild), so
// the rebuild's built_at is derived exactly as the reference's was.
//
// It compares: the unsigned exe sha256 (the verdict), and every build-info field except the signing ones, so a difference names
// its cause (a different commit, dirty set, base binary, toolchain, bundle, blob).
//
// EXIT: 0 IDENTICAL · 1 DIFFERENT · 2 cannot verify (usage, no reference, reference malformed or inconsistent, rebuild failed)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sameFile, stripSignature } from './pe-strip-signature.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EXE_NAME = 'BrainFactorySetup.exe';
const OUTPUTS = [EXE_NAME, 'build-info.json', 'bundle.metafile.json'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const SIGNING_FIELDS = new Set(['authenticode', 'sha256']);
const EXIT = { IDENTICAL: 0, DIFFERENT: 1, CANNOT: 2 };
const USAGE = 'usage: verify-build.mjs [--against <build dir>] [--node-exe <official node.exe>] [--rebuild-dir <dir>] [--keep]';

class CannotVerify extends Error {}
class UsageError extends Error {}
const cannot = (msg) => { throw new CannotVerify(msg); };
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

function parseArgs(argv) {
  const valued = new Map([['--against', 'against'], ['--node-exe', 'nodeExe'], ['--rebuild-dir', 'rebuildDir']]);
  const o = { keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') { o.keep = true; continue; }
    if (!valued.has(a)) throw new UsageError('unknown argument ' + a + '\n' + USAGE);
    const v = argv[++i];
    if (v === undefined || v === '' || v.startsWith('--')) throw new UsageError(a + ' needs a value\n' + USAGE);
    if (o[valued.get(a)] !== undefined) throw new UsageError(a + ' given twice');
    o[valued.get(a)] = v;
  }
  return o;
}

// The reference, checked for internal consistency. Anything malformed is CANNOT VERIFY - never a crash (whose exit code, 1, would
// read as DIFFERENT).
function loadReference(against) {
  const infoPath = join(against, 'build-info.json');
  if (!existsSync(infoPath) || !existsSync(join(against, EXE_NAME))) cannot('no build at ' + against + ' - run scripts/factory-build/build-sea.mjs first');
  let ref;
  try { ref = JSON.parse(readFileSync(infoPath, 'utf8')); } catch (e) { cannot('the reference build-info.json is not JSON: ' + e.message); }
  if (!ref || typeof ref !== 'object' || !isHex64(ref.sha256) || !ref.exe || !isHex64(ref.exe.unsigned_sha256) || !ref.bundle || !isHex64(ref.bundle.metafile_sha256)
    || !ref.authenticode || typeof ref.authenticode.signed !== 'boolean') {
    cannot('the reference build-info.json lacks one of sha256, exe.unsigned_sha256, bundle.metafile_sha256, authenticode.signed');
  }
  if (ref.built_at_source === 'SOURCE_DATE_EPOCH' && !Number.isSafeInteger(ref.built_at_epoch)) cannot('the reference says SOURCE_DATE_EPOCH but its built_at_epoch is ' + JSON.stringify(ref.built_at_epoch));

  const exeBuf = readFileSync(join(against, EXE_NAME));
  const exeSha = sha256(exeBuf);
  const signed = ref.authenticode.signed === true;
  if (exeSha !== ref.sha256) cannot('the reference exe hashes to ' + exeSha + ' but its build-info says ' + ref.sha256);
  // the reference's IMAGE: the exe itself when unsigned; for a signed one, the exe without its certificate table - which must be the
  // recorded unsigned image, or the signature step changed more than the signature
  let imageSha = exeSha;
  if (signed) {
    try { imageSha = sha256(stripSignature(exeBuf).buffer); } catch (e) { cannot('the signed reference\'s signature cannot be separated from its image: ' + e.message); }
  }
  if (imageSha !== ref.exe.unsigned_sha256) cannot('the reference ' + (signed ? 'without its signature' : 'exe') + ' is ' + imageSha + ', not its recorded unsigned_sha256 ' + ref.exe.unsigned_sha256);

  // SHA256SUMS must cover exactly the three outputs, each once (an empty or partial one used to pass, leaving the metafile unchecked)
  const sumsPath = join(against, 'SHA256SUMS');
  if (!existsSync(sumsPath)) cannot('the reference has no SHA256SUMS');
  const listed = new Map();
  for (const raw of readFileSync(sumsPath, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line === '') continue;
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!m) cannot('SHA256SUMS line is malformed: ' + JSON.stringify(line));
    if (!OUTPUTS.includes(m[2])) cannot('SHA256SUMS names ' + JSON.stringify(m[2]) + ', which is not one of ' + OUTPUTS.join(', '));
    if (listed.has(m[2])) cannot('SHA256SUMS lists ' + m[2] + ' twice');
    listed.set(m[2], m[1]);
  }
  for (const name of OUTPUTS) {
    if (!listed.has(name)) cannot('SHA256SUMS does not cover ' + name);
    const f = join(against, name);
    if (!existsSync(f) || sha256(readFileSync(f)) !== listed.get(name)) cannot('SHA256SUMS does not match ' + name);
  }
  // the metafile is the evidence of what went into the runtime: it must be the one build-info describes
  const metaSha = sha256(readFileSync(join(against, 'bundle.metafile.json')));
  if (metaSha !== ref.bundle.metafile_sha256) cannot('the reference bundle.metafile.json is ' + metaSha + ', not its build-info bundle.metafile_sha256 ' + ref.bundle.metafile_sha256);
  return { ref, signed, imageSha };
}

let exitCode = EXIT.CANNOT;
let cleanupDir = null;
try {
  const o = parseArgs(process.argv.slice(2));
  const runtimeVersion = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
  const against = resolve(o.against || join(ROOT, 'dist', 'brain-factory', String(runtimeVersion)));
  const { ref, signed: refSigned, imageSha: refImageSha } = loadReference(against);

  if (o.rebuildDir && sameFile(resolve(o.rebuildDir), against)) cannot('--rebuild-dir ' + resolve(o.rebuildDir) + ' is the reference directory itself; build-sea would delete and replace the build being judged. Give another directory.');
  const rebuildDir = resolve(o.rebuildDir || mkdtempSync(join(tmpdir(), 'brain-factory-verify-')));
  if (!o.rebuildDir && !o.keep) cleanupDir = rebuildDir;

  // the rebuild's environment: no signing command, and SOURCE_DATE_EPOCH exactly as the reference had it - under any spelling
  const env = {};
  for (const [k, v] of Object.entries(process.env)) { const K = k.toUpperCase(); if (K !== 'BRAIN_FACTORY_SIGN_CMD' && K !== 'SOURCE_DATE_EPOCH') env[k] = v; }
  if (ref.built_at_source === 'SOURCE_DATE_EPOCH') env.SOURCE_DATE_EPOCH = String(ref.built_at_epoch);
  const buildArgs = [join(HERE, 'build-sea.mjs'), '--out', rebuildDir];
  if (o.nodeExe) buildArgs.push('--node-exe', o.nodeExe);

  console.log('reference ' + against + '\n  sha256 ' + ref.sha256 + (refSigned ? ' (signed; unsigned ' + ref.exe.unsigned_sha256 + ')' : '') + '\n  commit ' + ref.source_commit + (ref.dirty ? ' (dirty)' : '') + ', built_at ' + ref.built_at + ' (' + ref.built_at_source + ')');
  console.log('rebuilding into ' + rebuildDir + ' ...');
  const r = spawnSync(process.execPath, buildArgs, { cwd: ROOT, env, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.log((r.stdout || '') + (r.stderr || '')); cannot('the rebuild failed (build-sea exit ' + r.status + (r.error ? ', ' + r.error.message : '') + ')'); }
  const re = JSON.parse(readFileSync(join(rebuildDir, 'build-info.json'), 'utf8'));
  const reExeSha = sha256(readFileSync(join(rebuildDir, EXE_NAME)));
  const diffs = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!(path === '' && SIGNING_FIELDS.has(k))) walk(a[k], b[k], path ? path + '.' + k : k); }
    } else diffs.push(path + ': reference ' + JSON.stringify(a) + ' vs rebuild ' + JSON.stringify(b));
  };
  walk(ref, re, '');
  const same = re.exe.unsigned_sha256 === ref.exe.unsigned_sha256 && reExeSha === re.exe.unsigned_sha256 && reExeSha === refImageSha && diffs.length === 0;
  if (same) {
    console.log('IDENTICAL: ' + reExeSha + ' (unsigned image' + (refSigned ? '; the reference is that image plus a signature' : '') + '), and every build-info field but the signing ones');
    exitCode = EXIT.IDENTICAL;
  } else {
    console.log('DIFFERENT: reference image ' + refImageSha + ' vs rebuild ' + reExeSha);
    for (const d of diffs) console.log('  - ' + d);
    exitCode = EXIT.DIFFERENT;
  }
} catch (e) {
  exitCode = EXIT.CANNOT;
  if (e instanceof UsageError) console.error('verify-build: ' + e.message);
  else console.log('CANNOT VERIFY: ' + (e instanceof CannotVerify ? e.message : 'unexpected error: ' + ((e && e.stack) || e)));
} finally {
  if (cleanupDir) rmSync(cleanupDir, { recursive: true, force: true });
}
process.exit(exitCode);
