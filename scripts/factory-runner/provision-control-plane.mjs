#!/usr/bin/env node
// PROVISION THE FACTORY CONTROL PLANE.  One command, run once, by the founder.
//
//   node scripts/factory-runner/provision-control-plane.mjs --admin "postgresql://.../factory_cp"
//
// It applies the schema, creates the least-privilege role, and prints the FACTORY_RUNNER_PG_URL to set on
// each node. It needs DDL rights, which is why it is not something the runner can do: creating a schema is
// a release operation and belongs to whoever holds that authority.
//
// THE POINT OF THIS FILE IS THE REFUSALS, NOT THE CREATE STATEMENTS.
//
// The realistic mistake is not a typo. It is pointing this at the Brain OS production database — because it
// is the database that is already configured, already in a shell history, already in an environment
// variable. So before it creates anything it asks whether the target looks like production, and stops if it
// does. The checks are deliberately cheap and deliberately paranoid: a false refusal costs a flag, and a
// false acceptance costs a schema created inside the production database by the tool whose entire purpose
// is to keep the Factory out of it.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
// EVERY control-plane file, in order. The first version applied 001 alone, so a plane the founder provisioned
// would have lacked the director state machine (002) and resource governance (003) that the shared-plane
// acceptance and the node path rely on. All three are idempotent, so re-running converges an existing plane.
const SCHEMA_DIR = join(ROOT, 'supabase', 'control-plane');
const SCHEMA_FILES = readdirSync(SCHEMA_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const SCHEMA = join(SCHEMA_DIR, SCHEMA_FILES[0] || '001_factory_control_plane.sql');
const ROLE = 'factory_runner';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const has = (name) => process.argv.includes(name);

// Tables whose presence means "this is Brain OS", not "this is an empty orchestration database".
const BUSINESS_TABLES = ['companies', 'people', 'profiles', 'goals', 'tasks', 'memories', 'agents',
  'person_assignments', 'financial_reports', 'sales_leads', 'documents'];

export async function inspectTarget(client) {
  const findings = [];
  const db = await client.query('select current_database() db, current_user usr, version() v');
  const name = String(db.rows[0].db);

  const biz = await client.query(
    `select table_schema, table_name from information_schema.tables
      where table_name = any($1::text[]) and table_schema not in ('information_schema','pg_catalog')`,
    [BUSINESS_TABLES]);
  if (biz.rows.length) {
    findings.push('it contains ' + biz.rows.length + ' Brain OS business table(s): '
      + biz.rows.slice(0, 5).map((r) => r.table_schema + '.' + r.table_name).join(', '));
  }

  // Supabase's own machinery. A control plane has no reason to have any of it.
  const supa = await client.query(
    `select nspname from pg_namespace where nspname in ('auth','storage','realtime','supabase_migrations','_realtime')`);
  if (supa.rows.length) {
    findings.push('it has Supabase platform schemas (' + supa.rows.map((r) => r.nspname).join(', ')
      + '), so it is a Supabase project database rather than a plain orchestration database');
  }

  const migrations = await client.query(
    `select count(*)::int n from information_schema.tables
      where table_schema = 'supabase_migrations' or table_name = 'schema_migrations'`);
  if (migrations.rows[0].n > 0) findings.push('it carries a migration history');

  return { database: name, user: String(db.rows[0].usr), version: String(db.rows[0].v).split(',')[0], findings };
}

async function main() {
  const adminUrl = arg('--admin') || process.env.FACTORY_CONTROL_PLANE_ADMIN_URL || '';
  if (!adminUrl) {
    console.log('usage: node provision-control-plane.mjs --admin "postgresql://user:pw@host:5432/db"');
    console.log('');
    console.log('  The admin URL needs DDL rights and is used ONCE. It is never stored, never written to');
    console.log('  a file, and is not what the nodes use — they get a least-privilege URL this prints.');
    console.log('');
    console.log('  --force   provision anyway after a production-shaped refusal (you must mean it)');
    console.log('  --print-only   show what would be done and change nothing');
    process.exit(2);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const target = await inspectTarget(client);
    console.log('target database   ' + target.database);
    console.log('connected as      ' + target.user);
    console.log('server            ' + target.version);
    console.log('');

    if (target.findings.length) {
      console.log('REFUSING — this looks like a PRODUCTION or product database:');
      for (const f of target.findings) console.log('  * ' + f);
      console.log('');
      console.log('The Factory Control Plane holds orchestration state only and must be a SEPARATE,');
      console.log('non-production database. Creating the factory schema inside the product database would');
      console.log('give every generic node a connection into Brain OS, which is the one thing this whole');
      console.log('design exists to prevent.');
      console.log('');
      console.log('Create an empty database and point --admin at that instead.');
      if (!has('--force')) process.exit(1);
      console.log('--force given: proceeding anyway. This is recorded here because it should be rare.');
      console.log('');
    } else {
      console.log('checks passed: no Brain OS business tables, no Supabase platform schemas, no migration history');
      console.log('');
    }

    const password = randomBytes(18).toString('base64url');

    if (has('--print-only')) {
      console.log('--print-only: nothing was changed. It would have:');
      console.log('  1. applied, in order: ' + SCHEMA_FILES.join(', '));
      console.log('  2. created role ' + ROLE + ' with a generated password: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,'
        + ' NOREPLICATION, NOBYPASSRLS, NOINHERIT');
      console.log('  3. granted connect/usage/DML on schema factory, and nothing else');
      console.log('  4. printed a FACTORY_RUNNER_PG_URL that carries sslmode=require for any host that is not loopback');
      process.exit(0);
    }

    for (const f of SCHEMA_FILES) await client.query(readFileSync(join(SCHEMA_DIR, f), 'utf8'));
    const tables = await client.query("select table_name from information_schema.tables where table_schema = 'factory' order by 1");
    console.log('schema applied (' + SCHEMA_FILES.join(', ') + '): ' + tables.rows.map((r) => r.table_name).join(', '));

    // The role's attributes are STATED, not left to defaults, and re-asserted on an existing role so a plane that was
    // provisioned by hand converges to the same shape: a login role that cannot create, cannot grant, cannot bypass RLS.
    const ATTRS = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit';
    const exists = await client.query('select 1 from pg_roles where rolname = $1', [ROLE]);
    if (exists.rows.length) {
      await client.query(`alter role ${ROLE} with ${ATTRS} password '${password}'`);
      console.log('role ' + ROLE + ' already existed; its password was rotated and its attributes re-asserted (' + ATTRS + ')');
    } else {
      await client.query(`create role ${ROLE} with ${ATTRS} password '${password}'`);
      console.log('role ' + ROLE + ' created (' + ATTRS + ')');
    }

    const dbName = (await client.query('select current_database() db')).rows[0].db;
    await client.query(`grant connect on database "${dbName}" to ${ROLE}`);
    await client.query(`grant usage on schema factory to ${ROLE}`);
    await client.query(`grant select, insert, update, delete on all tables in schema factory to ${ROLE}`);
    await client.query(`alter default privileges in schema factory grant select, insert, update, delete on tables to ${ROLE}`);
    console.log('privileges granted: connect, usage, and DML on schema factory — no DDL, no GRANT, nothing else');

    const u = new URL(adminUrl);
    u.username = ROLE;
    u.password = password;
    // TLS IS PART OF THE URL THE NODES GET. db.mjs refuses a non-loopback URL without it, so a URL printed here
    // without it would be a URL no node can use. `require` is the floor; verify-full is better when the server's
    // certificate chain is known to the nodes, and the founder may upgrade the parameter by hand.
    const remote = !/^(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)$/i.test(u.hostname);
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    if (remote && !['require', 'verify-ca', 'verify-full'].includes(mode)) u.searchParams.set('sslmode', 'require');
    console.log('');
    console.log('Set this on every node (Home PC, Work PC, Mobile Laptop):');
    console.log('');
    console.log('  FACTORY_RUNNER_PG_URL=' + u.toString());
    console.log('');
    console.log('It is printed once and stored nowhere. Rotating it later is this same command again.');
    if (remote) {
      console.log('');
      console.log('TLS: the driver verifies the certificate chain in every mode. If the server\'s certificate is not publicly');
      console.log('trusted (a provider CA, or your own), add  &sslrootcert=<path to the CA file on each node>  - and use');
      console.log('sslmode=verify-full for a DNS host, or  sslmode=verify-ca&uselibpqcompat=true  for an IP host.');
      console.log('Exact forms: qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md §0 step 2.');
    }
    console.log('Then, on each node:  bash scripts/factory-runner/bootstrap-node.sh --role generic   (Work PC: --role verifier)');
    console.log('and the two-machine acceptance: qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && /provision-control-plane\.mjs$/.test(process.argv[1])) await main();
