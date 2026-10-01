// SQL ACCEPTANCE for the relay's database half, on a disposable plane (test/plane.mjs). It calls the one entry function exactly as
// the Edge Function does (the API's authenticator switched to service_role), and it tries every other role on every other path.
//   RELAY_TEST_MODULES=<node_modules> node test/sql_acceptance.mjs
import { createHash, randomBytes, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPlane, FINGERPRINT, BUCKET, ROOT, reporter } from './plane.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const newKey = () => generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x;
const newNode = () => 'node-' + [4, 2, 2, 2, 6].map((n) => randomBytes(n).toString('hex')).join('-');
const CAND = 'c667367b6d0fcf02a4d575f050aaa475c644ca7b';
const FP = 'SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** the key each node of the current run is registered with (a node not in it gets a key of its own) */
const KEYS = new Map();
/** one authenticated request, as the Edge Function hands it to the database after it verified the signature with that key */
const mk = (node, op, payload = {}, over = {}) => {
  const body = JSON.stringify({ op, payload });
  if (!KEYS.has(node)) KEYS.set(node, newKey());
  return { fn: 'begin', node_id: node, public_key: KEYS.get(node), op, payload, ts: Date.now(), nonce: randomBytes(16).toString('hex'), body_sha256: sha256(body),
    signature: randomBytes(64).toString('base64url'), body, ...over };
};
const declared = (name, tag = randomBytes(6).toString('hex')) => [
  { kind: 'archive', name, size: 15807, sha256: sha256('a' + tag) },
  { kind: 'sha256', name: name + '.sha256', size: 97, sha256: sha256('h' + tag) },
  { kind: 'signature', name: name + '.sha256.sig', size: 294, sha256: sha256('s' + tag) },
];

export async function resetPlane(plane) {
  await plane.su.query('drop function if exists public.factory_relay_rpc(jsonb)');
  await plane.su.query('drop schema if exists factory_relay cascade');
  await plane.su.query('drop policy if exists relay_test_open on storage.objects');
  await plane.su.query('alter table storage.objects enable row level security');
  await plane.su.query('delete from storage.objects');
  await plane.su.query('delete from storage.buckets where id = $1', [BUCKET]);
  await plane.su.query('delete from factory.nodes');
}

/** runs every row against the given install text; returns [{ id, label, ok, detail }] and leaves the plane as it found it */
export async function runSuite(plane, { install = readFileSync(join(ROOT, 'sql/001_artifact_relay_v0.sql'), 'utf8') } = {}) {
  const rows = [];
  const row = (label, cond, detail = '') => rows.push({ id: label.split(' ')[0], label, ok: !!cond, detail: String(detail ?? '') });
  const opened = [];
  const open = async (role) => { const c = await (role === 'factory_runner' ? plane.runner() : plane.api(role)); opened.push(c); return c; };
  const call = async (client, req) => (await client.query('select public.factory_relay_rpc($1::jsonb) as r', [JSON.stringify(req)])).rows[0].r;
  const denied = async (client, sql, params) => { try { await client.query(sql, params); return null; } catch (e) { return String(e.code) + ' ' + e.message; } };
  const fingerprint = async () => (await plane.su.query(FINGERPRINT)).rows[0].f;
  const one = async (sql, params) => (await plane.su.query(sql, params)).rows[0];
  const section = async (id, fn) => { try { await fn(); } catch (e) { row(id + ' section ran to its end', false, e.message); } };

  await resetPlane(plane);
  const W = newNode(), H = newNode(), H2 = newNode(), X = newNode();
  const WK = newKey(), HK = newKey(), H2K = newKey();
  KEYS.clear(); KEYS.set(W, WK); KEYS.set(H, HK); KEYS.set(H2, H2K);
  for (const [id, role] of [[W, 'implementer'], [H, 'verifier'], [H2, 'verifier']]) {
    await plane.su.query('insert into factory.nodes (node_id, security_role, platform) values ($1, $2, $3)', [id, role, 'win32']);
  }
  const fp0 = await fingerprint();

  // the two read-only checks the founder runs: each returns its lines, then a listing
  const lines = async (file) => {
    const out = await plane.owner.query(readFileSync(join(ROOT, file), 'utf8'));
    if (Array.isArray(out)) throw new Error(file + ' is more than one statement: an editor would show only its last result');
    const listed = (r) => /^(factory node|registered) /.test(r.line);
    const checks = out.rows.filter((r) => !listed(r));
    return { checks, listing: out.rows.filter(listed), bad: checks.filter((r) => r.result !== 'ok').map((r) => r.line + ': ' + r.result) };
  };
  /** the registration statement of sql/010, with its four placeholders filled */
  const registration = (work, workKey, home_, homeKey) => readFileSync(join(ROOT, 'sql/010_register_nodes.template.sql'), 'utf8')
    .replace('<WORK NODE ID>', work).replace('<WORK RELAY PUBLIC KEY>', workKey).replace('<HOME NODE ID>', home_).replace('<HOME RELAY PUBLIC KEY>', homeKey);

  // ------------------------------------------------------------------------------------------------------------------ install
  await section('S32', async () => {
    const pre = await lines('sql/000_precheck.sql');
    await plane.su.query(`create policy relay_test_open on storage.objects for select to authenticated using (true)`);
    const withPolicy = await lines('sql/000_precheck.sql');
    await plane.su.query('drop policy relay_test_open on storage.objects');
    row('S32 the pre-check is one statement: eight lines that are all ok on a plane that is ready, then the Factory nodes; it names what is not ready and changes nothing',
      pre.checks.length === 8 && pre.bad.length === 0 && pre.listing.length === 3 && pre.listing.some((r) => r.line === 'factory node ' + W && /security_role=implementer, platform=win32/.test(r.result))
      && withPolicy.bad.length === 1 && /no policy opens storage.objects: NOT OK/.test(withPolicy.bad[0]) && JSON.stringify(await fingerprint()) === JSON.stringify(fp0), pre.bad.join(' | '));
  });
  await section('S00', async () => {
    await plane.su.query('revoke select on storage.buckets from postgres');
    const e = await denied(plane.owner, install);
    try { await plane.owner.query('rollback'); } catch { /* no transaction */ }
    await plane.su.query('grant select on storage.buckets to postgres');
    const gone = (await one(`select pg_catalog.to_regnamespace('factory_relay') is null as gone`)).gone;
    row('S00 where the owner cannot read storage.buckets the install refuses and changes nothing',
      e !== null && /cannot read storage.buckets/.test(e) && gone && JSON.stringify(await fingerprint()) === JSON.stringify(fp0), e ?? 'installed');
  });
  let installed = false;
  await section('S01', async () => {
    const e = await denied(plane.owner, install);
    installed = e === null;
    row('S01 the install applies as the database owner, which is not a superuser', installed, e ?? '');
  });
  if (!installed) { try { await plane.owner.query('rollback'); } catch { /* no transaction */ } await resetPlane(plane); return rows; }

  const api = await open('service_role'), anon = await open('anon'), authed = await open('authenticated'), runner = await open('factory_runner');

  await section('S02', async () => {
    const fp1 = await fingerprint();
    const added = (fp1.functions ?? []).filter((f) => !(fp0.functions ?? []).includes(f));
    const same = Object.keys(fp0).filter((k) => k !== 'functions').every((k) => JSON.stringify(fp0[k]) === JSON.stringify(fp1[k]));
    row('S02 outside its own schema the install adds exactly one function and changes nothing else',
      same && added.length === 1 && added[0] === 'public.factory_relay_rpc:{postgres=X/postgres,service_role=X/postgres}', JSON.stringify(added));
    const e = await denied(plane.owner, install);
    try { await plane.owner.query('rollback'); } catch { /* no transaction */ }
    row('S03 a second install is refused and changes nothing',
      e !== null && /already exists - nothing was changed/.test(e) && JSON.stringify(await fingerprint()) === JSON.stringify(fp1), e ?? 'applied twice');
  });

  await section('S04', async () => {
    const tries = [];
    for (const [name, c] of [['anon', anon], ['authenticated', authed], ['factory_runner', runner]]) {
      tries.push([name + ' rpc', await denied(c, `select public.factory_relay_rpc('{}'::jsonb)`)]);
      tries.push([name + ' entry', await denied(c, `select factory_relay.rpc('{}'::jsonb)`)]);
      tries.push([name + ' receipts', await denied(c, 'select * from factory_relay.receipts')]);
      tries.push([name + ' nodes', await denied(c, 'select * from factory_relay.nodes')]);
    }
    const open_ = tries.filter(([, e]) => e === null || !e.startsWith('42501'));
    row('S04a anon, authenticated and factory_runner can neither call the relay nor read its tables', open_.length === 0, open_.map(([n]) => n).join(', '));
    const svc = [];
    for (const sql of ['select * from factory_relay.receipts', 'select * from factory_relay.nodes', 'select * from factory_relay.artifacts',
      `select factory_relay._begin('{}'::jsonb)`, `select factory_relay._finish('{}'::jsonb)`, `select factory_relay._purged('{}'::jsonb)`,
      `select factory_relay.register_node('${X}', 'verifier', '${newKey()}', 'x')`, `select factory_relay.deactivate_node('${W}')`,
      `select factory_relay.preserve('00000000-0000-0000-0000-000000000000', true)`,
      `insert into factory_relay.nodes (public_key, node_id, relay_role, label) values ('${newKey()}', '${X}', 'verifier', 'x')`,
      'delete from factory_relay.requests', `create table factory_relay.t (i int)`]) {
      const e = await denied(api, sql); if (e === null || !e.startsWith('42501')) svc.push(sql.slice(0, 40));
    }
    const r = await call(api, {});
    row('S04b service_role can call the one entry function and nothing else in the relay', svc.length === 0 && r.ok === false && r.refused === 'bad_request', svc.join(' | '));
    const rls = await one(`select count(*) filter (where c.relrowsecurity) as on_, count(*) as n,
        (select count(*) from pg_policy p join pg_class k on k.oid = p.polrelid where k.relnamespace = 'factory_relay'::regnamespace) as pol
      from pg_class c where c.relnamespace = 'factory_relay'::regnamespace and c.relkind = 'r'`);
    row('S05 every relay table has row level security on and no policy', rls.n === '5' && rls.on_ === '5' && rls.pol === '0', JSON.stringify(rls));
  });

  await section('S35', async () => {
    const o = (await plane.owner.query(`select now() = 'epoch'::timestamptz as moved, 'x' ~ 'y' as accepts, length('abc') as len`)).rows[0];
    const a = (await api.query(`select now() = 'epoch'::timestamptz as moved, 'x' ~ 'y' as accepts`)).rows[0];
    row('S35 this plane is hostile about names: for the owner login and the API login, an unqualified now(), length() or ~ resolves to a decoy ahead of pg_catalog',
      o.moved === true && o.accepts === true && o.len === 0 && a.moved === true && a.accepts === true, JSON.stringify(o));
  });

  // ------------------------------------------------------------------------------------------------- registration and the bucket
  await section('S34', async () => {
    const e = await denied(plane.owner, registration(W, WK, H, 'not-a-key'));
    const none = await one('select count(*) as n from factory_relay.nodes');
    const e2 = await denied(plane.owner, registration(W, WK, X, HK));
    const none2 = await one('select count(*) as n from factory_relay.nodes');
    row('S34 the registration statement registers both nodes or neither',
      e !== null && e.startsWith('23514') && none.n === '0' && e2 !== null && /is not a node of this Factory plane/.test(e2) && none2.n === '0', (e ?? 'ACCEPTED').slice(0, 60) + ' / ' + none.n + none2.n);
  });
  await section('S09', async () => {
    const e1 = await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [X, 'sender', newKey(), 'not a Factory node']);
    const ok = (await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4) as r', [W, 'sender', WK, 'Work'])).rows[0].r;
    row('S09 only a node of the Factory plane can be registered, and the founder sees what the Factory records about it',
      e1 !== null && /is not a node of this Factory plane/.test(e1) && ok === W + ' registered as sender (factory.nodes: security_role=implementer, platform=win32)', ok);
    const dup = [await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [H, 'sender', newKey(), 'second sender']),
      await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [H, 'verifier', WK, 'reused key']),
      await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [W, 'verifier', newKey(), 'both roles']),
      await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [H, 'verifier', 'short', 'bad key']),
      await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [H, 'director', newKey(), 'bad role'])];
    const early = await lines('sql/003_postcheck.sql');
    row('S33a the post-check names what is still missing: the bucket and the second registration',
      early.checks.length === 7 && early.bad.length === 2 && early.bad.some((b) => /bucket_missing/.test(b)) && early.bad.some((b) => /exactly one sender and one verifier/.test(b))
      && early.listing.length === 1 && early.listing[0].line === 'registered sender ' + W && early.listing[0].result.includes(WK), early.bad.join(' | '));
    row('S10 one active node per role, one registration per node, one node per key, and only well-formed keys and roles',
      dup.every((e) => e !== null && /^(23505|23514)/.test(e)), dup.map((e) => (e ?? 'ACCEPTED').slice(0, 5)).join(' '));
  });

  await section('S06', async () => {
    const missing = await call(api, mk(W, 'selfcheck'));
    const stranger = await call(api, mk(X, 'selfcheck'));
    const followUps = [await call(api, { fn: 'finish', request_id: '00000000-0000-4000-8000-000000000000', outcome: 'stored' }), await call(api, { fn: 'purged', artifact_ids: [] })];
    row('S06 with no bucket every operation is refused, and only a registered node is told why',
      missing.refused === 'bucket_missing' && missing.status === 503 && stranger.refused === 'not_authenticated' && stranger.status === 401
      && followUps.every((r) => r.refused === 'bucket_missing') && (await call(api, { fn: 'node_key', node_id: W })).refused === 'bad_request', JSON.stringify(missing) + ' ' + stranger.refused);
    const e = await denied(plane.owner, readFileSync(join(ROOT, 'sql/002_private_bucket.sql'), 'utf8'));
    const b = await one('select public, file_size_limit from storage.buckets where id = $1', [BUCKET]);
    const again = await denied(plane.owner, readFileSync(join(ROOT, 'sql/002_private_bucket.sql'), 'utf8'));
    try { await plane.owner.query('rollback'); } catch { /* no transaction */ }
    row('S31 the bucket file makes one private bucket, once', e === null && b?.public === false && b.file_size_limit === '2097152' && again !== null && again.startsWith('23505'), e ?? again ?? '');
    const ok1 = await call(api, mk(W, 'selfcheck'));
    await plane.su.query('update storage.buckets set public = true where id = $1', [BUCKET]);
    const pub = await call(api, mk(W, 'selfcheck'));
    await plane.su.query('update storage.buckets set public = false where id = $1', [BUCKET]);
    row('S07 a public bucket stops the relay', ok1.ok === true && ok1.bucket === 'private' && pub.refused === 'bucket_not_private' && pub.status === 503, JSON.stringify(pub));
    await plane.su.query(`create policy relay_test_open on storage.objects for select to authenticated using (true)`);
    const pol = await call(api, mk(W, 'selfcheck'));
    await plane.su.query('drop policy relay_test_open on storage.objects');
    await plane.su.query('alter table storage.objects disable row level security');
    const off = await call(api, mk(W, 'selfcheck'));
    await plane.su.query('alter table storage.objects enable row level security');
    row('S08 a policy on storage.objects, or row level security switched off there, stops the relay',
      pol.refused === 'storage_policy_present' && off.refused === 'storage_rls_off' && (await call(api, mk(W, 'selfcheck'))).ok === true, pol.refused + ' / ' + off.refused);
  });

  await section('S18', async () => {
    const r = await call(api, mk(W, 'create', { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'A.zip', files: declared('A.zip') }));
    row('S18 with no verifier registered nothing can be created', r.refused === 'no_verifier_registered' && r.status === 409, JSON.stringify(r));
    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [H, 'verifier', HK, 'Home']);
    const s = await call(api, mk(H, 'selfcheck'));
    row('S18b a registered node sees its own role and whether both ends are registered',
      s.ok === true && s.node_id === H && s.relay_role === 'verifier' && s.sender_registered === true && s.verifier_registered === true, JSON.stringify(s));
  });

  await section('S33', async () => {
    const post = await lines('sql/003_postcheck.sql');
    await plane.su.query('update storage.buckets set public = true where id = $1', [BUCKET]);
    const open = await lines('sql/003_postcheck.sql');
    await plane.su.query('update storage.buckets set public = false where id = $1', [BUCKET]);
    await plane.su.query('grant select on factory_relay.receipts to authenticated; grant execute on function factory_relay._begin(jsonb) to service_role');
    const granted = await lines('sql/003_postcheck.sql');
    await plane.su.query('revoke select on factory_relay.receipts from authenticated; revoke execute on function factory_relay._begin(jsonb) from service_role');
    row('S33 the post-check is one statement: seven lines that are all ok on a finished install, then who is registered; it names a public bucket or a stray grant',
      post.checks.length === 7 && post.bad.length === 0 && post.listing.length === 2 && post.listing.map((r) => r.line).sort().join() === ['registered sender ' + W, 'registered verifier ' + H].sort().join()
      && open.bad.length === 1 && /bucket_not_private/.test(open.bad[0]) && granted.bad.length === 2 && (await lines('sql/003_postcheck.sql')).bad.length === 0, post.bad.join(' | ') + ' / ' + granted.bad.length);
  });

  // ------------------------------------------------------------------------------------------------------------ authentication
  await section('S13', async () => {
    const unknown = await call(api, mk(X, 'selfcheck'));
    const stale = await call(api, mk(W, 'selfcheck', {}, { ts: Date.now() - 301000 }));
    const future = await call(api, mk(W, 'selfcheck', {}, { ts: Date.now() + 301000 }));
    const inWindow = await call(api, mk(W, 'selfcheck', {}, { ts: Date.now() - 200000 }));
    row('S13a an unknown node and a request outside the five-minute window are refused',
      unknown.refused === 'not_authenticated' && unknown.status === 401 && stale.refused === 'not_authenticated' && future.refused === 'not_authenticated' && inWindow.ok === true,
      [unknown.refused, stale.refused, future.refused, inWindow.ok].join(' '));
    const req = mk(W, 'selfcheck');
    const first = await call(api, req);
    const between = await call(api, mk(W, 'selfcheck'));
    const second = await call(api, req);
    const otherNode = await call(api, { ...mk(H, 'selfcheck'), nonce: req.nonce });
    row('S13b a request is accepted once: the same node and nonce again is a replay', first.ok === true && between.ok === true && second.refused === 'replayed_request' && second.status === 409 && otherNode.ok === true, JSON.stringify(second));
    const bad = [mk(W, 'selfcheck', {}, { nonce: 'xyz' }), mk(W, 'selfcheck', {}, { signature: 'short' }), mk(W, 'selfcheck', {}, { body_sha256: 'zz' }),
      mk(W, 'selfcheck', {}, { ts: 'yesterday' }), mk(W, 'explode'), mk(W, 'selfcheck', [1]), { fn: 'begin' }, { fn: 'nothing' }, { fn: 'finish' }, { fn: 'purged' },
      mk(W, 'status', { artifact_id: 'not-a-uuid' }), mk(W, 'upload', { artifact_id: '00000000-0000-0000-0000-000000000000', kind: 'tarball' }),
      mk(W, 'status', { artifact_id: null }), mk(W, 'status', {}), mk(W, 'selfcheck', null), { ...mk(W, 'selfcheck'), ts: null }, { ...mk(W, 'selfcheck'), nonce: null }, null, 7, 'x', [],
      { ...mk(W, 'selfcheck'), public_key: null }, { ...mk(W, 'selfcheck'), public_key: 'short' }, { ...mk(W, 'selfcheck'), public_key: 7 }, { fn: 'node_key', node_id: W }];
    const got = [];
    for (const b of bad) got.push((await call(api, b)).refused);
    row('S13c a malformed request is refused by name and never raises', got.every((g) => g === 'bad_request'), got.join(' '));
  });

  // --------------------------------------------------------------------------------------------------------------------- create
  let A, B, C;
  const filesA = declared('CANDIDATE2_HANDOFF_c667367.zip');
  const createA = { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'CANDIDATE2_HANDOFF_c667367.zip', files: filesA };
  await section('S14', async () => {
    const v = await call(api, mk(H, 'create', createA));
    row('S14 the verifier cannot create an artifact', v.refused === 'not_the_sender' && v.status === 403, JSON.stringify(v));
    // the sender names a recipient of its own choosing (itself, then an unregistered node): the relay does not listen
    const r = await call(api, mk(W, 'create', { ...createA, recipient_node_id: W, recipient: X, verifier: X }));
    A = r.artifact;
    const rec = await one('select * from factory_relay.artifacts where artifact_id = $1', [A?.artifact_id]);
    const days = (new Date(A.expires_at) - new Date(A.created_at)) / 86400000;
    row('S15 the recipient is the registered verifier whatever the sender asks for, and the record binds every required field',
      r.ok === true && r.already === false && UUID.test(A.artifact_id) && A.candidate_sha === CAND && A.sender_node_id === W && A.recipient_node_id === H
      && A.sender_signing_fingerprint === FP && A.archive_sha256 === filesA[0].sha256 && A.object_path === `candidate/${CAND}/${A.artifact_id}/CANDIDATE2_HANDOFF_c667367.zip`
      && A.delivery_state === 'CREATED' && Math.abs(days - 14) < 0.01 && rec.recipient_node_id === H && rec.created_at && rec.expires_at,
      JSON.stringify({ recipient: A?.recipient_node_id, days }));
    const rc = (await plane.su.query('select * from factory_relay.receipts where artifact_id = $1 order by seq', [A.artifact_id])).rows;
    row('S15b creating writes one CREATED receipt that carries the signed request',
      rc.length === 1 && rc[0].state === 'CREATED' && rc[0].actor_node_id === W && rc[0].actor_public_key === WK && rc[0].prev_hash === '0'.repeat(64)
      && sha256(rc[0].request_body) === rc[0].request_body_sha256 && JSON.parse(rc[0].request_body).op === 'create', rc.length);
    const again = await call(api, mk(W, 'create', createA));
    const conflict = await call(api, mk(W, 'create', { ...createA, files: filesA.map((f) => (f.kind === 'signature' ? { ...f, size: 295 } : f)) }));
    const n = await one('select count(*) as n from factory_relay.receipts where artifact_id = $1', [A.artifact_id]);
    row('S16 the same declaration again is the same artifact; a different one for the same archive is refused',
      again.ok === true && again.already === true && again.artifact.artifact_id === A.artifact_id && conflict.refused === 'conflicting_artifact' && n.n === '1', JSON.stringify(conflict));
    const f = declared('B.zip');
    const wrong = [
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f.slice(0, 2) },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [f[0], f[1], { ...f[2], name: 'other.sig' }] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [f[0], f[0], f[1]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], size: 0 }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], size: 1048577 }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], sha256: 'nothex' }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [...f, f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: '../B.zip', files: declared('../B.zip') },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'a/B.zip', files: declared('a/B.zip') },
      { candidate_sha: 'c667367', signing_fingerprint: FP, archive_name: 'B.zip', files: f },
      { candidate_sha: CAND, signing_fingerprint: 'MD5:00', archive_name: 'B.zip', files: f },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: 0 },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: 31 },
      // a value that is there but empty, or not a whole number, is refused like a wrong one (a NULL must not skip a refusal)
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: null },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: 'abc' },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: 1.5 },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: f, retention_days: -1 },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], size: null }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], size: '12 ' }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [{ ...f[0], sha256: null }, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [null, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: [7, f[1], f[2]] },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: null },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: {} },
      { candidate_sha: null, signing_fingerprint: FP, archive_name: 'B.zip', files: f },
      { candidate_sha: CAND, signing_fingerprint: null, archive_name: 'B.zip', files: f },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: null, files: f },
      { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: 'three' },
    ];
    const got = [];
    for (const w of wrong) got.push((await call(api, mk(W, 'create', w))).refused);
    const n2 = await one('select count(*) as n from factory_relay.artifacts');
    row('S17 anything but the archive, its .sha256 and its .sha256.sig, each well declared, is refused', got.every((g) => g === 'bad_request') && n2.n === '1', got.join(' '));
  });

  // --------------------------------------------------------------------------------------------------------------------- upload
  const store = async (artifactId, kind, outcome = 'stored') => {
    const b = await call(api, mk(W, 'upload', { artifact_id: artifactId, kind }));
    if (!b.ok) return { begin: b };
    return { begin: b, finish: await call(api, { fn: 'finish', request_id: b.request_id, outcome }) };
  };
  await section('S19', async () => {
    const byH = await call(api, mk(H, 'upload', { artifact_id: A.artifact_id, kind: 'archive' }));
    const none = await call(api, mk(W, 'upload', { artifact_id: '00000000-0000-4000-8000-000000000000', kind: 'archive' }));
    const noKind = await call(api, mk(W, 'upload', { artifact_id: A.artifact_id }));
    const b = await call(api, mk(W, 'upload', { artifact_id: A.artifact_id, kind: 'archive' }));
    row('S19 only the sender uploads, only into its own artifact, and it is told the declared size and hash to hold the bytes to',
      byH.refused === 'not_the_sender' && none.refused === 'no_such_artifact' && noKind.refused === 'bad_request'
      && b.ok === true && b.phase === 'store' && UUID.test(b.request_id) && b.size === 15807 && b.sha256 === filesA[0].sha256 && b.object_path === A.object_path,
      [byH.refused, none.refused, noKind.refused, b.phase].join(' '));
    const f1 = await call(api, { fn: 'finish', request_id: b.request_id, outcome: 'stored' });
    const f1again = await call(api, { fn: 'finish', request_id: b.request_id, outcome: 'stored' });
    const twice = await call(api, mk(W, 'upload', { artifact_id: A.artifact_id, kind: 'archive' }));
    const stray = await call(api, { fn: 'finish', request_id: '00000000-0000-4000-8000-000000000000', outcome: 'stored' });
    const statusReq = (await plane.su.query(`select request_id from factory_relay.requests where op = 'selfcheck' limit 1`)).rows[0].request_id;
    const notUpload = await call(api, { fn: 'finish', request_id: statusReq, outcome: 'stored' });
    const st1 = await one('select delivery_state from factory_relay.artifacts where artifact_id = $1', [A.artifact_id]);
    row('S20a an object is stored once, and only an upload the relay began can be finished',
      f1.ok === true && f1.stored === true && f1.files_left === 2 && f1.delivery_state === 'CREATED' && f1again.refused === 'already_finished'
      && twice.refused === 'already_stored' && stray.refused === 'no_such_request' && notUpload.refused === 'no_such_request' && st1.delivery_state === 'CREATED',
      [f1.files_left, f1again.refused, twice.refused, stray.refused, notUpload.refused].join(' '));
    const inboxEarly = await call(api, mk(H, 'inbox'));
    const dlEarly = await call(api, mk(H, 'download', { artifact_id: A.artifact_id, kind: 'archive' }));
    const s2 = await store(A.artifact_id, 'sha256'), s3 = await store(A.artifact_id, 'signature');
    const late = await call(api, mk(W, 'upload', { artifact_id: A.artifact_id, kind: 'archive' }));
    const rc = (await plane.su.query('select state, actor_node_id, seq from factory_relay.receipts where artifact_id = $1 order by seq', [A.artifact_id])).rows;
    row('S20b the artifact is UPLOADED only when all three files are stored, with one receipt, and it is invisible to the recipient before that',
      inboxEarly.ok === true && inboxEarly.artifacts.length === 0 && dlEarly.refused === 'not_downloadable'
      && s2.finish.files_left === 1 && s2.finish.delivery_state === 'CREATED' && s3.finish.files_left === 0 && s3.finish.delivery_state === 'UPLOADED'
      && late.refused === 'not_uploadable' && rc.length === 2 && rc[1].state === 'UPLOADED' && rc[1].actor_node_id === W,
      JSON.stringify(rc.map((x) => x.state)));
    B = (await call(api, mk(W, 'create', { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'B.zip', files: declared('B.zip') }))).artifact;
    const failed = await store(B.artifact_id, 'archive', 'failed');
    const retry = await store(B.artifact_id, 'archive');
    row('S21 a failed store leaves the file unstored and the upload can be tried again',
      failed.finish.ok === true && failed.finish.stored === false && retry.finish.stored === true && retry.finish.files_left === 2, JSON.stringify(failed.finish));
  });

  // --------------------------------------------------------------------------------------------------------- inbox and download
  await section('S22', async () => {
    const inboxW = await call(api, mk(W, 'inbox'));
    const dlW = await call(api, mk(W, 'download', { artifact_id: A.artifact_id, kind: 'archive' }));
    const inboxH = await call(api, mk(H, 'inbox'));
    const dl = await call(api, mk(H, 'download', { artifact_id: A.artifact_id, kind: 'archive' }));
    const dlB = await call(api, mk(H, 'download', { artifact_id: B.artifact_id, kind: 'archive' }));
    row('S22 only the bound recipient lists and downloads, and only an artifact that was fully uploaded',
      inboxW.refused === 'not_the_recipient' && dlW.refused === 'not_the_recipient' && inboxH.ok === true && inboxH.artifacts.length === 1
      && inboxH.artifacts[0].artifact_id === A.artifact_id && dl.ok === true && dl.phase === 'fetch' && dl.object_path === A.object_path && dl.sha256 === filesA[0].sha256
      && dlB.refused === 'not_downloadable', [inboxW.refused, dlW.refused, inboxH.artifacts?.length, dl.phase, dlB.refused].join(' '));
  });

  // ------------------------------------------------------------------------------------------------------------------- receipts
  const receipt = (node, id, state, detail = {}) => call(api, mk(node, 'receipt', { artifact_id: id, state, detail }));
  await section('S24', async () => {
    const early = await receipt(H, A.artifact_id, 'VERIFIED');
    const byW = await receipt(W, A.artifact_id, 'DELIVERED');
    const d = await receipt(H, A.artifact_id, 'DELIVERED', { files: 3 });
    const dAgain = await receipt(H, A.artifact_id, 'DELIVERED');
    const v = await receipt(H, A.artifact_id, 'VERIFIED', { checks: ['signature', 'archive_sha256', 'sha256sums', 'file_set', 'paths'] });
    const c = await receipt(H, A.artifact_id, 'CONSUMED', { intake: 'begun' });
    const after = [await receipt(H, A.artifact_id, 'REFUSED'), await receipt(H, A.artifact_id, 'VERIFIED'), await receipt(H, A.artifact_id, 'CONSUMED')];
    const odd = [await receipt(H, A.artifact_id, 'FOO'), await call(api, mk(H, 'receipt', { artifact_id: A.artifact_id, state: 'REFUSED', detail: 'because' })),
      await call(api, mk(H, 'receipt', { artifact_id: A.artifact_id, state: 'REFUSED', detail: { why: 'x'.repeat(5000) } })), await call(api, mk(H, 'receipt', { artifact_id: A.artifact_id }))];
    row('S25 no state is skipped, repeated or left once final, and only the recipient writes a receipt',
      early.refused === 'bad_transition' && byW.refused === 'not_the_recipient' && dAgain.refused === 'bad_transition' && after.every((x) => x.refused === 'bad_transition')
      && odd[0].refused === 'bad_transition' && odd.slice(1).every((x) => x.refused === 'bad_request'),
      [early.refused, byW.refused, dAgain.refused, ...after.map((x) => x.refused), ...odd.map((x) => x.refused)].join(' '));
    const sW = await call(api, mk(W, 'status', { artifact_id: A.artifact_id })), sH = await call(api, mk(H, 'status', { artifact_id: A.artifact_id }));
    const rc = sW.receipts ?? [];
    let chain = rc.length === 5, prev = '0'.repeat(64);
    for (const x of rc) {
      const h = sha256([x.prev_hash, A.artifact_id, x.seq, x.state, x.actor_node_id ?? 'relay', x.at, x.request_body_sha256 ?? '', x.request_signature ?? ''].join('|'));
      chain = chain && x.prev_hash === prev && x.hash === h; prev = x.hash;
    }
    row('S24 delivered, verified, consumed: one receipt each, in order, each chained to the one before, and both ends read the same record',
      d.ok === true && d.seq === 3 && v.seq === 4 && c.seq === 5 && c.delivery_state === 'CONSUMED' && sW.artifact.delivery_state === 'CONSUMED'
      && rc.map((x) => x.state).join(' ') === 'CREATED UPLOADED DELIVERED VERIFIED CONSUMED' && chain && JSON.stringify(sW.receipts) === JSON.stringify(sH.receipts),
      rc.map((x) => x.state).join(' ') + ' chain=' + chain);
    row('S24b a receipt carries its actor, the actor\'s registered key, and the action and request the actor signed',
      rc.map((x) => x.request_action).join(' ') === 'create upload receipt receipt receipt'
      && rc.slice(2).every((x) => x.actor_node_id === H && x.actor_public_key === HK && sha256(x.request_body) === x.request_body_sha256
        && JSON.parse(x.request_body).payload.state === x.state && JSON.parse(x.request_body).payload.artifact_id === A.artifact_id), '');
  });

  await section('S26', async () => {
    const filesC = declared('C.zip');
    const mkC = { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'C.zip', files: filesC };
    C = (await call(api, mk(W, 'create', mkC))).artifact;
    for (const k of ['archive', 'sha256', 'signature']) await store(C.artifact_id, k);
    await receipt(H, C.artifact_id, 'DELIVERED');
    const r = await receipt(H, C.artifact_id, 'REFUSED', { check: 'signature', reason: 'the signing key is not the trusted one' });
    const inbox = await call(api, mk(H, 'inbox'));
    const dl = await call(api, mk(H, 'download', { artifact_id: C.artifact_id, kind: 'archive' }));
    const anew = await call(api, mk(W, 'create', mkC));
    row('S26 a refused artifact is final and out of reach, and the same archive can then be sent as a new artifact',
      r.ok === true && r.delivery_state === 'REFUSED' && !inbox.artifacts.some((x) => x.artifact_id === C.artifact_id) && dl.refused === 'not_downloadable'
      && anew.ok === true && anew.already === false && anew.artifact.artifact_id !== C.artifact_id && anew.artifact.delivery_state === 'CREATED',
      [r.delivery_state, dl.refused, anew.already].join(' '));
    const consumedAgain = await call(api, mk(W, 'create', createA));
    row('S26b a consumed archive is not sent twice', consumedAgain.ok === true && consumedAgain.already === true && consumedAgain.artifact.delivery_state === 'CONSUMED', '');
  });

  await section('S27', async () => {
    const tries = [
      await denied(plane.owner, `update factory_relay.receipts set state = 'VERIFIED' where artifact_id = $1`, [A.artifact_id]),
      await denied(plane.owner, 'delete from factory_relay.receipts where artifact_id = $1', [A.artifact_id]),
      await denied(plane.owner, 'truncate factory_relay.receipts'),
      await denied(plane.owner, 'update factory_relay.artifacts set recipient_node_id = $2 where artifact_id = $1', [A.artifact_id, H2]),
      await denied(plane.owner, 'update factory_relay.artifacts set archive_sha256 = $2 where artifact_id = $1', [A.artifact_id, sha256('x')]),
      await denied(plane.owner, `update factory_relay.artifacts set expires_at = expires_at + interval '1 year' where artifact_id = $1`, [A.artifact_id]),
      await denied(plane.owner, 'delete from factory_relay.artifacts where artifact_id = $1', [B.artifact_id]),
      await denied(plane.owner, 'update factory_relay.artifact_files set sha256 = $2 where artifact_id = $1', [A.artifact_id, sha256('x')]),
      await denied(plane.owner, 'delete from factory_relay.artifact_files where artifact_id = $1', [A.artifact_id]),
      await denied(plane.owner, `update factory_relay.nodes set relay_role = 'sender' where node_id = $1`, [H]),
      await denied(plane.owner, 'update factory_relay.nodes set public_key = $2 where node_id = $1', [H, newKey()]),
      await denied(plane.owner, 'delete from factory_relay.nodes where node_id = $1', [H]),
    ];
    const n = await one('select count(*) as n from factory_relay.receipts where artifact_id = $1', [A.artifact_id]);
    row('S27 receipts, an artifact\'s binding, a declared file and a registration cannot be changed or deleted, even by the owner',
      tries.every((e) => e !== null && e.startsWith('P0001')) && n.n === '5', tries.map((e) => (e ?? 'ALLOWED').slice(0, 7)).join(' '));
    // a stray grant to an API role still shows nothing: row level security with no policy is the second fence
    await plane.su.query('grant usage on schema factory_relay to authenticated; grant select on factory_relay.receipts, factory_relay.artifacts to authenticated');
    const seen = (await authed.query('select (select count(*) from factory_relay.receipts) as r, (select count(*) from factory_relay.artifacts) as a')).rows[0];
    await plane.su.query('revoke select on factory_relay.receipts, factory_relay.artifacts from authenticated; revoke usage on schema factory_relay from authenticated');
    row('S27b even with a stray grant an API role sees no row', seen.r === '0' && seen.a === '0', JSON.stringify(seen));
  });

  // --------------------------------------------------------------------------------------------------------------------- expiry
  const age = async (id) => {
    await plane.su.query('begin'); await plane.su.query(`set local session_replication_role = replica`);
    await plane.su.query(`update factory_relay.artifacts set created_at = created_at - interval '15 days', expires_at = pg_catalog.now() - interval '1 second' where artifact_id = $1`, [id]);
    await plane.su.query('commit');
  };
  await section('S28', async () => {
    const mkArt = async (name) => {
      const a = (await call(api, mk(W, 'create', { candidate_sha: CAND, signing_fingerprint: FP, archive_name: name, files: declared(name), retention_days: 1 }))).artifact;
      for (const k of ['archive', 'sha256', 'signature']) await store(a.artifact_id, k);
      return a;
    };
    const D = await mkArt('D.zip'), E = await mkArt('E.zip'), F = await mkArt('F.zip');
    const kept = (await plane.owner.query('select factory_relay.preserve($1, true) as r', [E.artifact_id])).rows[0].r;
    const early = await call(api, { fn: 'purged', artifact_ids: [F.artifact_id] });
    await age(D.artifact_id); await age(E.artifact_id); await age(A.artifact_id);
    const s = await call(api, mk(W, 'selfcheck'));
    const due = Object.fromEntries((s.purge ?? []).map((x) => [x.artifact_id, x.paths]));
    const dD = await one('select delivery_state from factory_relay.artifacts where artifact_id = $1', [D.artifact_id]);
    const rD = (await plane.su.query('select state, actor_node_id, detail from factory_relay.receipts where artifact_id = $1 order by seq', [D.artifact_id])).rows;
    const dlD = await call(api, mk(H, 'download', { artifact_id: D.artifact_id, kind: 'archive' }));
    const dlE = await call(api, mk(H, 'download', { artifact_id: E.artifact_id, kind: 'archive' }));
    const inbox = await call(api, mk(H, 'inbox'));
    row('S28a past its retention an artifact is EXPIRED with a receipt, out of the recipient\'s reach, and its objects are handed over for deletion',
      early.purged === 0 && dD.delivery_state === 'EXPIRED' && rD.at(-1).state === 'EXPIRED' && rD.at(-1).actor_node_id === null && rD.at(-1).detail.from === 'UPLOADED'
      && (due[D.artifact_id] ?? []).length === 3 && due[D.artifact_id].every((p) => p.startsWith(`candidate/${CAND}/${D.artifact_id}/`))
      && dlD.refused === 'not_downloadable' && !inbox.artifacts.some((x) => x.artifact_id === D.artifact_id),
      JSON.stringify({ state: dD.delivery_state, due: Object.keys(due).length, dl: dlD.refused }));
    row('S28b an artifact preserved as evidence does not expire: its state, its bytes and the recipient\'s access stay',
      /preserved as evidence/.test(kept) && !(E.artifact_id in due) && dlE.ok === true && inbox.artifacts.some((x) => x.artifact_id === E.artifact_id)
      && (await one('select delivery_state from factory_relay.artifacts where artifact_id = $1', [E.artifact_id])).delivery_state === 'UPLOADED', dlE.refused ?? '');
    const aState = await one('select delivery_state from factory_relay.artifacts where artifact_id = $1', [A.artifact_id]);
    row('S28c a consumed artifact keeps its final state when its bytes fall due', aState.delivery_state === 'CONSUMED' && (due[A.artifact_id] ?? []).length === 3, aState.delivery_state);
    const p = await call(api, { fn: 'purged', artifact_ids: [D.artifact_id, A.artifact_id, E.artifact_id, F.artifact_id] });
    const pAgain = await call(api, { fn: 'purged', artifact_ids: [D.artifact_id] });
    const s2 = await call(api, mk(W, 'selfcheck'));
    const flags = (await plane.su.query('select artifact_id, purged_at is not null as purged from factory_relay.artifacts where artifact_id = any($1)', [[D.artifact_id, A.artifact_id, E.artifact_id, F.artifact_id]])).rows;
    const purgedSet = new Set(flags.filter((x) => x.purged).map((x) => x.artifact_id));
    const lastA = await one('select state, actor_node_id from factory_relay.receipts where artifact_id = $1 order by seq desc limit 1', [A.artifact_id]);
    row('S29 only what has expired and is not preserved is recorded as purged, once, with a receipt',
      p.purged === 2 && pAgain.purged === 0 && purgedSet.size === 2 && purgedSet.has(D.artifact_id) && purgedSet.has(A.artifact_id)
      && (s2.purge ?? []).length === 0 && lastA.state === 'PURGED' && lastA.actor_node_id === null, JSON.stringify({ purged: p.purged, again: pAgain.purged, due: (s2.purge ?? []).length }));
    await plane.owner.query('select factory_relay.preserve($1, false)', [E.artifact_id]);
    const s3 = await call(api, mk(H, 'sweep'));
    const gone = await denied(plane.owner, 'select factory_relay.preserve($1, true)', [D.artifact_id]);
    row('S29b releasing a preserved artifact lets it expire on the next sweep, and a purged one cannot be preserved',
      s3.ok === true && s3.expired === 1 && (s3.purge ?? []).some((x) => x.artifact_id === E.artifact_id) && gone !== null && /no unpurged artifact/.test(gone), gone ?? '');
  });

  // ----------------------------------------------------------------------------------------------------- change of the verifier
  await section('S12', async () => {
    const live = (await call(api, mk(W, 'create', { candidate_sha: CAND, signing_fingerprint: FP, archive_name: 'G.zip', files: declared('G.zip') }))).artifact;
    for (const k of ['archive', 'sha256', 'signature']) await store(live.artifact_id, k);
    // the key the function authenticated with must be the registered one: another key for the same node is nobody
    const otherKey = [await call(api, mk(W, 'selfcheck', {}, { public_key: newKey() })), await call(api, mk(W, 'selfcheck', {}, { public_key: HK })),
      await call(api, mk(H, 'inbox', {}, { public_key: WK }))];
    const before = await one('select count(*) as n from factory_relay.requests');
    row('S36 a request is accepted only with the very key the node is registered with, and a refused one leaves no trace',
      otherKey.every((r) => r.refused === 'not_authenticated' && r.status === 401) && (await call(api, mk(H, 'inbox'))).ok === true
      && Number((await one('select count(*) as n from factory_relay.requests')).n) === Number(before.n) + 1, otherKey.map((r) => r.refused).join(' '));
    await plane.owner.query('select factory_relay.deactivate_node($1)', [H]);
    const stateBefore =JSON.stringify((await plane.su.query('select (select count(*) from factory_relay.requests) as q, (select count(*) from factory_relay.receipts) as r, (select max(state_at) from factory_relay.artifacts) as a')).rows[0]);
    const req = await call(api, mk(H, 'inbox'));
    const revokedDl = await call(api, mk(H, 'download', { artifact_id: live.artifact_id, kind: 'archive' }));
    const stateAfter = JSON.stringify((await plane.su.query('select (select count(*) from factory_relay.requests) as q, (select count(*) from factory_relay.receipts) as r, (select max(state_at) from factory_relay.artifacts) as a')).rows[0]);
    row('S37 a revoked node is refused before anything else: no request is recorded, no receipt is written, no artifact changes',
      req.refused === 'not_authenticated' && revokedDl.refused === 'not_authenticated' && stateBefore === stateAfter, stateBefore + ' ' + stateAfter);
    const back = await denied(plane.owner, 'update factory_relay.nodes set active = true where node_id = $1', [H]);
    const sameKey = await denied(plane.owner, 'select factory_relay.register_node($1, $2, $3, $4)', [H, 'verifier', HK, 'Home again, old key']);
    row('S12 a deactivated registration is not reactivated, and its key is never registered again',
      back !== null && back.startsWith('P0001') && sameKey !== null && sameKey.startsWith('23505'), [(back ?? 'ALLOWED').slice(0, 5), (sameKey ?? 'ALLOWED').slice(0, 5)].join(' '));
    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [H2, 'verifier', H2K, 'a new verifier']);
    const inbox = await call(api, mk(H2, 'inbox'));
    const dl = await call(api, mk(H2, 'download', { artifact_id: live.artifact_id, kind: 'archive' }));
    const st = await call(api, mk(H2, 'status', { artifact_id: live.artifact_id }));
    const rcp = await receipt(H2, live.artifact_id, 'DELIVERED');
    row('S23 an artifact bound to one verifier does not exist for another node',
      inbox.ok === true && inbox.artifacts.length === 0 && [dl, st, rcp].every((x) => x.refused === 'no_such_artifact' && x.status === 404), [dl.refused, st.refused, rcp.refused].join(' '));
  });

  // -------------------------------------------------------------------------------------------------------------------- removal
  await section('S30', async () => {
    for (const c of opened.splice(0)) { try { await c.end(); } catch { /* closed */ } }
    const e = await denied(plane.owner, readFileSync(join(ROOT, 'sql/099_remove_artifact_relay_v0.sql'), 'utf8'));
    await plane.su.query('delete from storage.buckets where id = $1', [BUCKET]);
    const fp2 = await fingerprint();
    row('S30 the removal file drops everything the install added and leaves the plane as it was', e === null && JSON.stringify(fp2) === JSON.stringify(fp0), e ?? '');
  });

  for (const c of opened) { try { await c.end(); } catch { /* closed */ } }
  await resetPlane(plane);
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = reporter('artifact relay sql acceptance');
  const plane = await startPlane({ bucket: 'none' });
  let code = 1;
  try {
    const rows = await runSuite(plane);
    for (const r of rows) t.row(r.label, r.ok, r.ok ? '' : r.detail);
    code = t.done();
  } catch (e) { console.log('FAIL the suite crashed - ' + e.stack); } finally { await plane.stop(); }
  process.exit(code);
}
