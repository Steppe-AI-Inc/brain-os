#!/usr/bin/env node
// WO-7 / WO-8 DEVELOPER VERIFICATION (the implementer's, never independent), through the real Admin and Node API handlers:
//   P   AC-7 persona matrix: founder / holding_admin in tenant_admins allowed; every other persona refused with no data - including
//       an employee who self-updated profiles.role (S1), a holding_admin who self-promoted to founder, a tier-founder row whose live
//       role is no longer founder, an admin not in tenant_admins, a foreign tenant, a foreign-project token and no token
//   R   the route surface: exactly S-7 on the Node API; nothing answers without a credential except the four session-less routes
//   L   AC-4 lifecycle and inverses: revoke (every S-7 op refused after it, evidence intact, others unaffected), rotate, admin-requested
//       rotation, re-pair (same principal), drain -> resume, archive -> restore (re-pair), idempotent "already", two admins racing,
//       revoke during pairing, an envelope amended and amended back
//   G   AC-12 (e): no persona can create or relax a policy, touch the campaign rows, or unbind / rebind S-16(a); stricter is accepted;
//       an unbound re-enrollment of a bound machine is refused at registration, by name, a retry included (G2, and G2r with the real
//       runtime code), and the correction follows S-14's order; an unbound record ALIVE before a bound record reported its fingerprint
//       is restricted as a Home-computer record until it registers again, and once that registration is refused it takes no work (G2d;
//       its enrollment state is CR-013); a fingerprint reported only at enroll/start counts (G2e); a campaign_key naming no campaign
//       row is refused at submission (G3)
//   L3b a key rotated any number of times keeps its credential's enrollment walk
//   S   contract §1 Derived: the computer's state is derived over EVERY principal's state (S1 through the product; S2 the rule's table)
//   E   AC-6: a body naming identity / tenant / role / envelope is refused and nothing changes; hostname and resources never authorize;
//       an envelope amendment takes effect with nobody touching the node
//       (E1b / E1n / E1t / E1a / E1e: read back per victim - F's own work, the node, the tenant, the agent, the envelope named)
// Every "already" answer is judged by a full server read-back (every row an admin action can write, and the audit log) taken just
// before and just after it: equal, or the row fails. A receipt shows a pairing code only if the plane recorded that same code.
// The Brain OS side is the developer stub; AC-7 acceptance needs the verifier's disposable Brain OS stack (VERIFICATION_SPEC §3 (2)).
// usage: node qa/factory/v1/admin_acceptance.mjs [--evidence <file>]
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, asEngine, ed25519 } from './fixtures.mjs';
import { enrollStart, enrollComplete, postFrom, apiNode } from './nodeclient.mjs';
import { connect } from './plane.mjs';
import { world, recorder, RES } from './flows.mjs';
import { realEnroll, realWork, registryFingerprint } from './realnode.mjs';

const { normalizeCode } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'control-plane', 'edge',
  'supabase', 'functions', '_shared', 'pairing.ts')).href);
const { results, row } = recorder();
const W = await world();
const { admin, node, brain, sup, founder } = W;
const nodata = (r) => r.ok === false && Object.keys(r).every((k) => ['ok', 'refused', 'message', 'http'].includes(k));
const FOREIGN = 'b2e0f000-0000-4000-8000-000000000002';
// A FULL SERVER READ-BACK: every row of every table an admin action (or its node-side effect) can write, in key order, and the audit
// log - hashed. Two equal digests around a call mean the call wrote nothing, audit included.
const READ_BACK = [['computers', 'computer_id'], ['authorization_envelopes', 'computer_id, version'], ['agent_principals', 'principal_id'],
  ['node_credentials', 'credential_id'], ['pairing_codes', 'code_id'], ['enrollments', 'enrollment_id'], ['enrollment_transitions', 'transition_id'],
  ['nodes', 'node_id'], ['agent_runs', 'run_id'], ['work_orders', 'work_order_id'], ['checkpoints', 'checkpoint_id'],
  ['releases', 'release_id'], ['release_revocations', 'revocation_id'], ['verification_policies', 'policy_id'],
  ['verification_policy_versions', 'policy_id, version'], ['audit_events', 'event_id']];
const readBack = async ({ audit = true } = {}) => {
  const parts = [];
  for (const [t, k] of READ_BACK.filter(([t]) => audit || t !== 'audit_events')) {
    parts.push(t + ':' + JSON.stringify((await sup.query(`select count(*)::int n, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by ${k}), '')) h
        from factory.${t} x`)).rows[0]));
  }
  return sha256(parts.join('\n'));
};
// an "already" answer: ok, already, and the read-back around it unchanged
const already = async (fn) => { const d0 = await readBack(); const r = await fn(); const d1 = await readBack(); return { r, same: d0 === d1, ok: r.ok === true && r.already === true && d0 === d1 }; };
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
  // P3b (B-4, S-9, contract §5 / §9): for an admin of another tenant (tier founder, and tier admin) every computer action answers
  // as it does for an id that does not exist, whatever this tenant's computer holds (release_broker or not), and leaves that same receipt: one
  // audited refusal (not_found) in its OWN tenant naming the id it sent. Nothing else is written; this tenant's audit is untouched.
  personas.foreign_admin = brain.persona('holding_admin'); await W.grantAdmin(personas.foreign_admin, 'admin', FOREIGN);
  const rbHere = await admin.call('add-computer', { display_name: 'P3b holds release_broker', envelope: { roles: ['generic', 'release_broker'] } }, founder.token);
  const computerOps = (cid) => [['get-computer', { computer_id: cid }], ['issue-code', { computer_id: cid }], ['revoke-code', { computer_id: cid }],
    ['amend-envelope', { computer_id: cid, expected_version: 1, envelope: { roles: ['generic', 'release_broker'] } }], ['drain', { computer_id: cid }],
    ['revoke-credential', { computer_id: cid }], ['request-rotation', { computer_id: cid }], ['repair', { computer_id: cid }], ['archive', { computer_id: cid }],
    ['restore', { computer_id: cid }], ['create-principal', { computer_id: cid }], ['adopt-release', { computer_id: cid, release_id: W.rel.releaseId }]];
  const p3b0 = await readBack({ audit: false });
  const opAudit = async () => (await sup.query(`select count(*)::int n, max(event_id) m from factory.audit_events where tenant_id = $1`, [OPERATOR])).rows[0];
  const opAud0 = await opAudit();
  const p3bBad = []; let p3bAnswer = null;
  for (const [pname, p] of [['foreign founder', personas.foreign_tenant], ['foreign admin', personas.foreign_admin]]) {
    for (let i = 0; i < computerOps(target).length; i++) {
      const answers = [], ids = [rbHere.computer_id, target, randomUUID()];
      for (const cid of ids) { const [op, body] = computerOps(cid)[i]; answers.push(JSON.stringify(await admin.call(op, body, p.token))); }
      const a0 = JSON.parse(answers[0]);
      const opName = computerOps(target)[i][0];
      p3bAnswer = p3bAnswer || answers[0];
      if (!(answers.every((x) => x === answers[0]) && answers[0] === p3bAnswer && a0.refused === 'not_found' && a0.http === 404 && nodata(a0))) {
        p3bBad.push(pname + '/' + opName + ': ' + answers.map((x) => JSON.parse(x).refused).join('|'));
      }
      const aud = (await sup.query(`select tenant_id, action, target_kind, target_id, outcome, reason, detail from factory.audit_events where actor_id = $1 order by event_id desc limit 3`, [p.userId])).rows.reverse();
      if (!(aud.length === 3 && aud.every((x) => x.tenant_id === FOREIGN && x.action === 'admin.' + opName.replace(/-/g, '_') && x.target_kind === 'computer'
            && x.outcome === 'refused' && x.reason === 'not_found' && JSON.stringify(x.detail) === '{}') && JSON.stringify(aud.map((x) => x.target_id)) === JSON.stringify(ids))) {
        p3bBad.push(pname + '/' + opName + ' receipts: ' + JSON.stringify(aud.map((x) => [x.tenant_id === FOREIGN, x.action, x.reason])));
      }
    }
  }
  const p3b1 = await readBack({ audit: false });
  const opAud1 = await opAudit();
  row('P3b an admin of another tenant (tier founder, and tier admin) receives byte-identical not_found answers on all 12 computer actions for this tenant\'s computer that holds release_broker, one that does not, and an unknown id, and leaves the same receipt for each (one audited not_found in its own tenant naming the id sent) - no existence leak; nothing else written, this tenant\'s audit untouched (B-4, S-9, contract §9)',
    rbHere.ok && p3bBad.length === 0 && p3b0 === p3b1 && JSON.stringify(opAud0) === JSON.stringify(opAud1),
    p3bBad.slice(0, 6).join(' ; ') || (p3b0 === p3b1 && JSON.stringify(opAud0) === JSON.stringify(opAud1) ? '24 x 3 answers ' + p3bAnswer : 'the read-back changed'));

  // P4 FOUNDER-ONLY (S-8 r3, CR-003; AC-7): publishing (which supersedes the channel's published release), revoking a release,
  // revoking a key, and granting release_broker - at Add Computer and by amendment - each refused for EACH non-founder persona
  // (tier admin; tier admin self-promoted to live founder; tier founder whose live role is no longer founder), audited, with the
  // releases, revocations, computers and envelopes unchanged; then the founder does each of them
  const promoted = brain.persona('holding_admin'); await W.grantAdmin(promoted, 'admin'); await brain.selfUpdateRole(promoted, 'founder');
  const demoted = brain.persona('founder'); await W.grantAdmin(demoted, 'founder'); brain.setRole(demoted.userId, 'holding_admin');
  const pub = (p, v, key = 'dev-key-0001') => admin.call('publish-release', { channel: 'production', version: v, source_sha: 'a'.repeat(40), digest: sha256('d' + v), key_id: key, signature: 'A'.repeat(86), receipt_sha256: 'c'.repeat(64), manifest: { v } }, p.token);
  const cur0 = await pub(founder, '1.2.0');   // the production channel's published release a non-founder publish would supersede
  const rbTarget = await admin.call('add-computer', { display_name: 'P4 generic', envelope: { roles: ['generic'] } }, founder.token);
  const foDigest = async () => sha256(JSON.stringify((await sup.query(`select
      (select jsonb_agg(to_jsonb(r) order by r.release_id) from factory.releases r) rel,
      (select jsonb_agg(to_jsonb(v) order by v.revocation_id) from factory.release_revocations v) rev,
      (select count(*) from factory.computers) comps,
      (select jsonb_agg(to_jsonb(e) order by e.computer_id, e.version) from factory.authorization_envelopes e) envs`)).rows[0]));
  const fo0 = await foDigest();
  const FO_ACTIONS = ['admin.publish_release', 'admin.revoke_release', 'admin.revoke_key', 'admin.add_computer', 'admin.amend_envelope'];
  const foBad = [];
  let minor = 0;
  for (const [name, p] of [['holding_admin tier admin', holding], ['self-promoted to founder, tier admin', promoted], ['tier founder, live holding_admin', demoted]]) {
    const answers = [
      await pub(p, '1.3.' + (minor++)),
      await admin.call('revoke-release', { release_id: cur0.release_id, reason: 'x' }, p.token),
      await admin.call('revoke-key', { key_id: 'dev-key-0777' }, p.token),
      await admin.call('add-computer', { display_name: 'rb by ' + name, envelope: { roles: ['release_broker'] } }, p.token),
      await admin.call('amend-envelope', { computer_id: rbTarget.computer_id, expected_version: 1, envelope: { roles: ['generic', 'release_broker'] } }, p.token)];
    answers.forEach((r, i) => { if (!(r.refused === 'founder_only' && r.http === 403 && nodata(r))) foBad.push(name + '/' + FO_ACTIONS[i] + ':' + (r.refused || 'ok')); });
    const aud = (await sup.query(`select action from factory.audit_events where actor_id = $1 and outcome = 'refused' and reason = 'founder_only' order by event_id`, [p.userId])).rows.map((x) => x.action);
    if (JSON.stringify(aud) !== JSON.stringify(FO_ACTIONS)) foBad.push(name + ' audited ' + JSON.stringify(aud));
  }
  const fo1 = await foDigest();
  const cur0After = (await sup.query(`select state, superseded_by_release_id from factory.releases where release_id = $1`, [cur0.release_id])).rows[0];
  row('P4 every founder-only action (publish, which would supersede the published release; revoke a release; revoke a key; grant release_broker at Add Computer and by amendment) is refused founder_only for a holding_admin, a holding_admin self-promoted to founder, and a tier-founder whose live role is no longer founder - 15 refusals, each audited, releases / revocations / computers / envelopes unchanged',
    cur0.ok && rbTarget.ok && foBad.length === 0 && fo0 === fo1 && cur0After.state === 'published', foBad.slice(0, 6).join(' ; ') || '3 personas x 5 actions');
  const f1 = await pub(founder, '1.2.1');
  const cur0Sup = (await sup.query(`select state, superseded_by_release_id from factory.releases where release_id = $1`, [cur0.release_id])).rows[0];
  const f2 = await admin.call('revoke-release', { release_id: f1.release_id, reason: 'P4' }, founder.token);
  const f3 = await admin.call('revoke-key', { key_id: 'dev-key-0777', reason: 'P4' }, founder.token);
  const f4 = await admin.call('add-computer', { display_name: 'P4 rb by the founder', envelope: { roles: ['release_broker'] } }, founder.token);
  const f5 = await admin.call('amend-envelope', { computer_id: rbTarget.computer_id, expected_version: 1, envelope: { roles: ['generic', 'release_broker'] } }, founder.token);
  row('P4f the founder (tier founder + live founder) does each: publish 1.2.1 supersedes 1.2.0 (read back superseded, superseded_by the new release), revoke that release, revoke the key, Add Computer with release_broker, grant release_broker by amendment',
    f1.ok && f1.supersedes === cur0.release_id && cur0Sup.state === 'superseded' && cur0Sup.superseded_by_release_id === f1.release_id && f2.ok && f2.state === 'revoked'
      && f3.ok && f3.key_id === 'dev-key-0777' && f4.ok && f5.ok && f5.version === 2, JSON.stringify({ f1: f1.ok || f1.refused, sup: cur0Sup, f2: f2.ok || f2.refused, f3: f3.ok || f3.refused, f4: f4.ok || f4.refused, f5: f5.version || f5.refused }));
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
  // the probe set is not only a fixed list: every '/v1/...' path the Edge sources spell anywhere (a route answered outside FRONT_DOORS
  // would have to name its path), plus the adversarial list; under every method, only an S-7 route may answer anything but 404
  const EDGE_FN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'control-plane', 'edge', 'supabase', 'functions');
  const edgeCode = ['_shared/node_api.ts', '_shared/enroll.ts', '_shared/route.ts', '_shared/peer.ts', '_shared/db.ts', '_shared/pairing.ts', '_shared/admin_api.ts',
    'factory-node-api/index.ts', 'factory-admin-api/index.ts'].map((f) => readFileSync(join(EDGE_FN, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')).join('\n');
  const harvested = [...new Set([...edgeCode.matchAll(/\/v1\/[a-z0-9_/-]*/g)].map((m) => m[0].replace(/\/+$/, '') || '/v1'))];
  const S7_ROUTES = new Set([...s7, ...nodeOps.map((o) => 'POST /v1/node/' + o)]);
  const probeSet = [...new Set([...harvested, '/v1/node/admin', '/v1/node/set-envelope', '/v1/node/mint-principal', '/v1/test/reset', '/v1/debug', '/v1/admin/list-computers', '/v1/node', '/', '/v1/nodes/claim', '/v1/node/claim/'])];
  for (const p of probeSet) {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
      if (S7_ROUTES.has(m + ' ' + p)) continue;
      const st = await probe(m, p, {}); if (st !== 404) extra.push(m + ' ' + p + ':' + st);
    }
  }
  const t = await probe('GET', '/v1/time');
  const sess = await probe('POST', '/v1/session', {});
  const adminTokOnNode = await fetch(node.baseUrl + '/v1/node/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + founder.token }, body: '{}' });
  const nodeTokOnAdmin = await admin.call('list-computers', {}, setup.n.token);
  // R1p the PLATFORM path shape (route.ts): the function's own name prefixes every route; a bare path is the same route (which one
  // the platform delivers is measured at deploy); a doubled, foreign or partial prefix is 404 - on both APIs
  const at = async (base, m, p, h = {}) => (await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: m === 'GET' ? undefined : '{}' })).status;
  const shapes = {
    nodePrefixed: await at(node.origin, 'GET', '/factory-node-api/v1/time'), nodeBare: await at(node.origin, 'GET', '/v1/time'),
    nodeDoubled: await at(node.origin, 'GET', '/factory-node-api/factory-node-api/v1/time'), nodeForeign: await at(node.origin, 'GET', '/factory-admin-api/v1/time'),
    nodePartial: await at(node.origin, 'GET', '/factory-node-apiv1/time'),
    adminPrefixed: await at(admin.origin, 'POST', '/factory-admin-api/v1/admin/list-computers', { authorization: 'Bearer ' + founder.token }),
    adminBare: await at(admin.origin, 'POST', '/v1/admin/list-computers', { authorization: 'Bearer ' + founder.token }),
    adminForeign: await at(admin.origin, 'POST', '/factory-node-api/v1/admin/list-computers', { authorization: 'Bearer ' + founder.token }),
    adminDoubled: await at(admin.origin, 'POST', '/factory-admin-api/factory-admin-api/v1/admin/list-computers', { authorization: 'Bearer ' + founder.token }),
  };
  row('R1p the platform path shape: /factory-node-api/v1/... and /factory-admin-api/v1/admin/... serve (as the Edge runtime delivers them), the bare path is the same route, and a doubled, foreign or partial prefix is 404',
    shapes.nodePrefixed === 200 && shapes.nodeBare === 200 && shapes.nodeDoubled === 404 && shapes.nodeForeign === 404 && shapes.nodePartial === 404
      && shapes.adminPrefixed === 200 && shapes.adminBare === 200 && shapes.adminForeign === 404 && shapes.adminDoubled === 404, JSON.stringify(shapes));
  row('R1 the Node API answers exactly S-7: every node operation refuses without a session (401); every other route or method is 404 - over every /v1/ path the Edge sources spell (' + harvested.length + ') and the adversarial list; only the four session-less routes answer without a credential; a Brain OS token is no node session and a node token is no admin session',
    unauth.length === 0 && extra.length === 0 && t === 200 && sess === 400 && adminTokOnNode.status === 401 && nodeTokOnAdmin.http === 401 && harvested.length >= 10,
    [...unauth, ...extra].slice(0, 6).join(' ') || s7.length + ' session-less routes, ' + nodeOps.length + ' node operations, ' + probeSet.length + ' paths probed');
  // R2 (L2-F5; S-7, AC-7, P-9): the Admin API's operations are exactly its own table's entries. Every Object.prototype name, and names
  // outside the 23 ops, POSTed with and without a Brain OS token, each with an empty body, '{}' and '{"x":1}', and a listed op under any other
  // method: 404 no_such_route, and nothing reaches the handler's error path. A node body key that is an Object.prototype name is an
  // unknown field, named (sent as raw JSON text: an own "__proto__" key survives only that way).
  const r2Names = [...Object.getOwnPropertyNames(Object.prototype), 'delete-policy', 'grant-admin', 'set-tier', 'list-tenant-admins', 'mint-principal', 'debug', 'sql'];
  const r2Bad = []; let r2n = 0;
  const eventsBefore = admin.events.length;
  for (const n of r2Names) {
    for (const tok of [null, founder.token]) {
      for (const body of [undefined, '{}', '{"x":1}']) {
        const res = await fetch(admin.baseUrl + '/v1/admin/' + n, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body });
        const j = await res.json().catch(() => ({}));
        r2n++;
        if (!(res.status === 404 && j.refused === 'no_such_route')) r2Bad.push('POST ' + n + (tok ? ' +token' : '') + ' ' + (body || 'no body') + ':' + res.status + (j.refused || ''));
      }
    }
  }
  for (const n of ['list-computers', 'get-computer', 'add-computer', 'publish-release']) {
    for (const m of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      for (const tok of [null, founder.token]) {
        const res = await fetch(admin.baseUrl + '/v1/admin/' + n, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: m === 'GET' ? undefined : '{}' });
        const j = await res.json().catch(() => ({}));
        r2n++;
        if (!(res.status === 404 && j.refused === 'no_such_route')) r2Bad.push(m + ' ' + n + (tok ? ' +token' : '') + ':' + res.status + (j.refused || ''));
      }
    }
  }
  const r2Errors = admin.events.slice(eventsBefore).filter((e) => e.event === 'admin_api_error');
  const protoKeys = [];
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const res = await fetch(node.baseUrl + '/v1/node/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + setup.n.token },
      body: '{"phase":"AVAILABLE","' + k + '":1}' });
    const j = await res.json().catch(() => ({}));
    if (!(res.status === 400 && j.refused === 'bad_request' && j.message === 'unknown field "' + k + '"')) protoKeys.push(k + ':' + res.status + ' ' + j.message);
  }
  row('R2 no Object.prototype name and no name outside the 23 ops is an Admin API operation (' + r2n + ' probes: token present or absent, body empty, {} or {"x":1}; a listed op under GET / PUT / DELETE / PATCH): every one 404 no_such_route, none reaches the error path; a node body key named constructor / __proto__ / toString / hasOwnProperty / valueOf is refused as an unknown field, by name',
    r2Bad.length === 0 && r2Errors.length === 0 && protoKeys.length === 0, [...r2Bad.slice(0, 6), ...protoKeys, ...r2Errors.slice(0, 2).map((e) => JSON.stringify(e))].join(' ; '));

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
  const rv2 = await already(() => admin.call('revoke-credential', { computer_id: A.computer_id }, founder.token));
  row('L2 revoking a revoked credential answers "already" and writes nothing (a full server read-back, audit log included, is unchanged)', rv2.ok, JSON.stringify(rv2.r).slice(0, 200) + ' same=' + rv2.same);
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
  const dr2x = await already(() => admin.call('drain', { computer_id: B.computer_id }, founder.token));
  const dr2 = { ...dr2x.r, already: dr2x.ok === true };
  await nb.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const dClaim = await nb.op('claim', { only_work_order_id: wd, resources: RES(64000) });
  const view = (await admin.call('get-computer', { computer_id: B.computer_id }, founder.token)).computer;
  const rs = await admin.call('drain', { computer_id: B.computer_id, drain: false }, founder.token);
  await nb.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const rClaim = await nb.op('claim', { only_work_order_id: wd, resources: RES(64000) });
  row('L6 drain: no new claims (gate 9, named); the view shows the computer ALIVE and draining, its runtime DRAINING (contract §1: the derived state, with the runtime state beside it); a second drain answers "already" and writes nothing (full read-back); resume restores claiming',
    dr.ok && dr2.already === true && dClaim.refused === 'not_eligible' && /gate 9 drain/.test(dClaim.message) && view.state === 'ALIVE' && view.draining === true
      && view.runtime_phase === 'DRAINING' && view.liveness === 'FRESH' && rs.ok && rClaim.claimed, JSON.stringify({ state: view.state, draining: view.draining, runtime_phase: view.runtime_phase, liveness: view.liveness }));
  // L3b a node may rotate its key any number of times over its life: after 70 rotations through the node operation its credential still
  // carries the enrollment walk it came from (the rotation chain is followed to its end, with no depth limit)
  const LR = await W.enroll('L-R many rotations', { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 });
  let lrn = LR.n; const lrRot = [];
  for (let i = 0; i < 70; i++) {
    const k = ed25519();
    const r = await lrn.rotate(k);
    lrRot.push(r.ok === true);
    if (!r.ok) break;
    lrn = apiNode(node.baseUrl, k);
    await lrn.session();
  }
  const lrDepth = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1 and issued_via = 'rotate'`, [LR.computer_id])).rows[0].n;
  const lrReg = await lrn.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: LR.fingerprint, hostname: 'L-R', os: 'Windows' });
  await lrn.op('heartbeat', { phase: 'RECOVERING', resources: RES(70000) });
  await lrn.op('heartbeat', { phase: 'AVAILABLE', resources: RES(70000) });
  const lrClaim = await lrn.op('claim', { only_work_order_id: await W.submit({ title: 'l3b work', owned_surface: ['l/r'], priority: 5 }), resources: RES(70000) }); // the best resources here: ranking decides nothing
  if (lrClaim.claimed) await lrn.op('complete', { run_id: lrClaim.claimed.run_id, status: 'done', termination_reason: 'completed' });
  const lrMore = await lrn.rotate(ed25519());
  const lrView = (await admin.call('get-computer', { computer_id: LR.computer_id }, founder.token)).computer;
  row('L3b a node may rotate its key any number of times: after 70 rotations its credential still carries its enrollment walk - the registration answers ALIVE, it claims work (gate 1 passes), a 71st rotation is accepted, and the computer and its principal show ALIVE',
    lrRot.length === 70 && lrRot.every(Boolean) && lrDepth === 70 && lrReg.ok && lrReg.enrollment_state === 'ALIVE' && lrClaim.claimed && lrMore.ok
      && lrView.state === 'ALIVE' && lrView.principals.length === 1 && lrView.principals[0].state === 'ALIVE',
    JSON.stringify({ rotations: lrRot.filter(Boolean).length, depth: lrDepth, reg: lrReg.enrollment_state || lrReg.refused, claim: lrClaim.claimed ? 'claimed' : lrClaim.message || lrClaim.refused,
      more: lrMore.ok || lrMore.refused, view: [lrView.state, (lrView.principals || []).map((x) => x.state).join(',')] }).slice(0, 500));
  // archive -> restore
  const ar = await admin.call('archive', { computer_id: B.computer_id }, founder.token);
  const ar2x = await already(() => admin.call('archive', { computer_id: B.computer_id }, founder.token));
  const ar2 = { ...ar2x.r, already: ar2x.ok === true };
  const arHb = await nb.op('heartbeat', { phase: 'AVAILABLE' });
  const arView = (await admin.call('get-computer', { computer_id: B.computer_id }, founder.token)).computer;
  const hist = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [B.computer_id])).rows[0].n;
  const rst = await admin.call('restore', { computer_id: B.computer_id }, founder.token);
  const B2 = rst.ok ? await W.pair({ ...rst, computer_id: B.computer_id }, { name: 'L-B restored' }) : null;
  row('L7 archive: every credential revoked, no work, history readable, a second archive "already" and writes nothing (full read-back); restore returns it only through a fresh re-pair (new key, same principal)',
    ar.ok && ar2.already === true && arHb.refused === 'credential_revoked' && arView.state === 'ARCHIVED' && hist >= 1 && rst.ok && rst.pairing_code
      && B2 && B2.principal_id === B.principal_id, JSON.stringify({ ar: ar.ok, ar2: ar2.already, arHb: arHb.refused, state: arView.state, hist, rst: rst.ok }));
  // L7r (L2-F3; contract §9, S-12): restore on a computer that is still in service is "already": no code was stored, so none is shown
  const rst2 = await already(() => admin.call('restore', { computer_id: B.computer_id }, founder.token));
  row('L7r restore on a computer still in service (never archived) is 200 "already"; its receipt carries no pairing_code, code_id or expires_at, and the full read-back is unchanged',
    rst2.ok && rst2.r.http === 200 && !('pairing_code' in rst2.r) && !('code_id' in rst2.r) && !('expires_at' in rst2.r), JSON.stringify(rst2.r).slice(0, 200) + ' same=' + rst2.same);
  // two admins race one transition
  const second = brain.persona('founder'); await W.grantAdmin(second, 'founder');
  const C = await W.enroll('L-C');
  const env = (roles) => ({ roles, max_concurrent_runs: 1, max_heavy: 1 });
  const [x1, x2] = await Promise.all([
    admin.call('amend-envelope', { computer_id: C.computer_id, expected_version: 1, envelope: env(['generic']) }, founder.token),
    admin.call('amend-envelope', { computer_id: C.computer_id, expected_version: 1, envelope: env(['verifier']) }, second.token)]);
  const versions = (await sup.query(`select count(*)::int n from factory.authorization_envelopes where computer_id = $1`, [C.computer_id])).rows[0].n;
  const staleAud = (await sup.query(`select actor_id, action, outcome, reason, target_kind, target_id from factory.audit_events
      where target_id = $1 and outcome = 'refused'`, [C.computer_id])).rows;
  const loser = [x1, x2][0].ok ? second : founder;
  row('L8 two admins race the same amendment: one wins atomically, the other gets stale_state; a single final state; the loser\'s refusal is audited (who, stale_state, the computer)',
    [x1, x2].filter((x) => x.ok).length === 1 && [x1, x2].some((x) => x.refused === 'stale_state') && versions === 2
      && staleAud.length === 1 && staleAud[0].action === 'admin.amend_envelope' && staleAud[0].reason === 'stale_state' && staleAud[0].target_kind === 'computer'
      && staleAud[0].actor_id === loser.userId, JSON.stringify(staleAud));
  // L8b: an amendment or a policy update that names no expected_version is refused by name and writes nothing (never a bypass of the
  // optimistic check)
  const noEv = await admin.call('amend-envelope', { computer_id: C.computer_id, envelope: env(['generic', 'verifier']) }, founder.token);
  const cVersions = (await sup.query(`select count(*)::int n from factory.authorization_envelopes where computer_id = $1`, [C.computer_id])).rows[0].n;
  const polNow = (await admin.call('list-policies', {}, founder.token)).policies.find((p) => p.scope === 'tenant_default');
  const noEvPol = await admin.call('update-policy', { policy_id: polNow.policy_id, changes: { require_physical_separation: true } }, founder.token);
  const polAfterEv = (await sup.query(`select version, require_physical_separation from factory.verification_policies where policy_id = $1`, [polNow.policy_id])).rows[0];
  row('L8b amend-envelope and update-policy without expected_version are refused bad_request (400) and write nothing: C keeps 2 envelope versions, the policy its version',
    noEv.refused === 'bad_request' && noEv.http === 400 && cVersions === 2 && noEvPol.refused === 'bad_request' && noEvPol.http === 400
      && polAfterEv.version === polNow.version && polAfterEv.require_physical_separation === polNow.require_physical_separation,
    JSON.stringify({ noEv: noEv.refused, cVersions, noEvPol: noEvPol.refused, pol: polAfterEv }));
  // revoke during pairing
  const D = await admin.call('add-computer', { display_name: 'L-D', envelope: env(['generic']) }, founder.token);
  const kd = ed25519();
  const sd = await enrollStart(node.baseUrl, D.pairing_code, kd, {}, { localAddress: '127.0.0.250' });
  const rvc = await admin.call('revoke-code', { computer_id: D.computer_id }, founder.token);
  const cd = await enrollComplete(node.baseUrl, sd, kd, { localAddress: '127.0.0.250' });
  const dCreds = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [D.computer_id])).rows[0].n;
  row('L9 revoke during pairing: nothing is issued from that code', sd.ok && rvc.ok && cd.ok === false && dCreds === 0, cd.refused);
  // L9b (L3-F8; contract §2 Enrollment, §9; P-9): a revoke-code scoped to principal P1 ends P1's code and exactly the enrollment
  // begun with that code; P2's in-flight enrollment on the same computer continues and completes. Repeating the revoke answers
  // "already" with nothing written; a principal that is not on the computer is not_found.
  const G = await admin.call('add-computer', { display_name: 'L-G two principals', envelope: env(['generic']) }, founder.token);
  const GP2 = await admin.call('create-principal', { computer_id: G.computer_id }, founder.token);
  const kg1 = ed25519(), kg2 = ed25519();
  const sg1 = await enrollStart(node.baseUrl, G.pairing_code, kg1, {}, { localAddress: '127.0.0.248' });
  const sg2 = await enrollStart(node.baseUrl, GP2.pairing_code, kg2, {}, { localAddress: '127.0.0.249' });
  const gRev = await admin.call('revoke-code', { computer_id: G.computer_id, principal_id: G.principal_id }, founder.token);
  const stateOf = async (tbl, key, id) => (await sup.query(`select state from factory.${tbl} where ${key} = $1`, [id])).rows[0].state;
  const gE2 = await stateOf('enrollments', 'enrollment_id', sg2.enrollment_id), gC2 = await stateOf('pairing_codes', 'code_id', GP2.code_id);
  const gC1 = await stateOf('pairing_codes', 'code_id', G.code_id), gE1 = await stateOf('enrollments', 'enrollment_id', sg1.enrollment_id);
  const gDone2 = await enrollComplete(node.baseUrl, sg2, kg2, { localAddress: '127.0.0.249' });
  const gDone1 = await enrollComplete(node.baseUrl, sg1, kg1, { localAddress: '127.0.0.248' });
  const gTr1 = (await sup.query(`select from_state, to_state, actor_kind from factory.enrollment_transitions where enrollment_id = $1 order by transition_id`, [sg1.enrollment_id])).rows;
  const gAud = (await sup.query(`select detail from factory.audit_events where action = 'pairing.revoked' and target_id = $1 order by event_id`, [G.computer_id])).rows;
  const gRev2 = await already(() => admin.call('revoke-code', { computer_id: G.computer_id, principal_id: G.principal_id }, founder.token));
  const gNf = await admin.call('revoke-code', { computer_id: G.computer_id, principal_id: A.principal_id }, founder.token);
  row('L9b revoke-code {principal P1} ends only P1\'s code and the one enrollment begun with it (PAIRING_STARTED -> PAIRING_REVOKED, recorded by admin): P2\'s enrollment and code stay PAIRING_STARTED and P2 completes with a credential; P1\'s complete is refused code_revoked; the audit names the code; repeating the revoke answers "already" with the read-back unchanged; another computer\'s principal is not_found',
    sg1.ok && sg2.ok && gRev.ok && gRev.revoked === 1 && gRev.enrollments_revoked === 1 && gC1 === 'PAIRING_REVOKED' && gE1 === 'PAIRING_REVOKED'
      && gE2 === 'PAIRING_STARTED' && gC2 === 'PAIRING_STARTED' && gDone2.ok && typeof gDone2.credential_id === 'string' && gDone1.refused === 'code_revoked'
      && gTr1.length === 2 && gTr1[1].from_state === 'PAIRING_STARTED' && gTr1[1].to_state === 'PAIRING_REVOKED' && gTr1[1].actor_kind === 'admin'
      && gAud.length === 1 && gAud[0].detail.enrollments === 1 && JSON.stringify(gAud[0].detail.code_ids) === JSON.stringify([G.code_id]) && gAud[0].detail.principal_id === G.principal_id
      && gRev2.ok && gNf.refused === 'not_found' && gNf.http === 404,
    JSON.stringify({ gRev, gE2, gC2, gDone2: gDone2.ok || gDone2.refused, gDone1: gDone1.refused, gTr1, gAud: gAud.map((x) => x.detail), gRev2: gRev2.r, same: gRev2.same, gNf: gNf.refused }).slice(0, 900));
  // L9c (the L3-F8 class; P-9): a principal_id that is not a uuid is refused by name on every principal-scoped action - never widened
  // to every principal of the computer, never retargeted to its first principal - and nothing is written. G has P2 enrolled (an active
  // credential) and P1 with a live code.
  const gLive = await admin.call('issue-code', { computer_id: G.computer_id, principal_id: G.principal_id }, founder.token);
  const g9c0 = await readBack();
  const g9c = [];
  for (const op of ['issue-code', 'repair', 'revoke-code', 'revoke-credential', 'request-rotation']) g9c.push(await admin.call(op, { computer_id: G.computer_id, principal_id: 'not-a-uuid' }, founder.token));
  const g9c1 = await readBack();
  row('L9c issue-code, repair, revoke-code, revoke-credential and request-rotation naming principal_id "not-a-uuid" are each refused bad_request (400), and a full read-back is unchanged (no credential, code or rotation of any principal touched)',
    gLive.ok && g9c.every((r) => r.refused === 'bad_request' && r.http === 400) && g9c0 === g9c1, JSON.stringify(g9c.map((r) => r.refused || (r.ok ? 'ok' : '?'))) + ' same=' + (g9c0 === g9c1));
  // L9d (the L3-F8 class): a code whose TTL elapsed while still live-by-state is swept when its locator is drawn again; the enrollment
  // started from it expires with it, recorded (PAIRING_STARTED -> PAIRING_EXPIRED by the server)
  const Hx = await admin.call('add-computer', { display_name: 'L-H expired code', envelope: env(['generic']) }, founder.token);
  await admin.call('revoke-code', { computer_id: Hx.computer_id }, founder.token);
  const LOC = 'Z' + randomBytes(4).toString('hex').toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0').slice(0, 4);
  const oldCode = randomUUID(), oldEnr = randomUUID(); const kx = ed25519();
  await asEngine(sup, async () => {
    await sup.query(`insert into factory.pairing_codes (code_id, tenant_id, computer_id, principal_id, envelope_version, purpose, locator, code_mac, pepper_version, issued_by, issued_at, expires_at)
        values ($1, $2, $3, $4, 1, 'add_computer', $5, $6, 1, $7, now() - interval '20 minutes', now() - interval '10 minutes')`,
      [oldCode, OPERATOR, Hx.computer_id, Hx.principal_id, LOC, randomBytes(32), founder.userId]);
    await sup.query(`update factory.pairing_codes set state = 'PAIRING_STARTED', started_at = now() - interval '19 minutes' where code_id = $1`, [oldCode]);
    await sup.query(`insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint, challenge, challenge_expires_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, now() - interval '10 minutes')`, [oldEnr, OPERATOR, oldCode, Hx.computer_id, Hx.principal_id, kx.publicKey, kx.thumbprint, randomBytes(32)]);
  });
  const adminDb = await connect(W.plane.adminApiUrl);
  let reissue;
  try {
    reissue = (await adminDb.query(`select factory.admin_issue_code($1, 'founder', $2::jsonb) r`,
      [founder.userId, JSON.stringify({ computer_id: Hx.computer_id, locator: LOC, code_mac: randomBytes(32).toString('hex'), pepper_version: 1 })])).rows[0].r;
  } finally { await adminDb.end(); }
  const swept = (await sup.query(`select state from factory.pairing_codes where code_id = $1`, [oldCode])).rows[0].state;
  const sweptEnr = await stateOf('enrollments', 'enrollment_id', oldEnr);
  const sweptTr = (await sup.query(`select from_state, to_state, actor_kind from factory.enrollment_transitions where enrollment_id = $1 order by transition_id`, [oldEnr])).rows;
  row('L9d a live-by-state code whose TTL elapsed is swept when its locator is drawn again, and the enrollment started from it expires with it (PAIRING_STARTED -> PAIRING_EXPIRED, recorded by the server); the new code is issued',
    // (an enrollment's walk is written for its insert too - the transition log, part 080 - so the planted enrollment's walk is its
    // null -> PAIRING_STARTED row, then the sweep's)
    reissue.ok && swept === 'PAIRING_EXPIRED' && sweptEnr === 'PAIRING_EXPIRED' && sweptTr.length === 2 && sweptTr[0].from_state === null && sweptTr[0].to_state === 'PAIRING_STARTED'
      && sweptTr[1].from_state === 'PAIRING_STARTED' && sweptTr[1].to_state === 'PAIRING_EXPIRED' && sweptTr[1].actor_kind === 'server', JSON.stringify({ reissue: reissue.ok || reissue.refused, swept, sweptEnr, sweptTr }));
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
  const aud = (await sup.query(`select actor_kind, actor_id, outcome, at, detail from factory.audit_events where action = 'envelope.amended' and target_id = $1 order by event_id`, [E.computer_id])).rows;
  const rolesOf = (x) => JSON.stringify([...((x && x.roles) || [])].sort());
  const side = (i, k) => (aud[i] && aud[i].detail && aud[i].detail[k]) || null;
  const ver = (o) => (o ? o.version : null);
  const audOk = aud.length === 2 && aud.every((x) => x.actor_kind === 'admin' && x.actor_id === founder.userId && x.outcome === 'ok' && x.at instanceof Date)
    && ver(side(0, 'from')) === 1 && rolesOf(side(0, 'from')) === rolesOf({ roles: ['generic'] })
    && ver(side(0, 'to')) === 2 && rolesOf(side(0, 'to')) === rolesOf({ roles: ['generic', 'verifier'] })
    && ver(side(1, 'from')) === 2 && rolesOf(side(1, 'from')) === rolesOf({ roles: ['generic', 'verifier'] })
    && ver(side(1, 'to')) === 3 && rolesOf(side(1, 'to')) === rolesOf({ roles: ['generic'] });
  row('L10 an envelope amendment is effective with nobody touching the node (gate 5 flips), and amending it back makes the earlier envelope apply again; both audited with who (the founder), when, from (version, roles) and to (version, roles)',
    /gate 5 required_role/.test(before1.message || '') && up.ok && withIt.claimed && back.ok && back.version === 3 && /gate 5 required_role/.test(afterBack.message || '') && audOk,
    JSON.stringify(aud.map((x) => ({ who: x.actor_id === founder.userId, from: x.detail.from && [x.detail.from.version, x.detail.from.roles], to: x.detail.to && [x.detail.to.version, x.detail.to.roles] }))));
  // L11 (L7-24; AC-4 idempotence): every other "already" answer, judged by the full read-back around it
  const l11 = {};
  const rot1 = await admin.call('request-rotation', { computer_id: E.computer_id }, founder.token);
  l11['request-rotation twice'] = await already(() => admin.call('request-rotation', { computer_id: E.computer_id }, founder.token));
  l11['revoke-code with no live code'] = await already(() => admin.call('revoke-code', { computer_id: E.computer_id }, founder.token));
  l11['amend-envelope to the envelope in force'] = await already(() => admin.call('amend-envelope', { computer_id: E.computer_id, expected_version: 3, envelope: env(['generic']) }, founder.token));
  const ad1 = await admin.call('adopt-release', { computer_id: E.computer_id, release_id: W.rel.releaseId }, founder.token);
  l11['adopt-release of the adopted release'] = await already(() => admin.call('adopt-release', { computer_id: E.computer_id, release_id: W.rel.releaseId }, founder.token));
  l11['revoke-release of a revoked release'] = await already(() => admin.call('revoke-release', { release_id: f1.release_id }, founder.token));
  l11['revoke-key of a revoked key'] = await already(() => admin.call('revoke-key', { key_id: 'dev-key-0777' }, founder.token));
  const polL11 = (await admin.call('list-policies', {}, founder.token)).policies.find((p) => p.scope === 'tenant_default');
  l11['update-policy with no change'] = await already(() => admin.call('update-policy', { policy_id: polL11.policy_id, expected_version: polL11.version, changes: {} }, founder.token));
  const l11Bad = Object.entries(l11).filter(([, v]) => !v.ok).map(([k, v]) => k + ': ' + JSON.stringify(v.r).slice(0, 120) + ' same=' + v.same);
  row('L11 every "already" answers ok + already and writes nothing (full read-back, audit log included): a second rotation request, revoke-code with no live code, an amendment to the envelope in force, adopting the adopted release, revoking a revoked release or key, a policy update that changes nothing',
    rot1.ok && ad1.ok && l11Bad.length === 0, l11Bad.join(' ; ') || Object.keys(l11).length + ' "already" answers');
  // L12 (L2-F3 class; S-12): on every code-issuing action, a receipt carries a pairing code if and only if the plane recorded that same code
  const H = await admin.call('add-computer', { display_name: 'L-H receipts', envelope: env(['generic']) }, founder.token);
  const receipts = [['add-computer', H]];
  const l12Bad = [];
  const judge = async (label, r) => {
    const issued = r.ok === true && r.already !== true && typeof r.code_id === 'string';
    if (('pairing_code' in r) !== issued) { l12Bad.push(label + ': pairing_code ' + ('pairing_code' in r ? 'present' : 'absent') + ' (ok=' + r.ok + ' already=' + r.already + ' code_id=' + r.code_id + ')'); return; }
    if (!issued) return;
    const k = (await sup.query(`select state, locator, expires_at = $2::timestamptz same_expiry from factory.pairing_codes where code_id = $1`, [r.code_id, r.expires_at])).rows[0];
    const n = normalizeCode(r.pairing_code);
    if (!k || k.state !== 'PAIRING_CODE_ISSUED' || !n || k.locator !== n.locator || !k.same_expiry) l12Bad.push(label + ': stored ' + JSON.stringify(k) + ' shown locator ' + (n && n.locator));
  };
  await judge('add-computer', H);
  const l12Calls = [
    ['issue-code (reissue)', () => admin.call('issue-code', { computer_id: H.computer_id }, founder.token)],
    ['create-principal', () => admin.call('create-principal', { computer_id: H.computer_id }, founder.token)],
    ['repair', () => admin.call('repair', { computer_id: H.computer_id }, founder.token)],
    ['restore (not archived: already)', () => admin.call('restore', { computer_id: H.computer_id }, founder.token)],
    ['issue-code on an enrolled principal (refused)', () => admin.call('issue-code', { computer_id: E.computer_id }, founder.token)],
    ['archive', () => admin.call('archive', { computer_id: H.computer_id }, founder.token)],
    ['restore (archived)', () => admin.call('restore', { computer_id: H.computer_id }, founder.token)]];
  for (const [label, call] of l12Calls) { const r = await call(); receipts.push([label, r]); await judge(label, r); }
  const withCode = receipts.filter(([, r]) => 'pairing_code' in r).map(([l]) => l);
  row('L12 on every code-issuing action a receipt carries a pairing code exactly when the front door stored that code: present iff ok, not "already" and a code_id; the stored code is PAIRING_CODE_ISSUED with the shown code\'s locator and the shown expiry; 5 of these 8 receipts carry one',
    l12Bad.length === 0 && withCode.length === 5, l12Bad.join(' ; ') || withCode.join(', '));

  // ================================================================= S: the derived computer state (contract §1 "Derived"; AC-2)
  // S1: one computer, two principals, through the product: the state is derived over every principal, each principal's own state shown
  const SX = await W.enroll('S1-X two principals', env(['generic']));
  const sv = async () => (await admin.call('get-computer', { computer_id: SX.computer_id }, founder.token)).computer;
  const pst = (c) => c.principals.map((x) => x.state).join(',');
  const s1 = [];
  const s1cp = await admin.call('create-principal', { computer_id: SX.computer_id }, founder.token);
  s1.push(await sv());                                                                             // ALIVE [ALIVE, PAIRING_CODE_ISSUED]
  const SP2 = await W.pair({ ...s1cp, computer_id: SX.computer_id }, { name: 'S1-X P2' });
  s1.push(await sv());                                                                             // ALIVE [ALIVE, ALIVE]
  await admin.call('revoke-credential', { computer_id: SX.computer_id, principal_id: SP2.principal_id }, founder.token);
  s1.push(await sv());                                                                             // ALIVE [ALIVE, CREDENTIAL_REVOKED]
  await admin.call('revoke-credential', { computer_id: SX.computer_id, principal_id: SX.principal_id }, founder.token);
  s1.push(await sv());                                                                             // CREDENTIAL_REVOKED [both]
  const s1rp = await admin.call('repair', { computer_id: SX.computer_id, principal_id: SP2.principal_id }, founder.token);
  s1.push(await sv());                                                                             // PAIRING_CODE_ISSUED [CREDENTIAL_REVOKED, PAIRING_CODE_ISSUED]
  await W.pair({ ...s1rp, computer_id: SX.computer_id }, { name: 'S1-X P2 re-paired' });
  s1.push(await sv());                                                                             // ALIVE [CREDENTIAL_REVOKED, ALIVE]
  await admin.call('archive', { computer_id: SX.computer_id }, founder.token);
  s1.push(await sv());                                                                             // ARCHIVED
  const s1want = [['ALIVE', 'ALIVE,PAIRING_CODE_ISSUED'], ['ALIVE', 'ALIVE,ALIVE'], ['ALIVE', 'ALIVE,CREDENTIAL_REVOKED'], ['CREDENTIAL_REVOKED', 'CREDENTIAL_REVOKED,CREDENTIAL_REVOKED'],
    ['PAIRING_CODE_ISSUED', 'CREDENTIAL_REVOKED,PAIRING_CODE_ISSUED'], ['ALIVE', 'CREDENTIAL_REVOKED,ALIVE'], ['ARCHIVED', 'CREDENTIAL_REVOKED,CREDENTIAL_REVOKED']];
  const s1got = s1.map((c) => [c.state, pst(c)]);
  const s1live = s1.map((c) => (c.state === 'ALIVE' ? c.liveness === 'FRESH' && typeof c.runtime_phase === 'string' : c.liveness === null && c.runtime_phase === null));
  const sList = await admin.call('list-computers', { include_archived: true, limit: 200 }, founder.token);
  const sCounts = {};
  for (const c of sList.computers.items) sCounts[c.state] = (sCounts[c.state] || 0) + 1;
  const sSame = sList.computers.total <= 200 && JSON.stringify(Object.entries(sCounts).sort()) === JSON.stringify(Object.entries(sList.counts_by_state).sort());
  row('S1 the derived computer state over EVERY principal (contract §1): P1 ALIVE and P2 issued a code -> ALIVE; both ALIVE -> ALIVE; P2 revoked -> ALIVE; both revoked -> CREDENTIAL_REVOKED; P2 re-paired (a code) -> PAIRING_CODE_ISSUED; P2 enrolled again -> ALIVE; archived -> ARCHIVED; each principal\'s own state shown; liveness and the runtime phase only beside ALIVE; counts_by_state equals the listed states',
    JSON.stringify(s1got) === JSON.stringify(s1want) && s1live.every(Boolean) && sSame, JSON.stringify({ got: s1got, live: s1live, sSame }));
  // S2: the rule itself, case by case - the contract's order (lowest first), each adjacent pair; ARCHIVED; ALIVE over anything; all revoked
  const ORDER = ['UNENROLLED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED', 'PAIRING_CODE_ISSUED', 'PAIRING_STARTED', 'PAIRING_VERIFIED', 'NODE_ID_ISSUED',
    'NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING', 'INSTALL_FAILED', 'REGISTERING', 'REGISTRATION_FAILED'];
  const S2 = [[true, ['ALIVE'], 'ARCHIVED'], [false, ['ALIVE', 'CREDENTIAL_REVOKED'], 'ALIVE'], [false, ['REGISTRATION_FAILED', 'ALIVE'], 'ALIVE'],
    [false, ['CREDENTIAL_REVOKED', 'CREDENTIAL_REVOKED'], 'CREDENTIAL_REVOKED'], [false, ['UNENROLLED', 'CREDENTIAL_REVOKED'], 'UNENROLLED'], [false, [], 'UNENROLLED'],
    ...ORDER.slice(1).map((st, i) => [false, [st, ORDER[i], 'CREDENTIAL_REVOKED'], st]), ...ORDER.slice(1).map((st, i) => [false, [ORDER[i], st], st])];
  const s2got = [];
  for (const [arch, sts, want] of S2) s2got.push([(await sup.query(`select factory._derived_computer_state($1, $2::text[]) s`, [arch, sts])).rows[0].s, want, sts.join('+')]);
  const s2bad = s2got.filter(([g, w]) => g !== w);
  row('S2 the rule, case by case: ARCHIVED; ALIVE when any principal is ALIVE; CREDENTIAL_REVOKED when all are; otherwise the highest non-revoked state in the contract\'s order - every adjacent pair of that order, both ways round, and none principal -> UNENROLLED',
    s2bad.length === 0, s2bad.map(([g, w, k]) => k + '=' + g + '(want ' + w + ')').join(' ') || s2got.length + ' cases');

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

  // G2 (S-14, AC-12(e), WO-8 r2): the binding survives archive; an unbound re-enrollment of a bound machine is refused at registration BY
  // NAME, a retry included (reporting another fingerprint too); the refused record takes no work and cannot rotate its way out of its
  // walk; the correction follows S-14's order and is audited; the archived bound record keeps its binding
  const fb = { f1: 'b1'.repeat(32), f2: 'b2'.repeat(32), f9: 'b9'.repeat(32) };
  await admin.call('archive', { computer_id: home.computer_id }, founder.token);
  const VM1 = await W.enroll('VM1 (bound)', env(['generic']), { bindS16a: true, fingerprint: fb.f1 });
  const VM2 = await W.enroll('VM2 (unbound)', env(['generic']), { fingerprint: fb.f2 });
  const g2arc = await admin.call('archive', { computer_id: VM1.computer_id }, founder.token);
  const vm1Arch = (await admin.call('get-computer', { computer_id: VM1.computer_id }, founder.token)).computer;
  const REV = await W.enroll('VM1 again, unbound', env(['generic']), { fingerprint: fb.f1, allowRegisterRefusal: true });
  const enrOf = async (cid) => (await sup.query(`select state, state_reason from factory.enrollments where computer_id = $1 order by started_at desc limit 1`, [cid])).rows[0];
  const revEnr1 = await enrOf(REV.computer_id);
  const revRetry = await REV.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: fb.f9, hostname: 'VM1', os: 'Windows' });
  const revEnr2 = await enrOf(REV.computer_id);
  await REV.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const revClaim = await REV.n.op('claim', { only_work_order_id: await W.submit({ title: 'g2 docs', owned_surface: ['docs/g2.md'] }), resources: RES(64000) });
  const revRot = await REV.n.rotate(ed25519());
  const revCreds = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [REV.computer_id])).rows[0].n;
  const revView = (await admin.call('get-computer', { computer_id: REV.computer_id }, founder.token)).computer;
  const revRuns = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [REV.computer_id])).rows[0].n;
  const revAud = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'node.register' and reason = 's16a_bound_fingerprint' and target_id = $1`, [REV.computer_id])).rows[0].n;
  const isS14 = (r) => r && r.refused === 'registration_failed' && r.reason === 's16a_bound_fingerprint' && r.enrollment_state === 'REGISTRATION_FAILED';
  row('G2 an unbound re-enrollment of a bound machine (Add Computer without the binding, reporting the bound record\'s fingerprint, after that record was archived) is refused at registration by name (s16a_bound_fingerprint) and its enrollment is REGISTRATION_FAILED; the retry, reporting another fingerprint, is refused the same way; the record takes no work (gate 1), cannot rotate out of its walk (enrollment_not_alive, no credential issued) and shows REGISTRATION_FAILED; the archived bound record keeps its binding',
    g2arc.ok && vm1Arch.state === 'ARCHIVED' && vm1Arch.s16a_bound === true && isS14(REV.registered) && revEnr1.state === 'REGISTRATION_FAILED' && revEnr1.state_reason === 's16a_bound_fingerprint'
      && isS14(revRetry) && revEnr2.state === 'REGISTRATION_FAILED' && revClaim.refused === 'not_eligible' && /gate 1 valid_credential - no active credential registered to ALIVE/.test(revClaim.message || '')
      && revRot.refused === 'enrollment_not_alive' && revCreds === 1 && revView.state === 'REGISTRATION_FAILED' && revRuns === 0 && revAud === 2,
    JSON.stringify({ reg: REV.registered && [REV.registered.refused, REV.registered.reason, REV.registered.enrollment_state], enr1: revEnr1, retry: revRetry.refused && [revRetry.refused, revRetry.reason], enr2: revEnr2,
      claim: revClaim.message || revClaim.refused, rot: revRot.refused || revRot.ok, creds: revCreds, view: revView.state, runs: revRuns, aud: revAud }).slice(0, 900));
  // G2b (defence in depth): a credential that DID leave the walk by a rotation (written as the engine: the node operation refuses it)
  // carries the walk it came from - its registration is refused by name and it takes no work
  const rk = ed25519();
  await asEngine(sup, async () => {
    await sup.query(`update factory.node_credentials set status = 'superseded', superseded_at = now() where credential_id = $1`, [REV.credential_id]);
    await sup.query(`insert into factory.node_credentials (tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, replaces_credential_id)
        values ($1, $2, $3, $4, $5, 'rotate', $6)`, [OPERATOR, REV.computer_id, REV.principal_id, rk.publicKey, rk.thumbprint, REV.credential_id]);
  });
  const rn = apiNode(node.baseUrl, rk);
  await rn.session();
  const rnReg = await rn.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: fb.f9, hostname: 'VM1', os: 'Windows' });
  await rn.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const rnClaim = await rn.op('claim', { only_work_order_id: await W.submit({ title: 'g2b docs', owned_surface: ['docs/g2b.md'] }), resources: RES(64000) });
  const rnView = (await admin.call('get-computer', { computer_id: REV.computer_id }, founder.token)).computer;
  row('G2b a rotated credential of the refused record carries the walk it came from: its registration is refused by name (s16a_bound_fingerprint, walk REGISTRATION_FAILED), its claim is refused at gate 1, and the record still shows REGISTRATION_FAILED',
    rnReg.refused === 'registration_failed' && rnReg.reason === 's16a_bound_fingerprint' && rnReg.enrollment_state === 'REGISTRATION_FAILED'
      && rnClaim.refused === 'not_eligible' && /gate 1 valid_credential - no active credential registered to ALIVE/.test(rnClaim.message || '') && rnView.state === 'REGISTRATION_FAILED',
    JSON.stringify({ reg: [rnReg.refused, rnReg.reason, rnReg.enrollment_state], claim: rnClaim.message || rnClaim.refused, view: rnView.state }));
  // the correction, in S-14's order: archive every non-archived record of the correct computer (here VM2) and of the wrongly bound one
  // (the refused record), then Add Computer WITH the binding for the correct computer
  const c1 = await admin.call('archive', { computer_id: REV.computer_id }, founder.token);
  const c2 = await admin.call('archive', { computer_id: VM2.computer_id }, founder.token);
  const VM2b = await W.enroll('VM2 (bound, corrected)', env(['generic']), { bindS16a: true, fingerprint: fb.f2 });
  const vm2bView = (await admin.call('get-computer', { computer_id: VM2b.computer_id }, founder.token)).computer;
  const vm1After = (await admin.call('get-computer', { computer_id: VM1.computer_id }, founder.token)).computer;
  const corrAud = (await sup.query(`select action, target_id, detail ->> 's16a_bound' bound from factory.audit_events where outcome = 'ok' and action in ('computer.archived', 'computer.added')
      and target_id = any ($1) order by event_id`, [[REV.computer_id, VM2.computer_id, VM2b.computer_id]])).rows;
  row('G2c the correction in S-14\'s order - archive the refused record and the correct machine\'s record, then Add Computer with the binding for the correct machine - reaches ALIVE (a bound record is never refused), each step audited; the first machine\'s archived record keeps its binding',
    c1.ok && c2.ok && vm2bView.state === 'ALIVE' && vm2bView.s16a_bound === true && vm1After.s16a_bound === true && vm1After.state === 'ARCHIVED'
      && corrAud.some((x) => x.action === 'computer.archived' && x.target_id === REV.computer_id) && corrAud.some((x) => x.action === 'computer.archived' && x.target_id === VM2.computer_id)
      && corrAud.some((x) => x.action === 'computer.added' && x.target_id === VM2b.computer_id && x.bound === 'true'),
    JSON.stringify({ vm2b: [vm2bView.state, vm2bView.s16a_bound], vm1: [vm1After.state, vm1After.s16a_bound], aud: corrAud.map((x) => x.action + (x.bound ? ':' + x.bound : '')) }));
  // G2d (S-14 / S-16; which enrollment state the record shows is change request CR-013): an unbound record that was ALIVE BEFORE a bound
  // record reported its fingerprint. Until it registers again it is a Home-computer record: product code refused at gate 7, Director-
  // document work taken. Its next registration is refused by name and its enrollment stays ALIVE (contract §2 has no edge from ALIVE to
  // REGISTRATION_FAILED); from then on it takes no work at all (S-14) - authoring and verification both refused at gate 1
  const fg = 'b4'.repeat(32);
  const UA = await W.enroll('unbound, ALIVE first', env(['generic', 'verifier']), { fingerprint: fg });
  await VM2b.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fg, resources: RES(1000) });
  await UA.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const uaProduct = await UA.n.op('claim', { only_work_order_id: await W.submit({ title: 'g2d product', owned_surface: ['scripts/g2d.mjs'] }), resources: RES(90000) });
  const uaDocs = await UA.n.op('claim', { only_work_order_id: await W.submit({ title: 'g2d docs', owned_surface: ['docs/g2d.md'] }), resources: RES(90000) }); // the best resources here: ranking decides nothing
  if (uaDocs.claimed) await UA.n.op('complete', { run_id: uaDocs.claimed.run_id, status: 'done', termination_reason: 'completed' });
  // a candidate waiting for verification that UA could otherwise take (the bound record authors Director-document work, which S-16(a) allows)
  const g2dv = await VM2b.n.op('claim', { only_work_order_id: await W.submit({ title: 'g2d verified docs', owned_surface: ['docs/g2d-v.md'], requires_verification: true }), resources: RES(95000) });
  const g2dvDone = g2dv.claimed ? await VM2b.n.op('complete', { run_id: g2dv.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: 'd4'.repeat(20), candidate_tree: 'd4'.repeat(20) }) : g2dv;
  const uaReg = await UA.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: fg, hostname: 'UA', os: 'Windows' });
  const uaEnr = await enrOf(UA.computer_id);
  await UA.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(99000) });
  const uaAfter = await UA.n.op('claim', { only_work_order_id: await W.submit({ title: 'g2d docs after', owned_surface: ['docs/g2d-after.md'] }), resources: RES(99000) });
  const uaVer = g2dvDone.verification_work_order_id
    ? await UA.n.op('verification-claim', { only_work_order_id: g2dvDone.verification_work_order_id, resources: RES(99000) }) : g2dvDone;
  const uaView = (await admin.call('get-computer', { computer_id: UA.computer_id }, founder.token)).computer;
  const uaRuns = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [UA.computer_id])).rows[0].n;
  const s14gate = (r) => r && r.refused === 'not_eligible' && /gate 1 valid_credential - S-14/.test(r.message || '');
  row('G2d an unbound record that was ALIVE before a bound record reported its fingerprint: until it registers again it is a Home-computer record (product code refused at gate 7, Director-document work taken); its next registration is refused by name (s16a_bound_fingerprint) with its enrollment left ALIVE (no contract edge; CR-013), and from then on it takes no work - Director-document authoring and a waiting verification both refused at gate 1 (S-14); the view shows ALIVE with the refusal time',
    uaProduct.refused === 'not_eligible' && /gate 7 independence/.test(uaProduct.message || '') && uaDocs.claimed
      && uaReg.refused === 'registration_failed' && uaReg.reason === 's16a_bound_fingerprint' && uaReg.enrollment_state === 'ALIVE' && uaEnr.state === 'ALIVE'
      && s14gate(uaAfter) && s14gate(uaVer) && uaView.state === 'ALIVE' && typeof uaView.s14_registration_refused_at === 'string' && uaRuns === 1,
    JSON.stringify({ product: uaProduct.message || uaProduct.refused, docs: !!uaDocs.claimed, reg: [uaReg.refused, uaReg.reason, uaReg.enrollment_state], enr: uaEnr,
      after: uaAfter.message || (uaAfter.claimed ? 'CLAIMED' : uaAfter.refused), ver: uaVer.message || (uaVer.claimed ? 'CLAIMED' : uaVer.refused),
      view: [uaView.state, uaView.s14_registration_refused_at], runs: uaRuns }).slice(0, 1000));
  await admin.call('archive', { computer_id: UA.computer_id }, founder.token);
  // G2r (S-14 / AC-12(e) with the REAL runtime code on this machine, no logon task: qa/factory/v1/realnode.mjs): a bound record that
  // reported this machine's fingerprint (the registry's value) is archived; the runtime then enrolls this machine through an unbound Add
  // Computer: its registration is refused by name, the worker stops REFUSED (it is not retried by the supervisor), and a second start
  // is refused the same way; the record is REGISTRATION_FAILED and runs nothing
  await admin.call('archive', { computer_id: VM2b.computer_id }, founder.token);
  const regFp = registryFingerprint();
  const RB = await W.enroll('this machine (bound)', env(['generic']), { bindS16a: true, fingerprint: regFp.fingerprint });
  await admin.call('archive', { computer_id: RB.computer_id }, founder.token);
  const ru = await admin.call('add-computer', { display_name: 'this machine again (unbound)', envelope: env(['generic']) }, founder.token);
  const rHome = mkdtempSync(join(tmpdir(), 'bf-g2r-'));
  const rtv = { version: '0.1.0', digest: W.rel.digest };
  const re1 = await realEnroll({ api: node.baseUrl, home: rHome, code: ru.pairing_code, ...rtv });
  const rst1 = (() => { try { return JSON.parse(readFileSync(join(rHome, 'state', 'status.json'), 'utf8')); } catch { return {}; } })();
  const re2 = await realWork({ home: rHome, ...rtv });
  const rEnr = await enrOf(ru.computer_id);
  const rRuns = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [ru.computer_id])).rows[0].n;
  const rTr = (await sup.query(`select count(*)::int n from factory.enrollment_transitions t join factory.enrollments e using (enrollment_id) where e.computer_id = $1 and t.to_state = 'REGISTRATION_FAILED'`, [ru.computer_id])).rows[0].n;
  try { rmSync(rHome, { recursive: true, force: true }); } catch { /* the temp dir goes with the OS */ }
  row('G2r the real runtime code, enrolling this machine through an unbound Add Computer after a bound record reported this machine\'s fingerprint: registration refused by name, the worker stops REFUSED (s16a_bound_fingerprint; exit 2, no retry loop), a second start is refused the same way; the record is REGISTRATION_FAILED (twice recorded) and runs nothing',
    regFp.fingerprint && re1.workerExit === 2 && rst1.state === 'REFUSED' && rst1.reason === 's16a_bound_fingerprint' && re2.workerExit === 2
      && rEnr.state === 'REGISTRATION_FAILED' && rEnr.state_reason === 's16a_bound_fingerprint' && rRuns === 0 && rTr === 2,
    JSON.stringify({ e1: [re1.status, re1.workerExit], st: [rst1.state, rst1.reason], e2: [re2.status, re2.workerExit], enr: rEnr, runs: rRuns, tr: rTr,
      out: re1.workerExit !== 2 ? (re1.stdout + re1.stderr).slice(-600) : undefined }).slice(0, 1200));
  // G2e (S-14: "has reported" includes what a record reported at enroll/start): a record carrying the binding reports fe at enroll/start
  // and goes no further (no complete, no registration, so fe is on its enrollment only); an unbound record that then registers
  // reporting fe is refused by name
  const fe = 'b6'.repeat(32);
  const BE = await admin.call('add-computer', { display_name: 'bound, enroll/start only', envelope: env(['generic']), bind_s16a: true }, founder.token);
  const beStart = BE.ok ? await enrollStart(node.baseUrl, BE.pairing_code, ed25519(), { fingerprint: fe, hostname: 'BE' }, { localAddress: '127.0.0.251' }) : BE;
  const beFp = (await sup.query(`select (select count(*)::int from factory.computer_fingerprints where computer_id = $1) cf,
      (select count(*)::int from factory.nodes where computer_id = $1 and machine_fingerprint is not null) nf,
      (select registered_fingerprint from factory.computers where computer_id = $1) rf,
      (select count(*)::int from factory.enrollments where computer_id = $1 and reported_fingerprint = $2) ef`, [BE.computer_id, fe])).rows[0];
  const UE = await W.enroll('unbound, reports the enroll/start fingerprint', env(['generic']), { fingerprint: fe, allowRegisterRefusal: true });
  row('G2e a fingerprint a bound record reported only at enroll/start counts: an unbound record registering with it is refused by name (s16a_bound_fingerprint) and its enrollment is REGISTRATION_FAILED',
    BE.ok && beStart.ok && beFp.cf === 0 && beFp.nf === 0 && beFp.rf === null && beFp.ef === 1 && isS14(UE.registered),
    JSON.stringify({ be: BE.ok || BE.refused, start: beStart.ok || beStart.refused, bound: beFp, reg: UE.registered && [UE.registered.refused || 'ok', UE.registered.reason, UE.registered.enrollment_state] }).slice(0, 500));
  await admin.call('archive', { computer_id: UE.computer_id }, founder.token);
  await admin.call('archive', { computer_id: BE.computer_id }, founder.token);

  // G3 (S-16(b), AC-14(i), P-9): submission checks campaign_key against the tenant's campaign policy rows - an unknown key, a malformed
  // one and a non-string all answer unknown_campaign (400) with no row written; a keyed submission with requires_verification false
  // answers campaign_requires_verification (400); the real key with verification is stored; every refusal leaves an audit row
  const woCount = async () => (await sup.query(`select count(*)::int n from factory.work_orders`)).rows[0].n;
  const g3n0 = await woCount();
  const g3 = [];
  for (const k of ['no-such-campaign', 'X!', 7]) g3.push(await admin.call('submit-work-order', { title: 'g3 ' + k, priority: 1, campaign_key: k }, founder.token));
  const g3v = await admin.call('submit-work-order', { title: 'g3 unverified', priority: 1, campaign_key: 'auto-enrollment-v1', requires_verification: false }, founder.token);
  const g3n1 = await woCount();
  const g3ok = await admin.call('submit-work-order', { title: 'g3 campaign', priority: 1, campaign_key: 'auto-enrollment-v1', requires_verification: true }, founder.token);
  const g3row = g3ok.ok ? (await sup.query(`select campaign_key, requires_verification from factory.work_orders where work_order_id = $1`, [g3ok.work_order_id])).rows[0] : {};
  const g3aud = (await sup.query(`select reason from factory.audit_events where actor_id = $1 and action = 'work_order.submitted' and outcome = 'refused' order by event_id`, [founder.userId])).rows.map((x) => x.reason);
  row('G3 a campaign_key naming no campaign row (unknown, malformed, not a string) is refused unknown_campaign (400) and a campaign work order with requires_verification false is refused campaign_requires_verification (400) - nothing written, each refusal audited; the campaign\'s key with verification is accepted and stored',
    g3.every((r) => r.refused === 'unknown_campaign' && r.http === 400) && g3v.refused === 'campaign_requires_verification' && g3v.http === 400 && g3n1 === g3n0
      && g3ok.ok && g3row.campaign_key === 'auto-enrollment-v1' && g3row.requires_verification === true
      && JSON.stringify(g3aud.slice(-4)) === JSON.stringify(['unknown_campaign', 'unknown_campaign', 'unknown_campaign', 'campaign_requires_verification']),
    JSON.stringify({ g3: g3.map((r) => r.refused || 'ok'), g3v: g3v.refused || 'ok', written: g3n1 - g3n0, ok: g3ok.ok, row: g3row, aud: g3aud.slice(-4) }));

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
  // (read back from the server, whatever the answers said: neither work order was claimed, and no run of either exists)
  const e2s = (await sup.query(`select (select w.status from factory.work_orders w where w.work_order_id = $1) vf, (select w.status from factory.work_orders w where w.work_order_id = $2) cap,
      (select count(*)::int from factory.agent_runs r where r.work_order_id in ($1, $2)) runs`, [wvf, capWo])).rows[0];
  row('E2 the best resources, the preferred verifier\'s hostname, and a self-reported capability never make a node eligible: gate 5 (role) and gate 6 (capability from the envelope) refuse by name, and a server read-back shows both work orders still queued with no run',
    /gate 5 required_role/.test(best.message || '') && /gate 6 required_capabilities/.test(selfCap.message || '') && e2s.vf === 'queued' && e2s.cap === 'queued' && e2s.runs === 0,
    best.message + ' | ' + selfCap.message + ' | ' + JSON.stringify(e2s));

  // E1b / E1n / E1t / E1a / E1e AC-6(b) BY STATE, NOT BY NAME: a body naming another node, another tenant, another agent or its own
  // capabilities changes nothing - read back from the server, whatever the answers say. F (eligible for FA, a queued work order of its
  // own tenant) sends a heartbeat naming B's node id, a heartbeat naming capabilities, a claim naming the second tenant and FW (a queued
  // work order of that tenant, which F could claim if the tenant came from the body), and a claim naming FA with A's principal and
  // computer. ONE ROW PER VICTIM, so that each row fails only when a front door ACTS on the named value: removing the identity refusal
  // alone (both layers) lets F's own claim of FA through - that changes FA (E1b, F's own work) and none of the victim rows:
  //   E1n B's node row (the node named)       E1t FW, its runs and its lock (the tenant named)
  //   E1a the runs under A's principal or computer (the agent named)    E1e F's envelopes and envelope pointer (its own capabilities)
  // (F reports the best resources of every node here, so the ranking never defers its claims)
  const BEST = { cpu_cores: 64, cpu_pct: 0, ram_free_mb: 1e6, disk_free_mb: 1e7 };
  const FW = randomUUID();
  await asEngine(sup, () => sup.query(`insert into factory.work_orders (work_order_id, title, requires_capabilities, owned_surface, priority_num, requires_verification,
      queued_at, status, work_type, tenant_id) values ($1, 'E1b foreign-tenant work', '{factory-enrolled-v1}', '{e1b/foreign}', 99, false, now(), 'queued', 'software_development', $2)`, [FW, FOREIGN]));
  const FA = await W.submit({ title: 'E1b own work, F eligible', owned_surface: ['e1b/own'], priority: 99 });
  const e1bState = async () => (await sup.query(`select
      (select to_jsonb(n) from factory.nodes n where n.node_id = $1) b_node,
      (select to_jsonb(w) from factory.work_orders w where w.work_order_id = $3) fw,
      (select count(*)::int from factory.agent_runs r where r.work_order_id = $3) fw_runs,
      (select count(*)::int from factory.surface_locks l where l.surface = 'e1b/foreign') fw_locks,
      (select count(*)::int from factory.agent_runs r where r.principal_id = $4 or r.computer_id = $5) a_runs,
      (select jsonb_agg(to_jsonb(e) order by e.version) from factory.authorization_envelopes e where e.computer_id = $6) f_envelopes,
      (select m.current_envelope_version from factory.computers m where m.computer_id = $6) f_pointer,
      (select to_jsonb(w) from factory.work_orders w where w.work_order_id = $2) fa,
      (select count(*)::int from factory.agent_runs r where r.work_order_id = $2) fa_runs,
      (select count(*)::int from factory.surface_locks l where l.surface = 'e1b/own') fa_locks`, [B.node_id, FA, FW, A.principal_id, A.computer_id, F.computer_id])).rows[0];
  const e1b0 = await e1bState();
  await F.n.op('heartbeat', { phase: 'DRAINING', node_id: B.node_id });
  await F.n.op('heartbeat', { phase: 'AVAILABLE', capabilities: ['deploy'] });
  await F.n.op('claim', { only_work_order_id: FW, tenant_id: FOREIGN, resources: BEST });
  await F.n.op('claim', { only_work_order_id: FA, principal_id: A.principal_id, computer_id: A.computer_id, resources: BEST });
  const e1b1 = await e1bState();
  // (the control: F is eligible for FA - a plain claim takes it; so a refusal above is the identity refusal, not an ineligible node)
  const ctlClaim = await F.n.op('claim', { only_work_order_id: FA, resources: BEST });
  const changed = (...keys) => keys.filter((k) => JSON.stringify(e1b0[k]) !== JSON.stringify(e1b1[k]));
  const said = (d) => (d.length ? 'changed: ' + d.join(', ') : 'unchanged');
  const dA = changed('fa', 'fa_runs', 'fa_locks');
  row('E1b F\'s own work: the claim of FA whose body names A\'s principal and computer changed neither FA nor its runs or lock (read back), and F itself is eligible for FA (a plain claim then takes it)',
    dA.length === 0 && e1b0.fa !== null && ctlClaim.ok === true && ctlClaim.claimed && ctlClaim.claimed.work_order.work_order_id === FA,
    said(dA) + '; control claim ' + (ctlClaim.ok && ctlClaim.claimed ? 'took FA' : JSON.stringify(ctlClaim).slice(0, 160)));
  const dN = changed('b_node');
  row('E1n the node named in the body: a heartbeat of F naming B\'s node id left B\'s node row exactly as it was (read back)', dN.length === 0 && e1b0.b_node !== null, said(dN));
  const dT = changed('fw', 'fw_runs', 'fw_locks');
  row('E1t the tenant named in the body: a claim of F naming the second tenant and its queued work order FW left FW, its runs and its lock exactly as they were (read back)', dT.length === 0 && e1b0.fw !== null, said(dT));
  const dAg = changed('a_runs');
  row('E1a the agent named in the body: a claim naming A\'s principal and computer recorded no run under either (read back)', dAg.length === 0, said(dAg) + ' (runs under A: ' + e1b0.a_runs + ' -> ' + e1b1.a_runs + ')');
  const dE = changed('f_envelopes', 'f_pointer');
  row('E1e the capabilities named in the body: a heartbeat of F naming capabilities left F\'s envelope versions and its envelope pointer exactly as they were (read back)', dE.length === 0 && e1b0.f_pointer !== null, said(dE));

  // Q1 ONE SQL STATEMENT PER REQUEST, measured over every request of this suite: the harness counts the statements each Node API and
  // Admin API request runs on its database login (api_harness.mjs); none runs two, and every 200 runs exactly one
  const perReq = [...node.perRequest, ...admin.perRequest];
  const two = perReq.filter((x) => x.n > 1), okNoSql = perReq.filter((x) => x.status === 200 && x.n !== 1);
  row('Q1 every Node API and Admin API request of this suite (' + perReq.length + ') ran at most one SQL statement on its database login, and every one answered 200 ran exactly one',
    perReq.length > 50 && two.length === 0 && okNoSql.length === 0, JSON.stringify({ more: two.slice(0, 4), okWithout: okNoSql.slice(0, 4) }));
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 admin_acceptance did not complete', false, (e && e.stack) || String(e));
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
