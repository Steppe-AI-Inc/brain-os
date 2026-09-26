#!/usr/bin/env node
// BUILD SEA - the reproducible Node Single Executable Application pipeline for the Windows Factory runtime, BrainFactorySetup.exe.
//
//   node scripts/factory-build/build-sea.mjs --channel production|dev [--out <dir>] [--node-exe <official node.exe>] [--sign] [--keep-work]
//
// CHANNEL (S-5, WO-6). The release channel's TRUST SET and TRUST MODE (scripts/factory-runner/enrolled/trust/<channel>.json) and its
// default Node API endpoint are FIXED INTO THE BUNDLE at build time (esbuild defines __TRUST__ and __CHANNEL__); nothing at runtime
// changes them. The production channel's trust set is empty until C-3, so a production-channel build trusts no key at all.
// build-info records the channel, every trust entry read back as (key_id, sha256 of the public key), and the artifact's digest - its
// SHA-256 PE Authenticode image hash (scripts/factory-runner/enrolled/pe-image.mjs), the value a release manifest signs.
//
// Output (default --out: dist/brain-factory/<runtime_version>/<channel>/, runtime_version from scripts/factory-runner/sea/runtime-version.json):
//   BrainFactorySetup.exe   the SEA
//   build-info.json         every input and intermediate by sha256, no absolute paths, no wall clock (two builds of one tree are
//                           byte-identical - scripts/factory-build/verify-build.mjs proves it by rebuilding)
//   bundle.metafile.json    esbuild's metafile: exactly which files went into the runtime
//   SHA256SUMS              `sha256sum -c` format, for the three files above
// Previous outputs in --out are deleted first, so a failed build never leaves an old exe looking current.
//
// STEPS (each one refuses rather than guesses; the exit code says which gate refused)
//   1. BASE BINARY. The official node.exe is copied into a work dir and the COPY is hashed (no swap between check and use). Without
//      --node-exe the copy is of process.execPath and its sha256 must equal the pin for process.version in node-exe-pins.json;
//      with --node-exe <path> the file's sha256 must equal SOME pinned win32-x64 binary, whose version it then is. Anything else is
//      refused (exit 3) - a node.exe that is not byte-identical to nodejs.org's is never packaged, and the check is never skipped.
//      On a PC whose installed node.exe is not the official win-x64 binary (a distro, a rebuilt or a patched one), download
//      node-<pinned version>-win-x64.zip from nodejs.org, check it against SHASUMS256.txt, and pass its node.exe with --node-exe.
//      The copy must carry the SEA fuse exactly once, unflipped.
//   2. SOURCE FACTS. source_commit = git HEAD. built_at = SOURCE_DATE_EPOCH when set (an integer), else HEAD's commit time
//      (git log -1 --format=%ct) - never the wall clock. dirty = true when any file that feeds the build (every bundle input, this
//      directory, package.json, package-lock.json) is modified, untracked or ignored relative to HEAD - judged by git status AND by
//      content (every such file HEAD has must hash, through the checkout's filters, to HEAD's blob: git status alone trusts an
//      assume-unchanged / skip-worktree entry); the list is in build-info. git runs with --no-optional-locks and hash-object
//      without -w: the build never writes the index or the object store.
//   3. BUNDLE. esbuild (the locked node_modules copy) bundles scripts/factory-runner/sea/main.mjs into ONE CommonJS file (platform
//      node, target node<major of the base>) with __BUILD_INFO__ = {runtime_version, source_commit, dirty, built_at} defined in.
//      JS / JSON inputs are read with their line endings as LF, so a CRLF and an LF checkout of one commit give one metafile.
//      Any esbuild warning fails the build. POLICY (exit 4): the inputs must not include pg, pg-*, pgpass, postgres, postgres-*,
//      embedded-postgres or scripts/factory-runner/db.mjs; the bundle may require() only node builtins at run time (a SEA's
//      require loads nothing else); neither the bundle nor the final exe may contain "postgresql://", "postgres://" or
//      "FACTORY_RUNNER_PG_URL" (ASCII or UTF-16). The runtime carries no PostgreSQL client and no database URL.
//   4. BLOB. The verified base copy runs `--experimental-sea-config` on sea-config.template.json's settings
//      (disableExperimentalSEAWarning true, useSnapshot false, useCodeCache false - a code cache or snapshot is not reproducible),
//      in the work dir, with a minimal environment (no NODE_OPTIONS reaches it).
//   5. STRIP. The base's Authenticode signature is removed in pure Node (pe-strip-signature.mjs: data directory 4 zeroed, the table
//      truncated, the PE checksum recomputed) - the injection would invalidate it anyway.
//   6. INJECT. postject (node_modules, locked) puts the blob in as the NODE_SEA_BLOB resource, sentinel fuse
//      NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2, overwrite on. After it: the fuse is flipped exactly once, the certificate
//      directory is still empty, and the PE checksum is recomputed (postject does not maintain it).
//   7. SMOKE. The exe runs `version` with a minimal environment and must print exactly the build info it was built with.
//   8. SIGN (optional). With --sign and BRAIN_FACTORY_SIGN_CMD set, `<BRAIN_FACTORY_SIGN_CMD> "<exe>"` runs through the shell (the
//      path is also in BRAIN_FACTORY_SIGN_TARGET); it must exit 0 and leave an Authenticode signature Windows reports Valid; the
//      signed exe minus its certificate table must be byte-identical to the built image (a signer adds a signature, nothing else);
//      and the signed exe must still pass the smoke (exit 5 otherwise). Without --sign, or with --sign and no command, nothing is
//      signed and build-info records authenticode {signed:false, reason}. No certificate is ever required to build.
//
// EXIT: 0 built · 1 build failed · 2 usage / host · 3 base binary refused · 4 bundle policy refused · 5 signing failed
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { certificateDirectory, readCertificateTable, stripSignature, updatePeChecksum } from './pe-strip-signature.mjs';
import { authenticodeImageHash } from '../factory-runner/enrolled/pe-image.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const ENTRY_REL = 'scripts/factory-runner/sea/main.mjs';
export const RUNTIME_VERSION_FILE = 'scripts/factory-runner/sea/runtime-version.json';
export const PINS_FILE = join(HERE, 'node-exe-pins.json');
export const SEA_CONFIG_TEMPLATE = join(HERE, 'sea-config.template.json');
export const EXE_NAME = 'BrainFactorySetup.exe';
export const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
export const SEA_RESOURCE = 'NODE_SEA_BLOB';
export const TARGET = 'win32-x64';
export const OUTPUT_FILES = [EXE_NAME, 'build-info.json', 'bundle.metafile.json', 'SHA256SUMS'];
export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, BASE_REFUSED: 3, POLICY: 4, SIGN: 5 };
export const FORBIDDEN_PACKAGES = [/^pg$/, /^pg-/, /^pgpass$/, /^postgres$/, /^postgres-/, /^embedded-postgres$/, /^@embedded-postgres\//];
export const FORBIDDEN_FILES = ['scripts/factory-runner/db.mjs'];
export const FORBIDDEN_STRINGS = ['postgresql://', 'postgres://', 'FACTORY_RUNNER_PG_URL'];
// the build pipeline itself feeds the output: a change here is a change to the exe
const PIPELINE_PATHS = ['scripts/factory-build', 'package.json', 'package-lock.json', RUNTIME_VERSION_FILE, 'scripts/factory-runner/enrolled/trust'];
export const CHANNELS = ['production', 'dev'];
// the production channel's default endpoint: the Factory Node API on the dedicated Factory project (founder decision A.2). A setup
// may name another endpoint (a disposable plane); it can never change the channel's trust set or mode.
export const DEFAULT_API = { production: 'https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api', dev: null };


export class BuildError extends Error { constructor(code, message) { super(message); this.code = code; } }

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const requireFromRoot = createRequire(join(ROOT, 'package.json'));
const isWin = process.platform === 'win32';
const samePath = (a, b) => (isWin ? a.toLowerCase() === b.toLowerCase() : a === b);

// The package an input path belongs to: the segment(s) after its LAST node_modules/ (so a nested copy is judged too).
export function packageOf(inputPath) {
  const parts = inputPath.replace(/\\/g, '/').split('/');
  const i = parts.lastIndexOf('node_modules');
  if (i === -1 || i + 1 >= parts.length) return null;
  return parts[i + 1].startsWith('@') && i + 2 < parts.length ? parts[i + 1] + '/' + parts[i + 2] : parts[i + 1];
}

// Every reason the bundle described by an esbuild metafile may not become the runtime. [] = allowed.
export function bundlePolicyViolations(metafile, root = ROOT) {
  const violations = [];
  const forbiddenAbs = FORBIDDEN_FILES.map((f) => resolve(root, f));
  for (const input of Object.keys(metafile.inputs || {})) {
    if (input.startsWith('<')) continue; // esbuild pseudo-inputs such as <define:__BUILD_INFO__>
    const abs = resolve(root, input);
    if (forbiddenAbs.some((f) => samePath(f, abs))) violations.push('input ' + input + ' is the database accessor (scripts/factory-runner/db.mjs)');
    const pkg = packageOf(input);
    if (pkg && FORBIDDEN_PACKAGES.some((re) => re.test(pkg))) violations.push('input ' + input + ' belongs to package "' + pkg + '", a PostgreSQL client');
  }
  const builtins = new Set(builtinModules);
  for (const [out, o] of Object.entries(metafile.outputs || {})) {
    for (const imp of o.imports || []) {
      if (!imp.external) continue;
      if (imp.path.startsWith('node:') || builtins.has(imp.path)) continue;
      violations.push(out + ' requires "' + imp.path + '" at run time; a SEA can only require node builtins');
      const pkg = imp.path.startsWith('@') ? imp.path.split('/').slice(0, 2).join('/') : imp.path.split('/')[0];
      if (FORBIDDEN_PACKAGES.some((re) => re.test(pkg))) violations.push(out + ' names the PostgreSQL client "' + imp.path + '"');
    }
  }
  return violations;
}

export function forbiddenStringHits(buf) {
  const hits = [];
  for (const s of FORBIDDEN_STRINGS) {
    for (const [enc, needle] of [['ascii', Buffer.from(s, 'latin1')], ['utf16le', Buffer.from(s, 'utf16le')]]) {
      const at = buf.indexOf(needle);
      if (at !== -1) hits.push(JSON.stringify(s) + ' (' + enc + ') at byte ' + at);
    }
  }
  return hits;
}

export function countOccurrences(buf, needle) {
  let n = 0; let i = -1; const positions = [];
  while ((i = buf.indexOf(needle, i + 1)) !== -1) { n++; positions.push(i); }
  return { n, positions };
}

// The pin a base binary must match. With nodeExe: any pinned binary for TARGET with that sha. Without: process.version's pin.
export function selectPin(pins, sha, { explicit }) {
  if (explicit) {
    for (const [version, byTarget] of Object.entries(pins)) {
      const entry = byTarget && byTarget[TARGET];
      if (entry && entry.sha256 === sha) return { version, ...entry };
    }
    return null;
  }
  const entry = pins[process.version] && pins[process.version][TARGET];
  return entry && entry.sha256 === sha ? { version: process.version, ...entry } : null;
}

function git(args, { cwd = ROOT, input } = {}) {
  const r = spawnSync('git', ['--no-optional-locks', ...args], { cwd, input, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new BuildError(EXIT.FAILED, 'git ' + args.join(' ') + ' failed (exit ' + r.status + '): ' + ((r.stderr || '') + (r.error ? r.error.message : '')).trim());
  return r.stdout;
}

// Which of the given repo-relative paths are not exactly as committed at HEAD: modified, staged, deleted, untracked or ignored.
// `root` is the repository's top level (the build's own checkout unless a test points it at a disposable repository).
export function dirtyPaths(paths, root = ROOT) {
  const rel = [...new Set(paths)].sort();
  if (rel.length === 0) return [];
  const g = (args, input) => git(args, { cwd: root, input });
  // 1. modified / staged / deleted / untracked, as git status sees them relative to HEAD and the index
  const records = g(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...rel]).split('\0');
  const dirty = new Set();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.length < 4) continue;
    dirty.add(rec.slice(3));
    if (rec[0] === 'R' || rec[0] === 'C') { if (records[i + 1]) dirty.add(records[i + 1]); i++; } // -z: a rename's source is the next record
  }
  // HEAD's tree under these paths: path -> blob id (null for a non-blob entry such as a submodule, which is not checked here)
  const head = new Map();
  for (const rec of g(['ls-tree', '-r', '-z', 'HEAD', '--', ...rel]).split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t'); const [, type, oid] = rec.slice(0, tab).split(' ');
    head.set(rec.slice(tab + 1), type === 'blob' ? oid : null);
  }
  // 2. a file that exists but is not in HEAD's tree - this is what catches an IGNORED input, which status does not list
  for (const p of rel) {
    const abs = join(root, p);
    if (existsSync(abs) && !isDirectory(abs) && !head.has(p)) dirty.add(p);
  }
  // 3. CONTENT. git status trusts the index for an entry marked assume-unchanged or skip-worktree (and a stale fsmonitor), so a
  //    modified file can look clean to it: measured, a build of a tampered main.mjs under `git update-index --assume-unchanged`
  //    recorded dirty:false. So every file HEAD has here must still hash - through this checkout's own filters, so a CRLF
  //    checkout of an LF blob is clean - to HEAD's blob id. hash-object without -w writes nothing.
  const present = [];
  for (const [p, oid] of head) {
    const abs = join(root, p);
    if (oid === null || /[\r\n]/.test(p) || !existsSync(abs) || isDirectory(abs)) dirty.add(p); else present.push(p);
  }
  if (present.length) {
    const ids = g(['-c', 'core.safecrlf=false', 'hash-object', '--stdin-paths'], present.join('\n') + '\n').split('\n').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== present.length) throw new BuildError(EXIT.FAILED, 'git hash-object returned ' + ids.length + ' ids for ' + present.length + ' paths');
    present.forEach((p, i) => { if (ids[i] !== head.get(p)) dirty.add(p); });
  }
  return [...dirty].sort();
}
function isDirectory(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function minimalEnv(extra = {}) {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  const env = { SystemRoot: systemRoot, windir: systemRoot, PATH: join(systemRoot, 'System32'), ...extra };
  for (const k of ['TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

export function sourceDateEpoch() {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (raw !== undefined && raw !== '') {
    if (!/^\d{1,12}$/.test(raw)) throw new BuildError(EXIT.USAGE, 'SOURCE_DATE_EPOCH must be a non-negative integer number of seconds, got ' + JSON.stringify(raw));
    return { epoch: Number(raw), source: 'SOURCE_DATE_EPOCH' };
  }
  const ct = git(['log', '-1', '--format=%ct', 'HEAD']).trim();
  if (!/^\d+$/.test(ct)) throw new BuildError(EXIT.FAILED, 'could not read the HEAD commit time: ' + JSON.stringify(ct));
  return { epoch: Number(ct), source: 'git HEAD commit time' };
}

function runtimeVersion() {
  const v = readJson(join(ROOT, RUNTIME_VERSION_FILE)).runtime_version;
  if (typeof v !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(v)) throw new BuildError(EXIT.USAGE, RUNTIME_VERSION_FILE + ': runtime_version must be a plain version string, got ' + JSON.stringify(v));
  return v;
}

export function defaultOutDir(channel = 'dev') { return join(ROOT, 'dist', 'brain-factory', runtimeVersion(), channel); }

/** The channel's trust set, validated: each key id is "ed25519:" + sha256 of its 32-byte public key, and no key id repeats. */
export function channelTrust(channel) {
  if (!CHANNELS.includes(channel)) throw new BuildError(EXIT.USAGE, '--channel must be production or dev');
  const t = readJson(join(ROOT, 'scripts/factory-runner/enrolled/trust', channel + '.json'));
  if (t.channel !== channel || t.mode !== channel || !Array.isArray(t.keys)) throw new BuildError(EXIT.USAGE, 'trust/' + channel + '.json: channel and mode must be ' + channel + ', keys an array');
  const ids = new Set();
  const keys = t.keys.map((k) => {
    const raw = Buffer.from(String(k.public_key), 'base64url');
    if (raw.length !== 32 || k.key_id !== 'ed25519:' + sha256(raw)) throw new BuildError(EXIT.USAGE, 'trust/' + channel + '.json: key ' + k.key_id + ' is not bound to its public key');
    if (ids.has(k.key_id)) throw new BuildError(EXIT.USAGE, 'trust/' + channel + '.json: key id ' + k.key_id + ' repeats');
    ids.add(k.key_id);
    return { key_id: k.key_id, public_key: k.public_key };
  });
  return { channel, mode: t.mode, keys };
}

function seaConfig() {
  const t = readJson(SEA_CONFIG_TEMPLATE);
  const want = { disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false };
  for (const [k, v] of Object.entries(want)) if (t[k] !== v) throw new BuildError(EXIT.USAGE, 'sea-config.template.json: ' + k + ' must be ' + v + ' (got ' + JSON.stringify(t[k]) + ')');
  for (const k of ['main', 'output']) if (typeof t[k] !== 'string' || /[\\/]/.test(t[k])) throw new BuildError(EXIT.USAGE, 'sea-config.template.json: ' + k + ' must be a bare file name');
  // execArgvExtension ('none' | 'env' | 'cli') decides whether NODE_OPTIONS / the command line can add Node flags to the exe - with the
  // default, NODE_OPTIONS=--require=<file> runs that file inside BrainFactorySetup.exe. Whether the runtime closes that is a security
  // decision for the contract; the key is accepted here so adopting it is a one-line template change.
  if ('execArgvExtension' in t && !['none', 'env', 'cli'].includes(t.execArgvExtension)) throw new BuildError(EXIT.USAGE, 'sea-config.template.json: execArgvExtension must be none, env or cli');
  const extra = Object.keys(t).filter((k) => !['main', 'output', 'execArgvExtension', ...Object.keys(want)].includes(k));
  if (extra.length) throw new BuildError(EXIT.USAGE, 'sea-config.template.json: unexpected keys ' + extra.join(', ') + ' (assets or exec args would change the runtime; add them here deliberately)');
  return t;
}

// CRLF and lone CR as LF, byte for byte (0x0D is never part of a multi-byte UTF-8 sequence, so no text is re-encoded).
export function lfOnly(buf) {
  if (!buf.includes(0x0d)) return buf;
  const out = Buffer.allocUnsafe(buf.length); let n = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d) { out[n++] = 0x0a; if (buf[i + 1] === 0x0a) i++; } else out[n++] = buf[i];
  }
  return out.subarray(0, n);
}

// Line endings belong to the checkout, not to the commit: core.autocrlf and .gitattributes decide whether one commit's files arrive as
// CRLF or LF. The bundled code is the same either way, but esbuild's metafile records every input's byte count, so unnormalized,
// two clean checkouts of one commit gave different metafiles and build-info - measured: main.mjs 7716 bytes LF / 7837 CRLF, and
// verify-build answered DIFFERENT for an identical exe. Every JS / JSON input is therefore handed to esbuild with its line endings
// as LF (the same program: a line terminator means the same in JS and JSON whichever it is), so the metafile is a function of the commit.
export const LF_SOURCES_PLUGIN = {
  name: 'lf-sources',
  setup(b) {
    b.onLoad({ filter: /\.(?:[cm]?js|json)$/i, namespace: 'file' }, (args) => ({
      contents: lfOnly(readFileSync(args.path)),
      loader: /\.json$/i.test(args.path) ? 'json' : 'js',
    }));
  },
};

// One esbuild pass over the runtime entry, with the build's policy applied. absWorkingDir / entry exist for the regression suite.
export async function bundleEntry(esbuild, { target, define, absWorkingDir = ROOT, entry = ENTRY_REL }) {
  const r = await esbuild.build({
    absWorkingDir, entryPoints: [entry], outfile: 'main.cjs', write: false, metafile: true,
    bundle: true, platform: 'node', format: 'cjs', target, charset: 'utf8', sourcemap: false, minify: false, legalComments: 'eof',
    define, logLevel: 'silent', plugins: [LF_SOURCES_PLUGIN],
  });
  if (r.warnings.length) throw new BuildError(EXIT.POLICY, 'esbuild warnings are errors here:\n' + r.warnings.map((w) => '  ' + (w.location ? w.location.file + ':' + w.location.line + ' ' : '') + w.text).join('\n'));
  if (r.outputFiles.length !== 1) throw new BuildError(EXIT.FAILED, 'esbuild produced ' + r.outputFiles.length + ' output files, expected exactly one');
  const violations = bundlePolicyViolations(r.metafile, absWorkingDir);
  if (violations.length) throw new BuildError(EXIT.POLICY, 'the runtime bundle is refused:\n' + violations.map((v) => '  - ' + v).join('\n'));
  return { code: Buffer.from(r.outputFiles[0].contents), metafile: r.metafile };
}
const bundle = (esbuild, opts) => bundleEntry(esbuild, opts);

function runExeVersion(exe, cwd) {
  const r = spawnSync(exe, ['version'], { cwd, encoding: 'utf8', env: minimalEnv(), timeout: 60000, windowsHide: true });
  if (r.status !== 0) return { ok: false, detail: 'exit ' + r.status + ' ' + (r.stderr || '') + (r.error ? r.error.message : '') };
  try { return { ok: true, info: JSON.parse(r.stdout.trim()) }; } catch { return { ok: false, detail: 'not JSON: ' + r.stdout }; }
}

// Windows' own verdict on a file's Authenticode signature (Valid, NotSigned, HashMismatch, ...). The path travels in the
// environment, never inside the -Command text: PowerShell also ends a '...' string at the typographic quotes U+2018-U+201B, so
// quoting with '' was not enough - measured, a path under C:\Users\O’Brien gave "The string is missing the terminator" (and the
// rest of such a path would have been parsed as PowerShell).
export function authenticodeStatus(file) {
  if (!isWin) return 'unknown (not Windows)';
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AuthenticodeSignature -LiteralPath $env:BRAIN_FACTORY_AUTHENTICODE_FILE).Status.ToString()'],
    { encoding: 'utf8', timeout: 120000, windowsHide: true, env: { ...process.env, BRAIN_FACTORY_AUTHENTICODE_FILE: file } });
  return r.status === 0 ? r.stdout.trim() : 'unknown (Get-AuthenticodeSignature exit ' + r.status + ': ' + String(r.stderr || (r.error && r.error.message) || '').trim().split(/\r?\n/)[0] + ')';
}

export async function build({ out, nodeExe, channel, sign = false, keepWork = false, log = (s) => console.log('[build-sea] ' + s) } = {}) {
  if (!isWin || process.arch !== 'x64') throw new BuildError(EXIT.USAGE, 'the base binary is executed to generate the SEA blob, so the build host must be Windows x64 (this is ' + process.platform + '-' + process.arch + ')');
  const runtime_version = runtimeVersion();
  const trust = channelTrust(channel);
  const outDir = resolve(out || defaultOutDir(channel));
  const pins = readJson(PINS_FILE).pins || {};
  const config = seaConfig();

  // no stale output survives a build, failed or not
  mkdirSync(outDir, { recursive: true });
  for (const f of OUTPUT_FILES) rmSync(join(outDir, f), { force: true });

  const work = mkdtempSync(join(tmpdir(), 'brain-factory-sea-'));
  try {
    // 1. BASE BINARY - copy first, then judge the copy
    const baseSrc = nodeExe ? resolve(nodeExe) : process.execPath;
    if (!existsSync(baseSrc)) throw new BuildError(EXIT.USAGE, 'base binary not found: ' + baseSrc);
    const baseCopy = join(work, 'node-base.exe');
    copyFileSync(baseSrc, baseCopy);
    const baseBuf = readFileSync(baseCopy);
    const baseSha = sha256(baseBuf);
    const pin = selectPin(pins, baseSha, { explicit: !!nodeExe });
    if (!pin) {
      const pinned = Object.entries(pins).map(([v, t]) => v + ' ' + (t[TARGET] ? t[TARGET].sha256 : '(no ' + TARGET + ')')).join('; ') || 'none';
      throw new BuildError(EXIT.BASE_REFUSED, nodeExe
        ? 'REFUSED --node-exe ' + baseSrc + ': sha256 ' + baseSha + ' is not pinned for ' + TARGET + ' in node-exe-pins.json (pinned: ' + pinned + ')'
        : (pins[process.version] && pins[process.version][TARGET]
          ? 'REFUSED process.execPath ' + baseSrc + ': sha256 ' + baseSha + ' is not pinned - the official ' + TARGET + ' node.exe of ' + process.version + ' is ' + pins[process.version][TARGET].sha256 + '. This node.exe is not the official binary; pass the official one with --node-exe <path>'
          : 'REFUSED process.execPath ' + baseSrc + ': no pin for ' + process.version + ' ' + TARGET + ' in node-exe-pins.json (pinned: ' + pinned + '); pass a pinned official node.exe with --node-exe <path>'));
    }
    const fuse = countOccurrences(baseBuf, Buffer.from(SEA_FUSE + ':'));
    if (fuse.n !== 1 || baseBuf[fuse.positions[0] + SEA_FUSE.length + 1] !== 0x30) throw new BuildError(EXIT.BASE_REFUSED, 'the base binary must carry the SEA fuse exactly once, unflipped (found ' + fuse.n + ')');
    const baseTable = readCertificateTable(baseBuf);
    log('base node.exe ' + pin.version + ' ' + TARGET + ' sha256 ' + baseSha + ' = pin (' + pin.source + ')' + (baseTable.signed ? ', Authenticode-signed' : ', unsigned'));

    // 2. SOURCE FACTS
    const source_commit = git(['rev-parse', 'HEAD']).trim();
    if (!/^[0-9a-f]{40}$/.test(source_commit)) throw new BuildError(EXIT.FAILED, 'git rev-parse HEAD gave ' + JSON.stringify(source_commit));
    const { epoch, source: built_at_source } = sourceDateEpoch();
    const built_at = new Date(epoch * 1000).toISOString();

    // 3. BUNDLE - pass 1 finds the inputs (dirty is judged over them), pass 2 is the bundle with the final build info
    const esbuild = requireFromRoot('esbuild');
    const target = 'node' + pin.version.replace(/^v/, '').split('.')[0];
    const provisional = { runtime_version, source_commit, dirty: true, built_at, channel };
    const channelDefines = { __TRUST__: JSON.stringify(trust), __CHANNEL__: JSON.stringify({ channel, default_api: DEFAULT_API[channel] }) };
    const pass1 = await bundle(esbuild, { target, define: { __BUILD_INFO__: JSON.stringify(provisional), ...channelDefines, 'import.meta.url': 'undefined' } });
    const inputsOf = (m) => Object.keys(m.inputs).filter((k) => !k.startsWith('<')).sort();
    const inputs = inputsOf(pass1.metafile);
    const outside = inputs.filter((p) => p.startsWith('..') || /^[A-Za-z]:/.test(p) || p.startsWith('/'));
    const repoInputs = inputs.filter((p) => !outside.includes(p) && packageOf(p) === null);
    const dirty_paths = [...dirtyPaths([...repoInputs, ...PIPELINE_PATHS]), ...outside.map((p) => p + ' (outside the repository)')].sort();
    const dirty = dirty_paths.length > 0;
    const BUILD_INFO = { runtime_version, source_commit, dirty, built_at, channel };
    const pass2 = await bundle(esbuild, { target, define: { __BUILD_INFO__: JSON.stringify(BUILD_INFO), ...channelDefines, 'import.meta.url': 'undefined' } });
    if (JSON.stringify(inputsOf(pass2.metafile)) !== JSON.stringify(inputs)) throw new BuildError(EXIT.FAILED, 'the bundle inputs changed between the two esbuild passes (a file changed during the build?)');
    const bundleHits = forbiddenStringHits(pass2.code);
    if (bundleHits.length) throw new BuildError(EXIT.POLICY, 'the runtime bundle contains a database URL marker: ' + bundleHits.join('; '));
    writeFileSync(join(work, config.main), pass2.code);
    const packages = [...new Set(inputs.map(packageOf).filter(Boolean))].sort().map((name) => {
      try { return name + '@' + readJson(join(ROOT, 'node_modules', name, 'package.json')).version; } catch { return name + '@?'; }
    });
    log('bundle ' + pass2.code.length + ' bytes from ' + inputs.length + ' input(s): ' + inputs.join(', ') + (dirty ? '  [dirty: ' + dirty_paths.join(', ') + ']' : '  [clean at ' + source_commit.slice(0, 12) + ']'));

    // 4. BLOB - generated by the verified base copy itself
    writeFileSync(join(work, 'sea-config.json'), JSON.stringify(config, null, 2) + '\n');
    const gen = spawnSync(baseCopy, ['--experimental-sea-config', 'sea-config.json'], { cwd: work, encoding: 'utf8', env: minimalEnv(), timeout: 300000, windowsHide: true });
    if (gen.status !== 0 || !existsSync(join(work, config.output))) throw new BuildError(EXIT.FAILED, 'blob generation failed (exit ' + gen.status + '): ' + (gen.stderr || '') + (gen.error ? gen.error.message : ''));
    const blob = readFileSync(join(work, config.output));

    // 5. STRIP
    const stripped = stripSignature(baseBuf);
    if (!certificateDirectory(stripped.buffer).empty) throw new BuildError(EXIT.FAILED, 'the certificate directory is not empty after stripping');
    const exePath = join(work, EXE_NAME);
    writeFileSync(exePath, stripped.buffer);

    // 6. INJECT
    const postject = requireFromRoot('postject');
    await postject.inject(exePath, SEA_RESOURCE, blob, { sentinelFuse: SEA_FUSE, overwrite: true });
    const exeBuf = readFileSync(exePath);
    const flipped = countOccurrences(exeBuf, Buffer.from(SEA_FUSE + ':'));
    if (flipped.n !== 1 || exeBuf[flipped.positions[0] + SEA_FUSE.length + 1] !== 0x31) throw new BuildError(EXIT.FAILED, 'after injection the SEA fuse must be present once and flipped to 1 (found ' + flipped.n + ')');
    if (!certificateDirectory(exeBuf).empty) throw new BuildError(EXIT.FAILED, 'after injection the certificate directory is not empty');
    // quadword length: a signer then appends its certificate table with no alignment padding, so the signed exe minus that table is
    // exactly this image - which is how step 8 and verify-build prove a signature changed nothing else
    if (exeBuf.length % 8 !== 0) throw new BuildError(EXIT.FAILED, 'the injected image is ' + exeBuf.length + ' bytes, not a multiple of 8');
    const pe_checksum = updatePeChecksum(exeBuf);
    const exeHits = forbiddenStringHits(exeBuf);
    if (exeHits.length) throw new BuildError(EXIT.POLICY, 'the exe contains a database URL marker: ' + exeHits.join('; '));
    writeFileSync(exePath, exeBuf);
    const unsigned_sha256 = sha256(exeBuf);

    // 7. SMOKE
    const smoke = runExeVersion(exePath, work);
    if (!smoke.ok || JSON.stringify(smoke.info) !== JSON.stringify(BUILD_INFO)) throw new BuildError(EXIT.FAILED, 'the built exe does not report the build info it was built with: ' + (smoke.ok ? JSON.stringify(smoke.info) : smoke.detail));
    log('exe ' + exeBuf.length + ' bytes, unsigned sha256 ' + unsigned_sha256 + ', `version` = the embedded build info');

    // 8. SIGN (optional)
    let authenticode;
    let finalExe = exeBuf; // what was checked is what is written - never re-read from the work dir
    const signCmd = process.env.BRAIN_FACTORY_SIGN_CMD;
    if (!sign) authenticode = { signed: false, reason: 'signing not requested (--sign not given)' };
    else if (!signCmd) authenticode = { signed: false, reason: '--sign given but BRAIN_FACTORY_SIGN_CMD is not set' };
    else {
      log('signing: BRAIN_FACTORY_SIGN_CMD "<exe>"');
      const s = spawnSync(signCmd + ' "' + exePath + '"', { shell: true, stdio: 'inherit', env: { ...process.env, BRAIN_FACTORY_SIGN_TARGET: exePath }, timeout: 600000, windowsHide: true });
      if (s.status !== 0) throw new BuildError(EXIT.SIGN, 'BRAIN_FACTORY_SIGN_CMD failed (exit ' + s.status + (s.error ? ', ' + s.error.message : '') + ')');
      const signedBuf = readFileSync(exePath);
      let table;
      try { table = readCertificateTable(signedBuf); } catch (e) { throw new BuildError(EXIT.SIGN, 'after BRAIN_FACTORY_SIGN_CMD the certificate table is malformed: ' + e.message); }
      if (!table.signed) throw new BuildError(EXIT.SIGN, 'BRAIN_FACTORY_SIGN_CMD exited 0 but the exe carries no Authenticode signature');
      // a signer may add a signature and nothing else: without its certificate table the signed exe must be the built image
      const withoutSignature = sha256(stripSignature(signedBuf).buffer);
      if (withoutSignature !== unsigned_sha256) throw new BuildError(EXIT.SIGN, 'BRAIN_FACTORY_SIGN_CMD changed more than the signature: the signed exe without its certificate table is ' + withoutSignature + ', the built image is ' + unsigned_sha256);
      const status = authenticodeStatus(exePath);
      if (status !== 'Valid') throw new BuildError(EXIT.SIGN, 'the signed exe\'s Authenticode status is ' + status + ', not Valid');
      const again = runExeVersion(exePath, work);
      if (!again.ok || JSON.stringify(again.info) !== JSON.stringify(BUILD_INFO)) throw new BuildError(EXIT.SIGN, 'the signed exe no longer reports its build info: ' + (again.ok ? JSON.stringify(again.info) : again.detail));
      authenticode = { signed: true, status, certificates: table.entries.length, signed_sha256: sha256(signedBuf), unsigned_image_sha256: withoutSignature };
      finalExe = signedBuf;
    }

    // 9. OUTPUTS - deterministic: no absolute path, no wall clock
    const metafileText = JSON.stringify(pass2.metafile, null, 2) + '\n';
    const info = {
      build_info_format: 1,
      runtime_version, source_commit, dirty, built_at, built_at_source, built_at_epoch: epoch, dirty_paths,
      channel, trust: { channel: trust.channel, mode: trust.mode, keys: trust.keys.map((k) => ({ key_id: k.key_id, public_key_sha256: sha256(Buffer.from(k.public_key, 'base64url')) })) },
      default_api: DEFAULT_API[channel],
      digest: { algorithm: 'SHA-256 PE Authenticode image hash', value: authenticodeImageHash(finalExe) },
      target: { exe_name: EXE_NAME, platform: 'win32', arch: 'x64' },
      base_node: {
        version: pin.version, official_name: pin.official_name, pin_source: pin.source, sha256: baseSha,
        signature_removed: stripped.removed, stripped_sha256: sha256(stripped.buffer),
      },
      toolchain: {
        esbuild: esbuild.version, postject: readJson(join(ROOT, 'node_modules', 'postject', 'package.json')).version, builder_node: process.version,
      },
      bundle: {
        entry: ENTRY_REL, format: 'cjs', platform: 'node', target, sha256: sha256(pass2.code), bytes: pass2.code.length,
        source_line_endings: 'LF (each .js/.cjs/.mjs/.json input is read with CRLF and CR as LF; the metafile byte counts are of that text)',
        inputs, packages, runtime_requires: [...new Set(Object.values(pass2.metafile.outputs).flatMap((o) => (o.imports || []).filter((i) => i.external).map((i) => i.path)))].sort(),
        metafile: 'bundle.metafile.json', metafile_sha256: sha256(Buffer.from(metafileText)),
        policy: { forbidden_packages: FORBIDDEN_PACKAGES.map(String), forbidden_files: FORBIDDEN_FILES, forbidden_strings: FORBIDDEN_STRINGS, violations: [] },
      },
      sea: { config, blob_sha256: sha256(blob), blob_bytes: blob.length, resource: SEA_RESOURCE, sentinel_fuse: SEA_FUSE },
      exe: { unsigned_sha256, bytes: exeBuf.length, pe_checksum, certificate_directory: { offset: 0, size: 0 } },
      authenticode,
      sha256: sha256(finalExe),
    };
    const infoText = JSON.stringify(info, null, 2) + '\n';
    writeFileSync(join(outDir, EXE_NAME), finalExe);
    writeFileSync(join(outDir, 'bundle.metafile.json'), metafileText);
    writeFileSync(join(outDir, 'build-info.json'), infoText);
    const sums = [[EXE_NAME, finalExe], ['build-info.json', Buffer.from(infoText)], ['bundle.metafile.json', Buffer.from(metafileText)]]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([n, b]) => sha256(b) + '  ' + n + '\n').join('');
    writeFileSync(join(outDir, 'SHA256SUMS'), sums);
    // what landed on disk is what was described
    if (sha256(readFileSync(join(outDir, EXE_NAME))) !== info.sha256) throw new BuildError(EXIT.FAILED, 'the copied exe does not hash to the recorded sha256');
    log('BUILT ' + join(outDir, EXE_NAME) + ' sha256 ' + info.sha256 + (authenticode.signed ? ' (signed)' : ' (unsigned: ' + authenticode.reason + ')'));
    return { outDir, info, exe: join(outDir, EXE_NAME) };
  } catch (e) {
    for (const f of OUTPUT_FILES) rmSync(join(outDir, f), { force: true });
    throw e;
  } finally {
    if (keepWork) log('work dir kept: ' + work);
    else rmSync(work, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const o = { sign: false, keepWork: false, channel: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--channel') { o.channel = argv[++i]; if (!CHANNELS.includes(o.channel)) throw new BuildError(EXIT.USAGE, '--channel must be production or dev'); }
    else if (a === '--out' || a === '--node-exe') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new BuildError(EXIT.USAGE, a + ' needs a path');
      o[a === '--out' ? 'out' : 'nodeExe'] = v;
    } else if (a === '--sign') o.sign = true;
    else if (a === '--keep-work') o.keepWork = true;
    else throw new BuildError(EXIT.USAGE, 'unknown argument ' + a + '\nusage: build-sea.mjs --channel production|dev [--out <dir>] [--node-exe <official node.exe>] [--sign] [--keep-work]');
  }
  if (!o.channel) throw new BuildError(EXIT.USAGE, '--channel production|dev is required: the trust set and mode are fixed into the artifact per channel');
  return o;
}

// the CLI runs when this file is the program, however it was spelled (case, junction, symlink); importing it runs nothing
const isMain = (() => { try { const a = realpathSync(process.argv[1] || ''); const b = realpathSync(fileURLToPath(import.meta.url)); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } })();
if (isMain) {
  try {
    await build(parseArgs(process.argv.slice(2)));
  } catch (e) {
    const code = e instanceof BuildError ? e.code : EXIT.FAILED;
    console.error('build-sea: ' + (code === EXIT.BASE_REFUSED || code === EXIT.POLICY ? 'REFUSED' : 'FAILED') + ' (exit ' + code + '): ' + (e instanceof BuildError ? e.message : (e && e.stack) || e));
    process.exitCode = code;
  }
}

