// Regressions for the canonical factory DB accessor. Pure: no connection is ever opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement, read, write, FactoryDbRefusal } from './db.mjs';

test('DML is allowed', () => {
  for (const s of ['insert into public.agent_runs (id) values (1)', 'update public.tasks set status=$1 where id=$2',
    'delete from public.worker_heartbeats where stale', 'select * from public.tasks']) {
    assert.equal(classifyStatement(s), null, s);
  }
});

test('FACTORY_WORKER_CANNOT_EXECUTE_DDL_OR_TOUCH_MIGRATION_HISTORY', () => {
  const cases = [
    ['create table public.evil(x int)', 'DDL (CREATE)'],
    ['ALTER TABLE public.agents ADD COLUMN has_production_authority boolean', 'DDL (ALTER)'],
    ['drop schema public cascade', 'DDL (DROP)'],
    ['grant all on schema public to anon', 'privilege change'],
    ['revoke select on public.finance from authenticated', 'privilege change'],
    ["insert into supabase_migrations.schema_migrations (version) values ('202609020003')", 'migration history'],
    ['delete from supabase_migrations.schema_migrations where version = $1', 'migration history'],
    ['truncate public.tasks', 'TRUNCATE'],
    ['set role service_role', 'role escalation'],
    ['create function f() returns void language sql security definer as $$ select 1 $$', 'DDL (CREATE)'],
  ];
  for (const [sql, expected] of cases) assert.equal(classifyStatement(sql), expected, sql);
});

test('read() refuses a mutating statement before connecting', async () => {
  await assert.rejects(() => read('update public.tasks set status = 1'), FactoryDbRefusal);
});

test('NO_FALLBACK_TO_AMBIENT_AUTHORITY — without FACTORY_RUNNER_PG_URL every call refuses', async () => {
  // This test file is run with the variable unset. If someone adds a fallback to `--linked`, this
  // read would succeed on any machine holding the CLI credential — which is the machine this test
  // was written on.
  assert.equal(process.env.FACTORY_RUNNER_PG_URL || '', '', 'run this test with FACTORY_RUNNER_PG_URL unset');
  await assert.rejects(() => read('select 1'), (e) => e instanceof FactoryDbRefusal && /no fallback/.test(e.message));
  await assert.rejects(() => write('insert into public.x values (1)'), FactoryDbRefusal);
});

// TWO MACHINES, ONE PLANE (Factory V1, the two-machine boundary): the URL is judged before a socket opens.
test('FAIL_CLOSED_ON_AN_UNSAFE_URL — pure assessment, no connection', async () => {
  const { assessUrl } = await import('./db.mjs');
  const ok = (u) => assert.equal(assessUrl(u), null, u);
  const no = (u, re) => assert.match(String(assessUrl(u)), re, u);
  no('', /not set/);
  no('not a url', /not a URL/);
  no('https://factory_runner:pw@db.example.net:5432/cp?sslmode=require', /not a postgresql/);
  // the superuser under each of its names, TLS or not
  no('postgresql://postgres:pw@db.example.net:5432/cp?sslmode=require', /superuser/);
  no('postgresql://postgres.abcdefghijklmnop:pw@aws-0-x.pooler.example.net:6543/cp?sslmode=require', /superuser/);
  no('postgresql://supabase_admin:pw@127.0.0.1:5432/cp', /superuser/);
  // the production project, however it is reached and even over TLS
  no('postgresql://factory_runner:pw@db.pvphxgrtdfrudejjhzjk.supabase.co:5432/postgres?sslmode=verify-full', /PRODUCTION project/);
  no('postgresql://factory_runner:pw@aws-0-ap.pooler.example.net:6543/postgres?sslmode=require&options=project%3Dpvphxgrtdfrudejjhzjk', /PRODUCTION project|over a network/);
  // a network crossed in the clear
  no('postgresql://factory_runner:pw@db.example.net:5432/cp', /over a network with sslmode=\(none\)/);
  no('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=disable', /sslmode=disable/);
  no('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=prefer', /sslmode=prefer/);
  no('postgresql://factory_runner:pw@192.168.1.20:54329/cp', /over a network/);
  no('postgresql://factory_runner:pw@100.64.0.9:54329/cp', /over a network/); // a private overlay address still crosses a network
  // what is allowed: TLS across a network, or loopback in the clear
  ok('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=require');
  ok('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=verify-full');
  ok('postgresql://factory_runner:pw@100.64.0.9:54329/cp?sslmode=require');
  ok('postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane');
  ok('postgresql://factory_runner:pw@localhost:54329/factory_control_plane');
  ok('postgresql://factory_runner:pw@[::1]:54329/factory_control_plane');
  // an operator-declared forbidden mark is honoured too
  process.env.FACTORY_FORBIDDEN_HOST_MARKS = 'staging-prod-copy';
  try { no('postgresql://factory_runner:pw@staging-prod-copy.example.net:5432/cp?sslmode=require', /PRODUCTION project/); }
  finally { delete process.env.FACTORY_FORBIDDEN_HOST_MARKS; }
});

test('an unsafe URL is refused by read() before any driver is loaded', async () => {
  process.env.FACTORY_RUNNER_PG_URL = 'postgresql://factory_runner:pw@db.example.net:5432/cp';
  try {
    const { read: r3 } = await import('./db.mjs?plain=' + Date.now());
    await assert.rejects(() => r3('select 1'), (e) => e.name === 'FactoryDbRefusal' && /over a network/.test(e.message));
  } finally { delete process.env.FACTORY_RUNNER_PG_URL; }
});

test('a superuser connection string is refused as not least-privilege', async () => {
  process.env.FACTORY_RUNNER_PG_URL = 'postgres://postgres:pw@localhost:5432/postgres';
  try {
    const { read: r2 } = await import('./db.mjs?superuser=' + Date.now());
    // The re-import is a distinct module instance, so its FactoryDbRefusal is a distinct class;
    // match by name and message rather than instanceof.
    await assert.rejects(() => r2('select 1'), (e) => e.name === 'FactoryDbRefusal' && /superuser/.test(e.message));
  } finally { delete process.env.FACTORY_RUNNER_PG_URL; }
});

test('the query string cannot override who or where: user/host/port/password settings and repeated keys are refused', async () => {
  const { assessUrl } = await import('./db.mjs');
  const refused = (u, why) => { const r = assessUrl(u); assert.ok(r, 'should refuse ' + u); assert.match(r, why); };
  // pg lets these override the URL's own user and host (verification 2026-09-24, round 3)
  refused('postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane?user=postgres', /\?user=/);
  refused('postgresql://factory_runner:pw@127.0.0.1:54329/factory_control_plane?host=10.255.255.1', /\?host=/);
  refused('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=verify-full&port=6543', /\?port=/);
  refused('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=verify-full&password=other', /\?password=/);
  refused('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=require&ssl=false', /\?ssl=/);
  // pg takes the LAST of a repeated key; the check would read the first
  refused('postgresql://factory_runner:pw@db.example.net:5432/cp?sslmode=require&sslmode=disable', /repeats sslmode/);
  // what the Factory writes still passes
  assert.equal(assessUrl('postgresql://factory_runner.abc:pw@aws-0-x.pooler.example.com:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Cca.crt'), null);
  assert.equal(assessUrl('postgresql://factory_runner:pw@192.168.1.5:5432/cp?sslmode=verify-ca&sslrootcert=%2Fca.crt&uselibpqcompat=true'), null);
});

test('the production guard cannot be bypassed by percent-encoding: escapes are decoded one by one, and a malformed user name is refused, not thrown', async () => {
  const { assessUrl } = await import('./db.mjs');
  // one encoded letter of the ref plus an undecodable escape elsewhere used to make the whole-URL decode throw, so the raw
  // text was searched and missed the ref, while pg decodes each part and connects to production (verification round 4)
  const r1 = assessUrl('postgresql://factory_runner.%70vphxgrtdfrudejjhzjk:pw@aws-0-x.pooler.supabase.com:5432/postgres?sslmode=require&application_name=%C0');
  assert.ok(r1 && /PRODUCTION/.test(r1), String(r1));
  const r2 = assessUrl('postgresql://factory_runner:p%ss@db.%70vphxgrtdfrudejjhzjk.supabase.co:5432/postgres?sslmode=require');
  assert.ok(r2 && /PRODUCTION/.test(r2), String(r2));
  let r3; assert.doesNotThrow(() => { r3 = assessUrl('postgresql://fact%zzory:pw@127.0.0.1:5432/db'); });
  assert.ok(r3 && /malformed percent-escape/.test(r3), String(r3));
});

test('what pg would re-encode or cannot decode is refused: a space or a bare % anywhere, a malformed escape in the password or database', async () => {
  const { assessUrl } = await import('./db.mjs');
  const ca = encodeURIComponent('C:\\Users\\Work PC\\.brain-factory\\supabase-root-2021-ca.crt');
  // the provisioner's form passes: every escape a two-hex-digit pair
  assert.equal(assessUrl('postgresql://factory_runner.abc:pw@plane.example.com:5432/postgres?sslmode=verify-full&sslrootcert=' + ca), null);
  // a bare '%' in the password made pg-connection-string re-encode the whole URL and double-encode the CA path's %3A / %5C: the
  // preflight said OK and the worker crash-looped on ENOENT (verification round 4)
  assert.match(String(assessUrl('postgresql://factory_runner.abc:50%off@plane.example.com:5432/postgres?sslmode=verify-full&sslrootcert=' + ca)), /re-encode/);
  assert.match(String(assessUrl('postgresql://factory_runner.abc:pw@plane.example.com:5432/postgres?sslmode=verify-full&sslrootcert=C:/Work PC/ca.crt')), /re-encode/);
  assert.match(String(assessUrl('postgresql://factory_runner.abc:pw%E0@plane.example.com:5432/postgres?sslmode=require')), /malformed percent-escape in its password/);
  assert.match(String(assessUrl('postgresql://factory_runner.abc:pw@127.0.0.1:5432/db%E0')), /malformed percent-escape in its database/);
});

test('nothing may come from the environment: a URL without user, password, port or database is refused', async () => {
  const { assessUrl } = await import('./db.mjs');
  // pg fills what the URL leaves out from PGUSER / PGPASSWORD / PGPORT / PGDATABASE: a userless URL ran a worker as the superuser
  // from PGUSER=postgres (verification round 4)
  assert.match(String(assessUrl('postgresql://127.0.0.1:5432/factory_control_plane')), /names no user/);
  assert.match(String(assessUrl('postgresql://factory_runner@127.0.0.1:5432/factory_control_plane')), /no password/);
  assert.match(String(assessUrl('postgresql://factory_runner:pw@127.0.0.1/factory_control_plane')), /names no port/);
  assert.match(String(assessUrl('postgresql://factory_runner:pw@127.0.0.1:5432')), /names no database/);
  assert.equal(assessUrl('postgresql://factory_runner:pw@127.0.0.1:5432/factory_control_plane'), null);
});
