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
//   K7 every package fetched at run time (npx with or without --yes, npm exec / npm x, quoted or not) by `npx --yes` under scripts/factory-runner/** names an exact version (an
//      "@latest" is an undeclared, unlocked dependency the lock cannot see)
// FRESH CLONE (HEAD cloned into a temp dir; nothing from this checkout's node_modules)
//   F1 `npm ci --omit=dev --strict-allow-scripts` succeeds - the runtime-only install a node needs
//   F2 the runtime install is exactly the runtime set: deps.mjs ok, every runtime package IMPORTS (a real import(), which
//      loads the package's own dependencies too), no dev package present
//   F3 node.mjs health from that clone reaches a real PostgreSQL through `pg` and reports HEALTHY
//   F4 the supervisor from that clone, on a node identity nothing else registered, starts a worker that goes ALIVE on the plane
//      as ITS role with a heartbeat after the supervisor started - and STAYS up for 20 s (same worker, no restart, no exit, the
//      heartbeat advancing) - and --stop ends it (exit 0)
//   F5 with a DAMAGED package (pg-protocol's files gone, its package.json kept), with a TRANSITIVE driver package (pg-protocol)
//      removed, and then with `pg` itself removed, every entry point refuses by
//      name: the supervisor (exit 5, state dependencies_missing, no worker started), node health (the dependency, not the
//      connection), node.mjs start and node.mjs status (exit 5)
//   F6 (Windows) install-autostart.ps1 -Preflight refuses on the broken clone, refuses an env file whose CA exists nowhere
//      here, and passes on the repaired one; from the clone, install, -Stop and -Uninstall all refuse (exit 3) to act on a task
//      that belongs to another checkout, and -Status names that owner; a SCRATCH task (-TaskName, never the live one) goes through
//      the Work-PC cycle: install -Role verifier -Start (supervisor confirmed), -Verify, -Stop, -Start alone (still verifier,
//      nothing re-installed), a hand-started supervisor stopped by a re-install whose task supervisor is confirmed, -Uninstall;
//      the live task is untouched throughout
//   F7 bootstrap-node.sh on a SECOND fresh clone with no node_modules and no .factory installs from the lock and ends
//      BOOTSTRAPPED against the plane - the Work-PC path, end to end
//   F8 the full `npm ci --strict-allow-scripts` gives the acceptance harnesses everything: every qa/factory import resolves
//      and embedded-postgres starts and stops a server from the clone's own install
//   F9 the accessor and runner-env regression tests pass inside the clone (they include a BOM'd env file and a missing CA)
//   F10 every runner.env the worker would refuse or fail on - a CA that exists nowhere here (the Work PC with the CA forgotten), a
//      key=value string, the superuser, a CA file that is not a certificate - is refused by the supervisor (exit 2, no worker
//      started), and the missing CA by bootstrap-node.sh (nothing registered), instead of a worker that fails every connect and
//      backs off forever
//   F11 stale pids after a reboot: a pid file and a status file naming OTHER live processes (reused numbers) neither stop the
//      supervisor from starting nor get those processes killed
//   F12 a supervised node claims ONLY the work types it can do: a queued verifier-gated software_development work order stays
//      queued with no run and its dependent stays blocked, while a bootstrap_probe is claimed and completed as a probe (the
//      default bootstrap used to report every work order done within a second, unblocking release work nobody verified)
//   F13 a node the admission gate refuses says so - in its log and in node.mjs status - instead of reading ALIVE and never claiming
//   F14 one supervisor per state dir WHATEVER THE PATH SPELLING: launched through a relative path, a second one launched through a
//      junction with a non-ASCII name is refused (exit 3); --whois and --status through the junction see the first running; --stop
//      through the junction stops it (identity by a path spelling let two supervisors share one node id - verification round 3)
// F1 and F8 also require the committed lock to be byte-for-byte unchanged by the install (npm 10's `npm install` rewrites it).
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import os from 'node:os';
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
  // Functions made by createRequire(...) load packages exactly like require - an alias must not hide a load. The first version
  // knew only a callee literally named createRequire and a direct 'const x = createRequire(...)' (verification 2026-09-24,
  // rounds 1 and 2). Now: createRequire under any local name (a renamed import, a destructured property), every alias of a
  // require function to a fixpoint (y = x), loads through .call/.apply and .resolve, and any OTHER use of an alias (passed on,
  // stored) is reported - its loads cannot be followed. Package names inside eval strings (node -e "...") are NOT scanned:
  // a registered, bounded limitation (ledger 217).
  const walkAll = (node, fn, parent = null) => {
    if (!node || typeof node.type !== 'string') return;
    fn(node, parent);
    for (const key of Object.keys(node)) { const v = node[key]; if (Array.isArray(v)) v.forEach((c) => walkAll(c, fn, node)); else if (v && typeof v === 'object' && typeof v.type === 'string') walkAll(v, fn, node); }
  };
  const createNames = new Set(['createRequire']);
  walkAll(ast, (n) => {
    if (n.type === 'ImportSpecifier' && n.imported && (n.imported.name || n.imported.value) === 'createRequire') createNames.add(n.local.name);
    if (n.type === 'Property' && n.key && (n.key.name || n.key.value) === 'createRequire' && n.value && n.value.type === 'Identifier') createNames.add(n.value.name);
  });
  const isCreateRequire = (n) => n && n.type === 'CallExpression' && ((n.callee.type === 'Identifier' && createNames.has(n.callee.name)) || (n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'createRequire'));
  const requireNames = new Set(['require']);
  for (let grew = true; grew;) {
    grew = false;
    walkAll(ast, (n) => {
      const bind = (id, init) => { if (id && id.type === 'Identifier' && init && (isCreateRequire(init) || (init.type === 'Identifier' && requireNames.has(init.name))) && !requireNames.has(id.name)) { requireNames.add(id.name); grew = true; } };
      if (n.type === 'VariableDeclarator') bind(n.id, n.init);
      if (n.type === 'AssignmentExpression' && n.operator === '=') bind(n.left, n.right);
    });
  }
  const loadArg = (a) => { if (!a) return; const c = constant(a); if (c !== null) specs.push(c); else nonConstant(a); };
  walkAll(ast, (n, parent) => {
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration') && n.source) specs.push(n.source.value);
    else if (n.type === 'ImportExpression') loadArg(n.source);
    else if (n.type === 'CallExpression') {
      const cal = n.callee;
      if ((cal.type === 'Identifier' && requireNames.has(cal.name)) || isCreateRequire(cal)) loadArg(n.arguments[0]);
      else if (cal.type === 'MemberExpression' && cal.object && cal.object.type === 'Identifier' && requireNames.has(cal.object.name) && cal.property) {
        const p = cal.property.name;
        if (p === 'call') loadArg(n.arguments[1]);
        else if (p === 'apply') { const arr = n.arguments[1]; if (arr && arr.type === 'ArrayExpression') loadArg(arr.elements[0]); else specs.push({ dynamic: cal.object.name + '.apply with arguments the scan cannot read' }); }
        else if (p === 'resolve') loadArg(n.arguments[0]);
      }
    } else if (n.type === 'Identifier' && n.name !== 'require' && requireNames.has(n.name) && parent) {
      const followed = (parent.type === 'CallExpression' && parent.callee === n) || (parent.type === 'MemberExpression' && parent.object === n)
        || (parent.type === 'VariableDeclarator' && (parent.id === n || parent.init === n)) || (parent.type === 'AssignmentExpression' && (parent.left === n || parent.right === n));
      if (!followed) specs.push({ dynamic: 'the require function ' + n.name + ' is passed on or stored, so its loads cannot be followed' });
    }
  });
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
    // npx with or without --yes (npm treats a non-TTY npx as --yes), npm exec / npm x, any flags, a quoted or bare spec. The first
    // version matched only 'npx --yes pkg' unquoted (verification 2026-09-24, round 2). Shell and PowerShell files are scanned
    // line by line (comments skipped; a permission pattern such as 'Bash(npx supabase ...:*)' is not an invocation). JS files
    // are PARSED: only a command string (one that begins with npx / npm exec) or a spawn('npx', [...]) argument list counts, so
    // prose that mentions npx in a string is not an invocation.
    const at = (i) => relative(ROOT, p).split(sep).join('/') + (i == null ? '' : ':' + (i + 1));
    const judgeCmd = (cmd, where) => { for (const m of cmd.matchAll(/(?<!Bash\()\b(?:npx|npm\s+(?:exec|x))((?:\s+-{1,2}[\w-]+(?:=\S+)?)*)\s+(['"]?)((?:@[\w.-]+\/)?[\w.-]+)(?:@([^\s'"]+))?\2/g)) { found.push(m[3] + '@' + (m[4] || '(none)') + ' ' + where); if (!m[4] || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(m[4])) bad.push(m[3] + (m[4] ? '@' + m[4] : ' (no version)') + ' at ' + where); } };
    const text = readFileSync(p, 'utf8');
    if (/\.(sh|ps1|cmd|bat)$/.test(e.name)) text.split(/\r?\n/).forEach((line, i) => { if (!/^\s*(#|::|rem\s)/i.test(line)) judgeCmd(line, at(i)); });
    else {
      let ast = null; for (const sourceType of ['module', 'script']) { try { ast = parseJs(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); break; } catch { /* try the other */ } }
      if (!ast) { bad.push('does not parse: ' + at()); return; }
      const lineOf = (pos) => text.slice(0, pos).split('\n').length - 1;
      const str = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value : (n && n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked).join(' <expr> ') : null);
      const visit = (n) => {
        if (!n || typeof n.type !== 'string') return;
        const v = str(n);
        if (v !== null && /^\s*(npx|npm\s+(exec|x))\b/.test(v)) judgeCmd(v, at(lineOf(n.start)));
        if (n.type === 'CallExpression' && n.arguments.length >= 2 && /^(npx|npm)(\.cmd)?$/.test(str(n.arguments[0]) || '') && n.arguments[1].type === 'ArrayExpression') {
          const cmd = (str(n.arguments[0]) || '').replace(/\.cmd$/, '') + ' ' + n.arguments[1].elements.map((x) => str(x) === null ? '<expr>' : str(x)).join(' ');
          if (/^(npx|npm\s+(exec|x))\b/.test(cmd)) judgeCmd(cmd, at(lineOf(n.start)));
        }
        for (const k of Object.keys(n)) { const c = n[k]; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c === 'object' && typeof c.type === 'string') visit(c); }
      };
      visit(ast);
    } } };
  walk(join(ROOT, 'scripts/factory-runner'));
  check('K7 every package fetched at run time by npx / npm exec under scripts/factory-runner names an exact version (' + (found.join(', ') || 'none') + ')', bad.length === 0, 'not pinned: ' + bad.join(', '));
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
  const scratchTask = 'BrainOS Factory Node TEST-' + randomUUID().slice(0, 8);
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
    // F12's work orders are seeded before F4's supervised node starts, and judged after its 20 s window
    const wo12 = { dev: randomUUID(), rel: randomUUID(), probe: randomUUID() };
    await admin.query("insert into factory.work_orders (work_order_id, title, work_type, owned_surface, priority, status, requires_security_role) values ($1, 'F12 verifier-gated development work', 'software_development', $2::text[], 'high', 'queued', 'verifier')", [wo12.dev, ['qa/f12/dev-' + wo12.dev.slice(0, 8)]]);
    await admin.query("insert into factory.work_orders (work_order_id, title, work_type, owned_surface, priority, status) values ($1, 'F12 release that depends on it', 'software_development', $2::text[], 'high', 'queued')", [wo12.rel, ['qa/f12/rel-' + wo12.rel.slice(0, 8)]]);
    await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [wo12.rel, wo12.dev]);
    await admin.query("insert into factory.work_orders (work_order_id, title, work_type, owned_surface, priority, status) values ($1, 'F12 probe', 'bootstrap_probe', $2::text[], 'high', 'queued')", [wo12.probe, ['qa/f12/probe-' + wo12.probe.slice(0, 8)]]);
    const stateA4 = join(work, 'state-a4'); mkdirSync(stateA4, { recursive: true });
    const nodeEnvA4 = { ...nodeEnvA, FACTORY_STATE_DIR: stateA4 };
    const supStartedAt = Date.now();
    const sup = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a')], { cwd: cloneA, env: { ...process.env, ...nodeEnvA4, FACTORY_RUNNER_PG_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    // ...and it must STAY up: one instant of ALIVE also passed a worker that died a few seconds after every start (verification
    // 2026-09-24, round 2). For 20 s - longer than the first backoff plus several heartbeats - the supervisor keeps the same
    // worker, state running, no restart, no exit, and the heartbeat advances.
    let stayed = false;
    if (alive) {
      const first = existsSync(join(stateA4, 'node-status.json')) ? readJson(join(stateA4, 'node-status.json')) : {};
      const beats = new Set(); let steady = true; const tS = Date.now();
      while (Date.now() - tS < 20000) {
        await sleep(2500);
        const s = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'status', '--json'], cloneA, nodeEnvA4);
        const js = (s.out.match(/^\{.*\}$/m) || [null])[0]; const st = js ? JSON.parse(js) : {};
        const supSt = existsSync(join(stateA4, 'node-status.json')) ? readJson(join(stateA4, 'node-status.json')) : {};
        if (st.lastHeartbeatAt) beats.add(String(st.lastHeartbeatAt));
        if (!(st.state === 'ALIVE' && supSt.state === 'running' && supSt.restarts === 0 && !supSt.lastExit && supSt.childPid === first.childPid)) {
          steady = false; why4 = 'did not stay up: status ' + st.state + ', supervisor ' + JSON.stringify({ state: supSt.state, restarts: supSt.restarts, lastExit: supSt.lastExit, childPid: supSt.childPid, firstChild: first.childPid }); break;
        }
      }
      stayed = steady && beats.size >= 3;
      if (steady && !stayed) why4 = 'the heartbeat did not advance (' + beats.size + ' distinct heartbeats in 20 s)';
    }
    const f12 = {};
    for (const [k, id] of Object.entries(wo12)) {
      const w = (await admin.query('select status from factory.work_orders where work_order_id = $1', [id])).rows[0] || {};
      const runs = (await admin.query('select status, termination_reason from factory.agent_runs where work_order_id = $1', [id])).rows;
      f12[k] = { status: w.status, runs: runs.length, reason: runs[0] && runs[0].termination_reason };
    }
    run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--stop'], cloneA, nodeEnvA4);
    const supExit = await new Promise((r) => { const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    if (want('F12')) check('F12 the supervised node claims only what it can do: verifier-gated development work ' + JSON.stringify(f12.dev) + ', its dependent ' + JSON.stringify(f12.rel) + ', a probe ' + JSON.stringify(f12.probe),
      f12.dev.status === 'queued' && f12.dev.runs === 0 && f12.rel.status === 'queued' && f12.rel.runs === 0 && f12.probe.status === 'done' && f12.probe.reason === 'bootstrap_probe_completed', JSON.stringify(f12) + '\n' + supOut);
    check('F4 the supervisor from the runtime-only clone, on a fresh node identity, starts a worker that goes ALIVE as role verifier with its own heartbeat, STAYS up 20 s (same worker, no restart, heartbeat advancing), and --stop ends it (exit ' + supExit + ')', !!alive && stayed && supExit === 0, why4 + '\n' + supOut);

    // F5 - first a TRANSITIVE package (pg-protocol: pg loads it, package.json does not name it - the first dependency check
    // missed exactly this and the supervisor crash-looped), then pg itself. Every entry point must refuse by name.
    const refusals = (label) => {
      const sp = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a5')], cloneA, { ...nodeEnvA, FACTORY_RUNNER_PG_URL: '' }, 60000);
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
    // a DAMAGED install: pg-protocol's package.json at the locked version, its code gone - every metadata check passes, the worker
    // dies on "Cannot find module" (verification 2026-09-24, round 2); only loading the package finds it
    rmSync(join(cloneA, 'node_modules', 'pg-protocol', 'dist', 'index.js'), { force: true });
    const f5x = refusals('pg-protocol/dist/index.js removed, its package.json kept (damaged)');
    rmSync(join(cloneA, 'node_modules', 'pg-protocol'), { recursive: true, force: true });
    const f5t = refusals('pg-protocol removed (transitive)');
    rmSync(join(cloneA, 'node_modules', 'pg'), { recursive: true, force: true });
    const f5d = refusals('pg removed');
    check('F5 every entry point refuses by name with a damaged package, a transitive driver package missing, and pg missing (' + f5x.text + ' | ' + f5t.text + ' | ' + f5d.text + ')',
      f5x.ok && f5t.ok && f5d.ok, f5x.detail + '\n=====\n' + f5t.detail + '\n=====\n' + f5d.detail);

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
      let statusOther = { rc: 'skipped', out: '' };
      if (liveTaskBefore !== 'NONE' && !liveTaskBefore.startsWith(cloneA)) statusOther = ps(['-Status']);
      // THE WORK-PC CYCLE on a SCRATCH task (never the live one): install as verifier and start (the task's supervisor confirmed),
      // -Verify, -Stop, -Start alone (must stay verifier and re-install nothing - the documented -Stop/-Start used to re-register
      // a verifier as generic), then a hand-started supervisor that a re-install must stop and replace with a confirmed task
      // supervisor (it used to make the task's supervisor exit 3 and leave the node down), then -Uninstall.
      const psT = (args) => ps([...args, '-TaskName', scratchTask]);
      const taskArgsOf = () => run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName '" + scratchTask + "' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).Arguments}else{'NONE'}"], ROOT).out.trim();
      const cyc = {};
      cyc.install = psT(['-Role', 'verifier', '-EnvFile', envFile, '-LogDir', join(work, 'logs-task'), '-Start']);
      cyc.verify = psT(['-Verify']);
      cyc.execute = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName '" + scratchTask + "' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).Execute}else{'NONE'}"], ROOT).out.trim();
      cyc.stop = psT(['-Stop']);
      cyc.verifyStopped = psT(['-Verify']);
      cyc.start = psT(['-Start']);
      cyc.argsAfterStart = taskArgsOf();
      const whois = () => { const w = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--whois'], cloneA, cleanEnv); try { return JSON.parse(w.out.trim().split(/\r?\n/).pop()); } catch { return { running: false }; } };
      const handStart = async (role, logName) => {
        const h = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', envFile, '--role', role, '--log-dir', join(work, logName)], { cwd: cloneA, env: { ...process.env, ...cleanEnv }, stdio: 'ignore', windowsHide: true });
        started.push(h);
        for (let i = 0; i < 30; i++) { await sleep(500); const w = whois(); if (w.running && w.pid === h.pid) break; }
        return h;
      };
      const gone = (h) => new Promise((r) => { if (h.exitCode !== null) return r(true); const t = setTimeout(() => r(false), 20000); h.on('exit', () => { clearTimeout(t); r(true); }); });
      // a hand-started GENERIC supervisor while the task is stopped: -Start alone must not call that "running" - it stops it and the
      // task's own verifier supervisor takes over (verification round 3)
      psT(['-Stop']);
      const handGeneric = await handStart('generic', 'logs-hand-generic');
      cyc.startOverHand = psT(['-Start']);
      cyc.handGenericGone = await gone(handGeneric);
      // Stop-ScheduledTask straight (what Task Scheduler's own Stop does) kills only the headless console host: the supervisor
      // must notice and stop with a truthful state, not run on unmanaged (verification round 3)
      run('powershell', ['-NoProfile', '-Command', "Stop-ScheduledTask -TaskName '" + scratchTask + "'"], ROOT);
      let rawStopped = false;
      for (let i = 0; i < 20 && !rawStopped; i++) { await sleep(1000); rawStopped = !whois().running; }
      const stAfterRaw = existsSync(join(cloneA, '.factory', 'node-status.json')) ? readJson(join(cloneA, '.factory', 'node-status.json')) : {};
      cyc.rawStop = 'supervisor stopped ' + rawStopped + ', recorded state ' + stAfterRaw.state;
      // a re-install without -LogDir keeps the task's log dir
      cyc.reinstallKeep = psT(['-Role', 'verifier', '-EnvFile', envFile]);
      cyc.argsAfterKeep = taskArgsOf();
      cyc.uninstall1 = psT(['-Uninstall']);
      // a hand-started supervisor with NO task, then an install with a RELATIVE -EnvFile (resolved against the caller's directory,
      // registered absolute - it used to be registered verbatim and the task's supervisor looked for it in the checkout)
      const hand = await handStart('verifier', 'logs-hand');
      cyc.reinstall = psT(['-Role', 'verifier', '-EnvFile', relative(cloneA, envFile), '-LogDir', join(work, 'logs-task'), '-Start']);
      const handGone = await gone(hand);
      cyc.argsAfterReinstall = taskArgsOf();
      cyc.uninstall = psT(['-Uninstall']);
      cyc.argsAfterUninstall = taskArgsOf();
      const cycleOk = cyc.install.rc === 0 && /started: supervisor pid \d+/.test(cyc.install.out) && /role verifier/.test(cyc.install.out)
        && cyc.verify.rc === 0 && /OK/.test(cyc.verify.out)
        && (Number(String(os.release()).split('.')[2] || 0) < 17763 || /\\conhost\.exe$/i.test(cyc.execute))
        && cyc.stop.rc === 0 && cyc.verifyStopped.rc === 1 && /not running a supervisor/.test(cyc.verifyStopped.out)
        && cyc.start.rc === 0 && /nothing re-installed/.test(cyc.start.out) && /started: supervisor pid \d+/.test(cyc.start.out) && /--role verifier/.test(cyc.argsAfterStart)
        && cyc.startOverHand.rc === 0 && /stopping it so the task's own supervisor takes over/.test(cyc.startOverHand.out) && /started: supervisor pid \d+, worker pid \d+, role verifier/.test(cyc.startOverHand.out) && cyc.handGenericGone
        && /supervisor stopped true, recorded state stopped/.test(cyc.rawStop)
        && cyc.reinstallKeep.rc === 0 && /--log-dir /.test(cyc.argsAfterKeep) && /--role verifier/.test(cyc.argsAfterKeep)
        && cyc.uninstall1.rc === 0
        && cyc.reinstall.rc === 0 && /started: supervisor pid \d+/.test(cyc.reinstall.out) && (cyc.reinstall.out.match(/started: supervisor pid (\d+)/) || [])[1] !== String(hand.pid) && handGone
        && cyc.argsAfterReinstall.includes('--runner-env "' + envFile + '"')
        && cyc.uninstall.rc === 0 && cyc.argsAfterUninstall === 'NONE';
      const liveTaskAfter = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim();
      const refused = (g) => g.rc === 'skipped' || (g.rc === 3 && /belongs to another checkout/.test(g.out));
      const guardOk = refused(guard) && refused(stopGuard) && refused(uninstallGuard) && (statusOther.rc === 'skipped' || /ANOTHER checkout/.test(statusOther.out));
      check('F6 install-autostart.ps1: -Preflight refuses the broken clone (exit ' + broken.rc + ') and a missing CA (exit ' + noCa.rc + ') and passes the repaired one (exit ' + fixed.rc + '); from the clone install/-Stop/-Uninstall refuse another checkout\'s task (' + guard.rc + '/' + stopGuard.rc + '/' + uninstallGuard.rc + ') and -Status names its owner; the scratch-task Work-PC cycle (install+start, -Verify, -Stop, -Start still verifier, a hand-started supervisor replaced, -Uninstall) ' + (cycleOk ? 'holds' : 'FAILS') + '; the live task is untouched',
        broken.rc === 1 && /PREFLIGHT FAILED/.test(broken.out) && /npm ci/.test(broken.out) && noCa.rc === 1 && /copy the CA file/.test(noCa.out) && fixed.rc === 0 && /PREFLIGHT OK/.test(fixed.out) && guardOk && cycleOk && liveTaskAfter === liveTaskBefore,
        'broken: ' + broken.out + '\nno CA: ' + noCa.out + '\nfixed: ' + fixed.out + '\nguard: ' + guard.out + '\nstop: ' + stopGuard.out + '\nuninstall: ' + uninstallGuard.out + '\nstatus: ' + statusOther.out
        + '\n--- cycle ' + Object.entries(cyc).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : 'rc ' + v.rc + ' ' + v.out)).join('\n') + '\nhand-started supervisor pid ' + hand.pid + ' gone ' + handGone
        + '\ntask before: ' + liveTaskBefore + '\ntask after: ' + liveTaskAfter);
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
      const envs = { 'CA missing here': [noCaEnv, /copy the CA file/] };
      const mk = (name, content) => { const f = join(work, 'env10', name, 'runner.env'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content); return f; };
      const badCa = join(work, 'env10', 'bad-ca.crt'); mkdirSync(dirname(badCa), { recursive: true }); writeFileSync(badCa, 'this is not a certificate\n');
      envs['a key=value string'] = [mk('kv', 'FACTORY_RUNNER_PG_URL=host=127.0.0.1 port=' + pg.port + ' user=' + pg.runnerRole + '\n'), /not a URL/];
      envs['the superuser'] = [mk('super', 'FACTORY_RUNNER_PG_URL=' + pg.superUrl + '\n'), /superuser/];
      const pemCa = readFileSync(join(ROOT, 'scripts/factory-runner/runner-env.regression.test.mjs'), 'utf8').match(/'-----BEGIN CERTIFICATE-----',([\s\S]*?)'-----END CERTIFICATE-----'/);
      const derCa = join(work, 'env10', 'der-ca.cer'); writeFileSync(derCa, Buffer.from((pemCa ? pemCa[1] : '').replace(/[',\s]/g, ''), 'base64'));
      envs['a DER CA (the Windows export default; pg reads PEM)'] = [mk('der', 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '?sslmode=verify-full&sslrootcert=' + encodeURIComponent(derCa) + '\n'), /DER, not PEM/];
      envs['a CA file that is not a certificate'] = [mk('badca', 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '?sslmode=verify-full&sslrootcert=' + encodeURIComponent(badCa) + '\n'), /is not a certificate/];
      const results = Object.entries(envs).map(([label, [f, why]]) => {
        const r = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', f, '--role', 'verifier', '--log-dir', join(work, 'logs-a10')], cloneA, { ...cleanEnv, FACTORY_STATE_DIR: state10 }, 30000);
        return { label, rc: r.rc, ok: r.rc === 2 && /REFUSED/.test(r.out) && why.test(r.out) && !/node started/.test(r.out), out: r.out };
      });
      let boot10 = { rc: 'skipped', out: 'bash not available' };
      if (process.platform === 'win32' || existsSync('/bin/bash')) boot10 = run('bash', ['scripts/factory-runner/bootstrap-node.sh', '--role', 'verifier', '--env-file', noCaEnv], cloneA, { ...cleanEnv, FACTORY_STATE_DIR: state10 }, 120000);
      const bootOk = boot10.rc === 'skipped' || (boot10.rc === 2 && /copy the CA file/.test(boot10.out) && !/BOOTSTRAPPED/.test(boot10.out));
      check('F10 every env file the worker would refuse is refused by the supervisor before a worker starts (' + results.map((r) => r.label + ': exit ' + r.rc).join('; ') + ') and the missing CA by bootstrap-node.sh (exit ' + boot10.rc + ')',
        results.every((r) => r.ok) && bootOk,
        results.map((r) => r.label + ': ' + r.out).join('\n--- ') + '\n--- bootstrap\n' + boot10.out);
    }

    // F11
    if (want('F11')) {
      // after a reboot the pid file and the status file name numbers Windows has handed to other processes: two bystanders hold
      // them here. The supervisor must start anyway and must not kill either (it did both before 2026-09-24, round 2).
      const s11 = join(work, 'state-a11'); mkdirSync(s11, { recursive: true });
      const bystander = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
      const b1 = bystander(), b2 = bystander(); started.push(b1, b2);
      await sleep(1000);
      writeFileSync(join(s11, 'node-supervisor.pid'), String(b1.pid));
      writeFileSync(join(s11, 'node-status.json'), JSON.stringify({ supervisorPid: b1.pid, childPid: b2.pid, state: 'running', restarts: 0 }));
      let out11 = '';
      const sup11 = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a11')], { cwd: cloneA, env: { ...process.env, ...nodeEnvA, FACTORY_STATE_DIR: s11, FACTORY_RUNNER_PG_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      started.push(sup11); sup11.stdout.on('data', (d) => { out11 += d; }); sup11.stderr.on('data', (d) => { out11 += d; });
      let running11 = false;
      for (let i = 0; i < 40 && !running11; i++) { await sleep(1000); const st = existsSync(join(s11, 'node-status.json')) ? readJson(join(s11, 'node-status.json')) : {}; running11 = st.supervisorPid === sup11.pid && st.state === 'running' && st.childPid && st.childPid !== b2.pid; }
      const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };
      const bystandersAlive = alive(b1.pid) && alive(b2.pid) && b1.exitCode === null && b2.exitCode === null;
      run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--stop'], cloneA, { ...nodeEnvA, FACTORY_STATE_DIR: s11 });
      const exit11 = await new Promise((r) => { if (sup11.exitCode !== null) return r(sup11.exitCode); const t = setTimeout(() => r('timeout'), 25000); sup11.on('exit', (c) => { clearTimeout(t); r(c); }); });
      // ...and a REAL orphan - a worker left running by a supervisor that crashed, recognised by the instance token that supervisor
      // put on its command line - IS ended before the new worker starts (one worker per node identity). Planted here, because a
      // crashed supervisor's worker usually dies on its own broken stdout before a new supervisor looks (the reboot acceptance's R5
      // reports "orphan was alive: false"), so the path would otherwise never be exercised.
      const inst = randomUUID();
      const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', join(cloneA, 'scripts', 'factory-runner', 'node.mjs'), 'start', '--supervisor-instance', inst], { stdio: 'ignore', windowsHide: true });
      started.push(orphan);
      await sleep(1000);
      writeFileSync(join(s11, 'node-status.json'), JSON.stringify({ supervisorPid: 999999, instance: inst, childPid: orphan.pid, state: 'running', restarts: 0 }));
      let out11b = '';
      const sup11b = spawn(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a11')], { cwd: cloneA, env: { ...process.env, ...nodeEnvA, FACTORY_STATE_DIR: s11, FACTORY_RUNNER_PG_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      started.push(sup11b); sup11b.stdout.on('data', (d) => { out11b += d; }); sup11b.stderr.on('data', (d) => { out11b += d; });
      let running11b = false;
      for (let i = 0; i < 40 && !running11b; i++) { await sleep(1000); const st = existsSync(join(s11, 'node-status.json')) ? readJson(join(s11, 'node-status.json')) : {}; running11b = st.supervisorPid === sup11b.pid && st.state === 'running'; }
      const orphanEnded = orphan.exitCode !== null || !alive(orphan.pid);
      run(process.execPath, [join(cloneA, 'scripts/factory-runner/node-supervisor.mjs'), '--stop'], cloneA, { ...nodeEnvA, FACTORY_STATE_DIR: s11 });
      const exit11b = await new Promise((r) => { if (sup11b.exitCode !== null) return r(sup11b.exitCode); const t = setTimeout(() => r('timeout'), 25000); sup11b.on('exit', (c) => { clearTimeout(t); r(c); }); });
      check('F11 stale pids naming other live processes: the supervisor starts its own worker (' + running11 + '), both bystanders are alive afterwards (' + bystandersAlive + '), the stale pids are logged as such, and --stop ends it (exit ' + exit11 + '); a real orphan carrying the recorded instance token is ended before the new worker starts (' + orphanEnded + ', exit ' + exit11b + ')',
        running11 && bystandersAlive && /stale/.test(out11) && exit11 === 0 && running11b && orphanEnded && /orphaned node \(pid \d+\) from a previous supervisor ended/.test(out11b) && exit11b === 0, out11 + '\n--- real orphan\n' + out11b);
      for (const b of [b1, b2, orphan]) { try { b.kill(); } catch { /* gone */ } }
    }

    // F13
    if (want('F13')) {
      const s13 = join(work, 'state-a13'); mkdirSync(s13, { recursive: true });
      const env13 = { ...nodeEnvA, FACTORY_STATE_DIR: s13, FACTORY_ADMISSION: '', FACTORY_MIN_FREE_MB: '99999999' };
      const once = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'start', '--once'], cloneA, env13, 60000);
      const st13 = run(process.execPath, [join(cloneA, 'scripts/factory-runner/node.mjs'), 'status'], cloneA, env13, 60000);
      check('F13 a node the admission gate refuses says so: its log names the refusal and status prints NOT CLAIMING (start exit ' + once.rc + ', status exit ' + st13.rc + ')',
        once.rc === 0 && /admission REFUSED/.test(once.out) && /FACTORY_MIN_FREE_MB/.test(once.out) && /NOT CLAIMING/.test(st13.out), once.out + '\n--- status\n' + st13.out);
    }

    // F14
    if (want('F14')) {
      // the checkout reached two ways: the real path (launched RELATIVE, from its own directory) and a junction whose name is not
      // ASCII (a Cyrillic Windows user name is the realistic case). The default state dir, so the spelling is all that differs.
      const junction = join(work, 'jct-\u043a\u043b\u043e\u043d');
      if (isWin) run('powershell', ['-NoProfile', '-Command', "New-Item -ItemType Junction -Path '" + junction + "' -Target '" + cloneA + "' | Out-Null"], ROOT);
      else run('ln', ['-s', cloneA, junction], ROOT);
      const env14 = { ...process.env, ...cleanEnv };
      let outA = '';
      const supA = spawn(process.execPath, ['./node-supervisor.mjs', '--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-a14')], { cwd: join(cloneA, 'scripts', 'factory-runner'), env: env14, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      started.push(supA); supA.stdout.on('data', (d) => { outA += d; }); supA.stderr.on('data', (d) => { outA += d; });
      const viaJ = (args, t = 60000) => run(process.execPath, [join(junction, 'scripts', 'factory-runner', 'node-supervisor.mjs'), ...args], join(junction), cleanEnv, t);
      let upA = false;
      for (let i = 0; i < 30 && !upA; i++) { await sleep(1000); const w = viaJ(['--whois']); try { const o = JSON.parse(w.out.trim().split(/\r?\n/).pop()); upA = o.running && o.pid === supA.pid && o.state === 'running'; } catch { /* not yet */ } }
      const second = viaJ(['--runner-env', envFile, '--role', 'verifier', '--log-dir', join(work, 'logs-b14')], 60000);
      const st14 = viaJ(['--status']);
      const stop14 = viaJ(['--stop']);
      const exitA = await new Promise((r) => { if (supA.exitCode !== null) return r(supA.exitCode); const t = setTimeout(() => r('timeout'), 25000); supA.on('exit', (c) => { clearTimeout(t); r(c); }); });
      check('F14 one supervisor per state dir whatever the path spelling: the relative-launched one is seen running through a non-ASCII junction (' + upA + '), a second one through the junction is refused (exit ' + second.rc + '), --status there is not STALE, and --stop there stops the first (exit ' + exitA + ')',
        upA && second.rc === 3 && /already running/.test(second.out) && !/STALE/.test(st14.out) && /running: supervisor pid/.test(st14.out) && /stop requested; supervisor \d+/.test(stop14.out) && exitA === 0,
        'second: ' + second.out + '\n--- status via junction\n' + st14.out + '\n--- stop\n' + stop14.out + '\n--- first\n' + outA);
      if (isWin) run('powershell', ['-NoProfile', '-Command', "(Get-Item -LiteralPath '" + junction + "').Delete()"], ROOT); else rmSync(junction, { force: true });
    }
  } catch (e) {
    check('F0 fresh-clone setup (free disk, clones at HEAD, disposable plane)', false, e && e.stack || e);
  } finally {
    if (isWin) run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName '" + scratchTask + "' -ErrorAction SilentlyContinue; if($t){ Stop-ScheduledTask -TaskName '" + scratchTask + "' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName '" + scratchTask + "' -Confirm:$false }"], ROOT);
    for (const c of started) { try { if (c.exitCode === null) c.kill(); } catch { /* gone */ } }
    if (isWin) { // any process still running from the temp clones (a worker a failed row left behind) is ended
      run('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + work.replace(/'/g, "''") + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], ROOT);
      // the live task must be exactly as it was; if a broken guard changed it, put it back from its own export
      const after = run('powershell', ['-NoProfile', '-Command', "$t=Get-ScheduledTask -TaskName 'BrainOS Factory Node' -ErrorAction SilentlyContinue; if($t){($t.Actions|Select-Object -First 1).WorkingDirectory + '|' + ($t.Actions|Select-Object -First 1).Arguments + '|' + $t.Settings.Enabled}else{'NONE'}"], ROOT).out.trim();
      // ...but only undo what THIS run's clones did: the task removed, or pointed into this run's work dir. Any other change was
      // made by someone else while the run was going - an operator's re-install - and reverting it silently is the harm
      // (2026-09-24: a run restored the export it took at its start over a legitimate re-install made meanwhile). It is said.
      const takenByUs = after === 'NONE' || after.toLowerCase().startsWith(work.toLowerCase());
      if (liveTaskXml && after !== liveTaskBefore && takenByUs) {
        const xmlFile = join(work, 'live-task.xml'); writeFileSync(xmlFile, liveTaskXml);
        run('powershell', ['-NoProfile', '-Command', "Register-ScheduledTask -TaskName 'BrainOS Factory Node' -Xml (Get-Content -Raw '" + xmlFile + "') -Force | Out-Null"], ROOT);
        console.log('RESTORED the live scheduled task from its export (this run\'s clones had ' + (after === 'NONE' ? 'removed it' : 'taken it over') + ')');
      } else if (liveTaskXml && after !== liveTaskBefore) console.log('NOTE the live scheduled task changed during this run, not by this run\'s clones (someone re-installed it?) - left as it is; F6\'s "untouched" proof does not hold for this run');
      // and running, if it was: a -Stop that got past a broken guard would otherwise leave this PC's node stopped
      if (liveStateBefore === 'Running' && taskState() !== 'Running' && (after === liveTaskBefore || takenByUs)) {
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
