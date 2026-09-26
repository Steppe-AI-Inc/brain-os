#!/usr/bin/env node
// WO-3 / AC-8 DEVELOPER VERIFICATION: Add Computer -> pairing code -> enrollment, end to end through the two real handlers (the Admin
// API with a founder persona; the Node API as the installer), and every abuse case at its boundary value. Developer instrument; the
// Brain OS side is the developer stub (brainos_stub.mjs), never acceptance evidence for AC-7.
// usage: node qa/factory/v1/enrollment_acceptance.mjs [--evidence <file>]
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, asEngine, ed25519, publishedRelease } from './fixtures.mjs';
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

const plane = await startV1Plane();
const brain = await startBrainOsStub();
const pepperB64 = randomBytes(32).toString('base64');
const node = await startApi(plane, { pepperB64 });
const admin = await startAdminApi(plane, brain, { pepperB64 });
const sup = await connect(plane.superUrl);
try {
  const founder = brain.persona('founder');
  const other = brain.persona('founder');
  await asEngine(sup, async () => {
    await sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'founder')`, [OPERATOR, founder.userId]);
    await sup.query(`insert into factory.tenants (tenant_id, name) values ('b2e0f000-0000-4000-8000-000000000002', 'second')`);
    await sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ('b2e0f000-0000-4000-8000-000000000002', $1, 'founder')`, [other.userId]);
  });
  const rel = await publishedRelease(sup);
  const add = (name, extra = {}) => admin.call('add-computer', { display_name: name, envelope: ENVELOPE, ...extra }, founder.token);

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
      && walk.join('>') === 'PAIRING_STARTED>PAIRING_VERIFIED>NODE_ID_ISSUED>NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE', walk.join('>'));
  // EN4 - replay
  const again = await enrollComplete(node.baseUrl, s1, k1);
  const restart = await enrollStart(node.baseUrl, code1, ed25519());
  row('EN4 replay: completing the same enrollment again -> already_enrolled; presenting the consumed code again -> code_consumed (named, fail closed)',
    again.refused === 'already_enrolled' && restart.refused === 'code_consumed', again.refused + ',' + restart.refused);
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
  const s4 = await enrollStart(node.baseUrl, a4.pairing_code, ed25519());
  row('EN7 a code the admin revoked fails closed, by name (code_revoked)', rv.ok && rv.revoked === 1 && s4.refused === 'code_revoked', s4.refused);
  // EN8 - envelope-bound: an amendment revokes the outstanding code
  const a5 = await add('Laptop-5');
  const am = await admin.call('amend-envelope', { computer_id: a5.computer_id, expected_version: 1, envelope: { ...ENVELOPE, max_concurrent_runs: 1 } }, founder.token);
  const s5 = await enrollStart(node.baseUrl, a5.pairing_code, ed25519());
  row('EN8 envelope-bound: amending the envelope revokes the outstanding code; presenting it fails closed (code_revoked)', am.ok && am.version === 2 && s5.refused === 'code_revoked', s5.refused);
  // EN9 - 5 failures on a locator revoke the code; the 6th attempt (even the right code) is refused
  const a6 = await add('Laptop-6');
  const good6 = norm(a6.pairing_code);
  const wrong = (i) => { const body = good6.slice(0, 5) + ('ABCDEFGHJKMN'.slice(i) + 'ABCDEFGHJKMN').slice(0, 12); return body + pairing.ALPHABET[[...body].reduce((s, c, j) => (s + (j + 1) * pairing.ALPHABET.indexOf(c)) % 32, 0)]; };
  const fails = [];
  for (let i = 0; i < 5; i++) fails.push(await enrollStart(node.baseUrl, wrong(i), ed25519(), {}, { localAddress: '127.0.0.9' }));
  const sixth = await enrollStart(node.baseUrl, a6.pairing_code, ed25519(), {}, { localAddress: '127.0.0.9' });
  const st6 = (await sup.query(`select state, failed_attempts, revoke_reason from factory.pairing_codes where code_id = $1`, [a6.code_id])).rows[0];
  const aud6 = (await sup.query(`select count(*)::int n from factory.pairing_attempts where code_id = $1`, [a6.code_id])).rows[0].n;
  row('EN9 the 5th failed attempt on one locator revokes the code (attempts_exceeded); the 6th - even with the right code - is refused by name; every attempt audited',
    fails.every((f) => f.refused === 'invalid_code') && st6.state === 'PAIRING_REVOKED' && st6.failed_attempts === 5 && st6.revoke_reason === 'attempts_exceeded'
      && sixth.refused === 'code_revoked' && aud6 === 6, JSON.stringify(st6));
  // EN10 - TTL
  const a7 = await admin.call('add-computer', { display_name: 'Laptop-7', envelope: ENVELOPE, ttl_seconds: 60 }, founder.token);
  const tooLong = await admin.call('add-computer', { display_name: 'Laptop-7b', envelope: ENVELOPE, ttl_seconds: 901 }, founder.token);
  await sleep(61500);
  const s7 = await enrollStart(node.baseUrl, a7.pairing_code, ed25519());
  row('EN10 TTL: a code lives at most 15 min (901 s refused); a code past its TTL fails closed (code_expired) and is recorded PAIRING_EXPIRED',
    tooLong.refused === 'bad_request' && s7.refused === 'code_expired'
      && (await sup.query(`select state from factory.pairing_codes where code_id = $1`, [a7.code_id])).rows[0].state === 'PAIRING_EXPIRED', s7.refused);
  // EN11 - 20 per IP per hour; a forged forwarding header does not reset it
  const ipA = '127.0.0.2';
  const used = (await sup.query(`select count(*)::int n from factory.pairing_attempts where peer_ip = $1`, [ipA])).rows[0].n;
  let last = null;
  for (let i = used; i < 20; i++) last = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA });
  const over = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA });
  const forged = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: ipA, extraHeaders: { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7', forwarded: 'for=203.0.113.7' } });
  const otherIp = await enrollStart(node.baseUrl, 'ZZZZZ-ZZZZ-ZZZZ-ZZZZ-Z', ed25519(), {}, { localAddress: '127.0.0.3' });
  row('EN11 the 21st attempt from one address within the hour is refused (rate_limited_ip); forged X-Forwarded-For / X-Real-IP / Forwarded headers do not reset it; another address is unaffected',
    last && last.refused === 'invalid_code' && over.refused === 'rate_limited_ip' && forged.refused === 'rate_limited_ip' && otherIp.refused === 'invalid_code',
    [over.refused, forged.refused, otherIp.refused].join(','));
  // EN13 - two consumes racing
  const a8 = await add('Laptop-8'); const kx = ed25519(), ky = ed25519();
  const sx = await enrollStart(node.baseUrl, a8.pairing_code, kx, {}, { localAddress: '127.0.0.11' });
  const sy = await enrollStart(node.baseUrl, a8.pairing_code, ky, {}, { localAddress: '127.0.0.12' });
  const [cx, cy] = await Promise.all([enrollComplete(node.baseUrl, sx, kx, { localAddress: '127.0.0.11' }), enrollComplete(node.baseUrl, sy, ky, { localAddress: '127.0.0.12' })]);
  const creds8 = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [a8.computer_id])).rows[0].n;
  row('EN13 two installers race to consume one code: exactly one credential is issued; the other gets code_consumed',
    sx.ok && sy.ok && [cx, cy].filter((c) => c.ok).length === 1 && [cx, cy].some((c) => c.refused === 'code_consumed') && creds8 === 1,
    [cx.ok ? 'ok' : cx.refused, cy.ok ? 'ok' : cy.refused].join(','));
  // EN14 - tenant-bound
  const foreign = await admin.call('issue-code', { computer_id: a4.computer_id }, other.token);
  const t2 = await admin.call('add-computer', { display_name: 'T2-box', envelope: ENVELOPE }, other.token);
  const kt = ed25519(); const st2 = await enrollStart(node.baseUrl, t2.pairing_code, kt, {}, { localAddress: '127.0.0.13' });
  const ct2 = await enrollComplete(node.baseUrl, st2, kt, { localAddress: '127.0.0.13' });
  const credT = ct2.ok && (await sup.query(`select tenant_id from factory.node_credentials where credential_id = $1`, [ct2.credential_id])).rows[0].tenant_id;
  row('EN14 tenant-bound: another tenant\'s admin cannot issue a code for this tenant\'s computer (not_found, no leak); a code enrolls into ITS tenant only',
    foreign.refused === 'not_found' && t2.ok && st2.tenant === 'second' && credT === 'b2e0f000-0000-4000-8000-000000000002', foreign.refused);
  // EN18 - a registered key is never registered again
  const a9 = await add('Laptop-9');
  const reuse = await enrollStart(node.baseUrl, a9.pairing_code, k1, {}, { localAddress: '127.0.0.14' });
  row('EN18 enrollment always brings a new key: a key already registered is refused (key_reused)', reuse.refused === 'key_reused', reuse.refused);
  // EN19 - a mistyped character is caught by the check character and still counts as an attempt
  const typo = a9.pairing_code.slice(0, -1) + (a9.pairing_code.endsWith('0') ? '1' : '0');
  const beforeT = (await sup.query(`select count(*)::int n from factory.pairing_attempts where peer_ip = '127.0.0.15'`)).rows[0].n;
  const ty = await enrollStart(node.baseUrl, typo, ed25519(), {}, { localAddress: '127.0.0.15' });
  const afterT = (await sup.query(`select count(*)::int n, max(outcome) o from factory.pairing_attempts where peer_ip = '127.0.0.15'`)).rows[0];
  row('EN19 a mistyped code (check character) is refused as invalid_code and still counted as an attempt (malformed)', ty.refused === 'invalid_code' && afterT.n === beforeT + 1 && afterT.o === 'malformed');

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
  // EN16 - the pepper appears nowhere: not in any row of the plane, not in the Edge source, not in the migration
  const dump = (await sup.query(`select string_agg(t, E'\\n') d from (
      select format('%s', to_jsonb(x)) t from (select c.relname from pg_class c where c.relnamespace = 'factory'::regnamespace and c.relkind = 'r') r,
      lateral (select * from factory.pairing_codes where r.relname = 'pairing_codes') x) y`)).rows[0].d || '';
  const allRows = [];
  for (const t of (await sup.query(`select relname from pg_class where relnamespace = 'factory'::regnamespace and relkind = 'r'`)).rows) {
    allRows.push(JSON.stringify((await sup.query(`select * from factory.${t.relname}`)).rows));
  }
  const allText = allRows.join('\n') + dump + compose();
  const pepperHex = Buffer.from(pepperB64, 'base64').toString('hex');
  const edgeSrc = readdirSync(join(EDGE, '_shared')).map((f) => readFileSync(join(EDGE, '_shared', f), 'utf8')).join('\n');
  row('EN16 no pepper anywhere (every plane row, the migration, the Edge source), and no plain SHA-256 of a code is stored',
    !allText.includes(pepperB64) && !allText.includes(pepperHex) && !edgeSrc.includes(pepperB64) && !allText.includes(plain) && !allText.includes(n1));
  // EN17 - secrets in logs / responses
  const logs = JSON.stringify(node.events) + JSON.stringify(admin.events);
  const list = await admin.call('list-computers', {}, founder.token);
  row('EN17 no code, token or key in the APIs\' logs; a pairing code is returned once (Add Computer), never by a later read',
    !logs.includes(code1.slice(6)) && !JSON.stringify(list).includes(code1.slice(6)) && !JSON.stringify(list).includes(n1) && !logs.includes(ses.session_token || 'x'));

  // EN12 LAST (it exhausts the tenant's hour) - 60 per tenant per hour, unknown locators included
  const cnt = async () => (await sup.query(`select count(*)::int n from factory.pairing_attempts where tenant_id = $1 and at > now() - interval '1 hour'`, [OPERATOR])).rows[0].n;
  let have = await cnt(); let ip = 20, used2 = 0, lastT = null;
  while (have < 60) { lastT = await enrollStart(node.baseUrl, 'YYYYY-YYYY-YYYY-YYYY-Y', ed25519(), {}, { localAddress: '127.0.0.' + ip }); have = await cnt(); if (++used2 % 15 === 0) ip++; }
  const t61 = await enrollStart(node.baseUrl, 'YYYYY-YYYY-YYYY-YYYY-Y', ed25519(), {}, { localAddress: '127.0.0.' + (ip + 1) });
  row('EN12 the 61st attempt for the tenant within the hour is refused (rate_limited_tenant) - unknown locators count, from any address',
    lastT && lastT.refused !== 'rate_limited_tenant' && t61.refused === 'rate_limited_tenant', 'tenant attempts ' + have + ', then ' + t61.refused);
  void postFrom; void other;
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
