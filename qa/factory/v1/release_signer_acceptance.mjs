#!/usr/bin/env node
// THE FACTORY RELEASE SIGNER (founder decision 2026-10-03; S-5; WO-6) - DEVELOPER VERIFICATION, never independent.
// scripts/factory-control-plane/release_signer.sql on a disposable plane provisioned as 69df2f52, applied AS THE APPLYING LOGIN
// (postgres: NOSUPERUSER, a member of pg_read_all_data and of service_role, as live), then the candidate migration on top of it.
// The secret store is the stand-in (qa/factory/v1/vault_standin.sql): Supabase Vault's names and the platform's grants - to
// `postgres` AND to `service_role` - without its encryption.
//   RS1  the file applies as the applying login in one transaction; public_key() answers a bound {key_id, public_key}
//   RS2  a second application is refused by the server (the schema exists) and changes nothing: the same key, one stored secret
//   RS3  the arithmetic is RFC 8032's: TEST 1-3 of section 7.1, public key and signature, byte for byte
//   RS4  it equals node:crypto byte for byte over random seeds and messages (Ed25519 is deterministic: any other r, R or S shows)
//   RS5  the seed is SHA-256(the store's part || the table's part), stored nowhere; sign_release answers the manifest the installer
//        verifies: its signature is node:crypto's over canonicalManifestBytes with that seed, the candidate's own verifyRelease
//        accepts it with this plane's key pinned, and refuses it unpinned, with the digest changed, and on a dev-channel runtime
//   RS6  sign_release signs a production release and nothing else: a malformed version, source, digest or receipt is an error
//        (22023) and no signature is returned
//   RS7  WHO CAN REACH THE PRIVATE KEY. The seed needs BOTH parts. `service_role` reads the store's part (the platform's grant) and
//        is refused the table's part; a login that may read every table reads the table's part and is refused the store's; the
//        legacy runner, both API logins and the engine role read neither. None of them may run the seed's own function or the
//        internal signing function, and of them only the engine role may call sign_release. The applying login is the plane's
//        owner-level login and holds both. Every login may read the public half
//   RS8  the catalog says the same: no function of the signer is executable by PUBLIC but public_key(); every function pins its
//        search_path; the signer belongs to the applying login and the file created no role; public_key, ready and sign_release
//        are the only SECURITY DEFINER functions; nobody holds a grant on the signer's table
//   RS9  nothing is ever signed with another key: a store part that was replaced or is no part, a table part that was replaced, or
//        a store part `service_role` deleted, each make sign_release answer NULL and ready() false; with the parts back, the same
//        signature as before
//   RS10 no part is in a statement of the file or in a result of applying it: the file's only 32-byte literals are the RFC's
//        vectors; the store's secret is created with a placeholder and its value is given to the store's update call (which writes
//        ciphertext only); applying the file returns two rows only - the self-test's void and the update's void
//   RS11 the file's own last check stops it on a plane whose default privileges would hand a signer function, or the signer table,
//        to another role - and then nothing of the file remains: no schema, no stored secret
// usage: node qa/factory/v1/release_signer_acceptance.mjs [--evidence <file>]
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { ROOT, startV1Plane, enableApiLogins } from './plane.mjs';
import { applyAsApplyingLogin, applySigner, SIGNER_FILE } from './applying_role_plane.mjs';
import { recorder } from './flows.mjs';
import { canonicalManifestBytes, NO_REVOCATIONS, verifyRelease } from '../../../scripts/factory-runner/enrolled/release.mjs';

const { results, row } = recorder();
const hex = (b) => Buffer.from(b).toString('hex');
const nodeKey = (seed) => {
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  return { privateKey, pub: Buffer.from(createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32)) };
};
const client = async (url) => { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; };
/** what the server answers to `sql` on a connection: the rows, or its SQLSTATE and message */
const tryOn = (c, sql, params) => c.query(sql, params).then((r) => ({ ok: true, rows: r.rows }), (e) => ({ ok: false, code: e.code, message: e.message }));
const RFC = [
  ['9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '',
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'],
  ['4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', '72',
    '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'],
  ['c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', 'af82',
    '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a'],
];
const REL = ['0.9.4', 'a'.repeat(40), 'd'.repeat(64), 'b'.repeat(64)];
const SIGN = 'select factory_signer.sign_release($1, $2, $3, $4) m';
const NAME = 'factory_release_signer_part';
const STORE = `select decrypted_secret from vault.decrypted_secrets where name = '${NAME}'`;
const setStore = (su, value) => su.query(`update vault.secrets set secret = encode(convert_to($1, 'utf8'), 'base64') where name = '${NAME}'`, [value]);

let plane = null;
try {
  plane = await startV1Plane({ migrate: false, signer: false });   // this suite applies the signer file itself
  const su = await client(plane.superUrl);       // the bootstrap superuser: read-backs and fixtures only
  const ap = await client(plane.adminUrl);       // the applying login
  try {
    // ---- RS1, RS2: the bootstrap, as the applying login
    const me = (await ap.query(`select current_user u, r.rolsuper s, pg_has_role(current_user, 'pg_read_all_data', 'member') reads_all,
        pg_has_role(current_user, 'service_role', 'member') service from pg_roles r where r.rolname = current_user`)).rows[0];
    const signer = await applySigner(plane);
    plane.signer = signer;
    const bound = /^[A-Za-z0-9_-]{43}$/.test(signer.public_key) && signer.key_id === 'ed25519:' + createHash('sha256').update(Buffer.from(signer.public_key, 'base64url')).digest('hex');
    row('RS1 the signer file applies AS the applying login (not a superuser; a member of pg_read_all_data and of service_role, as live) in one transaction, and public_key() answers {key_id, public_key} with the key id bound to the key',
      me.u === 'postgres' && me.s === false && me.reads_all === true && me.service === true && bound, JSON.stringify({ applied_as: me, file_sha256: signer.sha256, key_id: signer.key_id }));
    const again = await applySigner(plane).then(() => ({ applied: true }), (e) => ({ applied: false, code: e.code, message: e.message }));
    const after = (await ap.query('select factory_signer.public_key() k')).rows[0].k;
    const secrets = (await su.query(`select count(*)::int n from vault.secrets where name = '${NAME}'`)).rows[0].n;
    row('RS2 a second application is refused by the server (the schema exists) and changes nothing: the same public key, one stored secret',
      again.applied === false && again.code === '42P06' && after.key_id === signer.key_id && after.public_key === signer.public_key && secrets === 1,
      JSON.stringify({ again, secrets }));

    // ---- RS3, RS4: the arithmetic (the internal functions, called by the superuser for the read-back)
    const rfc = [];
    for (const [seed, pub, msg, sig] of RFC) {
      const r = (await su.query('select factory_signer._public($1) p, factory_signer._sign($1, $2) s', [Buffer.from(seed, 'hex'), Buffer.from(msg, 'hex')])).rows[0];
      const k = nodeKey(Buffer.from(seed, 'hex'));
      // the vector itself is also what node:crypto computes: a vector mistyped here would show
      rfc.push(hex(r.p) === pub && hex(r.s) === sig && hex(k.pub) === pub && hex(sign(null, Buffer.from(msg, 'hex'), k.privateKey)) === sig);
    }
    const self = await tryOn(su, 'select factory_signer._selftest()');
    row('RS3 the arithmetic is RFC 8032\'s: section 7.1 TEST 1-3, public key and signature, byte for byte (and node:crypto agrees with each vector); the file\'s own self-test passes',
      rfc.length === 3 && rfc.every(Boolean) && self.ok, JSON.stringify({ rfc, selftest: self.ok ? 'ok' : self.message }));
    const N = 64; let equal = 0; const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const seed = randomBytes(32); const msg = randomBytes(i === 0 ? 0 : i === 1 ? 2048 : (i * 53) % 400);
      const k = nodeKey(seed);
      const r = (await su.query('select factory_signer._public($1) p, factory_signer._sign($1, $2) s', [seed, msg])).rows[0];
      if (Buffer.from(r.p).equals(k.pub) && Buffer.from(r.s).equals(sign(null, msg, k.privateKey))) equal++;
    }
    row('RS4 the public key and the signature equal node:crypto\'s byte for byte over ' + N + ' random (seed, message) pairs (an empty and a 2048-byte message among them)',
      equal === N, equal + '/' + N + ', ' + Math.round((Date.now() - t0) / N) + ' ms a pair');

    // ---- the candidate migration on top of the signer (it grants the engine role the one signing function)
    await applyAsApplyingLogin(plane);
    await enableApiLogins(plane);
    const owner = await client(plane.adminUrl); await owner.query('set role factory_owner');   // the engine role, as the applying login may assume it
    const admin = await client(plane.adminApiUrl), node = await client(plane.nodeApiUrl), runner = await client(plane.runnerUrl);
    await su.query("create role reads_everything login password 'reads_everything_pw' in role pg_read_all_data");
    await su.query("create role acts_as_service_role login password 'acts_as_service_role_pw' in role service_role");
    const reader = await client(plane.superUrl.replace(/\/\/[^@]+@/, '//reads_everything:reads_everything_pw@'));
    const service = await client(plane.superUrl.replace(/\/\/[^@]+@/, '//acts_as_service_role:acts_as_service_role_pw@'));
    try {
      // ---- RS5: the seed and the signed manifest
      const m = (await owner.query(SIGN, REL)).rows[0].m;
      const storePart = (await su.query(STORE)).rows[0].decrypted_secret;
      const tablePart = (await su.query('select part from factory_signer.signer')).rows[0].part;
      const seed = createHash('sha256').update(Buffer.concat([Buffer.from(storePart, 'hex'), tablePart])).digest();
      const k = nodeKey(seed);
      const pinned = { channel: 'production', mode: 'production', keys: [{ key_id: signer.key_id, public_key: signer.public_key }] };
      const V = (manifest, trust) => { const v = verifyRelease({ manifest, trust, revocations: NO_REVOCATIONS }); return v.ok ? 'ok' : v.refused; };
      const facts = {
        shape: JSON.stringify(Object.keys(m).sort()) === JSON.stringify(['channel', 'digest', 'key_id', 'receipt_sha256', 'signature', 'source_sha', 'v', 'version']) && m.v === 1 && m.channel === 'production',
        values: m.version === REL[0] && m.source_sha === REL[1] && m.digest === REL[2] && m.receipt_sha256 === REL[3] && m.key_id === signer.key_id,
        parts: /^[0-9a-f]{64}$/.test(storePart) && tablePart.length === 32 && hex(tablePart) !== storePart,
        seedIsTheKey: k.pub.toString('base64url') === signer.public_key,
        neitherPartIsTheKey: nodeKey(Buffer.from(storePart, 'hex')).pub.toString('base64url') !== signer.public_key && nodeKey(tablePart).pub.toString('base64url') !== signer.public_key,
        nodeSignature: sign(null, canonicalManifestBytes(m), k.privateKey).toString('base64url') === m.signature,
        pinned: V(m, pinned), unpinned: V(m, { channel: 'production', mode: 'production', keys: [] }),
        tampered: V({ ...m, digest: 'e' + m.digest.slice(1) }, pinned), onDev: V(m, { channel: 'dev', mode: 'dev', keys: pinned.keys }),
        twice: (await owner.query(SIGN, REL)).rows[0].m.signature === m.signature,
        ready: (await ap.query('select factory_signer.ready() r')).rows[0].r,
      };
      row('RS5 the seed is SHA-256(the store\'s part || the table\'s part) and neither part alone is the key; sign_release answers the manifest the installer verifies: its signature is node:crypto\'s over canonicalManifestBytes with that seed; verifyRelease accepts it with this plane\'s key pinned and refuses it unpinned (key_outside_trust_set), with the digest changed (bad_signature) and on a dev-channel runtime (channel_mismatch); ready() is true',
        facts.shape && facts.values && facts.parts && facts.seedIsTheKey && facts.neitherPartIsTheKey && facts.nodeSignature && facts.pinned === 'ok' && facts.unpinned === 'key_outside_trust_set'
          && facts.tampered === 'bad_signature' && facts.onDev === 'channel_mismatch' && facts.twice && facts.ready === true, JSON.stringify(facts));

      // ---- RS6: nothing but a release
      const bad = { version: ['1.0', REL[1], REL[2], REL[3]], versionEscape: ['1.0.0"', REL[1], REL[2], REL[3]], versionNewline: ['1.0.0\n', REL[1], REL[2], REL[3]], source: [REL[0], 'A'.repeat(40), REL[2], REL[3]],
        digest: [REL[0], REL[1], 'd'.repeat(63), REL[3]], receipt: [REL[0], REL[1], REL[2], 'B'.repeat(64)], nullVersion: [null, REL[1], REL[2], REL[3]] };
      const refused = {};
      for (const [name, args] of Object.entries(bad)) { const r = await tryOn(owner, SIGN, args); refused[name] = r.ok ? 'SIGNED' : r.code; }
      row('RS6 sign_release signs a production release and nothing else: a malformed version (also one carrying a quote, or ending in a newline), source, digest or receipt, or a null, is the error 22023 and no signature',
        Object.values(refused).every((c) => c === '22023'), JSON.stringify(refused));

      // ---- RS7: who can reach the private key (the seed needs BOTH parts)
      const who = { applying_login: ap, service_role: service, reads_every_table: reader, legacy_runner: runner, admin_api: admin, node_api: node, engine_role: owner };
      const reach = {};
      for (const [name, c] of Object.entries(who)) {
        const store = await tryOn(c, STORE), table = await tryOn(c, 'select part from factory_signer.signer'), seedFn = await tryOn(c, 'select factory_signer._seed()');
        const raw = await tryOn(c, 'select factory_signer._sign($1, $2)', [Buffer.alloc(32), Buffer.alloc(0)]), ready = await tryOn(c, 'select factory_signer.ready()');
        const sig = await tryOn(c, SIGN, REL), pub = await tryOn(c, 'select factory_signer.public_key() k');
        reach[name] = { store_part: store.ok ? 'READ' : store.code, table_part: table.ok ? 'READ' : table.code, seed_function: seedFn.ok ? 'RAN' : seedFn.code, internal_sign: raw.ok ? 'RAN' : raw.code,
          ready: ready.ok ? 'RAN' : ready.code, sign_release: sig.ok ? 'signed' : sig.code, public_key: pub.ok && pub.rows[0].k.key_id === signer.key_id ? 'read' : 'NOT READ' };
      }
      const others = Object.entries(reach).filter(([n]) => n !== 'applying_login');
      const cipherOnly = await tryOn(reader, `select secret from vault.secrets where name = '${NAME}'`);
      row('RS7 who can reach the private key (the seed needs BOTH parts): service_role reads the store\'s part - the platform\'s grant - and is refused the table\'s part; a login that may read every table reads the table\'s part and is refused the store\'s (it sees the stored text only); the legacy runner, both API logins and the engine role read neither; none of them may run the seed\'s own function, the internal signing function or ready() (42501), and of them only the engine role may call sign_release. The applying login, the plane\'s owner-level login, holds both. Every login reads the public half',
        reach.service_role.store_part === 'READ' && reach.service_role.table_part === '42501' && reach.reads_every_table.store_part === '42501' && reach.reads_every_table.table_part === 'READ'
          && ['legacy_runner', 'admin_api', 'node_api', 'engine_role'].every((n) => reach[n].store_part === '42501' && reach[n].table_part === '42501')
          && others.every(([, r]) => !(r.store_part === 'READ' && r.table_part === 'READ') && r.seed_function === '42501' && r.internal_sign === '42501' && r.ready === '42501')
          && others.every(([n, r]) => r.sign_release === (n === 'engine_role' ? 'signed' : '42501'))
          && reach.applying_login.store_part === 'READ' && reach.applying_login.table_part === 'READ' && reach.applying_login.sign_release === 'signed'
          && Object.values(reach).every((r) => r.public_key === 'read') && cipherOnly.ok,
        JSON.stringify(reach));

      // ---- RS8: the catalog
      const fns = (await su.query(`select p.proname, p.prosecdef, r.rolname owner, coalesce(array_to_string(p.proconfig, ','), '') config,
          exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') public_execute
        from pg_proc p join pg_roles r on r.oid = p.proowner where p.pronamespace = 'factory_signer'::regnamespace order by 1`)).rows;
      const roles = (await su.query("select count(*)::int n from pg_roles where rolname like 'factory_signer%'")).rows[0].n;
      const schemaOwner = (await su.query("select r.rolname o from pg_namespace n join pg_roles r on r.oid = n.nspowner where n.nspname = 'factory_signer'")).rows[0].o;
      const cols = (await su.query("select array_agg(a.attname::text order by a.attnum) c from pg_attribute a where a.attrelid = 'factory_signer.signer'::regclass and a.attnum > 0 and not a.attisdropped")).rows[0].c;
      const tableAcl = (await su.query("select coalesce(c.relacl::text, '') acl, r.rolname owner from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'factory_signer.signer'::regclass")).rows[0];
      const cat = {
        names: fns.map((f) => f.proname).sort().join(','),
        publicOnlyPublicKey: fns.filter((f) => f.public_execute).map((f) => f.proname).join(',') === 'public_key',
        searchPath: fns.every((f) => /search_path=pg_catalog, pg_temp/.test(f.config)),
        definer: fns.filter((f) => f.prosecdef).map((f) => f.proname).sort().join(','),
        owners: [...new Set(fns.map((f) => f.owner))].join(','), roles, schemaOwner, cols, tableAcl,
      };
      row('RS8 the catalog: public_key() is the only function of the signer PUBLIC may execute; every function pins search_path = pg_catalog, pg_temp; the schema, the table and every function belong to the applying login, and the file created no role; public_key, ready and sign_release are the only SECURITY DEFINER functions; nobody holds a grant on the table (the public half and one part)',
        cat.names === '_bytes,_le,_mulbase,_public,_scalar,_seed,_selftest,_sign,public_key,ready,sign_release' && cat.publicOnlyPublicKey && cat.searchPath
          && cat.definer === 'public_key,ready,sign_release' && cat.owners === 'postgres' && cat.roles === 0 && cat.schemaOwner === 'postgres'
          && JSON.stringify(cols) === JSON.stringify(['only_one', 'public_key', 'key_id', 'part', 'created_at']) && tableAcl.owner === 'postgres' && tableAcl.acl === '',
        JSON.stringify(cat));

      // ---- RS9: never another key
      const state = async () => { const s = await tryOn(owner, SIGN, REL); return (s.ok ? (s.rows[0].m === null ? 'null' : 'SIGNED') : s.code) + '/' + (await ap.query('select factory_signer.ready() r')).rows[0].r; };
      const broken = {};
      await setStore(su, randomBytes(32).toString('hex')); broken.store_part_replaced = await state();
      await setStore(su, 'not a part'); broken.store_part_is_no_part = await state();
      await setStore(su, storePart);
      await su.query('update factory_signer.signer set part = $1', [randomBytes(32)]); broken.table_part_replaced = await state();
      await su.query('update factory_signer.signer set part = $1', [tablePart]);
      const deleted = await tryOn(service, `delete from vault.secrets where name = '${NAME}'`); broken.store_part_deleted_by_service_role = (deleted.ok ? 'deleted' : deleted.code) + ':' + await state();
      await su.query(`insert into vault.secrets (secret, name) values (encode(convert_to($1, 'utf8'), 'base64'), '${NAME}')`, [storePart]);
      const restored = await tryOn(owner, SIGN, REL);
      row('RS9 nothing is ever signed with another key: a store part that was replaced, a store part that is no part, a table part that was replaced, and a store part service_role deleted each make sign_release answer NULL and ready() false; with the two parts back, the same signature as before and ready() true',
        broken.store_part_replaced === 'null/false' && broken.store_part_is_no_part === 'null/false' && broken.table_part_replaced === 'null/false'
          && broken.store_part_deleted_by_service_role === 'deleted:null/false' && restored.ok && restored.rows[0].m.signature === m.signature
          && (await ap.query('select factory_signer.ready() r')).rows[0].r === true,
        JSON.stringify(broken));

      // ---- RS10: no part is in a statement or in a result
      const text = readFileSync(join(ROOT, SIGNER_FILE), 'utf8').replace(/\r\n/g, '\n');
      const literals = [...new Set(text.match(/\b[0-9a-f]{64}\b/g) || [])];
      const vectors = new Set(RFC.flatMap(([s, p]) => [s, p]));
      // the store's create call is given a placeholder; the part is the second argument of the store's update call
      const created = /select vault\.update_secret\(\n\s*vault\.create_secret\('placeholder[^']*', 'factory_release_signer_part',\n\s*'[^']*'\),\n\s*encode\(sha256\((uuid_send\(gen_random_uuid\(\)\)( \|\| )?){4}\), 'hex'\)\);/.test(text);
      const fresh = await startV1Plane({ migrate: false, signer: false });
      let returned;
      try {
        const c = await client(fresh.adminUrl);
        try { const res = await c.query('begin;\n' + text + '\ncommit;\n'); returned = (Array.isArray(res) ? res : [res]).flatMap((r) => r.rows || []); }
        finally { await c.end(); }
      } finally { await fresh.stop(); }
      row('RS10 no part is in a statement of the file or in a result of applying it: the file\'s only 32-byte literals are the RFC\'s vectors; the store\'s secret is created with a placeholder and its value is the second argument of the store\'s update call; applying the file returns two rows only - the self-test\'s void and the update\'s void',
        literals.length === 6 && literals.every((l) => vectors.has(l)) && !text.includes(storePart) && !text.includes(hex(tablePart)) && created
          && (text.match(/vault\.create_secret\(/g) || []).length === 1 && JSON.stringify(returned) === JSON.stringify([{ _selftest: '' }, { update_secret: '' }]),
        JSON.stringify({ literals: literals.length, created, returned }));

      // ---- RS11: a plane whose default privileges reach another role
      const leaks = {};
      for (const [name, grant] of [['function', 'grant execute on functions to anon'], ['table', 'grant select on tables to service_role']]) {
        const leaky = await startV1Plane({ migrate: false, signer: false });
        try {
          const s2 = await client(leaky.superUrl);
          try {
            await s2.query('alter default privileges for role postgres ' + grant);
            const r = await applySigner(leaky).then(() => ({ applied: true }), (e) => ({ applied: false, message: e.message }));
            const left = (await s2.query("select to_regnamespace('factory_signer') is not null as schema, (select count(*)::int from vault.secrets) as secrets")).rows[0];
            leaks[name] = { applied: r.applied, message: r.message ? r.message.slice(0, 160) : null, left };
          } finally { await s2.end(); }
        } finally { await leaky.stop(); }
      }
      row('RS11 the file\'s own last check stops it on a plane whose default privileges would make a signer function executable by another role, or give another role (here service_role) a privilege on the signer table: the transaction aborts with the self-check\'s message and nothing remains - no schema, no stored secret',
        leaks.function.applied === false && /self-check: a function is executable by a role other than its owner/.test(leaks.function.message) && leaks.function.left.schema === false && leaks.function.left.secrets === 0
          && leaks.table.applied === false && /self-check: another role holds a privilege on the signer table/.test(leaks.table.message) && leaks.table.left.schema === false && leaks.table.left.secrets === 0,
        JSON.stringify(leaks));
    } finally { for (const c of [owner, admin, node, runner, reader, service]) await c.end().catch(() => {}); }
  } finally { await su.end().catch(() => {}); await ap.end().catch(() => {}); }
} catch (e) {
  row('RS0 the suite completed', false, (e.stack || e.message || String(e)).split('\n').slice(0, 4).join(' | '));
} finally {
  if (plane) await plane.stop();
}

const failed = results.filter((r) => !r.ok);
const ev = process.argv.indexOf('--evidence');
if (ev > -1) writeFileSync(process.argv[ev + 1], JSON.stringify({ suite: 'release_signer_acceptance', results }, null, 2) + '\n');
console.log('\nrelease_signer_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length || results.length < 11 ? 1 : 0);
