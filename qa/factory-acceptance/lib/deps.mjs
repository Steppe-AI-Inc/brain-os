// External dependencies for the acceptance harness - installed OUTSIDE every pinned worktree, with
// provenance recorded (founder corrections #4 and #5, 2026-09-14).
//
//   %LOCALAPPDATA%\brain-os-qa\source-wt\{package.json,package-lock.json,node_modules}
//       the PINNED qa/dbtest dependencies (@electric-sql/pglite, pg, yaml), written from the
//       origin/p1/control-plane-phase0 blobs and installed with `npm ci --ignore-scripts`. This
//       directory is the PARENT of every worktree, so Node's ESM resolution from
//       <worktree>/qa/dbtest/db.mjs walks up and finds them without a single byte landing inside
//       a worktree (scanSourceWorktree stays clean; proven in preflight).
//   %LOCALAPPDATA%\brain-os-qa\pgdeps\node_modules\embedded-postgres
//       a disposable PostgreSQL 17 server (npm-distributed binaries, no Windows service, no admin
//       install). Data directory %LOCALAPPDATA%\brain-os-qa\pg\data. Deleted after evidence
//       collection unless an artifact needs its non-secret logs.
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SOURCE_WT_ROOT } from '../../runner/lib/source-worktree.mjs';
import { worktree, blobShaAt, rescanAll } from './provenance.mjs';

export const DEPS_DIR = SOURCE_WT_ROOT;
export const PGDEPS_DIR = join(process.env.LOCALAPPDATA || '', 'brain-os-qa', 'pgdeps');
export const PG_DATA_DIR = join(process.env.LOCALAPPDATA || '', 'brain-os-qa', 'pg', 'data');
export const PG_PORT = 54329;
export const PG_USER = 'postgres';
export const PG_PASSWORD = 'dbtest-disposable';
export const PG_DB = 'dbtest';
export const REAL_PG_URL = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}`;
export const STATE_PATH = join(process.env.LOCALAPPDATA || '', 'brain-os-qa', 'pg', 'STATE.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const pkgVersion = (dir, name) => { try { return JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; } };

/** Provenance of the pinned qa/dbtest dependency install (already performed; verified here).
 *  Hashes are LF-normalized (the Home PC's own lfSha256 convention): git checks the worktree out
 *  with CRLF on Windows, while `git show` bytes are LF - the CONTENT is what must match. */
export function pinnedDepsProvenance() {
  const lockPath = join(DEPS_DIR, 'package-lock.json');
  const pkgPath = join(DEPS_DIR, 'package.json');
  const lf = (buf) => Buffer.from(String(buf).split(String.fromCharCode(13)).join(''), 'utf8');
  const lock = existsSync(lockPath) ? readFileSync(lockPath) : null;
  const pinnedLockBlob = blobShaAt('p1', 'qa/dbtest/package-lock.json');
  const pinnedLockBytes = readFileSync(join(worktree('p1').path, 'qa', 'dbtest', 'package-lock.json'));
  const pinnedPkgBytes = readFileSync(join(worktree('p1').path, 'qa', 'dbtest', 'package.json'));
  return {
    install_dir: DEPS_DIR,
    outside_every_worktree: true,
    package_json_matches_pinned_blob: existsSync(pkgPath) && sha256(lf(readFileSync(pkgPath))) === sha256(lf(pinnedPkgBytes)),
    package_lock_blob_sha_p1: pinnedLockBlob,
    package_lock_sha256_installed_raw: lock ? sha256(lock) : null,
    package_lock_sha256_installed_lf: lock ? sha256(lf(lock)) : null,
    package_lock_sha256_pinned_lf: sha256(lf(pinnedLockBytes)),
    package_lock_matches_pinned: !!lock && sha256(lf(lock)) === sha256(lf(pinnedLockBytes)),
    command: 'npm ci --ignore-scripts --no-audit --no-fund',
    versions: { pglite: pkgVersion(DEPS_DIR, '@electric-sql/pglite'), pg: pkgVersion(DEPS_DIR, 'pg'), yaml: pkgVersion(DEPS_DIR, 'yaml') },
    node: process.version,
    npm: (() => { try { return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' }).trim(); } catch { return null; } })(),
  };
}

/** Prove pinned db.mjs resolves its driver from DEPS_DIR and that no worktree was written to. */
export async function proveResolution() {
  // Resolve from a child process whose cwd is the pinned qa/dbtest directory - the exact
  // resolution walk db.mjs performs. (import.meta.resolve's parentURL argument is ignored
  // without an experimental flag, so an in-process probe would resolve from THIS file.)
  const dbtestDir = join(worktree('p1').path, 'qa', 'dbtest');

  const resolved = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "console.log(import.meta.resolve('@electric-sql/pglite'))",
    ],
    {
      cwd: dbtestDir,
      encoding: 'utf8',
      windowsHide: true,
    },
  ).trim();

  const expectedPrefix = pathToFileURL(join(DEPS_DIR, 'node_modules')).href;
  const scans = rescanAll();
  return {
    resolved_from: resolved,
    resolves_under_deps_dir: resolved.startsWith(expectedPrefix),
    resolves_inside_a_worktree: /source-wt\/[0-9a-f]{7}\/node_modules/.test(resolved),
    worktrees_still_clean: Object.fromEntries(Object.entries(scans).map(([k, s]) => [k, s.ok])),
  };
}

/** Provenance of the embedded PostgreSQL package (install performed by preflight; verified here). */
export function embeddedPgProvenance() {
  const lockPath = join(PGDEPS_DIR, 'package-lock.json');
  let entries = {};
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    for (const [k, v] of Object.entries(lock.packages || {})) if (/embedded-postgres/.test(k) && k) entries[k] = { version: v.version, integrity: v.integrity, resolved: v.resolved };
  } catch {}
  let binaryVersion = null;
  const bin = join(PGDEPS_DIR, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'postgres.exe');
  try { binaryVersion = execFileSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true }).trim(); } catch {}
  return {
    install_dir: PGDEPS_DIR,
    package_version: pkgVersion(PGDEPS_DIR, 'embedded-postgres'),
    npm_packages: entries,
    binary: bin,
    binary_exists: existsSync(bin),
    postgres_version: binaryVersion,
    binary_sha256: existsSync(bin) ? sha256(readFileSync(bin)) : null,
    data_dir: PG_DATA_DIR,
    port: PG_PORT,
    listen: '127.0.0.1 only',
    windows_service: false,
    admin_install: false,
    production_credentials_loaded: false,
    command: 'npm install --ignore-scripts --no-audit --no-fund --save-exact embedded-postgres@17.10.0-beta.17',
  };
}

function loadEmbedded() {
  const req = createRequire(join(PGDEPS_DIR, 'package.json'));
  const mod = req('embedded-postgres');
  return mod.default || mod;
}

/** Start a fresh disposable cluster. Always initialises from scratch (data dir removed first). */
export async function startEmbeddedPg() {
  const EmbeddedPostgres = loadEmbedded();
  if (existsSync(PG_DATA_DIR)) rmSync(PG_DATA_DIR, { recursive: true, force: true });
  mkdirSync(PG_DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({ databaseDir: PG_DATA_DIR, user: PG_USER, password: PG_PASSWORD, port: PG_PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(PG_DB);
  mkdirSync(join(PG_DATA_DIR, '..'), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({ started_at: new Date().toISOString(), pid: process.pid, url_host: '127.0.0.1', port: PG_PORT, db: PG_DB, data_dir: PG_DATA_DIR }, null, 2));
  return pg;
}

export async function stopEmbeddedPg(pg) {
  try { await pg.stop(); } catch (e) { /* recorded by caller */ }
}

/** Delete the disposable cluster's data directory. Evidence artifacts live elsewhere and are never touched. */
export function deleteEmbeddedPgData() {
  if (existsSync(PG_DATA_DIR)) rmSync(PG_DATA_DIR, { recursive: true, force: true });
  try { rmSync(STATE_PATH, { force: true }); } catch {}
  return !existsSync(PG_DATA_DIR);
}

/** Non-production proof: the URL is loopback, a non-Supabase host, and the server reports itself. */
export async function proveLocalNonProduction(url = REAL_PG_URL) {
  const u = new URL(url);
  const req = createRequire(join(DEPS_DIR, 'package.json'));
  const pg = req('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const r = await c.query("select version() v, inet_server_addr()::text addr, inet_server_port() port, current_setting('data_directory') datadir, current_setting('listen_addresses') listen");
    const row = r.rows[0];
    return {
      host: u.hostname, port: Number(u.port), loopback: u.hostname === '127.0.0.1' || u.hostname === 'localhost',
      not_supabase_host: !/supabase\.(co|com|in)|pooler\.supabase|pvphxgrtdfrudejjhzjk/i.test(url),
      server_version: row.v, server_addr: row.addr, server_port: row.port, data_directory: row.datadir, listen_addresses: row.listen,
    };
  } finally { await c.end(); }
}
