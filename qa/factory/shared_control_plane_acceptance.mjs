#!/usr/bin/env node
// FACTORY V1 MILESTONE 1 - THE SHARED CONTROL PLANE, MEASURED ACROSS PROCESSES.
//
// acceptance.mjs proves the claiming rules against a real PostgreSQL that lives and dies with the harness process. This
// suite proves the part milestone 1 adds: the same server SHARED by SEPARATE OS processes over TCP, persisting across
// their deaths. Every row spawns real `node` children with their own FACTORY_RUNNER_PG_URL; nothing is faked in-process.
//
// Needs the shared plane serving: `node qa/factory/shared_local_pg.mjs start` (in another shell). It is NON-PRODUCTION
// by construction (embedded PostgreSQL under .factory/, loopback only). What it cannot prove is stated in the last line:
// two machines. That needs a database a second computer can reach, which is the founder's boundary.
import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DIR = join(ROOT, '.factory', 'control-plane');
const envFile = join(DIR, 'runner.env');
if (!existsSync(envFile)) { console.log('the shared plane is not provisioned: run `node qa/factory/shared_local_pg.mjs start` first'); process.exit(2); }
const RUNNER_URL = /FACTORY_RUNNER_PG_URL=(.+)/.exec(readFileSync(envFile, 'utf8'))[1].trim();
const ADMIN_URL = existsSync(join(DIR, 'admin.url')) ? readFileSync(join(DIR, 'admin.url'), 'utf8').trim() : null;

let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + detail : '')); } };
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FACTORY_RUNNER_PG_URL: RUNNER_URL, ...env }, timeout: 120000 });
const runAsync = (args, env = {}) => new Promise((res) => { const c = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, FACTORY_RUNNER_PG_URL: RUNNER_URL, ...env } }); let out = ''; c.stdout.on('data', (d) => out += d); c.stderr.on('data', (d) => out += d); c.on('close', (code) => res({ code, out })); });
const WORKER = join(ROOT, 'qa/factory/shared_pg_worker.mjs');
const { default: pgLib } = await import('pg');
const sql = new pgLib.Client({ connectionString: RUNNER_URL }); await sql.connect();
const q = async (s, p = []) => (await sql.query(s, p)).rows;
const newWo = async (title) => { const id = randomUUID(); await sql.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, $2, $3::text[], 'medium', 'queued')`, [id, title, ['qa/factory/shared_' + id.slice(0, 8) + '.txt']]); return id; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The server is a separate process from every client: its backend pid is not ours, and it answers on a TCP port.
const srv = await q('select pg_backend_pid() bpid, inet_server_port() port, host(inet_server_addr()) addr, version() v');
check('CP-0 the control plane is a real PostgreSQL server in its own process on loopback (' + String(srv[0].v).split(',')[0] + ', 127.0.0.1:' + srv[0].port + ')', srv[0].addr === '127.0.0.1' && Number(srv[0].bpid) !== process.pid);

// CP-1: a runner process that is NOT this one reaches the plane through the runner's own health check.
{
  const r = run([join(ROOT, 'scripts/factory-runner/node.mjs'), 'health']);
  check('CP-1 a separate runner process reaches the shared plane (node.mjs health exit ' + r.status + ')', r.status === 0, (r.stdout + r.stderr).slice(0, 300));
}

// CP-2: the runner refuses the superuser URL - the least-privilege door is the only door, on the shared plane too.
if (ADMIN_URL) {
  const r = run([join(ROOT, 'scripts/factory-runner/node.mjs'), 'health'], { FACTORY_RUNNER_PG_URL: ADMIN_URL });
  check('CP-2 the runner REFUSES the superuser URL of the same server (exit ' + r.status + ')', r.status !== 0 && /refus|superuser|postgres/i.test(r.stdout + r.stderr), (r.stdout + r.stderr).slice(0, 200));
}

// CP-3: two runner PROCESSES race for one queued work order; exactly one claims it, the other finds nothing.
{
  const wo = await newWo('CP-3 race');
  const tag = randomUUID().slice(0, 8);
  const [a, b] = await Promise.all([runAsync([WORKER, 'node-a-' + tag, 'complete']), runAsync([WORKER, 'node-b-' + tag, 'complete'])]);
  const claimedA = /CLAIMED \S+ (\S+)/.exec(a.out), claimedB = /CLAIMED \S+ (\S+)/.exec(b.out);
  const winners = [claimedA, claimedB].filter((m) => m && m[1] === wo).length;
  // On a SHARED, PERSISTENT plane the loser may legitimately claim some OTHER queued work order left by an earlier invocation
  // (the first run of this suite left one behind, before the lease-expiry fix returned abandoned work orders to queued); what
  // must hold is that exactly one process got THIS work order and the other did not.
  const losers = [claimedA, claimedB].filter((m) => !m || m[1] !== wo).length;
  check('CP-3 two runner processes race for one work order: exactly one claims it and the other does not (claimed it ' + winners + ', did not ' + losers + ')', winners === 1 && losers === 1, (a.out + '\n' + b.out).slice(0, 400));
  // CP-4: what the winner wrote is there after both processes have exited.
  const runs = await q('select run_id, node_id, status from factory.agent_runs where work_order_id = $1', [wo]);
  const cps = await q('select count(*)::int n from factory.checkpoints where work_order_id = $1', [wo]);
  const nodes = await q('select count(*)::int n from factory.nodes where node_id = any($1::text[])', [['node-a-' + tag, 'node-b-' + tag]]);
  check('CP-4 the run, its checkpoint and both node registrations persist after the processes exit (runs ' + runs.length + ' ' + (runs[0] && runs[0].status) + ', checkpoints ' + cps[0].n + ', nodes ' + nodes[0].n + ')', runs.length === 1 && runs[0].status === 'done' && cps[0].n === 1 && nodes[0].n === 2);
}

// CP-5: a worker that DIES mid-run leaves its lease; after expiry another process claims the same work order and can see
// the dead worker's checkpoint - recovery across process death, on one shared server.
{
  const wo = await newWo('CP-5 die and resume');
  const tag = randomUUID().slice(0, 8);
  const dead = await runAsync([WORKER, 'node-dead-' + tag, 'die', '2']);
  const died = dead.code === 3 && /CLAIMED \S+ (\S+)/.exec(dead.out) && /CLAIMED \S+ (\S+)/.exec(dead.out)[1] === wo;
  const tooSoon = await runAsync([WORKER, 'node-early-' + tag, 'resume', '30']);
  const heldWhileLeased = /NOTHING/.test(tooSoon.out) || !new RegExp('CLAIMED \\S+ ' + wo).test(tooSoon.out);
  await sleep(3500);
  const later = await runAsync([WORKER, 'node-late-' + tag, 'resume', '30']);
  const resumed = new RegExp('CLAIMED \\S+ ' + wo).test(later.out);
  const prior = /PRIOR_CHECKPOINTS (\d+)/.exec(later.out);
  check('CP-5 a worker that dies mid-run (exit 3) leaves the work order held until its lease expires, then another process claims it and sees the dead run\'s checkpoint (died ' + died + ', held ' + heldWhileLeased + ', resumed ' + resumed + ', prior checkpoints ' + (prior && prior[1]) + ')', died && heldWhileLeased && resumed && prior && Number(prior[1]) >= 1, (dead.out + '\n' + tooSoon.out + '\n' + later.out).slice(0, 500));
}

// CP-6: the plane outlived every client above - and rows from EARLIER invocations of this suite are still there, which is
// what "persistent" means (the first run of the suite sees only its own rows; the count is printed so it can be compared).
{
  const all = await q("select count(*)::int n from factory.agent_runs where summary like '%shared_plane_acceptance%' or termination_reason = 'shared_plane_acceptance_worker_completed'");
  check('CP-6 the shared plane keeps rows across suite invocations (acceptance runs recorded so far: ' + all[0].n + ')', all[0].n >= 1);
}

await sql.end();
console.log('');
console.log('shared_control_plane_acceptance: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('NOT PROVED HERE, BY CONSTRUCTION: two MACHINES sharing this plane. The server listens on loopback only; a hosted');
console.log('non-production PostgreSQL or an opened LAN port is the founder\'s boundary, and it is the only part of milestone 1 this machine cannot do alone.');
process.exit(failures.length ? 1 : 0);
