#!/usr/bin/env node
// WO-9 / AC-14 (a)-(p) / AC-16 DEVELOPER VERIFICATION: the independence model and the verification state machine, through the product
// flows (Admin API + Node API). Every claimer reports a strictly larger resource figure than any earlier one, so ranking never decides
// a row: what refuses is the gate or the certification floor, by name. Developer verification, never independent.
// usage: node qa/factory/v1/independence_acceptance.mjs [--evidence <file>]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { ed25519 } from './fixtures.mjs';
import { world, recorder, RES } from './flows.mjs';

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
  const author = async (x, wo, t = tree(wo), { checkpoint = false } = {}) => {
    const c = await x.n.op('claim', { only_work_order_id: wo, resources: best() });
    if (!c.claimed) throw new Error('author claim failed: ' + JSON.stringify(c));
    const cp = checkpoint ? await x.n.op('checkpoint', { run_id: c.claimed.run_id, location: 'git://o@1', scenario: 'mid' }) : null;
    const d = await x.n.op('complete', { run_id: c.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: t.slice(0, 40), candidate_tree: t });
    if (!d.ok) throw new Error('complete failed: ' + JSON.stringify(d));
    return { run: c.claimed.run_id, v: d.verification_work_order_id, tree: t, checkpoint: cp && cp.checkpoint_id };
  };
  const vclaim = (x, v) => x.n.op('verification-claim', { only_work_order_id: v, resources: best() });
  const certify = (x, vr, wo, cand, verdict = 'PASS', extra = {}) => x.n.op('certify', { run_id: vr, verdict, work_order_id: wo, candidate_run_id: cand.run,
    candidate_tree: cand.tree, candidate_commit: cand.tree.slice(0, 40), ...extra });
  const state = async (wo) => (await sup.query(`select status, verification_state from factory.work_orders where work_order_id = $1`, [wo])).rows[0];
  const fps = { a: '1'.repeat(64), c: '3'.repeat(64) };
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
  // (p) one machine enrolled twice (two computer records, one fingerprint): refused under the campaign - also after the author's computer
  // later reports a different fingerprint
  const P1 = await W.enroll('VM twice (1)', env(), { fingerprint: '7'.repeat(64) });
  const P2 = await W.enroll('VM twice (2)', env(), { fingerprint: '7'.repeat(64) });
  const wp = await W.submit({ title: 'p campaign', requires_verification: true, campaign_key: 'auto-enrollment-v1', owned_surface: ['product/p'] });
  const ap = await author(P1, wp);
  await P1.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: '8'.repeat(64) });
  const pc = await vclaim(P2, ap.v);
  row('(p) one machine enrolled twice through Add Computer (two records, one fingerprint): the campaign refuses certification between them, also after the author\'s computer reports a new fingerprint', /fingerprint equal/.test(pc.message || ''), pc.message);
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
  const wo_ = await W.submit({ title: 'o', requires_verification: true });
  const ao = await author(A, wo_, tree('o-candidate-1'));
  const vo = await vclaim(F, ao.v);
  const fail = await certify(F, vo.claimed.run_id, wo_, ao, 'FAIL', { reason: 'rows do not reproduce' });
  const afterFail = await state(wo_);
  const noAuto = (await sup.query(`select count(*)::int n from factory.work_orders where verifies_work_order_id = $1 and status = 'queued'`, [wo_])).rows[0].n;
  const resub = await A.n.op('claim', { only_work_order_id: wo_, resources: best() });
  const resubDone = resub.claimed && await A.n.op('complete', { run_id: resub.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: ao.tree.slice(0, 40), candidate_tree: ao.tree });
  row('(o1)/AC-16 a FAIL moves the work order to VERIFICATION_FAILED and back to the queue for repair with no founder step; it is never COMPLETE, its candidate is never re-verified automatically, and a resubmission of the same tree is refused',
    fail.ok && afterFail.verification_state === 'VERIFICATION_FAILED' && afterFail.status === 'queued' && noAuto === 0 && resubDone && resubDone.refused === 'resubmission_refused');
  const ao2 = await author(A, wo_, tree('o-candidate-2'), { checkpoint: true });
  const vo2 = await vclaim(F, ao2.v);
  const oldCand = await certify(F, vo2.claimed.run_id, wo_, ao);
  const otherWo = await certify(F, vo2.claimed.run_id, w2, ao2);
  if (!ao2.checkpoint) throw new Error('no checkpoint for (o2)');
  const asCp = await certify(F, vo2.claimed.run_id, wo_, { run: ao2.checkpoint, tree: ao2.tree });
  const stillWaiting = await state(wo_);
  const good = await certify(F, vo2.claimed.run_id, wo_, ao2);
  row('(o2) a certification naming an EARLIER candidate, ANOTHER work order, or anything but the completing run is refused (provenance_mismatch) and never completes the work order; the current candidate then certifies',
    [oldCand, otherWo, asCp].every((r) => r.refused === 'certification_refused' && /provenance_mismatch/.test(r.message))
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
} finally {
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nindependence_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/independence_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
