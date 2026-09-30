#!/usr/bin/env node
// AC-9 r3 - THE LEGACY DIRECTOR AND director_lease (contract §1: "factory.director_lease is the 69df2f52 dispatcher's process lease ...
// One legacy director dispatches legacy work at a time, as at 69df2f52, and new-model dispatch never waits on the legacy director's
// lease. Any legacy write leaves new-model dispatcher state unchanged, without failing the legacy director's transaction"; WO-1 legacy
// coexistence). Developer verification on a disposable migrated plane; the independent verifier runs its own.
//
// The FROZEN 69df2f52 director (scripts/factory-runner/director-start.mjs and director.mjs, byte-identical to 69df2f52) runs as a child
// process on the plane's legacy role factory_runner, as the legacy fleet runs it, while enrolled nodes work through the front doors:
//   LD0 the frozen director really runs here: its bytes are 69df2f52's, and its first ticks record a legacy work order (the positive
//       control) under its own node id
//   LD1 HOLD - while a legacy director holds director_lease (fresh), a new-model work order that requires verification is claimed,
//       its lease lapses, it is taken over from its checkpoint and completed, and it is sent to verification - with no admin or founder
//       action (no founder keystroke)
//   LD2 a second legacy director started during the hold never dispatches: it logs that another director holds the lease on every
//       iteration and records nothing; the lease still names the first
//   LD3 LAPSE - the first director is killed (its lease is left behind, never released) and the lease lapses: the same sequence holds
//   LD4 RELEASE - a third director takes the lapsed lease over, ticks, stops cleanly and releases it (director_lease empty): the same
//       sequence holds
//   LD5 no legacy lease statement raises: no director log shows an error, and the frozen acquireLease / releaseLease resolve on an
//       absent row, an own row, a lapsed foreign row and a release
//   LD6 no new-model dispatcher state changes under the legacy role: every new-model work order (the three sequences', their
//       verification work orders and an idle queued one) keeps its dispatcher columns as created, though the directors' logs show they
//       visited them; no founder notification names a new-model work order; no run, checkpoint or lock of new-model work lost its
//       principal; and the legacy work order was dispatched (non-vacuous)
//   LD7 new-model dispatch never waits on the legacy lease: while a factory_runner session holds (a) a row lock on director_lease and
//       (b) an ACCESS EXCLUSIVE lock on it, claim, checkpoint, renew, complete and verification-claim of new-model work each answer ok
//       in under 3 s (the front doors' lock_timeout is 15 s); the verification claim is C's (in no sequence's authoring set) and must
//       CLAIM one of the pending verification work orders, so the dispatch path after a pick runs while the lock is held
// usage: node qa/factory/v1/legacy_director_acceptance.mjs [--transport direct|api] [--evidence <file>]
// Touches nothing but a scratch PostgreSQL it starts and removes, and child processes it starts and stops (S-15: the director runs
// with FACTORY_RUNNER_ENV_FILE naming an absent path and FACTORY_RUNNER_PG_URL naming the scratch plane only).
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, BASELINE, startV1Plane, connect } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { asEngine, enrolledComputer, newModelWorkOrder, publishedRelease, legacyWorkOrder } from './fixtures.mjs';
import { directNode } from './nodeclient.mjs';
import { isolatedSuiteEnv } from './isolation.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const TRANSPORT = arg('--transport', 'direct');
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RES = (ram) => ({ cpu_cores: 8, cpu_pct: 10, ram_free_mb: ram, disk_free_mb: 50000 });
const FROZEN = ['scripts/factory-runner/director.mjs', 'scripts/factory-runner/director-start.mjs', 'scripts/factory-runner/db.mjs',
  'scripts/factory-runner/runner-env.mjs', 'scripts/factory-runner/handlers/acceptance-echo.mjs', 'scripts/factory-runner/handlers/verifier-round.mjs'];
const DISPATCHER_COLS = ['director_state', 'director_node_id', 'next_action', 'blocked_reason', 'last_evidence', 'last_evidence_at', 'director_state_at', 'retry_count', 'handler'];
const ERRORISH = /fatal|unhandled rejection|42501|factory_legacy_refused|SQLSTATE|\berror\b|refused/i;

const ISO = isolatedSuiteEnv();
const plane = await startV1Plane({ baselineRows: false });
let sup, api = null, run = null;
const nodes = [], directors = [];
/** a frozen director as the legacy fleet starts it: its own process, on factory_runner */
function director(nodeId, { intervalMs, maxIterations, leaseSeconds }) {
  const lines = [];
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'factory-runner', 'director-start.mjs'), '--node-id', nodeId, '--interval-ms', String(intervalMs),
    '--max-iterations', String(maxIterations), '--lease-seconds', String(leaseSeconds)],
  { cwd: ROOT, windowsHide: true, env: { ...ISO.env, FACTORY_RUNNER_PG_URL: plane.runnerUrl, FACTORY_ADMISSION: 'off' } });
  for (const s of [child.stdout, child.stderr]) { s.setEncoding('utf8'); let buf = ''; s.on('data', (d) => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); lines.push(...parts); }); }
  const exited = new Promise((ok) => child.on('exit', (code, signal) => ok({ code, signal })));
  const d = { nodeId, child, lines, exited, async kill() { if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true }); else child.kill('SIGKILL'); return exited; } };
  directors.push(d);
  return d;
}
const waitFor = async (fn, ms, step = 250) => { const until = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > until) return v; await sleep(step); } };
const within = (p, ms) => Promise.race([p, sleep(ms).then(() => 'timeout')]);
try {
  sup = await connect(plane.superUrl);
  run = await connect(plane.runnerUrl);
  const rel = await publishedRelease(sup);
  const A = await enrolledComputer(sup, { name: 'LD-A', roles: ['generic', 'verifier'] });
  const B = await enrolledComputer(sup, { name: 'LD-B', roles: ['generic', 'verifier'] });
  const C = await enrolledComputer(sup, { name: 'LD-C', roles: ['generic', 'verifier'] });
  const mk = async (ident) => {
    if (TRANSPORT === 'api') {
      if (!api) api = await (await import('./api_harness.mjs')).startApi(plane);
      const { apiNode } = await import('./nodeclient.mjs');
      return apiNode(api.baseUrl, ident);
    }
    const n = await directNode(plane.nodeApiUrl, ident); nodes.push(n); return n;
  };
  const a = await mk(A), b = await mk(B), c = await mk(C);
  let k = 0;
  for (const [n, x] of [[a, A], [b, B], [c, C]]) {
    await n.session();
    await n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
    await n.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest, fingerprint: String(++k).repeat(64), hostname: 'ld-' + x.nodeId.slice(5, 9), os: 'test' });
    await n.op('heartbeat', { phase: 'RECOVERING', resources: RES(8000) });
    await n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(8000) });
  }
  const dispatcher = async (id) => (await sup.query(`select ${DISPATCHER_COLS.map((x) => 'w.' + x).join(', ')} from factory.work_orders w where w.work_order_id = $1`, [id])).rows[0];
  const created = new Map();   // new-model work order -> its dispatcher columns when it was created
  const lease = async () => (await sup.query(`select node_id, extract(epoch from (now() - heartbeat_at))::float age, lease_seconds from factory.director_lease`)).rows;
  // the frozen bytes
  const git = (...x) => spawnSync('git', ['-C', ROOT, ...x], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  const frozenOk = FROZEN.every((f) => git('rev-parse', BASELINE + ':' + f) === git('hash-object', f) && git('hash-object', f) !== '');
  // fixtures: a legacy work order (the positive control) and an idle queued new-model work order
  const LW = await legacyWorkOrder(run, { title: 'LD legacy work (the positive control)' });
  const Q = await newModelWorkOrder(sup, { surface: ['ld/idle'], priority: 1, title: 'LD idle new-model work', requiresVerification: false });
  created.set(Q, await dispatcher(Q));

  /** the §6 sequence on a fresh new-model work order that requires verification, with no admin or founder action */
  async function sequence(label) {
    const t0 = (await sup.query('select clock_timestamp() t')).rows[0].t;
    const Wx = await newModelWorkOrder(sup, { surface: ['ld/' + label], priority: 60, title: 'LD ' + label });
    created.set(Wx, await dispatcher(Wx));
    await a.op('heartbeat', { phase: 'AVAILABLE' });
    const ca = await a.op('claim', { only_work_order_id: Wx, lease_seconds: 5, resources: RES(16000) });
    const p1 = randomUUID();
    const cp = ca.claimed ? await a.op('checkpoint', { run_id: ca.claimed.run_id, checkpoint_id: p1, location: 'git://ld-' + label + '@1', scenario: 's1', payload: { done: ['s1'] } }) : {};
    await sleep(6500);   // a REAL lease expiry: nobody touches the lease
    await b.op('heartbeat', { phase: 'AVAILABLE' });
    const cb = await b.op('claim', { only_work_order_id: Wx, lease_seconds: 60, resources: RES(12000) });
    const done = cb.claimed ? await b.op('complete', { run_id: cb.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: 'c'.repeat(40), candidate_tree: 'd'.repeat(40), summary: 'LD ' + label }) : {};
    const s = (await sup.query(`select w.verification_state vs, (select count(*)::int from factory.work_orders v where v.verifies_work_order_id = w.work_order_id) vwos,
        (select array_agg(v.work_order_id) from factory.work_orders v where v.verifies_work_order_id = w.work_order_id) vids,
        (select count(*)::int from factory.audit_events e where e.actor_kind in ('admin', 'founder') and e.at >= $2) human
        from factory.work_orders w where w.work_order_id = $1`, [Wx, t0])).rows[0];
    for (const v of s.vids || []) if (!created.has(v)) created.set(v, null);   // (created by the front door; compared with the defaults below)
    const ok = !!(ca.claimed && cp.ok && cb.claimed && cb.claimed.resume_from && cb.claimed.resume_from.checkpoint_id === p1 && done.ok
      && s.vs === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && s.vwos === 1 && s.human === 0);
    return { ok, detail: JSON.stringify({ claimed: !!ca.claimed, checkpoint: !!cp.ok, takeover: !!cb.claimed, resumed: !!(cb.claimed && cb.claimed.resume_from), completed: !!done.ok,
      verification: s.vs, verificationWorkOrders: s.vwos, adminOrFounderActions: s.human }) };
  }

  // ---- LD0 / LD1 / LD2: HOLD
  const D1 = director('ld-director-1', { intervalMs: 500, maxIterations: 2000, leaseSeconds: 3 });
  const lwSeen = await waitFor(async () => (await sup.query(`select director_node_id d, director_state s from factory.work_orders where work_order_id = $1`, [LW])).rows[0].d === D1.nodeId, 30000);
  const lease0 = await lease();
  row('LD0 the frozen 69df2f52 director (' + FROZEN.length + ' files byte-identical to ' + BASELINE.slice(0, 8) + ') runs on the migrated plane as factory_runner: it holds director_lease and records the legacy work order under its own node id',
    frozenOk && lwSeen && lease0.length === 1 && lease0[0].node_id === D1.nodeId, JSON.stringify({ frozenOk, legacyRecorded: lwSeen, lease: lease0 }));
  const D2 = director('ld-director-2', { intervalMs: 300, maxIterations: 3, leaseSeconds: 3 });
  const hold = await sequence('hold');
  const d2 = await within(D2.exited, 30000);
  const lease1 = await lease();
  row('LD1 HOLD: while a legacy director holds director_lease, a new-model work order that requires verification is claimed, lapses, is taken over from its checkpoint, completes and is sent to verification, with no admin or founder action',
    hold.ok && lease1.length === 1 && lease1[0].node_id === D1.nodeId && lease1[0].age < 3, hold.detail + ' lease ' + JSON.stringify(lease1));
  const d2Waits = D2.lines.filter((l) => /another director holds the lease/.test(l)).length;
  const d2Acts = D2.lines.filter((l) => / -> /.test(l)).length;
  const byD2 = (await sup.query(`select count(*)::int n from factory.work_orders where director_node_id = $1`, [D2.nodeId])).rows[0].n;
  row('LD2 one legacy director at a time: a second director started during the hold logs "another director holds the lease" on each of its 3 iterations, records no transition and exits 0; the lease still names the first',
    d2 !== 'timeout' && d2.code === 0 && d2Waits === 3 && d2Acts === 0 && byD2 === 0 && lease1.length === 1 && lease1[0].node_id === D1.nodeId,
    JSON.stringify({ exit: d2, waits: d2Waits, transitions: d2Acts, rowsByD2: byD2 }));

  // ---- LD3: LAPSE (the first director is killed: its lease is never released)
  const d1Lines = [...D1.lines];
  await D1.kill();
  const lapsed = await waitFor(async () => { const l = await lease(); return l.length === 1 && l[0].node_id === D1.nodeId && l[0].age > l[0].lease_seconds ? l : null; }, 15000);
  const lapse = await sequence('lapse');
  row('LD3 LAPSE: the first director is killed; its lease row still names it and has lapsed; the same sequence holds',
    !!lapsed && lapse.ok, lapse.detail + ' lease ' + JSON.stringify(lapsed));

  // ---- LD4: RELEASE (a third director takes the lapsed lease over, ticks, stops and releases it)
  const D3 = director('ld-director-3', { intervalMs: 300, maxIterations: 4, leaseSeconds: 3 });
  const d3 = await within(D3.exited, 30000);
  const lease3 = await lease();
  const release = await sequence('release');
  row('LD4 RELEASE: a third director takes the lapsed lease over, ticks, stops cleanly and releases it (director_lease empty); the same sequence holds',
    d3 !== 'timeout' && d3.code === 0 && D3.lines.some((l) => /lease released/.test(l)) && !D3.lines.some((l) => /another director holds the lease/.test(l)) && lease3.length === 0 && release.ok,
    release.detail + ' exit ' + JSON.stringify(d3) + ' lease ' + JSON.stringify(lease3));

  // ---- LD5: no legacy lease statement raises
  const logBad = [...d1Lines, ...D2.lines, ...D3.lines].filter((l) => ERRORISH.test(l));
  process.env.FACTORY_RUNNER_PG_URL = plane.runnerUrl;
  process.env.FACTORY_ADMISSION = 'off';
  process.env.FACTORY_RUNNER_ENV_FILE = ISO.envFile;
  const frozen = await import(pathToFileURL(join(ROOT, 'scripts', 'factory-runner', 'director.mjs')).href);
  const inproc = {};
  try {
    inproc.absent = (await frozen.acquireLease('ld5-a', 3)).held;
    inproc.own = (await frozen.acquireLease('ld5-a', 3)).held;
    await run.query(`update factory.director_lease set node_id = 'ld5-other', heartbeat_at = now() - interval '60 seconds' where only_one`);
    inproc.lapsedForeign = (await frozen.acquireLease('ld5-a', 3)).held;
    inproc.released = await frozen.releaseLease('ld5-a');
    inproc.empty = (await lease()).length === 0;
  } catch (e) { inproc.error = String(e && e.message).slice(0, 200); }
  row('LD5 no legacy lease statement raises: no director log (' + (d1Lines.length + D2.lines.length + D3.lines.length) + ' lines) shows an error, and the frozen acquireLease / releaseLease resolve on an absent row, an own row and a lapsed foreign row, and release it',
    logBad.length === 0 && inproc.absent === true && inproc.own === true && inproc.lapsedForeign === true && inproc.released === true && inproc.empty === true,
    JSON.stringify({ logErrors: logBad.slice(0, 3), inproc }));

  // ---- LD6: no new-model dispatcher state changed under the legacy role (though the directors visited that work)
  const DEFAULTS = { director_state: 'queued', director_node_id: null, next_action: null, blocked_reason: null, last_evidence: null, last_evidence_at: null, retry_count: 0, handler: 'unknown' };
  const drift = [];
  for (const [id, was] of created) {
    const now = await dispatcher(id);
    if (was) { if (JSON.stringify(now) !== JSON.stringify(was)) drift.push(id.slice(0, 8) + ' changed'); }
    else if (Object.entries(DEFAULTS).some(([col, v]) => JSON.stringify(now[col]) !== JSON.stringify(v))) drift.push(id.slice(0, 8) + ' not at the defaults');
  }
  const visited = [...created.keys()].filter((id) => [...d1Lines, ...D3.lines].some((l) => l.includes(id))).length;
  const notes = (await sup.query(`select count(*)::int n from factory.founder_notifications f where exists (select 1 from factory.work_orders w
      where w.work_order_id = f.work_order_id and 'factory-enrolled-v1' = any (w.requires_capabilities))`)).rows[0].n;
  const orphan = (await sup.query(`select (select count(*)::int from factory.agent_runs r join factory.work_orders w using (work_order_id)
        where 'factory-enrolled-v1' = any (w.requires_capabilities) and r.principal_id is null)
      + (select count(*)::int from factory.checkpoints k join factory.work_orders w using (work_order_id) where 'factory-enrolled-v1' = any (w.requires_capabilities) and k.principal_id is null)
      + (select count(*)::int from factory.surface_locks l join factory.agent_runs r using (run_id) join factory.work_orders w on w.work_order_id = r.work_order_id
          where 'factory-enrolled-v1' = any (w.requires_capabilities) and l.principal_id is null) n`)).rows[0].n;
  const lw = (await sup.query(`select director_node_id d, director_state s from factory.work_orders where work_order_id = $1`, [LW])).rows[0];
  row('LD6 no new-model dispatcher state changed under the legacy role: every new-model work order (' + created.size + ': the three sequences\', their verification work orders, an idle one) keeps its dispatcher columns as created, though the directors\' logs name ' + visited + ' of them; no founder notification names new-model work; no run, checkpoint or lock of new-model work lacks its principal; the legacy work order was dispatched',
    drift.length === 0 && visited >= 1 && notes === 0 && orphan === 0 && [D1.nodeId, D3.nodeId].includes(lw.d) && created.size >= 7,
    JSON.stringify({ drift, visited, notes, orphan, legacy: lw }));

  // ---- LD7: new-model dispatch never waits on the legacy lease
  await run.query(`insert into factory.director_lease (only_one, node_id, lease_seconds) values (true, 'ld7-holder', 60)`);
  const timed = async (fn) => { const t = Date.now(); const r = await within(fn(), 20000); return { r, ms: Date.now() - t }; };
  const variant = async (label, holdSql) => {
    const holder = await connect(plane.runnerUrl);
    const out = { label };
    try {
      await holder.query('begin');
      await holder.query(holdSql);
      const Wv = await newModelWorkOrder(sup, { surface: ['ld7/' + label], priority: 70, title: 'LD7 ' + label, requiresVerification: false });
      await c.op('heartbeat', { phase: 'AVAILABLE' });
      // (C reports the most free memory of the three, so the ranking never defers it)
      const cl = await timed(() => c.op('claim', { only_work_order_id: Wv, lease_seconds: 60, resources: RES(64000) }));
      const runId = cl.r && cl.r.claimed && cl.r.claimed.run_id;
      const ck = await timed(() => c.op('checkpoint', { run_id: runId, checkpoint_id: randomUUID(), location: 'git://ld7@1', scenario: 's1' }));
      const rn = await timed(() => c.op('renew', { run_id: runId, lease_seconds: 60 }));
      const cm = await timed(() => c.op('complete', { run_id: runId, status: 'done', termination_reason: 'completed' }));
      // the verification claim is made by C, which is in no sequence's authoring set (A claimed and B completed each of them), so the
      // sequences' pending verification work orders are eligible for it: the pick must CLAIM one, not answer ok with nothing claimed
      const pendingVerification = (await sup.query(`select count(*)::int n from factory.work_orders v join factory.work_orders w on w.work_order_id = v.verifies_work_order_id
          where v.status = 'queued' and w.verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION'`)).rows[0].n;
      const vc = await timed(() => c.op('verification-claim', { lease_seconds: 60, resources: RES(64000) }));
      out.calls = { claim: cl, checkpoint: ck, renew: rn, complete: cm, verificationClaim: vc };
      out.pendingVerification = pendingVerification;
      out.verificationClaimed = !!(vc.r && vc.r.claimed && vc.r.claimed.kind === 'verification' && vc.r.claimed.verifies);
      out.ok = !!(runId && pendingVerification >= 1 && out.verificationClaimed
        && [cl, ck, rn, cm, vc].every((x) => x.r !== 'timeout' && x.r && x.r.ok === true && x.ms < 3000));
      // (given back, so that the next variant finds verification work pending again)
      if (vc.r && vc.r.claimed) await c.op('release', { run_id: vc.r.claimed.run_id }).catch(() => {});
    } finally { await holder.query('rollback').catch(() => {}); await holder.end().catch(() => {}); }
    return out;
  };
  const va = await variant('row', `select * from factory.director_lease where only_one for update`);
  const vb = await variant('table', `lock table factory.director_lease in access exclusive mode`);
  const brief = (v) => v.label + ': ' + (v.calls ? ('pending verification ' + v.pendingVerification + '; ') + Object.entries(v.calls).map(([n, x]) => n + ' ' + (x.r === 'timeout' ? 'TIMEOUT' : x.r && x.r.ok ? 'ok' + (n === 'claim' || n === 'verificationClaim' ? (x.r.claimed ? ' (claimed' + (x.r.claimed.kind ? ' ' + x.r.claimed.kind : '') + ')' : ' (nothing claimed)') : '') : (x.r && (x.r.refused || x.r.code)) || '?') + ' ' + x.ms + 'ms').join(', ') : 'not run');
  row('LD7 new-model dispatch never waits on the legacy lease: while a factory_runner session holds (a) a row lock on director_lease and (b) an ACCESS EXCLUSIVE lock on it, claim, checkpoint, renew, complete and verification-claim each answer ok in under 3 s, and the verification claim - made by a verifier outside every authoring set while verification work is pending - claims a verification work order',
    va.ok && vb.ok, brief(va) + ' | ' + brief(vb));
} catch (e) {
  row('X0 legacy_director_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  for (const d of directors) { if (d.child.exitCode === null && d.child.signalCode === null) await d.kill().catch(() => {}); }
  for (const n of nodes) await n.close().catch(() => {});
  if (api) await api.stop().catch(() => {});
  if (run) await run.end().catch(() => {});
  if (sup) await sup.end().catch(() => {});
  await plane.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nlegacy_director_acceptance [' + TRANSPORT + ']: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = arg('--evidence', null);
if (ev) writeFileSync(ev, ['qa/factory/v1/legacy_director_acceptance.mjs --transport ' + TRANSPORT, 'migration sha256 ' + sha256(compose()), ISO.label, '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
void asEngine;
