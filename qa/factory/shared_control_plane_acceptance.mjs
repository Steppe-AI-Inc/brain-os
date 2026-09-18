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

// CP-7 (milestone 2): the PLANE ITSELF goes down between a worker's death and the takeover. The serving process is asked to
// stop (data kept), a new serving process is started detached, and a fresh runner process must claim the dead worker's
// work order and see its checkpoint - failover across a control-plane restart, not just across client death.
{
  const wo = await newWo('CP-7 die, restart the plane, resume');
  const tag = randomUUID().slice(0, 8);
  const dead = await runAsync([WORKER, 'node-dead7-' + tag, 'die', '2']);
  const died = dead.code === 3 && new RegExp('CLAIMED \\S+ ' + wo).test(dead.out);
  await sql.end();
  spawnSync(process.execPath, [join(ROOT, 'qa/factory/shared_local_pg.mjs'), 'stop'], { cwd: ROOT, encoding: 'utf8' });
  let down = false;
  for (let i = 0; i < 30 && !down; i++) { await sleep(1000); const c = new pgLib.Client({ connectionString: RUNNER_URL, connectionTimeoutMillis: 1500 }); try { await c.connect(); await c.end(); } catch { down = true; } }
  const server = spawn(process.execPath, [join(ROOT, 'qa/factory/shared_local_pg.mjs'), 'start'], { cwd: ROOT, detached: true, stdio: 'ignore' });
  server.unref();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await sleep(1000); const c = new pgLib.Client({ connectionString: RUNNER_URL, connectionTimeoutMillis: 1500 }); try { await c.connect(); await c.query('select 1 from factory.work_orders limit 1'); await c.end(); up = true; } catch { /* still starting */ } }
  // the URL is re-read from runner.env after the restart on purpose: if a restart ever rotated the credential, the row
  // must say so through `up` and `resumed`, and the later worker must be handed whatever the plane now serves.
  const urlAfter = /FACTORY_RUNNER_PG_URL=(.+)/.exec(readFileSync(envFile, 'utf8'))[1].trim();
  const sameCredential = urlAfter === RUNNER_URL;
  const sql2 = new pgLib.Client({ connectionString: urlAfter, connectionTimeoutMillis: 5000 });
  let reconnected = true; try { await sql2.connect(); } catch (e) { reconnected = false; }
  const later = up ? await runAsync([WORKER, 'node-late7-' + tag, 'resume', '30'], { FACTORY_RUNNER_PG_URL: urlAfter }) : { code: 1, out: 'plane never came back up' };
  const resumed = new RegExp('CLAIMED \\S+ ' + wo).test(later.out);
  const prior = /PRIOR_CHECKPOINTS (\d+)/.exec(later.out);
  const survived = reconnected ? (await sql2.query('select count(*)::int n from factory.checkpoints where work_order_id = $1', [wo])).rows[0].n : -1;
  check('CP-7 the plane is stopped and restarted between a worker\'s death and the takeover: the restarted plane still holds the dead run\'s checkpoint, serves the SAME runner credential, and a fresh process claims and resumes the work order (died ' + died + ', plane down ' + down + ', up ' + up + ', same credential ' + sameCredential + ', resumed ' + resumed + ', checkpoints on the restarted plane ' + survived + ')', died && down && up && sameCredential && resumed && prior && Number(prior[1]) >= 1 && survived >= 2, (dead.out + '\n' + later.out).slice(0, 400));
  if (reconnected) await sql2.end();
  if (!reconnected) { console.log('the plane did not come back after CP-7; CP-8 is not run'); console.log(''); console.log('shared_control_plane_acceptance: ' + pass + ' passed, ' + (failures.length + 1) + ' failed (CP-8 not run)'); process.exit(1); }
}

// CP-8 (milestone 3): THREE runner processes race for three work orders, two of which own the SAME surface. At most one of
// the conflicting pair may be held at a time; the third process must still get the non-conflicting one; and the second of the
// pair becomes claimable only once the first has completed and released its surface lock.
{
  const sql3 = new pgLib.Client({ connectionString: RUNNER_URL }); await sql3.connect();
  const surface = 'qa/factory/shared_' + randomUUID().slice(0, 8) + '.txt';
  const mk = async (title, surf) => { const id = randomUUID(); await sql3.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, $2, $3::text[], 'medium', 'queued')`, [id, title, [surf]]); return id; };
  const w1 = await mk('CP-8 conflicting one', surface), w2 = await mk('CP-8 conflicting two', surface), w3 = await mk('CP-8 free', surface + '.other');
  const tag = randomUUID().slice(0, 8);
  // each worker holds its claim for a while so the race is observable: die mode exits fast, so use complete with a longer lease and
  // observe the locks while the three run concurrently is racy; instead measure the CLAIM SET of the first wave, then the second wave.
  const wave1 = await Promise.all([runAsync([WORKER, 'node-x-' + tag, 'complete']), runAsync([WORKER, 'node-y-' + tag, 'complete']), runAsync([WORKER, 'node-z-' + tag, 'complete'])]);
  const claimedIn = (outs) => outs.map((o) => (/CLAIMED \S+ (\S+)/.exec(o.out) || [])[1]).filter(Boolean);
  const first = claimedIn(wave1);
  const bothConflicting = first.includes(w1) && first.includes(w2);
  const runs = (await sql3.query('select work_order_id, started_at, finished_at from factory.agent_runs where work_order_id = any($1::uuid[]) order by started_at', [[w1, w2, w3]])).rows;
  // if both conflicting work orders were claimed in the first wave, they must not have OVERLAPPED in time: the second started after the first completed
  let overlapped = false;
  const r1 = runs.find((r) => r.work_order_id === w1), r2 = runs.find((r) => r.work_order_id === w2);
  if (r1 && r2) { const a = r1, b = r2; const aS = +new Date(a.started_at), aE = +new Date(a.finished_at || 0), bS = +new Date(b.started_at), bE = +new Date(b.finished_at || 0); overlapped = aS < bE && bS < aE; }
  const freeClaimed = first.includes(w3) || runs.some((r) => r.work_order_id === w3);
  // second wave picks up whatever the surface lock deferred
  const wave2 = await Promise.all([runAsync([WORKER, 'node-x2-' + tag, 'complete']), runAsync([WORKER, 'node-y2-' + tag, 'complete'])]);
  const allDone = (await sql3.query("select count(*)::int n from factory.work_orders where work_order_id = any($1::uuid[]) and status = 'done'", [[w1, w2, w3]])).rows[0].n;
  check('CP-8 three runner processes, two work orders on one surface: the conflicting pair never ran overlapped (' + (overlapped ? 'OVERLAPPED' : 'serialized') + '), the free work order was claimed (' + freeClaimed + '), and every work order is done after a second wave (' + allDone + ' of 3)', !overlapped && freeClaimed && allDone === 3, JSON.stringify({ first, bothConflicting, wave2: claimedIn(wave2), runs: runs.map((r) => [r.work_order_id.slice(0, 8), r.started_at, r.finished_at]) }).slice(0, 600));
  await sql3.end();
}

// CP-9 (milestone 4): the ROLE is enforced across processes from the plane's own node record. A generic process cannot claim a
// verifier-required work order; a verifier process can; a release_broker-required one is refused by both.
{
  const sql4 = new pgLib.Client({ connectionString: RUNNER_URL }); await sql4.connect();
  const mkRole = async (title, role) => { const id = randomUUID(); await sql4.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role) values ($1, $2, $3::text[], 'high', 'queued', $4)`, [id, title, ['qa/factory/shared_' + id.slice(0, 8) + '.txt'], role]); return id; };
  const woV = await mkRole('CP-9 needs a verifier', 'verifier');
  const woR = await mkRole('CP-9 needs a release broker', 'release_broker');
  const tag = randomUUID().slice(0, 8);
  const g = await runAsync([WORKER, 'node-generic-' + tag, 'complete'], { WORKER_ROLE: 'generic' });
  const gGot = (/CLAIMED \S+ (\S+)/.exec(g.out) || [])[1];
  const v = await runAsync([WORKER, 'node-verifier-' + tag, 'complete'], { WORKER_ROLE: 'verifier' });
  const vGot = (/CLAIMED \S+ (\S+)/.exec(v.out) || [])[1];
  const stillQueued = (await sql4.query("select work_order_id from factory.work_orders where work_order_id = any($1::uuid[]) and status = 'queued'", [[woV, woR]])).rows.map((r) => r.work_order_id);
  check('CP-9 roles across processes: a generic process did not get the verifier work order (' + (gGot !== woV && gGot !== woR) + '), a verifier process got it (' + (vGot === woV) + '), and the release_broker work order is still queued for both (' + stillQueued.includes(woR) + ')', gGot !== woV && gGot !== woR && vGot === woV && stillQueued.includes(woR), (g.out + '\n' + v.out).slice(0, 400));
  // CP-10: a process that CLAIMS to have release_broker capability but is registered generic is still refused (the plane's record decides).
  const liar = await runAsync([WORKER, 'node-liar-' + tag, 'complete'], { WORKER_ROLE: 'generic', WORKER_CLAIM_CAPS: 'release_broker,git,node' });
  const liarGot = (/CLAIMED \S+ (\S+)/.exec(liar.out) || [])[1];
  check('CP-10 a process that asserts release_broker capability in its claim while registered generic does not get the release_broker work order (got ' + (liarGot ? liarGot.slice(0, 8) : 'nothing') + ')', liarGot !== woR, liar.out.slice(0, 300));
  await sql4.query("delete from factory.work_orders where work_order_id = $1 and status = 'queued'", [woR]);
  await sql4.end();
}

// CP-11 (milestone 4): a verification is INDEPENDENT or it is refused - across processes, through the runner's own path.
{
  const sql5 = new pgLib.Client({ connectionString: RUNNER_URL }); await sql5.connect();
  const tag = randomUUID().slice(0, 8);
  // the top-level client was closed for CP-7's restart; this block uses its own
  const woA = randomUUID();
  await sql5.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'CP-11 authored work', $2::text[], 'high', 'queued')`, [woA, ['qa/factory/shared_' + woA.slice(0, 8) + '.txt']]);
  const author = await runAsync([WORKER, 'node-author-' + tag, 'complete']);
  const authoredRun = (/CLAIMED (\S+) (\S+)/.exec(author.out) || [])[1];
  // a verifier's own work order, so the verifying process has a run of its own on the plane
  const mkV = async () => { const id = randomUUID(); await sql5.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role) values ($1, 'CP-11 verification round', $2::text[], 'high', 'queued', 'verifier')`, [id, ['qa/factory/shared_' + id.slice(0, 8) + '.txt']]); return id; };
  await mkV();
  const other = await runAsync([WORKER, 'node-verifier2-' + tag, 'verify', '30', authoredRun], { WORKER_ROLE: 'verifier' });
  const accepted = /VERIFIED /.test(other.out);
  await mkV();
  const self = await runAsync([WORKER, 'node-selfv-' + tag, 'selfverify', '30'], { WORKER_ROLE: 'verifier' });
  const selfRejected = /REJECTED verification_is_independent/.test(self.out);
  // the same NODE as the author, in a new process, must also be refused
  await mkV();
  const sameNode = await runAsync([WORKER, 'node-author-' + tag, 'verify', '30', authoredRun], { WORKER_ROLE: 'verifier' });
  const sameNodeRejected = /REJECTED verification_node_is_independent/.test(sameNode.out);
  const row = (await sql5.query('select authoring_node_id, verification_node_id, verification_run_id from factory.agent_runs where run_id = $1', [authoredRun])).rows[0];
  check('CP-11 independence across processes: a different process and node verifies the authored run (' + accepted + '), a run cannot verify itself (' + selfRejected + '), and a new process on the AUTHORING node cannot verify it either (' + sameNodeRejected + '); the plane records verifier ' + (row && row.verification_node_id) + ' for author ' + (row && row.authoring_node_id), accepted && selfRejected && sameNodeRejected && row && row.verification_node_id && row.verification_node_id !== row.authoring_node_id, (other.out + '\n' + self.out + '\n' + sameNode.out).slice(0, 500));
  await sql5.end();
}

// CP-12 (milestone 5, monitor garbage collection): monitors following files that stopped moving are found and reaped; a monitor
// following a file that IS moving is left alone. A fresh `tail -f` on a file this suite writes to is the live control.
{
  const { writeFileSync, appendFileSync } = await import('node:fs');
  const liveFile = join(DIR, 'cp12-live.log'); writeFileSync(liveFile, 'start\n');
  const tailBin = spawnSync('where', ['tail'], { encoding: 'utf8' }).stdout.split(/\r?\n/).find((l) => /tail\.exe$/i.test(l));
  const live = tailBin ? spawn(tailBin, ['-n', '0', '-f', liveFile], { stdio: 'ignore' }) : null;
  const gcArgs = [join(ROOT, 'scripts/factory-runner/monitor-gc.mjs')];
  const before = JSON.parse(spawnSync(process.execPath, [...gcArgs, 'list', '--json', '--quiet-minutes', '30'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n').pop());
  appendFileSync(liveFile, 'tick\n');
  const reaped = JSON.parse(spawnSync(process.execPath, [...gcArgs, 'reap', '--json', '--quiet-minutes', '30'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n').pop());
  const after = JSON.parse(spawnSync(process.execPath, [...gcArgs, 'list', '--json', '--quiet-minutes', '30'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n').pop());
  const liveSurvived = live ? live.exitCode === null && spawnSync('tasklist', ['/FI', 'PID eq ' + live.pid], { encoding: 'utf8' }).stdout.includes(String(live.pid)) : false;
  check('CP-12 monitor garbage collection: ' + before.garbage + ' garbage monitor(s) of ' + before.monitors + ' found, ' + reaped.killed.length + ' process(es) terminated, ' + after.garbage + ' garbage left; the live monitor on a moving file survived (' + liveSurvived + ')', after.garbage === 0 && reaped.killed.length >= before.garbage && liveSurvived, JSON.stringify({ before, reaped: reaped.killed.length, after }).slice(0, 300));
  if (live) { try { live.kill(); } catch { /* gone */ } }
}

// CP-13 (milestone 5, admission control): a process on a machine below the memory floor claims nothing and says why; the same
// process with the floor at its default claims. Measured by setting the floor above any real machine for one process.
{
  const sql6 = new pgLib.Client({ connectionString: RUNNER_URL }); await sql6.connect();
  const wo = randomUUID();
  await sql6.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'CP-13 admission', $2::text[], 'high', 'queued')`, [wo, ['qa/factory/shared_' + wo.slice(0, 8) + '.txt']]);
  const tag = randomUUID().slice(0, 8);
  const starved = await runAsync([WORKER, 'node-starved-' + tag, 'complete'], { FACTORY_MIN_FREE_MB: '99999999' });
  const refused = /ADMISSION_REFUSED free memory .* is below FACTORY_MIN_FREE_MB 99999999/.test(starved.out);
  const stillQueued = (await sql6.query("select status from factory.work_orders where work_order_id = $1", [wo])).rows[0].status === 'queued';
  const fed = await runAsync([WORKER, 'node-fed-' + tag, 'complete']);
  const claimed = new RegExp('CLAIMED \\S+ ' + wo).test(fed.out);
  check('CP-13 admission control across processes: a process below the memory floor refuses to claim and says why (' + refused + '), the work order stays queued (' + stillQueued + '), and a process within limits claims it (' + claimed + ')', refused && stillQueued && claimed, (starved.out + '\n' + fed.out).slice(0, 300));
  await sql6.end();
}

// CP-14 (milestone 5, heavy-job concurrency limits): three HEAVY work orders; one node may hold one heavy run (max_heavy 1) and the
// plane two (FACTORY_HEAVY_PER_PLANE=2). Two processes on the SAME node id: the second gets nothing while the first holds. A third
// process on another node gets the second heavy work order; a fourth on a third node gets nothing while the plane is at its limit;
// once the first holder completes, it gets the third. Light work is never limited.
{
  const sql7 = new pgLib.Client({ connectionString: RUNNER_URL }); await sql7.connect();
  const mkW = async (title, weight) => { const id = randomUUID(); await sql7.query(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, weight) values ($1, $2, $3::text[], 'high', 'queued', $4)`, [id, title, ['qa/factory/shared_' + id.slice(0, 8) + '.txt'], weight]); return id; };
  const h1 = await mkW('CP-14 heavy one', 'heavy'), h2 = await mkW('CP-14 heavy two', 'heavy'), h3 = await mkW('CP-14 heavy three', 'heavy'), light = await mkW('CP-14 light', 'light');
  const tag = randomUUID().slice(0, 8), env = { FACTORY_HEAVY_PER_PLANE: '2' };
  const holderA = runAsync([WORKER, 'node-heavyA-' + tag, 'hold', '30', '9'], env);   // holds a heavy run ~9 s
  await sleep(2500);
  const sameNode = await runAsync([WORKER, 'node-heavyA-' + tag, 'complete'], env);
  const sameNodeGot = (/CLAIMED \S+ (\S+)/.exec(sameNode.out) || [])[1];
  const holderB = runAsync([WORKER, 'node-heavyB-' + tag, 'hold', '30', '6'], env);   // a second node takes the second heavy
  await sleep(2500);
  const third = await runAsync([WORKER, 'node-heavyC-' + tag, 'complete'], env);
  const thirdGot = (/CLAIMED \S+ (\S+)/.exec(third.out) || [])[1];
  const [a, b] = await Promise.all([holderA, holderB]);
  const aGot = (/CLAIMED \S+ (\S+)/.exec(a.out) || [])[1], bGot = (/CLAIMED \S+ (\S+)/.exec(b.out) || [])[1];
  const afterwards = await runAsync([WORKER, 'node-heavyC-' + tag, 'complete'], env);
  const afterGot = (/CLAIMED \S+ (\S+)/.exec(afterwards.out) || [])[1];
  const heavies = [h1, h2, h3];
  const ok = heavies.includes(aGot) && heavies.includes(bGot) && aGot !== bGot
    && (sameNodeGot === undefined || sameNodeGot === light)                                       // the same node gets the LIGHT one (never limited) or nothing, never a heavy
    && (thirdGot === undefined || thirdGot === light)                                             // plane at 2 heavy: no heavy for a third node
    && heavies.includes(afterGot) && afterGot !== aGot && afterGot !== bGot;                     // after a holder completes, the third heavy is claimable
  check('CP-14 heavy limits across processes: node A holds a heavy run and a second process on node A gets no heavy (' + (sameNodeGot === light ? 'got the light one' : sameNodeGot ? 'GOT HEAVY ' + sameNodeGot.slice(0, 8) : 'nothing') + '); node B holds the second heavy; node C gets no heavy while the plane holds two (' + (thirdGot ? (heavies.includes(thirdGot) ? 'GOT HEAVY' : 'got the light one') : 'nothing') + '); after a holder completes node C gets the third heavy (' + heavies.includes(afterGot) + ')', ok, JSON.stringify({ aGot, bGot, sameNodeGot, thirdGot, afterGot, h1, h2, h3, light }).slice(0, 500));
  await sql7.end();
}

console.log('');
console.log('shared_control_plane_acceptance: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('NOT PROVED HERE, BY CONSTRUCTION: two MACHINES sharing this plane. The server listens on loopback only; a hosted');
console.log('non-production PostgreSQL or an opened LAN port is the founder\'s boundary, and it is the only part of milestone 1 this machine cannot do alone.');
process.exit(failures.length ? 1 : 0);
