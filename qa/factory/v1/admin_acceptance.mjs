#!/usr/bin/env node
// WO-7 / WO-8 DEVELOPER VERIFICATION (the implementer's, never independent), through the real Admin and Node API handlers:
//   P   AC-7 persona matrix: founder / holding_admin in tenant_admins allowed; every other persona refused with no data - including
//       an employee who self-updated profiles.role (S1), a holding_admin who self-promoted to founder, a tier-founder row whose live
//       role is no longer founder, an admin not in tenant_admins, a foreign tenant, a foreign-project token and no token
//   R   the route surface: exactly S-7 on the Node API; nothing answers without a credential except the four session-less routes
//   L   AC-4 lifecycle and inverses: revoke (every S-7 op refused after it, evidence intact, others unaffected), rotate, admin-requested
//       rotation, re-pair (same principal), drain -> resume, archive -> restore (re-pair), idempotent "already", two admins racing,
//       revoke during pairing, an envelope amended and amended back
//   G   AC-12 (e): no persona can create or relax a policy, touch the campaign rows, or unbind / rebind S-16(a); stricter is accepted
//   E   AC-6: a body naming identity / tenant / role / envelope is refused and nothing changes; hostname and resources never authorize;
//       an envelope amendment takes effect with nobody touching the node
// The Brain OS side is the developer stub; AC-7 acceptance needs the verifier's disposable Brain OS stack (VERIFICATION_SPEC §3 (2)).
// usage: node qa/factory/v1/admin_acceptance.mjs [--evidence <file>]
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, asEngine, ed25519 } from './fixtures.mjs';
import { enrollStart, enrollComplete, postFrom, apiNode } from './nodeclient.mjs';
import { world, recorder, RES } from './flows.mjs';

const { results, row } = recorder();
const W = await world();
const { admin, node, brain, sup, founder } = W;
const nodata = (r) => r.ok === false && Object.keys(r).every((k) => ['ok', 'refused', 'message', 'http'].includes(k));
try {
  // ================================================================= P: personas
  const holding = brain.persona('holding_admin'); await W.grantAdmin(holding, 'admin');
  const setup = await W.enroll('P-target');
  const target = setup.computer_id;
  const ROLES = ['hr_finance', 'company_manager', 'team_lead', 'sales', 'engineer', 'technician', 'employee', 'contractor', 'investor_viewer'];
  const personas = {};
  for (const r of ROLES) personas[r] = brain.persona(r);
  personas.hr_finance_listed = brain.persona('hr_finance'); await W.grantAdmin(personas.hr_finance_listed, 'admin');
  personas.self_promoted = brain.persona('employee'); await brain.selfUpdateRole(personas.self_promoted, 'founder');
  personas.founder_unlisted = brain.persona('founder');
  personas.holding_unlisted = brain.persona('holding_admin');
  personas.inactive_founder = brain.persona('founder', { active: false }); await W.grantAdmin(personas.inactive_founder, 'founder');
  await asEngine(sup, () => sup.query(`insert into factory.tenants (tenant_id, name) values ('b2e0f000-0000-4000-8000-000000000002', 'second')`));
  personas.foreign_tenant = brain.persona('founder'); await W.grantAdmin(personas.foreign_tenant, 'founder', 'b2e0f000-0000-4000-8000-000000000002');
  const OPS = [
    ['list-computers', {}], ['get-computer', { computer_id: target }], ['add-computer', { display_name: 'x', envelope: { roles: ['generic'] } }],
    ['issue-code', { computer_id: target }], ['revoke-code', { computer_id: target }],
    ['amend-envelope', { computer_id: target, expected_version: 1, envelope: { roles: ['generic'] } }], ['drain', { computer_id: target }],
    ['revoke-credential', { computer_id: target }], ['request-rotation', { computer_id: target }], ['repair', { computer_id: target }],
    ['archive', { computer_id: target }], ['restore', { computer_id: target }], ['create-principal', { computer_id: target }],
    ['adopt-release', { computer_id: target, release_id: W.rel.releaseId }], ['list-releases', {}], ['list-policies', {}],
    ['update-policy', { policy_id: 'a1e0f000-0000-4000-8000-000000000101', expected_version: 1, changes: {} }],
    ['list-waiting-verifications', {}], ['submit-work-order', { title: 'x', priority: 1 }], ['list-work', {}],
    ['publish-release', { channel: 'dev', version: '9.0.0', source_sha: 'a'.repeat(40), digest: 'b'.repeat(64), key_id: 'dev-key-0001', signature: 'A'.repeat(86), receipt_sha256: 'c'.repeat(64), manifest: {} }],
    ['revoke-release', { release_id: W.rel.releaseId }], ['revoke-key', { key_id: 'dev-key-0009' }],
  ];
  const before = (await sup.query(`select (select count(*) from factory.computers)::int c, (select count(*) from factory.pairing_codes)::int k,
      (select count(*) from factory.authorization_envelopes)::int e, (select count(*) from factory.releases)::int r, (select count(*) from factory.work_orders)::int w,
      (select count(*) from factory.node_credentials where status = 'active')::int a, (select count(*) from factory.computers where drain_requested_at is not null)::int d`)).rows[0];
  const leaks = [];
  const negatives = { ...Object.fromEntries(ROLES.map((r) => [r, personas[r]])), hr_finance_listed: personas.hr_finance_listed, self_promoted: personas.self_promoted,
    founder_unlisted: personas.founder_unlisted, holding_unlisted: personas.holding_unlisted, inactive_founder: personas.inactive_founder };
  for (const [name, p] of Object.entries(negatives)) {
    for (const [op, body] of OPS) {
      const r = await admin.call(op, body, p.token);
      if (!(nodata(r) && [401, 403].includes(r.http))) leaks.push(name + '/' + op + ':' + r.http + (r.refused || ''));
    }
  }
  for (const [op, body] of OPS) {
    const anon = await admin.call(op, body, null);
    const forged = await admin.call(op, body, brain.foreignToken(founder.userId));
    if (!(nodata(anon) && anon.http === 401)) leaks.push('anonymous/' + op + ':' + anon.http);
    if (!(nodata(forged) && forged.http === 401)) leaks.push('foreign_project_token/' + op + ':' + forged.http);
  }
  const after = (await sup.query(`select (select count(*) from factory.computers)::int c, (select count(*) from factory.pairing_codes)::int k,
      (select count(*) from factory.authorization_envelopes)::int e, (select count(*) from factory.releases)::int r, (select count(*) from factory.work_orders)::int w,
      (select count(*) from factory.node_credentials where status = 'active')::int a, (select count(*) from factory.computers where drain_requested_at is not null)::int d`)).rows[0];
  row('P1 every non-admin persona (the 9 roles; hr_finance even when listed; a self-promoted employee; founder / holding_admin not in tenant_admins; an inactive founder), no token, and a foreign-project token: every one of ' + OPS.length + ' admin actions refused, no data, nothing changed',
    leaks.length === 0 && JSON.stringify(before) === JSON.stringify(after), leaks.slice(0, 6).join(' ') || (Object.keys(negatives).length + 2) + ' personas x ' + OPS.length + ' actions');
  const selfAud = (await sup.query(`select count(*)::int n from factory.audit_events where actor_id = $1 and outcome = 'refused'`, [personas.self_promoted.userId])).rows[0].n;
  row('P2 the self-promoted employee (profiles.role self-updated to founder, S1) is refused by S-8(b) (not in tenant_admins), and every refusal is audited',
    selfAud === OPS.length, 'audited refusals: ' + selfAud);
  const ft = await admin.call('get-computer', { computer_id: target }, personas.foreign_tenant.token);
  const ftList = await admin.call('list-computers', {}, personas.foreign_tenant.token);
  row('P3 a foreign tenant\'s founder sees none of this tenant\'s computers: not_found (no existence leak), and its list is empty',
    ft.refused === 'not_found' && nodata(ft) && ftList.ok && ftList.computers.total === 0 && ftList.computers.items.length === 0);
  // founder-only
  const promoted = brain.persona('holding_admin'); await W.grantAdmin(promoted, 'admin'); await brain.selfUpdateRole(promoted, 'founder');
  const demoted = brain.persona('founder'); await W.grantAdmin(demoted, 'founder'); brain.setRole(demoted.userId, 'holding_admin');
  const pub = (p, v) => admin.call('publish-release', { channel: 'production', version: v, source_sha: 'a'.repeat(40), digest: sha256('d' + v), key_id: 'dev-key-0001', signature: 'A'.repeat(86), receipt_sha256: 'c'.repeat(64), manifest: { v } }, p.token);
  const fo = [await pub(holding, '1.1.0'), await pub(promoted, '1.1.1'), await pub(demoted, '1.1.2'),
    await admin.call('add-computer', { display_name: 'rb', envelope: { roles: ['release_broker'] } }, holding.token),
    await admin.call('amend-envelope', { computer_id: target, expected_version: 1, envelope: { roles: ['generic', 'verifier', 'release_broker'] } }, promoted.token),
    await admin.call('revoke-key', { key_id: 'dev-key-0001' }, demoted.token)];
  const okFounder = await pub(founder, '1.2.0');
  row('P4 founder-only actions (publish / revoke release or key, granting release_broker) are refused for a holding_admin, a holding_admin self-promoted to founder, and a tier-founder row whose live role is no longer founder; the founder (tier founder + live founder) is allowed',
    fo.every((r) => r.refused === 'founder_only' && r.http === 403) && okFounder.ok, fo.map((r) => r.refused).join(','));
  const hl = await admin.call('list-computers', {}, holding.token);
  const hd = await admin.call('drain', { computer_id: target }, holding.token);
  const hr = await admin.call('drain', { computer_id: target, drain: false }, holding.token);
  row('P5 a holding_admin in tenant_admins (tier admin) is a Factory admin for everything but the founder-only actions', hl.ok && hd.ok && hr.ok);

  // ================================================================= R: route surface
  const s7 = ['GET /v1/time', 'POST /v1/session', 'POST /v1/enroll/start', 'POST /v1/enroll/complete'];
  const nodeOps = ['register', 'heartbeat', 'claim', 'renew', 'checkpoint', 'complete', 'release', 'verification-claim', 'certify', 'report-state', 'credential-rotate'];
  const probe = async (m, p, body) => { const r = await fetch(node.baseUrl + p, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'GET' ? undefined : JSON.stringify(body || {}) }); return r.status; };
  const unauth = [];
  for (const op of nodeOps) { const st = await probe('POST', '/v1/node/' + op, {}); if (st !== 401) unauth.push(op + ':' + st); }
  const extra = [];
  for (const p of ['/v1/node/admin', '/v1/node/set-envelope', '/v1/node/mint-principal', '/v1/test/reset', '/v1/debug', '/v1/admin/list-computers', '/v1/node', '/', '/v1/nodes/claim', '/v1/node/claim/']) {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) { const st = await probe(m, p, {}); if (st !== 404) extra.push(m + ' ' + p + ':' + st); }
  }
  const t = await probe('GET', '/v1/time');
  const sess = await probe('POST', '/v1/session', {});
  const adminTokOnNode = await fetch(node.baseUrl + '/v1/node/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + founder.token }, body: '{}' });
  const nodeTokOnAdmin = await admin.call('list-computers', {}, setup.n.token);
  row('R1 the Node API answers exactly S-7: every node operation refuses without a session (401); every other route or method is 404; only the four session-less routes answer without a credential; a Brain OS token is no node session and a node token is no admin session',
    unauth.length === 0 && extra.length === 0 && t === 200 && sess === 400 && adminTokOnNode.status === 401 && nodeTokOnAdmin.http === 401,
    [...unauth, ...extra].slice(0, 6).join(' ') || s7.length + ' session-less routes, ' + nodeOps.length + ' node operations');

  // ================================================================= L: lifecycle and inverses
  const A = await W.enroll('L-A'), B = await W.enroll('L-B');
  const wo = await W.submit({ title: 'L work', owned_surface: ['l/a'], priority: 5 });
  const cA = await A.n.op('claim', { only_work_order_id: wo, resources: RES(64000) });
  const runA = cA.claimed && cA.claimed.run_id;
  await A.n.op('checkpoint', { run_id: runA, location: 'git://l@1', scenario: 's1' });
  const evBefore = (await sup.query(`select jsonb_agg(to_jsonb(r) order by r.run_id) j from factory.agent_runs r where r.computer_id = $1`, [A.computer_id])).rows[0].j;
  const rv = await admin.call('revoke-credential', { computer_id: A.computer_id }, founder.token);
  const refused = {};
  for (const [op, body] of [['heartbeat', { phase: 'BUSY' }], ['claim', {}], ['renew', { run_id: runA }], ['checkpoint', { run_id: runA, location: 'x' }],
    ['complete', { run_id: runA, status: 'done', termination_reason: 'completed' }], ['release', { run_id: runA }], ['verification-claim', {}],
    ['certify', { run_id: runA, verdict: 'PASS' }], ['register', {}], ['report-state', { phase: 'AVAILABLE' }]]) refused[op] = (await A.n.op(op, body)).refused;
  const rot = await A.n.rotate(ed25519());
  const reSession = await A.n.session();
  const evAfter = (await sup.query(`select jsonb_agg(to_jsonb(r) order by r.run_id) j from factory.agent_runs r where r.computer_id = $1`, [A.computer_id])).rows[0].j;
  const bWorks = await B.n.op('heartbeat', { phase: 'AVAILABLE' });
  row('L1 revoke: after it commits EVERY S-7 operation from that computer is refused (credential_revoked) - heartbeat, claim, renew, checkpoint, complete of the in-flight run, release, verification claim, certify, register, report-state, rotate, session exchange - whatever session it holds; its runs are byte-identical; other computers keep working',
    rv.ok && Object.values(refused).every((x) => x === 'credential_revoked') && rot.refused === 'credential_revoked' && reSession.refused === 'credential_revoked'
      && JSON.stringify(evBefore) === JSON.stringify(evAfter) && bWorks.ok, JSON.stringify({ refused, rot: rot.refused, reSession: reSession.refused, ev: JSON.stringify(evBefore) === JSON.stringify(evAfter), b: bWorks.ok, rv: rv.ok }));
  const rv2 = await admin.call('revoke-credential', { computer_id: A.computer_id }, founder.token);
  row('L2 revoking a revoked credential answers "already" and writes nothing', rv2.ok && rv2.already === true);
  // rotate (node-initiated)
  const oldB = B.identity; const newB = ed25519();
  const rotB = await B.n.rotate(newB);
  const oldHb = await B.n.op('heartbeat', { phase: 'AVAILABLE' });
  const oldSes = await apiNode(node.baseUrl, oldB).session();
  const nb = apiNode(node.baseUrl, newB); const nbs = await nb.session(); const nbh = await nb.op('heartbeat', { phase: 'AVAILABLE' });
  const credsB = (await sup.query(`select status, principal_id from factory.node_credentials where computer_id = $1 order by issued_at`, [B.computer_id])).rows;
  row('L3 rotate: the old credential is superseded and refused (its session and a new session both), the new key works, and the principal is unchanged',
    rotB.ok && oldHb.refused === 'credential_superseded' && oldSes.refused === 'credential_superseded' && nbs.ok && nbh.ok
      && credsB.map((c) => c.status).join(',') === 'superseded,active' && credsB[0].principal_id === credsB[1].principal_id);
  const rq = await admin.call('request-rotation', { computer_id: B.computer_id }, founder.token);
  const hbRot = await nb.op('heartbeat', { phase: 'AVAILABLE' });
  row('L4 an admin-requested rotation is told to the node on its next call (rotate_required)', rq.ok && hbRot.rotate_required === true);
  // re-pair
  const rp = await admin.call('repair', { computer_id: A.computer_id }, founder.token);
  const A2 = rp.ok ? await W.pair({ ...rp, computer_id: A.computer_id }, { name: 'L-A again' }) : null;
  const credsA = (await sup.query(`select status, principal_id from factory.node_credentials where computer_id = $1 order by issued_at`, [A.computer_id])).rows;
  row('L5 re-pair: a new code for the SAME principal; a new key; the old credential stays revoked; the node id is kept',
    rp.ok && A2 && A2.principal_id === A.principal_id && A2.node_id === A.node_id && credsA.map((c) => c.status).join(',') === 'revoked,active'
      && new Set(credsA.map((c) => c.principal_id)).size === 1);
  // drain -> resume
  const wd = await W.submit({ title: 'drain test', owned_surface: ['l/d'], priority: 5 });
  const dr = await admin.call('drain', { computer_id: B.computer_id }, founder.token);
  const dr2 = await admin.call('drain', { computer_id: B.computer_id }, founder.token);
  await nb.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const dClaim = await nb.op('claim', { only_work_order_id: wd, resources: RES(64000) });
  const view = (await admin.call('get-computer', { computer_id: B.computer_id }, founder.token)).computer;
  const rs = await admin.call('drain', { computer_id: B.computer_id, drain: false }, founder.token);
  await nb.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const rClaim = await nb.op('claim', { only_work_order_id: wd, resources: RES(64000) });
  row('L6 drain: no new claims (gate 9, named), DRAINING shown, a second drain answers "already"; resume restores claiming',
    dr.ok && dr2.already === true && dClaim.refused === 'not_eligible' && /gate 9 drain/.test(dClaim.message) && view.state === 'DRAINING' && rs.ok && rClaim.claimed);
  // archive -> restore
  const ar = await admin.call('archive', { computer_id: B.computer_id }, founder.token);
  const ar2 = await admin.call('archive', { computer_id: B.computer_id }, founder.token);
  const arHb = await nb.op('heartbeat', { phase: 'AVAILABLE' });
  const arView = (await admin.call('get-computer', { computer_id: B.computer_id }, founder.token)).computer;
  const hist = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [B.computer_id])).rows[0].n;
  const rst = await admin.call('restore', { computer_id: B.computer_id }, founder.token);
  const B2 = rst.ok ? await W.pair({ ...rst, computer_id: B.computer_id }, { name: 'L-B restored' }) : null;
  row('L7 archive: every credential revoked, no work, history readable, a second archive "already"; restore returns it only through a fresh re-pair (new key, same principal)',
    ar.ok && ar2.already === true && arHb.refused === 'credential_revoked' && arView.state === 'ARCHIVED' && hist >= 1 && rst.ok && rst.pairing_code
      && B2 && B2.principal_id === B.principal_id, JSON.stringify({ ar: ar.ok, ar2: ar2.already, arHb: arHb.refused, state: arView.state, hist, rst: rst.ok }));
  // two admins race one transition
  const second = brain.persona('founder'); await W.grantAdmin(second, 'founder');
  const C = await W.enroll('L-C');
  const env = (roles) => ({ roles, max_concurrent_runs: 1, max_heavy: 1 });
  const [x1, x2] = await Promise.all([
    admin.call('amend-envelope', { computer_id: C.computer_id, expected_version: 1, envelope: env(['generic']) }, founder.token),
    admin.call('amend-envelope', { computer_id: C.computer_id, expected_version: 1, envelope: env(['verifier']) }, second.token)]);
  const versions = (await sup.query(`select count(*)::int n from factory.authorization_envelopes where computer_id = $1`, [C.computer_id])).rows[0].n;
  row('L8 two admins race the same amendment: one wins atomically, the other gets stale_state; a single final state', [x1, x2].filter((x) => x.ok).length === 1
    && [x1, x2].some((x) => x.refused === 'stale_state') && versions === 2);
  // revoke during pairing
  const D = await admin.call('add-computer', { display_name: 'L-D', envelope: env(['generic']) }, founder.token);
  const kd = ed25519();
  const sd = await enrollStart(node.baseUrl, D.pairing_code, kd, {}, { localAddress: '127.0.0.250' });
  const rvc = await admin.call('revoke-code', { computer_id: D.computer_id }, founder.token);
  const cd = await enrollComplete(node.baseUrl, sd, kd, { localAddress: '127.0.0.250' });
  const dCreds = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [D.computer_id])).rows[0].n;
  row('L9 revoke during pairing: nothing is issued from that code', sd.ok && rvc.ok && cd.ok === false && dCreds === 0, cd.refused);
  // envelope amended and amended back
  const E = await W.enroll('L-E', env(['generic']));
  const wv = await W.submit({ title: 'needs verifier role', requires_security_role: 'verifier', priority: 3 });
  const before1 = await E.n.op('claim', { only_work_order_id: wv, resources: RES(64000) });
  const up = await admin.call('amend-envelope', { computer_id: E.computer_id, expected_version: 1, envelope: env(['generic', 'verifier']), reason: 'grant verifier' }, founder.token);
  await E.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const withIt = await E.n.op('claim', { only_work_order_id: wv, resources: RES(64000) });
  if (withIt.claimed) await E.n.op('complete', { run_id: withIt.claimed.run_id, status: 'done', termination_reason: 'completed' });
  const back = await admin.call('amend-envelope', { computer_id: E.computer_id, expected_version: 2, envelope: env(['generic']), reason: 'amend back' }, founder.token);
  const wv2 = await W.submit({ title: 'needs verifier role again', requires_security_role: 'verifier', priority: 3 });
  const afterBack = await E.n.op('claim', { only_work_order_id: wv2, resources: RES(64000) });
  const aud = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'envelope.amended' and target_id = $1`, [E.computer_id])).rows[0].n;
  row('L10 an envelope amendment is effective with nobody touching the node (gate 5 flips), and amending it back makes the earlier envelope apply again; both audited from -> to',
    /gate 5 required_role/.test(before1.message || '') && up.ok && withIt.claimed && back.ok && back.version === 3 && /gate 5 required_role/.test(afterBack.message || '') && aud === 2);

  // ================================================================= G: policies (AC-12 (e))
  const pol = (await admin.call('list-policies', {}, founder.token)).policies;
  const dflt = pol.find((p) => p.scope === 'tenant_default'), camp = pol.find((p) => p.scope === 'campaign');
  const home = await admin.call('add-computer', { display_name: 'Home (S-16a)', envelope: env(['generic']), bind_s16a: true }, founder.token);
  const g = [];
  for (const who of [holding, founder]) {
    g.push(await admin.call('update-policy', { policy_id: dflt.policy_id, expected_version: dflt.version, changes: { require_distinct_identity: false } }, who.token));
    g.push(await admin.call('update-policy', { policy_id: camp.policy_id, expected_version: camp.version, changes: { require_physical_separation: true } }, who.token));
    g.push(await admin.call('update-policy', { policy_id: camp.policy_id, expected_version: camp.version, changes: { director_document_paths: ['docs/'] } }, who.token));
    g.push(await admin.call('add-computer', { display_name: 'second home', envelope: env(['generic']), bind_s16a: true }, who.token));
  }
  const rebind = await admin.call('add-computer', { display_name: 'Home 2', envelope: env(['generic']), bind_s16a: true }, founder.token);
  const unbind = await admin.call('amend-envelope', { computer_id: home.computer_id, expected_version: 1, envelope: env(['generic']), bind_s16a: false }, founder.token);
  const delRoute = await fetch(admin.baseUrl + '/v1/admin/delete-policy', { method: 'POST', headers: { authorization: 'Bearer ' + founder.token }, body: '{}' });
  const stricter = await admin.call('update-policy', { policy_id: dflt.policy_id, expected_version: dflt.version, changes: { require_physical_separation: true } }, founder.token);
  const polAfter = (await sup.query(`select scope, version, require_physical_separation from factory.verification_policies order by scope`)).rows;
  row('G1 holding_admin and founder: relaxing the tenant default, changing a campaign row (even "stricter"), binding S-16(a) a second time, unbinding it, and deleting a policy are all refused; a stricter change to the tenant default is accepted as a new version',
    g.filter((x, i) => i % 4 === 0).every((x) => x.refused === 'policy_relaxation_refused') && g.filter((x, i) => i % 4 === 1 || i % 4 === 2).every((x) => x.refused === 'policy_frozen')
      && home.ok && g.filter((x, i) => i % 4 === 3).every((x) => x.refused === 's16a_already_bound')
      && rebind.refused === 's16a_already_bound' && unbind.refused === 'bad_request' && delRoute.status === 404 && stricter.ok && stricter.version === 2
      && polAfter.find((p) => p.scope === 'campaign').version === 1, g.map((x) => x.refused || 'ok').join(','));

  // ================================================================= E: AC-6
  const F = await W.enroll('E-F', env(['generic']));
  const nodeRow = async () => (await sup.query(`select to_jsonb(n) - 'last_heartbeat_at' - 'reported_at' - 'runtime_phase_at' - 'reported_resources' j from factory.nodes n where node_id = $1`, [F.node_id])).rows[0].j;
  const n0 = await nodeRow();
  const envBefore = (await sup.query(`select count(*)::int n from factory.authorization_envelopes where computer_id = $1`, [F.computer_id])).rows[0].n;
  const bodies = [{ phase: 'AVAILABLE', node_id: B.node_id }, { phase: 'AVAILABLE', tenant_id: 'b2e0f000-0000-4000-8000-000000000002' },
    { phase: 'AVAILABLE', security_role: 'release_broker' }, { phase: 'AVAILABLE', capabilities: ['deploy'] }, { phase: 'AVAILABLE', envelope: { roles: ['release_broker'] } },
    { phase: 'AVAILABLE', principal_id: A.principal_id }, { phase: 'AVAILABLE', agent_id: 'x' }];
  const e1 = []; for (const b of bodies) e1.push(await F.n.op('heartbeat', b));
  const claimBody = await F.n.op('claim', { roles: ['verifier'] });
  const n1 = await nodeRow();
  const envAfter = (await sup.query(`select count(*)::int n from factory.authorization_envelopes where computer_id = $1`, [F.computer_id])).rows[0].n;
  row('E1 a body naming another node, tenant, role, capability, envelope, principal or agent is refused (identity_from_body_refused) and a server read-back shows nothing changed',
    e1.every((r) => r.refused === 'identity_from_body_refused' && r.http === 400) && claimBody.refused === 'identity_from_body_refused'
      && JSON.stringify(n0) === JSON.stringify(n1) && envBefore === envAfter);
  const wvf = await W.submit({ title: 'verifier-only work, best resources elsewhere', requires_security_role: 'verifier', priority: 2 });
  await F.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, hostname: 'DESKTOP-MDPE6FS' });
  await F.n.op('heartbeat', { phase: 'AVAILABLE', resources: { cpu_cores: 64, cpu_pct: 0, ram_free_mb: 1e6, disk_free_mb: 1e7, capabilities: ['verifier'] } });
  const best = await F.n.op('claim', { only_work_order_id: wvf, resources: { cpu_cores: 64, cpu_pct: 0, ram_free_mb: 1e6, disk_free_mb: 1e7 } });
  const capWo = await W.submit({ title: 'needs gpu', requires_capabilities: ['gpu'], priority: 2 });
  const selfCap = await F.n.op('claim', { only_work_order_id: capWo, resources: { cpu_cores: 8, capabilities: ['gpu'], capabilities_present: ['gpu'] } });
  row('E2 the best resources, the preferred verifier\'s hostname, and a self-reported capability never make a node eligible: gate 5 (role) and gate 6 (capability from the envelope) refuse by name',
    /gate 5 required_role/.test(best.message || '') && /gate 6 required_capabilities/.test(selfCap.message || ''), best.message + ' | ' + selfCap.message);
} finally {
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nadmin_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/admin_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
void postFrom; void OPERATOR;
