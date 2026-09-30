#!/usr/bin/env node
// WO-3 / AC-8 DEVELOPER VERIFICATION: Add Computer -> pairing code -> enrollment, end to end through the two real handlers (the Admin
// API with a founder persona; the Node API as the installer), and every abuse case at its boundary value. Developer instrument; the
// Brain OS side is the developer stub (brainos_stub.mjs), never acceptance evidence for AC-7.
//   EN1-EN20   the enrollment flow and its abuse cases; each case reads back exactly the pairing_attempts rows it wrote (L7-15)
//   EN21       the enrollment walk: every state an enrollment held has its transition row, contiguous, for every enrollment
//   EN22-EN25  every request is one attempt (S-6): Edge-decided refusals, complete-time refusals, attribution after a revocation,
//              a challenge window that ends before the code's TTL
//   EN26       S-12: no bearer (pairing code, session token, private key, pepper) in any relation, the catalog or a role setting, in
//              any encoding; the stored verifiers are found (the scan cannot pass vacuously); each code and token is returned once
//   SE1-SE6    the session exchange's refusals through the Node API, each read back (no session, no jti)
//   PE1-PE4    what the platform may hand the handler as the peer (peer.ts through the harness's wired handler)
//   PU1        the pairing pepper unset: enroll/start refused pepper_unavailable by name, recorded, named before the caps
// usage: node qa/factory/v1/enrollment_acceptance.mjs [--evidence <file>]
import { createHash, createHmac, randomBytes, sign } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect } from './plane.mjs';
import { tryQuery } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, ADMIN, asEngine, ed25519 as newKey, publishedRelease, nodeIdOf, thumbprint } from './fixtures.mjs';
import { apiNode, enrollStart, enrollComplete, postFrom } from './nodeclient.mjs';
import { startApi, startAdminApi } from './api_harness.mjs';
import { startBrainOsStub } from './brainos_stub.mjs';

const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDGE = join(ROOT, 'supabase/control-plane/edge/supabase/functions');
const pairing = await import(pathToFileURL(join(EDGE, '_shared/pairing.ts')).href);
const ENVELOPE = { roles: ['generic', 'verifier'], capabilities: [], max_concurrent_runs: 2, max_heavy: 1 };
const norm = (display) => pairing.normalizeCode(display).normalized;
const b64u = (b) => Buffer.from(b).toString('base64url');
// every key this run creates (EN26 scans for each private key)
const keys = [];
const ed25519 = () => { const k = newKey(); keys.push(k); return k; };
// a code of the same locator with another secret (the check character recomputed, so it reaches the server as a wrong secret)
const wrongFor = (display, i = 0) => { const good = norm(display); const body = good.slice(0, 5) + ('ABCDEFGHJKMN'.slice(i % 12) + 'ABCDEFGHJKMN').slice(0, 12);
  return body + pairing.ALPHABET[[...body].reduce((s, c, j) => (s + (j + 1) * pairing.ALPHABET.indexOf(c)) % 32, 0)]; };
const T2 = 'b2e0f000-0000-4000-8000-000000000002';
const T5 = 'c3e0f000-0000-4000-8000-000000000005';   // EN22's limits (its own tenant, separate from EN12's)
const T6 = 'c3e0f000-0000-4000-8000-000000000006';   // EN21, EN23-EN25, PE
const T7 = 'c3e0f000-0000-4000-8000-000000000007';   // PU1 (its caps are reached on purpose)

const plane = await startV1Plane();
const brain = await startBrainOsStub();
const pepperB64 = randomBytes(32).toString('base64');
const node = await startApi(plane, { pepperB64 });
const admin = await startAdminApi(plane, brain, { pepperB64 });
const sup = await connect(plane.superUrl);
// the pairing_attempts rows written since a mark (every case below reads back exactly the rows it wrote)
const mark = async () => (await sup.query('select coalesce(max(attempt_id), 0)::int m from factory.pairing_attempts')).rows[0].m;
const since = async (m) => (await sup.query(`select attempt_id::int id, tenant_id::text tenant, host(peer_ip) ip, phase, locator, code_id::text code, outcome
    from factory.pairing_attempts where attempt_id > $1 order by attempt_id`, [m])).rows;
const one = (rows, want) => rows.length === 1 && Object.entries(want).every(([k, v]) => rows[0][k] === v);
const brief = (rows) => rows.map((x) => [x.phase, x.outcome, x.ip, (x.tenant || '').slice(0, 8), (x.code || '-').slice(0, 8)].join(':')).join(' | ');
try {
  const founder = brain.persona('founder');
  const other = brain.persona('founder');
  const lim = brain.persona('founder');
  const aud = brain.persona('founder');
  const pu = brain.persona('founder');
  await asEngine(sup, async () => {
    await sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'founder')`, [OPERATOR, founder.userId]);
    await sup.query(`insert into factory.tenants (tenant_id, name) values ($1, 'second'), ($2, 'limits'), ($3, 'audit'), ($4, 'pepper')`, [T2, T5, T6, T7]);
    await sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'founder'), ($3, $4, 'founder'), ($5, $6, 'founder'), ($7, $8, 'founder')`,
      [T2, other.userId, T5, lim.userId, T6, aud.userId, T7, pu.userId]);
  });
  const rel = await publishedRelease(sup);
  const add = (name, extra = {}, as = founder) => admin.call('add-computer', { display_name: name, envelope: ENVELOPE, ...extra }, as.token);

  // EN1 - Add Computer; the plane holds the locator and the HMAC only
  const a1 = await add('Laptop-1');
  const code1 = a1.pairing_code;
  const stored = (await sup.query(`select locator, encode(code_mac, 'hex') mac, state, expires_at - issued_at ttl from factory.pairing_codes where code_id = $1`, [a1.code_id])).rows[0];
  const n1 = code1 && norm(code1);
  const hmac = n1 && createHmac('sha256', Buffer.from(pepperB64, 'base64')).update(n1).digest('hex');
  const plain = n1 && createHash('sha256').update(n1).digest('hex');
  row('EN1 Add Computer (founder): computer + envelope v1 + its first principal + a pairing code shown once; the plane stores the locator and HMAC-SHA256(pepper, code) only - never the code, never a plain SHA-256',
    a1.ok && code1 && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}-[0-9A-Z]{2}$/.test(code1) && stored && stored.state === 'PAIRING_CODE_ISSUED'
      && stored.mac === hmac && stored.mac !== plain && stored.locator === n1.slice(0, 5) && a1.computer.state === 'PAIRING_CODE_ISSUED',
    code1 ? 'code ' + code1.slice(0, 5) + '-…, ttl ' + JSON.stringify(stored && stored.ttl) : JSON.stringify(a1).slice(0, 200));

  // EN2 - start + complete
  const k1 = ed25519();
  const s1 = await enrollStart(node.baseUrl, code1, k1, { fingerprint: '1'.repeat(64), hostname: 'laptop-1' });
  const c1 = await enrollComplete(node.baseUrl, s1, k1);
  const cred = c1.ok && (await sup.query(`select c.principal_id, c.key_thumbprint, c.status, p.created_via from factory.node_credentials c join factory.agent_principals p using (principal_id) where c.credential_id = $1`, [c1.credential_id])).rows[0];
  row('EN2 the installer presents the code ("Enroll as Laptop-1 in operator?"), proves possession of its new key, and receives exactly one credential bound to that key and to the computer\'s first principal',
    s1.ok && s1.computer === 'Laptop-1' && s1.tenant === 'operator' && c1.ok && cred && cred.key_thumbprint === k1.thumbprint && cred.status === 'active'
      && cred.created_via === 'add_computer' && c1.principal_id === a1.principal_id, JSON.stringify(c1).slice(0, 160));
  // EN3 - the rest of the walk, through the Node API with the new credential
  const n = apiNode(node.baseUrl, k1);
  const ses = await n.session();
  const inst = await n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  const reg = await n.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest, fingerprint: '1'.repeat(64), hostname: 'laptop-1', os: 'Windows' });
  const walk = (await sup.query(`select array_agg(to_state order by transition_id) s from factory.enrollment_transitions where enrollment_id = $1`, [s1.enrollment_id])).rows[0].s;
  row('EN3 server rows walk the founder\'s enrollment states to ALIVE: PAIRING_STARTED > PAIRING_VERIFIED > NODE_ID_ISSUED > NODE_CREDENTIAL_ISSUED > RUNTIME_INSTALLING > REGISTERING > ALIVE',
    ses.ok && inst.ok && reg.ok && reg.enrollment_state === 'ALIVE'
      && (walk || []).join('>') === 'PAIRING_STARTED>PAIRING_VERIFIED>NODE_ID_ISSUED>NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE', (walk || []).join('>'));
  // EN4 - replay
  let m0 = await mark();
  const again = await enrollComplete(node.baseUrl, s1, k1, { localAddress: '127.0.0.21' });
  const restart = await enrollStart(node.baseUrl, code1, ed25519(), {}, { localAddress: '127.0.0.21' });
  const at4 = await since(m0);
  row('EN4 replay: completing the same enrollment again -> already_enrolled; presenting the consumed code again -> code_consumed (named, fail closed); each is one attempt row of its code',
    again.refused === 'already_enrolled' && restart.refused === 'code_consumed' && at4.length === 2
      && at4[0].phase === 'complete' && at4[0].outcome === 'enrollment_alive' && at4[0].code === a1.code_id && at4[0].ip === '127.0.0.21' && at4[0].tenant === OPERATOR
      && at4[1].phase === 'start' && at4[1].outcome === 'code_consumed' && at4[1].code === a1.code_id, again.refused + ',' + restart.refused + ' ' + brief(at4));
  // EN5 - INSTALL_FAILED, retried with the same credential
  const a2 = await add('Laptop-2'); const k2 = ed25519();
  const s2 = await enrollStart(node.baseUrl, a2.pairing_code, k2); const c2 = await enrollComplete(node.baseUrl, s2, k2);
  const n2 = apiNode(node.baseUrl, k2); await n2.session();
  await n2.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  const f2 = await n2.op('report-state', { enrollment_step: 'INSTALL_FAILED', reason: 'disk full (injected)' });
  const blocked = await n2.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest });
  const retry = await n2.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  const reg2 = await n2.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest });
  const codes2 = (await sup.query(`select count(*)::int n from factory.pairing_codes where computer_id = $1`, [a2.computer_id])).rows[0].n;
  row('EN5 INSTALL_FAILED is named in server rows; the retry reuses the SAME credential (no new code) and reaches ALIVE',
    c2.ok && f2.enrollment_state === 'INSTALL_FAILED' && blocked.refused === 'install_failed' && retry.enrollment_state === 'RUNTIME_INSTALLING'
      && reg2.enrollment_state === 'ALIVE' && codes2 === 1);
  // EN6 - REGISTRATION_FAILED, retried with the same credential
  const a3 = await add('Laptop-3'); const k3 = ed25519();
  const s3 = await enrollStart(node.baseUrl, a3.pairing_code, k3); await enrollComplete(node.baseUrl, s3, k3);
  const n3 = apiNode(node.baseUrl, k3); await n3.session();
  await n3.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  const bad = await n3.op('register', { runtime_version: '9.9.9', runtime_digest: 'e'.repeat(64) });
  const st3 = (await sup.query(`select state, state_reason from factory.enrollments where enrollment_id = $1`, [s3.enrollment_id])).rows[0];
  const good3 = await n3.op('register', { runtime_version: '0.1.0', runtime_digest: rel.digest });
  row('EN6 a refused registration (a release not certified on this plane) is REGISTRATION_FAILED with its reason named; the retry with the same credential reaches ALIVE',
    bad.refused === 'registration_failed' && st3.state === 'REGISTRATION_FAILED' && st3.state_reason === 'release_not_certified' && good3.enrollment_state === 'ALIVE');
  // EN7 - revoked code
  const a4 = await add('Laptop-4');
  const rv = await admin.call('revoke-code', { computer_id: a4.computer_id }, founder.token);
  m0 = await mark();
  const s4 = await enrollStart(node.baseUrl, a4.pairing_code, ed25519(), {}, { localAddress: '127.0.0.22' });
  const at7 = await since(m0);
  row('EN7 a code the admin revoked fails closed, by name (code_revoked), and is one attempt row of that code',
    rv.ok && rv.revoked === 1 && s4.refused === 'code_revoked' && one(at7, { outcome: 'code_revoked', code: a4.code_id, tenant: OPERATOR, ip: '127.0.0.22', phase: 'start' }), s4.refused + ' ' + brief(at7));
  // EN8 - envelope-bound: an amendment revokes the outstanding code
  const a5 = await add('Laptop-5');
  const am = await admin.call('amend-envelope', { computer_id: a5.computer_id, expected_version: 1, envelope: { ...ENVELOPE, max_concurrent_runs: 1 } }, founder.token);
  m0 = await mark();
  const s5 = await enrollStart(node.baseUrl, a5.pairing_code, ed25519(), {}, { localAddress: '127.0.0.23' });
  const at8 = await since(m0);
  row('EN8 envelope-bound: amending the envelope revokes the outstanding code; presenting it fails closed (code_revoked), one attempt row of that code',
    am.ok && am.version === 2 && s5.refused === 'code_revoked' && one(at8, { outcome: 'code_revoked', code: a5.code_id, ip: '127.0.0.23' }), s5.refused + ' ' + brief(at8));
  // EN9 - an installer starts; then 5 failures on its locator revoke the code, and the enrollment already started from it ends with it;
  // the 6th attempt (even the right code) is refused
  const a6 = await add('Laptop-6');
  const s9 = await enrollStart(node.baseUrl, a6.pairing_code, ed25519(), {}, { localAddress: '127.0.0.9' });
  const fails = [];
  for (let i = 0; i < 5; i++) fails.push(await enrollStart(node.baseUrl, wrongFor(a6.pairing_code, i), ed25519(), {}, { localAddress: '127.0.0.9' }));
  const sixth = await enrollStart(node.baseUrl, a6.pairing_code, ed25519(), {}, { localAddress: '127.0.0.9' });
  const st6 = (await sup.query(`select state, failed_attempts, revoke_reason from factory.pairing_codes where code_id = $1`, [a6.code_id])).rows[0];
  const aud6 = (await sup.query(`select array_agg(outcome order by attempt_id) o from factory.pairing_attempts where code_id = $1`, [a6.code_id])).rows[0].o || [];
  const e9 = s9.ok && (await sup.query(`select state, state_actor from factory.enrollments where enrollment_id = $1`, [s9.enrollment_id])).rows[0];
  row('EN9 the 5th failed attempt on one locator revokes the code (attempts_exceeded) and ends the enrollment started from it (PAIRING_REVOKED); the 6th - even with the right code - is refused by name; every attempt is one row of that code',
    s9.ok && fails.every((f) => f.refused === 'invalid_code') && st6.state === 'PAIRING_REVOKED' && st6.failed_attempts === 5 && st6.revoke_reason === 'attempts_exceeded'
      && sixth.refused === 'code_revoked' && aud6.join(',') === 'ok,bad_code,bad_code,bad_code,bad_code,bad_code,code_revoked' && e9 && e9.state === 'PAIRING_REVOKED' && e9.state_actor === 'server',
    JSON.stringify({ st6, aud6, e9 }));
  // EN10 - TTL: an installer starts; the code's TTL then elapses: the next start is refused, the code is PAIRING_EXPIRED and the enrollment
  // started from it ends with it (PAIRING_EXPIRED)
  const a7 = await admin.call('add-computer', { display_name: 'Laptop-7', envelope: ENVELOPE, ttl_seconds: 60 }, founder.token);
  const tooLong = await admin.call('add-computer', { display_name: 'Laptop-7b', envelope: ENVELOPE, ttl_seconds: 901 }, founder.token);
  const s10pre = await enrollStart(node.baseUrl, a7.pairing_code, ed25519(), {}, { localAddress: '127.0.0.24' });
  await sleep(61500);
  m0 = await mark();
  const s7 = await enrollStart(node.baseUrl, a7.pairing_code, ed25519(), {}, { localAddress: '127.0.0.24' });
  const at10 = await since(m0);
  const e10 = s10pre.ok && (await sup.query(`select state from factory.enrollments where enrollment_id = $1`, [s10pre.enrollment_id])).rows[0];
  row('EN10 TTL: a code lives at most 15 min (901 s refused); a code past its TTL fails closed (code_expired, one attempt row of the code), is recorded PAIRING_EXPIRED, and its started enrollment ends PAIRING_EXPIRED',
    tooLong.refused === 'bad_request' && s7.refused === 'code_expired' && s10pre.ok && e10.state === 'PAIRING_EXPIRED' && one(at10, { outcome: 'code_expired', code: a7.code_id })
      && (await sup.query(`select state from factory.pairing_codes where code_id = $1`, [a7.code_id])).rows[0].state === 'PAIRING_EXPIRED', s7.refused + ' ' + brief(at10));
  // EN11 - 20 per IP per hour; a forged forwarding header does not reset it
  const ipA = '127.0.0.2';
  const used = (await sup.query(`select count(*)::int n from factory.pairing_attempts where peer_ip = $1`, [ipA])).rows[0].n;
  let last = null;
  for (let i = used; i < 20; i++) last = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA });
  m0 = await mark();
  const over = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA });
  const forged = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA, extraHeaders: { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7', forwarded: 'for=203.0.113.7' } });
  const otherIp = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: '127.0.0.3' });
  const at11 = await since(m0);
  row('EN11 from one address, attempt 21 in the hour is rate_limited_ip, and request headers naming another client (Forwarded, X-Real-IP or X-Forwarded-For) do not reset it; a second address is unaffected; each request is one attempt row under its TCP peer',
    last && last.refused === 'invalid_code' && over.refused === 'rate_limited_ip' && forged.refused === 'rate_limited_ip' && otherIp.refused === 'invalid_code'
      && at11.length === 3 && at11[0].outcome === 'rate_limited_ip' && at11[0].ip === ipA && at11[1].outcome === 'rate_limited_ip' && at11[1].ip === ipA
      && at11[2].ip === '127.0.0.3' && at11[2].outcome === 'malformed' && at11.every((x) => x.tenant === OPERATOR),
    [over.refused, forged.refused, otherIp.refused].join(',') + ' ' + brief(at11));
  // EN13 - two consumes racing
  const a8 = await add('Laptop-8'); const kx = ed25519(), ky = ed25519();
  const sx = await enrollStart(node.baseUrl, a8.pairing_code, kx, {}, { localAddress: '127.0.0.11' });
  const sy = await enrollStart(node.baseUrl, a8.pairing_code, ky, {}, { localAddress: '127.0.0.12' });
  m0 = await mark();
  const [cx, cy] = await Promise.all([enrollComplete(node.baseUrl, sx, kx, { localAddress: '127.0.0.11' }), enrollComplete(node.baseUrl, sy, ky, { localAddress: '127.0.0.12' })]);
  const at13 = await since(m0);
  const creds8 = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [a8.computer_id])).rows[0].n;
  row('EN13 two installers race to consume one code: exactly one credential is issued; the other gets code_consumed; each is one attempt row of the code',
    sx.ok && sy.ok && [cx, cy].filter((c) => c.ok).length === 1 && [cx, cy].some((c) => c.refused === 'code_consumed') && creds8 === 1
      && at13.length === 2 && at13.map((x) => x.outcome).sort().join(',') === 'code_consumed,ok' && at13.every((x) => x.code === a8.code_id && x.phase === 'complete'),
    [cx.ok ? 'ok' : cx.refused, cy.ok ? 'ok' : cy.refused].join(',') + ' ' + brief(at13));
  // EN14 - tenant-bound
  const foreign = await admin.call('issue-code', { computer_id: a4.computer_id }, other.token);
  const t2 = await admin.call('add-computer', { display_name: 'T2-box', envelope: ENVELOPE }, other.token);
  m0 = await mark();
  const kt = ed25519(); const st2 = await enrollStart(node.baseUrl, t2.pairing_code, kt, {}, { localAddress: '127.0.0.13' });
  const ct2 = await enrollComplete(node.baseUrl, st2, kt, { localAddress: '127.0.0.13' });
  const at14 = await since(m0);
  const credT = ct2.ok && (await sup.query(`select tenant_id from factory.node_credentials where credential_id = $1`, [ct2.credential_id])).rows[0].tenant_id;
  row('EN14 tenant-bound: another tenant\'s admin cannot issue a code for this tenant\'s computer (not_found, no leak); a code enrolls into ITS tenant only, and its attempts are that tenant\'s',
    foreign.refused === 'not_found' && t2.ok && st2.tenant === 'second' && credT === T2
      && at14.length === 2 && at14.every((x) => x.tenant === T2 && x.code === t2.code_id && x.outcome === 'ok'), foreign.refused + ' ' + brief(at14));
  // EN18 - a registered key is never registered again
  const a9 = await add('Laptop-9');
  m0 = await mark();
  const reuse = await enrollStart(node.baseUrl, a9.pairing_code, k1, {}, { localAddress: '127.0.0.14' });
  const at18 = await since(m0);
  row('EN18 enrollment always brings a new key: a key already registered is refused (key_reused), one attempt row of the code',
    reuse.refused === 'key_reused' && one(at18, { outcome: 'key_reused', code: a9.code_id, ip: '127.0.0.14' }), reuse.refused + ' ' + brief(at18));
  // EN19 - a mistyped character is caught by the check character and still counts as an attempt
  const typo = a9.pairing_code.slice(0, -1) + (a9.pairing_code.endsWith('0') ? '1' : '0');
  const beforeT = (await sup.query(`select count(*)::int n from factory.pairing_attempts where peer_ip = '127.0.0.15'`)).rows[0].n;
  const ty = await enrollStart(node.baseUrl, typo, ed25519(), {}, { localAddress: '127.0.0.15' });
  const afterT = (await sup.query(`select count(*)::int n, max(outcome) o from factory.pairing_attempts where peer_ip = '127.0.0.15'`)).rows[0];
  row('EN19 a mistyped code (check character) is refused as invalid_code and still counted as an attempt (malformed)', ty.refused === 'invalid_code' && afterT.n === beforeT + 1 && afterT.o === 'malformed');
  // EN20 - the node id of a computer added through Add Computer and not yet enrolled. A legacy (factory_runner) write cannot create a
  // node row under it; and a node row under it that is not the principal's own (written here as the engine, principal_id NULL) is
  // never adopted: completing the enrollment fails as factory_node_identity_conflict, nothing of that call commits (the code is not
  // consumed, no credential, the row unchanged), and once the row is gone the same enrollment completes and the node row is the
  // principal's.
  const a10 = await add('Laptop-10'); const k10 = ed25519();
  const s10 = await enrollStart(node.baseUrl, a10.pairing_code, k10, {}, { localAddress: '127.0.0.16' });
  const nodeId10 = a10.principal_id ? nodeIdOf(a10.principal_id) : 'node-missing';
  const withConn = async (url, fn) => { const c = await connect(url); try { return await fn(c); } finally { await c.end(); } };
  const legacyPlant = await withConn(plane.runnerUrl, (c) => tryQuery(c, 'insert into factory.nodes (node_id) values ($1)', [nodeId10]));
  await asEngine(sup, () => sup.query('insert into factory.nodes (node_id) values ($1)', [nodeId10]));
  const direct = await withConn(plane.nodeApiUrl, (c) => tryQuery(c, `select factory.node_enroll_complete($1::uuid, $2, decode($3, 'hex'), $4::inet, null) as r`,
    [s10.enrollment_id, k10.thumbprint, s10.challenge, '127.0.0.16']));
  const viaEdge = await enrollComplete(node.baseUrl, s10, k10, { localAddress: '127.0.0.16' });
  const held = (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code, (select state from factory.enrollments where enrollment_id = $2) enr,
      (select count(*)::int from factory.node_credentials where principal_id = $3) creds, (select count(*)::int from factory.nodes where node_id = $4) node_rows,
      (select count(*)::int from factory.nodes where node_id = $4 and principal_id is null and computer_id is null) node_unowned`,
    [a10.code_id, s10.enrollment_id, a10.principal_id, nodeId10])).rows[0];
  await asEngine(sup, () => sup.query('delete from factory.nodes where node_id = $1 and principal_id is null', [nodeId10]));
  const retry10 = await enrollComplete(node.baseUrl, s10, k10, { localAddress: '127.0.0.16' });
  const node10 = (await sup.query('select principal_id from factory.nodes where node_id = $1', [nodeId10])).rows[0];
  row('EN20 the node id of a computer added but not yet enrolled: a legacy write of a node row under it is refused by name; a node row under it that is not the principal\'s is never adopted - enrollment completion fails (factory_node_identity_conflict), the code is not consumed, no credential is issued, the row is unchanged; without that row the same enrollment completes',
    s10.ok && /^node-[0-9a-f]{32}$/.test(nodeId10) && !legacyPlant.ok && legacyPlant.code === '42501' && /factory_legacy_refused/.test(legacyPlant.message)
      && !direct.ok && direct.code === 'P0001' && /^factory_node_identity_conflict:/.test(direct.message)
      && viaEdge.refused === 'server_refused' && held.code === 'PAIRING_STARTED' && held.enr === 'PAIRING_STARTED' && held.creds === 0
      && held.node_rows === 1 && held.node_unowned === 1 && retry10.ok && retry10.principal_id === a10.principal_id && node10 && node10.principal_id === a10.principal_id,
    JSON.stringify({ legacy: legacyPlant.ok ? 'ALLOWED' : legacyPlant.code, direct: direct.ok ? 'COMPLETED' : direct.code + ' ' + String(direct.message).slice(0, 40),
      edge: viaEdge.refused || viaEdge.ok, held, retry: retry10.ok || retry10.refused }));

  // ================================================================ SE: the session exchange's refusals (L7-02), through the Node API
  // each reads back that no node_sessions row and no node_assertion_jtis row was written for the credential (SE5: +1 only from the first)
  const mkAssertion = (payload, signer) => { const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8'); return b64u(bytes) + '.' + b64u(sign(null, bytes, signer)); };
  const payloadOf = (id, over = {}) => { const now = Math.floor(Date.now() / 1000); return { v: 1, aud: 'factory-node-api', iat: now, exp: now + 50, jti: b64u(randomBytes(18)), pk: b64u(id.publicKey), ...over }; };
  const sessionRows = async () => (await sup.query(`select (select count(*)::int from factory.node_sessions where credential_id = $1) s, (select count(*)::int from factory.node_assertion_jtis where credential_id = $1) j,
      (select count(*)::int from factory.audit_events where target_id = $1::text and action = 'node.session') a`, [c1.credential_id])).rows[0];
  const post = (a) => postFrom(node.baseUrl, '/v1/session', { assertion: a });
  const kB = ed25519(), kN = ed25519();
  let r0 = await sessionRows();
  const se1 = await post(mkAssertion(payloadOf(k1), kB.privateKey));
  let r1 = await sessionRows();
  row('SE1 an assertion naming enrolled key A but signed by key B is refused 401 bad_signature; no session, no jti', se1.http === 401 && se1.refused === 'bad_signature' && r1.s === r0.s && r1.j === r0.j,
    JSON.stringify({ se1: [se1.http, se1.refused], r0, r1 }));
  // SE2's key has no credential: its read-back is the count of every session and jti on the plane
  const allSessionRows = async () => (await sup.query(`select (select count(*)::int from factory.node_sessions) s, (select count(*)::int from factory.node_assertion_jtis) j`)).rows[0];
  const g0 = await allSessionRows();
  const se2 = await post(mkAssertion(payloadOf(kN), kN.privateKey));
  const g1 = await allSessionRows();
  row('SE2 a correctly signed assertion of a key never enrolled is refused 401 unknown_key; no session, no jti (plane-wide counts unchanged)',
    se2.http === 401 && se2.refused === 'unknown_key' && g1.s === g0.s && g1.j === g0.j, JSON.stringify({ se2: [se2.http, se2.refused], g0, g1 }));
  r0 = await sessionRows();
  const se3 = await post(mkAssertion(payloadOf(k1, { aud: 'factory-admin-api' }), k1.privateKey));
  r1 = await sessionRows();
  row('SE3 an assertion for another audience (factory-admin-api) is refused 401 bad_assertion; no session, no jti', se3.http === 401 && se3.refused === 'bad_assertion' && r1.s === r0.s && r1.j === r0.j,
    JSON.stringify({ se3: [se3.http, se3.refused, se3.message], r0, r1 }));
  const nowS = Math.floor(Date.now() / 1000);
  r0 = await sessionRows();
  const se4 = [await post(mkAssertion(payloadOf(k1, { iat: nowS - 100, exp: nowS - 50 }), k1.privateKey)),
    await post(mkAssertion(payloadOf(k1, { iat: nowS, exp: nowS + 61 }), k1.privateKey)),
    await post(mkAssertion(payloadOf(k1, { iat: nowS + 300, exp: nowS + 330 }), k1.privateKey))];
  r1 = await sessionRows();
  row('SE4 an expired assertion, one living 61 s, and one issued 300 s in the future are each refused 401 assertion_expired; no session, no jti',
    se4.every((x) => x.http === 401 && x.refused === 'assertion_expired') && r1.s === r0.s && r1.j === r0.j, JSON.stringify({ se4: se4.map((x) => x.refused), r0, r1 }));
  r0 = await sessionRows();
  const jti5 = b64u(randomBytes(18));
  const se5a = await post(mkAssertion(payloadOf(k1, { jti: jti5 }), k1.privateKey));
  const se5b = await post(mkAssertion(payloadOf(k1, { jti: jti5 }), k1.privateKey));
  r1 = await sessionRows();
  row('SE5 the same jti twice: the first opens a session, the second is refused 401 assertion_replayed and audited; exactly one session and one jti were written',
    se5a.ok && se5b.http === 401 && se5b.refused === 'assertion_replayed' && r1.s === r0.s + 1 && r1.j === r0.j + 1 && r1.a === r0.a + 1,
    JSON.stringify({ se5: [se5a.ok, se5b.refused], r0, r1 }));
  r0 = await sessionRows();
  const se6 = [await post(mkAssertion(payloadOf(k1, { v: 2 }), k1.privateKey)), await post(mkAssertion(payloadOf(k1, { jti: 'short' }), k1.privateKey)),
    await post(mkAssertion(Buffer.from('not json at all', 'utf8'), k1.privateKey))];
  r1 = await sessionRows();
  row('SE6 an assertion of another version, one whose jti is too short, and one whose payload is not JSON are each refused 400 bad_assertion; no session, no jti',
    se6.every((x) => x.http === 400 && x.refused === 'bad_assertion') && r1.s === r0.s && r1.j === r0.j, JSON.stringify({ se6: se6.map((x) => [x.http, x.refused]), r0, r1 }));

  // ================================================================ EN21-EN25, PE: every request is one attempt; the enrollment walk
  const addIn = (as, name, extra = {}) => admin.call('add-computer', { display_name: name, envelope: ENVELOPE, ...extra }, as.token);
  // EN22 - requests the Edge refuses are recorded and counted, each one row, attributed to the code's (or enrollment's) tenant
  const l1 = await addIn(lim, 'L-1'); const l2 = await addIn(lim, 'L-2');
  const kl = ed25519();
  const sl = await enrollStart(node.baseUrl, l1.pairing_code, kl, {}, { localAddress: '127.0.2.1' });
  const edgeCases = [];
  const edgeCase = async (label, fn, want) => { const mm = await mark(); const res = await fn(); const rows = await since(mm); edgeCases.push({ label, res: [res.http, res.refused], rows: brief(rows), ok: res.refused === want.refused && res.http === want.http && one(rows, want.row) }); };
  await edgeCase('complete signed by another key', () => { const msg = Buffer.from('brain-factory-enroll-v1|' + sl.enrollment_id + '|' + sl.challenge + '|' + kl.thumbprint, 'utf8');
    return postFrom(node.baseUrl, '/v1/enroll/complete', { enrollment_id: sl.enrollment_id, public_key: b64u(kl.publicKey), challenge: sl.challenge, proof: b64u(sign(null, msg, kB.privateKey)) }, { localAddress: '127.0.2.2' }); },
    { http: 401, refused: 'bad_proof', row: { outcome: 'bad_proof', tenant: T5, code: l1.code_id, phase: 'complete', ip: '127.0.2.2' } });
  await edgeCase('complete without a proof', () => postFrom(node.baseUrl, '/v1/enroll/complete', { enrollment_id: sl.enrollment_id, public_key: b64u(kl.publicKey), challenge: sl.challenge }, { localAddress: '127.0.2.3' }),
    { http: 400, refused: 'bad_request', row: { outcome: 'bad_request', tenant: T5, code: l1.code_id, phase: 'complete' } });
  await edgeCase('start with an unknown field', () => postFrom(node.baseUrl, '/v1/enroll/start', { code: l2.pairing_code, public_key: b64u(kl.publicKey), nickname: 'x' }, { localAddress: '127.0.2.4' }),
    { http: 400, refused: 'bad_request', row: { outcome: 'bad_request', tenant: T5, code: l2.code_id, phase: 'start' } });
  await edgeCase('start naming an identity field', () => postFrom(node.baseUrl, '/v1/enroll/start', { code: l2.pairing_code, public_key: b64u(kl.publicKey), tenant_id: T5 }, { localAddress: '127.0.2.5' }),
    { http: 400, refused: 'identity_from_body_refused', row: { outcome: 'identity_from_body_refused', tenant: T5, code: l2.code_id } });
  await edgeCase('start with a 41-character code', () => postFrom(node.baseUrl, '/v1/enroll/start', { code: 'A'.repeat(41), public_key: b64u(kl.publicKey) }, { localAddress: '127.0.2.6' }),
    { http: 400, refused: 'bad_request', row: { outcome: 'bad_request', tenant: OPERATOR, code: null } });
  await edgeCase('start with a 70 KiB body', () => postFrom(node.baseUrl, '/v1/enroll/start', { code: l2.pairing_code, pad: 'x'.repeat(70 * 1024) }, { localAddress: '127.0.2.7' }),
    { http: 413, refused: 'body_too_large', row: { outcome: 'body_too_large', ip: '127.0.2.7' } });
  const P22 = '127.0.2.50';
  for (let i = 0; i < 20; i++) await postFrom(node.baseUrl, '/v1/enroll/start', { code: l2.pairing_code, public_key: b64u(kl.publicKey), nickname: 'x' }, { localAddress: P22 });
  const t21 = await enrollStart(node.baseUrl, l2.pairing_code, ed25519(), {}, { localAddress: P22 });
  const p22 = (await sup.query(`select count(*)::int n, count(*) filter (where outcome = 'bad_request')::int b from factory.pairing_attempts where peer_ip = $1`, [P22])).rows[0];
  row('EN22 every request the Edge refuses is still one pairing attempt with its named outcome (a proof signed by the wrong key, no proof, a field outside the schema, a field naming identity, a code of 41 characters, a 70 KiB body), charged to the tenant of its code or enrollment; after twenty of them from one address, a valid start from that address is rate_limited_ip',
    sl.ok && edgeCases.every((c) => c.ok) && p22.b === 20 && p22.n === 21 && t21.refused === 'rate_limited_ip',
    JSON.stringify({ edgeCases: edgeCases.filter((c) => !c.ok), p22, t21: t21.refused }).slice(0, 1200));

  // EN23 - the complete-time refusals of server state are recorded (state planted as the engine where no product path reaches it)
  const pairFull = async (issued, as, from) => { const k = ed25519(); const s = await enrollStart(node.baseUrl, issued.pairing_code, k, {}, { localAddress: from });
    const c = await enrollComplete(node.baseUrl, s, k, { localAddress: from }); return { k, s, c }; };
  const x1 = await addIn(aud, 'A-archived'); const kx1 = ed25519(); const sx1 = await enrollStart(node.baseUrl, x1.pairing_code, kx1, {}, { localAddress: '127.0.3.1' });
  await asEngine(sup, () => sup.query(`update factory.computers set archived_at = now(), archived_by = $2 where computer_id = $1`, [x1.computer_id, ADMIN]));
  m0 = await mark();
  const cx1 = await enrollComplete(node.baseUrl, sx1, kx1, { localAddress: '127.0.3.1' });
  const atx1 = await since(m0);
  const x2 = await addIn(aud, 'A-envelope'); const kx2 = ed25519(); const sx2 = await enrollStart(node.baseUrl, x2.pairing_code, kx2, {}, { localAddress: '127.0.3.2' });
  await asEngine(sup, async () => {
    await sup.query(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ($1, $2, 2, '{generic}', $3)`, [T6, x2.computer_id, ADMIN]);
    await sup.query(`update factory.computers set current_envelope_version = 2 where computer_id = $1`, [x2.computer_id]);
  });
  m0 = await mark();
  const cx2 = await enrollComplete(node.baseUrl, sx2, kx2, { localAddress: '127.0.3.2' });
  const atx2 = await since(m0);
  const x3 = await addIn(aud, 'A-active-credential'); const p3 = await pairFull(x3, aud, '127.0.3.3');
  const rp3 = await admin.call('repair', { computer_id: x3.computer_id }, aud.token);
  const kx3 = ed25519(); const sx3 = await enrollStart(node.baseUrl, rp3.pairing_code, kx3, {}, { localAddress: '127.0.3.4' });
  const kPlant = ed25519();
  await asEngine(sup, () => sup.query(`insert into factory.node_credentials (tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, replaces_credential_id)
      values ($1, $2, $3, $4, $5, 'rotate', $6)`, [T6, x3.computer_id, x3.principal_id, kPlant.publicKey, kPlant.thumbprint, p3.c.credential_id]));
  m0 = await mark();
  const cx3 = await enrollComplete(node.baseUrl, sx3, kx3, { localAddress: '127.0.3.4' });
  const atx3 = await since(m0);
  const revokedAudits = (await sup.query(`select count(*)::int n from factory.audit_events where action = 'pairing.revoked' and actor_kind = 'server' and target_id = any ($1::text[]) and reason in ('computer_archived', 'envelope_amended')`,
    [[x1.code_id, x2.code_id]])).rows[0].n;
  row('EN23 the complete-time refusals of server state are each one attempt row: an archived computer and a changed envelope (code_revoked, the code and its enrollment revoked, audited), and a principal that already holds an active credential (principal_has_active_credential)',
    sx1.ok && cx1.refused === 'code_revoked' && one(atx1, { outcome: 'code_revoked', code: x1.code_id, tenant: T6 })
      && sx2.ok && cx2.refused === 'code_revoked' && one(atx2, { outcome: 'code_revoked', code: x2.code_id, tenant: T6 })
      && p3.c.ok && rp3.ok && sx3.ok && cx3.refused === 'principal_has_active_credential' && one(atx3, { outcome: 'principal_has_active_credential', code: rp3.code_id, tenant: T6 })
      && revokedAudits === 2,
    JSON.stringify({ x1: [cx1.refused, brief(atx1)], x2: [cx2.refused, brief(atx2)], x3: [p3.c.ok, rp3.ok, cx3.refused, brief(atx3)], revokedAudits }));

  // EN24 - a code its 5th failure revoked: one more wrong code on that locator gets the answer any wrong code gets (invalid_code), and
  // its attempt row names that code and its tenant (bad_code_not_live)
  const x4 = await addIn(aud, 'A-revoked-locator');
  for (let i = 0; i < 5; i++) await enrollStart(node.baseUrl, wrongFor(x4.pairing_code, i), ed25519(), {}, { localAddress: '127.0.3.5' });
  m0 = await mark();
  const s24 = await enrollStart(node.baseUrl, wrongFor(x4.pairing_code, 7), ed25519(), {}, { localAddress: '127.0.3.6' });
  const at24 = await since(m0);
  row('EN24 once a code is revoked by its 5th failure, a further wrong code on its locator gets invalid_code, and its attempt row names that code and its tenant (bad_code_not_live)',
    s24.refused === 'invalid_code' && one(at24, { outcome: 'bad_code_not_live', code: x4.code_id, tenant: T6, locator: norm(x4.pairing_code).slice(0, 5) }), s24.refused + ' ' + brief(at24));

  // EN25 - an enrollment whose own challenge window ends before the code's TTL: that enrollment ends (PAIRING_EXPIRED), the code stays live,
  // and the same code can be started again (contract §2: the code expires only when its TTL elapses). The short window is planted.
  const x5 = await addIn(aud, 'A-challenge');
  const s25a = await enrollStart(node.baseUrl, x5.pairing_code, ed25519(), {}, { localAddress: '127.0.3.7' });
  const k25 = ed25519(); const e25 = (await sup.query('select gen_random_uuid()::text id')).rows[0].id; const ch25 = randomBytes(32);
  await asEngine(sup, () => sup.query(`insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint, challenge, challenge_expires_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp() + interval '1 second')`, [e25, T6, x5.code_id, x5.computer_id, x5.principal_id, k25.publicKey, k25.thumbprint, ch25]));
  await sleep(1600);
  m0 = await mark();
  const c25 = await enrollComplete(node.baseUrl, { enrollment_id: e25, challenge: ch25.toString('hex') }, k25, { localAddress: '127.0.3.7' });
  const at25 = await since(m0);
  const st25 = (await sup.query(`select (select state from factory.enrollments where enrollment_id = $1) e, (select state from factory.pairing_codes where code_id = $2) c`, [e25, x5.code_id])).rows[0];
  const s25b = await enrollStart(node.baseUrl, x5.pairing_code, ed25519(), {}, { localAddress: '127.0.3.7' });
  row('EN25 an enrollment whose challenge window closed while its code was inside its TTL: its complete is refused enrollment_expired (one attempt row) and it moves to PAIRING_EXPIRED; its code remains PAIRING_STARTED and accepts a fresh start',
    s25a.ok && c25.refused === 'enrollment_expired' && one(at25, { outcome: 'enrollment_expired', code: x5.code_id }) && st25.e === 'PAIRING_EXPIRED' && st25.c === 'PAIRING_STARTED' && s25b.ok,
    JSON.stringify({ c25: c25.refused, at25: brief(at25), st25, s25b: s25b.ok || s25b.refused }));

  // PE - the peer the platform may hand the handler, through the SAME wired handler (peer.ts withPeer) the harness serves:
  const x6 = await addIn(aud, 'A-peer');
  const req = (method, path, body) => new Request('http://edge.invalid' + node.basePath + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const viaInfo = async (info, method, path, body) => { const res = await node.serve(req(method, path, body), info); return { ...(await res.json()), http: res.status }; };
  const kpe = ed25519();
  const peCase = async (label, info) => {
    const time = await viaInfo(info, 'GET', '/v1/time');
    const sess = await viaInfo(info, 'POST', '/v1/session', { assertion: mkAssertion(payloadOf(k1), k1.privateKey) });
    const mm = await mark();
    const st = await viaInfo(info, 'POST', '/v1/enroll/start', { code: x6.pairing_code, public_key: b64u(kpe.publicKey) });
    const cp = await viaInfo(info, 'POST', '/v1/enroll/complete', { enrollment_id: s25a.enrollment_id, public_key: b64u(kpe.publicKey), challenge: 'ab'.repeat(32), proof: b64u(randomBytes(64)) });
    const rows = await since(mm);
    return { label, ok: time.http === 200 && time.ok && sess.ok && st.http === 503 && st.refused === 'peer_unavailable' && cp.http === 503 && cp.refused === 'peer_unavailable'
      && rows.length === 2 && rows.every((x) => x.ip === null && x.outcome === 'peer_unavailable' && x.tenant === T6) && rows[0].code === x6.code_id && rows[1].code === x5.code_id,
      got: [time.http, sess.ok, st.http + ':' + st.refused, cp.http + ':' + cp.refused, brief(rows)] };
  };
  const pe1 = await peCase('no info', undefined).catch((e) => ({ label: 'no info', ok: false, got: String(e && e.message) }));
  row('PE1 the runtime hands no info: GET /v1/time and POST /v1/session are served; enroll/start and enroll/complete are refused 503 peer_unavailable, each recorded (peer_ip null, the code\'s tenant)', pe1.ok, JSON.stringify(pe1.got));
  const pe2 = await peCase('unix', { remoteAddr: { transport: 'unix', path: '/run/edge.sock' } }).catch((e) => ({ ok: false, got: String(e && e.message) }));
  row('PE2 a transport without a hostname (a unix socket): the same', pe2.ok, JSON.stringify(pe2.got));
  const pe3 = [];
  for (const h of ['gateway.local', '999.0.0.1', 'fe80::7%lan0', '']) pe3.push(await peCase(h, { remoteAddr: { transport: 'tcp', hostname: h, port: 443 } }).catch((e) => ({ label: h, ok: false, got: String(e && e.message) })));
  row('PE3 a hostname that is not an IP address (a name, an out-of-range octet, a zoned IPv6 address, empty): the same - never an unnamed error', pe3.every((x) => x.ok), JSON.stringify(pe3.filter((x) => !x.ok)));
  m0 = await mark();
  await viaInfo({ remoteAddr: { transport: 'tcp', hostname: '::ffff:127.0.0.61', port: 1 } }, 'POST', '/v1/enroll/start', { code: wrongFor(x4.pairing_code, 3), public_key: b64u(kpe.publicKey) });
  await viaInfo({ remoteAddr: { transport: 'tcp', hostname: '2001:DB8::0:1', port: 1 } }, 'POST', '/v1/enroll/start', { code: wrongFor(x4.pairing_code, 4), public_key: b64u(kpe.publicKey) });
  const at4pe = await since(m0);
  row('PE4 an IPv4-mapped IPv6 peer is keyed as its IPv4 address; an IPv6 peer in any spelling is keyed in its canonical form', at4pe.length === 2 && at4pe[0].ip === '127.0.0.61' && at4pe[1].ip === '2001:db8::1', brief(at4pe));

  // PU1 - FACTORY_PAIRING_PEPPER unset (a second Node API on the same plane, started without it): enroll/start is refused 503
  // pepper_unavailable by name and recorded as one attempt on the code's tenant; the name stands when the caps are already reached (the
  // cause is named first, never a 429 in its place), while the Node API that has the pepper answers the same request rate_limited_ip
  const nodeNoPepper = await startApi(plane, { pepperB64, noPepper: true });
  try {
    const x7 = await addIn(pu, 'U-pepper');
    const kpu = ed25519();
    m0 = await mark();
    const pu1 = await enrollStart(nodeNoPepper.baseUrl, x7.pairing_code, kpu, {}, { localAddress: '127.0.3.40' });
    const atpu1 = await since(m0);
    const PU = '127.0.3.41';
    await asEngine(sup, () => sup.query(`insert into factory.pairing_attempts (tenant_id, peer_ip, phase, outcome) select $1, $2::inet, 'start', 'seeded' from generate_series(1, 60)`, [T7, PU]));
    m0 = await mark();
    const pu2 = await enrollStart(nodeNoPepper.baseUrl, x7.pairing_code, kpu, {}, { localAddress: PU });
    const atpu2 = await since(m0);
    const pu3 = await enrollStart(node.baseUrl, x7.pairing_code, kpu, {}, { localAddress: PU });
    const codeState = (await sup.query('select state from factory.pairing_codes where code_id = $1', [x7.code_id])).rows[0].state;
    row('PU1 with the pairing pepper unset, enroll/start is refused 503 pepper_unavailable and recorded as one attempt on the code\'s tenant (pepper_unavailable, its peer, its code); with that peer and tenant already at their caps it is still pepper_unavailable (recorded), while the Node API holding the pepper answers the same request 429 rate_limited_ip; the code is untouched',
      pu1.http === 503 && pu1.refused === 'pepper_unavailable' && one(atpu1, { outcome: 'pepper_unavailable', tenant: T7, ip: '127.0.3.40', code: x7.code_id, phase: 'start' })
        && pu2.http === 503 && pu2.refused === 'pepper_unavailable' && one(atpu2, { outcome: 'pepper_unavailable', tenant: T7, ip: PU, code: x7.code_id })
        && pu3.http === 429 && pu3.refused === 'rate_limited_ip' && codeState === 'PAIRING_CODE_ISSUED',
      JSON.stringify({ first: [pu1.http, pu1.refused, brief(atpu1)], atCaps: [pu2.http, pu2.refused, brief(atpu2)], withPepper: [pu3.http, pu3.refused], codeState }));
  } finally { await nodeNoPepper.stop().catch(() => {}); }

  // EN21 - THE WALK (contract §2; AC-1): EN10's expiry found by a later start, EN9's fifth failure after a start, and
  // an enrollment started from a code an admin reissues, revokes, amends away or archives each have their transition; and for EVERY
  // enrollment of the plane the walk starts at PAIRING_STARTED, is contiguous, and ends at the enrollment's state
  const adminCase = async (name, act) => { const x = await addIn(aud, name); const s = await enrollStart(node.baseUrl, x.pairing_code, ed25519(), {}, { localAddress: '127.0.3.9' });
    const r = await act(x); return { name, s, r, e: s.ok && (await sup.query(`select state from factory.enrollments where enrollment_id = $1`, [s.enrollment_id])).rows[0].state }; };
  const w21 = [
    await adminCase('W-reissue', (x) => admin.call('issue-code', { computer_id: x.computer_id }, aud.token)),
    await adminCase('W-revoke', (x) => admin.call('revoke-code', { computer_id: x.computer_id }, aud.token)),
    await adminCase('W-amend', (x) => admin.call('amend-envelope', { computer_id: x.computer_id, expected_version: 1, envelope: { ...ENVELOPE, max_concurrent_runs: 1 } }, aud.token)),
    await adminCase('W-archive', (x) => admin.call('archive', { computer_id: x.computer_id }, aud.token)),
  ];
  const lastTo = async (eid) => (await sup.query(`select to_state, actor_kind from factory.enrollment_transitions where enrollment_id = $1 order by transition_id desc limit 1`, [eid])).rows[0] || {};
  const explicit = [['EN10 expiry found by a start', s10pre.enrollment_id, 'PAIRING_EXPIRED', 'server'], ['EN9 5th failure', s9.enrollment_id, 'PAIRING_REVOKED', 'server'],
    ...w21.map((x) => [x.name, x.s.enrollment_id, 'PAIRING_REVOKED', 'admin'])];
  const explicitBad = [];
  for (const [label, eid, to, actor] of explicit) { const t = await lastTo(eid); if (t.to_state !== to || t.actor_kind !== actor) explicitBad.push(label + ':' + JSON.stringify(t)); }
  const walks = (await sup.query(`select e.enrollment_id::text id, e.state, array_agg(coalesce(t.from_state, '-') || '>' || t.to_state order by t.transition_id) filter (where t.transition_id is not null) w
      from factory.enrollments e left join factory.enrollment_transitions t on t.enrollment_id = e.enrollment_id group by e.enrollment_id, e.state`)).rows;
  const walkBad = walks.filter((x) => { const w = x.w || []; if (!w.length || w[0] !== '->PAIRING_STARTED') return true;
    for (let i = 1; i < w.length; i++) if (w[i].split('>')[0] !== w[i - 1].split('>')[1]) return true; return w[w.length - 1].split('>')[1] !== x.state; });
  row('EN21 every state an enrollment held has its transition row: EN10\'s expiry, EN9\'s fifth failure, and a reissue, revoke-code, amendment and archive of the code it was started from each record their transition (actor named); for EVERY enrollment (' + walks.length + ') the walk starts at PAIRING_STARTED, is contiguous and ends at its state',
    w21.every((x) => x.s.ok && x.r.ok && x.e === 'PAIRING_REVOKED') && explicitBad.length === 0 && walkBad.length === 0 && walks.length >= 20,
    JSON.stringify({ w21: w21.map((x) => [x.name, x.r.ok || x.r.refused, x.e]), explicitBad, walkBad: walkBad.slice(0, 3) }));

  // EN15 - the generator: CSPRNG, >= 55 bits, no counter or clock structure
  const sample = Array.from({ length: 4000 }, () => pairing.generateCode((k) => new Uint8Array(randomBytes(k))));
  const secrets = new Set(sample.map((s) => s.normalized.slice(5)));
  const counts = Array.from({ length: 17 }, () => new Array(32).fill(0));
  for (const s of sample) [...s.normalized].forEach((c, i) => counts[i][pairing.ALPHABET.indexOf(c)]++);
  const chi = counts.map((col) => col.reduce((acc, o) => acc + ((o - 4000 / 32) ** 2) / (4000 / 32), 0));
  const src = readFileSync(join(EDGE, '_shared/pairing.ts'), 'utf8');
  row('EN15 the code generator draws every character from the CSPRNG (60 secret bits >= 55; 4000 codes: all secrets distinct, every position uniform by chi-square), and reads no clock or counter',
    pairing.SECRET_BITS >= 55 && secrets.size === 4000 && chi.every((x) => x < 70) && !/Date\.now|new Date|Math\.random|counter/.test(src.replace(/\/\/[^\n]*/g, '')),
    'secret bits ' + pairing.SECRET_BITS + ', max chi-square ' + Math.max(...chi).toFixed(1) + ' (df 31)');

  // ================================================================ EN26 / EN16 - S-12: no bearer anywhere, in any encoding
  // a node rotation first (a rotated credential's key is a bearer too)
  const kr = ed25519();
  const nr = apiNode(node.baseUrl, k2); await nr.session();
  const rot = await nr.rotate(kr);
  const haystack = async () => {
    const c = await connect(plane.superUrl);
    try {
      await c.query(`set bytea_output = 'hex'`);
      const rels = (await c.query(`select format('%I.%I', n.nspname, c.relname) q from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relkind in ('r', 'p', 'm') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname !~ '^pg_(toast_)?temp' order by 1`)).rows.map((x) => x.q);
      const parts = [];
      for (const q of rels) parts.push((await c.query(`select coalesce(string_agg(t::text, E'\\n'), '') x from ${q} t`)).rows[0].x);
      for (const q of [`select string_agg(coalesce(prosrc, '') || ' ' || coalesce(array_to_string(proconfig, ','), ''), E'\\n') x from pg_proc`,
        `select string_agg(array_to_string(setconfig, ','), E'\\n') x from pg_db_role_setting`, `select string_agg(description, E'\\n') x from pg_description`,
        `select string_agg(pg_get_expr(adbin, adrelid), E'\\n') x from pg_attrdef`,
        `select string_agg(pg_get_viewdef(c.oid), E'\\n') x from pg_class c where c.relkind in ('v', 'm') and c.relnamespace <> 'pg_catalog'::regnamespace and c.relnamespace <> 'information_schema'::regnamespace`,
        `select string_agg(name || '=' || coalesce(setting, ''), E'\\n') x from pg_settings`]) parts.push((await c.query(q)).rows[0].x || '');
      return { text: parts.join('\n'), rels: rels.length };
    } finally { await c.end(); }
  };
  const hs = await haystack();
  const hex = (b) => Buffer.from(b).toString('hex'), b64 = (b) => Buffer.from(b).toString('base64');
  const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
  const bodyJson = (arr) => arr.map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
  const codes = bodyJson(admin.bodies).map((j) => j.pairing_code).filter((x) => typeof x === 'string');
  const tokens = bodyJson(node.bodies).map((j) => j.session_token).filter((x) => typeof x === 'string');
  const needles = [];
  for (const d of codes) { const nz = norm(d); needles.push(['code', d], ['code', nz], ['code secret', nz.slice(5)], ['code hex', hex(Buffer.from(nz))], ['code base64', b64(Buffer.from(nz))], ['code sha256', sha(nz)], ['code sha256', sha(d)]); }
  for (const t of tokens) { const raw = Buffer.from(t, 'base64url'); needles.push(['token', t], ['token hex', hex(Buffer.from(t))], ['token base64', b64(Buffer.from(t))], ['token raw hex', hex(raw)], ['token raw base64', b64(raw)]); }
  for (const k of keys) { const der = k.privateKey.export({ format: 'der', type: 'pkcs8' }); const seed = der.subarray(-32);
    needles.push(['key pkcs8 hex', hex(der)], ['key pkcs8 base64', b64(der)], ['key seed hex', hex(seed)], ['key seed base64', b64(seed)], ['key seed base64url', b64u(seed)]); }
  const pep = Buffer.from(pepperB64, 'base64');
  const pepNeedles = [['pepper base64', pepperB64], ['pepper hex', hex(pep)], ['pepper base64url', b64u(pep)]];
  const found = needles.concat(pepNeedles).filter(([, v]) => v && hs.text.includes(v)).map(([w]) => w);
  // positive controls: the verifiers the plane DOES store are found, so the rendering is the one searched
  const controls = [...tokens.map((t) => ['token sha256', sha(t)]), ...codes.map((d) => ['code hmac', createHmac('sha256', pep).update(norm(d)).digest('hex')]),
    ...[k1, k2, kr].map((k) => ['public key', hex(k.publicKey)])];
  const missing = controls.filter(([, v]) => !hs.text.includes(v)).map(([w]) => w);
  const count = (arr, v) => arr.reduce((s, t) => s + t.split(v).length - 1, 0);
  const notOnce = [...codes.map((d) => [d, count(admin.bodies, d)]), ...tokens.map((t) => [t.slice(0, 6), count(node.bodies, t)])].filter(([, k]) => k !== 1);
  row('EN26 S-12: after pairings, session exchanges and a node rotation, no pairing code (display, normalized, secret part, hex, base64, SHA-256), session token (text, bytes; hex, base64), private key (PKCS8, seed; hex, base64) or pepper is in any relation (' + hs.rels + ', rows as text, bytea as hex), function body or setting, role setting, comment, default or setting; the stored verifiers ARE found (token SHA-256, code HMAC, public keys); each code and each token was returned exactly once',
    rot.ok && codes.length >= 20 && tokens.length >= 5 && keys.length >= 30 && found.length === 0 && missing.length === 0 && notOnce.length === 0,
    JSON.stringify({ codes: codes.length, tokens: tokens.length, keys: keys.length, found: [...new Set(found)], missing: [...new Set(missing)], notOnce: notOnce.length, rot: rot.ok || rot.refused }));
  // EN16 - the pepper: nowhere in the plane (EN26's haystack), the migration or a server row; in the Edge sources no literal that could be
  // a key (base64 of 32 bytes or more, or hex of 64 characters or more; the RFC 8032 test vectors aside); FACTORY_PAIRING_PEPPER is
  // read via Deno.env.get, once per Edge entry point
  const edgeSrc = [...readdirSync(join(EDGE, '_shared')).map((f) => join(EDGE, '_shared', f)), join(EDGE, 'factory-node-api', 'index.ts'), join(EDGE, 'factory-admin-api', 'index.ts')]
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const RFC = ['d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'];
  const literals = [...edgeSrc.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const keyish = literals.filter((l) => !RFC.includes(l) && (/^[0-9a-fA-F]{64,}$/.test(l) || (/^[A-Za-z0-9+/_-]{43,}={0,2}$/.test(l) && Buffer.from(l, 'base64').length >= 32)));
  const envReads = [...edgeSrc.matchAll(/FACTORY_PAIRING_PEPPER\b(?!_VERSION)/g)].length;
  const idx = [join(EDGE, 'factory-node-api', 'index.ts'), join(EDGE, 'factory-admin-api', 'index.ts')].map((f) => readFileSync(f, 'utf8'));
  const migration = compose();
  row('EN16 no pepper anywhere: not in any relation, function, setting or catalog text (EN26), not in the migration; no Edge literal that could be a key; FACTORY_PAIRING_PEPPER is read via Deno.env.get, once per Edge entry point',
    !pepNeedles.some(([, v]) => hs.text.includes(v) || migration.includes(v)) && keyish.length === 0
      && idx.every((s) => /Deno\.env\.get\('FACTORY_PAIRING_PEPPER'\)/.test(s)) && idx.every((s) => (s.replace(/\/\/[^\n]*/g, '').match(/FACTORY_PAIRING_PEPPER\b(?!_VERSION)/g) || []).length === 1)
      && !migration.includes(plain) && !migration.includes(n1),
    JSON.stringify({ keyish: keyish.map((l) => l.slice(0, 12)), envReads }));
  // EN17 - secrets in logs / responses
  const logs = JSON.stringify(node.events) + JSON.stringify(admin.events);
  const list = await admin.call('list-computers', {}, founder.token);
  row('EN17 no code, token or key in the APIs\' logs; a pairing code is returned once (Add Computer), never by a later read',
    !logs.includes(code1.slice(6)) && !JSON.stringify(list).includes(code1.slice(6)) && !JSON.stringify(list).includes(n1) && !logs.includes(ses.session_token || 'x')
      && !tokens.some((t) => logs.includes(t)) && !codes.some((d) => logs.includes(norm(d).slice(5))));

  // EN12 runs last: later rows in this tenant would meet the S-6 tenant cap (60 per tenant per hour, unknown locators included)
  const cnt = async () => (await sup.query(`select count(*)::int n from factory.pairing_attempts where tenant_id = $1 and at > now() - interval '1 hour'`, [OPERATOR])).rows[0].n;
  let have = await cnt(); let ip = 20, used2 = 0, lastT = null;
  while (have < 60) { lastT = await enrollStart(node.baseUrl, 'YYYYY-YYYY-YYYY-YYYY-Y', ed25519(), {}, { localAddress: '127.0.0.' + ip }); have = await cnt(); if (++used2 % 15 === 0) ip++; }
  m0 = await mark();
  const t61 = await enrollStart(node.baseUrl, 'YYYYY-YYYY-YYYY-YYYY-Y', ed25519(), {}, { localAddress: '127.0.0.' + (ip + 1) });
  const at12 = await since(m0);
  row('EN12 the 61st attempt for the tenant within the hour is refused (rate_limited_tenant), unknown locators included (S-6), and is itself one attempt row',
    lastT && lastT.refused !== 'rate_limited_tenant' && t61.refused === 'rate_limited_tenant' && one(at12, { outcome: 'rate_limited_tenant', tenant: OPERATOR }),
    'tenant attempts ' + have + ', then ' + t61.refused + ' ' + brief(at12));
  // EN12v - change request CR-016 (the r3 literal reading of S-6, which the Director's ruling keeps: RECORDED; detail sent to the
  // Director privately)
  const fresh = await add('Laptop-after-cap');
  m0 = await mark();
  const valid = fresh.ok ? await enrollStart(node.baseUrl, fresh.pairing_code, ed25519(), {}, { localAddress: '127.0.0.' + (ip + 2) }) : null;
  const odd = await enrollStart(node.baseUrl, 'YYYYY-YYYY-YYYY-YYYY-Y', ed25519(), { not_a_field: 1 }, { localAddress: '127.0.0.' + (ip + 3) });
  const atV = await since(m0);
  const codeState = fresh.ok ? (await sup.query(`select state from factory.pairing_codes where code_id = $1`, [fresh.code_id])).rows[0] : null;
  row('EN12v the r3 reading of the S-6 tenant cap holds for the requests CR-016 concerns (outcome and attempt rows as pinned; detail sent to the Director privately)',
    fresh.ok && valid && valid.http === 429 && valid.refused === 'rate_limited_tenant' && odd.refused === 'rate_limited_tenant'
      && atV.length === 2 && atV.every((a) => a.outcome === 'rate_limited_tenant' && a.tenant === OPERATOR) && codeState && codeState.state === 'PAIRING_CODE_ISSUED',
    JSON.stringify({ valid: valid && [valid.http, valid.refused], odd: [odd.http, odd.refused], code: codeState && codeState.state }) + ' ' + brief(atV));
  void other; void thumbprint;
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 enrollment_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  await sup.end().catch(() => {});
  await node.stop().catch(() => {}); await admin.stop().catch(() => {}); await brain.stop().catch(() => {});
  await plane.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nenrollment_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/enrollment_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
