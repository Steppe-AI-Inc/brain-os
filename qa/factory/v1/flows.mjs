// Product flows for the developer suites: everything through the two real handlers, the way a Factory admin and a clean PC do it.
import { randomBytes } from 'node:crypto';
import { startV1Plane, connect } from './plane.mjs';
import { OPERATOR, asEngine, ed25519, publishedRelease } from './fixtures.mjs';
import { apiNode, enrollStart, enrollComplete } from './nodeclient.mjs';
import { startApi, startAdminApi } from './api_harness.mjs';
import { startBrainOsStub } from './brainos_stub.mjs';

export const RES = (ram = 8000) => ({ cpu_cores: 8, cpu_pct: 10, ram_free_mb: ram, disk_free_mb: 50000 });

/** A plane with both APIs, a Brain OS stub, a founder persona in tenant_admins (tier founder), and a published dev release. */
export async function world() {
  const plane = await startV1Plane();
  const brain = await startBrainOsStub();
  const pepperB64 = randomBytes(32).toString('base64');
  const node = await startApi(plane, { pepperB64 });
  const admin = await startAdminApi(plane, brain, { pepperB64 });
  const sup = await connect(plane.superUrl);
  const founder = brain.persona('founder');
  await asEngine(sup, () => sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'founder')`, [OPERATOR, founder.userId]));
  const rel = await publishedRelease(sup);
  let ipn = 30;
  const w = {
    plane, brain, node, admin, sup, founder, rel,
    /** the founder's provisioning step: a Factory admin row (tier founder | admin) */
    async grantAdmin(persona, tier = 'admin', tenant = OPERATOR) {
      await asEngine(sup, () => sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, $3)`, [tenant, persona.userId, tier]));
    },
    /** Add Computer -> code -> installer -> credential -> session -> RUNTIME_INSTALLING -> register -> ALIVE -> AVAILABLE */
    async enroll(name, envelope = { roles: ['generic', 'verifier'] }, { as = founder, fingerprint = null, bindS16a = false, res = RES(), extra = {} } = {}) {
      const add = await admin.call('add-computer', { display_name: name, envelope, ...(bindS16a ? { bind_s16a: true } : {}), ...extra }, as.token);
      if (!add.ok) throw new Error('add-computer refused: ' + JSON.stringify(add));
      return w.pair(add, { fingerprint, res, name });
    },
    /** consume a code (from add / repair / restore / create-principal) and bring the node to AVAILABLE */
    async pair(issued, { fingerprint = null, res = RES(), name = 'node' } = {}) {
      const id = ed25519();
      const fp = fingerprint || randomBytes(32).toString('hex');
      const from = { localAddress: '127.0.0.' + (ipn++ % 200 + 30) };
      const s = await enrollStart(node.baseUrl, issued.pairing_code, id, { fingerprint: fp, hostname: name }, from);
      if (!s.ok) throw new Error('enroll/start refused: ' + JSON.stringify(s));
      const c = await enrollComplete(node.baseUrl, s, id, from);
      if (!c.ok) throw new Error('enroll/complete refused: ' + JSON.stringify(c));
      const n = apiNode(node.baseUrl, id);
      await n.session();
      await n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
      const reg = await n.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest, fingerprint: fp, hostname: name, os: 'Windows' });
      if (!reg.ok) throw new Error('register refused: ' + JSON.stringify(reg));
      await n.op('heartbeat', { phase: 'RECOVERING', resources: res });
      await n.op('heartbeat', { phase: 'AVAILABLE', resources: res });
      return { computer_id: issued.computer_id || c.computer_id, principal_id: c.principal_id, credential_id: c.credential_id, node_id: c.node_id,
        identity: id, fingerprint: fp, n };
    },
    async submit(body, as = founder) {
      const r = await admin.call('submit-work-order', { requires_verification: false, priority: 10, ...body }, as.token);
      if (!r.ok) throw new Error('submit refused: ' + JSON.stringify(r));
      return r.work_order_id;
    },
    async stop() {
      await sup.end().catch(() => {});
      await node.stop().catch(() => {}); await admin.stop().catch(() => {}); await brain.stop().catch(() => {});
      await plane.stop();
    },
  };
  return w;
}

/** a small row recorder shared by the suites */
export function recorder() {
  const results = [];
  const row = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
  return { results, row };
}
