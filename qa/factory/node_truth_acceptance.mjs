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
//   N7 the supervisor's backoff resets once a worker has reached the plane: a worker that registered and then died is restarted
//      in 5 s every time (short losses used to walk the backoff up to 5 minutes)
import { startLocalPg } from './local_pg.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

const procs = [];
// A real worker process: `node.mjs start` exactly as a supervisor runs it (the URL in its environment only, never an argument).
const spawnWorker = ({ state, role, url = pg.runnerUrl, extra = {} }) => {
  const env = { ...process.env, FACTORY_RUNNER_PG_URL: url, FACTORY_STATE_DIR: state, FACTORY_NODE_ROLE: role, FACTORY_NODE_BEAT_MS: '2000', FACTORY_NODE_STALE_MS: '8000', FACTORY_ADMISSION: 'off', ...extra };
  const c = spawn(process.execPath, [NODE, 'start'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  c.out = ''; c.stdout.on('data', (d) => { c.out += d; }); c.stderr.on('data', (d) => { c.out += d; });
  procs.push(c); return c;
};
const idOf = (state) => { try { return readFileSync(join(state, 'node-id'), 'utf8').trim(); } catch { return null; } };

try {
  // ---- N1. a health check keeps the role the plane holds ---------------------------------------------------------------------
  {
    const me = nodeMod.nodeId();
    await claim.registerNode({ nodeId: me, capabilities: [], securityRole: 'verifier', platform: 'test' });
    const h1 = await capture(() => nodeMod.health());
    const afterHealth = await roleOf(me);
    process.env.FACTORY_NODE_ROLE = 'generic'; // a variable left in some shell: said, not written
    const h2 = await capture(() => nodeMod.health());
    delete process.env.FACTORY_NODE_ROLE;
    const afterStated = await roleOf(me);
    const ph = await capture(() => planeHealthMod.planeHealth({}));
    const afterPlane = await roleOf(me);
    const phRow = (ph.v && ph.v.rows || []).find((r) => /registered on the plane as/.test(r.label)) || {};
    check('N1 the health checks from a plain shell keep the role the plane holds (health: ' + afterHealth + ', with a stale FACTORY_NODE_ROLE=generic: ' + afterStated + ', plane-health: ' + afterPlane + ')',
      h1.v.ok && afterHealth === 'verifier' && /role verifier kept as the plane holds it/.test(h1.out) && afterStated === 'verifier' && /FACTORY_NODE_ROLE here says generic but the plane holds verifier/.test(h2.out)
        && afterPlane === 'verifier' && /registered on the plane as verifier .*kept/.test(phRow.label || ''),
      JSON.stringify({ afterHealth, afterStated, afterPlane, ph: phRow.label }) + '\n' + h1.out.split('\n').filter((l) => /regist|FAIL/.test(l)).join('\n') + '\n' + h2.out.split('\n').filter((l) => /regist|note FACTORY/.test(l)).join('\n'));
  }

  // ---- N2. a running worker re-asserts its role -------------------------------------------------------------------------------
  const S1 = join(WORK, 'state-w1');
  const w1 = spawnWorker({ state: S1, role: 'verifier' });
  const w1Up = await waitFor(async () => /\] registered; capabilities /.test(w1.out), 30000);
  const w1id = idOf(S1);
  {
    await admin.query("update factory.nodes set security_role = 'generic' where node_id = $1", [w1id]);
    const t0 = Date.now();
    const back = await waitFor(async () => (await roleOf(w1id)) === 'verifier', 15000, 300);
    const ms = Date.now() - t0;
    check('N2 a running worker re-asserts its role on its beat: demoted to generic on the plane, verifier again in ' + ms + ' ms, and said',
      !!w1Up && !!back && /the plane held role generic for this node - re-asserted verifier/.test(w1.out), w1.out.slice(-1200));
  }

  // ---- N3. the acceptance handler completes only what it carried out ----------------------------------------------------------
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

  // ---- N4. a failed run fails its work order, atomically ----------------------------------------------------------------------
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

  // ---- N7. the supervisor's backoff resets once a worker reached the plane -----------------------------------------------------
  {
    const S3 = join(WORK, 'state-sup'); const L3 = join(WORK, 'logs-sup');
    const envFile = join(WORK, 'runner.env'); writeFileSync(envFile, 'FACTORY_RUNNER_PG_URL=' + pg.runnerUrl + '\n');
    const env = { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: S3, FACTORY_NODE_BEAT_MS: '2000', FACTORY_ADMISSION: 'off' };
    const sup = spawn(process.execPath, [SUP, '--runner-env', envFile, '--role', 'generic', '--log-dir', L3], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    sup.out = ''; sup.stdout.on('data', (d) => { sup.out += d; }); sup.stderr.on('data', (d) => { sup.out += d; }); procs.push(sup);
    const status = () => { try { return JSON.parse(readFileSync(join(S3, 'node-status.json'), 'utf8')); } catch { return {}; } };
    const kills = [];
    for (let k = 0; k < 2; k++) {
      const st = await waitFor(async () => { const s = status(); return s.state === 'running' && s.childPid && s.registeredAt ? s : null; }, 40000);
      if (!st) break;
      kills.push(st.childPid);
      try { process.kill(st.childPid); } catch { /* raced */ }
      await waitFor(async () => new RegExp('restart ' + (k + 1) + ' in \\d+ s').test(sup.out), 15000);
    }
    const backoffs = [...sup.out.matchAll(/restart (\d+) in (\d+) s/g)].map((m) => m[1] + ':' + m[2] + 's');
    spawn(process.execPath, [SUP, '--stop'], { cwd: ROOT, env, stdio: 'ignore', windowsHide: true });
    const exit = await new Promise((r) => { if (sup.exitCode !== null) return r(sup.exitCode); const t = setTimeout(() => r('timeout'), 25000); sup.on('exit', (c) => { clearTimeout(t); r(c); }); });
    check('N7 the supervisor\'s backoff resets once a worker reached the plane: two workers killed after registering were restarted after ' + backoffs.join(', ') + ' (not 5 s then 10 s), and --stop ends it (exit ' + exit + ')',
      kills.length === 2 && backoffs.length >= 2 && backoffs[0] === '1:5s' && backoffs[1] === '2:5s' && exit === 0,
      JSON.stringify({ kills, backoffs, exit }) + '\n' + sup.out.slice(-1200));
  }
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
