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
// FRESH CLONE (HEAD cloned into a temp dir; nothing from this checkout's node_modules)
//   F1 `npm ci --omit=dev --strict-allow-scripts` succeeds - the runtime-only install a node needs
//   F2 the runtime install is exactly the runtime set: deps.mjs ok, every runtime import resolves, no dev package present
//   F3 node.mjs health from that clone reaches a real PostgreSQL through `pg` and reports HEALTHY
//   F4 the supervisor from that clone starts a worker that goes ALIVE on the plane, and --stop ends it (exit 0)
//   F5 with `pg` removed the supervisor refuses by name (exit 5, state dependencies_missing, no worker started) and node
//      health names the missing dependency instead of a connection error
//   F6 (Windows) install-autostart.ps1 -Preflight refuses on the broken clone and passes on the repaired one; an install
//      from the clone does not replace a task that belongs to another checkout; the live task is untouched throughout
//   F7 bootstrap-node.sh on a SECOND fresh clone with no node_modules and no .factory installs from the lock and ends
//      BOOTSTRAPPED against the plane - the Work-PC path, end to end
//   F8 the full `npm ci --strict-allow-scripts` gives the acceptance harnesses everything: every qa/factory import resolves
//      and embedded-postgres starts and stops a server from the clone's own install
//   F9 the accessor and runner-env regression tests pass inside the clone
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
const isWin = process.platform === 'win32';
const NPM = isWin ? 'npm.cmd' : 'npm';
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(-900) : '')); } };
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
const sortKeys = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));

// ---- the source scan: every bare package specifier, static, dynamic, require, re-export --------------------------------
const PKG_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const BUILTINS = new Set(builtinModules);
function scanImports(root, dir) {
  const found = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(mjs|js|cjs)$/.test(e.name)) continue;
      const s = readFileSync(p, 'utf8');
      const re = /(?:\bimport\s+(?:[^'"()]*?\s+from\s+)?|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g;
      let m;
      while ((m = re.exec(s))) {
        const spec = m[1];
        if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:/.test(spec) || spec.startsWith('file:')) continue;
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!PKG_NAME.test(name) || BUILTINS.has(name)) continue; // code inside strings, and builtins imported without node:
        if (!found.has(name)) found.set(name, new Set());
        found.get(name).add(relative(root, p).split(sep).join('/'));
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
  check('K3 every package the Factory imports is declared: runtime ' + [...runtimeImports.keys()].join(', ') + ' in dependencies; harness ' + [...harnessImports.keys()].join(', ') + ' in dependencies or devDependencies',
    runtimeImports.size > 0 && missingRuntime.length === 0 && missingHarness.length === 0, [...missingRuntime, ...missingHarness].join(' | '));
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

// ================================================================= FRESH CLONE ============================================
if (!STATIC_ONLY) {
  const work = mkdtempSync(join(tmpdir(), 'factory-pkg-'));
  const cloneA = join(work, 'clone-a'), cloneB = join(work, 'clone-b');
  const run = (cmd, args, cwd, env = {}, timeout = 600000) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26, timeout, shell: isWin && /\.cmd$/.test(cmd) }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const cleanEnv = { FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '', FACTORY_STATE_DIR: '', FACTORY_NODE_ROLE: '', npm_config_audit: 'false', npm_config_fund: 'false' };
  let pg = null, admin = null, started = [];
  const liveTaskBefore = isWin ? run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim() : 'n/a';
  const liveTaskXml = isWin && liveTaskBefore !== 'NONE' ? run('powershell', ['-NoProfile', '-Command', "Export-ScheduledTask -TaskName 'BrainOS Factory Node'"], ROOT).out : null;
  try {
    for (const c of [cloneA, cloneB]) { git(['clone', '--quiet', '--no-hardlinks', ROOT, c], work); git(['checkout', '--quiet', head], c); }
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
    const stateA = join(work, 'state-a'); mkdirSync(stateA, { recursive: true });
    const nodeEnvA = { ...cleanEnv, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: stateA, FACTORY_NODE_BEAT_MS: '2000', FACTORY_NODE_STALE_MS: '6000', FACTORY_ADMISSION: 'off' };

    // F1
    const f1 = run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
    check('F1 a fresh clone of ' + head.slice(0, 12) + ': `npm ci --omit=dev --strict-allow-scripts` succeeds', f1.rc === 0, f1.out);

    // F2
    const depsA = run(process.execPath, [join(cloneA, 'scripts/factory-runner/deps.mjs'), '--json'], cloneA, cleanEnv);
    const resolveScript = 'const names=JSON.parse(process.argv[1]);const bad=[];for(const n of names){try{import.meta.resolve(n)}catch(e){bad.push(n+": "+e.code)}}console.log(JSON.stringify(bad));';
    const resRt = run(process.execPath, ['--input-type=module', '-e', resolveScript, JSON.stringify([...runtimeImports.keys()])], join(cloneA, 'scripts/factory-runner'), cleanEnv);
    const devPresent = Object.keys(pkg.devDependencies || {}).filter((n) => existsSync(join(cloneA, 'node_modules', ...n.split('/'))));
    check('F2 the runtime-only install is exactly the runtime set: deps.mjs ok, every runtime import resolves (' + [...runtimeImports.keys()].join(', ') + '), no dev package installed',
      depsA.rc === 0 && resRt.rc === 0 && resRt.out.trim().endsWith('[]') && devPresent.length === 0, depsA.out + ' | unresolved ' + resRt.out + ' | dev present: ' + devPresent.join(', '));

    // F3
    const f3 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'health'], cloneA, nodeEnvA, 120000);
    check('F3 node.mjs health from the runtime-only clone reaches a real PostgreSQL through pg and reports HEALTHY', f3.rc === 0 && /HEALTHY/.test(f3.out) && /runtime dependencies installed at their locked versions \(pg /.test(f3.out), f3.out);

    // F4
    const sup = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--env-file', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a')], { cwd: cloneA, env: { ...process.env, ...nodeEnvA, FACTORY_RUNNER_PG_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    started.push(sup); let supOut = ''; sup.stdout.on('data', (d) => { supOut += d; }); sup.stderr.on('data', (d) => { supOut += d; });
    let alive = null; const t0 = Date.now();
    while (Date.now() - t0 < 45000) { const s = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'status', '--json'], cloneA, nodeEnvA); if (/"state":"ALIVE"/.test(s.out)) { alive = s.out; break; } await sleep(2000); }
    run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--stop'], cloneA, nodeEnvA);
    const supExit = await new Promise((r) => { const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    check('F4 the supervisor from the runtime-only clone starts a worker that goes ALIVE on the plane, and --stop ends it (exit ' + supExit + ')', !!alive && supExit === 0, supOut);

    // F5
    rmSync(join(cloneA, 'node_modules', 'pg'), { recursive: true, force: true });
    const f5 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--env-file', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a5')], cloneA, { ...nodeEnvA, FACTORY_RUNNER_PG_URL: '' }, 60000);
    const st5 = existsSync(join(stateA, 'node-status.json')) ? readJson(join(stateA, 'node-status.json')) : {};
    const h5 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'health'], cloneA, nodeEnvA, 60000);
    check('F5 with pg removed the supervisor refuses by name (exit ' + f5.rc + ', state ' + st5.state + ', no worker started) and node health names the dependency, not the connection',
      f5.rc === 5 && st5.state === 'dependencies_missing' && /npm ci/.test(f5.out) && !/node started/.test(f5.out) && h5.rc === 1 && /runtime dependencies are not installed/.test(h5.out) && !/cannot connect/.test(h5.out), f5.out + '\n--- health\n' + h5.out);

    // F6
    if (isWin) {
      const ps = (args) => run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(cloneA, 'scripts/factory-runner/install-autostart.ps1'), ...args], cloneA, cleanEnv, 120000);
      const broken = ps(['-Preflight', '-EnvFile', envFile]);
      run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
      const fixed = ps(['-Preflight', '-EnvFile', envFile]);
      let guard = { rc: 'skipped', out: 'no live task on this machine; the other-checkout guard is not exercised (an install here would create one)' };
      if (liveTaskBefore !== 'NONE' && !liveTaskBefore.startsWith(cloneA)) guard = ps(['-Role', 'verifier', '-EnvFile', envFile]);
      const liveTaskAfter = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim();
      const guardOk = guard.rc === 'skipped' || (guard.rc === 3 && /belongs to another checkout/.test(guard.out));
      check('F6 install-autostart.ps1: -Preflight refuses the broken clone (exit ' + broken.rc + ') and passes the repaired one (exit ' + fixed.rc + '); an install from the clone does not take over another checkout\'s task (' + guard.rc + '); the live task is untouched',
        broken.rc === 1 && /PREFLIGHT FAILED/.test(broken.out) && /npm ci/.test(broken.out) && fixed.rc === 0 && /PREFLIGHT OK/.test(fixed.out) && guardOk && liveTaskAfter === liveTaskBefore,
        'broken: ' + broken.out + '\nfixed: ' + fixed.out + '\nguard: ' + guard.out + '\ntask before: ' + liveTaskBefore + '\ntask after: ' + liveTaskAfter);
    } else {
      run(NPM, ['ci', '--omit=dev', '--strict-allow-scripts'], cloneA, cleanEnv);
      console.log('NOTE F6 is Windows-only (the scheduled-task installer); skipped on ' + process.platform);
    }

    // F7
    if (process.platform === 'win32' || existsSync('/bin/bash')) {
      const stateB = join(work, 'state-b'); mkdirSync(stateB, { recursive: true });
      const f7 = run('bash', ['scripts/factory-runner/bootstrap-node.sh', '--role', 'verifier', '--env-file', envFile], cloneB, { ...cleanEnv, FACTORY_STATE_DIR: stateB, FACTORY_ADMISSION: 'off' }, 900000);
      check('F7 bootstrap-node.sh on a second fresh clone (no node_modules, no .factory) installs from the lock and ends BOOTSTRAPPED against the plane',
        f7.rc === 0 && /installing the locked dependencies \(npm ci\)/.test(f7.out) && /BOOTSTRAPPED/.test(f7.out) && existsSync(join(cloneB, 'node_modules', 'pg')), f7.out);
    } else console.log('NOTE F7 needs bash; skipped');

    // F8
    const f8 = run(NPM, ['ci', '--strict-allow-scripts'], cloneA, cleanEnv);
    const depsDev = run(process.execPath, [join(cloneA, 'scripts/factory-runner/deps.mjs'), '--dev'], cloneA, cleanEnv);
    const resH = run(process.execPath, ['--input-type=module', '-e', resolveScript, JSON.stringify([...harnessImports.keys()])], join(cloneA, 'qa/factory'), cleanEnv);
    const epScript = "const {startLocalPg}=await import(process.argv[1]);const p=await startLocalPg();const {default:pg}=await import('pg');const c=new pg.Client({connectionString:p.superUrl});await c.connect();const v=(await c.query('select version() v')).rows[0].v;await c.end();await p.stop();console.log('EMBEDDED '+v.split(',')[0]);process.exit(0);";
    const ep = run(process.execPath, ['--input-type=module', '-e', epScript, pathToFileURL(join(cloneA, 'qa/factory/local_pg.mjs')).href], join(cloneA, 'qa/factory'), cleanEnv, 180000);
    const epFromClone = /EMBEDDED PostgreSQL/.test(ep.out);
    check('F8 the full `npm ci --strict-allow-scripts` gives the harnesses everything: deps.mjs --dev ok, every qa/factory import resolves, and embedded-postgres from the clone\'s own install starts a server (' + (ep.out.match(/EMBEDDED ([^\n]+)/) || [, '?'])[1] + ')',
      f8.rc === 0 && depsDev.rc === 0 && resH.out.trim().endsWith('[]') && epFromClone, f8.out.slice(-400) + ' | ' + depsDev.out + ' | ' + resH.out + ' | ' + ep.out);

    // F9
    const f9 = run(process.execPath, ['--test', 'scripts/factory-runner/db.regression.test.mjs', 'scripts/factory-runner/runner-env.regression.test.mjs'], cloneA, cleanEnv, 180000);
    const passN = (f9.out.match(/ℹ pass (\d+)/) || [, '?'])[1], failN = (f9.out.match(/ℹ fail (\d+)/) || [, '?'])[1];
    check('F9 the accessor and runner-env regression tests pass inside the clone (pass ' + passN + ', fail ' + failN + ')', f9.rc === 0 && failN === '0', f9.out.slice(-600));
  } catch (e) {
    check('fresh-clone setup', false, e && e.stack || e);
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
    }
    try { if (admin) await admin.end(); } catch { /* closed */ }
    try { if (pg) await pg.stop(); } catch { /* down */ }
    try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
  }
}

console.log('');
console.log('package_bootstrap_regression: ' + pass + ' passed, ' + failures.length + ' failed' + (STATIC_ONLY ? '  (static rows only)' : '  (fresh clones of ' + head.slice(0, 12) + ', installed from the committed lock)'));
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
process.exit(0);
