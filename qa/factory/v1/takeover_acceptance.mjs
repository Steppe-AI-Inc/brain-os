#!/usr/bin/env node
// THE §6 SEQUENCE - a permanent acceptance (contract P-2: "Auto Enrollment V1 FAILS if it regresses") - on a work order that REQUIRES
// VERIFICATION, through the transport named on the command line (direct = the SQL front doors called as factory_node_api; api = the
// Node API handler over HTTP). Developer verification; the independent verifier runs its own.
//
//   T1 A claims and leases               T6 stale A's renew, checkpoint and completion are each REJECTED
//   T2 A checkpoints P1                  T7 B completes exactly once; no duplicate completed side effect of any kind
//   T3 A's REAL lease expires            T8 surface-lock ownership stayed valid throughout
//   T4 eligible B claims and receives P1 T9 independent certification: A and B (the whole authoring set) refused; C certifies
//   T5 B resumes unfinished work only    T10 dependents released only at COMPLETE
//   T11 a taken-over work order keeps its place in the queue (its queue age), as the 69df2f52 reaper did
//   T12 every run and every checkpoint is stamped with the release its node runs (AC-5(g))
// plus the mixed fleet (a legacy lock blocks an enrolled claim and the reverse; an enrolled node is refused legacy work) and the
// enrollment walk to ALIVE.
// usage: node qa/factory/v1/takeover_acceptance.mjs [--transport direct|api] [--evidence <file>]
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, asEngine, enrolledComputer, newModelWorkOrder, publishedRelease, legacyWorkOrder } from './fixtures.mjs';
import { directNode } from './nodeclient.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const TRANSPORT = arg('--transport', 'direct');
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fp = (n) => String(n).repeat(64).slice(0, 64);

const plane = await startV1Plane({ baselineRows: false });
let sup; const nodes = [];
let api = null;
try {
  sup = await connect(plane.superUrl);
  const rel = await publishedRelease(sup);
  const A = await enrolledComputer(sup, { name: 'A', roles: ['generic', 'verifier'] });
  const B = await enrolledComputer(sup, { name: 'B', roles: ['generic', 'verifier'] });
  const C = await enrolledComputer(sup, { name: 'C', roles: ['generic', 'verifier'] });
  const mk = async (ident) => {
    if (TRANSPORT === 'api') {
      if (!api) api = await (await import('./api_harness.mjs')).startApi(plane);
      const { apiNode } = await import('./nodeclient.mjs');
      return apiNode(api.baseUrl, ident);
    }
    const n = await directNode(plane.nodeApiUrl, ident); nodes.push(n); return n;
  };
  const a = await mk(A), b = await mk(B), c = await mk(C);

  // ---- enrollment walk to ALIVE, and the runtime's start (RECOVERING -> AVAILABLE)
  const walk = [];
  for (const [n, x, f] of [[a, A, fp(1)], [b, B, fp(2)], [c, C, fp(3)]]) {
    const s = await n.session();
    const inst = await n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
    const reg = await n.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest, fingerprint: f, hostname: 'host-' + x.nodeId.slice(5, 9), os: 'test' });
    const h1 = await n.op('heartbeat', { phase: 'RECOVERING', resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 8000, disk_free_mb: 50000 } });
    const h2 = await n.op('heartbeat', { phase: 'AVAILABLE', resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 8000, disk_free_mb: 50000 } });
    walk.push({ s: s.ok, inst: inst.enrollment_state, reg: reg.ok && reg.enrollment_state, h: h2.phase });
  }
  const trans = (await sup.query(`select e.enrollment_id, array_agg(t.to_state order by t.transition_id) steps from factory.enrollment_transitions t
      join factory.enrollments e using (enrollment_id) where e.enrollment_id = $1 group by 1`, [A.enrollmentId])).rows[0];
  row('E1 enrollment walk from server rows: NODE_CREDENTIAL_ISSUED -> RUNTIME_INSTALLING -> REGISTERING -> ALIVE on a certified release; the runtime starts RECOVERING -> AVAILABLE',
    walk.every((w) => w.s && w.inst === 'RUNTIME_INSTALLING' && w.reg === 'ALIVE' && w.h === 'AVAILABLE')
      // (the transition log records every state change of an enrollment, its insert included - part 080 - so the fixture's own setup
      // writes, PAIRING_STARTED to NODE_CREDENTIAL_ISSUED, head the walk the node then continues)
      && trans && trans.steps.join('>') === 'PAIRING_STARTED>PAIRING_VERIFIED>NODE_ID_ISSUED>NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE', trans && trans.steps.join('>'));

  // ---- the work: W (requires verification) owning product/x, and D depending on W
  const W = await newModelWorkOrder(sup, { surface: ['product/x'], priority: 50, title: 'W: requires verification' });
  const D = await newModelWorkOrder(sup, { surface: ['product/y'], priority: 40, title: 'D: depends on W', requiresVerification: false });
  await asEngine(sup, () => sup.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [D, W]));

  // T1
  const ca = await a.op('claim', { lease_seconds: 5, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 16000, disk_free_mb: 50000 } });
  const RA = ca.claimed && ca.claimed.run_id;
  row('T1 A (best-ranked: most free RAM) claims W and holds a lease; D, which depends on W, is not what it gets', ca.ok && ca.claimed && ca.claimed.work_order.work_order_id === W && ca.claimed.resume_from === null,
    ca.claimed ? 'run ' + RA.slice(0, 8) + ' lease ' + ca.claimed.lease_expires_at : JSON.stringify(ca).slice(0, 200));
  const lockA = (await sup.query(`select run_id, lease_expires_at::text l, principal_id from factory.surface_locks where surface = 'product/x'`)).rows;
  // T2
  const p1 = randomUUID();
  const cpa = await a.op('checkpoint', { run_id: RA, checkpoint_id: p1, location: 'git://branch@c1', scenario: 'step-1', payload: { done: ['step-1'], remaining: ['step-2'] } });
  const cpa2 = await a.op('checkpoint', { run_id: RA, checkpoint_id: p1, location: 'git://branch@c1', scenario: 'step-1', payload: { done: ['step-1'] } });
  row('T2 A checkpoints P1 (a retry with the same checkpoint id writes one row)', cpa.ok && cpa.written === true && cpa2.ok && cpa2.written === false);
  // T3: a REAL expiry - nobody touches the lease
  await sleep(6500);
  const exp = (await sup.query(`select lease_expires_at < now() lapsed, status from factory.agent_runs where run_id = $1`, [RA])).rows[0];
  row('T3 A\'s real lease expired (no renewal for longer than the lease; nothing edited it)', exp.lapsed && exp.status === 'in_progress');
  // T4
  await b.op('heartbeat', { phase: 'AVAILABLE' });
  const cb = await b.op('claim', { lease_seconds: 60, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 12000, disk_free_mb: 50000 } });
  const RB = cb.claimed && cb.claimed.run_id;
  row('T4 eligible B claims W after the real expiry and receives P1', cb.ok && cb.claimed && cb.claimed.work_order.work_order_id === W && cb.claimed.resume_from
    && cb.claimed.resume_from.checkpoint_id === p1 && cb.claimed.resume_from.run_id === RA, cb.claimed ? 'resume ' + JSON.stringify(cb.claimed.resume_from && cb.claimed.resume_from.payload) : JSON.stringify(cb).slice(0, 200));
  const runs = (await sup.query(`select run_id, status, attempt_count, resumed_from_checkpoint_id from factory.agent_runs where work_order_id = $1 order by started_at`, [W])).rows;
  row('T5 B resumes unfinished work only: B\'s run records the consumed P1; A\'s run is requeued (attempt counted), never restarted as B',
    runs.length === 2 && runs[0].run_id === RA && runs[0].status === 'queued' && runs[0].attempt_count === 2 && runs[1].run_id === RB && runs[1].resumed_from_checkpoint_id === p1);
  // T6
  const ra = await a.op('renew', { run_id: RA, lease_seconds: 60 });
  const ka = await a.op('checkpoint', { run_id: RA, location: 'git://branch@stale', scenario: 'step-2' });
  const xa = await a.op('complete', { run_id: RA, status: 'done', termination_reason: 'completed', head_commit: 'a'.repeat(40), candidate_tree: 'b'.repeat(40) });
  const staleCps = (await sup.query(`select count(*)::int n from factory.checkpoints where run_id = $1`, [RA])).rows[0].n;
  row('T6 stale A: renew, checkpoint and completion are each REJECTED inside the front door, and wrote nothing',
    ra.refused === 'lease_lost' && ka.refused === 'lease_lost' && xa.refused === 'superseded' && xa.landed === false && staleCps === 1,
    [ra.refused, ka.refused, xa.refused].join(','));
  // T7 (B does step-2, checkpoints, completes; a retried completion recognizes that it landed)
  await b.op('checkpoint', { run_id: RB, location: 'git://branch@c2', scenario: 'step-2', payload: { done: ['step-1', 'step-2'] } });
  const lockB = (await sup.query(`select run_id, lease_expires_at::text l, principal_id from factory.surface_locks where surface = 'product/x'`)).rows;
  const done = await b.op('complete', { run_id: RB, status: 'done', termination_reason: 'completed', head_commit: 'c'.repeat(40), candidate_tree: 'd'.repeat(40), summary: 'W done by B' });
  // AC-9 "no duplicate completed side effect of any kind": the side effects counted EXACTLY - runs, locks, the verification work
  // order, the evidence record (the verification.waiting audit), certifications, checkpoints, the dependency, the dependent's runs -
  // and, as a class, EVERY factory row that names W, B's run or the verification work order (audit rows: outcome ok only, since the
  // retried completion legitimately writes its one refused audit), each compared whole after the completion and after its retry
  const counts = async () => (await sup.query(`select
      (select count(*)::int from factory.agent_runs where work_order_id = $1 and status = 'done') done_runs,
      (select count(*)::int from factory.agent_runs where work_order_id = $1) w_runs,
      (select count(*)::int from factory.surface_locks where surface = 'product/x') locks,
      (select count(*)::int from factory.work_orders where verifies_work_order_id = $1) verification_wos,
      (select count(*)::int from factory.audit_events where action = 'verification.waiting' and target_kind = 'work_order' and target_id = $1::text and outcome = 'ok') evidence,
      (select count(*)::int from factory.certifications where work_order_id = $1) certifications,
      (select count(*)::int from factory.checkpoints where work_order_id = $1) checkpoints,
      (select count(*)::int from factory.work_order_dependencies where depends_on = $1) dependencies,
      (select count(*)::int from factory.agent_runs where work_order_id = $2) d_runs,
      (select status from factory.work_orders where work_order_id = $2) d_status,
      (select status || '/' || verification_state from factory.work_orders where work_order_id = $1) w_state,
      (select current_candidate_run_id from factory.work_orders where work_order_id = $1) cand`, [W, D])).rows[0];
  const factoryTables = (await sup.query(`select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'factory' and c.relkind in ('r', 'p') order by 1`)).rows.map((x) => x.relname);
  const snapshot = async () => {
    const V0 = (await sup.query(`select work_order_id from factory.work_orders where verifies_work_order_id = $1`, [W])).rows.map((x) => x.work_order_id);
    const ids = [W, RB, ...V0];
    const out = {};
    for (const t of factoryTables) {
      const rows = (await sup.query('select to_jsonb(x)::text j from factory.' + t + ' x where to_jsonb(x)::text like any ($1)' + (t === 'audit_events' ? " and x.outcome = 'ok'" : '')
        + ' order by 1', [ids.map((i) => '%' + i + '%')])).rows.map((x) => x.j);
      if (rows.length) out[t] = rows;
    }
    return out;
  };
  const side = await counts();
  const snapDone = await snapshot();
  const again = await b.op('complete', { run_id: RB, status: 'done', termination_reason: 'completed', head_commit: 'c'.repeat(40), candidate_tree: 'd'.repeat(40) });
  const side2 = await counts();
  const snapAgain = await snapshot();
  const exact = (x) => x.done_runs === 1 && x.w_runs === 2 && x.locks === 0 && x.verification_wos === 1 && x.evidence === 1 && x.certifications === 0
    && x.checkpoints === 2 && x.dependencies === 1 && x.d_runs === 0 && x.d_status === 'queued' && x.w_state === 'review/WAITING_FOR_INDEPENDENT_VERIFICATION' && x.cand === RB;
  const snapSame = JSON.stringify(snapDone) === JSON.stringify(snapAgain);
  row('T7 B completes exactly once, counted exactly after the completion AND after its retry: 1 done run of 2 runs, 0 locks, 1 verification work order, 1 evidence record (verification.waiting), 0 certifications, 2 checkpoints, 1 dependency, 0 runs of the dependent; every factory row naming W, B\'s run or the verification work order (audit: outcome ok) is identical after the retry, which is told it landed',
    done.ok && again.refused === 'superseded' && again.landed === true && exact(side) && exact(side2) && snapSame && Object.keys(snapDone).length >= 5,
    JSON.stringify({ side, side2: JSON.stringify(side2) === JSON.stringify(side) ? 'same' : side2, tables: Object.fromEntries(Object.entries(snapDone).map(([k, v]) => [k, v.length])), snapSame }));
  row('T8 surface-lock ownership stayed valid: A\'s lock (enrolled: lease infinity), then B\'s, never both, and none after completion',
    lockA.length === 1 && lockA[0].run_id === RA && lockA[0].l === 'infinity' && lockB.length === 1 && lockB[0].run_id === RB && side.locks === 0);
  const dBlocked = await c.op('claim', { only_work_order_id: D });
  row('T10a D (depends on W) is not claimable while W awaits verification', dBlocked.ok && dBlocked.claimed === null);
  // T9: the whole authoring set is refused as certifier
  const V = (await sup.query(`select work_order_id from factory.work_orders where verifies_work_order_id = $1`, [W])).rows[0].work_order_id;
  const va = await a.op('verification-claim', { only_work_order_id: V });
  const vb = await b.op('verification-claim', { only_work_order_id: V });
  row('T9a after the takeover NEITHER A NOR B (the authoring set) can take the verification: gate 7 independence, by name',
    va.refused === 'not_eligible' && /gate 7 independence/.test(va.message) && vb.refused === 'not_eligible' && /gate 7 independence/.test(vb.message),
    va.message);
  const vc = await c.op('verification-claim', {});
  const VR = vc.claimed && vc.claimed.run_id;
  const wst = (await sup.query(`select verification_state from factory.work_orders where work_order_id = $1`, [W])).rows[0].verification_state;
  row('T9b C (an identity outside the authoring set, with verifier authority) claims the verification: VERIFICATION_CLAIMED',
    vc.ok && vc.claimed && vc.claimed.work_order.work_order_id === V && vc.claimed.verifies.candidate.run_id === RB && wst === 'VERIFICATION_CLAIMED');
  const bad = await c.op('certify', { run_id: VR, verdict: 'PASS', work_order_id: W, candidate_run_id: RA, candidate_tree: 'd'.repeat(40) });
  const good = await c.op('certify', { run_id: VR, verdict: 'PASS', work_order_id: W, candidate_run_id: RB, candidate_tree: 'd'.repeat(40), candidate_commit: 'c'.repeat(40), reason: 'rows reproduced' });
  const cert = (await sup.query(`select verdict, certifying_principal_id, candidate_run_id, jsonb_array_length(authoring_set) aset, policies from factory.certifications where work_order_id = $1`, [W])).rows;
  const wFinal = (await sup.query(`select status, verification_state from factory.work_orders where work_order_id = $1`, [W])).rows[0];
  const certSide = (await sup.query(`select
      (select count(*)::int from factory.audit_events where action = 'node.certify' and target_kind = 'work_order' and target_id = $1::text and outcome = 'ok') certify_ok,
      (select count(*)::int from factory.agent_runs where work_order_id = $2 and status = 'done') v_done,
      (select count(*)::int from factory.agent_runs where work_order_id = $2) v_runs`, [W, V])).rows[0];
  row('T9c a certification naming another candidate is refused (provenance_mismatch); C certifies the exact candidate: one record, the authoring set of 2 recorded, W COMPLETE; exactly one node.certify ok audit for W, and the verification work order has exactly one run, done',
    bad.refused === 'certification_refused' && /provenance_mismatch/.test(bad.message) && good.ok && cert.length === 1 && cert[0].verdict === 'PASS'
      && cert[0].certifying_principal_id === C.principalId && cert[0].candidate_run_id === RB && cert[0].aset === 2
      && wFinal.status === 'done' && wFinal.verification_state === 'COMPLETE' && certSide.certify_ok === 1 && certSide.v_done === 1 && certSide.v_runs === 1,
    JSON.stringify({ wFinal, certSide }));
  const dNow = await c.op('claim', { only_work_order_id: D, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 32000, disk_free_mb: 50000 } });
  // one dependent release: D exists once, it is released once (exactly one run, its own), and no other node gets a second run of it
  // (A reports little free RAM here, so it never out-ranks the claimers of the later rows)
  const dAgain = await a.op('claim', { only_work_order_id: D, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 1000, disk_free_mb: 50000 } });
  const dSide = (await sup.query(`select (select count(*)::int from factory.work_orders where work_order_id = $1) d_rows,
      (select count(*)::int from factory.agent_runs where work_order_id = $1) d_runs, (select status from factory.work_orders where work_order_id = $1) d_status,
      (select count(*)::int from factory.work_order_dependencies where depends_on = $2) deps`, [D, W])).rows[0];
  row('T10b D is claimable once W is COMPLETE (dependent released by the server, no founder step), and released exactly once: one D row, one run of D, claimed, and another node\'s claim of D gets nothing',
    dNow.ok && dNow.claimed && dNow.claimed.work_order.work_order_id === D && dAgain.ok && dAgain.claimed === null
      && dSide.d_rows === 1 && dSide.d_runs === 1 && dSide.d_status === 'claimed' && dSide.deps === 1, JSON.stringify({ dAgain: dAgain.claimed === null ? 'nothing' : dAgain, dSide }));
  if (dNow.claimed) await c.op('complete', { run_id: dNow.claimed.run_id, status: 'done', termination_reason: 'completed' });
  // T12 (AC-5(g), contract §1 "stamped on the node, on every run and on every checkpoint"): every run of W - A's taken-over run,
  // B's completing run and C's verification run - and every checkpoint of W carries the release its node runs, all three fields
  const stamps = (await sup.query(`select 'run' k, r.release_id, r.runtime_version, r.runtime_digest from factory.agent_runs r join factory.work_orders w using (work_order_id)
       where r.work_order_id = $1 or w.verifies_work_order_id = $1
      union all select 'checkpoint', k.release_id, k.runtime_version, k.runtime_digest from factory.checkpoints k where k.work_order_id = $1
      union all select 'node', n.release_id, n.runtime_version, n.runtime_digest from factory.nodes n where n.node_id = any ($2)`, [W, [A.nodeId, B.nodeId, C.nodeId]])).rows;
  const stamped = (x) => x.release_id === rel.releaseId && x.runtime_version === '0.1.0' && x.runtime_digest === rel.digest;
  row("T12 every run of W (A's taken-over run, B's completing run, C's verification run) and every checkpoint of W (P1, B's) carry the release their node runs - release id, runtime version and digest, none null - equal to the nodes' own stamps",
    stamps.filter((x) => x.k === 'run').length === 3 && stamps.filter((x) => x.k === 'checkpoint').length === 2 && stamps.filter((x) => x.k === 'node').length === 3 && stamps.every(stamped),
    JSON.stringify(stamps.map((x) => x.k + ':' + (stamped(x) ? 'stamped' : JSON.stringify([x.release_id, x.runtime_version, x.runtime_digest && x.runtime_digest.slice(0, 8)])))));
  // T11 (P-2, AC-9, P-6 queue age): Q1, then Q2 and Q3 a second later, one priority. C claims Q1 and lets its lease lapse; B's
  // next claim of that work type takes over Q1 first - the takeover kept Q1's queue age (claim.mjs:178 changed only status and time)
  const Q1 = await newModelWorkOrder(sup, { surface: ['q/1'], priority: 30, title: 'Q1', requiresVerification: false, workType: 'takeover-order' });
  await sleep(1100);
  const Q2 = await newModelWorkOrder(sup, { surface: ['q/2'], priority: 30, title: 'Q2', requiresVerification: false, workType: 'takeover-order' });
  const Q3 = await newModelWorkOrder(sup, { surface: ['q/3'], priority: 30, title: 'Q3', requiresVerification: false, workType: 'takeover-order' });
  const queuedAt = async (id) => (await sup.query(`select queued_at::text q from factory.work_orders where work_order_id = $1`, [id])).rows[0].q;
  const q1Before = await queuedAt(Q1);
  // (C and B report less free RAM than A's later claims, so ranking never decides a later row)
  await c.op('heartbeat', { phase: 'AVAILABLE' });
  const cq = await c.op('claim', { only_work_order_id: Q1, lease_seconds: 5, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 60000, disk_free_mb: 50000 } });
  await sleep(6500);
  await b.op('heartbeat', { phase: 'AVAILABLE' });
  const bq = await b.op('claim', { work_types: ['takeover-order'], lease_seconds: 60, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 63000, disk_free_mb: 50000 } });
  const q1After = await queuedAt(Q1);
  row("T11 a lapsed lease hands its work order to the next claim FIRST among equal-priority work queued after it: B receives Q1, not Q2 or Q3, and Q1's queue age (queued_at) is unchanged by the takeover",
    cq.claimed && bq.claimed && bq.claimed.work_order.work_order_id === Q1 && q1Before === q1After,
    JSON.stringify({ c: !!cq.claimed, b: bq.claimed ? ({ [Q1]: 'Q1', [Q2]: 'Q2', [Q3]: 'Q3' })[bq.claimed.work_order.work_order_id] || 'other' : bq, q1Before, q1After }).slice(0, 400));
  if (bq.claimed) await b.op('complete', { run_id: bq.claimed.run_id, status: 'done', termination_reason: 'completed' });

  // ---- mixed fleet through the FROZEN claim.mjs
  process.env.FACTORY_RUNNER_PG_URL = plane.runnerUrl;
  process.env.FACTORY_ADMISSION = 'off';
  const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
  const legacyNode = 'legacy-' + randomUUID().slice(0, 6);
  await claim.registerNode({ nodeId: legacyNode, capabilities: [], securityRole: 'generic', platform: 'test' });
  const run = await connect(plane.runnerUrl);
  const L1 = await legacyWorkOrder(run, { surface: ['shared/s1'], title: 'legacy owns s1' });
  const lclaim = await claim.claimWork({ nodeId: legacyNode, onlyWorkOrderId: L1 });
  const E1 = await newModelWorkOrder(sup, { surface: ['shared/s1'], priority: 5, title: 'enrolled wants s1', requiresVerification: false });
  const eBlocked = await a.op('claim', { only_work_order_id: E1 });
  row('X1 a legacy run on the unmodified 69df2f52 claim path holding surface s1 blocks an enrolled claim of a work order owning s1 (gate 8)',
    lclaim && lclaim.work_order_id === L1 && eBlocked.refused === 'not_eligible' && /gate 8 surface_locks/.test(eBlocked.message), eBlocked.message);
  const E2 = await newModelWorkOrder(sup, { surface: ['shared/s2'], priority: 5, title: 'enrolled owns s2', requiresVerification: false });
  await a.op('heartbeat', { phase: 'AVAILABLE' });
  const eHold = await a.op('claim', { only_work_order_id: E2, lease_seconds: 120, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 64000, disk_free_mb: 50000 } });
  const L2 = await legacyWorkOrder(run, { surface: ['shared/s2'], title: 'legacy wants s2' });
  const lBlocked = await claim.claimWork({ nodeId: legacyNode, onlyWorkOrderId: L2 });
  row('X2 ... and the reverse: an enrolled run holding s2 blocks the legacy claim of a work order owning s2', eHold.claimed && lBlocked === null);
  const eLegacy = await a.op('claim', { only_work_order_id: L2 });
  row('X3 an enrolled node is refused a legacy work order (no factory-enrolled-v1): not_enrolled_work', eLegacy.refused === 'not_enrolled_work');
  // X4 (AC-9 mixed fleet; contract §1): the lock THE CLAIM FRONT DOOR WROTE for an enrolled run whose lease then lapses - not a fixture
  // lock - never makes the frozen legacy claim fail or stall: with a legacy work order owning that surface at the head of the legacy
  // queue and another behind it, the legacy claim takes the next one in one poll, no legacy run holds the surface, and the enrolled
  // run, its work order and its lock are unchanged. No front-door claim (and so no reap) runs between the lapse and the legacy claim.
  const X = await newModelWorkOrder(sup, { surface: ['x4/lapse'], priority: 90, title: 'X4 enrolled, lapsing', requiresVerification: false });
  await c.op('heartbeat', { phase: 'AVAILABLE' });
  const cx = await c.op('claim', { only_work_order_id: X, lease_seconds: 5, resources: { cpu_cores: 8, cpu_pct: 10, ram_free_mb: 64000, disk_free_mb: 50000 } });
  // the legacy queue: L2 (whose surface A still holds) is set aside, so the pick order is exactly the two below
  await sup.query(`update factory.work_orders set status = 'done' where work_order_id = $1`, [L2]);
  const headWo = await legacyWorkOrder(run, { surface: ['x4/lapse'], title: 'X4 legacy head, owns x4/lapse', createdAt: '2000-01-01T00:00:00Z' });
  const nextWo = await legacyWorkOrder(run, { surface: ['x4/next'], title: 'X4 legacy next', createdAt: '2000-01-02T00:00:00Z' });
  await sleep(6500);
  const xState = async () => (await sup.query(`select (select to_jsonb(r) from factory.agent_runs r where r.run_id = $1) run, (select to_jsonb(w) from factory.work_orders w where w.work_order_id = $2) wo,
      (select coalesce(jsonb_agg(to_jsonb(l) order by l.surface), '[]') from factory.surface_locks l where l.run_id = $1) locks,
      (select (r.lease_expires_at < now()) from factory.agent_runs r where r.run_id = $1) lapsed`, [cx.claimed && cx.claimed.run_id, X])).rows[0];
  const x0 = await xState();
  const legacyNode2 = 'legacy-x4-' + randomUUID().slice(0, 6);
  await claim.registerNode({ nodeId: legacyNode2, capabilities: [], securityRole: 'generic', platform: 'test' });
  let xClaimed = null, xErr = null;
  const xLogs = []; const origLog = console.log; console.log = (...m) => xLogs.push(m.join(' '));
  try { xClaimed = await claim.claimWork({ nodeId: legacyNode2 }); } catch (e) { xErr = e; } finally { console.log = origLog; }
  const x1 = await xState();
  const holders = (await sup.query(`select count(*)::int n from factory.surface_locks l join factory.agent_runs r on r.run_id = l.run_id where l.surface = 'x4/lapse' and r.principal_id is null`)).rows[0].n;
  row('X4 the lock the claim front door wrote for an enrolled run whose lease has lapsed never fails or stalls the frozen legacy claim: with a legacy work order owning that surface at the head, the legacy claim takes the NEXT one in one poll with no "another node" / 23505; no legacy run holds the surface; the enrolled run, its work order and its lock are unchanged',
    !!(cx.claimed && x0.lapsed === true && x0.locks.length === 1) && !xErr && xClaimed && xClaimed.work_order_id === nextWo && !xLogs.some((l) => /another node|23505/.test(l))
      && holders === 0 && JSON.stringify(x0) === JSON.stringify(x1),
    xErr ? String(xErr.message).slice(0, 200) : JSON.stringify({ enrolledClaimed: !!cx.claimed, lapsed: x0.lapsed, lock: x0.locks.map((l) => l.lease_expires_at), legacyClaimed: xClaimed ? (xClaimed.work_order_id === nextWo ? 'the one behind the head' : xClaimed.work_order_id === headWo ? 'the head' : 'another') : null, holders, unchanged: JSON.stringify(x0) === JSON.stringify(x1) }));
  await run.end();
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 takeover_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  for (const n of nodes) await n.close().catch(() => {});
  if (api) await api.stop().catch(() => {});
  if (sup) await sup.end().catch(() => {});
  await plane.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\ntakeover_acceptance [' + TRANSPORT + ']: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = arg('--evidence', null);
if (ev) writeFileSync(ev, ['qa/factory/v1/takeover_acceptance.mjs --transport ' + TRANSPORT, 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
