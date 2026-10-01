// A DISPOSABLE PLANE for the relay's tests: an embedded PostgreSQL dressed like the Supabase project the relay is installed on.
// - the platform roles (anon, authenticated, service_role, authenticator, supabase_storage_admin) and the owner login `postgres`,
//   which is NOT a superuser (as on the live plane);
// - the default privileges that make a function created by `postgres` in schema public executable by anon and authenticated;
// - a schema "decoy" AHEAD of pg_catalog on the search_path of the owner login and of the API login, holding its own now(),
//   length(), sha256() and ~ / !~ operators that accept everything: a name the relay left unqualified would resolve there;
// - schema storage with buckets and objects (row level security on, no policy), and schema factory with a nodes table and the factory_runner login.
// Nothing here reaches any real project. The modules come from RELAY_TEST_MODULES (a node_modules holding embedded-postgres and pg).
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

export { reporter } from './helpers.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = process.env.RELAY_TEST_MODULES;
if (!MODULES || !existsSync(join(MODULES, 'embedded-postgres')) || !existsSync(join(MODULES, 'pg'))) {
  console.log('REFUSED: set RELAY_TEST_MODULES to a node_modules directory that holds embedded-postgres and pg');
  process.exit(2);
}
const EmbeddedPostgres = (await import(pathToFileURL(join(MODULES, 'embedded-postgres', 'dist', 'index.js')).href)).default;
const pg = createRequire(join(MODULES, 'resolve.cjs'))('pg');

const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const secret = () => randomBytes(18).toString('base64url');

export const BUCKET = 'factory-private-artifacts';

export async function startPlane({ bucket = 'private' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'relay-plane-'));
  const port = await freePort();
  const pass = { su: secret(), postgres: secret(), authenticator: secret(), runner: secret() };
  const server = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), user: 'supabase_admin', password: pass.su, port, persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise(); await server.start();
  const connect = async (user, pw) => { const c = new pg.Client({ host: '127.0.0.1', port, user, password: pw, database: 'postgres' }); await c.connect(); return c; };
  const su = await connect('supabase_admin', pass.su);
  await su.query(`
    create role postgres login password '${pass.postgres}' nosuperuser createdb createrole bypassrls;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator login password '${pass.authenticator}' noinherit;
    grant anon, authenticated, service_role to authenticator;
    create role factory_runner login password '${pass.runner}';
    create role supabase_storage_admin nologin;
    grant create on database postgres to postgres;
    grant usage, create on schema public to postgres;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    create schema storage authorization supabase_storage_admin;
    create table storage.buckets (id text primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
      public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
    alter table storage.buckets owner to supabase_storage_admin;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, created_at timestamptz default now());
    alter table storage.objects owner to supabase_storage_admin;
    alter table storage.objects enable row level security;
    grant all on storage.objects to postgres, anon, authenticated, service_role;
    grant usage on schema storage to postgres, anon, authenticated, service_role;
    grant all on storage.buckets to postgres, service_role;
    create schema factory authorization postgres;
    create table factory.nodes (node_id text primary key, security_role text, platform text);
    alter table factory.nodes owner to postgres;
    grant usage on schema factory to factory_runner;
    grant select, insert, update, delete on factory.nodes to factory_runner;
    create schema decoy;
    grant usage on schema decoy to public;
    create function decoy.now() returns timestamptz language sql as $d$ select 'epoch'::timestamptz $d$;
    create function decoy.clock_timestamp() returns timestamptz language sql as $d$ select 'epoch'::timestamptz $d$;
    create function decoy.gen_random_uuid() returns uuid language sql as $d$ select '00000000-0000-0000-0000-000000000000'::uuid $d$;
    create function decoy.length(text) returns integer language sql as $d$ select 0 $d$;
    create function decoy.sha256(bytea) returns bytea language sql as $d$ select '\\x00'::bytea $d$;
    create function decoy.jsonb_typeof(jsonb) returns text language sql as $d$ select 'object'::text $d$;
    create function decoy.always(text, text) returns boolean language sql as $d$ select true $d$;
    create function decoy.never(text, text) returns boolean language sql as $d$ select false $d$;
    create operator decoy.~ (leftarg = text, rightarg = text, function = decoy.always);
    create operator decoy.!~ (leftarg = text, rightarg = text, function = decoy.never);
    alter role postgres set search_path = decoy, pg_catalog, public;
    alter role authenticator set search_path = decoy, pg_catalog, public;
    alter role factory_runner set search_path = decoy, pg_catalog, public;
  `);
  if (bucket === 'private') await su.query(`insert into storage.buckets (id, name, public, file_size_limit) values ($1, $1, false, 2097152)`, [BUCKET]);
  const owner = await connect('postgres', pass.postgres);
  // the Edge Function's database identity: the API's authenticator, switched to service_role
  const api = async (role = 'service_role') => { const c = await connect('authenticator', pass.authenticator); await c.query('set role ' + role); return c; };
  const runner = () => connect('factory_runner', pass.runner);
  const clients = [su, owner];
  return {
    port, su, owner, api, runner, connect,
    track: (c) => { clients.push(c); return c; },
    applyFile: async (rel, client = owner) => client.query(readFileSync(join(ROOT, rel), 'utf8')),
    stop: async () => {
      for (const c of clients) { try { await c.end(); } catch { /* closed */ } }
      // Windows can hold the data directory for a moment after the server exits: the removal is retried, and never fails a run
      try { await server.stop(); } catch { /* the directory is removed below */ }
      for (let i = 0; i < 20; i++) { try { rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    },
  };
}

/** what a catalog read sees outside the relay's own schema: an install must add exactly one function to it, a removal nothing */
export const FINGERPRINT = `
  select pg_catalog.jsonb_build_object(
    'roles', (select jsonb_agg(x order by x) from (select rolname || ':' || rolsuper || rolcanlogin || rolbypassrls || rolcreaterole as x from pg_roles where rolname !~ '^pg_') q),
    'memberships', (select jsonb_agg(x order by x) from (select roleid::regrole::text || '>' || member::regrole::text as x from pg_auth_members where roleid::regrole::text !~ '^pg_') q),
    'extensions', (select jsonb_agg(extname order by extname) from pg_extension),
    'schemas', (select jsonb_agg(x order by x) from (select nspname || ':' || coalesce(nspacl::text, '') as x from pg_namespace where nspname !~ '^pg_' and nspname not in ('information_schema', 'factory_relay')) q),
    'relations', (select jsonb_agg(x order by x) from (select n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || c.relrowsecurity || ':' || coalesce(c.relacl::text, '') as x
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname !~ '^pg_' and n.nspname not in ('information_schema', 'factory_relay')) q),
    'functions', (select jsonb_agg(x order by x) from (select n.nspname || '.' || p.proname || ':' || coalesce(p.proacl::text, '') as x
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname !~ '^pg_' and n.nspname not in ('information_schema', 'factory_relay')) q),
    'default_acl', (select jsonb_agg(x order by x) from (select defaclrole::regrole::text || ':' || defaclnamespace::regnamespace::text || ':' || defaclobjtype::text || ':' || defaclacl::text as x from pg_default_acl) q),
    'database_acl', (select datacl::text from pg_database where datname = current_database()),
    'event_triggers', (select jsonb_agg(evtname order by evtname) from pg_event_trigger),
    'role_settings', (select count(*) from pg_db_role_setting),
    'policies', (select count(*) from pg_policy),
    'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname <> 'factory_relay'),
    'buckets', (select jsonb_agg(x order by x) from (select id || ':' || public as x from storage.buckets) q)
  ) as f`;
