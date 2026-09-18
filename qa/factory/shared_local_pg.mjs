#!/usr/bin/env node
// A SHARED, PERSISTENT, NON-PRODUCTION FACTORY CONTROL PLANE ON THIS MACHINE.
//
// Factory V1 milestone 1 (founder ruling 2026-09-17, "ADVANCE FACTORY V1 / FINITE EDGE TERMINATION", priority 1) asks
// for a shared dedicated NON-PRODUCTION Factory PostgreSQL control plane. local_pg.mjs already proves the claiming,
// leasing and surface-lock behaviour against a REAL PostgreSQL - but a disposable one, bound to the harness process,
// so nothing outside that process could ever share it. This file keeps the same server and makes it SHARED:
//
//   * PERSISTENT: a fixed data directory under .factory/control-plane/ (git-ignored with the rest of .factory/), a
//     fixed loopback port, initialised once; rows written by one runner process are there for the next.
//   * SHARED: any number of runner processes on this machine connect over TCP to 127.0.0.1:<port> with the
//     least-privilege FACTORY_RUNNER_PG_URL this file provisions - exactly what a hosted control plane would hand
//     them, and exactly the URL shape db.mjs accepts (loopback is exempt from its sslmode rule).
//   * NON-PRODUCTION BY CONSTRUCTION: an embedded PostgreSQL 18 under the repository's own directory, a superuser
//     that exists only here, no route to any Brain OS database. provision-control-plane.mjs runs its own
//     production-shaped refusals against it before creating anything.
//
// WHAT THIS DOES NOT CLAIM. Two processes on one machine sharing one server prove multi-PROCESS claiming, lease
// expiry and checkpoint resume across process death. They do not prove multi-MACHINE independence; that needs a
// database reachable from a second computer (a hosted non-production PostgreSQL, or this port opened to the LAN),
// which is the founder's call and is the only part of milestone 1 this machine cannot do alone.
//
//   node qa/factory/shared_local_pg.mjs start      initialise if needed, provision, serve until Ctrl-C or `stop`
//   node qa/factory/shared_local_pg.mjs status     is it serving; what does the control plane hold
//   node qa/factory/shared_local_pg.mjs stop       ask the serving process to shut the server down (data kept)
//   node qa/factory/shared_local_pg.mjs url        print the runner URL's location (never the URL itself)
//
// The runner URL is written to .factory/control-plane/runner.env as FACTORY_RUNNER_PG_URL=... for the runner
// processes to source; the superuser URL is written to admin.url beside it for provisioning only. Both files are
// machine-local and git-ignored; neither is a production credential.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DIR = join(ROOT, '.factory', 'control-plane');
const DATA = join(DIR, 'pg-data');
const PORT_FILE = join(DIR, 'port');
const ADMIN_URL_FILE = join(DIR, 'admin.url');
const RUNNER_ENV_FILE = join(DIR, 'runner.env');
const PID_FILE = join(DIR, 'server.pid');
const STOP_FILE = join(DIR, 'stop.requested');
const DEFAULT_PORT = 54329;

const readPort = () => (existsSync(PORT_FILE) ? Number(readFileSync(PORT_FILE, 'utf8').trim()) : DEFAULT_PORT);
const readAdminUrl = () => (existsSync(ADMIN_URL_FILE) ? readFileSync(ADMIN_URL_FILE, 'utf8').trim() : null);
export const readRunnerUrl = () => {
  if (!existsSync(RUNNER_ENV_FILE)) return null;
  const m = /FACTORY_RUNNER_PG_URL=(.+)/.exec(readFileSync(RUNNER_ENV_FILE, 'utf8'));
  return m ? m[1].trim() : null;
};

async function serverReachable(url) {
  try {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    await c.connect(); const r = await c.query('select version() v, inet_server_port() p'); await c.end();
    return { ok: true, version: String(r.rows[0].v).split(',')[0], port: r.rows[0].p };
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 120) }; }
}

async function provision(adminUrl) {
  // THE FOUNDER'S OWN COMMAND, with its refusals, against this local server. It applies 001 and creates / rotates the
  // least-privilege role; 002 (the director state machine) is applied here afterwards because provisioning only
  // wires 001 today. Both files are written with `if not exists`, so this is safe to run on every start.
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/factory-runner/provision-control-plane.mjs'), '--admin', adminUrl], { encoding: 'utf8', cwd: ROOT });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const m = /FACTORY_RUNNER_PG_URL=(\S+)/.exec(out);
  if (r.status !== 0 || !m) { console.log(out); throw new Error('provisioning did not print a runner URL (exit ' + r.status + ')'); }
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(readFileSync(join(ROOT, 'supabase/control-plane/002_director_state_machine.sql'), 'utf8'));
  await admin.query('grant select, insert, update, delete on all tables in schema factory to factory_runner');
  await admin.end();
  writeFileSync(RUNNER_ENV_FILE, 'FACTORY_RUNNER_PG_URL=' + m[1] + '\n');
  return out.split('\n').filter((l) => /checks passed|schema applied|role factory_runner|privileges granted|REFUSING/.test(l));
}

// ORPHANED POSTGRES WORKERS BLOCK THE NEXT START. On Windows the embedded wrapper's stop() can return while the
// postmaster's io_worker children are still alive; they hold the shared memory block, and the next postmaster refuses to
// start over it ("pre-existing shared memory block is still in use", found by shared_control_plane_acceptance CP-7).
// A postgres.exe whose parent process no longer exists is such an orphan and is terminated; one with a live parent is
// somebody's running server and is left alone.
function postgresProcesses() {
  const r = spawnSync('wmic', ['process', 'where', "name='postgres.exe'", 'get', 'ProcessId,ParentProcessId'], { encoding: 'utf8' });
  const out = [];
  for (const line of String(r.stdout || '').split(/\r?\n/)) { const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line); if (m) out.push({ parent: Number(m[1]), pid: Number(m[2]) }); }
  return out;
}
function processAlive(pid) { return spawnSync('tasklist', ['/FI', 'PID eq ' + pid], { encoding: 'utf8' }).stdout.includes(String(pid)); }
function killOrphanPostgres() {
  let killed = 0;
  for (const p of postgresProcesses()) if (!processAlive(p.parent)) { spawnSync('taskkill', ['/F', '/PID', String(p.pid)], { encoding: 'utf8' }); killed++; }
  return killed;
}
async function waitForPostgresToExit(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (postgresProcesses().length === 0) return true; await new Promise((r) => setTimeout(r, 500)); }
  return postgresProcesses().length === 0;
}

async function start() {
  mkdirSync(DIR, { recursive: true });
  const orphans = killOrphanPostgres();
  if (orphans) console.log('terminated ' + orphans + ' orphaned postgres worker process(es) left by an earlier server');
  const port = readPort();
  writeFileSync(PORT_FILE, String(port) + '\n');
  const already = existsSync(RUNNER_ENV_FILE) ? await serverReachable(readRunnerUrl()) : { ok: false };
  if (already.ok) { console.log('already serving on 127.0.0.1:' + port + ' (' + already.version + '); nothing to do'); return; }
  let superPassword;
  const existing = readAdminUrl();
  if (existing) superPassword = decodeURIComponent(new URL(existing).password);
  else superPassword = 'super_' + randomBytes(12).toString('base64url');
  // The server's own log is kept beside the data (server.log) so that a start that fails - the embedded wrapper rejects
  // with `undefined` when postgres exits before it is ready - can be read rather than guessed at.
  const logFile = join(DIR, 'server.log');
  const logLine = (m) => { try { appendFileSync(logFile, String(m)); } catch { /* best effort */ } };
  const pg = new EmbeddedPostgres({ databaseDir: DATA, user: 'postgres', password: superPassword, port, persistent: true, onLog: logLine, onError: (m) => { logLine(m); process.stderr.write(String(m)); } });
  const fresh = !existsSync(join(DATA, 'PG_VERSION'));
  if (fresh) { console.log('initialising a new cluster under ' + DATA.replace(ROOT, '.')); await pg.initialise(); }
  // A STALE LOCK FROM A KILLED SERVER. postgres refuses to start over a postmaster.pid whose process is gone only after
  // its own checks; on Windows a server killed with its parent can leave the file and the port half-closed. If no
  // process holds the recorded pid, the lock is stale and is removed before starting.
  const lock = join(DATA, 'postmaster.pid');
  if (existsSync(lock)) {
    const pid = Number(String(readFileSync(lock, 'utf8')).split(/\r?\n/)[0]);
    const alive = pid > 0 && spawnSync('tasklist', ['/FI', 'PID eq ' + pid], { encoding: 'utf8' }).stdout.includes(String(pid));
    if (!alive) { console.log('removing a stale postmaster.pid (pid ' + pid + ' is not running)'); rmSync(lock); }
    else { console.log('postmaster.pid names a live process ' + pid + '; refusing to start a second server over it'); process.exit(1); }
  }
  try { await pg.start(); }
  catch (e) {
    console.log('the server did not start: ' + (e && e.message ? e.message : String(e)));
    if (existsSync(logFile)) console.log(readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-8).join('\n'));
    process.exit(1);
  }
  if (existsSync(STOP_FILE)) rmSync(STOP_FILE);
  if (fresh) await pg.createDatabase('factory_control_plane');
  else { try { await pg.createDatabase('factory_control_plane'); } catch { /* exists */ } }
  const adminUrl = 'postgresql://postgres:' + encodeURIComponent(superPassword) + '@127.0.0.1:' + port + '/factory_control_plane';
  writeFileSync(ADMIN_URL_FILE, adminUrl + '\n');
  if (fresh || !existsSync(RUNNER_ENV_FILE)) {
    const lines = await provision(adminUrl);
    for (const l of lines) console.log('  ' + l.trim());
  } else {
    // A RESTART KEEPS THE CREDENTIAL (found by shared_control_plane_acceptance CP-7). provision-control-plane.mjs rotates
    // the runner role's password every time it runs - right for the founder's one-shot bootstrap, wrong for a plane that
    // is stopped and started under running clients: every process holding the URL from runner.env was locked out of the
    // restarted server. On reopen only the idempotent schema files are re-applied and the grants re-asserted.
    const { default: pg } = await import('pg');
    const admin = new pg.Client({ connectionString: adminUrl }); await admin.connect();
    for (const f of ['001_factory_control_plane.sql', '002_director_state_machine.sql']) await admin.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
    await admin.query('grant usage on schema factory to factory_runner');
    await admin.query('grant select, insert, update, delete on all tables in schema factory to factory_runner');
    await admin.end();
    console.log('  schema re-applied (idempotent); the runner credential in runner.env is unchanged');
  }
  writeFileSync(PID_FILE, String(process.pid) + '\n');
  const reach = await serverReachable(readRunnerUrl());
  console.log((fresh ? 'created' : 'reopened') + ' the shared control plane: 127.0.0.1:' + port + ' (' + reach.version + '), runner URL in ' + RUNNER_ENV_FILE.replace(ROOT, '.'));
  console.log('serving; `node qa/factory/shared_local_pg.mjs stop` or Ctrl-C stops the server and keeps the data');
  const shutdown = async () => {
    try { await pg.stop(); } catch { /* down */ }
    // stop() may return before the postmaster's children are gone; the next start needs them gone.
    const clean = await waitForPostgresToExit(10000);
    if (!clean) { const n = killOrphanPostgres(); console.log('server stopped; terminated ' + n + ' lingering worker process(es)'); } else console.log('server stopped; data kept');
    try { rmSync(PID_FILE); } catch { /* gone */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  setInterval(() => { if (existsSync(STOP_FILE)) { try { rmSync(STOP_FILE); } catch { /* gone */ } shutdown(); } }, 2000);
}

async function status() {
  const url = readRunnerUrl();
  if (!url) { console.log('not provisioned: no ' + RUNNER_ENV_FILE.replace(ROOT, '.') + ' - run `start` first'); process.exit(1); }
  const reach = await serverReachable(url);
  if (!reach.ok) { console.log('NOT SERVING on the recorded port (' + reach.error + ') - run `start`'); process.exit(1); }
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url }); await c.connect();
  const q = async (sql) => (await c.query(sql)).rows[0].n;
  console.log('serving 127.0.0.1:' + reach.port + ' (' + reach.version + ') as factory_runner');
  console.log('  nodes ' + await q('select count(*)::int n from factory.nodes') + ', work orders ' + await q('select count(*)::int n from factory.work_orders') + ', agent runs ' + await q('select count(*)::int n from factory.agent_runs') + ', checkpoints ' + await q('select count(*)::int n from factory.checkpoints') + ', surface locks ' + await q('select count(*)::int n from factory.surface_locks'));
  await c.end();
}

const cmd = process.argv[2] || 'status';
if (cmd === 'start') await start();
else if (cmd === 'status') await status();
else if (cmd === 'stop') { mkdirSync(DIR, { recursive: true }); writeFileSync(STOP_FILE, String(Date.now())); console.log('stop requested; the serving process shuts the server down within 2 s and keeps the data'); }
else if (cmd === 'url') { console.log(existsSync(RUNNER_ENV_FILE) ? 'source ' + RUNNER_ENV_FILE.replace(ROOT, '.') + ' (FACTORY_RUNNER_PG_URL is written there and printed nowhere)' : 'not provisioned'); }
else { console.log('usage: node qa/factory/shared_local_pg.mjs [start | status | stop | url]'); process.exit(2); }
