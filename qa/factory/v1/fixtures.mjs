// Test fixtures for the v1 suites: rows written AS THE ENGINE (factory_owner), through the same guards the front doors meet.
// Test-only: a disposable plane, the superuser's session, `set role factory_owner`. Never a deployed path.
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';

export const OPERATOR = 'a1e0f000-0000-4000-8000-000000000001';
export const ADMIN = '0f0f0f0f-0000-4000-8000-00000000ad01';
export const nodeIdOf = (principalId) => 'node-' + principalId.replace(/-/g, '');

/** A real Ed25519 key pair: { publicKey: raw 32 bytes, privateKey: KeyObject } */
export function ed25519() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const pk = Buffer.from(raw);
  return { publicKey: pk, privateKey, thumbprint: thumbprint(pk) };
}
export function thumbprint(pk) { return createHash('sha256').update(pk).digest('hex'); }

/** Run statements as the engine in one transaction (the superuser connection `c`). */
export async function asEngine(c, fn) {
  await c.query('begin');
  try {
    await c.query('set local role factory_owner');
    const r = await fn();
    await c.query('commit');
    return r;
  } catch (e) { try { await c.query('rollback'); } catch { /* ended */ } throw e; }
}

const locator = () => { const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; let s = ''; for (const b of randomBytes(6)) s += A[b % 32]; return s; };

/**
 * An enrolled computer, as Add Computer + enrollment will leave it: computer, envelope v1, its first principal, a consumed code,
 * an enrollment at NODE_CREDENTIAL_ISSUED, an active credential and the principal's node row. Returns the ids.
 */
export async function enrolledComputer(c, { roles = ['generic', 'verifier'], caps = [], name = 'fixture', fingerprint = null, s16a = false } = {}) {
  const computerId = randomUUID(), principalId = randomUUID(), codeId = randomUUID(), enrollmentId = randomUUID(), credentialId = randomUUID();
  const nodeId = nodeIdOf(principalId);
  const keys = ed25519();
  const pk = keys.publicKey;
  await asEngine(c, async () => {
    await c.query(`insert into factory.computers (computer_id, tenant_id, display_name, created_by, s16a_bound_at, s16a_bound_by)
                   values ($1, $2, $3, $4, case when $5 then now() end, case when $5 then $4::uuid end)`,
      [computerId, OPERATOR, name, ADMIN, s16a]);
    await c.query(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, created_by)
                   values ($1, $2, 1, $3, $4, $5)`, [OPERATOR, computerId, roles, caps, ADMIN]);
    await c.query(`insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by)
                   values ($1, $2, $3, $4, 'add_computer', $5)`, [principalId, OPERATOR, computerId, nodeId, ADMIN]);
    await c.query(`insert into factory.pairing_codes (code_id, tenant_id, computer_id, principal_id, envelope_version, purpose, locator,
                     code_mac, pepper_version, issued_by, expires_at)
                   values ($1, $2, $3, $4, 1, 'add_computer', $5, $6, 1, $7, now() + interval '10 minutes')`,
      [codeId, OPERATOR, computerId, principalId, locator(), randomBytes(32), ADMIN]);
    await c.query(`update factory.pairing_codes set state = 'PAIRING_STARTED', started_at = now() where code_id = $1`, [codeId]);
    await c.query(`insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint,
                     challenge, challenge_expires_at)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '5 minutes')`,
      [enrollmentId, OPERATOR, codeId, computerId, principalId, pk, createHash('sha256').update(pk).digest('hex'), randomBytes(32)]);
    for (const s of ['PAIRING_VERIFIED', 'NODE_ID_ISSUED']) await c.query('update factory.enrollments set state = $2 where enrollment_id = $1', [enrollmentId, s]);
    await c.query(`insert into factory.node_credentials (credential_id, tenant_id, computer_id, principal_id, public_key, key_thumbprint,
                     issued_via, enrollment_id)
                   values ($1, $2, $3, $4, $5, $6, 'enrollment', $7)`,
      [credentialId, OPERATOR, computerId, principalId, pk, createHash('sha256').update(pk).digest('hex'), enrollmentId]);
    await c.query(`update factory.enrollments set state = 'NODE_CREDENTIAL_ISSUED', credential_id = $2 where enrollment_id = $1`, [enrollmentId, credentialId]);
    await c.query(`update factory.pairing_codes set state = 'PAIRING_CONSUMED', consumed_at = now(), consumed_by_enrollment_id = $2 where code_id = $1`,
      [codeId, enrollmentId]);
    await c.query(`insert into factory.nodes (node_id, principal_id, computer_id, last_heartbeat_at, machine_fingerprint)
                   values ($1, $2, $3, now(), $4)`, [nodeId, principalId, computerId, fingerprint]);
  });
  return { computerId, principalId, codeId, enrollmentId, credentialId, nodeId, publicKey: pk, privateKey: keys.privateKey, thumbprint: thumbprint(pk) };
}

/** A new-model work order (it holds factory-enrolled-v1). */
export async function newModelWorkOrder(c, { surface = [], priority = 10, requiresVerification = true, status = 'queued', title = 'new-model fixture', caps = [] } = {}) {
  const id = randomUUID();
  await asEngine(c, () => c.query(`insert into factory.work_orders (work_order_id, title, requires_capabilities, owned_surface, priority_num,
      requires_verification, queued_at, status)
    values ($1, $2, $3, $4, $5, $6, now(), $7)`, [id, title, ['factory-enrolled-v1', ...caps], surface, priority, requiresVerification, status]));
  return id;
}

/** An enrolled run in progress on a new-model work order, holding its surfaces (lease_expires_at 'infinity' on the locks). */
export async function enrolledRun(c, comp, workOrderId, { leaseSeconds = 120, surfaces = [] } = {}) {
  const runId = randomUUID();
  await asEngine(c, async () => {
    await c.query(`insert into factory.agent_runs (run_id, work_order_id, node_id, status, lease_expires_at, last_heartbeat_at, started_at,
                     authoring_node_id, principal_id, computer_id, credential_id, run_kind, assignment_role, envelope_version)
                   values ($1, $2, $3, 'in_progress', now() + ($4 || ' seconds')::interval, now(), clock_timestamp(), $3, $5, $6, $7,
                     'authoring', 'generic', 1)`,
      [runId, workOrderId, comp.nodeId, String(leaseSeconds), comp.principalId, comp.computerId, comp.credentialId]);
    await c.query('update factory.agent_runs set authoring_run_id = run_id where run_id = $1', [runId]);
    for (const s of surfaces) {
      await c.query(`insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at, principal_id)
                     values ($1, $2, $3, 'infinity', $4)`, [s, runId, comp.nodeId, comp.principalId]);
    }
    await c.query(`update factory.work_orders set status = 'claimed', updated_at = now() where work_order_id = $1`, [workOrderId]);
  });
  return runId;
}

export async function enrolledCheckpoint(c, comp, runId, workOrderId) {
  const id = randomUUID();
  await asEngine(c, () => c.query(`insert into factory.checkpoints (checkpoint_id, run_id, work_order_id, location, scenario, payload,
      principal_id, computer_id) values ($1, $2, $3, 'fixture://p1', 'p1', '{"step":1}', $4, $5)`,
    [id, runId, workOrderId, comp.principalId, comp.computerId]));
  return id;
}

/** A legacy work order, inserted the way 69df2f52 inserts one (no new-model column). */
export async function legacyWorkOrder(c, { surface = [], title = 'legacy fixture', createdAt = null } = {}) {
  const id = randomUUID();
  await c.query(`insert into factory.work_orders (work_order_id, title, owned_surface, created_at) values ($1, $2, $3, coalesce($4::timestamptz, now()))`,
    [id, title, surface, createdAt]);
  return id;
}

/** A published release on the plane, as the founder's publish action records it (test-only: written as the engine). */
export async function publishedRelease(c, { channel = 'dev', version = '0.1.0', digest = null } = {}) {
  const id = randomUUID();
  const d = digest || createHash('sha256').update(id).digest('hex');
  await asEngine(c, () => c.query(`insert into factory.releases (release_id, tenant_id, channel, version, source_sha, digest, key_id, signature,
      receipt_sha256, manifest, published_by) values ($1, $2, $3, $4, $5, $6, 'dev-key-0001', $7, $8, '{}', $9)`,
    [id, OPERATOR, channel, version, createHash('sha1').update(id).digest('hex'), d, 'A'.repeat(86), createHash('sha256').update('r' + id).digest('hex'), ADMIN]));
  return { releaseId: id, digest: d };
}
