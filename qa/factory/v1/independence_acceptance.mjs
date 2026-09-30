#!/usr/bin/env node
// WO-9 / AC-14 (a)-(p) / AC-16 DEVELOPER VERIFICATION: the independence model and the verification state machine, through the product
// flows (Admin API + Node API). Every claimer reports a strictly larger resource figure than any earlier one, so ranking never decides
// a row: what refuses is the gate or the certification floor, by name. Developer verification, never independent.
//   (p4) runs FIRST: the real runtime code (setup's enrollNew and the worker, qa/factory/v1/realnode.mjs) enrolls this machine twice
//        through Add Computer; both records report the fingerprint the runtime itself computes, and it equals the registry's value
//   (i2) a campaign named without a policy row is never read as the tenant default: refused at gate 7 and at certification
//   (k2) the certification floor reached past gate 7, one check at a time, each by its reason name
//   (p2) every fingerprint ever reported counts, on both sides; (p3) an unknown fingerprint fails closed under the campaign, the
//        certifier's side; (p5) the author's side at gate 7; (k3) the certification floor's own check past gate 7
//   (o3) a refused resubmission returns the work order to the queue at once, its queue age kept and the refusal named on it; the
//        next repair claims it and is told the work order FAILED
// usage: node qa/factory/v1/independence_acceptance.mjs [--evidence <file>]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asEngine, ed25519 } from './fixtures.mjs';
import { world, recorder, RES } from './flows.mjs';
import { realEnroll, realWork, registryFingerprint } from './realnode.mjs';

const { results, row } = recorder();
const W = await world();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ram = 100000;
const best = () => RES((ram += 1000));
const tree = (s) => createHash('sha1').update(s).digest('hex');
const gate7 = (r) => r.refused === 'not_eligible' && /gate 7 independence/.test(r.message || '');
try {
  const { founder, sup, admin } = W;
  const env = (roles = ['generic', 'verifier']) => ({ roles, max_concurrent_runs: 3, max_heavy: 1 });
  const author = async (x, wo, t = tree(wo), { checkpoint = false, claimed = null } = {}) => {
    const c = claimed || await x.n.op('claim', { only_work_order_id: wo, resources: best() });
    if (!c.claimed) throw new Error('author claim failed: ' + JSON.stringify(c));
    const cp = checkpoint ? await x.n.op('checkpoint', { run_id: c.claimed.run_id, location: 'git://o@1', scenario: 'mid' }) : null;
    const d = await x.n.op('complete', { run_id: c.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: t.slice(0, 40), candidate_tree: t });
    if (!d.ok) throw new Error('complete failed: ' + JSON.stringify(d));
    return { run: c.claimed.run_id, v: d.verification_work_order_id, tree: t, checkpoint: cp && cp.checkpoint_id, view: c.claimed.work_order };
  };
  const vclaim = (x, v) => x.n.op('verification-claim', { only_work_order_id: v, resources: best() });
  const certify = (x, vr, wo, cand, verdict = 'PASS', extra = {}) => x.n.op('certify', { run_id: vr, verdict, work_order_id: wo, candidate_run_id: cand.run,
    candidate_tree: cand.tree, candidate_commit: cand.tree.slice(0, 40), ...extra });
  const state = async (wo) => (await sup.query(`select status, verification_state from factory.work_orders where work_order_id = $1`, [wo])).rows[0];
  const fps = { a: '1'.repeat(64), c: '3'.repeat(64) };
  const reason = (r) => (r && r.refused === 'certification_refused' ? r.reason : r && (r.ok ? 'CERTIFIED' : r.refused));

  // (p4) AC-14(p) / R-3 WITH THE REAL RUNTIME CODE on this machine - no fingerprint injected: each "install" is its own process
  // running setup's enrollNew and the worker (realnode.mjs) in its own home. RT-1 (generic) authors a campaign probe through its worker;
  // RT-2 (verifier) is the only verifier. Both records report the fingerprint the runtime computes, equal to the registry's value read
  // independently, so RT-2's verification claim is refused at gate 7 and nothing is certified. Envelopes narrowed to one company.
  const P4CO = '44444444-4444-4444-8444-444444444444';
  const realHome = mkdtempSync(join(tmpdir(), 'bf-p4-'));
  const regFp = registryFingerprint();
  const p4env = (roles) => ({ roles, company_ids: [P4CO], max_concurrent_runs: 1, max_heavy: 1 });
  const r1Add = await admin.call('add-computer', { display_name: 'RT-1 this machine', envelope: p4env(['generic']) }, founder.token);
  const r2Add = await admin.call('add-computer', { display_name: 'RT-2 this machine again', envelope: p4env(['verifier']) }, founder.token);
  const rt = { api: W.node.baseUrl, version: '0.1.0', digest: W.rel.digest };
  const e1 = await realEnroll({ ...rt, home: join(realHome, 'rt1'), code: r1Add.pairing_code });
  const e2 = await realEnroll({ ...rt, home: join(realHome, 'rt2'), code: r2Add.pairing_code });
  const p4recs = (await sup.query(`select m.computer_id, m.registered_fingerprint, (select array_agg(f.fingerprint) from factory.computer_fingerprints f where f.computer_id = m.computer_id) fps,
      (select e.state from factory.enrollments e where e.computer_id = m.computer_id order by e.started_at desc limit 1) walk
      from factory.computers m where m.computer_id = any ($1)`, [[r1Add.computer_id, r2Add.computer_id]])).rows;
  const wp4 = await W.submit({ title: 'p4 campaign probe', work_type: 'probe', company_id: P4CO, requires_verification: true, campaign_key: 'auto-enrollment-v1',
    owned_surface: ['product/p4'], handoff: JSON.stringify({ steps: 1, step_ms: 50, salt: 'p4' }) });
  const rw1 = await realWork({ ...rt, home: join(realHome, 'rt1') });
  const p4authored = await state(wp4);
  const rw2 = await realWork({ ...rt, home: join(realHome, 'rt2') });
  const p4after = await state(wp4);
  const p4certs = (await sup.query(`select count(*)::int n from factory.certifications where work_order_id = $1`, [wp4])).rows[0].n;
  const p4runFp = (await sup.query(`select machine_fingerprint f from factory.agent_runs where work_order_id = $1 and run_kind = 'authoring'`, [wp4])).rows.map((x) => x.f);
  const p4wait = (await admin.call('list-waiting-verifications', {}, founder.token)).waiting.items.find((i) => i.work_order.work_order_id === wp4);
  const rt2Node = (await sup.query(`select node_id from factory.nodes where computer_id = $1`, [r2Add.computer_id])).rows[0];
  const rt2Gate = p4wait && rt2Node && (p4wait.nodes.find((x) => x.node_id === rt2Node.node_id) || {}).first_failing_gate;
  try { rmSync(realHome, { recursive: true, force: true }); } catch { /* a DPAPI key file may still be locked; the temp dir goes with the OS */ }
  row('(p4) the REAL runtime code enrolls this machine twice through Add Computer (two records, two homes, two processes): both report the SAME non-null fingerprint, the one the registry holds (sha256 of the MachineGuid exactly as stored); one authors a campaign probe through its worker and the other\'s verification claim is refused at gate 7 "fingerprint equal" - nothing is certified',
    e1.workerExit === 0 && e2.workerExit === 0 && regFp.fingerprint && p4recs.length === 2
      && p4recs.every((x) => x.registered_fingerprint === regFp.fingerprint && JSON.stringify(x.fps) === JSON.stringify([regFp.fingerprint]) && x.walk === 'ALIVE')
      && rw1.workerExit === 0 && rw2.workerExit === 0 && p4runFp.length === 1 && p4runFp[0] === regFp.fingerprint
      && p4authored.verification_state === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && p4after.verification_state === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && p4certs === 0
      && rt2Gate && rt2Gate.gate === 7 && /fingerprint equal/.test(rt2Gate.detail),
    JSON.stringify({ enroll: [e1.status, e1.workerExit, e2.status, e2.workerExit], registry: regFp.fingerprint && regFp.fingerprint.slice(0, 12), recs: p4recs.map((x) => [x.registered_fingerprint && x.registered_fingerprint.slice(0, 12), x.walk]),
      work: [rw1.workerExit, rw2.workerExit], run: p4runFp.map((f) => f && f.slice(0, 12)), authored: p4authored, after: p4after, certs: p4certs, rt2: rt2Gate,
      out: [e1, e2, rw1, rw2].some((x) => x.workerExit !== 0) ? [e1, e2, rw1, rw2].map((x) => (x.stdout + x.stderr).slice(-300)).join(" | ") : undefined }).slice(0, 2500));

  const A = await W.enroll('I-A', env(), { fingerprint: fps.a });
  const C = await W.enroll('I-C', env(), { fingerprint: fps.c });

  // (a) the authoring run cannot certify itself
  const w1 = await W.submit({ title: 'a', requires_verification: true });
  const a1 = await author(A, w1);
  const selfCert = await certify(A, a1.run, w1, a1);
  row('(a) the authoring run cannot certify itself (it holds no verification work: superseded, nothing certified)', selfCert.refused === 'superseded'
    && (await state(w1)).verification_state === 'WAITING_FOR_INDEPENDENT_VERIFICATION');
  // (b) (c) a different hostname / fingerprint alone is insufficient
  await A.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, hostname: 'DESKTOP-MDPE6FS', fingerprint: '9'.repeat(64) });
  await A.n.op('heartbeat', { phase: 'RECOVERING' }); await A.n.op('heartbeat', { phase: 'AVAILABLE', resources: best() });
  const bc = await vclaim(A, a1.v);
  row('(b)(c) the author re-reporting a different hostname (even the preferred verifier\'s) and a different fingerprint is still refused as verifier: gate 7 (identity in the authoring set)', gate7(bc), bc.message);
  // (d) the same hostname is acceptable when every real requirement passes and the policy permits
  await C.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, hostname: 'DESKTOP-MDPE6FS', fingerprint: fps.c });
  await C.n.op('heartbeat', { phase: 'RECOVERING' }); await C.n.op('heartbeat', { phase: 'AVAILABLE', resources: best() });
  const dc = await vclaim(C, a1.v);
  const dcert = dc.claimed && await certify(C, dc.claimed.run_id, w1, a1);
  row('(d) under the tenant default, a verifier reporting the SAME hostname as the author certifies when identity, run, authority and provenance all pass',
    dc.claimed && dcert.ok && (await state(w1)).verification_state === 'COMPLETE');
  // (f) no eligible verifier -> WAITING, never self-certified
  const w2 = await W.submit({ title: 'f', requires_verification: true });
  const a2 = await author(C, w2);
  await admin.call('drain', { computer_id: A.computer_id }, founder.token);
  const fAuthor = await vclaim(C, a2.v);
  const waiting = await admin.call('list-waiting-verifications', {}, founder.token);
  const item = waiting.waiting.items.find((i) => i.work_order.work_order_id === w2);
  row('(f) with no eligible verifier (the other node draining; the author refused) the work stays WAITING and is never self-certified; the waiting view names each node\'s first failing gate',
    gate7(fAuthor) && (await state(w2)).verification_state === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && item && item.eligible_verifiers === 0
      && item.nodes.some((n) => n.first_failing_gate && n.first_failing_gate.gate === 9) && item.nodes.some((n) => n.first_failing_gate && n.first_failing_gate.gate === 7));
  await admin.call('drain', { computer_id: A.computer_id, drain: false }, founder.token);
  await A.n.op('heartbeat', { phase: 'AVAILABLE', resources: best() });
  // (g) a second run of an authoring identity cannot certify: C authored w2; a fresh session and a new claim do not change that
  await C.n.session();
  const g2 = await vclaim(C, a2.v);
  row('(g) a second run (a new session) of an authoring identity cannot take the verification', gate7(g2));
  // (h) a certifier whose CURRENT envelope lost verifier authority is refused
  const hc = await vclaim(A, a2.v);
  await admin.call('amend-envelope', { computer_id: A.computer_id, expected_version: 1, envelope: env(['generic']) }, founder.token);
  const hcert = hc.claimed && await certify(A, hc.claimed.run_id, w2, a2);
  row('(h) verifier authority is read from the certifier\'s CURRENT envelope: removed after the claim, the certification is refused (no_verifier_authority)',
    hc.claimed && hcert.refused === 'certification_refused' && /no_verifier_authority/.test(hcert.message));
  await admin.call('amend-envelope', { computer_id: A.computer_id, expected_version: 2, envelope: env() }, founder.token);
  const hcert2 = await certify(A, hc.claimed.run_id, w2, a2);
  // (k) policy data relaxed on a copy: the front door still enforces the floor
  await sup.query('begin'); await sup.query('set local role factory_owner');
  await sup.query(`update factory.verification_policies set require_distinct_run = false, require_distinct_identity = false, require_verifier_authority = false,
      version = version + 1, updated_by = 'test: relaxed on a copy' where scope = 'tenant_default'`);
  await sup.query('commit');
  const w3 = await W.submit({ title: 'k', requires_verification: true });
  const a3 = await author(A, w3);
  const kc = await vclaim(A, a3.v);
  row('(k) with the policy data relaxed on the copy (every floor flag false), the front door still refuses the author as verifier (the S-13 floor)', gate7(kc));
  void hcert2;
  // (m) two principals on one computer: the policy decides - tenant default allows, the campaign refuses (same computer record)
  const cp = await admin.call('create-principal', { computer_id: C.computer_id }, founder.token);
  const C2 = await W.pair({ ...cp, computer_id: C.computer_id }, { fingerprint: '4'.repeat(64), name: 'I-C second principal' });
  const kcert = await vclaim(C2, a3.v);
  const kc2 = kcert.claimed && await certify(C2, kcert.claimed.run_id, w3, a3);
  const wc = await W.submit({ title: 'm campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/m'] });
  const ac = await author(C, wc);
  const mc = await vclaim(C2, ac.v);
  row('(m) two principals on one computer: under the tenant default the second principal may certify the first\'s work; under the campaign it is refused (same enrolled computer record), even reporting a different fingerprint',
    C2.principal_id !== C.principal_id && kcert.claimed && kc2.ok && gate7(mc) && /same enrolled computer record/.test(mc.message), mc.message);
  // (i) the campaign requires separation for every candidate, whoever the author: equal fingerprints refuse; a different record AND fingerprint certifies
  const E = await W.enroll('I-E same machine as C', env(), { fingerprint: fps.c });
  const ic = await vclaim(E, ac.v);
  const F = await W.enroll('I-F other machine', env(), { fingerprint: '6'.repeat(64) });
  const fc = await vclaim(F, ac.v);
  const fcert = fc.claimed && await certify(F, fc.claimed.run_id, wc, ac);
  const cert = (await sup.query(`select policies from factory.certifications where work_order_id = $1`, [wc])).rows[0];
  row('(i)(e) the campaign: another computer record that reported the author\'s fingerprint is refused; a different record AND fingerprint certifies; the record cites both policies (campaign adds, the default is unchanged)',
    /fingerprint equal/.test(ic.message || '') && fc.claimed && fcert.ok && cert && cert.policies.length === 2, ic.message);
  // (i2) S-16(b), P-9 (fail closed): a work order whose campaign has no policy row is never read as "the tenant default". The name is set by a
  // developer fixture (as the engine): the Admin API refuses to store an unknown campaign_key (admin G3).
  const wi2 = await W.submit({ title: 'i2', requires_verification: true, owned_surface: ['product/i2'] });
  const ai2 = await author(A, wi2);
  const setCamp = (k) => asEngine(sup, () => sup.query(`update factory.work_orders set campaign_key = $2 where work_order_id = $1 or verifies_work_order_id = $1`, [wi2, k]));
  await setCamp('no-such-campaign');
  const i2claim = await vclaim(F, ai2.v);
  await setCamp(null);
  const i2held = await vclaim(F, ai2.v);
  await setCamp('no-such-campaign');
  const i2cert = i2held.claimed && await certify(F, i2held.claimed.run_id, wi2, ai2);
  const i2st = await state(wi2);
  if (i2held.claimed) await F.n.op('release', { run_id: i2held.claimed.run_id });
  row('(i2) a work order naming a campaign with no policy row: the verification claim is refused at gate 7 ("no policy row", no fallback to the tenant default), and a claim taken before is refused at certification (campaign_unknown) - never certified under the default',
    gate7(i2claim) && /no policy row/.test(i2claim.message) && i2held.claimed && reason(i2cert) === 'campaign_unknown' && i2st.verification_state === 'VERIFICATION_CLAIMED',
    JSON.stringify({ claim: i2claim.message, held: !!i2held.claimed, cert: i2cert && (i2cert.message || i2cert.ok), st: i2st }).slice(0, 500));
  // (k2) WO-9 (node_certify holds the floor itself): the certification floor reached PAST gate 7 (which passed at the claim), one check at a time, each by its reason name
  const k2 = {};
  {
    // run_in_authoring_set: the verifier's own verification run wrote a checkpoint, and the candidate is made (fixture) to have consumed it
    const w = await W.submit({ title: 'k2 run', requires_verification: true, owned_surface: ['product/k2-run'] });
    const a = await author(A, w);
    const v = await vclaim(F, a.v);
    const cp = await F.n.op('checkpoint', { run_id: v.claimed.run_id, location: 'git://k2@1', scenario: 'k2' });
    await asEngine(sup, () => sup.query(`update factory.agent_runs set resumed_from_checkpoint_id = $2 where run_id = $1`, [a.run, cp.checkpoint_id]));
    k2.run = await certify(F, v.claimed.run_id, w, a);
    await F.n.op('release', { run_id: v.claimed.run_id });
    // identity_in_authoring_set: an authoring run of the verifier's principal is added to the work order (fixture)
    const w2 = await W.submit({ title: 'k2 identity', requires_verification: true, owned_surface: ['product/k2-identity'] });
    const a2 = await author(A, w2);
    const v2 = await vclaim(F, a2.v);
    await asEngine(sup, () => sup.query(`insert into factory.agent_runs (work_order_id, node_id, status, started_at, finished_at, authoring_node_id, principal_id, computer_id,
        credential_id, run_kind, assignment_role, envelope_version, tenant_id, termination_reason)
      select $1, r.node_id, 'failed', now(), now(), r.node_id, r.principal_id, r.computer_id, r.credential_id, 'authoring', 'generic', r.envelope_version, r.tenant_id, 'developer fixture'
        from factory.agent_runs r where r.run_id = $2`, [w2, v2.claimed.run_id]));
    k2.identity = await certify(F, v2.claimed.run_id, w2, a2);
    await F.n.op('release', { run_id: v2.claimed.run_id });
    // provenance_not_current: after the claim, a newer candidate replaced the one claimed (fixture)
    const w5 = await W.submit({ title: 'k2 provenance', requires_verification: true, owned_surface: ['product/k2-prov'] });
    const a5 = await author(A, w5);
    const v5 = await vclaim(F, a5.v);
    await asEngine(sup, () => sup.query(`update factory.work_orders set current_candidate_run_id = $2 where work_order_id = $1`, [w5, a.run]));
    k2.provenance = await certify(F, v5.claimed.run_id, w5, a5);
    await F.n.op('release', { run_id: v5.claimed.run_id });
    // campaign_same_fingerprint, by product calls only: a verifier on another record with another fingerprint claims; it then reports
    // the author's fingerprint before certifying
    const w3 = await W.submit({ title: 'k2 campaign fingerprint', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/k2-fp'] });
    const a3 = await author(A, w3);
    const K1 = await W.enroll('I-K2 verifier', env(), { fingerprint: 'a1'.repeat(32) });
    const v3 = await vclaim(K1, a3.v);
    await K1.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fps.a });
    k2.fingerprint = v3.claimed ? await certify(K1, v3.claimed.run_id, w3, a3) : v3;
    if (v3.claimed) await K1.n.op('release', { run_id: v3.claimed.run_id });
    // campaign_same_computer: after the claim, an authoring run of ANOTHER principal of the verifier's computer is added (fixture)
    const w4 = await W.submit({ title: 'k2 campaign computer', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/k2-comp'] });
    const a4 = await author(A, w4);
    const K2 = await W.enroll('I-K2 verifier 2', env(), { fingerprint: 'a2'.repeat(32) });
    const v4 = await vclaim(K2, a4.v);
    const k2p = await admin.call('create-principal', { computer_id: K2.computer_id }, founder.token);
    await asEngine(sup, () => sup.query(`insert into factory.agent_runs (work_order_id, node_id, status, started_at, finished_at, authoring_node_id, principal_id, computer_id,
        credential_id, run_kind, assignment_role, envelope_version, tenant_id, termination_reason)
      select $1, r.node_id, 'failed', now(), now(), r.node_id, $3, r.computer_id, r.credential_id, 'authoring', 'generic', r.envelope_version, r.tenant_id, 'developer fixture'
        from factory.agent_runs r where r.run_id = $2`, [w4, v4.claimed.run_id, k2p.principal_id]));
    k2.computer = v4.claimed ? await certify(K2, v4.claimed.run_id, w4, a4) : v4;
    if (v4.claimed) await K2.n.op('release', { run_id: v4.claimed.run_id });
  }
  row('(k2) the certification floor holds by itself past gate 7 (the gate passed at the claim): run_in_authoring_set, identity_in_authoring_set and provenance_not_current (developer fixtures), campaign_same_fingerprint (the verifier then reports the author\'s fingerprint - product calls only) and campaign_same_computer (another principal of its computer in the authoring set), each refused by its own reason',
    reason(k2.run) === 'run_in_authoring_set' && reason(k2.identity) === 'identity_in_authoring_set' && reason(k2.provenance) === 'provenance_not_current'
      && reason(k2.fingerprint) === 'campaign_same_fingerprint' && reason(k2.computer) === 'campaign_same_computer',
    JSON.stringify(Object.fromEntries(Object.entries(k2).map(([k, v]) => [k, reason(v) || (v && v.message)]))));
  // (p) one machine enrolled twice (two computer records, one fingerprint): refused under the campaign - also after the author's computer
  // later reports a different fingerprint
  const P1 = await W.enroll('VM twice (1)', env(), { fingerprint: '7'.repeat(64) });
  const P2 = await W.enroll('VM twice (2)', env(), { fingerprint: '7'.repeat(64) });
  const wp = await W.submit({ title: 'p campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/p'] });
  const ap = await author(P1, wp);
  await P1.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: '8'.repeat(64) });
  const pc = await vclaim(P2, ap.v);
  row('(p) one machine enrolled twice through Add Computer (two records, one fingerprint): the campaign refuses certification between them, also after the author\'s computer reports a new fingerprint', /fingerprint equal/.test(pc.message || ''), pc.message);
  // (p2) any fingerprint EVER reported counts, on both sides: the author's computer reported a (enrollment) then b (its run carries b);
  // the certifier reported c (enrollment), then a, then d. They meet only through their histories (a)
  const fq = { a: 'a3'.repeat(32), b: 'b3'.repeat(32), c: 'c3'.repeat(32), d: 'd3'.repeat(32) };
  const Q1 = await W.enroll('I-Q1', env(), { fingerprint: fq.a });
  await Q1.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fq.b });
  const wq = await W.submit({ title: 'p2 campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/p2'] });
  const aq = await author(Q1, wq);
  const Q2 = await W.enroll('I-Q2', env(), { fingerprint: fq.c });
  await Q2.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fq.a });
  await Q2.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fq.d });
  const q2c = await vclaim(Q2, aq.v);
  const q1run = (await sup.query(`select machine_fingerprint f from factory.agent_runs where run_id = $1`, [aq.run])).rows[0].f;
  const q2node = (await sup.query(`select machine_fingerprint f from factory.nodes where node_id = $1`, [Q2.node_id])).rows[0].f;
  row('(p2) every fingerprint ever reported counts, on both sides: the author\'s run carries b, the certifier\'s latest report is d, and they meet only through their histories (the author\'s enrollment a, the certifier\'s earlier report a) - refused at gate 7 "fingerprint equal"',
    q1run === fq.b && q2node === fq.d && gate7(q2c) && /fingerprint equal/.test(q2c.message || ''), q2c.message || JSON.stringify(q2c).slice(0, 200));
  // (p3) fail closed: under the campaign, a certifier on another record that has never reported any fingerprint is refused
  const wz = await W.submit({ title: 'p3 campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/p3'] });
  const az = await author(A, wz);
  const Z = await W.enroll('I-Z reports no fingerprint', env(), { fingerprint: false });
  const zc = await vclaim(Z, az.v);
  const zRec = (await sup.query(`select (select count(*)::int from factory.computer_fingerprints f where f.computer_id = $1) n, (select registered_fingerprint from factory.computers where computer_id = $1) r`, [Z.computer_id])).rows[0];
  row('(p3) under the campaign a certifier whose computer has never reported a machine fingerprint cannot show physical separation: refused at gate 7 ("fingerprint is unknown"), never let through because an unknown side matches nothing',
    zRec.n === 0 && zRec.r === null && gate7(zc) && /fingerprint is unknown/.test(zc.message || ''), zc.message || JSON.stringify(zc).slice(0, 200));
  // (p5) fail closed on the AUTHOR's side: Z (whose computer has never reported a fingerprint) authors a campaign work order, so its run
  // carries none either; F (another record, a known fingerprint) is refused at gate 7 - nothing about the author's machine is known
  const wu = await W.submit({ title: 'p5 campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/p5'] });
  const au = await author(Z, wu);
  const uRunFp = (await sup.query(`select machine_fingerprint f from factory.agent_runs where run_id = $1`, [au.run])).rows[0].f;
  const uc = await vclaim(F, au.v);
  if (uc.claimed) await F.n.op('release', { run_id: uc.claimed.run_id });
  row('(p5) under the campaign an author whose computer has never reported a machine fingerprint (its run carries none) cannot be shown to be on another machine: a certifier on another record with a known fingerprint is refused at gate 7 ("fingerprint is unknown")',
    uRunFp === null && gate7(uc) && /fingerprint is unknown/.test(uc.message || ''), JSON.stringify({ run: uRunFp, claim: uc.message || (uc.claimed ? 'CLAIMED' : uc.refused) }).slice(0, 300));
  // (k3) the certification floor's own unknown-fingerprint check, reached PAST gate 7: F claims Z's candidate under the tenant default
  // (gate 7 passes: no campaign), then the work order is put under the campaign (developer fixture, as (i2) does) before F certifies
  const wk3 = await W.submit({ title: 'k3', requires_verification: true, owned_surface: ['product/k3'] });
  const ak3 = await author(Z, wk3);
  const k3claim = await vclaim(F, ak3.v);
  await asEngine(sup, () => sup.query(`update factory.work_orders set campaign_key = 'auto-enrollment-v1' where work_order_id = $1 or verifies_work_order_id = $1`, [wk3]));
  const k3cert = k3claim.claimed ? await certify(F, k3claim.claimed.run_id, wk3, ak3) : k3claim;
  const k3st = await state(wk3);
  if (k3claim.claimed) await F.n.op('release', { run_id: k3claim.claimed.run_id });
  row('(k3) the certification floor refuses by itself when the author\'s machine fingerprint is unknown (the claim passed gate 7 under the tenant default; the work order is then under the campaign): campaign_fingerprint_unknown, nothing certified',
    k3claim.claimed && reason(k3cert) === 'campaign_fingerprint_unknown' && k3st.verification_state === 'VERIFICATION_CLAIMED',
    JSON.stringify({ claim: k3claim.claimed ? 'claimed' : k3claim.message || k3claim.refused, cert: reason(k3cert) || (k3cert && k3cert.message), st: k3st }).slice(0, 400));
  // (n) rotate / re-pair keep the principal: the author still cannot certify
  const wn = await W.submit({ title: 'n', requires_verification: true });
  const an = await author(E, wn);
  const nk = ed25519();
  const rot = await E.n.rotate(nk);
  const { apiNode } = await import('./nodeclient.mjs');
  const En = apiNode(W.node.baseUrl, nk); await En.session(); await En.op('heartbeat', { phase: 'AVAILABLE', resources: best() });
  const nr = await En.op('verification-claim', { only_work_order_id: an.v, resources: best() });
  const rp = await admin.call('repair', { computer_id: E.computer_id }, founder.token);
  const E3 = await W.pair({ ...rp, computer_id: E.computer_id }, { fingerprint: fps.c, name: 'E re-paired' });
  const np = await vclaim(E3, an.v);
  const cp2 = await admin.call('create-principal', { computer_id: F.computer_id }, founder.token);
  const F2 = await W.pair({ ...cp2, computer_id: F.computer_id }, { fingerprint: '6'.repeat(64), name: 'F second' });
  const f2k = ed25519(); const f2rot = await F2.n.rotate(f2k);
  const f2cred = (await sup.query(`select principal_id from factory.node_credentials where key_thumbprint = $1`, [f2k.thumbprint])).rows[0];
  row('(n) the author rotates its credential through the node operation, then is re-paired: each new credential carries the SAME principal and is refused as certifier; on a computer with P1 and P2, rotating P2 keeps P2',
    rot.ok && gate7(nr) && rp.ok && E3.principal_id === E.principal_id && gate7(np) && f2rot.ok && f2cred.principal_id === F2.principal_id && F2.principal_id !== F.principal_id);
  // (l) a node can never mint a principal, nor act under one not bound to its credential
  const mint = await fetch(W.node.baseUrl + '/v1/node/create-principal', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + F.n.token }, body: '{}' });
  const asOther = await F.n.op('heartbeat', { phase: 'AVAILABLE', principal_id: A.principal_id });
  const nodeApi = (await import('./plane.mjs')).connect;
  const nc = await nodeApi(W.plane.nodeApiUrl);
  let direct; try { await nc.query(`insert into factory.agent_principals (tenant_id, computer_id, node_id, created_via, created_by) values ('a1e0f000-0000-4000-8000-000000000001', $1, 'node-${'c'.repeat(32)}', 'admin_create', $2)`, [F.computer_id, founder.userId]); direct = 'ALLOWED'; } catch (e) { direct = e.code; } finally { await nc.end(); }
  row('(l) no route mints a principal (404); a body naming another principal is refused; the Node API role cannot write principals directly (42501)',
    mint.status === 404 && asOther.refused === 'identity_from_body_refused' && direct === '42501');
  // (o) provenance: an earlier candidate, another work order, a checkpoint - refused, never COMPLETE; FAIL -> repair (no founder poke),
  // a resubmission of the failed tree refused, no automatic re-verification
  const wo_ = await W.submit({ title: 'o', requires_verification: true, work_type: 'repair-o' });
  const oQueuedAt = (await sup.query(`select queued_at::text q from factory.work_orders where work_order_id = $1`, [wo_])).rows[0].q;
  const ao = await author(A, wo_, tree('o-candidate-1'));
  const vo = await vclaim(F, ao.v);
  const fail = await certify(F, vo.claimed.run_id, wo_, ao, 'FAIL', { reason: 'rows do not reproduce' });
  const afterFail = await state(wo_);
  const noAuto = (await sup.query(`select count(*)::int n from factory.work_orders where verifies_work_order_id = $1 and status = 'queued'`, [wo_])).rows[0].n;
  const resub = await A.n.op('claim', { only_work_order_id: wo_, resources: best() });
  const resubDone = resub.claimed && await A.n.op('complete', { run_id: resub.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: ao.tree.slice(0, 40), candidate_tree: ao.tree });
  row('(o1)/AC-16 a FAIL moves the work order to VERIFICATION_FAILED and back to the queue for repair with no founder step; it is never COMPLETE, its candidate is never re-verified automatically, and a resubmission of the same tree is refused',
    fail.ok && afterFail.verification_state === 'VERIFICATION_FAILED' && afterFail.status === 'queued' && noAuto === 0 && resubDone && resubDone.refused === 'resubmission_refused');
  // (o3) AC-16, P-6, P-9, P-10 (the r3 dispatch rules; a limit on such repairs is change request CR-014): after the refused
  // resubmission the work order is in the queue again at once - nothing withholds it - still VERIFICATION_FAILED, the refusal and the
  // refused tree named in its reason, and with the queue age it had at submission (kept through the FAIL and the refusal). The next
  // repair takes it by its work type, with no founder step.
  const o3 = (await sup.query(`select queued_at::text q, verification_reason why, status, verification_state vs from factory.work_orders where work_order_id = $1`, [wo_])).rows[0];
  const oRuns = async () => (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1 and run_kind = 'authoring'`, [wo_])).rows[0].n;
  const n0 = await oRuns();
  const next = await A.n.op('claim', { work_types: ['repair-o'], resources: best() });
  row('(o3) after the refused resubmission the work order is queued again at once, still VERIFICATION_FAILED, with a reason naming the refusal and the refused tree, and its queue age unchanged through the FAIL and the refusal; the next repair (a claim by work type) takes it with no founder step',
    o3.status === 'queued' && o3.vs === 'VERIFICATION_FAILED' && /^resubmission refused/.test(o3.why || '') && (o3.why || '').includes(ao.tree.slice(0, 12)) && o3.q === oQueuedAt
      && n0 === 2 && next.claimed && next.claimed.work_order.work_order_id === wo_,
    JSON.stringify({ o3, oQueuedAt, n0, next: next.claimed ? next.claimed.work_order.work_order_id === wo_ : next.refused || 'none' }).slice(0, 600));
  if (!next.claimed) throw new Error('(o3) the next repair claimed nothing');
  const ao2 = await author(A, wo_, tree('o-candidate-2'), { checkpoint: true, claimed: next });
  const vo2 = await vclaim(F, ao2.v);
  const oldCand = await certify(F, vo2.claimed.run_id, wo_, ao);
  const otherWo = await certify(F, vo2.claimed.run_id, w2, ao2);
  if (!ao2.checkpoint) throw new Error('no checkpoint for (o2)');
  const asCp = await certify(F, vo2.claimed.run_id, wo_, { run: ao2.checkpoint, tree: ao2.tree });
  const stillWaiting = await state(wo_);
  const good = await certify(F, vo2.claimed.run_id, wo_, ao2);
  row('(o2) the repair\'s claimed view shows VERIFICATION_FAILED and lists the FAILED tree; the repair\'s new tree is then the current candidate, with no founder step; a certification naming an EARLIER candidate, ANOTHER work order, or anything but the completing run is refused (provenance_mismatch) and never completes the work order; the current candidate then certifies',
    ao2.view && ao2.view.verification_state === 'VERIFICATION_FAILED' && JSON.stringify(ao2.view.failed_candidate_trees) === JSON.stringify([ao.tree])
      && [oldCand, otherWo, asCp].every((r) => r.refused === 'certification_refused' && /provenance_mismatch/.test(r.message))
      && stillWaiting.verification_state === 'VERIFICATION_CLAIMED' && good.ok && (await state(wo_)).verification_state === 'COMPLETE',
    JSON.stringify({ vo2: vo2.claimed ? 'claimed' : vo2, old: oldCand.message, other: otherWo.message, cp: asCp.message, still: stillWaiting, good: good.ok || good.message }).slice(0, 700));
  // (j) after a takeover neither A nor B can certify (the whole authoring set)
  const wj = await W.submit({ title: 'j', requires_verification: true, owned_surface: ['product/j'] });
  const B = await W.enroll('I-B', env(), { fingerprint: '5'.repeat(64) });
  const ja = await A.n.op('claim', { only_work_order_id: wj, lease_seconds: 5, resources: best() });
  await A.n.op('checkpoint', { run_id: ja.claimed.run_id, location: 'git://j@1', scenario: 'half' });
  await sleep(6500);
  const jb = await B.n.op('claim', { only_work_order_id: wj, resources: best() });
  const jd = await B.n.op('complete', { run_id: jb.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: tree('j').slice(0, 40), candidate_tree: tree('j') });
  const jva = await vclaim(A, jd.verification_work_order_id); const jvb = await vclaim(B, jd.verification_work_order_id);
  const jvf = await vclaim(F, jd.verification_work_order_id);
  row('(j) after a takeover NO member of the authoring set (A or B) can certify; a third identity can', jb.claimed && jb.claimed.resume_from && gate7(jva) && gate7(jvb) && jvf.claimed);
  // (j2) S-13 "every run that held a lease": a run whose lease lapsed BEFORE any checkpoint is in the authoring set too - it wrote nothing
  // the completing run consumed, so only the lease-holder branch keeps it there (found by the v1 mutation proof, mutant IN2)
  const wj2 = await W.submit({ title: 'j2', requires_verification: true, owned_surface: ['product/j2'] });
  const A2 = await W.enroll('I-A2', env(), { fingerprint: '6'.repeat(64) });
  const j2a = await A2.n.op('claim', { only_work_order_id: wj2, lease_seconds: 5, resources: best() });
  await sleep(6500);
  const j2b = await B.n.op('claim', { only_work_order_id: wj2, resources: best() });
  const j2d = j2b.claimed && await B.n.op('complete', { run_id: j2b.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: tree('j2').slice(0, 40), candidate_tree: tree('j2') });
  const j2v = j2d && j2d.verification_work_order_id ? await vclaim(A2, j2d.verification_work_order_id) : null;
  row('(j2) a run that held a lease and wrote NO checkpoint (its lease lapsed first) stays in the authoring set: after B completes from scratch, that identity cannot take the verification (gate 7)',
    j2a.claimed && j2b.claimed && !j2b.claimed.resume_from && j2d && j2d.ok && gate7(j2v), JSON.stringify({ a: !!(j2a && j2a.claimed), b: !!(j2b && j2b.claimed), resumed: j2b.claimed && j2b.claimed.resume_from, done: j2d && (j2d.ok || j2d.refused), v: j2v && (j2v.claimed ? 'CLAIMED' : j2v.message) }).slice(0, 400));
  // (r) L5-F9 (contract §2 Verification: VERIFICATION_CLAIMED -> WAITING_FOR_INDEPENDENT_VERIFICATION when the verifier's credential is
  // revoked; §6: its authoring leases lapse into the takeover; AC-4: its evidence unchanged): revoking - or archiving - the computer of
  // a verifier holding a 600 s claim returns the work order to WAITING at once, and another verifier claims it at once. The revoked
  // verifier's checkpoint and authoring run stay byte-identical; of its verification run only the lease (given back) and updated_at change.
  const wr = await W.submit({ title: 'r', requires_verification: true, owned_surface: ['product/r'] });
  const ar_ = await author(A, wr);
  const V1 = await W.enroll('I-V1', env(), { fingerprint: 'd'.repeat(64) });
  const V2 = await W.enroll('I-V2', env(), { fingerprint: 'e'.repeat(64) });
  const V3 = await W.enroll('I-V3', env(), { fingerprint: 'f'.repeat(64) });
  const xw = await W.submit({ title: 'r: the verifier also authors', owned_surface: ['product/r-x'] });
  const xa = await V1.n.op('claim', { only_work_order_id: xw, resources: best() });
  const xcp = xa.claimed && await V1.n.op('checkpoint', { run_id: xa.claimed.run_id, location: 'git://r@1', scenario: 'half' });
  const rc1 = await V1.n.op('verification-claim', { only_work_order_id: ar_.v, lease_seconds: 600, resources: best() });
  const claimedBefore = (await state(wr)).verification_state;
  const runOf = async (id) => (await sup.query(`select to_jsonb(r) j from factory.agent_runs r where run_id = $1`, [id])).rows[0].j;
  const cpsOf = async (p) => (await sup.query(`select coalesce(jsonb_agg(to_jsonb(k) order by k.checkpoint_id), '[]'::jsonb) j from factory.checkpoints k where k.principal_id = $1`, [p])).rows[0].j;
  const authBefore = xa.claimed && await runOf(xa.claimed.run_id), cpBefore = await cpsOf(V1.principal_id), vrBefore = rc1.claimed && await runOf(rc1.claimed.run_id);
  const rRev = await admin.call('revoke-credential', { computer_id: V1.computer_id }, founder.token);
  const afterRevoke = (await state(wr)).verification_state;
  const authAfter = xa.claimed && await runOf(xa.claimed.run_id), cpAfter = await cpsOf(V1.principal_id), vrAfter = rc1.claimed && await runOf(rc1.claimed.run_id);
  const strip = (j) => { const x = { ...j }; delete x.lease_expires_at; delete x.updated_at; return JSON.stringify(x); };
  const evidenceKept = JSON.stringify(authBefore) === JSON.stringify(authAfter) && JSON.stringify(cpBefore) === JSON.stringify(cpAfter) && cpAfter.length === 1
    && strip(vrBefore) === strip(vrAfter) && new Date(vrAfter.lease_expires_at) < new Date(vrBefore.lease_expires_at) && new Date(vrAfter.lease_expires_at) <= new Date();
  const rc2 = await V2.n.op('verification-claim', { only_work_order_id: ar_.v, lease_seconds: 600, resources: best() });
  const afterV2 = (await state(wr)).verification_state;
  const rArc = await admin.call('archive', { computer_id: V2.computer_id }, founder.token);
  const afterArchive = (await state(wr)).verification_state;
  const rc3 = await vclaim(V3, ar_.v);
  const rcert = rc3.claimed && await certify(V3, rc3.claimed.run_id, wr, ar_);
  const revAud = (await sup.query(`select detail from factory.audit_events where action = 'credential.revoked' and target_id = $1`, [V1.credential_id])).rows[0];
  row('(r) revoking a verifier holding a 600 s claim returns the work order to WAITING at once (audited: verification_claims_returned 1) and another verifier claims it at once; archiving that one does the same; a third certifies. The revoked verifier\'s checkpoint and authoring run are byte-identical, and of its verification run only the lease (given back) and updated_at changed',
    xa.claimed && xcp && xcp.ok && rc1.claimed && claimedBefore === 'VERIFICATION_CLAIMED' && rRev.ok && afterRevoke === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && evidenceKept
      && revAud && revAud.detail.verification_claims_returned === 1 && rc2.claimed && afterV2 === 'VERIFICATION_CLAIMED' && rArc.ok
      && afterArchive === 'WAITING_FOR_INDEPENDENT_VERIFICATION' && rc3.claimed && rcert && rcert.ok && (await state(wr)).verification_state === 'COMPLETE',
    JSON.stringify({ rc1: !!(rc1 && rc1.claimed), claimedBefore, afterRevoke, evidenceKept, aud: revAud && revAud.detail, rc2: rc2.claimed ? 'claimed' : rc2.message || rc2.refused, afterV2, afterArchive,
      rc3: rc3.claimed ? 'claimed' : rc3.message || rc3.refused, cert: rcert && (rcert.ok || rcert.message) }).slice(0, 900));
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 independence_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nindependence_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/independence_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
