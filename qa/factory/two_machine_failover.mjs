#!/usr/bin/env node
// TWO-MACHINE FAILOVER ACCEPTANCE (Factory V1 milestone 2 on real machines).
//
// The one-machine proof (shared_control_plane_acceptance.mjs CP-1 / CP-7) showed a run dying in one PROCESS and
// being taken over by another through the shared plane. This script asks the same question across MACHINES,
// coordinated through nothing but the plane itself: the Home PC claims and dies, the Work PC waits for the lease to
// expire, takes the work over from the dead node's checkpoint, and completes it; then either machine verifies.
//
// The discriminator that CP-1 could not have is the HOSTNAME recorded in every checkpoint: two node ids on one
// machine prove the instrument, two node ids on two hostnames prove the milestone. `verify` says which one it saw
// and exits differently for each, so a single-machine rehearsal can never be mistaken for the milestone.
//
//   node qa/factory/two_machine_failover.mjs seed                       either PC: queue the acceptance work order; prints STAMP
//   node qa/factory/two_machine_failover.mjs hold <stamp> [leaseSec]    PC A: claim it, checkpoint, then DIE without completing
//   node qa/factory/two_machine_failover.mjs takeover <stamp>           PC B: wait for the lease to expire, take over, complete
//   node qa/factory/two_machine_failover.mjs verify <stamp>             either PC: read the plane; exit 0 TWO MACHINES, 3 SAME MACHINE, 1 FAIL
//   node qa/factory/two_machine_failover.mjs cleanup [<stamp>|all]      remove this script's rows (and nothing else)
//   node qa/factory/two_machine_failover.mjs rehearse                   one machine: seed, hold in a child, take over, verify (expects exit 3)
//
// Needs FACTORY_RUNNER_PG_URL (judged by db.mjs: no superuser, no production project, TLS off loopback). Each machine
// uses its own node id from .factory/node-id; FACTORY_NODE_ID overrides it for the rehearsal's second "node".
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const argv = process.argv.slice(2);
// --runner-env <file>: the env file AS THE NODE READS IT (runner-env.mjs) - the copied runner.env names the other machine's CA path, which
// the node resolves to the copy beside the file; this script read FACTORY_RUNNER_PG_URL raw and failed with ENOENT on the Work PC
// (final verification 4, Work-PC probe). Without it: FACTORY_RUNNER_PG_URL (its CA path resolved the same way), else ~/.brain-factory/runner.env.
const envArgAt = argv.indexOf('--runner-env');
const envArg = envArgAt > -1 ? argv.splice(envArgAt, 2)[1] : null;
// ...and a failure is one line, not a stack (one dropped connection ended a wave with an uncaught 'Connection terminated unexpectedly')
const oneLine = (e) => { console.log('FAILED: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200) + ' - nothing more was done; run the same command again'); process.exit(1); };
process.on('uncaughtException', oneLine); process.on('unhandledRejection', oneLine);
const [mode, stampArg, leaseArg] = argv;
const TITLE = 'TM-failover';
if (!mode) { console.log('usage: two_machine_failover.mjs seed | hold <stamp> [leaseSec] | takeover <stamp> | verify <stamp> | cleanup [<stamp>|all] | rehearse'); process.exit(2); }
{
  const { loadRunnerUrl, resolveCaPath } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/runner-env.mjs')).href);
  if (envArg || !process.env.FACTORY_RUNNER_PG_URL) {
    const r = loadRunnerUrl(envArg);
    if (!r.usable) { console.log('no usable runner URL: ' + r.note + ' (pass --runner-env <runner.env>, or set FACTORY_RUNNER_PG_URL) - the designed refusal'); process.exit(2); }
    process.env.FACTORY_RUNNER_PG_URL = r.url;
  } else process.env.FACTORY_RUNNER_PG_URL = resolveCaPath(process.env.FACTORY_RUNNER_PG_URL).url;
}

const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const nodeMod = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/node.mjs')).href);
// ITS OWN NODE ID, never the checkout's: it registered the checkout's id with its own capabilities and a liveness stamp, erasing the
// running node's commit, handler and acceptance capabilities - that node silently stopped claiming acceptance work while every check
// read healthy, and a stopped node read ALIVE (final verification 2, 2026-09-25). And the commit it runs, clean or '+dirty', on
// every run it claims and every checkpoint it writes - evidence the composer's commit-bound rows can count.
const { execFileSync: xf } = await import('node:child_process');
const COMMIT = (() => { try { const h = xf('git', ['rev-parse', 'HEAD'], { cwd: join(HERE, '..', '..'), encoding: 'utf8' }).trim(); const d = xf('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: join(HERE, '..', '..'), encoding: 'utf8' }).trim(); return h + (d ? '+dirty' : ''); } catch { return null; } })();
const myNode = process.env.FACTORY_NODE_ID || ('node-tmf-' + nodeMod.nodeId().slice(5, 17));
const role = process.env.FACTORY_NODE_ROLE || 'generic';
const HOST = hostname();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register() {
  await claim.registerNode({ nodeId: myNode, capabilities: ['two-machine-failover'], securityRole: role, platform: process.platform + ' ' + HOST, agentVersion: process.version });
}
async function findWo(stamp) {
  const r = await db.read('select work_order_id, status from factory.work_orders where title = $1', [TITLE + ' ' + stamp]);
  if (!r.rows.length) { console.log('no work order for stamp ' + stamp + ' - run seed first'); process.exit(1); }
  return r.rows[0];
}
// claim ONLY this stamp's work order (claimWork's onlyWorkOrderId): anything else on the plane is never touched.
// Admission refusals (memory floor / CPU ceiling, milestone 5) are reported, not hidden behind "nothing to take".
async function claimStamp(stamp, lease, maxSeconds = 600) {
  const wo = await findWo(stamp);
  const until = Date.now() + maxSeconds * 1000;
  let said = '';
  while (Date.now() < until) {
    const run = await claim.claimWork({ nodeId: myNode, leaseSeconds: lease, onlyWorkOrderId: wo.work_order_id, baseCommit: COMMIT });
    if (run) return run;
    const g = claim.claimWork.lastAdmission;
    const why = g && g.admit === false ? 'admission refused: ' + g.reason : 'not claimable yet (leased elsewhere or lease not expired)';
    if (why !== said) { console.log('  waiting - ' + why); said = why; }
    await sleep(3000);
  }
  return null;
}

if (mode === 'seed') {
  await register();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '-' + randomUUID().slice(0, 4);
  const id = randomUUID();
  await db.write(`insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, $2, $3::text[], 'high', 'queued')`,
    [id, TITLE + ' ' + stamp, ['qa/factory/two_machine/' + stamp]]);
  console.log('STAMP ' + stamp);
  console.log('queued work order ' + id + ' by ' + myNode.slice(0, 13) + ' on ' + HOST);
  console.log('next: on PC A   node qa/factory/two_machine_failover.mjs hold ' + stamp);
  console.log('      on PC B   node qa/factory/two_machine_failover.mjs takeover ' + stamp);
  process.exit(0);
}

if (mode === 'hold') {
  if (!stampArg) { console.log('hold needs the stamp'); process.exit(2); }
  const lease = Number(leaseArg || 45);
  await register();
  const run = await claimStamp(stampArg, lease);
  if (!run) { console.log('could not claim the stamped work order'); process.exit(1); }
  await claim.checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location: 'qa/factory/two_machine_failover.mjs', scenario: 'phase-1-hold',
    payload: { phase: 1, nodeId: myNode, hostname: HOST, platform: process.platform, pid: process.pid, lease, head: COMMIT } });
  console.log('CLAIMED run ' + run.run_id + ' on ' + HOST + ' as ' + myNode.slice(0, 13) + '; checkpoint written; lease ' + lease + ' s');
  console.log('DYING NOW without completing or heartbeating - the other machine must take over after the lease expires');
  process.exit(3);
}

if (mode === 'takeover') {
  if (!stampArg) { console.log('takeover needs the stamp'); process.exit(2); }
  await register();
  const t0 = Date.now();
  console.log('waiting for the dead node\'s lease to expire on the plane...');
  const run = await claimStamp(stampArg, 60, 900);
  if (!run) { console.log('never became claimable within 15 minutes'); process.exit(1); }
  const prior = await db.read("select payload from factory.checkpoints where work_order_id = $1 and scenario = 'phase-1-hold' order by created_at desc limit 1", [run.work_order_id]);
  const p1 = prior.rows.length ? prior.rows[0].payload : null;
  console.log('TOOK OVER run ' + run.run_id + ' after ' + Math.round((Date.now() - t0) / 1000) + ' s on ' + HOST + ' as ' + myNode.slice(0, 13)
    + (p1 ? '; the dead node was ' + String(p1.nodeId).slice(0, 13) + ' on ' + p1.hostname : '; NO phase-1 checkpoint found'));
  await claim.checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location: 'qa/factory/two_machine_failover.mjs', scenario: 'phase-2-takeover',
    payload: { phase: 2, nodeId: myNode, hostname: HOST, platform: process.platform, pid: process.pid, resumedFrom: p1 && p1.nodeId, resumedFromHost: p1 && p1.hostname, waitedMs: Date.now() - t0, head: COMMIT } });
  await claim.completeRun({ runId: run.run_id, status: 'done', summary: 'two-machine takeover by ' + myNode + ' on ' + HOST, terminationReason: 'two_machine_failover_completed' });
  console.log('COMPLETED. next, on either PC: node qa/factory/two_machine_failover.mjs verify ' + stampArg);
  process.exit(0);
}

if (mode === 'verify') {
  if (!stampArg) { console.log('verify needs the stamp'); process.exit(2); }
  const wo = await findWo(stampArg);
  const cps = (await db.read('select scenario, payload, created_at from factory.checkpoints where work_order_id = $1 order by created_at', [wo.work_order_id])).rows;
  const p1 = cps.find((c) => c.scenario === 'phase-1-hold'), p2 = cps.find((c) => c.scenario === 'phase-2-takeover');
  // an expired lease leaves the dead run row behind (status queued) and the takeover is a NEW run row; the one that
  // finished is the one to judge, and the number of rows is itself evidence of the takeover
  const runs = (await db.read('select run_id, status, node_id, attempt_count, termination_reason from factory.agent_runs where work_order_id = $1 order by created_at', [wo.work_order_id])).rows;
  const run = runs.find((r) => r.status === 'done') || runs[runs.length - 1];
  let ok = true;
  const say = (good, label, detail) => { if (!good) ok = false; console.log((good ? 'OK   ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); };
  say(!!p1, 'phase 1: a node claimed the work and checkpointed before dying', p1 ? p1.payload.nodeId.slice(0, 13) + ' on ' + p1.payload.hostname : 'no phase-1 checkpoint');
  say(!!p2, 'phase 2: a node took the work over and checkpointed', p2 ? p2.payload.nodeId.slice(0, 13) + ' on ' + p2.payload.hostname : 'no phase-2 checkpoint');
  say(p1 && p2 && p1.payload.nodeId !== p2.payload.nodeId, 'the two phases ran on DIFFERENT node ids');
  say(p2 && p1 && p2.payload.resumedFrom === p1.payload.nodeId, 'the taker-over READ the dead node\'s checkpoint (resumedFrom matches)');
  say(run && run.status === 'done' && run.termination_reason === 'two_machine_failover_completed', 'the run is done with the stated termination reason', run ? run.status + ' / ' + run.termination_reason : 'no run');
  say(runs.length >= 2 && runs.some((r) => Number(r.attempt_count) >= 2), 'the plane recorded the expired lease on the dead run (attempt_count 2) and a second run row for the takeover',
    runs.length + ' run row(s): ' + runs.map((r) => r.status + '/attempt ' + r.attempt_count).join(', '));
  say(wo.status === 'done', 'the work order is done', wo.status);
  const twoMachines = p1 && p2 && p1.payload.hostname && p2.payload.hostname && p1.payload.hostname !== p2.payload.hostname;
  console.log('');
  if (!ok) { console.log('VERDICT: FAIL'); process.exit(1); }
  if (twoMachines) { console.log('VERDICT: TWO MACHINES — ' + p1.payload.hostname + ' died, ' + p2.payload.hostname + ' took over through the shared plane. Milestone 2 proved on real machines.'); process.exit(0); }
  console.log('VERDICT: SAME MACHINE (' + (p1 && p1.payload.hostname) + ') — the instrument works; the milestone is NOT proved until phase 1 and phase 2 run on different hostnames.');
  process.exit(3);
}

if (mode === 'cleanup') {
  const which = stampArg || 'all';
  const wos = (await db.read(which === 'all' ? 'select work_order_id from factory.work_orders where title like $1' : 'select work_order_id from factory.work_orders where title = $1',
    [which === 'all' ? TITLE + ' %' : TITLE + ' ' + which])).rows.map((r) => r.work_order_id);
  let n = 0;
  for (const id of wos) {
    await db.write('delete from factory.checkpoints where work_order_id = $1', [id]);
    await db.write('delete from factory.agent_runs where work_order_id = $1', [id]); // surface_locks cascade from the run
    await db.write('delete from factory.work_orders where work_order_id = $1', [id]);
    n++;
  }
  console.log('removed ' + n + ' two-machine work order(s) and their runs, locks and checkpoints; nothing else touched');
  process.exit(0);
}

if (mode === 'rehearse') {
  // One machine, two node ids, real processes: proves the script end to end and MUST end in exit 3 (SAME MACHINE).
  const self = fileURLToPath(import.meta.url);
  const runChild = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [self, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('exit', (code) => resolve({ code, out }));
  });
  const seeded = await runChild(['seed']);
  const stamp = (seeded.out.match(/STAMP (\S+)/) || [])[1];
  console.log(seeded.out.trim());
  if (!stamp) process.exit(1);
  const held = await runChild(['hold', stamp, '20'], { FACTORY_NODE_ID: 'node-rehearsal-a-' + randomUUID().slice(0, 8) });
  console.log(held.out.trim() + '\n(hold exited ' + held.code + ')');
  const took = await runChild(['takeover', stamp], { FACTORY_NODE_ID: 'node-rehearsal-b-' + randomUUID().slice(0, 8) });
  console.log(took.out.trim() + '\n(takeover exited ' + took.code + ')');
  const ver = await runChild(['verify', stamp]);
  console.log(ver.out.trim());
  const cleaned = await runChild(['cleanup', stamp]);
  console.log(cleaned.out.trim());
  const expected = held.code === 3 && took.code === 0 && ver.code === 3;
  console.log(expected ? 'REHEARSAL OK: hold died (3), takeover completed (0), verify reported SAME MACHINE (3) as it must on one machine'
    : 'REHEARSAL FAILED: hold ' + held.code + ', takeover ' + took.code + ', verify ' + ver.code);
  process.exit(expected ? 0 : 1);
}

console.log('unknown mode ' + mode);
process.exit(2);
