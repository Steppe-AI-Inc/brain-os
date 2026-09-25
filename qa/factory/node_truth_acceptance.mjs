#!/usr/bin/env node
// WHAT A NODE SAYS ABOUT ITSELF IS TRUE - the node-level rows, with real worker and supervisor processes against a disposable
// PostgreSQL (independent verification 2026-09-24, round 4: every row below was a defect a verifier reproduced).
//
//   N1 the documented health checks (node.mjs health, plane-health.mjs) from a plain shell KEEP the role the plane holds - they
//      re-registered a running verifier as generic, and verifier work waited while every check passed; a stale FACTORY_NODE_ROLE
//      in the shell is said, not written
//   N2 a running worker RE-ASSERTS its role on its beat: a record changed by anything else is put back within seconds, and said
//   N3 the factory_acceptance handler completes only an instruction it carried out: an unknown action, a wrong case, a handoff
//      that is not a JSON object fail their runs by name, their work orders fail, and a dependent is never released
//   N4 a failed run fails its work order in the same statement (no work order is left 'claimed' with no run holding it), its
//      locks are released, its dependent stays blocked, a completion that is neither done nor failed is refused, and health names
//      a legacy stranded work order by id
//   N5 a node BUSY on a run longer than the stale window reads ALIVE: the run heartbeat stamps the node record too
//   N6 a worker SURVIVES a transient plane loss: connections reset and refused for 7 s, the same process retries, says so, and
//      claims work addressed to it afterwards (one loss used to end the worker)
//   N7 the supervisor's backoff resets once a worker has completed a claim cycle: a worker that did and then died is restarted
//      in 5 s every time (short losses used to walk the backoff up to 5 minutes)
// and from the final verification of 2026-09-24 (340da680):
//   N1 also: a health check does not stamp liveness (it made a dead node read ALIVE for three minutes)
//   N8 a worker that reaches the plane but fails every claim is backed off with GROWING delays and never reads ALIVE (it reset the
//      backoff on registration and crash-looped every 6 s while the plane read it ALIVE)
//   N9 one worker per node identity: a second worker on the same state dir does not start, nor a bare one beside a supervisor
//   N10 a malformed argument fails its run by name, and a data exception inside a run is terminal (both were retried forever)
//   N11 a plane-wide claim lock held past the lock timeout is said in the worker's log and its status (it idled ALIVE, silent)
//   N13 a run whose lease cannot be renewed (the node cut off from the plane) is ABORTED before the lease lapses, so another node
//      takes its surface only after it stopped; the abandoned run keeps the node that ran it (it kept working, and was erased)
//   N14 a node records the commit it runs and its acceptance handler (capabilities head:<sha>, handler:...; agent_version), and a
//      health check never overwrites the running worker's record
//   N15 two_machine_real.mjs refuses a node on another or an unrecorded commit, and seeds nothing (a Work PC on an older checkout
//      passed the two-machine acceptance)
//   N16 a claim-lock BUSY record left by an earlier worker (a crash, a reboot) is replaced by the next worker's first claim cycle
//   N19 a running worker whose node record was deleted registers again and reads ALIVE at once (it read STALE for a beat)
//   N23 a runbook script run beside the running worker (two_machine_scheduling.mjs seed) leaves that node's record alone - it
//      registered the checkout's node id and erased its commit and acceptance capabilities - and a record overwritten anyway is
//      restored by the worker's next beat, whole, and said
//   N20 the composer's plane rows count only evidence at the commit under acceptance: machines whose node runs it, runs stamped with
//      it (not '<sha>+dirty'), failover checkpoints at it, verifications whose verifying run completed
//   N8 also: health does not say "can claim work" while the node's supervisor is in backoff
//   N21 over a slow link (latency added both ways), one failed lease renewal does not abort a healthy run: the failed renewal is
//      retried in seconds and the run completes (it was aborted at two thirds of the lease while its next renewal was landing)
//   N22 a worker whose admission refuses every cycle never declares itself ready and never reads ALIVE (an admission-only cycle
//      counted as a claim cycle)
//   N12 only a finished, successful run can be verified: a verify of a FAILED run is refused by name and writes nothing (it was
//      recorded as verified and reported 'completed_with_verdict'); a done run authored elsewhere is still verified
// and from the final verification of 2026-09-25 (18bce497):
//   N24 health says "can claim work" only while the supervised node is claiming: not over a refused admission or a busy claim lock
//   N25 a lease renewal that lands after its run completed is not a lost lease: the run is not logged LOST or ABORTED (a renewal in
//      flight at the completion was read as a takeover)
//   N26 a checkpoint and a completion that meet a transient plane loss are retried: a first attempt that never reaches the plane, and a
//      second that lands but whose reply is lost, end in ONE checkpoint and ONE completed run - not a run thrown away, its claim left
//      looking live for a lease, and the work done again (Work-PC probe of the final verification of 18bce497)
// and from the final verification of 2026-09-25 (9e0af976):
//   N27 the runbook's scheduling instrument passes with the verifier's wave started first (it gave up waiting for a finished run)
//   N28 a previous worker's admission refusal and busy-claim-lock records are gone once the next worker holds its lock, even when it
//      never reaches a claim cycle (status repeated them for a worker that could not reach the plane)
//   N29 a claim that committed but whose reply was lost is given back at once: the plane requeues it and the work is done within
//      seconds, not after a whole lease with a live claim nothing held
import { startLocalPg } from './local_pg.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const NODE = join(ROOT, 'scripts', 'factory-runner', 'node.mjs');
const SUP = join(ROOT, 'scripts', 'factory-runner', 'node-supervisor.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(0, 1500) : '')); } };

const WORK = mkdtempSync(join(tmpdir(), 'factory-nodetruth-'));
const pg = await startLocalPg();
const { default: pgLib } = await import('pg');
const admin = new pgLib.Client({ connectionString: pg.superUrl });
await admin.connect();
for (const f of ['001_factory_control_plane.sql', '002_director_state_machine.sql', '003_resource_governance.sql']) await admin.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
await admin.query('grant usage on schema factory to ' + pg.runnerRole);
await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);

// the in-process node: its own state dir, a short stale window (N5), admission off (this PC's load is not under test)
process.env.FACTORY_RUNNER_PG_URL = pg.runnerUrl;
process.env.FACTORY_STATE_DIR = join(WORK, 'state-inproc');
process.env.FACTORY_NODE_STALE_MS = '8000';
process.env.FACTORY_ADMISSION = 'off';
delete process.env.FACTORY_NODE_ROLE;
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const nodeMod = await import(pathToFileURL(NODE).href);
const planeHealthMod = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/plane-health.mjs')).href);

const roleOf = async (id) => (await admin.query('select security_role from factory.nodes where node_id = $1', [id])).rows[0]?.security_role || null;
const woStatus = async (id) => (await admin.query('select status from factory.work_orders where work_order_id = $1', [id])).rows[0]?.status || null;
const runsOf = async (id) => (await admin.query('select run_id, status, node_id, termination_reason, summary from factory.agent_runs where work_order_id = $1 order by started_at', [id])).rows;
const seed = async (title, { type = 'software_development', handoff = null, caps = [], surface = null } = {}) => {
  const id = randomUUID();
  await admin.query("insert into factory.work_orders (work_order_id, title, work_type, owned_surface, priority, status, requires_capabilities, handoff) values ($1, $2, $3, $4::text[], 'high', 'queued', $5::text[], $6)",
    [id, title, type, [surface || ('qa/nodetruth/' + id.slice(0, 8))], caps, handoff]);
  return id;
};
const capture = async (fn) => { const saved = console.log; let out = ''; console.log = (...a) => { out += a.join(' ') + '\n'; }; try { const v = await fn(); return { v, out }; } finally { console.log = saved; } };
// one admin client: its queries run one after another (never Promise.all on it)
const seq = async (items, fn) => { const out = []; for (const x of items) out.push(await fn(x)); return out; };
const waitFor = async (fn, ms, every = 500) => { const until = Date.now() + ms; let v; while (Date.now() < until) { v = await fn(); if (v) return v; await sleep(every); } return null; };

// the row running now: a crash anywhere is that row's FAIL (a thrown error used to end the suite with no summary, which a mutation
// proof could not attribute to any row)
let currentRow = 'setup';
const procs = [];
// A real worker process: `node.mjs start` exactly as a supervisor runs it (the URL in its environment only, never an argument).
const spawnWorker = ({ state, role, url = pg.runnerUrl, extra = {} }) => {
  const env = { ...process.env, FACTORY_RUNNER_PG_URL: url, FACTORY_STATE_DIR: state, FACTORY_NODE_ROLE: role, FACTORY_NODE_BEAT_MS: '2000', FACTORY_NODE_STALE_MS: '8000', FACTORY_ADMISSION: 'off', ...extra };
  const c = spawn(process.execPath, [NODE, 'start'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  c.out = ''; c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; });
  procs.push(c); return c;
};
// a bare "node.mjs start" on a state dir, to its exit (or 20 s)
const runStart = (state) => new Promise((r) => {
  const c = spawn(process.execPath, [NODE, 'start'], { cwd: ROOT, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: state, FACTORY_NODE_ROLE: 'generic', FACTORY_ADMISSION: 'off' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } r({ code: 'timeout', out }); }, 20000);
  c.on('exit', (code) => { clearTimeout(t); r({ code, out }); });
});
const statusOf = (state) => { const r = spawnSync(process.execPath, [NODE, 'status', '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: state } }); return (r.stdout || '') + (r.stderr || ''); };
const ageSecOf = async (id) => Number((await admin.query('select extract(epoch from now() - last_heartbeat_at) s from factory.nodes where node_id = $1', [id])).rows[0].s);
const envFile = join(WORK, 'runner.env'); writeFileSync(envFile, 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '\n');
const registerOther = () => claim.registerNode({ nodeId: 'node-n13-other', capabilities: [], securityRole: 'generic', platform: 'test other-host' });
const idOf = (state) => { try { return readFileSync(join(state, 'node-id'), 'utf8').trim(); } catch { return null; } };

try {
  // ---- N1. a health check keeps the role the plane holds ---------------------------------------------------------------------
  currentRow = 'N1';
  {
    const me = nodeMod.nodeId();
    await claim.registerNode({ nodeId: me, capabilities: [], securityRole: 'verifier', platform: 'test' });
    // a node whose worker has been dead for an hour
    await admin.query("update factory.nodes set last_heartbeat_at = now() - interval '1 hour' where node_id = $1", [me]);
    const h1 = await capture(() => nodeMod.health());
    const afterHealth = await roleOf(me);
    process.env.FACTORY_NODE_ROLE = 'generic'; // a variable left in some shell: said, not written
    const h2 = await capture(() => nodeMod.health());
    delete process.env.FACTORY_NODE_ROLE;
    const afterStated = await roleOf(me);
    const ph = await capture(() => planeHealthMod.planeHealth({}));
    const afterPlane = await roleOf(me);
    const phRow = (ph.v && ph.v.rows || []).find((r) => /registered on the plane as/.test(r.label)) || {};
    const ageAfter = await ageSecOf(me);
    check('N1 the health checks from a plain shell keep the role the plane holds (health: ' + afterHealth + ', with a stale FACTORY_NODE_ROLE=generic: ' + afterStated + ', plane-health: ' + afterPlane + ') and do not make a dead node ALIVE (heartbeat still ' + Math.round(ageAfter) + ' s old)',
      ageAfter >= 3500 && h1.v.ok && afterHealth === 'verifier' && /role verifier kept as the plane holds it/.test(h1.out) && afterStated === 'verifier' && /FACTORY_NODE_ROLE here says generic but the plane holds verifier/.test(h2.out)
        && afterPlane === 'verifier' && /registered on the plane as verifier .*kept/.test(phRow.label || ''),
      JSON.stringify({ afterHealth, afterStated, afterPlane, ph: phRow.label }) + '\n' + h1.out.split('\n').filter((l) => /regist|FAIL/.test(l)).join('\n') + '\n' + h2.out.split('\n').filter((l) => /regist|note FACTORY/.test(l)).join('\n'));
  }

  // ---- N2. a running worker re-asserts its role -------------------------------------------------------------------------------
  currentRow = 'N2';
  const S1 = join(WORK, 'state-w1');
  const w1 = spawnWorker({ state: S1, role: 'verifier', extra: { FACTORY_PG_LOCK_TIMEOUT_MS: '1500' } });
  const w1Up = await waitFor(async () => /\] ready: first claim cycle completed/.test(w1.out), 30000);
  const w1id = idOf(S1);
  {
    await admin.query("update factory.nodes set security_role = 'generic' where node_id = $1", [w1id]);
    const t0 = Date.now();
    const back = await waitFor(async () => (await roleOf(w1id)) === 'verifier', 15000, 300);
    const ms = Date.now() - t0;
    // the plane flips back before the worker's log line arrives: both are waited for
    const said = await waitFor(async () => /the plane held role generic for this node - re-asserted verifier/.test(w1.out), 5000, 200);
    check('N2 a running worker re-asserts its role on its beat: demoted to generic on the plane, verifier again in ' + ms + ' ms, and said',
      !!w1Up && !!back && !!said, w1.out.slice(-1200));
  }

  // ---- N9. one worker per node identity ------------------------------------------------------------------------------------------
  currentRow = 'N9';
  {
    const second = await runStart(S1);
    const roleAfter = await roleOf(w1id);
    check('N9 one worker per node identity: a second worker on the same state dir does not start (exit ' + second.code + ') and the node stays verifier',
      second.code === 4 && /NOT STARTED - another worker already runs the node/.test(second.out) && roleAfter === 'verifier' && w1.exitCode === null, second.out.slice(-600));
  }

  // ---- N14. a node records the commit it runs; a health check leaves the worker's record alone ------------------------------------
  currentRow = 'N14';
  const HEAD = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  {
    const rec = (await admin.query('select capabilities, agent_version from factory.nodes where node_id = $1', [w1id])).rows[0];
    const caps = rec.capabilities || [];
    await admin.query("update factory.nodes set capabilities = capabilities || '[\"qa-marker\"]'::jsonb where node_id = $1", [w1id]);
    const h = spawnSync(process.execPath, [NODE, 'health'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S1, FACTORY_NODE_ROLE: '' } });
    const after = (await admin.query('select capabilities from factory.nodes where node_id = $1', [w1id])).rows[0].capabilities || [];
    check('N14 a node records the commit it runs and its acceptance handler (' + (caps.find((c) => String(c).startsWith('head:')) || 'no head').slice(0, 17) + ', ' + (caps.find((c) => String(c).startsWith('handler:')) || 'no handler') + '), and a health check leaves the running worker\'s record alone',
      caps.includes('head:' + HEAD) && caps.includes('handler:factory-acceptance/2') && String(rec.agent_version).includes(HEAD.slice(0, 12)) && h.status === 0 && after.includes('qa-marker') && after.includes('head:' + HEAD),
      JSON.stringify({ caps, agent: rec.agent_version, after, health: h.status }) + '\n' + String(h.stdout).slice(-400));
    await admin.query("update factory.nodes set capabilities = capabilities - 'qa-marker' where node_id = $1", [w1id]);
  }

  // ---- N15. the two-machine acceptance refuses a node on another commit -------------------------------------------------------------
  currentRow = 'N15';
  {
    const tmr = (work) => spawnSync(process.execPath, [join(ROOT, 'qa/factory/two_machine_real.mjs'), 'run', '--home', w1id, '--work', work], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S1 } });
    await claim.registerNode({ nodeId: 'node-n15-unrecorded', capabilities: ['factory_acceptance', 'node:node-n15-unrecorded'], securityRole: 'verifier', platform: 'test other-host' });
    await claim.registerNode({ nodeId: 'node-n15-older', capabilities: ['factory_acceptance', 'handler:factory-acceptance/2', 'head:' + '0'.repeat(40), 'node:node-n15-older'], securityRole: 'verifier', platform: 'test other-host' });
    // this row is about the WORK node: the home node is presented clean (a worker started from an uncommitted tree is 'dirty', and is
    // itself refused - correctly - before the work node is looked at)
    await admin.query("update factory.nodes set capabilities = capabilities - 'dirty' where node_id = $1", [w1id]);
    const r1 = tmr('node-n15-unrecorded'), r2 = tmr('node-n15-older');
    const seeded = (await admin.query("select count(*)::int n from factory.work_orders where title like 'TMR-%'")).rows[0].n;
    check('N15 the two-machine acceptance refuses a Work node on an unrecorded commit (exit ' + r1.status + ') or another commit (exit ' + r2.status + '), naming it, and seeds nothing (' + seeded + ' work orders)',
      r1.status === 1 && /REFUSED - the work node node-n15-unrecorded.* runs an unrecorded commit/.test(r1.stdout) && r2.status === 1 && /REFUSED - the work node node-n15-older.* runs 0{40}/.test(r2.stdout) && seeded === 0,
      (r1.stdout + r1.stderr).slice(-500) + '\n---\n' + (r2.stdout + r2.stderr).slice(-500));
    await admin.query("update factory.nodes set last_heartbeat_at = now() - interval '1 day' where node_id like 'node-n15-%'");
  }

  // ---- N3. the acceptance handler completes only what it carried out ----------------------------------------------------------
  currentRow = 'N3';
  {
    const authored = await seed('N3 authored', { type: 'qa_none' });
    const u1 = await seed('N3 unknown action', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'verify-v2', authoringRunId: authored }) });
    const u2 = await seed('N3 not JSON', { type: 'factory_acceptance', handoff: 'hold 30 seconds, then verify' });
    const u3 = await seed('N3 wrong case', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'Verify', authoringRunId: authored }) });
    const u4 = await seed('N3 no handoff', { type: 'factory_acceptance', handoff: null });
    const d1 = await seed('N3 depends on the unknown action', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'complete' }) });
    await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [d1, u1]);
    const c1 = await seed('N3 complete', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'complete' }) });
    const settled = await waitFor(async () => (await seq([u1, u2, u3, u4, c1], woStatus)).every((s) => s === 'done' || s === 'failed'), 40000);
    await sleep(4000); // a dependent that were wrongly released would be claimed within one idle loop
    const st = Object.fromEntries(await seq([['u1', u1], ['u2', u2], ['u3', u3], ['u4', u4], ['d1', d1], ['c1', c1]], async ([k, id]) => [k, await woStatus(id)]));
    const reasons = Object.fromEntries(await seq([['u1', u1], ['u2', u2], ['u3', u3], ['u4', u4], ['c1', c1]], async ([k, id]) => [k, (await runsOf(id)).map((r) => r.status + ':' + r.termination_reason).join(',')]));
    const d1Runs = (await runsOf(d1)).length;
    const stranded = (await admin.query("select count(*)::int n from factory.work_orders wo where wo.status = 'claimed' and not exists (select 1 from factory.agent_runs r where r.work_order_id = wo.work_order_id and r.status = 'in_progress')")).rows[0].n;
    check('N3 the acceptance handler completes only what it carried out: an unknown action, a wrong case, a non-JSON and a missing handoff fail by name (' + JSON.stringify(reasons) + '), their work orders fail, the dependent is never released (' + st.d1 + ', ' + d1Runs + ' runs) and the explicit complete is done',
      !!settled && st.u1 === 'failed' && st.u2 === 'failed' && st.u3 === 'failed' && st.u4 === 'failed' && st.c1 === 'done' && st.d1 === 'queued' && d1Runs === 0 && stranded === 0
        && reasons.u1 === 'failed:factory_acceptance_unknown_action' && reasons.u3 === 'failed:factory_acceptance_unknown_action' && reasons.u2 === 'failed:factory_acceptance_bad_handoff' && reasons.u4 === 'failed:factory_acceptance_bad_handoff'
        && reasons.c1 === 'done:factory_acceptance_completed' && /FAILED run [0-9a-f]{8} \(factory_acceptance_unknown_action\)/.test(w1.out),
      JSON.stringify({ st, reasons, d1Runs, stranded }) + '\n' + w1.out.slice(-1500));
  }

  // ---- N11. a claim lock held past the lock timeout is said ---------------------------------------------------------------------
  currentRow = 'N11';
  {
    const holder = new pgLib.Client({ connectionString: pg.superUrl }); holder.on('error', () => {});
    await holder.connect();
    await holder.query('begin'); await holder.query("select pg_advisory_xact_lock(hashtext('factory.claim'))");
    const busy = await waitFor(async () => /claim lock BUSY since /.test(w1.out), 25000, 300);
    const st = statusOf(S1);
    await holder.query('rollback'); await holder.end();
    const free = await waitFor(async () => /claim lock free again - claiming/.test(w1.out), 25000, 300);
    check('N11 a plane-wide claim lock held past the lock timeout is said: the worker logs it, its status says NOT CLAIMING, and it says when the lock is free again',
      !!busy && /NOT CLAIMING: the plane-wide claim lock has been busy since/.test(st) && !!free, st.slice(-600) + '\n' + w1.out.slice(-800));
  }

  // ---- N16. a stale claim-lock record is replaced ------------------------------------------------------------------------------
  currentRow = 'N16';
  {
    const S6 = join(WORK, 'state-stale-busy'); mkdirSync(S6, { recursive: true });
    writeFileSync(join(S6, 'node-claim-busy.json'), JSON.stringify({ since: '2026-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z' }));
    const before = statusOf(S6);
    const once = spawnSync(process.execPath, [NODE, 'start', '--once'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S6, FACTORY_NODE_ROLE: 'generic', FACTORY_ADMISSION: 'off' } });
    const after = statusOf(S6);
    check('N16 a claim-lock BUSY record left by an earlier worker is replaced by the next worker\'s first claim cycle (status no longer says NOT CLAIMING)',
      once.status === 0 && /ready: first claim cycle completed/.test(once.stdout) && !/NOT CLAIMING: the plane-wide claim lock/.test(after), 'before: ' + before.slice(-200) + '\nafter: ' + after.slice(-300));
  }

  // ---- N4. a failed run fails its work order, atomically ----------------------------------------------------------------------
  currentRow = 'N4';
  {
    const wf = await seed('N4 fails', { type: 'qa_n4' });
    const wd = await seed('N4 depends on it', { type: 'qa_n4' });
    await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [wd, wf]);
    await claim.registerNode({ nodeId: 'node-n4', capabilities: [], securityRole: 'generic', platform: 'test' });
    const r = await claim.claimWork({ nodeId: 'node-n4', leaseSeconds: 60, onlyWorkOrderId: wf });
    const fin = await claim.completeRun({ runId: r.run_id, nodeId: 'node-n4', status: 'failed', terminationReason: 'qa_failed_on_purpose' });
    const woAfter = await woStatus(wf);
    const locks = (await admin.query('select count(*)::int n from factory.surface_locks where run_id = $1', [r.run_id])).rows[0].n;
    const dep = await claim.claimWork({ nodeId: 'node-n4', leaseSeconds: 60, onlyWorkOrderId: wd });
    const other = await seed('N4 other', { type: 'qa_n4' });
    const r2 = await claim.claimWork({ nodeId: 'node-n4', leaseSeconds: 60, onlyWorkOrderId: other });
    let refusedBlocked = '';
    try { await claim.completeRun({ runId: r2.run_id, nodeId: 'node-n4', status: 'blocked', terminationReason: 'x' }); } catch (e) { refusedBlocked = String(e.message); }
    // a legacy stranded work order (from before this fix): health names it by id
    const legacy = await seed('N4 legacy stranded', { type: 'qa_n4' });
    await admin.query("update factory.work_orders set status = 'claimed' where work_order_id = $1", [legacy]);
    const h = await capture(() => nodeMod.health());
    check('N4 a failed run fails its work order in the same statement (' + woAfter + ', ' + locks + ' locks left), its dependent stays blocked, a "blocked" completion is refused, and health names a stranded work order by id',
      fin && fin.superseded === false && woAfter === 'failed' && locks === 0 && dep === null && /must be done or failed/.test(refusedBlocked)
        && new RegExp("'claimed' with NO run in progress.*" + legacy.slice(0, 8)).test(h.out) && /work order\(s\) FAILED/.test(h.out),
      JSON.stringify({ fin, woAfter, locks, dep, refusedBlocked }) + '\n' + h.out.split('\n').filter((l) => /note/.test(l)).join('\n'));
    await admin.query("update factory.work_orders set status = 'failed' where work_order_id in ($1, $2)", [legacy, other]);
    await admin.query("update factory.agent_runs set status = 'failed', termination_reason = 'qa_cleanup', lease_expires_at = null where run_id = $1", [r2.run_id]);
    await admin.query('delete from factory.surface_locks where run_id = $1', [r2.run_id]);
  }

  // ---- N5. a busy node reads ALIVE --------------------------------------------------------------------------------------------
  currentRow = 'N5';
  {
    // the heartbeat alone stamps the node record (the canonical path every runner uses)
    await claim.registerNode({ nodeId: 'node-n5', capabilities: [], securityRole: 'generic', platform: 'test' });
    const w5 = await seed('N5 heartbeat', { type: 'qa_n5' });
    const r5 = await claim.claimWork({ nodeId: 'node-n5', leaseSeconds: 60, onlyWorkOrderId: w5 });
    await admin.query("update factory.nodes set last_heartbeat_at = now() - interval '1 hour' where node_id = 'node-n5'");
    const beat = await claim.heartbeat({ runId: r5.run_id, nodeId: 'node-n5', leaseSeconds: 60 });
    const age = Number((await admin.query("select extract(epoch from now() - last_heartbeat_at) s from factory.nodes where node_id = 'node-n5'")).rows[0].s);
    await claim.completeRun({ runId: r5.run_id, nodeId: 'node-n5', status: 'done', terminationReason: 'completed' });
    // ...and a node busy for longer than its stale window (8 s here) through the real loop
    const busy = await seed('N5 busy', { type: 'qa_busy' });
    const samples = [];
    const loop = nodeMod.nodeStart({ runWork: async () => { await sleep(20000); return { status: 'done', terminationReason: 'qa_busy_done' }; },
      once: true, leaseSeconds: 15, worktree: async () => ({ path: join(WORK, 'no-worktree'), branch: 'none', recovered: false }), workTypes: ['qa_busy'] });
    for (const at of [11000, 17000]) { await sleep(at - (samples.length ? 11000 : 0)); const s = await nodeMod.nodeStatus(); samples.push(s.state + ' ' + Math.round((s.ageMs || 0) / 1000) + 's'); }
    await loop;
    check('N5 a node busy on a run longer than its stale window reads ALIVE (' + samples.join(', ') + '), and the run heartbeat alone stamps the node record (age ' + Math.round(age) + ' s after a beat)',
      beat === true && age < 5 && samples.length === 2 && samples.every((s) => s.startsWith('ALIVE')) && (await woStatus(busy)) === 'done',
      JSON.stringify({ beat, age, samples }));
  }

  // ---- N6. a worker survives a transient plane loss ---------------------------------------------------------------------------
  currentRow = 'N6';
  {
    const net = await import('node:net');
    let down = false; const pairs = [];
    const relay = net.createServer((c) => {
      c.on('error', () => {});
      if (down) { c.destroy(); return; }
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {});
      pairs.push([c, u]); c.pipe(u); u.pipe(c);
      c.on('close', () => u.destroy()); u.on('close', () => c.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S2 = join(WORK, 'state-w2');
    const w2 = spawnWorker({ state: S2, role: 'generic', url: relayUrl, extra: { FACTORY_PG_CONNECT_TIMEOUT_MS: '3000', FACTORY_PG_QUERY_TIMEOUT_MS: '5000' } });
    const up = await waitFor(async () => /\] registered; capabilities /.test(w2.out), 30000);
    const w2id = idOf(S2);
    await sleep(1500);
    down = true; for (const [c, u] of pairs) { c.destroy(); u.destroy(); }
    await sleep(7000);
    down = false;
    await sleep(3000);
    const probe = await seed('N6 after the loss', { type: 'bootstrap_probe', caps: ['node:' + w2id] });
    const done = await waitFor(async () => (await woStatus(probe)) === 'done', 30000);
    const pr = await runsOf(probe);
    check('N6 a worker survives a transient plane loss (7 s of reset and refused connections): the same process (' + (w2.exitCode === null ? 'still running' : 'EXITED ' + w2.exitCode) + ') retried, said so, and claimed the work addressed to it afterwards',
      !!up && w2.exitCode === null && /failed on a transient plane error/.test(w2.out) && /the plane answers again after \d+ s/.test(w2.out) && !!done && pr.length === 1 && pr[0].node_id === w2id,
      JSON.stringify({ up: !!up, exit: w2.exitCode, done: !!done, runs: pr }) + '\n' + w2.out.slice(-1500));
    try { w2.kill(); } catch { /* gone */ }
    relay.close(); for (const [c, u] of pairs) { c.destroy(); u.destroy(); }
  }

  // ---- N7. the supervisor's backoff resets once a worker completed a claim cycle -------------------------------------------------
  currentRow = 'N7';
  {
    const S3 = join(WORK, 'state-sup'); const L3 = join(WORK, 'logs-sup');
    const env = { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: S3, FACTORY_NODE_BEAT_MS: '2000', FACTORY_ADMISSION: 'off' };
    const sup = spawn(process.execPath, [SUP, '--runner-env', envFile, '--role', 'generic', '--log-dir', L3], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    sup.out = ''; sup.stdout.on('data', (d) => { sup.out += d; }); sup.stderr.on('data', (d) => { sup.out += d; }); procs.push(sup);
    const status = () => { try { return JSON.parse(readFileSync(join(S3, 'node-status.json'), 'utf8')); } catch { return {}; } };
    const kills = [];
    for (let k = 0; k < 2; k++) {
      const st = await waitFor(async () => { const s = status(); return s.state === 'running' && s.childPid && s.readyAt ? s : null; }, 40000);
      if (!st) break;
      kills.push(st.childPid);
      try { process.kill(st.childPid); } catch { /* raced */ }
      await waitFor(async () => new RegExp('restart ' + (k + 1) + ' in \\d+ s').test(sup.out), 15000);
    }
    const backoffs = [...sup.out.matchAll(/restart (\d+) in (\d+) s/g)].map((m) => m[1] + ':' + m[2] + 's');
    // a bare worker beside the running supervisor does not start
    await waitFor(async () => { const s = status(); return s.state === 'running' && s.childPid ? s : null; }, 20000);
    const bare = await runStart(S3);
    check('N9b a bare worker does not start beside a supervisor that runs the same node (exit ' + bare.code + ')',
      bare.code === 4 && /NOT STARTED - a supervisor \(pid \d+, role generic\) already runs the node/.test(bare.out), bare.out.slice(-600));

    // ---- N24. health says "can claim work" only while the node's own records say it is claiming -------------------------------------
    // Beside THIS supervisor, whose worker is ready: health asks the node's supervisor, so a bare worker's state dir never says "can
    // claim work" at all. The worker writes these records only when they change, so a steady worker leaves the ones written here alone.
    currentRow = 'N24';
    {
      await waitFor(async () => { const s = status(); return s.state === 'running' && s.childPid && s.readyAt ? s : null; }, 40000);
      // (readyAt is set on the worker's first completed claim cycle, which has written both records already)
      const hOf = () => String(spawnSync(process.execPath, [NODE, 'health'], { cwd: ROOT, encoding: 'utf8', timeout: 90000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S3, FACTORY_NODE_ROLE: '' } }).stdout || '');
      const base = hOf();
      writeFileSync(join(S3, 'node-admission.json'), JSON.stringify({ admit: false, reason: 'qa: free memory below the floor', at: new Date().toISOString() }));
      const refused = hOf();
      writeFileSync(join(S3, 'node-admission.json'), JSON.stringify({ admit: true, reason: 'qa', at: new Date().toISOString() }));
      writeFileSync(join(S3, 'node-claim-busy.json'), JSON.stringify({ since: new Date().toISOString(), at: new Date().toISOString() }));
      const busy = hOf();
      writeFileSync(join(S3, 'node-claim-busy.json'), JSON.stringify({ since: null, at: new Date().toISOString() }));
      const pick = (t) => t.split('\n').filter((l) => /supervisor|HEALTHY/.test(l)).join(' | ');
      check('N24 health says "can claim work" only while the supervised node is claiming: not with its admission refused, nor with the claim lock busy',
        /this node can claim work/.test(base) && /NOT CLAIMING: admission refused/.test(refused) && !/this node can claim work/.test(refused) && /NOT CLAIMING: .*claim lock busy/.test(busy) && !/this node can claim work/.test(busy),
        'base: ' + pick(base) + '\nrefused: ' + pick(refused) + '\nbusy: ' + pick(busy));
    }
    currentRow = 'N7';
    spawn(process.execPath, [SUP, '--stop'], { cwd: ROOT, env, stdio: 'ignore', windowsHide: true });
    const exit = await new Promise((r) => { if (sup.exitCode !== null) return r(sup.exitCode); const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    check('N7 the supervisor\'s backoff resets once a worker completed a claim cycle: two workers killed after that were restarted after ' + backoffs.join(', ') + ' (not 5 s then 10 s), and --stop ends it (exit ' + exit + ')',
      kills.length === 2 && backoffs.length >= 2 && backoffs[0] === '1:5s' && backoffs[1] === '2:5s' && exit === 0,
      JSON.stringify({ kills, backoffs, exit }) + '\n' + sup.out.slice(-1200));
  }

  // ---- N10. a malformed argument fails by name; a data exception is terminal ------------------------------------------------------
  currentRow = 'N10';
  {
    const v = await seed('N10 verify naming a run id that is not a uuid', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'verify', authoringRunId: 'run-abc' }) });
    const h = await seed('N10 hold of "30 seconds"', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: '30 seconds' }) });
    const settled = await waitFor(async () => (await seq([v, h], woStatus)).every((x) => x === 'failed' || x === 'done'), 40000);
    const rv = (await runsOf(v)).map((r) => r.status + ':' + r.termination_reason).join(','), rh = (await runsOf(h)).map((r) => r.status + ':' + r.termination_reason).join(',');
    const d = await seed('N10 data exception', { type: 'qa_data' });
    await nodeMod.nodeStart({ runWork: async () => { const e = new Error('invalid input syntax for type uuid: "x"'); e.code = '22P02'; throw e; },
      once: true, leaseSeconds: 30, worktree: async () => ({ path: join(WORK, 'no-worktree'), branch: 'none', recovered: false }), workTypes: ['qa_data'] });
    const rd = (await runsOf(d)).map((r) => r.status + ':' + r.termination_reason).join(',');
    check('N10 a malformed argument fails its run by name (' + rv + ' | ' + rh + ') and a data exception inside a run is terminal (' + rd + '), their work orders failed',
      !!settled && rv === 'failed:factory_acceptance_bad_argument' && rh === 'failed:factory_acceptance_bad_argument' && rd === 'failed:data_exception_22P02'
        && (await woStatus(v)) === 'failed' && (await woStatus(h)) === 'failed' && (await woStatus(d)) === 'failed',
      JSON.stringify({ rv, rh, rd }) + '\n' + w1.out.slice(-800));
  }

  // ---- N13. a run whose lease cannot be renewed stops before the lease lapses ---------------------------------------------------
  currentRow = 'N13';
  {
    const net = await import('node:net');
    let hole = false; const socks = [];
    const relay = net.createServer((c) => {
      c.on('error', () => {}); socks.push(c);
      if (hole) return; // held: nothing is forwarded, the client's connect times out
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {}); socks.push(u);
      c.on('data', (d) => { if (!hole) u.write(d); }); u.on('data', (d) => { if (!hole) c.write(d); });
      c.on('close', () => u.destroy()); u.on('close', () => c.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S5 = join(WORK, 'state-w3');
    const w3 = spawnWorker({ state: S5, role: 'generic', url: relayUrl, extra: { FACTORY_LEASE_SECONDS: '15', FACTORY_PG_CONNECT_TIMEOUT_MS: '3000', FACTORY_PG_QUERY_TIMEOUT_MS: '30000', FACTORY_PG_LOCK_TIMEOUT_MS: '30000', FACTORY_PG_CLOSE_TIMEOUT_MS: '1000' } });
    await waitFor(async () => /\] ready: first claim cycle completed/.test(w3.out), 30000);
    const w3id = idOf(S5);
    const surface = 'qa/nodetruth/n13-shared';
    // THE CLAIM WAITS ON THE CLAIM LOCK FIRST (another claimer holds it): the plane stamps the lease at the claim transaction's BEGIN, and a
    // guard timed from the claim's return let the run overlap its successor by the length of that wait (final verification 3)
    const holder = new pgLib.Client({ connectionString: pg.superUrl }); holder.on('error', () => {});
    await holder.connect(); await holder.query('begin'); await holder.query("select pg_advisory_xact_lock(hashtext('factory.claim'))");
    const a = await seed('N13 held by the cut-off node', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: 60 }), caps: ['factory_acceptance', 'node:' + w3id], surface });
    await sleep(12000);
    await holder.query('rollback'); await holder.end();
    await waitFor(async () => /holding [0-9a-f]{8} for 60 s/.test(w3.out), 30000, 200);
    const runA = (await runsOf(a))[0];
    hole = true; for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    let abortedAt = 0;
    const b = await seed('N13 the same surface, another node', { type: 'qa_n13', surface });
    await registerOther();
    let taken = null, takenAt = 0;
    const until = Date.now() + 40000;
    while (Date.now() < until && !taken) {
      if (!abortedAt && /ABORTED: no lease renewal for \d+ s/.test(w3.out)) abortedAt = Date.now();
      taken = await claim.claimWork({ nodeId: 'node-n13-other', leaseSeconds: 60, onlyWorkOrderId: b });
      if (taken) takenAt = Date.now(); else await sleep(250);
    }
    if (!abortedAt && /ABORTED: no lease renewal for \d+ s/.test(w3.out)) abortedAt = Date.now() + 1; // said only after the takeover
    const runAafter = (await admin.query('select status, node_id from factory.agent_runs where run_id = $1', [runA.run_id])).rows[0];
    hole = false;
    try { w3.kill(); } catch { /* gone */ }
    relay.close(); for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    if (taken) await claim.completeRun({ runId: taken.run_id, nodeId: 'node-n13-other', status: 'done', terminationReason: 'completed' });
    check('N13 a run whose lease cannot be renewed is aborted before the lease lapses (' + (abortedAt ? Math.round((takenAt - abortedAt) / 1000) + ' s before' : 'NOT aborted before') + ' another node took its surface), and the abandoned run keeps the node that ran it (' + (runAafter && runAafter.node_id === w3id ? 'kept' : 'lost') + ')',
      !!taken && abortedAt > 0 && abortedAt < takenAt && runAafter && runAafter.status === 'queued' && runAafter.node_id === w3id && !/completed run/.test(w3.out.split('holding')[1] || ''),
      JSON.stringify({ taken: !!taken, abortedAt, takenAt, runAafter }) + '\n' + w3.out.slice(-900));
  }

  // ---- N21. one failed renewal over a slow link does not abort a healthy run -------------------------------------------------------
  currentRow = 'N21';
  {
    const net = await import('node:net');
    let hole = false; const socks = [];
    const DELAY = 300; // ms each way
    const relay = net.createServer((c) => {
      c.on('error', () => {}); socks.push(c);
      if (hole) return; // held: the client's connect times out
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {}); socks.push(u);
      c.on('data', (d) => setTimeout(() => { if (!u.destroyed) u.write(d); }, DELAY));
      u.on('data', (d) => setTimeout(() => { if (!c.destroyed) c.write(d); }, DELAY));
      c.on('close', () => setTimeout(() => u.destroy(), DELAY)); u.on('close', () => setTimeout(() => c.destroy(), DELAY));
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const slowUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S7 = join(WORK, 'state-slow');
    const w4 = spawnWorker({ state: S7, role: 'generic', url: slowUrl, extra: { FACTORY_LEASE_SECONDS: '30', FACTORY_PG_CONNECT_TIMEOUT_MS: '2000', FACTORY_PG_QUERY_TIMEOUT_MS: '8000' } });
    await waitFor(async () => /\] ready: first claim cycle completed/.test(w4.out), 60000);
    const w4id = idOf(S7);
    const h = await seed('N21 a hold over a slow link', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: 30 }), caps: ['factory_acceptance', 'node:' + w4id] });
    await waitFor(async () => /holding [0-9a-f]{8} for 30 s/.test(w4.out), 60000, 100);
    const t0 = Date.now();
    // the first renewal is due 10 s after the claim: the link is cut from 8 s to 12 s, so exactly that renewal fails
    await sleep(8000); hole = true; await sleep(4000); hole = false;
    const done = await waitFor(async () => (await woStatus(h)) === 'done', 60000, 500);
    const runsH = await runsOf(h);
    try { w4.kill(); } catch { /* gone */ }
    relay.close(); for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    check('N21 over a slow link (300 ms each way) one failed lease renewal does not abort a healthy run: it is retried in seconds and the hold completes (' + (done ? 'done' : 'NOT done') + ', ' + runsH.length + ' run(s), ' + Math.round((Date.now() - t0) / 1000) + ' s)',
      !!done && runsH.length === 1 && runsH[0].status === 'done' && !/ABORTED/.test(w4.out), JSON.stringify(runsH.map((r) => r.status + ':' + r.termination_reason)) + '\n' + w4.out.slice(-900));
  }

  // ---- N25. a renewal that lands after its run completed is not a lost lease -------------------------------------------------------
  // Deterministic, through a relay that reads the worker's statements: the renewal due just before the run ends is HELD until the
  // completion has committed, and the completion's reply is delayed on its way back - so the renewal finds the run done while the
  // worker still waits for its completion, the window in which it was read as a takeover.
  currentRow = 'N25';
  {
    const net = await import('node:net');
    const socks = []; let armed = false; const release = []; const seen = { held: 0, fin: 0 };
    const relay = net.createServer((c) => {
      c.on('error', () => {}); socks.push(c);
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {}); socks.push(u);
      let held = null, down = 0;
      c.on('data', (d) => {
        if (held) { held.push(d); return; }
        const t = d.toString('latin1');
        if (armed && t.includes('with run as (')) {
          armed = false; seen.held++; held = [d];
          release.push(() => { const q = held || []; held = null; for (const x of q) if (!u.destroyed) u.write(x); });
          return;
        }
        if (t.includes('with fin as (')) { seen.fin++; down = 3000; setTimeout(() => { for (const f of release.splice(0)) f(); }, 1000); }
        if (!u.destroyed) u.write(d);
      });
      u.on('data', (d) => { if (down) setTimeout(() => { if (!c.destroyed) c.write(d); }, down); else if (!c.destroyed) c.write(d); });
      c.on('close', () => u.destroy()); u.on('close', () => setTimeout(() => c.destroy(), down));
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S9 = join(WORK, 'state-settle');
    // lease 15 s: renewals every 5 s; the run holds 12 s, so the renewal at 10 s is the one in flight when it ends
    const w6 = spawnWorker({ state: S9, role: 'generic', url: relayUrl, extra: { FACTORY_LEASE_SECONDS: '15' } });
    await waitFor(async () => /\] ready: first claim cycle completed/.test(w6.out), 60000);
    const w6id = idOf(S9);
    const h = await seed('N25 a hold whose last renewal lands after its completion', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: 12 }), caps: ['factory_acceptance', 'node:' + w6id] });
    await waitFor(async () => /holding [0-9a-f]{8} for 12 s/.test(w6.out), 60000, 100);
    await sleep(7500); armed = true;
    const done = await waitFor(async () => (await woStatus(h)) === 'done', 40000, 500);
    await waitFor(async () => /completed run/.test(w6.out), 15000, 300);
    await sleep(2000);
    const runsH = await runsOf(h);
    try { w6.kill(); } catch { /* gone */ }
    relay.close(); for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    const after = w6.out.split(/holding [0-9a-f]{8} for 12 s/)[1] || '';
    check('N25 a lease renewal that lands after its run completed is not a lost lease: the run completes and is not logged LOST or ABORTED (renewal held ' + seen.held + ', completion seen ' + seen.fin + ', ' + (done ? 'done' : 'NOT done') + ')',
      seen.held === 1 && seen.fin >= 1 && !!done && runsH.length === 1 && runsH[0].status === 'done' && /completed run/.test(after) && !/LOST its lease|ABORTED/.test(after),
      JSON.stringify({ seen, runs: runsH.map((r) => r.status + ':' + r.termination_reason) }) + '\n' + after.slice(-900));
  }

  // ---- N26. a checkpoint and a completion are retried through a transient loss, once each ------------------------------------------
  // Deterministic, through a relay that reads the worker's statements: for the checkpoint insert and for the completion, the FIRST attempt
  // is cut before it reaches the plane, the SECOND reaches it and commits but its reply is lost (the connection cut on the way back), the
  // third passes. The retry after the lost reply must find the checkpoint already written (one row) and the run already completed by this
  // node (a completion, not a takeover).
  currentRow = 'N26';
  {
    const net = await import('node:net');
    const socks = []; const seen = { cp: 0, fin: 0 };
    const relay = net.createServer((c) => {
      c.on('error', () => {}); socks.push(c);
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {}); socks.push(u);
      let loseReply = false;
      c.on('data', (d) => {
        const t = d.toString('latin1');
        const kind = t.includes('insert into factory.checkpoints') ? 'cp' : t.includes('with fin as (') ? 'fin' : null;
        if (kind) {
          const n = ++seen[kind];
          if (n === 1) { c.destroy(); u.destroy(); return; }           // never reaches the plane
          if (n === 2) loseReply = true;                                 // reaches it; the reply is lost
        }
        if (!u.destroyed) u.write(d);
      });
      u.on('data', (d) => { if (loseReply) { setTimeout(() => { c.destroy(); u.destroy(); }, 300); return; } if (!c.destroyed) c.write(d); });
      c.on('close', () => u.destroy()); u.on('close', () => c.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S10 = join(WORK, 'state-retry');
    const w7 = spawnWorker({ state: S10, role: 'generic', url: relayUrl });
    await waitFor(async () => /\] ready: first claim cycle completed/.test(w7.out), 60000);
    const w7id = idOf(S10);
    const h = await seed('N26 a hold whose checkpoint and completion meet a transient loss', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: 5 }), caps: ['factory_acceptance', 'node:' + w7id] });
    const done = await waitFor(async () => (await woStatus(h)) === 'done', 90000, 500);
    await waitFor(async () => /completed run|finished AFTER|threw/.test(w7.out), 30000, 300);
    const runsH = await runsOf(h);
    const cps = (await admin.query("select c.scenario, count(*)::int n from factory.checkpoints c join factory.agent_runs r on r.run_id = c.run_id where r.work_order_id = $1 group by c.scenario", [h])).rows;
    try { w7.kill(); } catch { /* gone */ }
    relay.close(); for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    const retriedCp = (w7.out.match(/checkpoint of run [0-9a-f]{8} failed on a transient plane error/g) || []).length;
    const retriedFin = (w7.out.match(/completion of run [0-9a-f]{8} failed on a transient plane error/g) || []).length;
    check('N26 a checkpoint and a completion that meet a transient loss are retried: ' + retriedCp + ' checkpoint and ' + retriedFin + ' completion retries, ' + JSON.stringify(cps) + ' checkpoint row(s), ' + runsH.length + ' run(s) ' + runsH.map((r) => r.status).join(',') + (done ? ', done' : ', NOT done'),
      seen.cp >= 3 && seen.fin >= 3 && retriedCp === 2 && retriedFin === 2 && !!done && runsH.length === 1 && runsH[0].status === 'done'
        && cps.length === 1 && cps[0].scenario === 'wave' && cps[0].n === 1
        && /an earlier attempt of its completion had landed/.test(w7.out) && /completed run/.test(w7.out) && !/threw|finished AFTER its lease/.test(w7.out),
      JSON.stringify({ seen, cps, runs: runsH.map((r) => r.status + ':' + r.termination_reason) }) + '\n' + w7.out.slice(-1400));
  }

  // ---- N27. the scheduling instrument passes whichever wave starts first --------------------------------------------------------
  currentRow = 'N27';
  {
    const tms = join(ROOT, 'qa/factory/two_machine_scheduling.mjs');
    const envOf = (extra) => ({ ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: join(WORK, 'state-tms'), FACTORY_ADMISSION: 'off', ...extra });
    const seeded = spawnSync(process.execPath, [tms, 'seed'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: envOf({}) });
    const stamp = (String(seeded.stdout).match(/STAMP (\S+)/) || [])[1];
    const wave = (id, role) => new Promise((r) => { const c = spawn(process.execPath, [tms, 'wave', stamp], { cwd: ROOT, env: envOf({ FACTORY_NODE_ID: id, FACTORY_NODE_ROLE: role }), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, 240000); c.on('exit', (code) => { clearTimeout(t); r({ code, out: o }); }); procs.push(c); });
    let vr = { code: 'no stamp', out: String(seeded.stdout || '') + String(seeded.stderr || '') }, gr = vr, verified = vr;
    if (stamp) {
      // the verifier's wave first, the generic one 3 s later: the verifier takes the first conflict work order
      const vp = wave('node-n27-verifier', 'verifier'); await sleep(3000); const gp = wave('node-n27-generic', 'generic');
      [vr, gr] = await Promise.all([vp, gp]);
      verified = spawnSync(process.execPath, [tms, 'verify', stamp], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: envOf({}) });
      verified = { code: verified.status, out: String(verified.stdout || '') + String(verified.stderr || '') };
    }
    check('N27 the scheduling instrument passes with the verifier\'s wave started first (verify exit ' + verified.code + ', ' + ((verified.out.match(/VERDICT: [A-Z ]+/) || ['no verdict'])[0]).trim() + ')',
      !!stamp && verified.code === 3 && /VERDICT: SAME MACHINE/.test(verified.out) && !/^FAIL /m.test(verified.out) && /verification: [0-9a-f]{8}-/.test(vr.out),
      verified.out.slice(-700) + '\n--- verifier wave\n' + vr.out.slice(-500) + '\n--- generic wave\n' + gr.out.slice(-300));
  }

  // ---- N28. an earlier worker's claiming records are gone once the next worker holds its lock ------------------------------------
  currentRow = 'N28';
  {
    const S11 = join(WORK, 'state-stale'); mkdirSync(S11, { recursive: true });
    writeFileSync(join(S11, 'node-id'), 'node-n28-' + randomUUID().slice(0, 8));
    writeFileSync(join(S11, 'node-admission.json'), JSON.stringify({ admit: false, reason: 'qa: an earlier worker was refused', at: new Date().toISOString() }));
    writeFileSync(join(S11, 'node-claim-busy.json'), JSON.stringify({ since: new Date().toISOString(), at: new Date().toISOString() }));
    const net = await import('node:net');
    const dead = await new Promise((r) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => r(p)); }); });
    const deadUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + dead + '/');
    // a worker that cannot reach the plane: it holds its lock and retries its registration, and never reaches a claim cycle
    const w8 = spawnWorker({ state: S11, role: 'generic', url: deadUrl });
    await waitFor(async () => /failed on a transient plane error/.test(w8.out), 30000, 300);
    const st = statusOf(S11);
    try { w8.kill(); } catch { /* gone */ }
    check('N28 an earlier worker\'s admission refusal and busy-claim-lock records are gone once the next worker holds its lock, though it never reached a claim cycle (status: ' + (/NOT CLAIMING/.test(st) ? 'NOT CLAIMING repeated' : 'no stale verdict') + ')',
      /failed on a transient plane error/.test(w8.out) && !/NOT CLAIMING/.test(st) && !existsSync(join(S11, 'node-admission.json')) && !existsSync(join(S11, 'node-claim-busy.json')),
      st.slice(-500) + '\n' + w8.out.slice(-400));
  }

  // ---- N29. a claim whose reply was lost is given back at once ------------------------------------------------------------------
  // Deterministic, through a relay that reads the worker's statements: on the connection that inserted a run, the reply to its COMMIT is
  // dropped (the server has committed) and the connection cut - the worker retries its claim as a transient error.
  currentRow = 'N29';
  {
    const net = await import('node:net');
    const COMMIT_Q = Buffer.concat([Buffer.from('Q'), Buffer.from([0, 0, 0, 11]), Buffer.from('commit\0', 'latin1')]);
    const socks = []; const seen = { dropped: 0 };
    const relay = net.createServer((c) => {
      c.on('error', () => {}); socks.push(c);
      const u = net.connect(pg.port, '127.0.0.1'); u.on('error', () => {}); socks.push(u);
      let inserted = false, loseReply = false;
      c.on('data', (d) => {
        if (d.toString('latin1').includes('insert into factory.agent_runs')) inserted = true;
        if (inserted && !seen.dropped && d.includes(COMMIT_Q)) { seen.dropped++; loseReply = true; }
        if (!u.destroyed) u.write(d);
      });
      u.on('data', (d) => { if (loseReply) { setTimeout(() => { c.destroy(); u.destroy(); }, 300); return; } if (!c.destroyed) c.write(d); });
      c.on('close', () => u.destroy()); u.on('close', () => c.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const S12 = join(WORK, 'state-orphan');
    const w9 = spawnWorker({ state: S12, role: 'generic', url: relayUrl, extra: { FACTORY_LEASE_SECONDS: '90' } });
    await waitFor(async () => /\] ready: first claim cycle completed/.test(w9.out), 60000);
    const w9id = idOf(S12);
    const h = await seed('N29 a claim whose reply is lost', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'hold', seconds: 2 }), caps: ['factory_acceptance', 'node:' + w9id] });
    const t0 = Date.now();
    const done = await waitFor(async () => (await woStatus(h)) === 'done', 60000, 500);
    const took = Math.round((Date.now() - t0) / 1000);
    const runsH = await runsOf(h);
    try { w9.kill(); } catch { /* gone */ }
    relay.close(); for (const x of socks) { try { x.destroy(); } catch { /* gone */ } }
    check('N29 a claim that committed but whose reply was lost is given back at once and the work is done in ' + took + ' s (lease 90 s): runs ' + runsH.map((r) => r.status).join(',') + (seen.dropped ? '' : ' - NO COMMIT REPLY WAS DROPPED'),
      seen.dropped === 1 && !!done && took < 45 && runsH.length === 2 && runsH.filter((r) => r.status === 'done').length === 1 && runsH.every((r) => r.node_id === w9id)
        && /gave back the lease of run [0-9a-f]{8}: a claim of this node committed but its reply was lost/.test(w9.out),
      JSON.stringify({ seen, runs: runsH.map((r) => r.status + ':' + r.termination_reason) }) + '\n' + w9.out.slice(-900));
  }

  // ---- N22. an admission-only cycle is not a claim cycle ------------------------------------------------------------------------
  currentRow = 'N22';
  {
    const S8 = join(WORK, 'state-refused');
    const w5 = spawnWorker({ state: S8, role: 'verifier', extra: { FACTORY_ADMISSION: '', FACTORY_MIN_FREE_MB: '99999999' } });
    await waitFor(async () => /admission REFUSED/.test(w5.out), 30000, 200);
    await sleep(6000);
    const st = statusOf(S8);
    try { w5.kill(); } catch { /* gone */ }
    check('N22 a worker whose admission refuses every cycle never declares itself ready and never reads ALIVE (' + (st.match(/^(ALIVE|STALE)[^\n]*/m) || ['?'])[0].slice(0, 70) + ')',
      /admission REFUSED/.test(w5.out) && !/ready: first claim cycle completed/.test(w5.out) && /"neverBeaten":true/.test(st) && !/"state":"ALIVE"/.test(st) && /NOT CLAIMING: admission refused/.test(st),
      st.slice(-300) + '\n' + w5.out.slice(-500));
  }

  // ---- N12. only a finished, successful run can be verified ---------------------------------------------------------------------
  currentRow = 'N12';
  {
    await claim.registerNode({ nodeId: 'node-author-n12', capabilities: [], securityRole: 'generic', platform: 'test other-host' });
    const authored = async (status, reason) => {
      const w = await seed('N12 authored ' + status, { type: 'qa_none' });
      const r = (await admin.query("insert into factory.agent_runs (work_order_id, node_id, status, termination_reason, authoring_node_id, started_at, finished_at) values ($1, 'node-author-n12', $2, $3, 'node-author-n12', now(), now()) returning run_id", [w, status, reason])).rows[0].run_id;
      await admin.query('update factory.agent_runs set authoring_run_id = run_id where run_id = $1', [r]);
      return r;
    };
    const failedRun = await authored('failed', 'qa_failed_on_purpose'), doneRun = await authored('done', 'completed');
    const vf = await seed('N12 verify a failed run', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'verify', authoringRunId: failedRun }) });
    const vd = await seed('N12 verify a done run', { type: 'factory_acceptance', handoff: JSON.stringify({ action: 'verify', authoringRunId: doneRun }) });
    const settled = await waitFor(async () => (await seq([vf, vd], woStatus)).every((x) => x === 'failed' || x === 'done'), 40000);
    const rf = (await runsOf(vf)).map((r) => r.status + ':' + r.termination_reason).join(','), rdn = (await runsOf(vd)).map((r) => r.status + ':' + r.termination_reason).join(',');
    const colsF = (await admin.query('select verification_run_id, verification_node_id from factory.agent_runs where run_id = $1', [failedRun])).rows[0];
    const colsD = (await admin.query('select verification_run_id, verification_node_id from factory.agent_runs where run_id = $1', [doneRun])).rows[0];
    check('N12 only a finished, successful run can be verified: a verify of a FAILED run is refused by name (' + rf + ') and writes nothing on it; a done run authored elsewhere is verified (' + rdn + ')',
      !!settled && rf === 'failed:verification_refused' && colsF.verification_run_id === null && colsF.verification_node_id === null
        && rdn === 'done:completed_with_verdict' && colsD.verification_node_id === w1id && /authoring run is failed, not done/.test(w1.out),
      JSON.stringify({ rf, rdn, colsF, colsD }) + '\n' + w1.out.slice(-800));
  }

  // ---- N19. a running worker whose record was deleted is ALIVE again at once ----------------------------------------------------
  currentRow = 'N19';
  {
    await admin.query('delete from factory.nodes where node_id = $1', [w1id]);
    const back = await waitFor(async () => (await admin.query('select 1 from factory.nodes where node_id = $1', [w1id])).rows.length === 1, 20000, 200);
    await sleep(1500);
    const st = statusOf(S1);
    check('N19 a running worker whose node record was deleted registers again and reads ALIVE at once (' + (st.match(/^(ALIVE|STALE)[^\n]*/m) || ['?'])[0].slice(0, 70) + ')',
      !!back && /"state":"ALIVE"/.test(st) && !/"neverBeaten":true/.test(st) && /registered again as verifier/.test(w1.out), st.slice(-300) + '\n' + w1.out.slice(-400));
  }

  // ---- N23. a script beside the worker leaves its record alone; an overwritten record is restored whole ---------------------------
  currentRow = 'N23';
  {
    const capsOf = async () => (await admin.query('select capabilities from factory.nodes where node_id = $1', [w1id])).rows[0].capabilities || [];
    const before = await capsOf();
    const seedRun = spawnSync(process.execPath, [join(ROOT, 'qa/factory/two_machine_scheduling.mjs'), 'seed'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S1, FACTORY_NODE_ROLE: 'verifier' } });
    const afterSeed = await capsOf();
    // this seed's own harness node (the script's id for this state dir) - other rows seed through the script too
    const harnessNode = (await admin.query('select node_id from factory.nodes where node_id = $1', ['node-tms-' + w1id.slice(5, 17)])).rows.map((r) => r.node_id);
    // ...and overwritten anyway (an older checkout's script, a hand-written update): the worker restores it on its next beat
    await admin.query("update factory.nodes set capabilities = '[\"two-machine-scheduling\"]'::jsonb, agent_version = 'v0' where node_id = $1", [w1id]);
    const restored = await waitFor(async () => { const c = await capsOf(); return c.includes('head:' + HEAD) && c.includes('handler:factory-acceptance/2') && c.includes('factory_acceptance'); }, 15000, 300);
    const said = await waitFor(async () => /the plane held a different registration for this node/.test(w1.out), 5000, 200);
    check('N23 a runbook script beside the worker leaves its record alone (seed exit ' + seedRun.status + ', the script registered ' + (harnessNode[0] || 'nothing') + '), and an overwritten record is restored whole by the next beat, and said',
      seedRun.status === 0 && JSON.stringify(afterSeed) === JSON.stringify(before) && harnessNode.length === 1 && !!restored && !!said,
      JSON.stringify({ before, afterSeed, harnessNode }) + '\n' + String(seedRun.stdout).slice(-300) + '\n' + w1.out.slice(-500));
  }

  // ---- N20. the composer's plane rows count only evidence at the commit under acceptance -----------------------------------------
  currentRow = 'N20';
  {
    const pg2 = await startLocalPg();
    const a2 = new pgLib.Client({ connectionString: pg2.superUrl }); await a2.connect();
    try {
      for (const f of ['001_factory_control_plane.sql', '002_director_state_machine.sql', '003_resource_governance.sql']) await a2.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
      await a2.query('grant usage on schema factory to ' + pg2.runnerRole);
      await a2.query('grant select, insert, update, delete on all tables in schema factory to ' + pg2.runnerRole);
      const X = 'a'.repeat(40), Y = 'b'.repeat(40);
      const node = (id, host, head, dirty) => a2.query("insert into factory.nodes (node_id, capabilities, security_role, platform, agent_version, last_heartbeat_at) values ($1, $2::jsonb, 'generic', $3, 'v', now())", [id, JSON.stringify(['factory_acceptance', 'head:' + head, ...(dirty ? ['dirty'] : [])]), 'win32 ' + host]);
      await node('nA', 'HOST-A', X); await node('nB', 'HOST-B', X); await node('nC', 'HOST-C', Y); await node('nD', 'HOST-D', X, true);
      const wo2 = async () => { const id = randomUUID(); await a2.query("insert into factory.work_orders (work_order_id, title, status) values ($1, 'N20', 'done')", [id]); return id; };
      const runOf = async (nodeId, status, base) => { const w = await wo2(); const r = (await a2.query("insert into factory.agent_runs (work_order_id, node_id, status, termination_reason, authoring_node_id, base_commit, started_at, finished_at) values ($1, $2, $3, case when $3 in ('done','failed') then 'completed' end, $2, $4, now(), case when $3 = 'done' then now() end) returning run_id", [w, nodeId, status, base])).rows[0].run_id; await a2.query('update factory.agent_runs set authoring_run_id = run_id where run_id = $1', [r]); return { r, w }; };
      // row 3: done runs at X come from HOST-A and HOST-B (below); HOST-C's only done run is another commit, HOST-D's only one is dirty
      const rA = await runOf('nA', 'done', X); await runOf('nD', 'done', X + '+dirty'); await runOf('nC', 'done', Y);
      // row 4: one verification counts (verifying run done, both at X); one whose verifying run is still in progress does not
      const vDone = await runOf('nB', 'in_progress', X); await a2.query("update factory.agent_runs set status = 'done', termination_reason = 'completed_with_verdict', finished_at = now() where run_id = $1", [vDone.r]);
      await a2.query('update factory.agent_runs set verification_run_id = $2, verification_node_id = $3 where run_id = $1', [rA.r, vDone.r, 'nB']);
      const rA2 = await runOf('nA', 'done', X); const vLive = await runOf('nB', 'in_progress', X);
      await a2.query('update factory.agent_runs set verification_run_id = $2, verification_node_id = $3 where run_id = $1', [rA2.r, vLive.r, 'nB']);
      // row 2: one failover pair at X (A>B); one whose takeover ran dirty (B>A) does not count
      const cp = async (w, r, scenario, host, head) => a2.query("insert into factory.checkpoints (run_id, work_order_id, location, scenario, payload) values ($1, $2, 'x', $3, $4::jsonb)", [r, w, scenario, JSON.stringify({ hostname: host, head })]);
      const f1 = await runOf('nA', 'done', X); await cp(f1.w, f1.r, 'phase-1-hold', 'HOST-A', X); await cp(f1.w, f1.r, 'phase-2-takeover', 'HOST-B', X);
      const f2 = await runOf('nB', 'done', X); await cp(f2.w, f2.r, 'phase-1-hold', 'HOST-B', X); await cp(f2.w, f2.r, 'phase-2-takeover', 'HOST-A', X + '+dirty');
      const comp = spawnSync(process.execPath, [join(ROOT, 'qa/factory/factory_v1_acceptance.mjs'), '--plane-only', '--sha', X], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg2.runnerUrl } });
      const out = comp.stdout || '';
      const r1 = /\[1\] machines registered on the shared plane in 7 days running a{12}: (.*)/.exec(out), r2 = /\[2\] real two-machine failover recorded on the plane by nodes running a{12}: (.*)/.exec(out);
      const r3 = /\[3\] completed runs at a{12} from (\d+) distinct machine/.exec(out), r4 = /\[4\] verifications of done runs .* running a{12}: (\d+)/.exec(out);
      check('N20 the composer counts only evidence at the commit under acceptance: machines ' + (r1 ? r1[1].trim() : '?') + ', failovers ' + (r2 ? r2[1].trim() || 'none' : '?') + ', done runs from ' + (r3 ? r3[1] : '?') + ' machine(s), ' + (r4 ? r4[1] : '?') + ' completed verification(s)',
        !!r1 && r1[1].trim().split(/,\s*/).sort().join(',') === 'HOST-A,HOST-B' && !!r2 && r2[1].trim() === 'HOST-A>HOST-B' && !!r3 && r3[1] === '2' && !!r4 && r4[1] === '1',
        out.split('\n').filter((l) => /\[[1-4]\]/.test(l)).join('\n'));
    } finally { try { await a2.end(); } catch { /* ignore */ } await pg2.stop(); }
  }

  // ---- N8. a worker that reaches the plane but fails every claim backs off and never reads ALIVE (last: it revokes a grant) ------
  currentRow = 'N8';
  {
    try { w1.kill(); } catch { /* gone */ }
    await admin.query('revoke select on factory.work_order_dependencies from ' + pg.runnerRole);
    const S4 = join(WORK, 'state-sup-bad'); const L4 = join(WORK, 'logs-sup-bad');
    const env4 = { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: S4, FACTORY_NODE_BEAT_MS: '2000', FACTORY_ADMISSION: 'off' };
    const sup = spawn(process.execPath, [SUP, '--runner-env', envFile, '--role', 'verifier', '--log-dir', L4], { cwd: ROOT, env: env4, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    sup.out = ''; sup.stdout.on('data', (d) => { sup.out += d; }); sup.stderr.on('data', (d) => { sup.out += d; }); procs.push(sup);
    await waitFor(async () => /restart 2 in \d+ s/.test(sup.out), 60000);
    const backoffs = [...sup.out.matchAll(/restart (\d+) in (\d+) s/g)].map((m) => m[1] + ':' + m[2] + 's');
    const st = statusOf(S4);
    // ...and health does not say "can claim work" for it (it did, while the supervisor sat in backoff)
    await waitFor(async () => { try { return JSON.parse(readFileSync(join(S4, 'node-status.json'), 'utf8')).state === 'backoff'; } catch { return false; } }, 30000, 300);
    const h8 = spawnSync(process.execPath, [NODE, 'health'], { cwd: ROOT, encoding: 'utf8', timeout: 90000, env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl, FACTORY_STATE_DIR: S4, FACTORY_NODE_ROLE: '' } });
    const h8out = String(h8.stdout || '');
    spawn(process.execPath, [SUP, '--stop'], { cwd: ROOT, env: env4, stdio: 'ignore', windowsHide: true });
    const exit = await new Promise((r) => { if (sup.exitCode !== null) return r(sup.exitCode); const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    await admin.query('grant select on factory.work_order_dependencies to ' + pg.runnerRole);
    // the worker's own words are in the supervisor's log file (its stdout carries only the supervisor's lines)
    const logs4 = (() => { try { return readdirSync(L4).map((f) => readFileSync(join(L4, f), 'utf8')).join('\n'); } catch { return ''; } })();
    check('N8 a worker that reaches the plane but fails every claim is backed off with growing delays (' + backoffs.join(', ') + ') and never reads ALIVE (' + (st.match(/^(ALIVE|STALE)[^\n]*/m) || ['?'])[0].slice(0, 90) + ')',
      backoffs[0] === '1:5s' && backoffs[1] === '2:10s' && /"neverBeaten":true/.test(st) && !/"state":"ALIVE"/.test(st) && /permission denied/.test(logs4) && exit === 0
        && /NO WORKER CLAIMS: it is backoff/.test(h8out) && !/this node can claim work/.test(h8out),
      JSON.stringify({ backoffs, exit }) + '\n' + st.slice(-400) + '\n' + sup.out.slice(-800));
  }
} catch (e) {
  check(currentRow + ' crashed: ' + String(e && e.message || e).slice(0, 160), false, String(e && e.stack || '').slice(0, 800));
} finally {
  for (const p of procs) { try { if (p.exitCode === null) p.kill(); } catch { /* gone */ } }
  await sleep(500);
  try { await admin.end(); } catch { /* ignore */ }
  await pg.stop();
  try { rmSync(WORK, { recursive: true, force: true }); } catch { /* windows lock */ }
}

console.log('');
console.log('node_truth_acceptance: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
process.exit(0);
