#!/usr/bin/env node
// PACKAGE / BOOTSTRAP REGRESSION - a fresh clone of the COMMITTED branch can install and run a Factory node.
//
// Found 2026-09-24 by the founder, independently, on the published branch: package-lock.json absent, the root package.json
// declaring no `pg`, while scripts/factory-runner/db.mjs imports it - so `npm ci` refused on a fresh clone, the bootstrap
// stopped, and a supervised node crash-looped on ERR_MODULE_NOT_FOUND. Every earlier proof had run in a checkout whose
// node_modules was installed by hand long before, so none of them could see it. This suite never uses this checkout's
// node_modules for the thing under test: it clones HEAD into a temp directory and installs from the committed lock.
//
//   node qa/factory/package_bootstrap_regression.mjs            static rows + fresh-clone rows (needs the npm registry)
//   node qa/factory/package_bootstrap_regression.mjs --static   static rows only (no network, seconds)
//
// STATIC (the committed files, read from git and disk)
//   K1 package.json and package-lock.json are tracked, and the lock is not ignored
//   K2 the lock is in sync with the manifest (root dependencies, devDependencies, engines) - the precondition of `npm ci`
//   K3 every bare package imported under scripts/factory-runner/** is a RUNTIME dependency, and every one imported under
//      qa/factory/** is declared (runtime or dev) - derived by scanning the source, not from a list
//   K4 the Factory's own packages are pinned exactly and the lock resolves them to those versions; pg-connection-string is the
//      version the TLS semantics in TWO_MACHINE_CONTROL_PLANE.md were measured on (a bump must re-run tls_plane_acceptance)
//   K5 every locked package with an install script has a pinned allowScripts decision (the static form of --strict-allow-scripts)
//   K6 the runtime closure (everything a `npm ci --omit=dev` node installs) runs no install scripts at all
//   K7 every package fetched at run time by `npx --yes` under scripts/factory-runner/** names an exact version (an
//      "@latest" is an undeclared, unlocked dependency the lock cannot see)
// FRESH CLONE (HEAD cloned into a temp dir; nothing from this checkout's node_modules)
//   F1 `npm ci --omit=dev --strict-allow-scripts` succeeds - the runtime-only install a node needs
//   F2 the runtime install is exactly the runtime set: deps.mjs ok, every runtime package IMPORTS (a real import(), which
//      loads the package's own dependencies too), no dev package present
//   F3 node.mjs health from that clone reaches a real PostgreSQL through `pg` and reports HEALTHY
//   F4 the supervisor from that clone, on a node identity nothing else registered, starts a worker that goes ALIVE on the plane
//      as ITS role with a heartbeat after the supervisor started and no restart, and --stop ends it (exit 0)
//   F5 with a TRANSITIVE driver package (pg-protocol) removed, and then with `pg` itself removed, every entry point refuses by
//      name: the supervisor (exit 5, state dependencies_missing, no worker started), node health (the dependency, not the
//      connection), node.mjs start and node.mjs status (exit 5)
//   F6 (Windows) install-autostart.ps1 -Preflight refuses on the broken clone, refuses an env file whose CA exists nowhere
//      here, and passes on the repaired one; from the clone, install, -Stop and -Uninstall all refuse (exit 3) to act on a task
//      that belongs to another checkout; the live task is untouched throughout
//   F7 bootstrap-node.sh on a SECOND fresh clone with no node_modules and no .factory installs from the lock and ends
//      BOOTSTRAPPED against the plane - the Work-PC path, end to end
//   F8 the full `npm ci --strict-allow-scripts` gives the acceptance harnesses everything: every qa/factory import resolves
//      and embedded-postgres starts and stops a server from the clone's own install
//   F9 the accessor and runner-env regression tests pass inside the clone (they include a BOM'd env file and a missing CA)
//   F10 a runner.env whose CA file exists nowhere on this machine - the Work PC with runner.env copied and the CA forgotten - is
//      refused by the supervisor (exit 2, no worker started) and by bootstrap-node.sh (nothing registered), instead of a
//      worker that fails every connect and backs off forever
// F1 and F8 also require the committed lock to be byte-for-byte unchanged by the install (npm 10's `npm install` rewrites it).
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep, resolve as resolvePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// --root <checkout>: judge ANOTHER checkout (a mutated copy, or an old commit) - the proof that each row goes red on the defect
// it names runs this file against copies with one defect each. Default: the checkout this file lives in.
const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > -1 && process.argv[rootArg + 1] ? resolvePath(process.argv[rootArg + 1]) : join(HERE, '..', '..');
const STATIC_ONLY = process.argv.includes('--static');
// --skip F6,F7,...: leave rows out, loudly. The mutation proof uses it for F6 when judging OLD or mutated code: the installer
// before this fix had no other-checkout guard, and running it would replace this PC's live task.
const skipArg = process.argv.indexOf('--skip');
const SKIP = new Set(skipArg > -1 && process.argv[skipArg + 1] ? process.argv[skipArg + 1].split(',') : []);
const want = (id) => { if (!SKIP.has(id)) return true; console.log('SKIP ' + id + ' (--skip)'); return false; };
// --sparse: clone only the paths a Factory node uses (the root files, scripts/, qa/factory/, supabase/control-plane/). The default
// is a FULL clone - what the Work PC does. The mutation proof, which makes a dozen clones, uses --sparse: on 2026-09-24 its full
// clones (each carrying thousands of unrelated verification scratch files) filled this machine's disk mid-run.
const SPARSE = process.argv.includes('--sparse');
const isWin = process.platform === 'win32';
const NPM = isWin ? 'npm.cmd' : 'npm';
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(-900) : '')); } };
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
const sortKeys = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));

// ---- the source scan: every bare package the code LOADS - parsed, not grepped -----------------------------------------
// The first version matched import-shaped text with a regular expression and, on its own mutation proof's control, reported
// `left-pad` as an import - the specifier sat inside a string literal that contains a line of code. A text scan cannot tell code
// from text, so the source is parsed (acorn, the pinned dev dependency) and only real loads are collected: import and
// export-from declarations, import() with a constant specifier, and require() with a constant argument. A file that does not
// parse is itself a failure, never a silent skip.
const { parse: parseJs } = await import('acorn');
const PKG_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const BUILTINS = new Set(builtinModules);
function specifiersOf(source) {
  let ast = null, lastError = null;
  for (const sourceType of ['module', 'script']) {
    try { ast = parseJs(source, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); break; } catch (e) { lastError = e; }
  }
  if (!ast) throw lastError;
  const specs = [];
  const constant = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value
    : (n && n.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null);
  // A load whose specifier is not a constant cannot be checked against the manifest. Two shapes are provably files, not
  // packages: a relative string with something appended ('./db.mjs?x=' + n) and pathToFileURL(...) (with or without .href and
  // an appended query). Anything else is reported - a blind spot is a failure, not a pass (verification 2026-09-24).
  const isFileLoad = (n) => {
    let x = n; while (x && x.type === 'BinaryExpression' && x.operator === '+') x = x.left;
    if (!x) return false;
    if (x.type === 'Literal' && typeof x.value === 'string') return /^(\.{1,2}\/|\/|file:)/.test(x.value);
    if (x.type === 'TemplateLiteral') return /^(\.{1,2}\/|\/|file:)/.test(x.quasis[0].value.cooked);
    if (x.type === 'MemberExpression' && x.property && x.property.name === 'href') x = x.object;
    return x.type === 'CallExpression' && ((x.callee.type === 'Identifier' && x.callee.name === 'pathToFileURL') || (x.callee.type === 'MemberExpression' && x.callee.property && x.callee.property.name === 'pathToFileURL'));
  };
  const nonConstant = (n) => { if (!isFileLoad(n)) specs.push({ dynamic: source.slice(n.start, n.end).slice(0, 80) }); };
  // Functions made by createRequire(...) load packages exactly like require - an alias must not hide a load (verification
  // 2026-09-24: 'const load = createRequire(import.meta.url); load("left-pad")' passed K3).
  const requireNames = new Set(['require']);
  const isCreateRequire = (n) => n && n.type === 'CallExpression' && ((n.callee.type === 'Identifier' && n.callee.name === 'createRequire') || (n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'createRequire'));
  const collectAliases = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isCreateRequire(node.init)) requireNames.add(node.id.name);
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && isCreateRequire(node.right)) requireNames.add(node.left.name);
    for (const key of Object.keys(node)) { const v = node[key]; if (Array.isArray(v)) v.forEach(collectAliases); else if (v && typeof v === 'object' && typeof v.type === 'string') collectAliases(v); }
  };
  collectAliases(ast);
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) specs.push(node.source.value);
    else if (node.type === 'ImportExpression') { const c = constant(node.source); if (c !== null) specs.push(c); else nonConstant(node.source); }
    else if (node.type === 'CallExpression' && node.arguments.length && ((node.callee.type === 'Identifier' && requireNames.has(node.callee.name)) || isCreateRequire(node.callee))) { const c = constant(node.arguments[0]); if (c !== null) specs.push(c); else nonConstant(node.arguments[0]); }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
    }
  };
  visit(ast);
  return specs;
}
const unparsed = [];
const dynamicLoads = [];
function scanImports(root, dir) {
  const found = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(mjs|js|cjs)$/.test(e.name)) continue;
      const rel = relative(root, p).split(sep).join('/');
      let specs;
      try { specs = specifiersOf(readFileSync(p, 'utf8')); } catch (err) { unparsed.push(rel + ': ' + String(err && err.message || err).slice(0, 120)); continue; }
      for (const spec of specs) {
        if (typeof spec === 'object') { dynamicLoads.push(rel + ': ' + spec.dynamic); continue; }
        if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:/.test(spec) || spec.startsWith('file:')) continue;
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!PKG_NAME.test(name) || BUILTINS.has(name)) continue; // builtins imported without the node: prefix
        if (!found.has(name)) found.set(name, new Set());
        found.get(name).add(rel);
      }
    }
  };
  walk(join(root, dir));
  return found;
}
const nameFromLockPath = (p) => { const parts = p.split('node_modules/'); return parts[parts.length - 1]; };

// ================================================================= STATIC =================================================
const head = git(['rev-parse', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = git(['status', '--porcelain', '--', 'package.json', 'package-lock.json', 'scripts', 'qa/factory']);
console.log('package/bootstrap regression on ' + branch + ' at ' + head.slice(0, 12) + (dirty ? ' (WORKING TREE DIFFERS from HEAD in the tested paths - the fresh-clone rows test HEAD, the static rows test the working tree)' : ''));
const pkg = readJson(join(ROOT, 'package.json'));
const lockPath = join(ROOT, 'package-lock.json');
const lock = existsSync(lockPath) ? readJson(lockPath) : null;

{ // K1
  let tracked = true, detail = '';
  for (const f of ['package.json', 'package-lock.json']) { try { git(['ls-files', '--error-unmatch', f]); } catch { tracked = false; detail += f + ' is not tracked; '; } }
  let ignored = false; try { git(['check-ignore', '-q', 'package-lock.json']); ignored = true; } catch { ignored = false; }
  check('K1 package.json and package-lock.json are tracked by git, and the lock is not ignored', tracked && !ignored && !!lock, detail + (ignored ? 'package-lock.json is ignored' : '') + (lock ? '' : ' no package-lock.json on disk'));
}
{ // K2
  const root = lock ? lock.packages[''] || {} : {};
  const same = lock && lock.lockfileVersion >= 2 && eq(sortKeys(root.dependencies), sortKeys(pkg.dependencies)) && eq(sortKeys(root.devDependencies), sortKeys(pkg.devDependencies)) && eq(root.engines, pkg.engines);
  check('K2 the lock is in sync with the manifest (lockfileVersion ' + (lock && lock.lockfileVersion) + '; dependencies, devDependencies, engines equal)', !!same,
    'manifest ' + JSON.stringify({ d: pkg.dependencies, dd: pkg.devDependencies, e: pkg.engines }) + ' lock ' + JSON.stringify({ d: root.dependencies, dd: root.devDependencies, e: root.engines }));
}
const runtimeImports = scanImports(ROOT, 'scripts/factory-runner');
const harnessImports = scanImports(ROOT, 'qa/factory');
{ // K3
  const deps = pkg.dependencies || {}, dev = pkg.devDependencies || {};
  const missingRuntime = [...runtimeImports].filter(([n]) => !(n in deps)).map(([n, f]) => n + (n in dev ? ' (declared only as dev - a --omit=dev node cannot load it)' : ' (undeclared)') + ' <- ' + [...f].join(', '));
  const missingHarness = [...harnessImports].filter(([n]) => !(n in deps) && !(n in dev)).map(([n, f]) => n + ' <- ' + [...f].join(', '));
  check('K3 every package the Factory imports is declared (parsed, not grepped): runtime ' + [...runtimeImports.keys()].join(', ') + ' in dependencies; harness ' + [...harnessImports.keys()].join(', ') + ' in dependencies or devDependencies',
    runtimeImports.size > 0 && missingRuntime.length === 0 && missingHarness.length === 0 && unparsed.length === 0 && dynamicLoads.length === 0,
    [...missingRuntime, ...missingHarness, ...unparsed.map((u) => 'does not parse: ' + u), ...dynamicLoads.map((d) => 'a load that cannot be checked (not a constant, not a file): ' + d)].join(' | '));
}
{ // K4
  const exact = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  const own = [...new Set([...runtimeImports.keys(), ...harnessImports.keys()])];
  const bad = own.map((n) => {
    const spec = (pkg.dependencies || {})[n] || (pkg.devDependencies || {})[n];
    const locked = lock && lock.packages['node_modules/' + n] ? lock.packages['node_modules/' + n].version : null;
    return !spec || !exact.test(spec) ? n + ' is not pinned exactly (' + spec + ')' : (locked !== spec ? n + ' locked ' + locked + ' but pinned ' + spec : null);
  }).filter(Boolean);
  const pcs = lock && lock.packages['node_modules/pg-connection-string'] ? lock.packages['node_modules/pg-connection-string'].version : null;
  if (pcs !== '2.14.0') bad.push('pg-connection-string is locked at ' + pcs + ', not the 2.14.0 the documented TLS modes were measured on - re-run qa/factory/tls_plane_acceptance.mjs and update TWO_MACHINE_CONTROL_PLANE.md §0 before moving it');
  check('K4 the Factory\'s own packages are pinned exactly and locked at those versions (' + own.map((n) => n + ' ' + ((pkg.dependencies || {})[n] || (pkg.devDependencies || {})[n])).join(', ') + '; pg-connection-string ' + pcs + ')', bad.length === 0, bad.join(' | '));
}
{ // K5
  const allow = pkg.allowScripts || {};
  const scripted = lock ? Object.entries(lock.packages).filter(([k, v]) => k && v.hasInstallScript).map(([k, v]) => nameFromLockPath(k) + '@' + v.version) : [];
  const undecided = scripted.filter((id) => !(id in allow) && !(id.replace(/@[^@]+$/, '') in allow));
  check('K5 every locked package with an install script has an allowScripts decision (' + scripted.length + ' scripted: ' + scripted.join(', ') + ')', undecided.length === 0, 'undecided: ' + undecided.join(', '));
}
{ // K6
  const prodScripted = lock ? Object.entries(lock.packages).filter(([k, v]) => k && !v.dev && !v.devOptional && v.hasInstallScript).map(([k, v]) => nameFromLockPath(k) + '@' + v.version) : ['(no lock)'];
  const prodCount = lock ? Object.entries(lock.packages).filter(([k, v]) => k && !v.dev && !v.devOptional).length : 0;
  check('K6 the runtime closure (' + prodCount + ' packages a --omit=dev node installs) runs no install scripts', prodScripted.length === 0, prodScripted.join(', '));
}

{ // K7
  const found = [], bad = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; } if (!/\.(sh|ps1|mjs|js|cjs|cmd|bat)$/.test(e.name)) continue;
    readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => { if (/^\s*(#|\/\/|\*)/.test(line)) return; for (const m of line.matchAll(/\bnpx\s+(?:--yes|-y)\s+((?:@[\w.-]+\/)?[\w.-]+)(?:@(\S+))?/g)) { const at = relative(ROOT, p).split(sep).join('/') + ':' + (i + 1); found.push(m[1] + '@' + (m[2] || '(none)') + ' ' + at); if (!m[2] || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(m[2])) bad.push(m[1] + (m[2] ? '@' + m[2] : ' (no version)') + ' at ' + at); } }); } };
  walk(join(ROOT, 'scripts/factory-runner'));
  check('K7 every package fetched at run time by npx --yes under scripts/factory-runner names an exact version (' + (found.join(', ') || 'none') + ')', bad.length === 0, 'not pinned: ' + bad.join(', '));
}

// ================================================================= FRESH CLONE ============================================
if (!STATIC_ONLY) {
  const work = mkdtempSync(join(tmpdir(), 'factory-pkg-'));
  const cloneA = join(work, 'clone-a'), cloneB = join(work, 'clone-b');
  const run = (cmd, args, cwd, env = {}, timeout = 600000) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26, timeout, shell: isWin && /\.cmd$/.test(cmd) }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const cleanEnv = { FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '', FACTORY_STATE_DIR: '', FACTORY_NODE_ROLE: '', npm_config_audit: 'false', npm_config_fund: 'false' };
  let pg = null, admin = null, started = [];
  const liveTaskBefore = isWin ? run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim() : 'n/a';
  const taskState = () => run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){$t.State.ToString()}else{'NONE'}"], ROOT).out.trim();
  const liveStateBefore = isWin ? taskState() : 'n/a';
  const liveTaskXml = isWin && liveTaskBefore !== 'NONE' ? run('powershell', ['-NoProfile', '-Command', "Export-ScheduledTask -TaskName 'BrainOS Factory Node'"], ROOT).out : null;
  try {
    // ENOUGH DISK FIRST. Two clones plus two installs; running out mid-run produces "unable to write file" noise that reads like a
    // repository fault. Refuse up front, by name.
    const fs = statfsSync(tmpdir());
    const freeMb = Math.floor((fs.bavail * fs.bsize) / (1024 * 1024));
    const needMb = SPARSE ? 1024 : 3072;
    if (freeMb < needMb) throw new Error('only ' + freeMb + ' MB free under ' + tmpdir() + '; the fresh-clone rows need about ' + needMb + ' MB (' + (SPARSE ? 'sparse' : 'full') + ' clones). Free space, or pass --sparse.');
    for (const c of [cloneA, cloneB]) {
      if (SPARSE) {
        git(['clone', '--quiet', '--no-hardlinks', '--no-checkout', ROOT, c], work);
        git(['sparse-checkout', 'set', '--cone', 'scripts', 'qa/factory', 'supabase/control-plane'], c);
        git(['checkout', '--quiet', head], c);
      } else { git(['clone', '--quiet', '--no-hardlinks', ROOT, c], work); git(['checkout', '--quiet', head], c); }
    }
    const clean = [cloneA, cloneB].every((c) => !existsSync(join(c, 'node_modules')) && !existsSync(join(c, '.factory')) && git(['rev-parse', 'HEAD'], c) === head);
    if (!clean) throw new Error('the fresh clones are not clean or not at HEAD');

    // a disposable real plane for the clones to talk to (loopback; started from this checkout's harness, which is not what
    // is under test - the CLONES' installs are)
    const { startLocalPg } = await import(pathToFileURL(join(HERE, 'local_pg.mjs')).href);
    pg = await startLocalPg();
    const { default: pgLib } = await import('pg');
    admin = new pgLib.Client({ connectionString: pg.superUrl }); await admin.connect();
    for (const f of readdirSync(join(ROOT, 'supabase/control-plane')).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort()) await admin.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
    await admin.query('grant usage on schema factory to ' + pg.runnerRole);
    await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);
    const envFile = join(work, 'runner.env'); writeFileSync(envFile, 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '\n');
    // the Work-PC mistake: runner.env copied, the CA it names not (its recorded path is another machine's)
    const noCaEnv = join(work, 'noca', 'runner.env'); mkdirSync(dirname(noCaEnv), { recursive: true });
    writeFileSync(noCaEnv, 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '?sslmode=verify-full&sslrootcert=' + encodeURIComponent(join(work, 'nowhere', 'absent-ca-' + randomUUID().slice(0, 8) + '.crt')) + '\n');
    const lockUnchanged = (c) => git(['status', '--porcelain', '--', 'package-lock.json', 'package.json'], c) === '';
    const stateA = join(work, 'state-a'); mkdirSync(stateA, { recursive: true });
    const nodeEnvA = { ...cleanEnv, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: stateA, FACTORY_NODE_BEAT_MS: '2000', FACTORY_NODE_STALE_MS: '6000', FACTORY_ADMISSION: 'off' };

    // F1
    const f1 = run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
    check('F1 a fresh clone of ' + head.slice(0, 12) + ': `npm ci --omit=dev --strict-allow-scripts` succeeds and leaves the committed lock unchanged', f1.rc === 0 && lockUnchanged(cloneA), f1.out + ' | git status: ' + git(['status', '--porcelain'], cloneA));

    // F2
    const depsA = run(process.execPath, [join(cloneA, 'scripts/factory-runner/deps.mjs'), '--json'], cloneA, cleanEnv);
    // a REAL import: it loads the package and everything the package loads (pg -> pg-pool, pg-protocol, ...). import.meta.resolve
    // only found the package's own entry file - and does not exist on Node 20.0-20.5, which engines >=20 admits.
    const resolveScript = 'const names=JSON.parse(process.argv[1]);const bad=[];for(const n of names){try{await import(n)}catch(e){bad.push(n+": "+(e.code||e.message))}}console.log(JSON.stringify(bad));process.exit(0);';
    const resRt = run(process.execPath, ['--input-type=module', '-e', resolveScript, JSON.stringify([...runtimeImports.keys()])], join(cloneA, 'scripts/factory-runner'), cleanEnv);
    const devPresent = Object.keys(pkg.devDependencies || {}).filter((n) => existsSync(join(cloneA, 'node_modules', ...n.split('/'))));
    check('F2 the runtime-only install is exactly the runtime set: deps.mjs ok, every runtime package imports (' + [...runtimeImports.keys()].join(', ') + '), no dev package installed',
      depsA.rc === 0 && resRt.rc === 0 && resRt.out.trim().endsWith('[]') && devPresent.length === 0, depsA.out + ' | unresolved ' + resRt.out + ' | dev present: ' + devPresent.join(', '));

    // F3
    const f3 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'health'], cloneA, nodeEnvA, 120000);
    check('F3 node.mjs health from the runtime-only clone reaches a real PostgreSQL through pg and reports HEALTHY', f3.rc === 0 && /HEALTHY/.test(f3.out) && /runtime dependencies installed at their locked versions \(pg /.test(f3.out), f3.out);

    // F4 - on a node identity NOTHING ELSE registered. The first version used F3's state dir, so F3's health had already
    // registered that node and stamped its heartbeat: the row saw ALIVE while the supervised worker died on every start
    // (verification 2026-09-24). Now ALIVE counts only as the supervised worker's own: role verifier (health registers generic),
    // heartbeat after the supervisor started, and the supervisor still on its first worker with no exit.
    const stateA4 = join(work, 'state-a4'); mkdirSync(stateA4, { recursive: true });
    const nodeEnvA4 = { ...nodeEnvA, FACTORY_STATE_DIR: stateA4 };
    const supStartedAt = Date.now();
    const sup = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--env-file', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a')], { cwd: cloneA, env: { ...process.env, ...nodeEnvA4, FACTORY_RUNNER_PG_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    started.push(sup); let supOut = ''; sup.stdout.on('data', (d) => { supOut += d; }); sup.stderr.on('data', (d) => { supOut += d; });
    let alive = null, why4 = 'never ALIVE'; const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const s = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'status', '--json'], cloneA, nodeEnvA4);
      const js = (s.out.match(/^\{.*\}$/m) || [null])[0]; const st = js ? JSON.parse(js) : {};
      const supSt = existsSync(join(stateA4, 'node-status.json')) ? readJson(join(stateA4, 'node-status.json')) : {};
      if (st.state === 'ALIVE') {
        const beat = Date.parse(st.lastHeartbeatAt || '');
        const own = st.role === 'verifier' && beat >= supStartedAt - 2000 && supSt.state === 'running' && supSt.restarts === 0 && !supSt.lastExit;
        if (own) { alive = s.out; break; }
        why4 = 'ALIVE but not the supervised worker: role ' + st.role + ', heartbeat ' + st.lastHeartbeatAt + ' vs supervisor start ' + new Date(supStartedAt).toISOString() + ', supervisor ' + JSON.stringify({ state: supSt.state, restarts: supSt.restarts, lastExit: supSt.lastExit });
      }
      await sleep(2000);
    }
    run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--stop'], cloneA, nodeEnvA4);
    const supExit = await new Promise((r) => { const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    check('F4 the supervisor from the runtime-only clone, on a fresh node identity, starts a worker that goes ALIVE as role verifier with its own heartbeat and no restart, and --stop ends it (exit ' + supExit + ')', !!alive && supExit === 0, why4 + '\n' + supOut);

    // F5 - first a TRANSITIVE package (pg-protocol: pg loads it, package.json does not name it - the first dependency check
    // missed exactly this and the supervisor crash-looped), then pg itself. Every entry point must refuse by name.
    const refusals = (label) => {
      const sp = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--env-file', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a5')], cloneA, { ...nodeEnvA, FACTORY_RUNNER_PG_URL: '' }, 60000);
      const st = existsSync(join(stateA, 'node-status.json')) ? readJson(join(stateA, 'node-status.json')) : {};
      const h = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'health'], cloneA, nodeEnvA, 60000);
      const ns = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'start', '--once'], cloneA, nodeEnvA, 60000);
      const nt = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'status'], cloneA, nodeEnvA, 60000);
      const ok = sp.rc === 5 && st.state === 'dependencies_missing' && /npm ci/.test(sp.out) && !/node started/.test(sp.out)
        && h.rc === 1 && /runtime dependencies are not installed/.test(h.out) && !/cannot connect/.test(h.out)
        && ns.rc === 5 && /DEPENDENCIES NOT READY/.test(ns.out) && !/ERR_MODULE_NOT_FOUND/.test(ns.out)
        && nt.rc === 5 && /DEPENDENCIES_MISSING/.test(nt.out);
      return { ok, text: label + ': supervisor exit ' + sp.rc + ' state ' + st.state + '; health exit ' + h.rc + '; start exit ' + ns.rc + '; status exit ' + nt.rc,
        detail: label + '\n' + sp.out + '\n--- health\n' + h.out + '\n--- start\n' + ns.out + '\n--- status\n' + nt.out };
    };
    rmSync(join(cloneA, 'node_modules', 'pg-protocol'), { recursive: true, force: true });
    const f5t = refusals('pg-protocol removed (transitive)');
    rmSync(join(cloneA, 'node_modules', 'pg'), { recursive: true, force: true });
    const f5d = refusals('pg removed');
    check('F5 every entry point refuses by name with a transitive driver package missing and with pg missing (' + f5t.text + ' | ' + f5d.text + ')',
      f5t.ok && f5d.ok, f5t.detail + '\n=====\n' + f5d.detail);

    // F6
    if (isWin && want('F6')) {
      const ps = (args) => run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(cloneA, 'scripts/factory-runner/install-autostart.ps1'), ...args], cloneA, cleanEnv, 120000);
      const broken = ps(['-Preflight', '-EnvFile', envFile]);
      run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
      const fixed = ps(['-Preflight', '-EnvFile', envFile]);
      // an env file whose URL names a CA that exists nowhere on this machine: a verify-full connection would fail closed on every start
      const noCa = ps(['-Preflight', '-EnvFile', noCaEnv]);
      let guard = { rc: 'skipped', out: 'no live task on this machine; the other-checkout guard is not exercised (an install here would create one)' }, stopGuard = guard, uninstallGuard = guard;
      if (liveTaskBefore !== 'NONE' && !liveTaskBefore.startsWith(cloneA)) { guard = ps(['-Role', 'verifier', '-EnvFile', envFile]); stopGuard = ps(['-Stop']); uninstallGuard = ps(['-Uninstall']); }
      const liveTaskAfter = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim();
      const refused = (g) => g.rc === 'skipped' || (g.rc === 3 && /belongs to another checkout/.test(g.out));
      const guardOk = refused(guard) && refused(stopGuard) && refused(uninstallGuard);
      check('F6 install-autostart.ps1: -Preflight refuses the broken clone (exit ' + broken.rc + ') and a missing CA (exit ' + noCa.rc + ') and passes the repaired one (exit ' + fixed.rc + '); from the clone install/-Stop/-Uninstall refuse another checkout\'s task (' + guard.rc + '/' + stopGuard.rc + '/' + uninstallGuard.rc + '); the live task is untouched',
        broken.rc === 1 && /PREFLIGHT FAILED/.test(broken.out) && /npm ci/.test(broken.out) && noCa.rc === 1 && /CA file is missing/.test(noCa.out) && fixed.rc === 0 && /PREFLIGHT OK/.test(fixed.out) && guardOk && liveTaskAfter === liveTaskBefore,
        'broken: ' + broken.out + '\nno CA: ' + noCa.out + '\nfixed: ' + fixed.out + '\nguard: ' + guard.out + '\nstop: ' + stopGuard.out + '\nuninstall: ' + uninstallGuard.out + '\ntask before: ' + liveTaskBefore + '\ntask after: ' + liveTaskAfter);
    } else {
      run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
      if (!isWin) console.log('NOTE F6 is Windows-only (the scheduled-task installer); skipped on ' + process.platform);
    }

    // F7
    if (want('F7') && (process.platform === 'win32' || existsSync('/bin/bash'))) {
      const stateB = join(work, 'state-b'); mkdirSync(stateB, { recursive: true });
      const f7 = run('bash', ['scripts/factory-runner/bootstrap-node.sh', '--role', 'verifier', '--env-file', envFile], cloneB, { ...cleanEnv, FACTORY_STATE_DIR: stateB, FACTORY_ADMISSION: 'off' }, 900000);
      check('F7 bootstrap-node.sh on a second fresh clone (no node_modules, no .factory) installs from the lock and ends BOOTSTRAPPED against the plane',
        f7.rc === 0 && /installing the locked dependencies \(npm ci\)/.test(f7.out) && /BOOTSTRAPPED/.test(f7.out) && existsSync(join(cloneB, 'node_modules', 'pg')), f7.out);
    } else if (!SKIP.has('F7')) console.log('NOTE F7 needs bash; skipped');

    // F8
    if (want('F8')) {
    const f8 = run(NPM, ['ci', '--strict-allow-scripts'], cloneA, cleanEnv);
    const depsDev = run(process.execPath, [join(cloneA, 'scripts/factory-runner/deps.mjs'), '--dev'], cloneA, cleanEnv);
    const resH = run(process.execPath, ['--input-type=module', '-e', resolveScript, JSON.stringify([...harnessImports.keys()])], join(cloneA, 'qa/factory'), cleanEnv);
    const epScript = "const {startLocalPg}=await import(process.argv[1]);const p=await startLocalPg();const {default:pg}=await import('pg');const c=new pg.Client({connectionString:p.superUrl});await c.connect();const v=(await c.query('select version() v')).rows[0].v;await c.end();await p.stop();console.log('EMBEDDED '+v.split(',')[0]);process.exit(0);";
    const ep = run(process.execPath, ['--input-type=module', '-e', epScript, pathToFileURL(join(cloneA, 'qa/factory/local_pg.mjs')).href], join(cloneA, 'qa/factory'), cleanEnv, 180000);
    const epFromClone = /EMBEDDED PostgreSQL/.test(ep.out);
    check('F8 the full `npm ci --strict-allow-scripts` gives the harnesses everything: deps.mjs --dev ok, every qa/factory import resolves, and embedded-postgres from the clone\'s own install starts a server (' + (ep.out.match(/EMBEDDED ([^\n]+)/) || [, '?'])[1] + ')',
      f8.rc === 0 && lockUnchanged(cloneA) && depsDev.rc === 0 && resH.out.trim().endsWith('[]') && epFromClone, f8.out.slice(-400) + ' | ' + depsDev.out + ' | ' + resH.out + ' | ' + ep.out);
    }

    // F9
    if (want('F9')) {
    const f9 = run(process.execPath, ['--test', 'scripts/factory-runner/db.regression.test.mjs', 'scripts/factory-runner/runner-env.regression.test.mjs'], cloneA, cleanEnv, 180000);
    // node --test prints the spec reporter on Node 24 and TAP ("# pass N") when not on a TTY on Node 20/22: both are read, and
    // the verdict is the exit code (a Node 22 Work PC passing every test failed this row before, 2026-09-24)
    const num = (k) => (f9.out.match(new RegExp('^(?:ℹ|#) ' + k + ' (\\d+)', 'm')) || [, '?'])[1];
    const passN = num('pass'), failN = num('fail');
    check('F9 the accessor and runner-env regression tests pass inside the clone (pass ' + passN + ', fail ' + failN + ', exit ' + f9.rc + ')', f9.rc === 0 && Number(passN) > 0 && failN === '0', f9.out.slice(-600));
    }

    // F10
    if (want('F10')) {
      const state10 = join(work, 'state-a10'); mkdirSync(state10, { recursive: true });
      const sup10 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--env-file', noCaEnv, '--role', 'verifier', '--log-dir', join(work, 'logs-a10')], cloneA, { ...cleanEnv, FACTORY_STATE_DIR: state10 }, 30000);
      let boot10 = { rc: 'skipped', out: 'bash not available' };
      if (process.platform === 'win32' || existsSync('/bin/bash')) boot10 = run('bash', ['scripts/factory-runner/bootstrap-node.sh', '--role', 'verifier', '--env-file', noCaEnv], cloneA, { ...cleanEnv, FACTORY_STATE_DIR: state10 }, 120000);
      const bootOk = boot10.rc === 'skipped' || (boot10.rc === 2 && /copy the CA file/.test(boot10.out) && !/BOOTSTRAPPED/.test(boot10.out));
      check('F10 a runner.env whose CA exists nowhere on this machine is refused by the supervisor (exit ' + sup10.rc + ', no worker) and by bootstrap-node.sh (exit ' + boot10.rc + ', nothing registered)',
        sup10.rc === 2 && /REFUSED/.test(sup10.out) && /copy the CA file/.test(sup10.out) && !/node started/.test(sup10.out) && bootOk,
        'supervisor: ' + sup10.out + '\n--- bootstrap\n' + boot10.out);
    }
  } catch (e) {
    check('F0 fresh-clone setup (free disk, clones at HEAD, disposable plane)', false, e && e.stack || e);
  } finally {
    for (const c of started) { try { if (c.exitCode === null) c.kill(); } catch { /* gone */ } }
    if (isWin) { // any process still running from the temp clones (a worker a failed row left behind) is ended
      run('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + work.replace(/'/g, "''") + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], ROOT);
      // the live task must be exactly as it was; if a broken guard changed it, put it back from its own export
      const after = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim();
      if (liveTaskXml && after !== liveTaskBefore) {
        const xmlFile = join(work, 'live-task.xml'); writeFileSync(xmlFile, liveTaskXml);
        run('powershell', ['-NoProfile', '-Command', "Register-ScheduledTask -TaskName 'BrainOS Factory Node' -Xml (Get-Content -Raw '" + xmlFile + "') -Force | Out-Null"], ROOT);
        console.log('RESTORED the live scheduled task from its export (it had changed during the run)');
      }
      // and running, if it was: a -Stop that got past a broken guard would otherwise leave this PC's node stopped
      if (liveStateBefore === 'Running' && taskState() !== 'Running') {
        run('powershell', ['-NoProfile', '-Command', "Start-ScheduledTask -TaskName 'BrainOS Factory Node'"], ROOT);
        console.log('RESTARTED the live scheduled task (it was Running before the run and was not after)');
      }
    }
    try { if (admin) await admin.end(); } catch { /* closed */ }
    try { if (pg) await pg.stop(); } catch { /* down */ }
    try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
  }
}

console.log('');
console.log('package_bootstrap_regression: ' + pass + ' passed, ' + failures.length + ' failed' + (STATIC_ONLY ? '  (static rows only)' : '  (' + (SPARSE ? 'sparse' : 'full') + ' fresh clones of ' + head.slice(0, 12) + ', installed from the committed lock)'));
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
process.exit(0);
