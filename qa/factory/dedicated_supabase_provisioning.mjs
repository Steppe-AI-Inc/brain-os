#!/usr/bin/env node
// THE DEDICATED-SUPABASE PROVISIONING MODE, PROVED ON A DISPOSABLE SERVER THAT LOOKS LIKE A SUPABASE PROJECT.
//
// The founder's project npvhuoozkbexddnvkqsj exists exclusively for the control plane. The provisioner's default rule
// refuses any database with Supabase platform schemas; --allow-dedicated-supabase <ref> is the one explicit exception,
// and everything it promises is measured here against a disposable PostgreSQL 18 dressed as a Supabase project: the
// platform schemas (auth with a users row, storage with objects, realtime, supabase_migrations with an EMPTY history),
// the platform roles (anon, authenticated, service_role, supabase_admin, authenticator), TLS on with hostssl-only rules,
// and a superuser named postgres.<ref> - the pooler's identity form - as the admin.
//
//   D1 ordinary Supabase target, no flag                         → REFUSED (platform schemas), nothing changed
//   D2 the flag with a DIFFERENT ref than the connection carries → REFUSED (identity)
//   D3 the flag with the exact ref, only platform schemas         → ALLOWED: provisioned, boundary proved, env file written
//                                                                  with sslmode=verify-full and the CA path
//   D4 a business table appears                                   → REFUSED even with the flag
//   D5 the runner cannot read auth / storage / realtime / the migration history
//   D6 the runner cannot create a schema or a table (public, factory), cannot become a platform role, is a member of none,
//      holds no privileged attribute
//   D7 the runner performs every control-plane operation through claim.mjs: register, claim, checkpoint, heartbeat,
//      complete, verify another run
//   D8 re-running the same command is idempotent (rotates the password, keeps factory.plane_identity = ref); a run naming a
//      different ref against this plane is REFUSED by the recorded identity
//   D9 the production ref is refused as a dedicated ref, and --force is refused alongside the flag
//   D10 the runner URL passes the accessor's judgement (db.mjs) and a plaintext session is refused by the server
//
// The pooler suffix: Supabase routes factory_runner.<ref> to the database role factory_runner. Without a pooler, the
// test creates a login alias "factory_runner.<ref>" that INHERITS factory_runner (the only test-side emulation here).
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PROVISION = join(ROOT, 'scripts', 'factory-runner', 'provision-control-plane.mjs');
const REF = 'npvhuoozkbexddnvkqsj';
const OTHER = 'abcdefghijklmnopqrst';
const PRODUCTION = 'pvphxgrtdfrudejjhzjk';
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(-1500) : '')); } };
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const provision = (args, env = {}) => { const r = spawnSync(process.execPath, [PROVISION, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26 }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };

const dir = mkdtempSync(join(tmpdir(), 'factory-dedicated-'));
const dataDir = join(dir, 'data');
const port = await freePort();
const superPassword = 'super_' + randomUUID().replace(/-/g, '').slice(0, 16);
const crt = join(dir, 'server.crt').replace(/\\/g, '/'), key = join(dir, 'server.key').replace(/\\/g, '/');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: superPassword, port, persistent: false,
  postgresFlags: ['-c', 'ssl=on', '-c', 'ssl_cert_file=' + crt, '-c', 'ssl_key_file=' + key], onLog: () => {}, onError: () => {} });
await pg.initialise();
// THE POOLER, EMULATED: Supabase's session pooler logs "factory_runner.<ref>" in as the database role "factory_runner".
// Here a login alias of that exact name INHERITS factory_runner, and pg_hba trusts it over TLS only - the provisioner
// generates the real password for factory_runner, which the alias cannot share. Everything else is scram, plaintext rejected.
// PREPENDED, not appended: initdb's own `host all all 127.0.0.1/32 scram` line comes first and the first match wins.
// Both address families: `localhost` resolves to ::1 first on this machine, and a v6 session would otherwise fall through
// to initdb's own `host all all ::1/128 scram` line.
// The embedded-postgres library manages the server as `postgres` over a plain loopback socket, so that one identity keeps a
// plaintext line; every other role is TLS-only and plaintext is rejected (D10 measures it for the runner).
const HBA = ['127.0.0.1/32', '::1/128'].map((net) => 'host all postgres ' + net + ' scram-sha-256\nhostssl all "factory_runner.' + REF + '" ' + net + ' trust\nhostssl all all ' + net + ' scram-sha-256\nhostnossl all all ' + net + ' reject\n').join('');
writeFileSync(join(dataDir, 'pg_hba.conf'), '# dedicated_supabase_provisioning\n' + HBA + readFileSync(join(dataDir, 'pg_hba.conf'), 'utf8'));
await pg.start();
await pg.createDatabase('postgres_like');

const { default: pgLib } = await import('pg');
const su = new pgLib.Client({ connectionString: 'postgresql://postgres:' + encodeURIComponent(superPassword) + '@localhost:' + port + '/postgres_like', ssl: { ca: readFileSync(crt), rejectUnauthorized: true, servername: 'localhost' } });
await su.connect();
// dress the database as a Supabase project
const adminPw = 'admin_' + randomUUID().replace(/-/g, '').slice(0, 12);
await su.query(`create role "postgres.${REF}" superuser login password '${adminPw}'`);
for (const r of ['anon', 'authenticated', 'service_role']) await su.query('create role ' + r + ' nologin');
await su.query('create role authenticator noinherit login password \'x\'');
await su.query('create role supabase_admin superuser nologin');
await su.query('create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text); insert into auth.users (email) values (\'someone@example.com\');');
await su.query('create schema storage; create table storage.objects (id uuid primary key default gen_random_uuid(), name text); insert into storage.objects (name) values (\'file\');');
await su.query('create schema realtime; create table realtime.subscription (id bigint primary key);');
await su.query('create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key);');
await su.query('create schema extensions;');
await su.query('grant usage on schema auth, storage, realtime to anon, authenticated, service_role; grant all on all tables in schema auth, storage, realtime to service_role;');
// the role the provisioner will (re)shape, and the pooler-form alias that inherits it (see the pg_hba note above)
await su.query('create role factory_runner nologin');
await su.query(`create role "factory_runner.${REF}" login inherit in role factory_runner`);
const adminUrl = 'postgresql://' + encodeURIComponent('postgres.' + REF) + ':' + encodeURIComponent(adminPw) + '@localhost:' + port + '/postgres_like';
const envFile = join(dir, 'runner.env');

try {
  // D1
  const d1 = provision(['--admin', adminUrl, '--print-only', '--ca', crt]);
  check('D1 an ordinary Supabase-shaped target without the flag is REFUSED on its platform schemas', d1.rc === 1 && /REFUSING/.test(d1.out) && /platform schemas/.test(d1.out) && /--allow-dedicated-supabase/.test(d1.out), d1.out);

  // D2
  const d2 = provision(['--admin', adminUrl, '--allow-dedicated-supabase', OTHER, '--ca', crt, '--print-only']);
  check('D2 the flag with a different ref than the connection carries is REFUSED on identity', d2.rc === 1 && /identity/.test(d2.out) && new RegExp('carries ' + REF).test(d2.out), d2.out);

  // D9 (early: pure refusals)
  const d9a = provision(['--admin', adminUrl, '--allow-dedicated-supabase', PRODUCTION, '--ca', crt, '--print-only']);
  const d9b = provision(['--admin', adminUrl, '--allow-dedicated-supabase', REF, '--force', '--ca', crt, '--print-only']);
  check('D9 the production ref cannot be declared dedicated, and --force is refused alongside the flag', d9a.rc === 1 && /production project cannot be declared/.test(d9a.out) && d9b.rc === 1 && /--force cannot be combined/.test(d9b.out), d9a.out + d9b.out);

  // D3
  const d3 = provision(['--admin', adminUrl, '--allow-dedicated-supabase', REF, '--ca', crt, '--write-env', envFile]);
  const envLine = existsSync(envFile) ? readFileSync(envFile, 'utf8').trim() : '';
  const runnerUrl = envLine.replace(/^FACTORY_RUNNER_PG_URL=/, '');
  const ru = runnerUrl ? new URL(runnerUrl) : null;
  check('D3 the exact dedicated ref with only platform schemas is ALLOWED: provisioned, boundary proved as the runner, env file written with verify-full and the CA path, URL not printed',
    d3.rc === 0 && /checks passed/.test(d3.out) && /TLS +in use/.test(d3.out) && /hardened:/.test(d3.out) && /plane_identity = npvhuoozkbexddnvkqsj/.test(d3.out)
      && ru && decodeURIComponent(ru.username) === 'factory_runner.' + REF && ru.searchParams.get('sslmode') === 'verify-full' && ru.searchParams.get('sslrootcert') && !d3.out.includes(decodeURIComponent(ru.password)), d3.out);
  if (!runnerUrl) throw new Error('D3 produced no runner URL; the dependent rows D5-D8, D10 cannot run');
  const asRunner = async (fn) => { const c = new pgLib.Client({ connectionString: runnerUrl }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
  const denied = async (c, sql) => { try { await c.query(sql); return false; } catch (e) { return ['42501', '3F000', '42P01', '0LP01'].includes(e.code); } };

  // D4
  await su.query('create table public.companies (id uuid primary key default gen_random_uuid(), name text)');
  const d4 = provision(['--admin', adminUrl, '--allow-dedicated-supabase', REF, '--ca', crt, '--print-only']);
  check('D4 a business table appearing is REFUSED even with the flag', d4.rc === 1 && /business table/.test(d4.out), d4.out);
  await su.query('drop table public.companies');

  // D5
  const d5 = await asRunner(async (c) => ({
    auth: await denied(c, 'select count(*) from auth.users'), storage: await denied(c, 'select count(*) from storage.objects'),
    realtime: await denied(c, 'select count(*) from realtime.subscription'), hist: await denied(c, 'select count(*) from supabase_migrations.schema_migrations'),
    pub: await denied(c, 'select count(*) from information_schema.tables where table_schema = \'public\' and 1 = (select 0)') === false, // information_schema is readable; that is fine
  }));
  check('D5 the runner cannot read auth.users, storage.objects, realtime.subscription or the migration history', d5.auth && d5.storage && d5.realtime && d5.hist, JSON.stringify(d5));

  // D6
  const d6 = await asRunner(async (c) => {
    const attrs = (await c.query('select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication from pg_roles where rolname = current_user')).rows[0];
    const members = (await c.query('select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles g on g.oid = m.member where g.rolname = current_user')).rows.map((x) => x.rolname);
    return { attrs, members, schema: await denied(c, 'create schema evil'), pub: await denied(c, 'create table public.evil (x int)'), fac: await denied(c, 'create table factory.evil (x int)'),
      service: await denied(c, 'set role service_role'), postgres: await denied(c, 'set role postgres'), admin: await denied(c, 'set role supabase_admin') };
  });
  check('D6 the runner cannot create a schema or a table anywhere, cannot become service_role/postgres/supabase_admin, is a member of no platform role (only factory_runner), holds no privileged attribute',
    d6.schema && d6.pub && d6.fac && d6.service && d6.postgres && d6.admin && d6.members.every((m) => m === 'factory_runner') && !d6.attrs.rolsuper && !d6.attrs.rolcreatedb && !d6.attrs.rolcreaterole && !d6.attrs.rolbypassrls && !d6.attrs.rolreplication, JSON.stringify(d6));

  // D7: the control-plane operations through the runner's own path
  process.env.FACTORY_RUNNER_PG_URL = runnerUrl; process.env.FACTORY_ADMISSION = 'off';
  const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href + '?d7=' + Date.now());
  const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href + '?d7=' + Date.now());
  let d7 = '';
  try {
    await claim.registerNode({ nodeId: 'node-d7-author', capabilities: ['x'], securityRole: 'generic', platform: 'test A' });
    await claim.registerNode({ nodeId: 'node-d7-verifier', capabilities: ['x'], securityRole: 'verifier', platform: 'test B' });
    const wo1 = randomUUID(), wo2 = randomUUID();
    await db.write("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'D7 authored', $2::text[], 'high', 'queued')", [wo1, ['d7/a']]);
    await db.write("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role) values ($1, 'D7 verification', $2::text[], 'high', 'queued', 'verifier')", [wo2, ['d7/v']]);
    const r1 = await claim.claimWork({ nodeId: 'node-d7-author', leaseSeconds: 30, onlyWorkOrderId: wo1 });
    await claim.checkpoint({ runId: r1.run_id, workOrderId: wo1, location: 'd7', scenario: 's', payload: { ok: true } });
    await claim.heartbeat({ runId: r1.run_id, nodeId: 'node-d7-author', leaseSeconds: 30 });
    await claim.completeRun({ runId: r1.run_id, status: 'done', terminationReason: 'completed' });
    const r2 = await claim.claimWork({ nodeId: 'node-d7-verifier', leaseSeconds: 30, onlyWorkOrderId: wo2 });
    const v = await claim.recordVerification({ authoringRunId: r1.run_id, verificationRunId: r2.run_id });
    await claim.completeRun({ runId: r2.run_id, status: 'done', terminationReason: 'completed_with_verdict' });
    const done = (await db.read("select count(*)::int n from factory.work_orders where work_order_id in ($1, $2) and status = 'done'", [wo1, wo2])).rows[0].n;
    d7 = 'verification accepted=' + v.accepted + ', done=' + done;
    check('D7 the runner performs every control-plane operation: register, claim, checkpoint, heartbeat, complete, verify another run (' + d7 + ')', v.accepted && done === 2, d7);
  } catch (e) { check('D7 the runner performs every control-plane operation', false, e.message); }

  // D8
  const d8a = provision(['--admin', adminUrl, '--allow-dedicated-supabase', REF, '--ca', crt, '--write-env', envFile]);
  const d8b = provision(['--admin', adminUrl, '--allow-dedicated-supabase', OTHER, '--ca', crt, '--print-only']);
  const ident = (await su.query('select project_ref from factory.plane_identity')).rows.map((r) => r.project_ref);
  check('D8 re-running is idempotent (password rotated, identity kept = ref); a different ref against this plane is refused', d8a.rc === 0 && /already existed; its password was rotated/.test(d8a.out) && ident.length === 1 && ident[0] === REF && d8b.rc === 1 && /identity/.test(d8b.out), d8a.out.slice(-300) + d8b.out.slice(-300));

  // D11: a CA that does not sign the server's certificate is refused, and the refusal names the certificate the server
  // presented (diagnosis only; the connection stays refused)
  const otherCrt = join(dir, 'other.crt').replace(/\\/g, '/'), otherKey = join(dir, 'other.key').replace(/\\/g, '/');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', otherKey, '-out', otherCrt, '-days', '1', '-subj', '/CN=not-the-plane'], { stdio: 'ignore' });
  const d11 = provision(['--admin', adminUrl, '--allow-dedicated-supabase', REF, '--ca', otherCrt, '--print-only']);
  check('D11 a CA that does not sign the server certificate is REFUSED (verify-full), and the refusal names the presented certificate for the rerun',
    d11.rc === 1 && /cannot connect with TLS verified/.test(d11.out) && /server certificate: .*"subject":"localhost"/.test(d11.out) && !/checks passed/.test(d11.out), d11.out);

  // D10
  const assess = db.assessUrl(runnerUrl);
  let plainRefused = '';
  try { const c = new pgLib.Client({ connectionString: runnerUrl.replace(/sslmode=verify-full/, 'sslmode=disable'), ssl: false }); await c.connect(); await c.end(); } catch (e) { plainRefused = e.message; }
  check('D10 the runner URL passes the accessor\'s judgement, and the server refuses a plaintext session', assess === null && /pg_hba|no encryption|reject/i.test(plainRefused), 'assess=' + assess + ' plaintext=' + plainRefused);
} finally {
  try { await su.end(); } catch { /* closed */ }
  try { await pg.stop(); } catch { /* down */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
}
console.log('');
console.log('dedicated_supabase_provisioning: ' + pass + ' passed, ' + failures.length + ' failed  (disposable TLS server dressed as a Supabase project; nothing reached any real project)');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
process.exit(0);
