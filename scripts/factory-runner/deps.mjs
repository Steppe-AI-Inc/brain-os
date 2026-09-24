// ARE THIS CHECKOUT'S RUNTIME DEPENDENCIES INSTALLED, AND ARE THEY THE LOCKED ONES?
//
// The 2026-09-24 packaging defect: the branch imported `pg` from `db.mjs` while the root package.json declared nothing and no
// package-lock.json existed, so a fresh clone could not `npm ci`, and a supervised node on it crash-looped on
// ERR_MODULE_NOT_FOUND with nothing naming the cause. Every Factory entry point now asks this module first and refuses with
// the fix spelled out instead of starting a worker that cannot run.
//
// WHAT IS CHECKED IS THE LOCKED CLOSURE, NOT THE MANIFEST. The first version compared only the packages package.json names
// (`pg`) and so reported "ready" while `pg-protocol` - which pg loads - was missing; the supervisor then crash-looped exactly
// as before (found by independent verification, 2026-09-24). Now every package-lock.json entry a runtime install contains
// (not `dev`; with --dev, every entry) must be present at its locked version, with npm's own rules for optional packages:
//   - an optional package built for another os/cpu/libc is not expected here and is skipped;
//   - any other optional package may be absent (npm tolerates that), but when present it must be the locked version;
//   - a PLATFORM FAMILY - a package that ships its binary as three or more platform-specific optional packages (esbuild,
//     embedded-postgres, oxc-parser) - needs the member for this platform installed, and a family with no member for this
//     platform is reported by name ("publishes no build for win32-arm64") instead of failing later when the binary is run.
//
// AND THEN THE DECLARED PACKAGES ARE ACTUALLY LOADED, in a child process. Metadata is not loadability: a package whose
// package.json is at the locked version but whose files are gone (a damaged or half-deleted install) passed every check
// above while the worker died on "Cannot find module ...pg-protocol/dist/index.js" and the supervisor backed off forever
// (verification 2026-09-24). A real import loads the package and everything it loads; ~0.2 s for pg.
// No network, and nothing of this checkout runs in the child except the import of the declared packages.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

let libcCache;
const libc = () => {
  if (libcCache !== undefined) return libcCache;
  try { libcCache = process.platform !== 'linux' ? null : (process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl'); } catch { libcCache = null; }
  return libcCache;
};
// npm's rule for os/cpu/libc lists: a "!x" entry excludes x; otherwise the value must be listed (no list: any)
const allows = (list, value) => {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (value == null) return false;
  if (list.includes('!' + value)) return false;
  const positive = list.filter((x) => !x.startsWith('!'));
  return positive.length === 0 || positive.includes(value);
};
export const platformMatches = (entry, platform = process.platform, arch = process.arch) =>
  allows(entry.os, platform) && allows(entry.cpu, arch) && (!entry.libc || (platform === 'linux' && allows(entry.libc, libc())));
const nameOf = (lockPath) => { const parts = lockPath.split('node_modules/'); return parts[parts.length - 1]; };
const constrained = (e) => !!(e && (e.os || e.cpu || e.libc));

/**
 * @param {string} [root] the checkout to judge (default: the one this file lives in)
 * @param {{dev?: boolean, platform?: string, arch?: string}} [opts] dev: the full install the acceptance harnesses need
 * @returns {{ok:boolean, root:string, lockPresent:boolean, checked:number, rows:Array<{name:string, spec:string, kind:string, installed:string|null, locked:string|null, ok:boolean, why:string}>, problems:string[], fix:string}}
 */
export function checkDependencies(root = ROOT, { dev = false, platform = process.platform, arch = process.arch, load = true } = {}) {
  const pkg = readJson(join(root, 'package.json')) || {};
  const lock = readJson(join(root, 'package-lock.json'));
  const lockPresent = !!(lock && lock.packages);
  const installedVersion = (lockPath) => { const p = readJson(join(root, ...lockPath.split('/'), 'package.json')); return p ? p.version : null; };

  // the declared packages, one row each (what describe() names)
  const wanted = [
    ...Object.entries(pkg.dependencies || {}).map(([name, spec]) => ({ name, spec, kind: 'runtime' })),
    ...(dev ? Object.entries(pkg.devDependencies || {}).map(([name, spec]) => ({ name, spec, kind: 'dev' })) : []),
  ];
  const rows = wanted.map(({ name, spec, kind }) => {
    const installed = installedVersion('node_modules/' + name);
    const locked = lockPresent && lock.packages['node_modules/' + name] ? lock.packages['node_modules/' + name].version : null;
    let why = '';
    if (!installed) why = 'not installed';
    else if (locked && installed !== locked) why = 'installed ' + installed + ' but the lock says ' + locked;
    else if (!locked && lockPresent) why = 'not in package-lock.json';
    return { name, spec, kind, installed, locked, ok: !why, why };
  });

  // the locked closure: every entry this install contains
  const problems = [];
  let checked = 0;
  if (lockPresent) {
    const entries = Object.entries(lock.packages).filter(([k, v]) => k.startsWith('node_modules/') && !v.link && (dev || (!v.dev && !v.devOptional)));
    for (const [path, entry] of entries) {
      if ((entry.optional || entry.devOptional) && constrained(entry) && !platformMatches(entry, platform, arch)) continue; // another platform's build
      checked++;
      const installed = installedVersion(path);
      if (installed === null) { if (!entry.optional && !(dev && entry.devOptional)) problems.push(nameOf(path) + ' ' + entry.version + ' not installed' + (path.split('node_modules/').length > 2 ? ' (' + path + ')' : '')); }
      else if (installed !== entry.version) problems.push(nameOf(path) + ' installed ' + installed + ' but the lock says ' + entry.version);
    }
    // platform families
    for (const [path, entry] of entries) {
      const members = Object.keys(entry.optionalDependencies || {}).map((n) => [n, lock.packages['node_modules/' + n]]).filter(([, e]) => constrained(e));
      if (members.length < 3 || installedVersion(path) === null) continue;
      const mine = members.filter(([, e]) => platformMatches(e, platform, arch));
      if (mine.length === 0) problems.push(nameOf(path) + ' publishes no build for ' + platform + '-' + arch + ' (its platform packages: ' + members.map(([n]) => n.split('/').pop()).join(', ') + ')');
      else if (!mine.some(([n]) => installedVersion('node_modules/' + n) !== null)) problems.push(nameOf(path) + ': its ' + platform + '-' + arch + ' build ' + mine.map(([n]) => n).join(' / ') + ' is not installed');
    }
  }
  // loadability: only when everything above passed (a missing package is already named), and only on this platform
  let loaded = null;
  if (load && lockPresent && rows.every((r) => r.ok) && problems.length === 0 && platform === process.platform && arch === process.arch) {
    const names = rows.map((r) => r.name);
    const probe = "const names=JSON.parse(process.argv[1]);const bad=[];for(const n of names){try{await import(n)}catch(e){bad.push(n+' does not load: '+(e.code||'')+' '+String(e.message||e).split(/\\r?\\n/)[0].slice(0,160))}}process.stdout.write(JSON.stringify(bad));process.exit(0);";
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe, JSON.stringify(names)], { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
    let bad = null; try { bad = JSON.parse((r.stdout || '').trim()); } catch { bad = null; }
    if (!Array.isArray(bad)) problems.push('the load check could not run (exit ' + r.status + '): ' + String(r.stderr || r.error || '').split(/\r?\n/)[0].slice(0, 160));
    else { problems.push(...bad); loaded = names.filter((n) => !bad.some((b) => b.startsWith(n + ' '))); }
  }
  const ok = lockPresent && rows.every((r) => r.ok) && problems.length === 0;
  const fix = !lockPresent ? 'package-lock.json is missing in ' + root + ' - this checkout is not a Factory candidate (the committed lock is what npm ci installs)'
    : problems.some((p) => /publishes no build/.test(p)) ? 'this platform cannot run that package - use an x64 Node on this machine, or another machine'
    : 'run `npm ci` in ' + root;
  return { ok, root, lockPresent, checked, loaded, rows, problems, fix };
}

/** One line for logs and health: what is wrong, and the command that fixes it. */
export function describe(report) {
  if (report.ok) return 'runtime dependencies installed at their locked versions (' + report.rows.map((r) => r.name + ' ' + r.installed).join(', ') + '; ' + report.checked + ' locked packages checked' + (report.loaded ? '; ' + report.loaded.join(', ') + ' load' : '') + ')';
  const bad = [...report.rows.filter((r) => !r.ok).map((r) => r.name + ': ' + r.why), ...report.problems.filter((p) => !report.rows.some((r) => !r.ok && p.startsWith(r.name + ' ')))];
  const shown = bad.slice(0, 6).join('; ') + (bad.length > 6 ? '; and ' + (bad.length - 6) + ' more' : '');
  return 'DEPENDENCIES NOT READY - ' + (report.lockPresent ? '' : 'no package-lock.json; ') + shown + ' - ' + report.fix;
}

// Is this file the entry script? Both sides through realpath: node runs the main module from its real path, so a checkout
// reached through a junction or symlink has argv[1] != import.meta.url - an exact comparison there skipped the CLI, printed
// nothing and exited 0, which the installer's preflight read as "ok" (caught 2026-09-24 testing a checkout path with '#').
// And never under an eval flag: for `node -e "<code>" <path>` argv[1] is the first USER argument, so a script that passed this
// file's path would have run its CLI on import (verification 2026-09-24).
export const isEntry = (metaUrl) => {
  if (process.execArgv.some((a) => /^(-e|--eval|-p|--print)(=|$)/.test(a))) return false;
  try {
    const a = realpathSync(process.argv[1]), b = realpathSync(fileURLToPath(metaUrl));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
};

// `node scripts/factory-runner/deps.mjs [--dev] [--json]` - exit 0 ready, 1 not (used by the installer and the bootstrap)
if (process.argv[1] && isEntry(import.meta.url)) {
  const r = checkDependencies(ROOT, { dev: process.argv.includes('--dev') });
  console.log(describe(r));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
