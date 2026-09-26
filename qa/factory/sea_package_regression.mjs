#!/usr/bin/env node
// SEA PACKAGE REGRESSION - the Windows runtime packaging pipeline (scripts/factory-build/) builds BrainFactorySetup.exe that is
// reproducible, carries no PostgreSQL client or database URL, runs with no node/git/npm on the PATH, is unsigned unless signing was
// asked for and succeeded, and is never built from a node.exe that is not byte-identical to the pinned official binary.
//
//   node qa/factory/sea_package_regression.mjs          (Windows x64; 11 builds, ~4 minutes; no network, no database)
//
// Everything is local and disposable: builds go to dist/brain-factory/<version>/ (the default output) and to temp dirs; nothing
// reaches a plane, a database, the scheduled task or ~/.brain-factory.
//
// STATIC
//   S1 the pin for v24.19.0 win32-x64 is the official win-x64/node.exe sha256 from nodejs.org's SHASUMS256.txt; the SEA config
//      template is {main, output, disableExperimentalSEAWarning:true, useSnapshot:false, useCodeCache:false}; /dist/ is ignored
//   S2 main.mjs has no top-level await (acorn AST) and imports only node: builtins
//   S3 under plain node: importing main.mjs runs nothing; `version` prints null build info; `selftest` passes and says plain node;
//      no command and an unknown command each print "<cmd>: not available in this preparation build" and exit 64
//   S4 the pe-strip-signature unit test passes on a copy of the real node.exe
// BUILD
//   B1 build-sea.mjs builds (exit 0) into dist/brain-factory/<version>/: the exe, build-info.json, bundle.metafile.json and a
//      SHA256SUMS that matches all three
//   B2 the metafile: no pg / pg-* / pgpass / postgres / postgres-* / embedded-postgres input and not scripts/factory-runner/db.mjs;
//      the bundle requires only node builtins at run time; build-info lists exactly the metafile's inputs
//   B3 the policy gate is not vacuous: real esbuild metafiles of an entry importing db.mjs, and of one importing `postgres`, are
//      each refused by bundlePolicyViolations, naming the file and the packages
//   B4 the exe contains no "postgresql://", "postgres://" or "FACTORY_RUNNER_PG_URL" (ASCII or UTF-16LE) - scanned here, not by
//      the build
//   B5 two builds, one tree: verify-build.mjs rebuilds into a temp dir and says IDENTICAL (exit 0); this suite hashes both exes
//      itself, and the two build-info.json files are byte-identical (no path, no wall clock). The verifier's environment carries a
//      lower-case source_date_epoch, which must not reach the rebuild (Windows environment names are case-insensitive)
//   B6 verify-build.mjs catches a reference that is self-consistent but not what the tree builds (one exe byte changed, its
//      build-info and SHA256SUMS rewritten to match): DIFFERENT, exit 1
//   B7 `version` from the exe prints exactly {runtime_version, source_commit, dirty, built_at} = runtime-version.json, git HEAD,
//      build-info's dirty, and HEAD's commit time
//   B8 with PATH = C:\Windows\System32 only (where.exe finds no node, git or npm) a copy of the exe in a fresh temp dir passes
//      `selftest` (exit 0, every line PASS, running as a SEA); with no command it exits 64 with the not-available line
//   B9 the output's Authenticode directory is empty (parsed here), Windows says NotSigned, the PE checksum is valid, and build-info
//      says authenticode.signed false
//   B10 a node.exe whose sha256 is not pinned is refused (exit 3, nothing in --out): given as --node-exe, and as the node that runs
//      the build (the process.execPath path)
//   B11 SOURCE_DATE_EPOCH sets built_at (and so the bytes); a malformed one is refused (exit 2); BRAIN_FACTORY_SIGN_CMD in the
//      environment WITHOUT --sign runs nothing
//   B12 --sign: without BRAIN_FACTORY_SIGN_CMD builds unsigned and says why; a sign command that fails, one that exits 0 but
//      signs nothing, one that adds a signature Windows does not call Valid, and one that adds a signature AND changes a code byte
//      each fail the build (exit 5, nothing in --out); the command receives the exe path. (No certificate exists on this PC, so a
//      stand-in signer is used; the Valid path itself is not exercised here.)
//   B13 verify-build on signed references: the built image plus a signature is IDENTICAL (judged by the image under the
//      signature); the same with one code byte changed is CANNOT VERIFY (exit 2) when build-info keeps the true image sha, and
//      DIFFERENT (exit 1) when build-info is rewritten to match the tampered image
//   B14 dirty is judged by content: in a disposable repository with one commit (core.autocrlf true), a CRLF checkout of an LF
//      blob is clean, while edits hidden from git status by assume-unchanged and skip-worktree, a deletion, an untracked and an
//      ignored file are each reported - by file and by directory
//   B15 LF and CRLF copies of main.mjs give one bundle and one metafile through bundleEntry (unnormalized, esbuild's metafile
//      records different byte counts, which made verify-build say DIFFERENT for an identical exe), and the normalization leaves
//      the emitted code exactly as esbuild emits it
//   B16 verify-build refuses, exit 2 and before any rebuild: --rebuild-dir equal to --against (directly or through a junction -
//      the rebuild would have deleted and replaced the reference), a build-info that is not JSON or lacks its fields (this used
//      to crash with exit 1, the DIFFERENT code), a flag with no value (it used to fall back to the default), an empty
//      SHA256SUMS, and a metafile + SHA256SUMS that build-info does not describe; the forged reference is left intact
//   B17 authenticodeStatus is right for files under a directory named with typographic quotes (U+2018..U+201B), which
//      PowerShell also treats as the end of a '...' string
//   B18 a rebuild that fails (an unpinned --node-exe) is CANNOT VERIFY (exit 2) and leaves nothing in TEMP - checked in a
//      private TEMP; verify-build used to exit from inside its try and leak the rebuild directory
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const BUILD = join(ROOT, 'scripts', 'factory-build', 'build-sea.mjs');
const VERIFY = join(ROOT, 'scripts', 'factory-build', 'verify-build.mjs');
const MAIN = join(ROOT, 'scripts', 'factory-runner', 'sea', 'main.mjs');
const EXE_NAME = 'BrainFactorySetup.exe';
const OFFICIAL_V24_19_0_WIN_X64 = '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'; // nodejs.org/dist/v24.19.0/SHASUMS256.txt
const SYSTEM32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32');

let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(-1500) : '')); } };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...opts });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
};
// every build here starts from an environment with no signing command and no epoch unless the row sets one - removed under any
// spelling, since Windows environment names are case-insensitive (a `delete e.SOURCE_DATE_EPOCH` left a source_date_epoch in place)
const STRIPPED_ENV = new Set(['BRAIN_FACTORY_SIGN_CMD', 'SOURCE_DATE_EPOCH', 'NODE_OPTIONS']);
const buildEnv = (extra = {}) => { const e = {}; for (const [k, v] of Object.entries(process.env)) if (!STRIPPED_ENV.has(k.toUpperCase())) e[k] = v; return { ...e, ...extra }; };
const minimalEnv = () => { const sr = process.env.SystemRoot || 'C:\\Windows'; const e = { SystemRoot: sr, windir: sr, PATH: SYSTEM32 }; for (const k of ['TEMP', 'TMP']) if (process.env[k]) e[k] = process.env[k]; return e; };
const outputsIn = (dir) => ['BrainFactorySetup.exe', 'build-info.json', 'bundle.metafile.json', 'SHA256SUMS'].filter((f) => existsSync(join(dir, f)));

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log('sea_package_regression: 0 passed, 1 failed  (needs Windows x64; this is ' + process.platform + '-' + process.arch + ')');
  process.exit(1);
}

const policy = await import(pathToFileURL(BUILD).href); // exports only; its CLI does not run on import
const pe = await import(pathToFileURL(join(ROOT, 'scripts', 'factory-build', 'pe-strip-signature.mjs')).href);
const runtimeVersion = readJson(join(ROOT, 'scripts', 'factory-runner', 'sea', 'runtime-version.json')).runtime_version;
const DIST = join(ROOT, 'dist', 'brain-factory', runtimeVersion);
const git = (args) => run('git', ['--no-optional-locks', ...args]).stdout.trim();
const HEAD = git(['rev-parse', 'HEAD']);
const HEAD_TIME = new Date(Number(git(['log', '-1', '--format=%ct', 'HEAD'])) * 1000).toISOString();
const work = mkdtempSync(join(tmpdir(), 'sea-regression-'));
console.log('checkout ' + ROOT + ' at ' + HEAD.slice(0, 12) + ', runtime_version ' + runtimeVersion + ', work ' + work);

try {
  // ---------- STATIC ----------
  {
    const pins = readJson(join(ROOT, 'scripts', 'factory-build', 'node-exe-pins.json')).pins;
    const pin = pins['v24.19.0'] && pins['v24.19.0']['win32-x64'];
    const tpl = readJson(join(ROOT, 'scripts', 'factory-build', 'sea-config.template.json'));
    const ignored = run('git', ['--no-optional-locks', 'check-ignore', '-q', 'dist/brain-factory/x/' + EXE_NAME]).rc === 0;
    const notOverIgnored = run('git', ['--no-optional-locks', 'check-ignore', '-q', 'web/dist/x.js']).rc !== 0; // anchored: only the root dist/
    check('S1 pin v24.19.0 win32-x64 = the official SHASUMS256 sha (' + (pin && pin.sha256.slice(0, 16)) + '); SEA config template has exactly the required settings; /dist/ is ignored (' + ignored + ') and only at the root (' + notOverIgnored + ')',
      pin && pin.sha256 === OFFICIAL_V24_19_0_WIN_X64 && pin.official_name === 'win-x64/node.exe' && /nodejs\.org\/dist\/v24\.19\.0\/SHASUMS256\.txt$/.test(pin.source)
        && JSON.stringify(tpl) === JSON.stringify({ main: 'main.cjs', output: 'sea-prep.blob', disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false })
        && ignored && notOverIgnored, JSON.stringify({ pin, tpl }));
  }
  {
    const acorn = createRequire(join(ROOT, 'package.json'))('acorn');
    const src = readFileSync(MAIN, 'utf8');
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const tla = []; const imports = [];
    const visit = (node, inFn) => {
      if (!node || typeof node.type !== 'string') return;
      if (!inFn && (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await))) tla.push(node.start);
      if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source)) imports.push(node.source && node.source.value);
      const inner = inFn || /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type);
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => visit(c, inner)); else if (v && typeof v.type === 'string') visit(v, inner);
      }
    };
    visit(ast, false);
    check('S2 main.mjs: no top-level await (' + tla.length + ' found) and only node: imports (' + imports.join(', ') + ')',
      tla.length === 0 && imports.length > 0 && imports.every((s) => typeof s === 'string' && s.startsWith('node:')), JSON.stringify({ tla, imports }));
  }
  {
    const imp = run(process.execPath, ['--input-type=module', '-e', "const m = await import(" + JSON.stringify(pathToFileURL(MAIN).href) + "); process.stdout.write('IMPORTED ' + typeof m.main + ' ' + typeof m.selftest + ' ' + m.isSea())"], { env: buildEnv() });
    const ver = run(process.execPath, [MAIN, 'version'], { env: buildEnv() });
    const st = run(process.execPath, [MAIN, 'selftest'], { env: buildEnv() });
    const none = run(process.execPath, [MAIN], { env: buildEnv() });
    const bogus = run(process.execPath, [MAIN, 'enroll'], { env: buildEnv() });
    let verJson = null; try { verJson = JSON.parse(ver.stdout.trim()); } catch { /* checked below */ }
    const stLines = st.stdout.trim().split(/\r?\n/);
    check('S3 plain node: import runs nothing ("' + imp.out.trim() + '"), version prints null build info, selftest exit ' + st.rc + ' (plain node), no command exit ' + none.rc + ', unknown command exit ' + bogus.rc,
      imp.rc === 0 && imp.out.trim() === 'IMPORTED function function false'
        && ver.rc === 0 && verJson && JSON.stringify(verJson) === JSON.stringify({ runtime_version: null, source_commit: null, dirty: null, built_at: null })
        && st.rc === 0 && stLines.every((l) => /^PASS |^selftest: PASS /.test(l)) && /plain node/.test(st.stdout) && !/FAIL/.test(st.stdout)
        && none.rc === 64 && none.out.trim() === '(none): not available in this preparation build'
        && bogus.rc === 64 && bogus.out.trim() === 'enroll: not available in this preparation build',
      [imp.out, ver.out, st.out, none.out, bogus.out].join('\n---\n'));
  }
  {
    const t = run(process.execPath, [join(ROOT, 'scripts', 'factory-build', 'pe-strip-signature.test.mjs')], { env: buildEnv() });
    const m = /pe_strip_signature_test: (\d+) passed, (\d+) failed/.exec(t.out);
    check('S4 pe-strip-signature unit test on a copy of the real node.exe: ' + (m ? m[1] + ' passed, ' + m[2] + ' failed' : 'no summary') + ' (exit ' + t.rc + ')',
      t.rc === 0 && m && Number(m[1]) >= 7 && m[2] === '0', t.out);
  }

  // ---------- BUILD ----------
  const b1 = run(process.execPath, [BUILD], { env: buildEnv() });
  const files = outputsIn(DIST);
  let info = null; let exeBuf = null;
  try { info = readJson(join(DIST, 'build-info.json')); exeBuf = readFileSync(join(DIST, EXE_NAME)); } catch { /* B1 fails */ }
  {
    const sums = existsSync(join(DIST, 'SHA256SUMS')) ? readFileSync(join(DIST, 'SHA256SUMS'), 'utf8').trim().split('\n') : [];
    const sumsOk = sums.length === 3 && sums.every((l) => { const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l); return m && existsSync(join(DIST, m[2])) && sha256(readFileSync(join(DIST, m[2]))) === m[1]; });
    check('B1 build-sea.mjs built (exit ' + b1.rc + ') into dist/brain-factory/' + runtimeVersion + '/: ' + files.join(', ') + '; SHA256SUMS matches all three (' + sumsOk + ')',
      b1.rc === 0 && files.length === 4 && sumsOk && info && exeBuf && sha256(exeBuf) === info.sha256, b1.out);
  }
  if (!info || !exeBuf) throw new Error('B1 produced no build; the remaining rows need one');

  {
    const meta = readJson(join(DIST, 'bundle.metafile.json'));
    const inputs = Object.keys(meta.inputs).filter((k) => !k.startsWith('<')).sort();
    const forbidden = inputs.filter((p) => /(^|\/)node_modules\/(pg|pg-[^/]+|pgpass|postgres|postgres-[^/]+|embedded-postgres|@embedded-postgres\/[^/]+)\//.test(p.replace(/\\/g, '/')) || /(^|\/)scripts\/factory-runner\/db\.mjs$/.test(p.replace(/\\/g, '/')));
    const requires = Object.values(meta.outputs).flatMap((o) => (o.imports || []).filter((i) => i.external).map((i) => i.path));
    const builtins = new Set(createRequire(import.meta.url)('node:module').builtinModules);
    check('B2 metafile inputs [' + inputs.join(', ') + '] hold no PostgreSQL client and not db.mjs; run-time requires [' + requires.join(', ') + '] are all builtins; build-info lists exactly these inputs',
      inputs.length > 0 && forbidden.length === 0 && requires.every((r) => r.startsWith('node:') || builtins.has(r))
        && JSON.stringify(info.bundle.inputs) === JSON.stringify(inputs) && info.bundle.metafile_sha256 === sha256(readFileSync(join(DIST, 'bundle.metafile.json'))),
      JSON.stringify({ forbidden, requires, recorded: info.bundle.inputs }));
  }
  {
    const esbuild = createRequire(join(ROOT, 'package.json'))('esbuild');
    const dbEntry = join(work, 'imports-db.mjs');
    writeFileSync(dbEntry, "import * as db from " + JSON.stringify(join(ROOT, 'scripts', 'factory-runner', 'db.mjs').replace(/\\/g, '/')) + ";\nconsole.log(Object.keys(db));\n");
    const pgEntry = join(work, 'imports-postgres.mjs');
    writeFileSync(pgEntry, "import postgres from 'postgres';\nconsole.log(typeof postgres);\n");
    const meta = async (entry) => (await esbuild.build({ absWorkingDir: ROOT, entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node24', write: false, metafile: true, logLevel: 'silent', nodePaths: [join(ROOT, 'node_modules')], external: ['pg-native'] })).metafile;
    let v1 = []; let v2 = []; let err = '';
    try { v1 = policy.bundlePolicyViolations(await meta(dbEntry)); v2 = policy.bundlePolicyViolations(await meta(pgEntry)); } catch (e) { err = e && e.stack || String(e); }
    const clean = policy.bundlePolicyViolations(readJson(join(DIST, 'bundle.metafile.json')));
    check('B3 the policy gate refuses real metafiles: an entry importing db.mjs -> ' + v1.length + ' violation(s) naming db.mjs and pg; one importing postgres -> ' + v2.length + '; the real bundle -> ' + clean.length,
      !err && v1.some((v) => /db\.mjs/.test(v)) && v1.some((v) => /package "pg"/.test(v)) && v1.some((v) => /package "pg-/.test(v)) && v2.some((v) => /package "postgres"/.test(v)) && clean.length === 0,
      err + '\n' + v1.join('\n') + '\n' + v2.join('\n'));
  }
  {
    // B19 (mutation proof 2026-09-26: P2, P3 and U1 survived B2-B4). The build's three refusals are exercised directly:
    // bundleEntry must THROW a POLICY BuildError (exit 4) on an entry that pulls in db.mjs - not merely list violations;
    // bundlePolicyViolations must refuse a non-builtin module left for run time; forbiddenStringHits must find every
    // database-URL marker in ASCII and UTF-16LE (the exe gate B4 cannot see a gate that finds nothing on a clean tree).
    const esbuild = createRequire(join(ROOT, 'package.json'))('esbuild');
    const dbEntry = join(work, 'b19-imports-db.mjs');
    writeFileSync(dbEntry, "import * as db from " + JSON.stringify(join(ROOT, 'scripts', 'factory-runner', 'db.mjs').replace(/\\/g, '/')) + ";\nconsole.log(Object.keys(db));\n");
    let enforced = null;
    try { await policy.bundleEntry(esbuild, { target: 'node24', define: {}, absWorkingDir: ROOT, entry: dbEntry }); enforced = 'NOT THROWN'; }
    catch (e) { enforced = e; }
    const extEntry = join(work, 'b19-runtime-require.mjs');
    writeFileSync(extEntry, "import x from 'left-for-run-time-b19';\nconsole.log(x);\n");
    let extViolations = []; let extErr = '';
    try {
      const m = (await esbuild.build({ absWorkingDir: ROOT, entryPoints: [extEntry], bundle: true, platform: 'node', format: 'cjs', target: 'node24', write: false, metafile: true, logLevel: 'silent', external: ['left-for-run-time-b19'] })).metafile;
      extViolations = policy.bundlePolicyViolations(m);
    } catch (e) { extErr = e && e.stack || String(e); }
    const markers = ['postgresql://', 'postgres://', 'FACTORY_RUNNER_PG_URL'];
    const stringHits = markers.map((s) => [policy.forbiddenStringHits(Buffer.from('x ' + s + ' y', 'latin1')).length, policy.forbiddenStringHits(Buffer.from('x ' + s + ' y', 'utf16le')).length]);
    check('B19 the build refuses by itself: bundleEntry throws POLICY (exit ' + (enforced && enforced.code) + ') on an entry importing db.mjs; a non-builtin run-time require is a violation (' + extViolations.length + '); forbiddenStringHits finds ' + JSON.stringify(stringHits) + ' for ' + markers.join(', ') + ' (ascii, utf16le)',
      enforced instanceof policy.BuildError && enforced.code === policy.EXIT.POLICY && /db\.mjs/.test(enforced.message)
        && !extErr && extViolations.some((v) => /left-for-run-time-b19.*at run time/.test(v))
        && stringHits.every(([a, u]) => a >= 1 && u >= 1),
      (enforced && enforced.message ? String(enforced.message).slice(0, 300) : String(enforced)) + '\n' + extErr + '\n' + extViolations.join('\n'));
  }
  {
    const hits = [];
    for (const s of ['postgresql://', 'postgres://', 'FACTORY_RUNNER_PG_URL']) {
      for (const enc of ['latin1', 'utf16le']) { const at = exeBuf.indexOf(Buffer.from(s, enc)); if (at !== -1) hits.push(s + ' ' + enc + ' @' + at); }
      const lower = exeBuf.indexOf(Buffer.from(s.toLowerCase(), 'latin1')); if (lower !== -1 && s !== s.toLowerCase()) hits.push(s.toLowerCase() + ' @' + lower);
    }
    check('B4 the exe (' + exeBuf.length + ' bytes) contains no "postgresql://", "postgres://" or "FACTORY_RUNNER_PG_URL" in ASCII or UTF-16LE (' + hits.length + ' hits)', hits.length === 0, hits.join('; '));
  }
  {
    const rebuild = join(work, 'rebuild');
    // a stray lower-case source_date_epoch in the verifier's environment must not reach the rebuild (Windows names are
    // case-insensitive): if it did, built_at and so the bytes would change and this row would say DIFFERENT
    const v = run(process.execPath, [VERIFY, '--rebuild-dir', rebuild], { env: buildEnv({ source_date_epoch: '1700000000' }) });
    const a = sha256(readFileSync(join(DIST, EXE_NAME)));
    const b = existsSync(join(rebuild, EXE_NAME)) ? sha256(readFileSync(join(rebuild, EXE_NAME))) : 'missing';
    const infoSame = existsSync(join(rebuild, 'build-info.json')) && readFileSync(join(rebuild, 'build-info.json')).equals(readFileSync(join(DIST, 'build-info.json')));
    check('B5 two builds of one tree (a stray source_date_epoch in the verifier env): verify-build exit ' + v.rc + ' ("' + (v.out.match(/^(IDENTICAL|DIFFERENT|CANNOT VERIFY)[^\n]*/m) || ['?'])[0].slice(0, 60) + '"), hashed here ' + a.slice(0, 16) + ' = ' + b.slice(0, 16) + ', build-info.json byte-identical (' + infoSame + ')',
      v.rc === 0 && /^IDENTICAL: /m.test(v.out) && a === b && infoSame, v.out);
    rmSync(rebuild, { recursive: true, force: true });
  }
  {
    // a reference that agrees with itself but is not what this tree builds
    const forged = join(work, 'forged'); mkdirSync(forged);
    const buf = Buffer.from(exeBuf);
    const dosStub = buf.indexOf(Buffer.from('This program cannot be run in DOS mode', 'latin1'));
    buf[dosStub] = buf[dosStub] ^ 0x20; // "this program ..." - harmless to the image, fatal to reproducibility
    writeFileSync(join(forged, EXE_NAME), buf);
    const fi = { ...info, sha256: sha256(buf), exe: { ...info.exe, unsigned_sha256: sha256(buf) } };
    const fiText = JSON.stringify(fi, null, 2) + '\n';
    writeFileSync(join(forged, 'build-info.json'), fiText);
    copyFileSync(join(DIST, 'bundle.metafile.json'), join(forged, 'bundle.metafile.json'));
    writeFileSync(join(forged, 'SHA256SUMS'), [[EXE_NAME, buf], ['build-info.json', Buffer.from(fiText)], ['bundle.metafile.json', readFileSync(join(forged, 'bundle.metafile.json'))]].map(([n, b]) => sha256(b) + '  ' + n + '\n').join(''));
    const v = run(process.execPath, [VERIFY, '--against', forged], { env: buildEnv() });
    check('B6 verify-build refuses a self-consistent reference that the tree does not build (one DOS-stub byte changed): exit ' + v.rc + ', ' + ((v.out.match(/^(IDENTICAL|DIFFERENT|CANNOT VERIFY)/m) || ['?'])[0]),
      v.rc === 1 && /^DIFFERENT: /m.test(v.out), v.out);
    rmSync(forged, { recursive: true, force: true });
  }
  {
    const v = run(join(DIST, EXE_NAME), ['version'], { env: minimalEnv(), cwd: work });
    let j = null; try { j = JSON.parse(v.stdout.trim()); } catch { /* below */ }
    check('B7 exe `version` prints the commit: ' + v.stdout.trim(),
      v.rc === 0 && j && Object.keys(j).join(',') === 'runtime_version,source_commit,dirty,built_at' && j.source_commit === HEAD && j.runtime_version === runtimeVersion
        && j.built_at === HEAD_TIME && j.dirty === info.dirty && typeof j.dirty === 'boolean', v.out);
  }
  {
    const bare = join(work, 'bare'); mkdirSync(bare);
    copyFileSync(join(DIST, EXE_NAME), join(bare, EXE_NAME));
    const env = minimalEnv();
    const where = ['node', 'git', 'npm'].map((t) => ({ t, r: run(join(SYSTEM32, 'where.exe'), [t], { env, cwd: bare }) }));
    const st = run(join(bare, EXE_NAME), ['selftest'], { env, cwd: bare });
    const none = run(join(bare, EXE_NAME), [], { env, cwd: bare });
    const lines = st.stdout.trim().split(/\r?\n/);
    check('B8 PATH=' + env.PATH + ' only (where.exe: ' + where.map((w) => w.t + ' exit ' + w.r.rc).join(', ') + '): a copy of the exe in a fresh dir passes selftest (exit ' + st.rc + ', ' + lines.length + ' lines, SEA ' + /running as a single executable application/.test(st.stdout) + '); no command exits ' + none.rc,
      where.every((w) => w.r.rc === 1) && st.rc === 0 && lines.length >= 4 && lines.every((l) => /^PASS |^selftest: PASS /.test(l)) && !/FAIL/.test(st.out)
        && /running as a single executable application \(node:sea isSea\(\) = true\)/.test(st.stdout) && /selftest: PASS .*; SEA\)/.test(st.stdout)
        && none.rc === 64 && none.out.trim() === '(none): not available in this preparation build',
      st.out + '\n---\n' + none.out + '\n---\n' + where.map((w) => w.t + ': ' + w.r.out).join('\n'));
    rmSync(bare, { recursive: true, force: true });
  }
  {
    const dir = pe.certificateDirectory(exeBuf);
    const cs = pe.verifyPeChecksum(exeBuf);
    const status = policy.authenticodeStatus(join(DIST, EXE_NAME));
    check('B9 output unsigned: certificate directory {' + dir.offset + ',' + dir.size + '}, Windows says ' + status + ', PE checksum valid (' + cs.ok + '), build-info authenticode ' + JSON.stringify(info.authenticode),
      dir.empty && status === 'NotSigned' && cs.ok && info.authenticode && info.authenticode.signed === false && info.sha256 === info.exe.unsigned_sha256, status);
  }
  {
    const bad = join(work, 'node-not-pinned.exe');
    copyFileSync(process.execPath, bad); appendFileSync(bad, Buffer.from([0x00]));
    const out1 = join(work, 'out-refused-1'); const out2 = join(work, 'out-refused-2');
    const a = run(process.execPath, [BUILD, '--node-exe', bad, '--out', out1], { env: buildEnv() });
    const b = run(bad, [BUILD, '--out', out2], { env: buildEnv() }); // the unpinned node RUNS the build: the process.execPath path
    check('B10 an unpinned node.exe (official + 1 byte, sha ' + sha256(readFileSync(bad)).slice(0, 12) + ') is refused: as --node-exe exit ' + a.rc + ', as the building node exit ' + b.rc + '; outputs left: ' + (outputsIn(out1).length + outputsIn(out2).length),
      a.rc === 3 && /REFUSED --node-exe .*is not pinned/.test(a.out) && b.rc === 3 && /REFUSED process\.execPath .*is not pinned/.test(b.out)
        && outputsIn(out1).length === 0 && outputsIn(out2).length === 0, a.out + '\n---\n' + b.out);
    rmSync(bad, { force: true });
  }
  {
    const out = join(work, 'out-epoch');
    const marker = join(work, 'sign-ran-without-flag.txt');
    // A stand-in for a signing tool (no certificate exists here). FAKE_SIGN_MODE: fail (exit 7) | noop (exit 0, signs nothing) |
    // append (adds a structurally valid WIN_CERTIFICATE that is not a real signature) | tamper (append, and change one code byte).
    const signer = join(work, 'fake-sign.cjs');
    writeFileSync(signer, `const fs = require('fs');
const exe = process.argv[2];
if (process.env.FAKE_SIGN_MARKER) fs.writeFileSync(process.env.FAKE_SIGN_MARKER, JSON.stringify(process.argv.slice(2)));
const mode = process.env.FAKE_SIGN_MODE || 'noop';
if (mode === 'fail') process.exit(7);
if (mode === 'append' || mode === 'tamper') {
  let b = fs.readFileSync(exe);
  if (mode === 'tamper') { const i = b.indexOf(Buffer.from('This program cannot be run in DOS mode')); b[i] = b[i] ^ 0x20; }
  const pad = (8 - (b.length % 8)) % 8;
  const cert = Buffer.alloc(32, 0xab);
  cert.writeUInt32LE(32, 0); cert.writeUInt16LE(0x0200, 4); cert.writeUInt16LE(0x0002, 6);
  const offset = b.length + pad;
  b = Buffer.concat([b, Buffer.alloc(pad), cert]);
  const pe = b.readUInt32LE(0x3c); const opt = pe + 24; const dd = opt + (b.readUInt16LE(opt) === 0x20b ? 112 : 96);
  b.writeUInt32LE(offset, dd + 32); b.writeUInt32LE(cert.length, dd + 36);
  fs.writeFileSync(exe, b);
}
process.exit(0);
`);
    const signCmd = '"' + process.execPath + '" "' + signer + '"';
    const e = run(process.execPath, [BUILD, '--out', out], { env: buildEnv({ SOURCE_DATE_EPOCH: '1700000000', BRAIN_FACTORY_SIGN_CMD: signCmd, FAKE_SIGN_MARKER: marker }) });
    let ei = null; try { ei = readJson(join(out, 'build-info.json')); } catch { /* below */ }
    const v = existsSync(join(out, EXE_NAME)) ? run(join(out, EXE_NAME), ['version'], { env: minimalEnv(), cwd: work }) : { stdout: '', rc: -1 };
    const malformed = run(process.execPath, [BUILD, '--out', join(work, 'out-bad-epoch')], { env: buildEnv({ SOURCE_DATE_EPOCH: 'yesterday' }) });
    check('B11 SOURCE_DATE_EPOCH=1700000000: exit ' + e.rc + ', exe says built_at ' + (/"built_at":"([^"]+)"/.exec(v.stdout) || [])[1] + ', bytes differ from B1 (' + (ei && ei.sha256 !== info.sha256) + '); "yesterday" refused exit ' + malformed.rc + '; the sign command in the env without --sign ran: ' + existsSync(marker),
      e.rc === 0 && ei && ei.built_at === '2023-11-14T22:13:20.000Z' && ei.built_at_source === 'SOURCE_DATE_EPOCH' && /"built_at":"2023-11-14T22:13:20.000Z"/.test(v.stdout)
        && ei.sha256 !== info.sha256 && malformed.rc === 2 && !existsSync(marker) && ei.authenticode.signed === false && /not requested/.test(ei.authenticode.reason),
      e.out + '\n---\n' + v.stdout + '\n---\n' + malformed.out);
    rmSync(out, { recursive: true, force: true });

    const outA = join(work, 'out-sign-unset'); const outB = join(work, 'out-sign-fails'); const outC = join(work, 'out-sign-noop');
    const outD = join(work, 'out-sign-invalid'); const outE = join(work, 'out-sign-tamper');
    const markerB = join(work, 'sign-b.txt'); const markerC = join(work, 'sign-c.txt');
    const sa = run(process.execPath, [BUILD, '--sign', '--out', outA], { env: buildEnv() });
    let ai = null; try { ai = readJson(join(outA, 'build-info.json')); } catch { /* below */ }
    const sb = run(process.execPath, [BUILD, '--sign', '--out', outB], { env: buildEnv({ BRAIN_FACTORY_SIGN_CMD: signCmd, FAKE_SIGN_MARKER: markerB, FAKE_SIGN_MODE: 'fail' }) });
    const sc = run(process.execPath, [BUILD, '--sign', '--out', outC], { env: buildEnv({ BRAIN_FACTORY_SIGN_CMD: signCmd, FAKE_SIGN_MARKER: markerC, FAKE_SIGN_MODE: 'noop' }) });
    const sd = run(process.execPath, [BUILD, '--sign', '--out', outD], { env: buildEnv({ BRAIN_FACTORY_SIGN_CMD: signCmd, FAKE_SIGN_MODE: 'append' }) });
    const se = run(process.execPath, [BUILD, '--sign', '--out', outE], { env: buildEnv({ BRAIN_FACTORY_SIGN_CMD: signCmd, FAKE_SIGN_MODE: 'tamper' }) });
    let argC = null; try { argC = JSON.parse(readFileSync(markerC, 'utf8')); } catch { /* below */ }
    check('B12 --sign: unset command -> exit ' + sa.rc + ' unsigned (' + (ai && ai.authenticode.reason) + '); failing command -> exit ' + sb.rc + '; signs nothing -> exit ' + sc.rc + '; a signature Windows does not call Valid -> exit ' + sd.rc + '; signature plus a changed code byte -> exit ' + se.rc + ' (changed more than the signature: ' + /changed more than the signature/.test(se.out) + '); outputs left ' + [outB, outC, outD, outE].map((d) => outputsIn(d).length).join('/') + '; the command got the exe path (' + (argC && /BrainFactorySetup\.exe$/.test(argC[0])) + ')',
      sa.rc === 0 && ai && ai.authenticode.signed === false && /BRAIN_FACTORY_SIGN_CMD is not set/.test(ai.authenticode.reason)
        && sb.rc === 5 && /BRAIN_FACTORY_SIGN_CMD failed \(exit 7/.test(sb.out) && existsSync(markerB)
        && sc.rc === 5 && /carries no Authenticode signature/.test(sc.out)
        && sd.rc === 5 && /Authenticode status is (?!Valid)\w+, not Valid/.test(sd.out)
        && se.rc === 5 && /changed more than the signature/.test(se.out)
        && [outB, outC, outD, outE].every((d) => outputsIn(d).length === 0)
        && argC && argC.length === 1 && /BrainFactorySetup\.exe$/.test(argC[0]),
      [sa.out, sb.out, sc.out, sd.out, se.out].join('\n---\n'));
    for (const d of [outA, outB, outC, outD, outE]) rmSync(d, { recursive: true, force: true });

    // B13: verify-build on SIGNED references (made with the stand-in signer, since no certificate exists here)
    const signedRef = (name, mode, rewriteImageSha) => {
      const dir = join(work, name); mkdirSync(dir);
      copyFileSync(join(DIST, EXE_NAME), join(dir, EXE_NAME));
      const r = run(process.execPath, [signer, join(dir, EXE_NAME)], { env: { ...minimalEnv(), FAKE_SIGN_MODE: mode } });
      const buf = readFileSync(join(dir, EXE_NAME));
      const image = sha256(pe.stripSignature(buf).buffer);
      const si = { ...info, authenticode: { signed: true, status: 'Valid', certificates: 1, signed_sha256: sha256(buf), unsigned_image_sha256: image }, sha256: sha256(buf),
        exe: { ...info.exe, unsigned_sha256: rewriteImageSha ? image : info.exe.unsigned_sha256 } };
      const siText = JSON.stringify(si, null, 2) + '\n';
      writeFileSync(join(dir, 'build-info.json'), siText);
      copyFileSync(join(DIST, 'bundle.metafile.json'), join(dir, 'bundle.metafile.json'));
      writeFileSync(join(dir, 'SHA256SUMS'), [[EXE_NAME, buf], ['build-info.json', Buffer.from(siText)], ['bundle.metafile.json', readFileSync(join(dir, 'bundle.metafile.json'))]].map(([n, b]) => sha256(b) + '  ' + n + '\n').join(''));
      return { dir, signerRc: r.rc };
    };
    const good = signedRef('ref-signed', 'append', false);
    const inconsistent = signedRef('ref-signed-tampered', 'tamper', false); // records the true unsigned sha: the image does not match it
    const forgedSigned = signedRef('ref-signed-forged', 'tamper', true); // rewrites the unsigned sha to the tampered image: self-consistent
    const vg = run(process.execPath, [VERIFY, '--against', good.dir], { env: buildEnv() });
    const vi = run(process.execPath, [VERIFY, '--against', inconsistent.dir], { env: buildEnv() });
    const vf = run(process.execPath, [VERIFY, '--against', forgedSigned.dir], { env: buildEnv() });
    const verdict = (x) => (x.out.match(/^(IDENTICAL|DIFFERENT|CANNOT VERIFY)/m) || ['?'])[0];
    check('B13 verify-build on signed references: the image plus a signature -> ' + verdict(vg) + ' (exit ' + vg.rc + '); signature plus a changed byte -> ' + verdict(vi) + ' (exit ' + vi.rc + '); the same, with build-info rewritten to match -> ' + verdict(vf) + ' (exit ' + vf.rc + ')',
      good.signerRc === 0 && vg.rc === 0 && /^IDENTICAL: .*plus a signature/m.test(vg.out)
        && vi.rc === 2 && /^CANNOT VERIFY: the reference without its signature is/m.test(vi.out)
        && vf.rc === 1 && /^DIFFERENT: /m.test(vf.out),
      [vg.out, vi.out, vf.out].join('\n---\n'));
    for (const d of [good.dir, inconsistent.dir, forgedSigned.dir]) rmSync(d, { recursive: true, force: true });
  }

  // B14: dirty is judged by content, not by what git status is told - in a disposable repository with one commit
  {
    const repo = join(work, 'dirty-repo'); mkdirSync(join(repo, 'src'), { recursive: true });
    const G = (...args) => run('git', ['-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: buildEnv() });
    const put = (rel, text) => writeFileSync(join(repo, rel), text);
    G('init', '-q'); G('config', 'core.autocrlf', 'true');
    const tracked = ['src/a.mjs', 'src/b.mjs', 'src/c.mjs', 'src/d.mjs', 'src/e.mjs'];
    for (const f of tracked) put(f, 'export const ' + f[4] + ' = 1;\nexport const text = `two\nlines`;\n');
    put('.gitignore', 'ignored.mjs\n');
    G('add', '-A'); const commit = G('commit', '-q', '-m', 'qa: one commit');
    const cleanAtCommit = policy.dirtyPaths(tracked, repo);
    // a CRLF checkout of an LF blob is the commit (the index refreshed, as a checkout leaves it); then every way to differ from it
    put('src/b.mjs', readFileSync(join(repo, 'src/b.mjs'), 'utf8').replace(/\n/g, '\r\n')); G('add', 'src/b.mjs');
    G('update-index', '--assume-unchanged', 'src/c.mjs'); put('src/c.mjs', 'export const c = "TAMPERED";\n');
    G('update-index', '--skip-worktree', 'src/d.mjs'); put('src/d.mjs', 'export const d = "TAMPERED";\n');
    rmSync(join(repo, 'src/e.mjs'));
    put('src/new.mjs', 'export const n = 1;\n'); put('ignored.mjs', 'export const i = 1;\n');
    const statusSays = G('status', '--porcelain=v1', '--untracked-files=all').stdout;
    const got = policy.dirtyPaths([...tracked, 'src/new.mjs', 'ignored.mjs'], repo);
    const gotDir = policy.dirtyPaths(['src'], repo);
    const want = ['ignored.mjs', 'src/c.mjs', 'src/d.mjs', 'src/e.mjs', 'src/new.mjs'];
    const wantDir = ['src/c.mjs', 'src/d.mjs', 'src/e.mjs', 'src/new.mjs'];
    check('B14 dirtyPaths in a disposable repo: clean at the commit ' + JSON.stringify(cleanAtCommit) + '; CRLF checkout clean, assume-unchanged / skip-worktree edits (which git status does not show: ' + !/src\/[cd]\.mjs/.test(statusSays) + '), a deletion, an untracked and an ignored file -> ' + JSON.stringify(got) + '; by directory -> ' + JSON.stringify(gotDir),
      commit.rc === 0 && cleanAtCommit.length === 0 && !/src\/[cd]\.mjs/.test(statusSays) && JSON.stringify(got) === JSON.stringify(want) && JSON.stringify(gotDir) === JSON.stringify(wantDir),
      JSON.stringify({ commit: commit.out, statusSays, got, gotDir }));
  }
  // B15: the bundle and its metafile do not depend on the checkout's line endings
  {
    const esbuild = createRequire(join(ROOT, 'package.json'))('esbuild');
    const lfText = readFileSync(MAIN, 'latin1').replace(/\r\n?/g, '\n');
    const dirs = { lf: join(work, 'eol-lf'), crlf: join(work, 'eol-crlf') };
    mkdirSync(dirs.lf); mkdirSync(dirs.crlf);
    writeFileSync(join(dirs.lf, 'main.mjs'), lfText, 'latin1'); writeFileSync(join(dirs.crlf, 'main.mjs'), lfText.replace(/\n/g, '\r\n'), 'latin1');
    const define = { __BUILD_INFO__: JSON.stringify({ runtime_version: 'x', source_commit: '0'.repeat(40), dirty: false, built_at: '1970-01-01T00:00:00.000Z' }), 'import.meta.url': 'undefined' };
    const opts = { outfile: 'main.cjs', write: false, metafile: true, bundle: true, platform: 'node', format: 'cjs', target: 'node24', charset: 'utf8', sourcemap: false, minify: false, legalComments: 'eof', define, logLevel: 'silent' };
    let a = null; let b = null; let rawLf = null; let rawCrlf = null; let err = '';
    try {
      a = await policy.bundleEntry(esbuild, { target: 'node24', define, absWorkingDir: dirs.lf, entry: 'main.mjs' });
      b = await policy.bundleEntry(esbuild, { target: 'node24', define, absWorkingDir: dirs.crlf, entry: 'main.mjs' });
      rawLf = await esbuild.build({ ...opts, absWorkingDir: dirs.lf, entryPoints: ['main.mjs'] });
      rawCrlf = await esbuild.build({ ...opts, absWorkingDir: dirs.crlf, entryPoints: ['main.mjs'] });
    } catch (e) { err = e && e.stack || String(e); }
    const bytes = (m) => m && m.inputs['main.mjs'] && m.inputs['main.mjs'].bytes;
    check('B15 LF and CRLF copies of main.mjs: one bundle (' + (a && b && a.code.equals(b.code)) + ') and one metafile (' + (a && b && JSON.stringify(a.metafile) === JSON.stringify(b.metafile)) + ', ' + bytes(a && a.metafile) + ' bytes); unnormalized esbuild would record ' + bytes(rawLf && rawLf.metafile) + ' vs ' + bytes(rawCrlf && rawCrlf.metafile) + '; the normalization leaves the code as esbuild emits it',
      !err && a.code.equals(b.code) && JSON.stringify(a.metafile) === JSON.stringify(b.metafile) && bytes(a.metafile) === Buffer.byteLength(lfText, 'latin1')
        && bytes(rawLf.metafile) !== bytes(rawCrlf.metafile) && Buffer.from(rawLf.outputFiles[0].contents).equals(a.code),
      err);
  }
  // B16: verify-build never destroys, and never misjudges, the reference it is given - each case below is refused before any rebuild
  {
    const V = (args, extra) => run(process.execPath, [VERIFY, ...args], { env: buildEnv(extra) });
    const copyRef = (name) => { const d = join(work, name); mkdirSync(d); for (const f of ['BrainFactorySetup.exe', 'build-info.json', 'bundle.metafile.json', 'SHA256SUMS']) copyFileSync(join(DIST, f), join(d, f)); return d; };
    const sums = (d) => writeFileSync(join(d, 'SHA256SUMS'), [EXE_NAME, 'build-info.json', 'bundle.metafile.json'].map((n) => sha256(readFileSync(join(d, n))) + '  ' + n + '\n').join(''));
    // a self-consistent reference the tree does not build (as B6); the rebuild pointed at it, directly and through a junction
    const forged = copyRef('b16-forged');
    const fb = readFileSync(join(forged, EXE_NAME)); const at = fb.indexOf(Buffer.from('This program cannot be run in DOS mode', 'latin1')); fb[at] ^= 0x20;
    writeFileSync(join(forged, EXE_NAME), fb);
    writeFileSync(join(forged, 'build-info.json'), JSON.stringify({ ...info, sha256: sha256(fb), exe: { ...info.exe, unsigned_sha256: sha256(fb) } }, null, 2) + '\n'); sums(forged);
    const forgedSha = sha256(fb);
    const junction = join(work, 'b16-junction'); symlinkSync(forged, junction, 'junction');
    const cases = [];
    cases.push(['--rebuild-dir = --against', V(['--against', forged, '--rebuild-dir', forged]), /is the reference directory itself/]);
    cases.push(['--rebuild-dir = --against through a junction', V(['--against', forged, '--rebuild-dir', junction]), /is the reference directory itself/]);
    const notJson = join(work, 'b16-not-json'); mkdirSync(notJson); writeFileSync(join(notJson, 'build-info.json'), 'not json'); writeFileSync(join(notJson, EXE_NAME), 'x');
    cases.push(['build-info that is not JSON', V(['--against', notJson]), /build-info\.json is not JSON/]);
    const noFields = join(work, 'b16-no-fields'); mkdirSync(noFields); writeFileSync(join(noFields, EXE_NAME), 'x'); writeFileSync(join(noFields, 'build-info.json'), JSON.stringify({ sha256: sha256(Buffer.from('x')) }));
    cases.push(['build-info without exe / bundle / authenticode', V(['--against', noFields]), /lacks one of/]);
    cases.push(['--node-exe with no value', V(['--against', DIST, '--node-exe']), /--node-exe needs a value/]);
    cases.push(['--against with no value', V(['--against']), /--against needs a value/]);
    const emptySums = copyRef('b16-empty-sums'); writeFileSync(join(emptySums, 'SHA256SUMS'), '');
    cases.push(['an empty SHA256SUMS', V(['--against', emptySums]), /SHA256SUMS does not cover/]);
    const metaForged = copyRef('b16-meta-forged');
    const meta = readJson(join(metaForged, 'bundle.metafile.json')); meta.inputs = { 'scripts/factory-runner/sea/innocent.mjs': { bytes: 1, imports: [] } };
    writeFileSync(join(metaForged, 'bundle.metafile.json'), JSON.stringify(meta, null, 2) + '\n'); sums(metaForged);
    cases.push(['a metafile (and SHA256SUMS) that build-info does not describe', V(['--against', metaForged]), /not its build-info bundle\.metafile_sha256/]);
    const results = cases.map(([name, r, re]) => ({ name, rc: r.rc, ok: r.rc === 2 && re.test(r.out) && !/rebuilding into/.test(r.out), out: r.out }));
    const forgedKept = sha256(readFileSync(join(forged, EXE_NAME))) === forgedSha;
    check('B16 verify-build refuses (exit 2, no rebuild) and keeps the reference: ' + results.map((x) => x.name + ' ' + (x.ok ? 'refused' : 'NOT REFUSED (exit ' + x.rc + ')')).join('; ') + '; the forged reference still intact ' + forgedKept,
      results.every((x) => x.ok) && forgedKept, results.filter((x) => !x.ok).map((x) => x.name + ':\n' + x.out).join('\n---\n'));
  }
  // B17: a path with typographic quotes reaches Get-AuthenticodeSignature intact (PowerShell ends '...' at U+2018-U+201B too)
  {
    const qdir = join(work, 'O’Brien ‘quoted’ ‚dir‛'); mkdirSync(qdir);
    const signedCopy = join(qdir, 'node-signed.exe'); copyFileSync(process.execPath, signedCopy);
    const exeCopy = join(qdir, EXE_NAME); copyFileSync(join(DIST, EXE_NAME), exeCopy);
    const s1 = policy.authenticodeStatus(signedCopy); const s2 = policy.authenticodeStatus(exeCopy);
    check('B17 authenticodeStatus under ' + qdir.slice(-24) + ': the official node.exe copy ' + s1 + ', the built exe copy ' + s2,
      s1 === 'Valid' && s2 === 'NotSigned', s1 + '\n' + s2);
  }

  // B18: a rebuild that fails leaves no temp directory behind (the rebuild dir used to leak: process.exit inside the try skipped
  // the cleanup). TEMP/TMP point at a private empty directory, so nothing else on the machine can disturb the count.
  {
    const privateTemp = join(work, 'b18-temp'); mkdirSync(privateTemp);
    const unpinned = join(work, 'b18-unpinned-node.exe'); copyFileSync(process.execPath, unpinned); appendFileSync(unpinned, Buffer.from([0x00]));
    const v = run(process.execPath, [VERIFY, '--against', DIST, '--node-exe', unpinned], { env: buildEnv({ TEMP: privateTemp, TMP: privateTemp }) });
    const left = (() => { try { return readdirSync(privateTemp); } catch (e) { return ['<unreadable: ' + e.message + '>']; } })();
    check('B18 a failed rebuild (unpinned --node-exe: build-sea exit 3) is CANNOT VERIFY exit ' + v.rc + ' and leaves ' + left.length + ' temp entr' + (left.length === 1 ? 'y' : 'ies') + ' behind',
      v.rc === 2 && /^CANNOT VERIFY: the rebuild failed \(build-sea exit 3/m.test(v.out) && left.length === 0, v.out + '\nleft: ' + JSON.stringify(left));
    rmSync(unpinned, { force: true });
  }

  // a measured fact the contract has to decide on; reported, not scored
  {
    const inj = join(work, 'node-options-probe.cjs');
    writeFileSync(inj, "process.stderr.write('NODE_OPTIONS-REQUIRE-RAN\\n');\n");
    const r = run(join(DIST, EXE_NAME), ['version'], { env: { ...minimalEnv(), NODE_OPTIONS: '--require=' + inj }, cwd: work });
    console.log('NOTE NODE_OPTIONS=--require=<file> ' + (/NODE_OPTIONS-REQUIRE-RAN/.test(r.out) ? 'RUNS that file inside the exe' : 'does NOT run inside the exe') + ' (SEA config execArgvExtension: ' + (info.sea.config.execArgvExtension || 'unset = node default') + ') - a runtime security decision for the Director contract');
  }
} catch (e) {
  check('X0 suite setup', false, e && e.stack || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}

console.log('');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); }
console.log('(checkout at ' + HEAD.slice(0, 12) + ', runtime_version ' + runtimeVersion + ')');
console.log('sea_package_regression: ' + pass + ' passed, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
