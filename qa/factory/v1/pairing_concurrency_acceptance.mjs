#!/usr/bin/env node
// S-6 / AC-8 / contract §9 / AC-4 (R-4) DEVELOPER REHEARSAL: pairing under concurrency, with forced interleavings. A superuser session
// (H) holds one row lock while the calls under test are issued, so every call reaches the point where the order matters, waits there
// (read from pg_stat_activity), and then H lets go:
//   PC1   a burst of starts from ONE peer at 19 attempts in the hour: exactly one is evaluated, the rest rate_limited_ip
//   PC1x  the same burst spread over four tenants (so only the per-peer key can serialize it)
//   PC2   a burst from 8 peers at 59 attempts in one tenant: exactly one is evaluated, the rest rate_limited_tenant
//   PC3   8 completes in one tenant at 59: exactly one credential, the rest rate_limited_tenant
//   PC3b  8 completes from one peer at 19: exactly one credential, the rest rate_limited_ip
//   PC4   a complete against revoke-code, amend, archive, repair and a reissue of its code, both orders; and against the 5th failed
//         start on its code, both orders: no deadlock, one outcome, the loser named and recorded (attempt or audit row)
//   PC5   a complete that began before its code's TTL and waited on the computer row past it is refused code_expired; an
//         uncontended consume is stamped at its own instant, before the TTL
//   PC6   two completes of one code, held and released together: one credential, the other code_consumed, both recorded
//   PC7   a node call that reports a fingerprint for the first time (heartbeat; first register) against archive and revoke-credential
//         on the same computer, both orders: no deadlock
//   PC8   a complete waiting on an admin-held computer row does not delay a start of its tenant: the start is answered meanwhile
//   PC9   the other expiries a front door judges after a lock wait: a session exchange held on its credential past its assertion's
//         end is refused assertion_expired; a node call held on its credential past its session's end is refused session_expired;
//         a start held on its code row past the code's TTL is refused code_expired (each with its uncontended control where it has one)
//   PC10  node_register answers a superuser session, and a node whose session has ended, without waiting on the computer row
// Developer verification, never independent. usage: node qa/factory/v1/pairing_concurrency_acceptance.mjs [--evidence <file>]
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { ROOT, connect } from './plane.mjs';
import { OPERATOR, asEngine, ed25519 } from './fixtures.mjs';
import { apiNode, directNode, enrollStart, enrollComplete, tokenHash } from './nodeclient.mjs';
import { world, recorder, RES } from './flows.mjs';

const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pairing = await import(pathToFileURL(join(ROOT, 'supabase/control-plane/edge/supabase/functions/_shared/pairing.ts')).href);
const ENVELOPE = { roles: ['generic', 'verifier'], capabilities: [], max_concurrent_runs: 2, max_heavy: 1 };
const norm = (display) => pairing.normalizeCode(display).normalized;
const wrongFor = (display, i = 0) => { const good = norm(display); const body = good.slice(0, 5) + ('ABCDEFGHJKMN'.slice(i % 12) + 'ABCDEFGHJKMN').slice(0, 12);
  return body + pairing.ALPHABET[[...body].reduce((s, c, j) => (s + (j + 1) * pairing.ALPHABET.indexOf(c)) % 32, 0)]; };
const unknownCode = () => pairing.generateCode((n) => new Uint8Array(randomBytes(n))).display;
let ipn = 0;
const nextIp = () => { ipn++; return '127.0.' + (100 + Math.floor(ipn / 200)) + '.' + (ipn % 200 + 20); };

const W = await world({ nodePool: 16 });
const { sup, admin, node, plane, founder } = W;
const conns = [];
try {
  const mon = await connect(plane.superUrl); conns.push(mon);
  const mark = async () => (await sup.query('select coalesce(max(attempt_id), 0)::int m from factory.pairing_attempts')).rows[0].m;
  const since = async (m) => (await sup.query(`select attempt_id::int id, tenant_id::text tenant, host(peer_ip) ip, phase, code_id::text code, outcome
      from factory.pairing_attempts where attempt_id > $1 order by attempt_id`, [m])).rows;
  const blockedOn = async (like) => (await mon.query(`select count(*)::int n from pg_stat_activity where wait_event_type = 'Lock' and query like $1`, ['%' + like + '%'])).rows[0].n;
  const waitBlocked = async (like, n = 1, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(40)) if (await blockedOn(like) >= n) return true; return false; };
  // H: a superuser transaction holding one row lock until commit()
  const hold = async (sql, params) => { const h = await connect(plane.superUrl); conns.push(h); await h.query('begin'); await h.query(sql, params);
    return { async commit() { await h.query('commit'); } }; };
  const newTenant = async (name) => { const id = randomUUID(); const p = W.brain.persona('founder');
    await asEngine(sup, async () => { await sup.query('insert into factory.tenants (tenant_id, name) values ($1, $2)', [id, name]);
      await sup.query(`insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'founder')`, [id, p.userId]); });
    return { id, p }; };
  const seed = (tenant, peer, n) => asEngine(sup, () => sup.query(`insert into factory.pairing_attempts (tenant_id, peer_ip, phase, outcome)
      select $1, $2::inet, 'start', 'seeded' from generate_series(1, $3)`, [tenant, peer, n]));
  const addIn = async (t, name, extra = {}) => { const r = await admin.call('add-computer', { display_name: name, envelope: ENVELOPE, ...extra }, t.p.token);
    if (!r.ok) throw new Error('add-computer refused: ' + JSON.stringify(r)); return r; };
  const tally = (arr) => arr.reduce((o, r) => { const k = r.ok ? 'ok' : r.refused; o[k] = (o[k] || 0) + 1; return o; }, {});
  const evaluated = async (where, params) => (await sup.query(`select count(*)::int n from factory.pairing_attempts where ${where} and at > now() - interval '1 hour' and outcome not like 'rate_limited%'`, params)).rows[0].n;
  const op = { id: OPERATOR, p: founder };

  // ---- PC1: one peer, 19 attempts already in the hour, 8 starts (unknown locators) in flight at once
  const P1 = '127.0.0.40';
  await seed(OPERATOR, P1, 19);
  let H = await hold('select 1 from factory.tenants where tenant_id = $1 for update', [OPERATOR]);
  let m = await mark();
  let burst = Array.from({ length: 8 }, () => enrollStart(node.baseUrl, unknownCode(), ed25519(), {}, { localAddress: P1 }));
  let b = await waitBlocked('node_enroll_start', 8);
  await H.commit();
  let res = await Promise.all(burst);
  let rows = await since(m);
  let ev = await evaluated('peer_ip = $1', [P1]);
  row('PC1 a burst of 8 starts from one peer holding 19 attempts in the hour, all in flight at once: exactly one is evaluated (invalid_code) and 7 are rate_limited_ip; the peer\'s evaluated attempts in the hour are exactly 20; 8 rows written',
    b && tally(res).invalid_code === 1 && tally(res).rate_limited_ip === 7 && ev === 20 && rows.length === 8, JSON.stringify({ blocked: b, tally: tally(res), evaluated: ev, rows: rows.length }));

  // ---- PC1x: the same burst from one peer, spread over four tenants (live codes, wrong secrets): only the per-peer key serializes it
  const tx = [await newTenant('pc1x-a'), await newTenant('pc1x-b'), await newTenant('pc1x-c'), await newTenant('pc1x-d')];
  const codesX = [];
  for (const t of tx) for (let i = 0; i < 2; i++) codesX.push(await addIn(t, 'pc1x-' + i));
  const P1x = '127.0.0.41';
  await seed(tx[0].id, P1x, 19);
  const hx = [];
  for (const t of tx) hx.push(await hold('select 1 from factory.tenants where tenant_id = $1 for update', [t.id]));
  m = await mark();
  burst = codesX.map((c) => enrollStart(node.baseUrl, wrongFor(c.pairing_code), ed25519(), {}, { localAddress: P1x }));
  b = await waitBlocked('node_enroll_start', 8);
  for (const h of hx) await h.commit();
  res = await Promise.all(burst);
  ev = await evaluated('peer_ip = $1', [P1x]);
  row('PC1x the same burst from one peer over four tenants (the tenant keys cannot serialize it): exactly one evaluated, 7 rate_limited_ip; the peer\'s evaluated attempts in the hour are exactly 20',
    b && tally(res).invalid_code === 1 && tally(res).rate_limited_ip === 7 && ev === 20, JSON.stringify({ blocked: b, tally: tally(res), evaluated: ev }));

  // ---- PC2: one tenant at 59 attempts, 8 starts from 8 peers (wrong secrets of 8 live codes)
  const t3 = await newTenant('pc2');
  const codes3 = [];
  for (let i = 0; i < 8; i++) codes3.push(await addIn(t3, 'pc2-' + i));
  await seed(t3.id, '127.0.9.9', 59);
  H = await hold('select 1 from factory.tenants where tenant_id = $1 for update', [t3.id]);
  burst = codes3.map((c, i) => enrollStart(node.baseUrl, wrongFor(c.pairing_code), ed25519(), {}, { localAddress: '127.0.0.' + (51 + i) }));
  b = await waitBlocked('node_enroll_start', 8);
  await H.commit();
  res = await Promise.all(burst);
  ev = await evaluated('tenant_id = $1', [t3.id]);
  row('PC2 a burst of 8 starts from 8 peers into one tenant holding 59 attempts in the hour: exactly one is evaluated, 7 are rate_limited_tenant; the tenant\'s evaluated attempts in the hour are exactly 60',
    b && tally(res).invalid_code === 1 && tally(res).rate_limited_tenant === 7 && ev === 60, JSON.stringify({ blocked: b, tally: tally(res), evaluated: ev }));

  // ---- PC3 / PC3b: 8 completes in flight at once, at the tenant cap and at the peer cap
  const completesAtCap = async (label, seedFn, peerOf) => {
    const t = await newTenant(label);
    const started = [];
    for (let i = 0; i < 8; i++) { const c = await addIn(t, label + '-' + i); const k = ed25519(); const s = await enrollStart(node.baseUrl, c.pairing_code, k, {}, { localAddress: nextIp() });
      if (!s.ok) throw new Error(label + ' start refused: ' + JSON.stringify(s)); started.push({ c, k, s }); }
    await seedFn(t);
    const h = await hold('select 1 from factory.tenants where tenant_id = $1 for update', [t.id]);
    const calls = started.map((x, i) => enrollComplete(node.baseUrl, x.s, x.k, { localAddress: peerOf(i) }));
    const bl = await waitBlocked('node_enroll_complete', 8);
    await h.commit();
    const out = await Promise.all(calls);
    const creds = (await sup.query('select count(*)::int n from factory.node_credentials where tenant_id = $1', [t.id])).rows[0].n;
    return { bl, out, creds, t };
  };
  const pc3 = await completesAtCap('pc3', (t) => seed(t.id, '127.0.9.10', 51), (i) => '127.0.0.' + (61 + i));
  row('PC3 8 completes of 8 enrollments in one tenant holding 59 attempts, all in flight at once: exactly one credential is issued, 7 are rate_limited_tenant',
    pc3.bl && tally(pc3.out).ok === 1 && tally(pc3.out).rate_limited_tenant === 7 && pc3.creds === 1, JSON.stringify({ blocked: pc3.bl, tally: tally(pc3.out), creds: pc3.creds }));
  const P3b = '127.0.0.75';
  const pc3b = await completesAtCap('pc3b', () => seed(OPERATOR, P3b, 19), () => P3b);
  row('PC3b 8 completes of 8 enrollments from one peer holding 19 attempts, all in flight at once: exactly one credential is issued, 7 are rate_limited_ip',
    pc3b.bl && tally(pc3b.out).ok === 1 && tally(pc3b.out).rate_limited_ip === 7 && pc3b.creds === 1, JSON.stringify({ blocked: pc3b.bl, tally: tally(pc3b.out), creds: pc3b.creds }));

  // ---- PC4: complete against each admin code action, both orders, H holding the code row so both calls reach it
  const t8 = await newTenant('pc4');
  const FN = { 'revoke-code': 'admin_revoke_code', 'amend-envelope': 'admin_amend_envelope', archive: 'admin_archive', repair: 'admin_repair', 'issue-code': 'admin_issue_code' };
  const bodyFor = (action, x) => (action === 'amend-envelope' ? { computer_id: x.computer_id, expected_version: 1, envelope: { ...ENVELOPE, max_concurrent_runs: 1 } } : { computer_id: x.computer_id });
  const pc4 = [];
  for (const action of Object.keys(FN)) {
    for (const order of ['complete first', 'admin first']) {
      const x = await addIn(t8, 'pc4-' + action + '-' + order.split(' ')[0]);
      const k = ed25519(); const from = nextIp();
      const s = await enrollStart(node.baseUrl, x.pairing_code, k, {}, { localAddress: from });
      const auditBefore = (await sup.query(`select count(*)::int n from factory.audit_events where tenant_id = $1 and target_id = $2 and outcome in ('already', 'refused')`, [t8.id, x.computer_id])).rows[0].n;
      const h = await hold('select 1 from factory.pairing_codes where code_id = $1 for update', [x.code_id]);
      m = await mark();
      let pa, pc, b1, b2;
      if (order === 'complete first') { pc = enrollComplete(node.baseUrl, s, k, { localAddress: from }); b1 = await waitBlocked('node_enroll_complete'); pa = admin.call(action, bodyFor(action, x), t8.p.token); b2 = await waitBlocked(FN[action]); }
      else { pa = admin.call(action, bodyFor(action, x), t8.p.token); b1 = await waitBlocked(FN[action]); pc = enrollComplete(node.baseUrl, s, k, { localAddress: from }); b2 = await waitBlocked('node_enroll_complete'); }
      await h.commit();
      const [ra, rc] = await Promise.all([pa, pc]);
      const att = await since(m);
      const st = (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code, (select count(*)::int from factory.node_credentials where computer_id = $2) creds,
          (select count(*)::int from factory.audit_events where tenant_id = $3 and target_id = $2::text and outcome in ('already', 'refused')) audits`, [x.code_id, x.computer_id, t8.id])).rows[0];
      const noError = ![ra, rc].some((r) => r.http >= 500 || r.refused === 'server_refused');
      let ok;
      if (order === 'complete first') {
        // the loser's named answer: revoke-code "already" (an idempotent answer writes nothing, AC-4); issue-code refused principal_enrolled,
        // which (a refusal) is audited
        const loserAudited = action === 'revoke-code' ? ra.already === true && st.audits === auditBefore : action === 'issue-code' ? ra.refused === 'principal_enrolled' && st.audits === auditBefore + 1 : ra.ok;
        ok = rc.ok && st.code === 'PAIRING_CONSUMED' && st.creds === 1 && loserAudited && att.some((a) => a.phase === 'complete' && a.outcome === 'ok' && a.code === x.code_id);
      } else {
        ok = ra.ok && rc.refused === 'code_revoked' && st.code === 'PAIRING_REVOKED' && st.creds === 0 && att.some((a) => a.phase === 'complete' && a.outcome === 'enrollment_pairing_revoked' && a.code === x.code_id);
      }
      pc4.push({ action, order, ok: s.ok && b1 && b2 && noError && ok, got: { b1, b2, admin: ra.ok ? (ra.already ? 'already' : 'ok') : ra.refused + ':' + ra.http, complete: rc.ok ? 'ok' : rc.refused + ':' + rc.http, st, att: att.map((a) => a.phase + ':' + a.outcome) } });
    }
  }
  // the 5th failed start against a complete of the same code, both orders
  for (const order of ['complete first', 'start first']) {
    const x = await addIn(t8, 'pc4s-' + order.split(' ')[0]);
    const k = ed25519(); const from = nextIp(); const bad = nextIp();
    const s = await enrollStart(node.baseUrl, x.pairing_code, k, {}, { localAddress: from });
    for (let i = 0; i < 4; i++) await enrollStart(node.baseUrl, wrongFor(x.pairing_code, i), ed25519(), {}, { localAddress: bad });
    const h = await hold('select 1 from factory.pairing_codes where code_id = $1 for update', [x.code_id]);
    let pa, pc, b1, b2;
    if (order === 'complete first') { pc = enrollComplete(node.baseUrl, s, k, { localAddress: from }); b1 = await waitBlocked('node_enroll_complete'); pa = enrollStart(node.baseUrl, wrongFor(x.pairing_code, 5), ed25519(), {}, { localAddress: bad }); b2 = await waitBlocked('node_enroll_start'); }
    else { pa = enrollStart(node.baseUrl, wrongFor(x.pairing_code, 5), ed25519(), {}, { localAddress: bad }); b1 = await waitBlocked('node_enroll_start'); pc = enrollComplete(node.baseUrl, s, k, { localAddress: from }); b2 = await waitBlocked('node_enroll_complete'); }
    await h.commit();
    const [ra, rc] = await Promise.all([pa, pc]);
    const st = (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code, (select count(*)::int from factory.node_credentials where computer_id = $2) creds`, [x.code_id, x.computer_id])).rows[0];
    const noError = ![ra, rc].some((r) => r.http >= 500);
    const ok = order === 'complete first' ? rc.ok && ra.refused === 'invalid_code' && st.code === 'PAIRING_CONSUMED' && st.creds === 1
      : ra.refused === 'invalid_code' && rc.refused === 'code_revoked' && st.code === 'PAIRING_REVOKED' && st.creds === 0;
    pc4.push({ action: '5th failed start', order, ok: s.ok && b1 && b2 && noError && ok, got: { b1, b2, start: ra.refused, complete: rc.ok ? 'ok' : rc.refused + ':' + rc.http, st } });
  }
  row('PC4 a complete racing revoke-code, amend-envelope, archive, repair, a reissue of its code, and the 5th failed start on its code, each in both orders (forced): no deadlock and no unnamed error; exactly one outcome (a credential, or the code revoked with none); the loser named - revoke-code "already" (writing nothing, AC-4), issue-code principal_enrolled (audited), the complete\'s code_revoked (its attempt row)',
    pc4.every((x) => x.ok), JSON.stringify(pc4.filter((x) => !x.ok)).slice(0, 2500));

  // ---- PC6: two completes of one code, held on the computer row and released together
  const t9 = await newTenant('pc5');
  const x6 = await addIn(t9, 'pc6');
  const ka = ed25519(), kb = ed25519(); const fa = nextIp(), fb = nextIp();
  const sa = await enrollStart(node.baseUrl, x6.pairing_code, ka, {}, { localAddress: fa });
  const sb = await enrollStart(node.baseUrl, x6.pairing_code, kb, {}, { localAddress: fb });
  H = await hold('select 1 from factory.computers where computer_id = $1 for update', [x6.computer_id]);
  m = await mark();
  const both = [enrollComplete(node.baseUrl, sa, ka, { localAddress: fa }), enrollComplete(node.baseUrl, sb, kb, { localAddress: fb })];
  b = await waitBlocked('node_enroll_complete', 2);
  await H.commit();
  res = await Promise.all(both);
  rows = await since(m);
  const creds6 = (await sup.query('select count(*)::int n from factory.node_credentials where computer_id = $1', [x6.computer_id])).rows[0].n;
  row('PC6 two completes of one code, forced to wait together and released together: exactly one credential; the other is refused code_consumed; both are recorded (ok, code_consumed)',
    sa.ok && sb.ok && b && tally(res).ok === 1 && tally(res).code_consumed === 1 && creds6 === 1 && rows.map((r) => r.outcome).sort().join(',') === 'code_consumed,ok',
    JSON.stringify({ blocked: b, tally: tally(res), creds6, rows: rows.map((r) => r.outcome) }));

  // ---- PC5: expiry judged at the server's clock after the lock wait; and the uncontended consume's own instant
  const x5 = await addIn(t9, 'pc5', { ttl_seconds: 60 });
  const k5 = ed25519(); const f5 = nextIp();
  const s5 = await enrollStart(node.baseUrl, x5.pairing_code, k5, {}, { localAddress: f5 });
  const exp = new Date((await sup.query('select expires_at from factory.pairing_codes where code_id = $1', [x5.code_id])).rows[0].expires_at).getTime();
  const xc = await addIn(t9, 'pc5-control'); const kc = ed25519(); const fc = nextIp();
  const sc = await enrollStart(node.baseUrl, xc.pairing_code, kc, {}, { localAddress: fc });
  const t0 = Date.now(); const cc = await enrollComplete(node.baseUrl, sc, kc, { localAddress: fc }); const t1 = Date.now();
  const ctl = (await sup.query('select consumed_at, expires_at from factory.pairing_codes where code_id = $1', [xc.code_id])).rows[0];
  await sleep(Math.max(0, exp - 2500 - Date.now()));
  H = await hold('select 1 from factory.computers where computer_id = $1 for update', [x5.computer_id]);
  m = await mark();
  const p5 = enrollComplete(node.baseUrl, s5, k5, { localAddress: f5 });
  b = await waitBlocked('node_enroll_complete');
  const before = Date.now() < exp;
  await sleep(Math.max(0, exp + 1000 - Date.now()));
  await H.commit();
  const r5 = await p5;
  rows = await since(m);
  const st5 = (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code, (select count(*)::int from factory.node_credentials where enrollment_id = $2) creds`, [x5.code_id, s5.enrollment_id])).rows[0];
  const consumedAt = new Date(ctl.consumed_at).getTime();
  row('PC5 a complete that began before its code\'s TTL and was held on the computer row until after it is refused code_expired: no credential, the code PAIRING_EXPIRED, one code_expired attempt; an uncontended consume is stamped at its own instant (inside the call, before the TTL)',
    s5.ok && b && before && r5.refused === 'code_expired' && st5.creds === 0 && st5.code === 'PAIRING_EXPIRED' && rows.length === 1 && rows[0].outcome === 'code_expired'
      && cc.ok && consumedAt >= t0 - 1000 && consumedAt <= t1 + 1000 && consumedAt < new Date(ctl.expires_at).getTime(),
    JSON.stringify({ blocked: b, before, r5: r5.refused || r5.ok, st5, rows: rows.map((r) => r.outcome), control: { ok: cc.ok, consumedInCall: consumedAt >= t0 - 1000 && consumedAt <= t1 + 1000 } }));

  // ---- PC7: a node call that records a fingerprint against archive / revoke-credential on the same computer, both orders
  const t10 = await newTenant('pc7');
  // the tenant's own published release, with the digest the world's nodes report (a registration is judged on its tenant's releases)
  await asEngine(sup, () => sup.query(`insert into factory.releases (release_id, tenant_id, channel, version, source_sha, digest, key_id, signature, receipt_sha256, manifest, published_by)
      select gen_random_uuid(), $1, r.channel, r.version, r.source_sha, r.digest, r.key_id, r.signature, r.receipt_sha256, r.manifest, r.published_by
        from factory.releases r where r.release_id = $2`, [t10.id, W.rel.releaseId]));
  const pc7 = [];
  for (const kind of ['heartbeat', 'register']) {
    for (const action of ['archive', 'revoke-credential']) {
      for (const order of ['node first', 'admin first']) {
        let X, call, like;
        const fp = randomBytes(32).toString('hex');
        if (kind === 'heartbeat') {
          X = await W.enroll('pc7-hb', undefined, { as: t10.p, fingerprint: false });   // its registration reported no fingerprint
          call = () => X.n.op('heartbeat', { phase: 'AVAILABLE', fingerprint: fp, resources: RES() }); like = 'node_heartbeat';
        } else {
          const add = await addIn(t10, 'pc7-reg'); const k = ed25519(); const from = nextIp();
          const s = await enrollStart(node.baseUrl, add.pairing_code, k, {}, { localAddress: from });
          const c = await enrollComplete(node.baseUrl, s, k, { localAddress: from });
          const n = apiNode(node.baseUrl, k); await n.session(); await n.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
          X = { computer_id: add.computer_id, credential_id: c.credential_id, n };
          call = () => n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: fp, hostname: 'pc7', os: 'Windows' }); like = 'node_register';
        }
        const h = await hold('select 1 from factory.computers where computer_id = $1 for update', [X.computer_id]);
        const adminFn = action === 'archive' ? 'admin_archive' : 'admin_revoke_credential';
        let pn, pa, b1, b2;
        if (order === 'node first') { pn = call(); b1 = await waitBlocked(like); pa = admin.call(action, { computer_id: X.computer_id }, t10.p.token); b2 = await waitBlocked(adminFn); }
        else { pa = admin.call(action, { computer_id: X.computer_id }, t10.p.token); b1 = await waitBlocked(adminFn); pn = call(); b2 = await waitBlocked(like); }
        await h.commit();
        const [rn, ra] = await Promise.all([pn, pa]);
        const credState = (await sup.query('select status from factory.node_credentials where credential_id = $1', [X.credential_id])).rows[0].status;
        const named = rn.ok || ['credential_revoked', 'computer_archived'].includes(rn.refused);
        pc7.push({ kind, action, order, ok: b1 && b2 && ra.ok && named && credState === 'revoked' && ![rn, ra].some((r) => r.http >= 500),
          got: { b1, b2, node: rn.ok ? 'ok' : rn.refused + ':' + rn.http + ':' + String(rn.message || '').slice(0, 60), admin: ra.ok ? 'ok' : ra.refused + ':' + ra.http, credState } });
      }
    }
  }
  row('PC7 a node call recording a fingerprint for the first time (a heartbeat after a registration that reported none; a first registration) against archive and against revoke-credential of the same computer, each in both orders (forced): no deadlock, no unnamed error; the admin action commits and the node call is served or refused by name',
    pc7.every((x) => x.ok), JSON.stringify(pc7.filter((x) => !x.ok)).slice(0, 2500));

  // ---- PC8: an admin action holds a computer row (H stands for it) and a complete of that computer waits; a start in the same tenant
  // is answered at once
  const x8 = await addIn(op, 'pc8'); const k8 = ed25519(); const f8 = nextIp();
  const s8 = await enrollStart(node.baseUrl, x8.pairing_code, k8, {}, { localAddress: f8 });
  H = await hold('select 1 from factory.computers where computer_id = $1 for update', [x8.computer_id]);
  const p8 = enrollComplete(node.baseUrl, s8, k8, { localAddress: f8 });
  b = await waitBlocked('node_enroll_complete');
  m = await mark();
  const startP = enrollStart(node.baseUrl, unknownCode(), ed25519(), {}, { localAddress: nextIp() });
  const first = await Promise.race([startP.then(() => 'answered'), sleep(4000).then(() => 'held up')]);
  const heldRows = (await since(m)).length;
  await H.commit();
  const [u8, c8] = await Promise.all([startP, p8]);
  row('PC8 while a complete waits on a computer row an admin action holds, a start in the same tenant is answered at once (invalid_code, recorded) - the S-6 keys are taken after the row locks, never held across a row wait',
    s8.ok && b && first === 'answered' && heldRows === 1 && u8.refused === 'invalid_code' && c8.ok, JSON.stringify({ blocked: b, first, heldRows, start: u8.refused, complete: c8.ok || c8.refused }));

  // ---- PC9: each expiry judged at the server's clock read after the call's lock wait (the siblings of PC5). H holds the row the call
  // locks first; the call starts before the expiry, H lets go after it.
  // (c)'s code is issued first, with the shortest TTL (60 s; a code's expiry never changes after issue), so (a) and (b) run inside it
  const x9 = await addIn(t10, 'pc9-start', { ttl_seconds: 60 });
  const end9c = new Date((await sup.query('select expires_at from factory.pairing_codes where code_id = $1', [x9.code_id])).rows[0].expires_at).getTime();
  const X9 = await W.enroll('pc9', undefined, { as: t10.p });
  const d9 = await directNode(plane.nodeApiUrl, X9.identity); conns.push(d9.client);
  const credRows = async () => (await sup.query(`select (select count(*)::int from factory.node_sessions where credential_id = $1) s,
      (select count(*)::int from factory.node_assertion_jtis where credential_id = $1) j`, [X9.credential_id])).rows[0];
  // (a) the session exchange: an assertion living 3 s; uncontended it opens a session (the control)
  let nowS = Math.floor(Date.now() / 1000);
  const ctl9 = await d9.session({ iat: nowS, exp: nowS + 3 });
  const q0 = await credRows();
  nowS = Math.floor(Date.now() / 1000);
  const exp9 = (nowS + 3) * 1000;
  H = await hold('select 1 from factory.node_credentials where credential_id = $1 for update', [X9.credential_id]);
  const p9a = d9.session({ iat: nowS, exp: nowS + 3 });
  const b9a = await waitBlocked('node_session_open');
  const before9a = Date.now() < exp9;
  await sleep(Math.max(0, exp9 + 1000 - Date.now()));
  await H.commit();
  const r9a = await p9a;
  const q1 = await credRows();
  // (b) a node call: the session the control opened is made to end 3 s from now (planted as the engine); a heartbeat held on the
  // credential past that is refused, and writes nothing
  const end9 = new Date((await asEngine(sup, () => sup.query(`update factory.node_sessions set expires_at = clock_timestamp() + interval '3 seconds'
      where token_hash = $1 returning expires_at`, [tokenHash(d9.token)]))).rows[0].expires_at).getTime();
  const beatAt = async () => new Date((await sup.query('select last_heartbeat_at from factory.nodes where node_id = $1', [X9.node_id])).rows[0].last_heartbeat_at).getTime();
  const hb0 = await beatAt();
  H = await hold('select 1 from factory.node_credentials where credential_id = $1 for update', [X9.credential_id]);
  const p9b = d9.op('heartbeat', { phase: 'AVAILABLE', resources: RES() });
  const b9b = await waitBlocked('node_heartbeat');
  const before9b = Date.now() < end9;
  await sleep(Math.max(0, end9 + 1000 - Date.now()));
  await H.commit();
  const r9b = await p9b;
  const hb1 = await beatAt();
  // (c) enroll/start: the start begins shortly before the code's TTL ends, held on the code row until after it
  const k9 = ed25519(); const f9 = nextIp();
  await sleep(Math.max(0, end9c - 2500 - Date.now()));
  H = await hold('select 1 from factory.pairing_codes where code_id = $1 for update', [x9.code_id]);
  m = await mark();
  const p9c = enrollStart(node.baseUrl, x9.pairing_code, k9, {}, { localAddress: f9 });
  const b9c = await waitBlocked('node_enroll_start');
  const before9c = Date.now() < end9c;
  await sleep(Math.max(0, end9c + 1000 - Date.now()));
  await H.commit();
  const r9c = await p9c;
  rows = await since(m);
  const st9c = (await sup.query(`select (select state from factory.pairing_codes where code_id = $1) code, (select count(*)::int from factory.enrollments where code_id = $1) enr`, [x9.code_id])).rows[0];
  row('PC9 held on its lock past an expiry, each call is refused at the server\'s clock after the wait: a session exchange whose 3 s assertion ended while it waited on the credential is assertion_expired (no session, no jti; uncontended the same assertion shape opens one); a heartbeat whose session ended while it waited is session_expired (nothing written); a start whose code\'s TTL ended while it waited on the code row is code_expired (the code PAIRING_EXPIRED, no enrollment, one attempt row)',
    ctl9.ok && b9a && before9a && r9a.refused === 'assertion_expired' && q1.s === q0.s && q1.j === q0.j
      && b9b && before9b && r9b.refused === 'session_expired' && hb1 === hb0
      && b9c && before9c && r9c.refused === 'code_expired' && st9c.code === 'PAIRING_EXPIRED' && st9c.enr === 0 && rows.length === 1 && rows[0].outcome === 'code_expired',
    JSON.stringify({ session: { control: ctl9.ok, blocked: b9a, before: before9a, got: r9a.refused || r9a.ok, q0, q1 }, call: { blocked: b9b, before: before9b, got: r9b.refused || r9b.ok, unchanged: hb1 === hb0 },
      start: { blocked: b9c, before: before9c, got: r9c.refused || r9c.ok, st9c, rows: rows.map((r) => r.outcome) } }));

  // ---- PC10: node_register refuses a superuser session, and a node whose session has ended, before it locks any row: with the
  // computer row held (H), both are answered at once (a wait there would end in 55P03 after the 15 s lock timeout)
  const x10 = await addIn(t10, 'pc10'); const k10 = ed25519(); const f10 = nextIp();
  const s10 = await enrollStart(node.baseUrl, x10.pairing_code, k10, {}, { localAddress: f10 });
  const c10 = await enrollComplete(node.baseUrl, s10, k10, { localAddress: f10 });
  const d10 = await directNode(plane.nodeApiUrl, k10); conns.push(d10.client);
  const o10 = await d10.session();
  await d10.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
  const live10 = tokenHash(d10.token);
  const su = await connect(plane.superUrl); conns.push(su);
  H = await hold('select 1 from factory.computers where computer_id = $1 for update', [x10.computer_id]);
  let ta = Date.now(); let suGot;
  try { await su.query(`select factory.node_register($1::bytea, '{}'::jsonb) r`, [live10]); suGot = 'ANSWERED'; }
  catch (e) { suGot = e.code === '42501' && /^factory_superuser_refused/.test(e.message) ? 'refused' : 'ERROR ' + e.code; }
  const suMs = Date.now() - ta;
  await asEngine(sup, () => sup.query(`update factory.node_sessions set expires_at = issued_at + interval '1 microsecond' where token_hash = $1`, [live10]));
  ta = Date.now();
  const r10 = await d10.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, fingerprint: randomBytes(32).toString('hex'), hostname: 'pc10', os: 'Windows' });
  const endedMs = Date.now() - ta;
  await H.commit();
  row('PC10 while an admin action holds a computer row, node_register presented that computer\'s live session by a superuser is refused 42501 at once, and presented by the node after its session ended is refused session_expired at once - neither waits on the row',
    s10.ok && c10.ok && o10.ok && suGot === 'refused' && suMs < 5000 && r10.refused === 'session_expired' && endedMs < 5000,
    JSON.stringify({ superuser: [suGot, suMs], ended: [r10.refused || r10.ok, r10.code, endedMs] }));
} catch (e) {
  row('X0 pairing_concurrency_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  for (const c of conns) await c.end().catch(() => {});
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\npairing_concurrency_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev2 = process.argv.indexOf('--evidence');
if (ev2 > 0) writeFileSync(process.argv[ev2 + 1], ['qa/factory/v1/pairing_concurrency_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
