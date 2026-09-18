#!/usr/bin/env node
// PROVISION THE FACTORY CONTROL PLANE.  One command, run once, by the founder.
//
//   node scripts/factory-runner/provision-control-plane.mjs --admin "postgresql://.../factory_cp"
//   node scripts/factory-runner/provision-control-plane.mjs --admin "<session pooler url>" \
//        --allow-dedicated-supabase <project ref> [--ca <pem>] --write-env <path>
//
// It applies the schema, creates the least-privilege role, PROVES the role's boundary from a fresh connection as that
// role, and hands the nodes their FACTORY_RUNNER_PG_URL - written to a file with --write-env, printed otherwise. It
// needs DDL rights, which is why it is not something the runner can do: creating a schema is a release operation.
//
// THE POINT OF THIS FILE IS THE REFUSALS, NOT THE CREATE STATEMENTS.
//
// The realistic mistake is not a typo. It is pointing this at the Brain OS production database - the one already in
// a shell history and an environment variable. So before it creates anything it asks whether the target looks like
// production, and stops if it does. DEFAULT RULE (unchanged, founder requirement 1 of 2026-09-18): a database with
// Supabase platform schemas or a migration history is REFUSED, because a Supabase project is where the product lives.
//
// THE ONE EXPLICIT EXCEPTION: --allow-dedicated-supabase <ref>. The founder created a Supabase project exclusively for
// the control plane, so for THAT project and no other the platform schemas and the platform's own (empty) migration
// history are allowed. Everything else stays refused: business tables, an applied migration history, the production
// project by name, a connection whose identity does not carry exactly the stated ref, a connection that is not
// TLS-verified against the Supabase root CA. The mode also hardens the runner role beyond the default (no access to
// auth/storage/realtime/public, no membership in any platform role, no CREATE on the database) and records the plane's
// identity in factory.plane_identity so a later run against a different project refuses.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
// EVERY control-plane file, in order. All idempotent, so re-running converges an existing plane.
const SCHEMA_DIR = join(ROOT, 'supabase', 'control-plane');
const SCHEMA_FILES = readdirSync(SCHEMA_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const ROLE = 'factory_runner';
const ATTRS = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit';
// The Brain OS production project. Refused by name wherever it appears; db.mjs applies the same mark.
const PRODUCTION_MARKS = ['pvphxgrtdfrudejjhzjk'];
// Supabase Root 2021 CA, pinned. Fetched 2026-09-18 from Supabase's public download; a downloaded file that does not
// hash to this is refused. --ca <pem> overrides the download (its fingerprint is printed, never trusted silently).
const SUPABASE_CA_URL = 'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
const SUPABASE_CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const PLATFORM_SCHEMAS = ['auth', 'storage', 'realtime', 'supabase_migrations', '_realtime', 'extensions', 'graphql', 'graphql_public', 'vault', 'pgsodium', 'supabase_functions', 'net'];
const PLATFORM_ROLES = ['anon', 'authenticated', 'service_role', 'supabase_admin', 'authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'dashboard_user', 'pgbouncer'];
const REF_RE = /^[a-z]{20}$/;

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const has = (name) => process.argv.includes(name);

// Tables whose presence means "this is Brain OS", not "this is an empty orchestration database".
const BUSINESS_TABLES = ['companies', 'people', 'profiles', 'goals', 'tasks', 'memories', 'agents',
  'person_assignments', 'financial_reports', 'sales_leads', 'documents', 'company_memberships', 'company_invitations'];

/** What the target looks like. `dedicatedRef` switches ONLY the platform-schema / platform-history rule. */
export async function inspectTarget(client, { dedicatedRef = null } = {}) {
  const findings = [];
  const notes = [];
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

  const supa = await client.query(
    `select nspname from pg_namespace where nspname in ('auth','storage','realtime','supabase_migrations','_realtime')`);
  const schemas = supa.rows.map((r) => r.nspname);
  if (schemas.length && !dedicatedRef) {
    findings.push('it has Supabase platform schemas (' + schemas.join(', ')
      + '), so it is a Supabase project database rather than a plain orchestration database'
      + ' (a project created EXCLUSIVELY for the control plane needs --allow-dedicated-supabase <its ref>)');
  } else if (schemas.length) {
    notes.push('Supabase platform schemas present (' + schemas.join(', ') + ') - allowed for the dedicated project ' + dedicatedRef + ' only');
  }

  const migrations = await client.query(
    `select count(*)::int n from information_schema.tables
      where table_schema = 'supabase_migrations' or table_name = 'schema_migrations'`);
  let applied = 0;
  if (migrations.rows[0].n > 0) {
    try { applied = (await client.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n; } catch { applied = 0; }
    if (!dedicatedRef) findings.push('it carries a migration history');
    else if (applied > 0) findings.push('it carries an APPLIED migration history (' + applied + ' migration(s)): a product database, not an empty dedicated one');
    else notes.push('the platform migration-history table exists and is empty - allowed for the dedicated project');
  }

  return { database: name, user: String(db.rows[0].usr), version: String(db.rows[0].v).split(',')[0], findings, notes, schemas, applied };
}

/** The project identity carried by a connection: every 20-letter token in the host and the username. */
export function refsInUrl(url) {
  let u; try { u = new URL(url); } catch { return []; }
  const parts = [decodeURIComponent(u.username || ''), u.hostname || ''].join('.').split(/[.\-@:/]/);
  return [...new Set(parts.filter((p) => REF_RE.test(p)))];
}

/** PostgreSQL's SSLRequest, then a TLS handshake that VERIFIES NOTHING and is used for nothing but reading the peer
 *  certificate's subject, issuer and fingerprint. No credential is ever sent on this socket. */
async function diagnoseServerCertificate(host, port) {
  const net = await import('node:net');
  const tls = await import('node:tls');
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port }, () => {
      const req = Buffer.alloc(8); req.writeInt32BE(8, 0); req.writeInt32BE(80877103, 4); sock.write(req);
    });
    sock.once('data', (d) => {
      if (String(d) !== 'S') { sock.destroy(); return resolve({ tls: false, note: 'the server does not offer TLS on this port' }); }
      const t = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false }, () => {
        const c = t.getPeerCertificate(true);
        const chain = []; let cur = c; while (cur && chain.length < 5) { chain.push({ subject: cur.subject && cur.subject.CN, issuer: cur.issuer && cur.issuer.CN, fingerprint256: cur.fingerprint256 }); if (!cur.issuerCertificate || cur.issuerCertificate === cur) break; cur = cur.issuerCertificate; }
        t.destroy(); resolve({ tls: true, chain });
      });
      t.once('error', (e) => { t.destroy(); reject(e); });
    });
    sock.once('error', reject);
    sock.setTimeout(8000, () => { sock.destroy(); reject(new Error('timeout')); });
  });
}

async function resolveCa() {
  const given = arg('--ca');
  if (given) {
    const pem = readFileSync(given, 'utf8');
    const cert = new X509Certificate(pem);
    return { path: resolve(given), pem, subject: cert.subject.replace(/\n/g, ', '), fingerprint: cert.fingerprint256, pinned: createHash('sha256').update(pem).digest('hex') === SUPABASE_CA_SHA256 };
  }
  const dir = join(homedir(), '.brain-factory');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'supabase-root-2021-ca.crt');
  let pem = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (createHash('sha256').update(pem).digest('hex') !== SUPABASE_CA_SHA256) {
    const res = await fetch(SUPABASE_CA_URL);
    pem = await res.text();
    if (createHash('sha256').update(pem).digest('hex') !== SUPABASE_CA_SHA256) {
      throw new Error('the downloaded Supabase root CA does not match the pinned sha256 ' + SUPABASE_CA_SHA256 + ' - refusing to trust it; pass --ca <pem> from the Supabase dashboard instead');
    }
    writeFileSync(path, pem);
  }
  const cert = new X509Certificate(pem);
  return { path, pem, subject: cert.subject.replace(/\n/g, ', '), fingerprint: cert.fingerprint256, pinned: true };
}

async function main() {
  const adminUrl = arg('--admin') || process.env.FACTORY_CONTROL_PLANE_ADMIN_URL || '';
  const dedicatedRef = arg('--allow-dedicated-supabase');
  const writeEnv = arg('--write-env');
  if (!adminUrl) {
    console.log('usage: node provision-control-plane.mjs --admin "postgresql://user:pw@host:5432/db" [options]');
    console.log('');
    console.log('  The admin URL needs DDL rights and is used ONCE. It is never stored, never written to');
    console.log('  a file, and is not what the nodes use - they get a least-privilege URL this produces.');
    console.log('');
    console.log('  --allow-dedicated-supabase <ref>   the target is a Supabase project created EXCLUSIVELY for the control plane;');
    console.log('                                     its platform schemas are allowed for THAT ref only, identity is verified,');
    console.log('                                     TLS is verified against the Supabase root CA, the runner role is hardened');
    console.log('  --ca <pem>        the CA to verify the server with (default: the pinned Supabase Root 2021 CA, downloaded once)');
    console.log('  --write-env <p>   write FACTORY_RUNNER_PG_URL=<url> to this file instead of printing the URL');
    console.log('  --print-only      show what would be done and change nothing');
    console.log('  --force           provision anyway after a production-shaped refusal (you must mean it; never with --allow-dedicated-supabase)');
    process.exit(2);
  }
  if (dedicatedRef !== null && !REF_RE.test(String(dedicatedRef))) {
    console.log('REFUSING - --allow-dedicated-supabase needs a project ref (20 lowercase letters), got ' + JSON.stringify(dedicatedRef));
    process.exit(1);
  }
  if (dedicatedRef && has('--force')) { console.log('REFUSING - --force cannot be combined with --allow-dedicated-supabase: the dedicated mode is the explicit authorization, and nothing overrides its refusals'); process.exit(1); }

  // ---- the production project, by name, before any connection -----------------------------------------------------------
  const lowerUrl = adminUrl.toLowerCase();
  for (const mark of PRODUCTION_MARKS) {
    if (lowerUrl.includes(mark)) { console.log('REFUSING - the admin URL names the PRODUCTION project (' + mark + '). The control plane is never inside the product.'); process.exit(1); }
  }
  if (dedicatedRef && PRODUCTION_MARKS.includes(dedicatedRef)) { console.log('REFUSING - the production project cannot be declared a dedicated control plane'); process.exit(1); }

  // ---- identity and TLS, in the dedicated mode --------------------------------------------------------------------------
  let ca = null;
  if (dedicatedRef) {
    const refs = refsInUrl(adminUrl);
    if (!refs.includes(dedicatedRef)) {
      console.log('REFUSING - the connection\'s identity (host/username) does not carry the dedicated project ref ' + dedicatedRef
        + (refs.length ? ' (it carries ' + refs.join(', ') + ')' : ' (it carries no project ref at all)') + '. The flag names one project; the URL must be that project.');
      process.exit(1);
    }
    const others = refs.filter((r) => r !== dedicatedRef);
    if (others.length) { console.log('REFUSING - the connection carries another project ref as well (' + others.join(', ') + ')'); process.exit(1); }
    try { ca = await resolveCa(); } catch (e) { console.log('REFUSING - ' + e.message); process.exit(1); }
    console.log('TLS root       ' + ca.subject + (ca.pinned ? ' (pinned Supabase Root 2021 CA)' : ' (--ca given; fingerprint ' + ca.fingerprint + ')'));
  }

  const { default: pg } = await import('pg');
  const clientConfig = { connectionString: adminUrl };
  if (!dedicatedRef && arg('--ca')) { try { ca = await resolveCa(); } catch (e) { console.log('REFUSING - ' + e.message); process.exit(1); } }
  const adminHost = new URL(adminUrl).hostname, adminPort = Number(new URL(adminUrl).port || 5432);
  if (ca) {
    // verify-full, stated in code: the chain against the CA and the hostname against the certificate. Never rejectUnauthorized=false.
    // The URL's own ssl parameters are dropped so nothing in the string can weaken what is set here.
    const clean = new URL(adminUrl);
    for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) clean.searchParams.delete(k);
    clientConfig.connectionString = clean.toString();
    clientConfig.ssl = { ca: ca.pem, rejectUnauthorized: true, servername: adminHost };
  }
  const client = new pg.Client(clientConfig);
  try { await client.connect(); } catch (e) {
    console.log('REFUSING - cannot connect' + (ca ? ' with TLS verified against the CA' : '') + ': ' + String(e.message).slice(0, 200));
    if (ca && /certificate|CERT|self.signed|altname|unable to verify/i.test(String(e.message))) {
      // DIAGNOSIS ONLY: read the certificate the server presents (a public artefact; no credential is sent), so the rerun
      // can name the right CA. The connection above stays refused; nothing proceeds unverified.
      const seen = await diagnoseServerCertificate(adminHost, adminPort).catch((err) => ({ error: err.message }));
      console.log('server certificate: ' + JSON.stringify(seen));
      console.log('If the issuer is not the Supabase Root 2021 CA, pass --ca <the issuing CA in PEM> (from the Supabase dashboard, Database > SSL), or use the direct host db.<ref>.supabase.co.');
    }
    process.exit(1);
  }

  try {
    if (dedicatedRef) {
      const ssl = (await client.query('select ssl, version from pg_stat_ssl where pid = pg_backend_pid()')).rows[0];
      if (!ssl || ssl.ssl !== true) { console.log('REFUSING - the admin session is not encrypted (pg_stat_ssl.ssl is not true)'); process.exit(1); }
      console.log('TLS            in use (' + ssl.version + '), chain and hostname verified');
    }
    const target = await inspectTarget(client, { dedicatedRef });
    console.log('target database   ' + target.database);
    console.log('connected as      ' + target.user);
    console.log('server            ' + target.version);
    if (dedicatedRef) {
      // the in-database identity, once it exists, must agree with the flag
      const ident = await client.query("select to_regclass('factory.plane_identity') r");
      if (ident.rows[0].r) {
        const row = (await client.query('select project_ref from factory.plane_identity')).rows[0];
        if (row && row.project_ref !== dedicatedRef) target.findings.push('this plane was provisioned for project ' + row.project_ref + ' (factory.plane_identity), not ' + dedicatedRef);
        else if (row) target.notes.push('factory.plane_identity already names ' + dedicatedRef);
      }
    }
    for (const n of target.notes) console.log('note              ' + n);
    console.log('');

    if (target.findings.length) {
      console.log('REFUSING - this looks like a PRODUCTION or product database' + (dedicatedRef ? ', or not the dedicated project' : '') + ':');
      for (const f of target.findings) console.log('  * ' + f);
      console.log('');
      console.log('The Factory Control Plane holds orchestration state only and must be a SEPARATE,');
      console.log('non-production database. Creating the factory schema inside the product database would');
      console.log('give every generic node a connection into Brain OS, which is the one thing this whole');
      console.log('design exists to prevent.');
      if (!has('--force') || dedicatedRef) process.exit(1);
      console.log('--force given: proceeding anyway. This is recorded here because it should be rare.');
      console.log('');
    } else {
      console.log('checks passed: no Brain OS business tables' + (dedicatedRef ? ', platform schemas allowed for ' + dedicatedRef + ' only, no applied migration history, identity verified' : ', no Supabase platform schemas, no migration history'));
      console.log('');
    }

    const password = randomBytes(18).toString('base64url');
    if (has('--print-only')) {
      console.log('--print-only: nothing was changed. It would have:');
      console.log('  1. applied, in order: ' + SCHEMA_FILES.join(', '));
      console.log('  2. created role ' + ROLE + ' with a generated password: ' + ATTRS.toUpperCase());
      console.log('  3. granted connect/usage/DML on schema factory, and nothing else' + (dedicatedRef ? '; revoked CREATE on the database, all on public, usage on every platform schema, membership in every platform role' : ''));
      console.log('  4. proved the boundary from a fresh connection AS the runner role');
      console.log('  5. ' + (writeEnv ? 'written FACTORY_RUNNER_PG_URL to ' + writeEnv : 'printed FACTORY_RUNNER_PG_URL') + (dedicatedRef ? ' with sslmode=verify-full and the CA path' : ''));
      process.exit(0);
    }

    for (const f of SCHEMA_FILES) await client.query(readFileSync(join(SCHEMA_DIR, f), 'utf8'));
    const tables = await client.query("select table_name from information_schema.tables where table_schema = 'factory' order by 1");
    console.log('schema applied (' + SCHEMA_FILES.join(', ') + '): ' + tables.rows.map((r) => r.table_name).join(', '));

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
    console.log('privileges granted: connect, usage, and DML on schema factory - no DDL, no GRANT, nothing else');

    if (dedicatedRef) {
      // HARDENING ON A SUPABASE PROJECT. Stated as revokes even where nothing was granted, so the boundary is written
      // down rather than inherited from a default that a dashboard click could change.
      await client.query(`revoke create on database "${dbName}" from ${ROLE}`);
      await client.query(`revoke all on schema public from ${ROLE}`);
      for (const s of PLATFORM_SCHEMAS) { try { await client.query(`revoke all on schema ${s} from ${ROLE}`); } catch { /* no such schema */ } }
      for (const r of PLATFORM_ROLES) { try { await client.query(`revoke ${r} from ${ROLE}`); } catch { /* no such role or not a member */ } }
      await client.query(`revoke all privileges on all tables in schema public from ${ROLE}`);
      await client.query('create table if not exists factory.plane_identity (project_ref text primary key, provisioned_at timestamptz not null default now(), note text)');
      await client.query('revoke all on factory.plane_identity from ' + ROLE);
      await client.query('grant select on factory.plane_identity to ' + ROLE);
      await client.query('insert into factory.plane_identity (project_ref, note) values ($1, $2) on conflict (project_ref) do update set note = excluded.note', [dedicatedRef, 'dedicated Supabase control-plane project; provisioned by provision-control-plane.mjs']);
      console.log('hardened: no CREATE on the database, nothing on public, nothing on ' + PLATFORM_SCHEMAS.join('/') + ', no membership in ' + PLATFORM_ROLES.join('/') + '; factory.plane_identity = ' + dedicatedRef);
    }

    // ---- the runner URL ------------------------------------------------------------------------------------------------
    const u = new URL(adminUrl);
    const adminUser = decodeURIComponent(u.username || '');
    // Supabase's pooler routes by the username suffix: postgres.<ref> is the superuser, factory_runner.<ref> is our role.
    u.username = /^postgres\.([a-z]{20})$/.test(adminUser) ? ROLE + '.' + adminUser.split('.')[1] : ROLE;
    u.password = password;
    const remote = !/^(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)$/i.test(u.hostname);
    if (dedicatedRef) {
      u.searchParams.set('sslmode', 'verify-full');
      u.searchParams.set('sslrootcert', ca.path);
    } else {
      const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
      if (remote && !['require', 'verify-ca', 'verify-full'].includes(mode)) u.searchParams.set('sslmode', 'require');
    }
    const runnerUrl = u.toString();

    // ---- PROVE THE BOUNDARY, as the runner, on a fresh connection --------------------------------------------------------
    const probe = new pg.Client({ connectionString: runnerUrl });
    let proved = true;
    const say = (ok, label, detail) => { if (!ok) proved = false; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label + (detail ? ' - ' + String(detail).slice(0, 120) : '')); };
    console.log('');
    console.log('proving the boundary as ' + decodeURIComponent(u.username) + ':');
    try {
      await probe.connect();
      const me = (await probe.query('select current_user u, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication from pg_roles where rolname = current_user')).rows[0];
      say(me && !me.rolsuper && !me.rolcreatedb && !me.rolcreaterole && !me.rolbypassrls && !me.rolreplication, 'connected as ' + (me && me.u) + ' with no privileged attribute');
      if (dedicatedRef) {
        const ssl = (await probe.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')).rows[0];
        say(ssl && ssl.ssl === true, 'the runner session is TLS (verify-full against the CA)');
        const members = (await probe.query('select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles g on g.oid = m.member where g.rolname = current_user')).rows.map((x) => x.rolname);
        say(members.filter((m) => PLATFORM_ROLES.includes(m)).length === 0, 'member of no platform role', members.length ? 'members: ' + members.join(', ') : '');
        const denied = async (sql) => { try { await probe.query(sql); return false; } catch (e) { return e.code === '42501' || e.code === '3F000' || e.code === '42P01'; } };
        for (const s of ['auth', 'storage', 'realtime', 'supabase_migrations']) {
          if (target.schemas.includes(s)) say(await denied('select count(*) from ' + s + '.' + (s === 'supabase_migrations' ? 'schema_migrations' : s === 'auth' ? 'users' : s === 'storage' ? 'objects' : 'subscription')), 'cannot read ' + s);
        }
        say(await denied('create schema factory_probe_should_fail'), 'cannot create a schema');
        say(await denied('create table public.factory_probe_should_fail (x int)'), 'cannot create a table in public');
        say(await denied('create table factory.factory_probe_should_fail (x int)'), 'cannot create a table in factory');
        say(await denied('set role service_role'), 'cannot become service_role');
        say(await denied('set role postgres'), 'cannot become postgres');
      }
      await probe.query("insert into factory.nodes (node_id, capabilities, security_role, platform, agent_version, last_heartbeat_at) values ('node-provision-probe', '[]'::jsonb, 'generic', 'probe', '', now()) on conflict (node_id) do update set last_heartbeat_at = now()");
      const n = (await probe.query('select count(*)::int n from factory.nodes')).rows[0].n;
      await probe.query("delete from factory.nodes where node_id = 'node-provision-probe'");
      say(n >= 1, 'can read and write the factory schema (nodes: ' + n + ')');
    } catch (e) { say(false, 'the runner connection failed', e.message); }
    finally { try { await probe.end(); } catch { /* closed */ } }
    if (!proved) { console.log(''); console.log('REFUSING to hand out a runner URL: the boundary did not prove. Nothing was written.'); process.exit(1); }

    console.log('');
    if (writeEnv) {
      mkdirSync(dirname(resolve(writeEnv)), { recursive: true });
      writeFileSync(resolve(writeEnv), 'FACTORY_RUNNER_PG_URL=' + runnerUrl + '\n', { mode: 0o600 });
      console.log('FACTORY_RUNNER_PG_URL written to ' + resolve(writeEnv) + ' (not printed): ' + decodeURIComponent(u.username) + '@' + u.hostname + ':' + (u.port || 5432) + '/' + u.pathname.replace(/^\//, '') + ' ' + [...u.searchParams.keys()].join(','));
      console.log('On each node:  bash scripts/factory-runner/bootstrap-node.sh --role generic --env-file "' + resolve(writeEnv) + '"   (Work PC: --role verifier)');
      console.log('The Work PC needs the same file (copy it there) and the CA file at the same path, or re-run this command there with its own --write-env.');
    } else {
      console.log('Set this on every node (Home PC, Work PC, Mobile Laptop):');
      console.log('');
      console.log('  FACTORY_RUNNER_PG_URL=' + runnerUrl);
      console.log('');
      console.log('It is printed once and stored nowhere. Rotating it later is this same command again.');
      if (remote && !dedicatedRef) {
        console.log('TLS: the driver verifies the certificate chain in every mode. If the server\'s certificate is not publicly');
        console.log('trusted, add  &sslrootcert=<path to the CA file on each node>  (verify-full for a DNS host). Forms: TWO_MACHINE_CONTROL_PLANE.md §0.');
      }
      console.log('Then, on each node:  bash scripts/factory-runner/bootstrap-node.sh --role generic   (Work PC: --role verifier)');
    }
    console.log('Then the two-machine acceptance: qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && /provision-control-plane\.mjs$/.test(process.argv[1])) await main();
