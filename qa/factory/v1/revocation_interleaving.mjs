#!/usr/bin/env node
// S-3 / AC-4 / R-4 DEVELOPER REHEARSAL: forced interleavings of a node call and a revocation, on the credential row, with explicit
// transactions on separate connections (the node's front door as factory_node_api; the revoke as factory_admin_api):
//   I1  the CALL takes its credential lock first; the revoke is issued inside the call's transaction (between its first credential read
//       and its commit): the revoke WAITS, the call commits first, then the revoke commits; the next call is refused
//   I2  the REVOKE takes the row first; the call is issued while the revoke is uncommitted: the call WAITS, and after the revoke commits
//       it is refused with every row unchanged
//   I3  a ROTATE races the revoke, both orders: the revoke always ends on the principal's current credential (never escaped)
//   I4  other computers are unaffected; the revoked computer's evidence is intact
//   I5  B-4 (S-8, CR-003): two admins amend one envelope; the second WAITS on the computer row lock while the first (the founder)
//       removes release_broker; whether the second is granting release_broker - founder-only - is decided on the envelope in force
//       UNDER the lock, in both directions, and a founder may still grant it after the wait
//   I6  L5-F9: verifier V1's lease lapsed and V2's claim took the work over; V1's revoke, arriving in the middle of that claim, waits
//       for it and then gives back only what V1 still holds - V2 keeps its claim
//   I7  admin decisions that read "is there already one?" are serialized: two S-16(a) bindings, a restore of the bound computer racing
//       a binding, two publishes on one channel, an adoption racing a release revoke and a key revoke, a publish racing the revoke
//       of its signing key, two revokes of one key - the second waits and gets its named answer, never an unnamed error; and the
//       tenant lock never makes the tenant's foreign-key inserts wait (I7h)
//   I8  a code-issuing admin action that draws the locator of an elapsed code sweeps that code and the enrollment started from it
//       (the code row, then the enrollment row), while node_enroll_complete of that same enrollment takes its computer, the code
//       and the enrollment: sweep first (I8a), complete first (I8b), and both in flight at once while a holder keeps the enrollment
//       (I8c) or the code (I8d), so that either side taking the enrollment before the code would deadlock. Every order ends with both
//       answers named, no credential, the enrollment expired by exactly one step, and the new code live
// An order the serialization prevents is not a missing subject: it is the proof. Developer verification, never independent.
// usage: node qa/factory/v1/revocation_interleaving.mjs [--evidence <file>]
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { connect } from './plane.mjs';
import { ed25519 } from './fixtures.mjs';
import { enrollStart, tokenHash } from './nodeclient.mjs';
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

  // ---- I5 (B-4): an amendment decides founder-only only after it holds the computer row, from the envelope that row points at
  const adminC2 = await open(W.plane.adminApiUrl);
  const asSql = (p) => p.then((x) => x.rows[0].r, (e) => ({ refused: 'sql_' + e.code, message: String(e.message) }));
  const amend = (c, who, live, body) => asSql(c.query(`select factory.admin_amend_envelope($1, $2, $3::jsonb) r`, [who.userId, live, JSON.stringify(body)]));
  const env5 = (roles, runs = 1) => ({ roles, max_concurrent_runs: runs, max_heavy: 1 });
  const envs = async (cid) => (await sup.query(`select version, authorized_roles, created_by from factory.authorization_envelopes where computer_id = $1 order by version`, [cid])).rows;
  const addC = async (name, roles) => { const r = await W.admin.call('add-computer', { display_name: name, envelope: env5(roles) }, founder.token); if (!r.ok) throw new Error('add-computer: ' + JSON.stringify(r)); return r.computer_id; };
  const holdingAdmin = W.brain.persona('holding_admin'); await W.grantAdmin(holdingAdmin, 'admin');
  const tierFounder = W.brain.persona('founder'); await W.grantAdmin(tierFounder, 'founder');
  const founder2 = W.brain.persona('founder'); await W.grantAdmin(founder2, 'founder');
  for (const [label, racer, live] of [['a tier admin (live holding_admin)', holdingAdmin, 'holding_admin'], ['a tier founder whose live role is holding_admin', tierFounder, 'holding_admin']]) {
    const cid = await addC('I5a ' + label, ['generic', 'release_broker']);
    await adminC.query('begin');
    const f = await amend(adminC, founder, 'founder', { computer_id: cid, expected_version: 1, envelope: env5(['generic']), reason: 'I5a: remove release_broker' });
    const pending = amend(adminC2, racer, live, { computer_id: cid, expected_version: 2, envelope: env5(['generic', 'release_broker']), reason: 'I5a: grant' });
    const blocked = await waitBlocked(mon, 'admin_amend_envelope');
    await adminC.query('commit');
    const r = await pending;
    const ev = await envs(cid);
    const aud = (await sup.query(`select actor_id, action, reason, target_kind, target_id from factory.audit_events where target_id = $1 and outcome = 'refused'`, [cid])).rows;
    const rbWriters = (await sup.query(`select count(*)::int n from factory.authorization_envelopes e where e.computer_id = $1 and 'release_broker' = any (e.authorized_roles)
        and e.version > 1 and not exists (select 1 from factory.tenant_admins t where t.auth_user_id = e.created_by and t.tier = 'founder')`, [cid])).rows[0].n;
    row('I5a ' + label + ' amends to ADD release_broker, naming the version the founder\'s uncommitted removal creates; it WAITS on the computer row; after the founder commits it is refused founder_only (403), audited, and the envelope in force lacks release_broker (2 versions, none written by a non-founder)',
      f.ok && f.version === 2 && blocked && r.refused === 'founder_only' && r.http === 403 && ev.length === 2 && !ev[1].authorized_roles.includes('release_broker')
        && rbWriters === 0 && aud.length === 1 && aud[0].actor_id === racer.userId && aud[0].action === 'admin.amend_envelope' && aud[0].reason === 'founder_only'
        && aud[0].target_kind === 'computer' && aud[0].target_id === cid,
      JSON.stringify({ founder: f.ok || f.refused, blocked, racer: r.ok ? 'ok v' + r.version : r.refused, versions: ev.map((x) => x.version + ':' + x.authorized_roles.join('+')), aud }));
  }
  {
    const cid = await addC('I5b founder after a wait', ['generic', 'release_broker']);
    await adminC.query('begin');
    const f = await amend(adminC, founder, 'founder', { computer_id: cid, expected_version: 1, envelope: env5(['generic']), reason: 'I5b: remove' });
    const pending = amend(adminC2, founder2, 'founder', { computer_id: cid, expected_version: 2, envelope: env5(['generic', 'release_broker']), reason: 'I5b: grant' });
    const blocked = await waitBlocked(mon, 'admin_amend_envelope');
    await adminC.query('commit');
    const r = await pending;
    const ev = await envs(cid);
    row('I5b positive control: the same interleaving with a second tier-founder + live-founder caller WAITS, then grants release_broker (version 3, created by that founder)',
      f.ok && blocked && r.ok && r.version === 3 && ev.length === 3 && ev[2].authorized_roles.includes('release_broker') && ev[2].created_by === founder2.userId,
      JSON.stringify({ blocked, r: r.ok ? 'ok v' + r.version : r.refused }));
  }
  {
    const cid = await addC('I5c keeps release_broker', ['generic']);
    await adminC.query('begin');
    const f = await amend(adminC, founder, 'founder', { computer_id: cid, expected_version: 1, envelope: env5(['generic', 'release_broker']), reason: 'I5c: the founder grants' });
    const pending = amend(adminC2, holdingAdmin, 'holding_admin', { computer_id: cid, expected_version: 2, envelope: env5(['generic', 'release_broker'], 2), reason: 'I5c: more runs' });
    const blocked = await waitBlocked(mon, 'admin_amend_envelope');
    await adminC.query('commit');
    const r = await pending;
    const ev = await envs(cid);
    row('I5c mirror: a tier admin amending another field of an envelope whose release_broker the founder granted meanwhile (uncommitted when it called) WAITS, and is allowed - under the lock that is not a grant (version 3, created by the tier admin)',
      f.ok && blocked && r.ok && r.version === 3 && ev.length === 3 && ev[2].created_by === holdingAdmin.userId && ev[2].authorized_roles.includes('release_broker'),
      JSON.stringify({ blocked, r: r.ok ? 'ok v' + r.version : r.refused }));
  }

  // ---- I6 (L5-F9): V1's lapsed verification run is taken over by V2's claim while V1's revoke is issued; V2's claim must survive
  {
    const envV = { roles: ['generic', 'verifier'], max_concurrent_runs: 3, max_heavy: 1 };
    const Au = await W.enroll('I6 author', envV), V1 = await W.enroll('I6 verifier 1', envV), V2 = await W.enroll('I6 verifier 2', envV);
    const tree = createHash('sha1').update('i6-' + randomUUID()).digest('hex');
    const w = await W.submit({ title: 'I6 needs verification', requires_verification: true, owned_surface: ['i/i6'], priority: 9 });
    const ca = await Au.n.op('claim', { only_work_order_id: w, resources: RES(64000) });
    const done = await Au.n.op('complete', { run_id: ca.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: tree, candidate_tree: tree });
    const v = done.verification_work_order_id;
    const c1 = await V1.n.op('verification-claim', { only_work_order_id: v, lease_seconds: 5, resources: RES(70000) });
    await sleep(6500);
    const V2hash = tokenHash(V2.n.token);
    await nodeC.query('begin');
    const c2 = await call(nodeC, 'node_verification_claim', V2hash, { only_work_order_id: v, resources: RES(80000) });
    const pending = revoke(adminC, V1.computer_id);
    const blocked = await waitBlocked(mon, 'admin_revoke_credential');
    await nodeC.query('commit');
    const rv = await pending;
    const wState = (await sup.query(`select verification_state from factory.work_orders where work_order_id = $1`, [w])).rows[0].verification_state;
    const r1 = c1.claimed && (await sup.query(`select status, lease_expires_at from factory.agent_runs where run_id = $1`, [c1.claimed.run_id])).rows[0];
    const cert = c2.claimed && await V2.n.op('certify', { run_id: c2.claimed.run_id, verdict: 'PASS', work_order_id: w, candidate_run_id: ca.claimed.run_id, candidate_tree: tree, candidate_commit: tree });
    const wFinal = (await sup.query(`select verification_state from factory.work_orders where work_order_id = $1`, [w])).rows[0].verification_state;
    row('I6 a revoke of verifier V1 (whose verification lease lapsed) racing V2\'s claim that reaped it: the revoke WAITS on the reaped run, then leaves V2\'s claim intact - the work order stays VERIFICATION_CLAIMED, V1\'s reaped run stays queued with no lease, and V2 certifies it COMPLETE',
      done.ok && c1.claimed && c2.claimed && blocked && rv.ok && wState === 'VERIFICATION_CLAIMED' && r1.status === 'queued' && r1.lease_expires_at === null && cert.ok && wFinal === 'COMPLETE',
      JSON.stringify({ c1: !!(c1 && c1.claimed), c2: c2.claimed ? 'claimed' : c2.refused || c2.message, blocked, rv: rv.ok || rv.refused, wState, r1, cert: cert && (cert.ok || cert.refused + ' ' + cert.message), wFinal }).slice(0, 700));
  }

  // ---- I7: the "is there already one?" admin decisions are serialized (a named answer, never an unnamed 23505)
  const addDirect = (c, name, bind) => asSql(c.query(`select factory.admin_add_computer($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({
    display_name: name, envelope: env5(['generic']), bind_s16a: bind, locator: 'Y' + randomBytes(2).toString('hex').toUpperCase(), code_mac: randomBytes(32).toString('hex'), pepper_version: 1 })]));
  let boundComputer = null;
  {
    await adminC.query('begin');
    const first = await addDirect(adminC, 'I7a first binding', true);
    const pending = addDirect(adminC2, 'I7a second binding', true);
    const blocked = await waitBlocked(mon, 'admin_add_computer');
    await adminC.query('commit');
    const second = await pending;
    boundComputer = first.ok ? first.computer_id : null;
    const bound = (await sup.query(`select count(*)::int n from factory.computers where s16a_bound_at is not null and archived_at is null`)).rows[0].n;
    row('I7a two S-16(a) bindings race: the second WAITS, then is refused s16a_already_bound (409) by name; one computer carries the binding',
      first.ok && blocked && second.refused === 's16a_already_bound' && second.http === 409 && bound === 1, JSON.stringify({ first: first.ok || first.refused, blocked, second: second.refused, bound }));
  }
  {
    // the bound computer is archived; its restore (which returns the binding to service) races a new binding
    const arc = await asSql(adminC.query(`select factory.admin_archive($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ computer_id: boundComputer })]));
    await adminC.query('begin');
    const back = await asSql(adminC.query(`select factory.admin_restore($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ computer_id: boundComputer,
      locator: 'Y' + randomBytes(2).toString('hex').toUpperCase(), code_mac: randomBytes(32).toString('hex'), pepper_version: 1 })]));
    const pending = addDirect(adminC2, 'I7e binding while the bound computer is restored', true);
    const blocked = await waitBlocked(mon, 'admin_add_computer');
    await adminC.query('commit');
    const second = await pending;
    const bound = (await sup.query(`select computer_id from factory.computers where s16a_bound_at is not null and archived_at is null`)).rows.map((x) => x.computer_id);
    row('I7e a restore of the archived S-16(a)-bound computer races a new binding: the binding WAITS, then is refused s16a_already_bound (409) by name; the restored computer alone carries the binding',
      arc.ok && back.ok && blocked && second.refused === 's16a_already_bound' && bound.length === 1 && bound[0] === boundComputer,
      JSON.stringify({ arc: arc.ok || arc.refused, back: back.ok || back.refused, blocked, second: second.refused, bound: bound.length }));
  }
  const publish = (c, v, key) => asSql(c.query(`select factory.admin_publish_release($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({
    channel: 'production', version: v, source_sha: 'e'.repeat(40), digest: createHash('sha256').update('i7' + v).digest('hex'), key_id: key, signature: 'B'.repeat(86),
    receipt_sha256: 'f'.repeat(64), manifest: { v },
    // what the Admin API hands the front door for a production publish: the caller's fresh password entry (one per release)
    reauth: { password_at: Math.floor(Date.now() / 1000), session_id: randomUUID() } })]));
  {
    await adminC.query('begin');
    const first = await publish(adminC, '7.0.0', 'race-key-0001');
    const pending = publish(adminC2, '7.0.1', 'race-key-0001');
    const blocked = await waitBlocked(mon, 'admin_publish_release');
    await adminC.query('commit');
    const second = await pending;
    const firstRow = first.ok && (await sup.query(`select state, superseded_by_release_id from factory.releases where release_id = $1`, [first.release_id])).rows[0];
    row('I7b two publishes on one channel race: the second WAITS, then publishes and supersedes the first (read back superseded by it); one published release on the channel',
      first.ok && blocked && second.ok && second.supersedes === first.release_id && firstRow.state === 'superseded' && firstRow.superseded_by_release_id === second.release_id,
      JSON.stringify({ first: first.ok || first.refused, blocked, second: second.ok ? 'ok' : second.refused + ' ' + second.message }).slice(0, 300));
  }
  const adopt = (c, cid, rid) => asSql(c.query(`select factory.admin_adopt_release($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ computer_id: cid, release_id: rid })]));
  {
    const cid = await addC('I7c adopter', ['generic']);
    const rel = await publish(adminC, '7.1.0', 'race-key-0002');
    await adminC.query('begin');
    const rv = await asSql(adminC.query(`select factory.admin_revoke_release($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ release_id: rel.release_id, reason: 'I7c' })]));
    const pending = adopt(adminC2, cid, rel.release_id);
    const blocked = await waitBlocked(mon, 'admin_adopt_release');
    await adminC.query('commit');
    const r = await pending;
    const adopted = (await sup.query(`select adopted_release_id from factory.computers where computer_id = $1`, [cid])).rows[0].adopted_release_id;
    row('I7c an adoption racing the revoke of that release WAITS, then is refused release_revoked (409); the computer never adopts the revoked release',
      rel.ok && rv.ok && blocked && r.refused === 'release_revoked' && adopted === null, JSON.stringify({ blocked, r: r.ok ? 'ok' : r.refused, adopted }));
  }
  {
    const cid = await addC('I7d adopter', ['generic']);
    const rel = await publish(adminC, '7.2.0', 'race-key-0003');
    await adminC.query('begin');
    const rk = await asSql(adminC.query(`select factory.admin_revoke_key($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ key_id: 'race-key-0003', reason: 'I7d' })]));
    const pending = adopt(adminC2, cid, rel.release_id);
    const blocked = await waitBlocked(mon, 'admin_adopt_release');
    await adminC.query('commit');
    const r = await pending;
    const adopted = (await sup.query(`select adopted_release_id from factory.computers where computer_id = $1`, [cid])).rows[0].adopted_release_id;
    row('I7d an adoption racing the revoke of the release\'s signing key WAITS, then is refused key_revoked (409); the computer never adopts a release of the revoked key',
      rel.ok && rk.ok && blocked && r.refused === 'key_revoked' && adopted === null, JSON.stringify({ blocked, r: r.ok ? 'ok' : r.refused, adopted }));
  }
  const revokeKey = (c, key, reason) => asSql(c.query(`select factory.admin_revoke_key($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ key_id: key, reason })]));
  const channelPublished = async (sameTenantAs) => (await sup.query(`select release_id, key_id from factory.releases where channel = 'production' and state = 'published'
      and tenant_id = (select tenant_id from factory.releases where release_id = $1)`, [sameTenantAs])).rows;
  {
    // a key revoke (uncommitted) and a publish signed by that key: the publish queues on the tenant row and then reads the revocation
    const base = await publish(adminC, '7.4.0', 'race-key-0004');
    await adminC.query('begin');
    const rk = await revokeKey(adminC, 'race-key-0006', 'I7f');
    const pending = publish(adminC2, '7.4.1', 'race-key-0006');
    const blocked = await waitBlocked(mon, 'admin_publish_release');
    await adminC.query('commit');
    const r = await pending;
    const pub = base.ok ? await channelPublished(base.release_id) : [];
    const ofKey = (await sup.query(`select count(*)::int n from factory.releases where key_id = 'race-key-0006'`)).rows[0].n;
    row('I7f a publish racing the revoke of its signing key WAITS on the tenant row, then is refused key_revoked (409); no release of that key exists, and the channel\'s published release is still the earlier one (not superseded)',
      base.ok && rk.ok && blocked && r.refused === 'key_revoked' && r.http === 409 && ofKey === 0 && pub.length === 1 && pub[0].release_id === base.release_id,
      JSON.stringify({ base: base.ok || base.refused, rk: rk.ok || rk.refused, blocked, r: r.ok ? 'ok ' + r.release_id : r.refused, ofKey, pub }).slice(0, 400));
  }
  {
    // two revokes of a key that signed nothing yet: no release row to lock, so only the tenant row orders them
    await adminC.query('begin');
    const k1 = await revokeKey(adminC, 'race-key-0007', 'I7g first');
    const pending = revokeKey(adminC2, 'race-key-0007', 'I7g second');
    const blocked = await waitBlocked(mon, 'admin_revoke_key');
    await adminC.query('commit');
    const k2 = await pending;
    const rows = (await sup.query(`select count(*)::int n from factory.release_revocations where kind = 'key' and key_id = 'race-key-0007'`)).rows[0].n;
    row('I7g two revokes of one unused key race: the second WAITS, then answers ok + "already" by name (never an unnamed 23505); one revocation row',
      k1.ok && k1.key_id === 'race-key-0007' && blocked && k2.ok === true && k2.already === true && rows === 1, JSON.stringify({ k1: k1.ok || k1.refused, blocked, k2, rows }).slice(0, 300));
  }
  {
    // the lock strength: while a publish holds the tenant row, a write of the same tenant whose foreign key names the tenant (a drain
    // writes an audit row: FOR KEY SHARE on the tenant) completes without waiting for the publish
    const cid = await addC('I7h drained during a publish', ['generic']);
    await adminC.query('begin');
    const p = await publish(adminC, '7.5.0', 'race-key-0004');
    let doneBeforeCommit = false;
    const dr = asSql(adminC2.query(`select factory.admin_drain($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({ computer_id: cid })])).then((x) => { doneBeforeCommit = true; return x; });
    const finished = await Promise.race([dr.then(() => true), sleep(6000).then(() => false)]);
    // the publish is still open at this point: its release is not yet visible to anyone else
    const openPublish = (await sup.query(`select count(*)::int n from factory.releases where version = '7.5.0'`)).rows[0].n === 0;
    await adminC.query('commit');
    const d = await dr;
    const aud = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'computer.drained' and target_id = $1`, [cid])).rows[0].n;
    row('I7h the tenant lock is FOR NO KEY UPDATE: while a publish holds it (uncommitted), a drain of a computer of the same tenant - its audit insert takes FOR KEY SHARE on the tenant - completes without waiting; audited once',
      p.ok && openPublish && finished && doneBeforeCommit && d.ok === true && d.draining === true && aud === 1,
      JSON.stringify({ publish: p.ok || p.refused, openPublish, finishedBeforeCommit: finished, d: d.ok ? 'ok' : d.refused, aud }));
  }

  // ---- I8: the locator sweep of _issue_code racing node_enroll_complete of the enrollment the sweep ends. An admin action that draws
  // a locator first expires a code on that locator whose TTL elapsed, then the enrollments started from it (the code row, then the
  // enrollment row). The complete takes its own computer's row, then the same code, then the same enrollment. Each case: computer Y
  // gets a 60 s code (the shortest TTL; a code's expiry never changes after issue) and an enrollment started from it; once the TTL has
  // elapsed, a code for another computer X is issued on Y's locator while Y's enrollment completes.
  {
    const completeSql = (c, x) => asSql(c.query(`select factory.node_enroll_complete($1::uuid, $2, decode($3, 'hex'), $4::inet, null::text) r`,
      [x.s.enrollment_id, x.id.thumbprint, x.s.challenge, x.peer]));
    const drawOn = (c, x) => asSql(c.query(`select factory.admin_issue_code($1, 'founder', $2::jsonb) r`, [founder.userId, JSON.stringify({
      computer_id: x.drawer, locator: x.code.locator, code_mac: randomBytes(32).toString('hex'), pepper_version: x.code.pepper_version, ttl_seconds: 60 })]));
    const readBack = async (x, issued) => (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code,
        (select state from factory.enrollments where enrollment_id = $2) enr,
        (select count(*)::int from factory.node_credentials where enrollment_id = $2) creds,
        (select count(*)::int from factory.enrollment_transitions where enrollment_id = $2 and to_state = 'PAIRING_EXPIRED') steps,
        (select reason from factory.enrollment_transitions where enrollment_id = $2 and to_state = 'PAIRING_EXPIRED' order by transition_id desc limit 1) why,
        (select count(*)::int from factory.pairing_codes where locator = $3 and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED')) live,
        (select state from factory.pairing_codes where code_id = $4::uuid) drawn`,
      [x.code.code_id, x.s.enrollment_id, x.code.locator, issued && issued.ok ? issued.code_id : null])).rows[0];
    const pidOf = async (c) => (await c.query('select pg_backend_pid() p')).rows[0].p;
    const blockersOf = async (like) => (await mon.query(`select pg_blocking_pids(pid) b from pg_stat_activity where wait_event_type = 'Lock' and query like $1`,
      ['%' + like + '%'])).rows.flatMap((r) => r.b);
    const cases = [];
    for (const k of ['a', 'b', 'c', 'd']) {
      const add = await W.admin.call('add-computer', { display_name: 'I8' + k + ' swept', envelope: env5(['generic']), ttl_seconds: 60 }, founder.token);
      if (!add.ok) throw new Error('add-computer: ' + JSON.stringify(add));
      const id = ed25519();
      const peer = '127.0.0.' + (240 + cases.length);
      const s = await enrollStart(W.node.baseUrl, add.pairing_code, id, {}, { localAddress: peer });
      if (!s.ok) throw new Error('enroll/start: ' + JSON.stringify(s));
      const code = (await sup.query(`select code_id, locator, expires_at, pepper_version from factory.pairing_codes where computer_id = $1`, [add.computer_id])).rows[0];
      cases.push({ k, id, s, peer, code, drawer: await addC('I8' + k + ' draws the locator', ['generic']) });
    }
    await sleep(Math.max(0, Math.max(...cases.map((x) => new Date(x.code.expires_at).getTime())) + 1500 - Date.now()));
    const common = (st) => st.code === 'PAIRING_EXPIRED' && st.enr === 'PAIRING_EXPIRED' && st.creds === 0 && st.steps === 1 && st.live === 1
      && st.drawn === 'PAIRING_CODE_ISSUED';
    {
      // (a) the sweep first: the admin action has expired the code and ended the enrollment, uncommitted; the complete waits
      const x = cases[0];
      await adminC.query('begin');
      const issued = await drawOn(adminC, x);
      const pending = completeSql(nodeC, x);
      const blocked = await waitBlocked(mon, 'node_enroll_complete');
      await adminC.query('commit');
      const r = await pending;
      const st = await readBack(x, issued);
      row('I8a the locator sweep first: a complete of the swept enrollment WAITS on the code row; after the sweep commits it is refused code_expired by name; no credential; the code and the enrollment PAIRING_EXPIRED by the sweep (one step); the drawn code is the one live code on the locator',
        issued.ok && blocked && r.refused === 'code_expired' && common(st) && /drawn again/.test(st.why || ''),
        JSON.stringify({ issued: issued.ok || issued.refused, blocked, complete: r.ok ? 'CREDENTIAL ' + r.credential_id : r.refused, st }));
    }
    {
      // (b) the complete first: it has found the TTL elapsed and expired the code and the enrollment, uncommitted; the admin action waits
      const x = cases[1];
      await nodeC.query('begin');
      const r = await completeSql(nodeC, x);
      const pending = drawOn(adminC, x);
      const blocked = await waitBlocked(mon, 'admin_issue_code');
      await nodeC.query('commit');
      const issued = await pending;
      const st = await readBack(x, issued);
      row('I8b the complete first: the admin action drawing the locator WAITS on the code row; after the complete commits (refused code_expired, the code and the enrollment PAIRING_EXPIRED at the TTL, one step) the sweep finds nothing left to expire and the drawn code is issued; no credential',
        r.refused === 'code_expired' && blocked && issued.ok && common(st) && /TTL elapsed/.test(st.why || ''),
        JSON.stringify({ complete: r.ok ? 'CREDENTIAL ' + r.credential_id : r.refused, blocked, issued: issued.ok || issued.refused, st }));
    }
    {
      // (c) both in flight: a holder keeps the enrollment row, so the admin action holds the code it swept and waits for the enrollment,
      // while the complete holds its computer and waits for the code. A cycle would end one of them with 40P01; the lock order has none.
      const x = cases[2];
      const H = await open(W.plane.superUrl);
      await H.query('begin');
      await H.query('select 1 from factory.enrollments where enrollment_id = $1 for update', [x.s.enrollment_id]);
      const [hPid, aPid] = [await pidOf(H), await pidOf(adminC)];
      const pa = drawOn(adminC, x);
      const b1 = await waitBlocked(mon, 'admin_issue_code');
      const pn = completeSql(nodeC, x);
      const b2 = await waitBlocked(mon, 'node_enroll_complete');
      const [adminWaitsOn, completeWaitsOn] = [await blockersOf('admin_issue_code'), await blockersOf('node_enroll_complete')];
      await H.query('commit');
      const [issued, r] = await Promise.all([pa, pn]);
      const st = await readBack(x, issued);
      row('I8c both in flight at once - the admin action holding the swept code and waiting for the enrollment, the complete holding its computer and waiting for that code: no deadlock; the sweep ends the enrollment (one step), the complete is refused code_expired by name, no credential, the drawn code is live',
        b1 && b2 && adminWaitsOn.includes(hPid) && completeWaitsOn.includes(aPid) && issued.ok && r.refused === 'code_expired' && common(st) && /drawn again/.test(st.why || ''),
        JSON.stringify({ b1, b2, adminWaitsOnHolder: adminWaitsOn.includes(hPid), completeWaitsOnAdmin: completeWaitsOn.includes(aPid),
          issued: issued.ok || issued.refused, complete: r.ok ? 'CREDENTIAL ' + r.credential_id : r.refused, st }));
    }
    {
      // (d) both queued on the code: a holder keeps the code row, the admin action waits for it first, then the complete (holding its
      // computer). Released, the admin action takes the code and then the enrollment; a complete that had taken the enrollment before
      // the code would now hold what the admin action needs while waiting for what it holds (40P01).
      const x = cases[3];
      const H = await open(W.plane.superUrl);
      await H.query('begin');
      await H.query('select 1 from factory.pairing_codes where code_id = $1 for update', [x.code.code_id]);
      const pa = drawOn(adminC, x);
      const b1 = await waitBlocked(mon, 'admin_issue_code');
      const pn = completeSql(nodeC, x);
      const b2 = await waitBlocked(mon, 'node_enroll_complete');
      await H.query('commit');
      const [issued, r] = await Promise.all([pa, pn]);
      const st = await readBack(x, issued);
      row('I8d both queued on the code row (the admin action first, then the complete holding its computer): no deadlock; the code and the enrollment PAIRING_EXPIRED (one step), the complete refused code_expired by name, no credential, the drawn code is live',
        b1 && b2 && issued.ok && r.refused === 'code_expired' && common(st),
        JSON.stringify({ b1, b2, issued: issued.ok || issued.refused, complete: r.ok ? 'CREDENTIAL ' + r.credential_id : r.refused, st }));
    }
  }
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 revocation_interleaving did not complete', false, (e && e.stack) || String(e));
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
