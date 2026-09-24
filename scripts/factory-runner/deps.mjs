// ARE THIS CHECKOUT'S RUNTIME DEPENDENCIES INSTALLED, AND ARE THEY THE LOCKED ONES?
//
// The 2026-09-24 packaging defect: the branch imported `pg` from `db.mjs` while the root package.json declared nothing and no
// package-lock.json existed, so a fresh clone could not `npm ci`, and a supervised node on it crash-looped on
// ERR_MODULE_NOT_FOUND with nothing naming the cause. Every Factory entry point now asks this module first and refuses with
// the fix spelled out instead of starting a worker that cannot run.
//
// The list is DERIVED from package.json `dependencies` (the runtime set; devDependencies are the acceptance harnesses), and
// each is checked against the lock: installed, and at the locked version. Pure filesystem reads; no network, no import of the
// packages themselves.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/**
 * @param {string} [root] the checkout to judge (default: the one this file lives in)
 * @param {{dev?: boolean}} [opts] dev: also require devDependencies (what the acceptance harnesses import)
 * @returns {{ok:boolean, root:string, lockPresent:boolean, rows:Array<{name:string, spec:string, kind:string, installed:string|null, locked:string|null, ok:boolean, why:string}>, fix:string}}
 */
export function checkDependencies(root = ROOT, { dev = false } = {}) {
  const pkg = readJson(join(root, 'package.json')) || {};
  const lock = readJson(join(root, 'package-lock.json'));
  const wanted = [
    ...Object.entries(pkg.dependencies || {}).map(([name, spec]) => ({ name, spec, kind: 'runtime' })),
    ...(dev ? Object.entries(pkg.devDependencies || {}).map(([name, spec]) => ({ name, spec, kind: 'dev' })) : []),
  ];
  const rows = wanted.map(({ name, spec, kind }) => {
    const installedPkg = readJson(join(root, 'node_modules', ...name.split('/'), 'package.json'));
    const installed = installedPkg ? installedPkg.version : null;
    const locked = lock && lock.packages && lock.packages['node_modules/' + name] ? lock.packages['node_modules/' + name].version : null;
    let why = '';
    if (!installed) why = 'not installed';
    else if (locked && installed !== locked) why = 'installed ' + installed + ' but the lock says ' + locked;
    else if (!locked && lock) why = 'not in package-lock.json';
    return { name, spec, kind, installed, locked, ok: !why, why };
  });
  const lockPresent = !!lock;
  const ok = lockPresent && rows.every((r) => r.ok);
  const fix = lockPresent ? 'run `npm ci` in ' + root : 'package-lock.json is missing in ' + root + ' - this checkout is not a Factory candidate (the committed lock is what npm ci installs)';
  return { ok, root, lockPresent, rows, fix };
}

/** One line for logs and health: what is wrong, and the command that fixes it. */
export function describe(report) {
  if (report.ok) return 'runtime dependencies installed at their locked versions (' + report.rows.map((r) => r.name + ' ' + r.installed).join(', ') + ')';
  const bad = report.rows.filter((r) => !r.ok).map((r) => r.name + ': ' + r.why);
  return 'DEPENDENCIES NOT READY - ' + (report.lockPresent ? '' : 'no package-lock.json; ') + bad.join('; ') + ' - ' + report.fix;
}

// `node scripts/factory-runner/deps.mjs [--dev] [--json]` - exit 0 ready, 1 not (used by the installer and the bootstrap)
if (process.argv[1] && /deps\.mjs$/.test(process.argv[1])) {
  const r = checkDependencies(ROOT, { dev: process.argv.includes('--dev') });
  console.log(describe(r));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
