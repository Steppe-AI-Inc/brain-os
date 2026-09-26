#!/usr/bin/env node
// THE COMPATIBILITY MATRIX'S REGRESSIONS (WO-2; P-3; AC-9): each certified 69df2f52 assertion the new transport must keep, PORTED -
// the same claim, asserted through the Node API (or, with --transport direct, by calling the SQL front doors directly) against the
// candidate's front doors. Every row id is "<certified file>:<line>" at 69df2f52 plus the certified row label; the matrix
// (qa/implementation/auto-enrollment-v1/COMPATIBILITY_MATRIX.md) cites these ids, and transport_compatibility_contract.mjs checks
// that each cited line exists at 69df2f52 with that label and that its ported row passed here.
// Where the new model deliberately inverts a 69df2f52 behaviour (the node re-asserting its own role), the row says INVERTED and
// asserts the contract's rule instead. Developer verification, never independent.
// usage: node qa/factory/v1/compat_regressions.mjs [--transport api|direct] [--json <file>] [--evidence <file>]
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { connect } from './plane.mjs';
import { directNode, apiNode } from './nodeclient.mjs';
import { asEngine } from './fixtures.mjs';
import { world, RES } from './flows.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const TRANSPORT = arg('--transport', 'api');
const results = [];
const port = (id, label, ok, detail) => { results.push({ id, label, ok: !!ok, detail, transport: TRANSPORT }); console.log((ok ? 'OK   ' : 'FAIL ') + id + '  ' + label + (detail ? ' - ' + detail : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ram = 200000;
const best = () => RES((ram += 1000));

const W = await world();
const direct = [];
try {
  const { sup, founder, admin } = W;
  const env = { roles: ['generic', 'verifier'], max_concurrent_runs: 4, max_heavy: 2 };
  // the transport under test: the enrolled identity, reached through the Node API or through the front doors directly
  const as = async (x) => {
    if (TRANSPORT === 'api') return x.n;
    const d = await directNode(W.plane.nodeApiUrl, x.identity); direct.push(d); await d.session(); return d;
  };
  const enroll = async (name) => { const x = await W.enroll(name, env); return { ...x, t: await as(x) }; };
  const A = await enroll('C-A'), B = await enroll('C-B'), V = await enroll('C-V');
  const claim = (x, wo, extra = {}) => x.t.op('claim', { only_work_order_id: wo, resources: best(), ...extra });
  const done = (x, run, extra = {}) => x.t.op('complete', { run_id: run, status: 'done', termination_reason: 'completed', ...extra });

  // ---- claim
  const wA = await W.submit({ title: 'A', owned_surface: ['c/a'] });
  const cA = await claim(A, wA);
  port('acceptance.mjs:71 A', 'a queued work order is claimed', cA.claimed && cA.claimed.work_order.work_order_id === wA);
  port('acceptance.mjs:76 B', 'the claim takes an exclusive lock on the surface it will write',
    (await sup.query(`select run_id from factory.surface_locks where surface = 'c/a'`)).rows.map((r) => r.run_id).join() === cA.claimed.run_id);
  const dup = await claim(B, wA);
  port('acceptance.mjs:82 H', 'a second node cannot claim the same work order', dup.refused === 'not_eligible' || (dup.ok && dup.claimed === null), dup.refused || 'nothing');
  const wI = await W.submit({ title: 'I', owned_surface: ['c/a'] }), wI2 = await W.submit({ title: 'I2', owned_surface: ['c/b'] });
  const cI = await claim(B, wI), cI2 = await claim(B, wI2);
  port('acceptance.mjs:87 I', 'a different work order wanting the SAME surface is not claimable while it is held', /gate 8/.test(cI.message || ''));
  port('acceptance.mjs:93 I2', 'a work order on a DIFFERENT surface is claimable concurrently', cI2.claimed && cI2.claimed.work_order.work_order_id === wI2);
  // two nodes race for one work order
  const wR = await W.submit({ title: 'race', owned_surface: ['c/race'] });
  const race = await Promise.all([claim(A, wR), claim(V, wR)]);
  const winners = race.filter((r) => r.claimed && r.claimed.work_order.work_order_id === wR).length;
  const runsR = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1`, [wR])).rows[0].n;
  port('shared_control_plane_acceptance.mjs:76 CP-3', 'two runner processes race for one work order: exactly one claims it', winners === 1 && runsR === 1, winners + ' winner(s), ' + runsR + ' run(s)');
  // ---- checkpoint
  const k1 = await A.t.op('checkpoint', { run_id: cA.claimed.run_id, location: 'git://c@1', scenario: 's1' });
  const k2 = await A.t.op('checkpoint', { run_id: cA.claimed.run_id, location: 'git://c@2', scenario: 's2' });
  const cps = (await sup.query(`select count(*)::int n from factory.checkpoints where run_id = $1`, [cA.claimed.run_id])).rows[0].n;
  const ptr = (await sup.query(`select checkpoint_location l, last_completed_scenario s from factory.agent_runs where run_id = $1`, [cA.claimed.run_id])).rows[0];
  port('acceptance.mjs:101 C', 'the worker progresses and each step is recorded', k1.ok && k2.ok && cps === 2);
  port('acceptance.mjs:102 D', 'the checkpoint persists, and the run points at the latest one', ptr.l === 'git://c@2' && ptr.s === 's2');
  const kid = randomUUID();
  const r1 = await A.t.op('checkpoint', { run_id: cA.claimed.run_id, checkpoint_id: kid, location: 'git://c@3' });
  const r2 = await A.t.op('checkpoint', { run_id: cA.claimed.run_id, checkpoint_id: kid, location: 'git://c@3' });
  port('node_truth_acceptance.mjs:628 N26', 'a checkpoint retried after a lost reply writes ONE row (the caller\'s checkpoint id)', r1.written === true && r2.written === false);
  // ---- renew (liveness)
  await asEngine(sup, () => sup.query(`update factory.nodes set last_heartbeat_at = now() - interval '170 seconds' where node_id = $1`, [A.node_id]));
  const rn = await A.t.op('renew', { run_id: cA.claimed.run_id, lease_seconds: 120 });
  const age = (await sup.query(`select extract(epoch from now() - last_heartbeat_at)::int a from factory.nodes where node_id = $1`, [A.node_id])).rows[0].a;
  port('node_truth_acceptance.mjs:343 N5', 'a node busy on a run reads ALIVE: the run\'s lease renewal alone stamps the node record', rn.ok && age <= 2, 'age ' + age + ' s');
  // ---- complete
  const m2 = await A.t.op('complete', { run_id: cA.claimed.run_id, status: 'done' });
  port('acceptance.mjs:156 M2', 'completion REFUSES a done/failed status with no termination reason', m2.refused === 'bad_request' && /termination_reason/.test(m2.message));
  const wM = await W.submit({ title: 'M3', owned_surface: ['c/m'] });
  const cM = await claim(B, wM, { requested_provider: 'stub', requested_model: 'model-a' });
  if (!cM.claimed) console.log('DEBUG cM', JSON.stringify(cM).slice(0, 600));
  const m3 = await done(B, cM.claimed.run_id, { actual_provider: 'stub', actual_model: 'model-b' });
  const m4 = await done(B, cM.claimed.run_id, { actual_provider: 'stub', actual_model: 'model-b', fallback_reason: 'model-a at capacity' });
  const m4row = (await sup.query(`select actual_model, fallback_reason, termination_reason from factory.agent_runs where run_id = $1`, [cM.claimed.run_id])).rows[0];
  port('acceptance.mjs:166 M3', 'completion REFUSES a model substitution with no fallback reason', m3.refused === 'bad_request' && /fallback/.test(m3.message));
  port('acceptance.mjs:179 M4', 'a STATED substitution is recorded with its reason and its terminal condition', m4.ok && m4row.actual_model === 'model-b' && m4row.fallback_reason && m4row.termination_reason === 'completed');
  const wM5 = await W.submit({ title: 'M5' });
  const cM5 = await claim(B, wM5, { requested_model: 'model-a' });
  const m5 = await done(B, cM5.claimed.run_id, { actual_model: 'model-a' });
  port('acceptance.mjs:196 M5', 'NEGATIVE CONTROL: a run served by the model it requested needs no fallback reason', m5.ok);
  const jd = await done(A, cA.claimed.run_id);
  const again = await claim(B, wA);
  port('acceptance.mjs:262 J', 'a completed work order is not claimed again', jd.ok && (again.refused === 'not_eligible' || (again.ok && again.claimed === null) || again.refused === 'not_enrolled_work'));
  port('acceptance.mjs:266 J2', 'completing a run releases its surface', (await sup.query(`select count(*)::int n from factory.surface_locks where run_id = $1`, [cA.claimed.run_id])).rows[0].n === 0);
  const land = await done(A, cA.claimed.run_id);
  port('node.mjs:514 (landed check) / node_truth_acceptance.mjs:628 N26', 'a retried completion that already landed is told so and changes nothing', land.refused === 'superseded' && land.landed === true);
  // a failed run fails its work order in the same statement; its dependent stays blocked
  const wF = await W.submit({ title: 'fails', owned_surface: ['c/f'] });
  const wFd = await W.submit({ title: 'depends on fails', depends_on: [wF] });
  const cF = await claim(A, wF);
  const fx = await A.t.op('complete', { run_id: cF.claimed.run_id, status: 'failed', termination_reason: 'provider_refused' });
  const fs_ = (await sup.query(`select w.status, (select count(*)::int from factory.surface_locks where run_id = $2) locks from factory.work_orders w where work_order_id = $1`, [wF, cF.claimed.run_id])).rows[0];
  const dep = await claim(B, wFd);
  port('node_truth_acceptance.mjs:316 N4', 'a failed run fails its work order in the same statement, its locks are released, and its dependent stays blocked',
    fx.ok && fs_.status === 'failed' && fs_.locks === 0 && dep.ok && dep.claimed === null);
  // all or nothing: the work-order update fails inside the completion -> nothing of it commits
  const wP = await W.submit({ title: 'P', owned_surface: ['c/p'] });
  const cP = await claim(B, wP);
  await sup.query(`create schema if not exists qa_fault; grant usage on schema qa_fault to public;
    create or replace function qa_fault.boom() returns trigger language plpgsql as $$ begin raise exception 'qa fault: work order update fails'; end $$;
    create trigger qa_fault_boom before update on factory.work_orders for each row when (old.work_order_id = '${wP}' and new.status in ('done', 'review', 'failed')) execute function qa_fault.boom();`);
  const pf = await done(B, cP.claimed.run_id);
  const pRow = (await sup.query(`select r.status, (select count(*)::int from factory.surface_locks where run_id = r.run_id) locks, w.status ws from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.run_id = $1`, [cP.claimed.run_id])).rows[0];
  await sup.query(`drop trigger qa_fault_boom on factory.work_orders; drop function qa_fault.boom(); drop schema qa_fault`);
  const pOk = await done(B, cP.claimed.run_id);
  port('acceptance.mjs:619 P', 'a completion is all or nothing: with the work-order update failing, the run stays in progress with its lock and the work order unchanged; the retry completes',
    pf.ok === false && pRow.status === 'in_progress' && pRow.locks === 1 && pRow.ws === 'claimed' && pOk.ok, JSON.stringify(pRow));
  // ---- takeover
  const wT = await W.submit({ title: 'takeover', owned_surface: ['c/t'], requires_verification: true });
  const cT = await claim(A, wT, { lease_seconds: 5 });
  await A.t.op('checkpoint', { run_id: cT.claimed.run_id, location: 'git://t@1', scenario: 'half', payload: { next: 'second half' } });
  await sleep(6500);
  const cT2 = await claim(B, wT);
  const abandoned = (await sup.query(`select status, attempt_count, node_id from factory.agent_runs where run_id = $1`, [cT.claimed.run_id])).rows[0];
  port('acceptance.mjs:112 E/G', 'a dead node\'s expired lease is recovered by another node', cT2.claimed && cT2.claimed.work_order.work_order_id === wT);
  port('acceptance.mjs:116 G2', 'the abandoned run is returned to queued and its attempt_count incremented', abandoned.status === 'queued' && abandoned.attempt_count === 2);
  port('acceptance.mjs:120 G3', 'the abandoned run keeps the node that ran it', abandoned.node_id === A.node_id);
  port('shared_control_plane_acceptance.mjs:97 CP-5', 'the process that takes over sees the dead run\'s checkpoint', cT2.claimed.resume_from && cT2.claimed.resume_from.payload.next === 'second half');
  const mCp = await A.t.op('checkpoint', { run_id: cT.claimed.run_id, location: 'git://stale' });
  const mFin = await done(A, cT.claimed.run_id, { head_commit: 'a'.repeat(40), candidate_tree: 'b'.repeat(40) });
  const mRen = await A.t.op('renew', { run_id: cT.claimed.run_id });
  const wTstate = (await sup.query(`select status from factory.work_orders where work_order_id = $1`, [wT])).rows[0].status;
  port('acceptance.mjs:515 M', 'a run whose lease was taken over cannot complete the work order: its checkpoint and completion (and renewal) are refused; the work order stays with the new owner',
    mCp.refused === 'lease_lost' && mFin.refused === 'superseded' && mRen.refused === 'lease_lost' && wTstate === 'claimed');
  // ---- give-back
  const wG = await W.submit({ title: 'abort', owned_surface: ['c/g'] });
  const cG = await claim(A, wG, { lease_seconds: 600 });
  const rel = await A.t.op('release', { run_id: cG.claimed.run_id });
  await sleep(1100);
  const cG2 = await claim(B, wG);
  port('node_truth_acceptance.mjs:501 N13 / node.mjs:283', 'an aborted run gives its lease back at once: another node takes the work immediately, not after the lease', rel.released === 1 && cG2.claimed);
  const wO = await W.submit({ title: 'orphan', owned_surface: ['c/o'] });
  const cO = await claim(A, wO, { lease_seconds: 600 });
  const og = await A.t.op('release', { keep_run_ids: [] });
  await sleep(1100);
  const cO2 = await claim(B, wO);
  port('node_truth_acceptance.mjs:722 N29 / node.mjs:244', 'a claim whose reply was lost is given back at once (every run of this node the process does not hold)', og.released >= 1 && cO2.claimed);
  // ---- malformed / repeated surfaces
  const wS = await W.submit({ title: 'repeated surface', owned_surface: ['c/s', 'c/s'] });
  const cS = await claim(A, wS);
  const sLocks = (await sup.query(`select count(*)::int n from factory.surface_locks where run_id = $1`, [cS.claimed && cS.claimed.run_id])).rows[0].n;
  const bad = await admin.call('submit-work-order', { title: 'empty surface', priority: 1, owned_surface: [''] }, founder.token);
  port('acceptance.mjs:756 S', 'a malformed work order cannot starve the plane: a repeated surface is claimed with ONE lock; an empty / oversized surface never enters the new-model queue',
    cS.claimed && sLocks === 1 && bad.refused === 'bad_request');
  // ---- the claim lock
  const holder = await connect(W.plane.superUrl);
  await holder.query("begin; select pg_advisory_xact_lock(hashtext('factory.claim'))");
  const t0 = Date.now();
  const busy = await claim(B, await W.submit({ title: 'lock busy' }));
  const took = Date.now() - t0;
  await holder.query('rollback'); await holder.end();
  port('acceptance.mjs:544 N', 'a claimer that died holding the claim lock cannot block the plane: another claim gives up within the lock timeout, named',
    busy.refused === 'claim_lock_busy' && took < 20000, took + ' ms');
  // ---- roles / verification / certification
  const wV = await W.submit({ title: 'verifier work', requires_security_role: 'verifier' });
  const G = await W.enroll('C-G generic', { roles: ['generic'], max_concurrent_runs: 2, max_heavy: 1 }); const g = await as(G);
  const gv = await g.op('claim', { only_work_order_id: wV, resources: best() });
  const vv = await claim(V, wV);
  port('shared_control_plane_acceptance.mjs:179 CP-9', 'roles: a generic node does not get the verifier work order; a verifier node does', /gate 5/.test(gv.message || '') && vv.claimed);
  const liar = await g.op('claim', { only_work_order_id: wV, resources: best(), security_role: 'release_broker' });
  port('shared_control_plane_acceptance.mjs:183 CP-10', 'a node asserting a role in its claim does not get the work (the body naming a role is refused; authority is the envelope)',
    liar.refused === 'identity_from_body_refused');
  const tdone = await done(B, cT2.claimed.run_id, { head_commit: 'c'.repeat(40), candidate_tree: 'd'.repeat(40) });
  const selfV = await A.t.op('verification-claim', { only_work_order_id: tdone.verification_work_order_id, resources: best() });
  const otherV = await V.t.op('verification-claim', { only_work_order_id: tdone.verification_work_order_id, resources: best() });
  const cert = otherV.claimed && await V.t.op('certify', { run_id: otherV.claimed.run_id, verdict: 'PASS', work_order_id: wT, candidate_run_id: cT2.claimed.run_id,
    candidate_tree: 'd'.repeat(40), candidate_commit: 'c'.repeat(40) });
  port('shared_control_plane_acceptance.mjs:210 CP-11', 'independence: a different node verifies the authored run; the authoring set cannot verify itself', /gate 7/.test(selfV.message || '') && cert && cert.ok);
  const vFailed = (await sup.query(`select count(*)::int n from factory.work_orders where verifies_work_order_id = $1`, [wF])).rows[0].n;
  port('node_truth_acceptance.mjs:1122 N12', 'only a finished, successful run can be verified: a FAILED run yields no verification work at all', vFailed === 0);
  // ---- the node's own authority (69df2f52 behaviour INVERTED by the contract, S-4)
  const envBefore = (await sup.query(`select current_envelope_version v from factory.computers where computer_id = $1`, [A.computer_id])).rows[0].v;
  const n2 = await A.t.op('heartbeat', { phase: 'AVAILABLE', security_role: 'release_broker' });
  const n2b = await A.t.op('heartbeat', { phase: 'AVAILABLE' });
  const envAfter = (await sup.query(`select current_envelope_version v from factory.computers where computer_id = $1`, [A.computer_id])).rows[0].v;
  port('node_truth_acceptance.mjs:201 N2 (INVERTED)', 'the node\'s beat can no longer assert its own role: the body is refused, the envelope unchanged; authority comes only from the envelope (S-4)',
    n2.refused === 'identity_from_body_refused' && n2b.ok && envBefore === envAfter);
  const freshReg = await W.enroll('C-reg', env);
  await asEngine(sup, () => sup.query(`update factory.nodes set last_heartbeat_at = to_timestamp(0) where node_id = $1`, [freshReg.node_id]));
  await freshReg.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest });
  const liv = (await admin.call('get-computer', { computer_id: freshReg.computer_id }, founder.token)).computer.principals[0].runtime.liveness;
  port('node_truth_acceptance.mjs:1299 N8 / claim.mjs:75 (stamp:false)', 'registration alone never reads ALIVE: liveness is stamped only by a heartbeat or a renewal', liv === 'OFFLINE', liv);
} finally {
  for (const d of direct) await d.close().catch(() => {});
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\ncompat_regressions [' + TRANSPORT + ']: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id).join(', ') : ''));
const js = arg('--json', null);
if (js) writeFileSync(js, JSON.stringify({ transport: TRANSPORT, migration_sha256: sha256(compose()), results }, null, 2) + '\n');
const ev = arg('--evidence', null);
if (ev) writeFileSync(ev, ['qa/factory/v1/compat_regressions.mjs --transport ' + TRANSPORT, 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + '  ' + r.label + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
void apiNode;
