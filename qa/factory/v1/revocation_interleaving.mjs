#!/usr/bin/env node
// S-3 / AC-4 / R-4 DEVELOPER REHEARSAL: forced interleavings of a node call and a revocation, on the credential row, with explicit
// transactions on separate connections (the node's front door as factory_node_api; the revoke as factory_admin_api):
//   I1  the CALL takes its credential lock first; the revoke is issued inside the call's transaction (between its first credential read
//       and its commit): the revoke WAITS, the call commits first, then the revoke commits; the next call is refused
//   I2  the REVOKE takes the row first; the call is issued while the revoke is uncommitted: the call WAITS, and after the revoke commits
//       it is refused with every row unchanged
//   I3  a ROTATE races the revoke, both orders: the revoke always ends on the principal's current credential (never escaped)
//   I4  other computers are unaffected; the revoked computer's evidence is intact
// An order the serialization prevents is not a missing subject: it is the proof. Developer verification, never independent.
// usage: node qa/factory/v1/revocation_interleaving.mjs [--evidence <file>]
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { connect } from './plane.mjs';
import { ed25519 } from './fixtures.mjs';
import { tokenHash } from './nodeclient.mjs';
import { world, recorder, RES } from './flows.mjs';

const { results, row } = recorder();
const W = await world();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const conns = [];
const open = async (url) => { const c = await connect(url); conns.push(c); return c; };
// wait until some backend is blocked on a lock while running `like`
const waitBlocked = async (mon, like, ms = 8000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) {
    const r = await mon.query(`select count(*)::int n from pg_stat_activity where wait_event_type = 'Lock' and query like $1`, ['%' + like + '%']);
    if (r.rows[0].n > 0) return true;
  }
  return false;
};
try {
  const { founder, sup } = W;
  const mon = await open(W.plane.superUrl);
  const nodeC = await open(W.plane.nodeApiUrl);
  const adminC = await open(W.plane.adminApiUrl);
  const call = (c, fn, hash, body) => c.query(`select factory.${fn}($1::bytea, $2::jsonb) r`, [hash, JSON.stringify(body)]).then((x) => x.rows[0].r);
  const revoke = (c, computer) => c.query(`select factory.admin_revoke_credential($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ computer_id: computer })]).then((x) => x.rows[0].r);
  const B = await W.enroll('I-B');

  // a fresh enrolled computer with an in-flight run, for each case
  const inflight = async (name) => {
    const X = await W.enroll(name);
    const wo = await W.submit({ title: name + ' work', owned_surface: ['i/' + name], priority: 9 });
    const c = await X.n.op('claim', { only_work_order_id: wo, resources: RES(64000) });
    if (!c.claimed) throw new Error('claim failed: ' + JSON.stringify(c));
    return { ...X, run: c.claimed.run_id, wo, hash: tokenHash(X.n.token) };
  };
  const runRow = async (id) => (await sup.query(`select to_jsonb(r) j from factory.agent_runs r where run_id = $1`, [id])).rows[0].j;
  const credOf = async (cred) => (await sup.query(`select status, revoked_at from factory.node_credentials where credential_id = $1`, [cred])).rows[0];

  // ---- I1: call first
  for (const op of ['node_renew', 'node_checkpoint', 'node_complete']) {
    const X = await inflight('I1-' + op);
    const body = op === 'node_renew' ? { run_id: X.run, lease_seconds: 60 } : op === 'node_checkpoint' ? { run_id: X.run, location: 'git://i1', scenario: 'mid' }
      : { run_id: X.run, status: 'done', termination_reason: 'completed' };
    await nodeC.query('begin');
    const r = await call(nodeC, op, X.hash, body);
    const pending = revoke(adminC, X.computer_id);
    const blocked = await waitBlocked(mon, 'admin_revoke_credential');
    await nodeC.query('commit');
    const rv = await pending;
    const cr = await credOf(X.credential_id);
    const rr = await runRow(X.run);
    const effect = op === 'node_renew' ? new Date(rr.last_heartbeat_at) <= new Date(cr.revoked_at)
      : op === 'node_checkpoint' ? (await sup.query(`select count(*)::int n from factory.checkpoints where run_id = $1 and created_at <= $2`, [X.run, cr.revoked_at])).rows[0].n === 1
      : rr.status === 'done' && new Date(rr.finished_at) <= new Date(cr.revoked_at);
    const next = await call(nodeC, 'node_heartbeat', X.hash, { phase: 'AVAILABLE' });
    row('I1 ' + op.replace('node_', '') + ': the call held the credential (SHARE); a revoke issued inside its transaction WAITED; the call committed first, then the revoke; the next call is refused',
      r.ok && blocked && rv.ok && cr.status === 'revoked' && effect && next.refused === 'credential_revoked', 'blocked=' + blocked + ' effect=' + effect);
  }
  // ---- I2: revoke first
  for (const op of ['node_renew', 'node_checkpoint', 'node_complete', 'node_heartbeat', 'node_claim', 'node_release']) {
    const X = await inflight('I2-' + op);
    const body = op === 'node_renew' ? { run_id: X.run, lease_seconds: 60 } : op === 'node_checkpoint' ? { run_id: X.run, location: 'git://i2' }
      : op === 'node_complete' ? { run_id: X.run, status: 'done', termination_reason: 'completed' } : op === 'node_heartbeat' ? { phase: 'BUSY' }
      : op === 'node_release' ? { run_id: X.run } : {};
    const before = await runRow(X.run);
    await adminC.query('begin');
    const rv = await revoke(adminC, X.computer_id);
    const pending = call(nodeC, op, X.hash, body);
    const blocked = await waitBlocked(mon, op);
    await adminC.query('commit');
    const r = await pending;
    const after = await runRow(X.run);
    const cps = (await sup.query(`select count(*)::int n from factory.checkpoints where run_id = $1`, [X.run])).rows[0].n;
    row('I2 ' + op.replace('node_', '') + ': the revoke held the credential row; the call WAITED, then was refused (credential_revoked) with the run and its checkpoints unchanged',
      rv.ok && blocked && r.refused === 'credential_revoked' && JSON.stringify(before) === JSON.stringify(after) && cps === 0, 'blocked=' + blocked + ' ' + r.refused);
  }
  // session exchange after a revoke committed (the assertion path)
  {
    const X = await inflight('I2-session');
    await revoke(adminC, X.computer_id);
    const s = await nodeC.query(`select factory.node_session_open($1, $2, now(), now() + interval '30 seconds', 'factory-node-api', $3) r`,
      [X.identity.thumbprint, randomUUID().replace(/-/g, ''), createHash('sha256').update(randomUUID()).digest()]);
    row('I2 session exchange: a key-signed assertion of a revoked credential gets no session (credential_revoked)', s.rows[0].r.refused === 'credential_revoked');
  }
  // ---- I3: rotate races revoke
  {
    const X = await inflight('I3-rotate-first');
    const nk = ed25519();
    await nodeC.query('begin');
    const rot = (await nodeC.query('select factory.node_credential_rotate($1, $2, $3) r', [X.hash, nk.thumbprint, nk.publicKey])).rows[0].r;
    const pending = revoke(adminC, X.computer_id);
    const blocked = await waitBlocked(mon, 'admin_revoke_credential');
    await nodeC.query('commit');
    const rv = await pending;
    const creds = (await sup.query(`select status from factory.node_credentials where principal_id = $1 order by issued_at`, [X.principal_id])).rows.map((x) => x.status);
    const s = await nodeC.query(`select factory.node_session_open($1, $2, now(), now() + interval '30 seconds', 'factory-node-api', $3) r`,
      [nk.thumbprint, randomUUID().replace(/-/g, ''), createHash('sha256').update(randomUUID()).digest()]);
    row('I3a rotate commits first while the revoke waits: the revoke still ends on the NEW credential (old superseded, new revoked); the new key gets no session',
      rot.ok && blocked && rv.ok && rv.revoked === 1 && creds.join(',') === 'superseded,revoked' && s.rows[0].r.refused === 'credential_revoked', creds.join(','));
  }
  {
    const X = await inflight('I3-revoke-first');
    const nk = ed25519();
    await adminC.query('begin');
    await revoke(adminC, X.computer_id);
    const pending = nodeC.query('select factory.node_credential_rotate($1, $2, $3) r', [X.hash, nk.thumbprint, nk.publicKey]).then((x) => x.rows[0].r);
    const blocked = await waitBlocked(mon, 'node_credential_rotate');
    await adminC.query('commit');
    const rot = await pending;
    const creds = (await sup.query(`select status from factory.node_credentials where principal_id = $1 order by issued_at`, [X.principal_id])).rows.map((x) => x.status);
    row('I3b the revoke commits first while the rotate waits: the rotate is refused (credential_revoked) and no new credential exists',
      blocked && rot.refused === 'credential_revoked' && creds.join(',') === 'revoked', creds.join(','));
  }
  // ---- I4
  const bh = await B.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  const wb = await W.submit({ title: 'B still works', owned_surface: ['i/b'], priority: 9 });
  const bc = await B.n.op('claim', { only_work_order_id: wb, resources: RES(64000) });
  row('I4 through every interleaving above, another computer kept working (heartbeat, claim)', bh.ok && bc.claimed);
} finally {
  for (const c of conns) await c.end().catch(() => {});
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nrevocation_interleaving: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/revocation_interleaving.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
