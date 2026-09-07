// DB TEST HARNESS CANNOT DESTRUCTIVELY INITIALIZE A NON-EPHEMERAL DATABASE.
//
// P1 tooling safety. `openDb()` runs, unconditionally, on any real engine:
//
//     drop schema if exists public cascade; ... drop schema if exists vault cascade;
//     drop publication if exists supabase_realtime;
//
// and `live_preflight_abd.mjs` — the file whose own header calls itself READ-ONLY and which is the
// tool intended to verify production after a release — calls it. The only thing standing between
// that and production is a regex over hostname substrings. That is a DENYLIST: it enumerates the
// bad, so it is wrong by default for every host nobody thought of. A raw pooler IP, a CNAME, a
// tunnel, a renamed project ref, a connection through a bouncer — each is a hostname the denylist
// does not know, and the failure mode is dropping five schemas in production.
//
// THE REQUIRED INVARIANT, from the founder: the harness must be unable to destructively initialize
// a non-ephemeral database EVEN IF the connection string is wrong, the environment variable points
// at production, the hostname detector fails, the project-ref format changes, or the caller ignores
// instructions. So detection is inverted: nothing is destroyed until the database has POSITIVELY
// PROVEN it is a disposable test instance. Unknown database => REFUSE. Ambiguous => REFUSE.
//
// HOW A DATABASE PROVES IT IS DISPOSABLE. Exactly one of:
//
//   1. IT CARRIES THIS HARNESS'S OWN SENTINEL. `public._dbtest_disposable` holds a row this harness
//      planted on a previous step of the same job. Only this harness ever writes it, and it is
//      planted only via route 2, so the sentinel cannot pre-exist on a database the harness has
//      never owned.
//
//   2. IT IS PRISTINE. No user tables in `public`, and none of the managed schemas a real Supabase
//      project always has (`auth`, `storage`, `vault`, `graphql`, `realtime`, `supabase_migrations`).
//      A fresh CI service container looks like this; production cannot, because
//      `supabase_migrations.schema_migrations` is exactly the table this whole incident is about.
//      On this route the harness plants the sentinel, so subsequent steps in the same job take
//      route 1.
//
// Anything else refuses. Production fails both tests independently: it has managed schemas, and it
// has never carried the sentinel.
//
// The existing hostname denylist is KEPT as defence in depth and a host allowlist is ADDED, but
// neither is the boundary any more. The boundary is what the database itself says it is.

export const SENTINEL_TABLE = '_dbtest_disposable';

/** Schemas that only exist on a managed Supabase project. Their presence alone refuses. */
const MANAGED_SCHEMAS = ['auth', 'storage', 'vault', 'graphql', 'realtime', 'supabase_migrations', 'supabase_functions'];

/** Hosts a disposable test engine plausibly runs on. Defence in depth, never the boundary. */
const DISPOSABLE_HOST_ALLOWLIST = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db', 'pgvector']);

export class NotDisposableError extends Error {
  constructor(reason, evidence) {
    super('REFUSED — destructive initialization of a database that has not proven it is disposable.\n'
      + reason + '\nEvidence: ' + JSON.stringify(evidence));
    this.name = 'NotDisposableError';
    this.evidence = evidence;
  }
}

/** Extract a hostname from a libpq URL without throwing on odd input. */
export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/**
 * Advisory only. A host being on the allowlist proves NOTHING — it is one signal among several and
 * is deliberately not sufficient on its own, because a hostname is attacker- and typo-controlled.
 */
export function hostLooksDisposable(url) {
  const h = hostOf(url);
  return h !== '' && DISPOSABLE_HOST_ALLOWLIST.has(h);
}

/**
 * Prove — from the database's own contents — that it is a disposable test instance.
 *
 * @param {{query:(sql:string)=>Promise<{rows:any[]}>, exec:(sql:string)=>Promise<void>}} db
 * @param {{url?:string, plant?:boolean}} opts
 * @returns {Promise<{disposable:true, route:'sentinel'|'pristine', evidence:object}>}
 * @throws {NotDisposableError}
 */
export async function assertDisposable(db, opts = {}) {
  const { url = '', plant = true } = opts;
  const evidence = { host: hostOf(url), hostAllowlisted: hostLooksDisposable(url) };

  // Identify the server so a refusal names what it refused.
  try {
    const r = await db.query('select current_database() db, version() v');
    evidence.database = r.rows[0].db;
    evidence.version = String(r.rows[0].v).slice(0, 60);
  } catch (e) {
    throw new NotDisposableError('Could not read current_database()/version() to identify the target. '
      + 'A database that cannot be identified is never destroyed.', { ...evidence, error: e.message });
  }

  // ── Route 1: this harness's own sentinel ─────────────────────────────────────────────────────
  const sentinel = await db.query(
    "select count(*)::int n from information_schema.tables "
    + "where table_schema='public' and table_name='" + SENTINEL_TABLE + "'");
  if (sentinel.rows[0].n > 0) {
    const row = await db.query('select run_token, planted_at from public.' + SENTINEL_TABLE + ' limit 1');
    if (row.rows.length > 0) {
      evidence.route = 'sentinel';
      evidence.run_token = row.rows[0].run_token;
      return { disposable: true, route: 'sentinel', evidence };
    }
    // Table present but empty: something created it that is not this harness. Refuse rather than
    // treat a bare table name as proof — the name is exactly what an attacker or an accident copies.
    throw new NotDisposableError(
      'A table named public.' + SENTINEL_TABLE + ' exists but carries no run token. The sentinel is '
      + 'proof only when this harness planted it; an empty table of the same name is not proof.',
      evidence);
  }

  // ── Route 2: pristine ────────────────────────────────────────────────────────────────────────
  const managed = await db.query(
    'select nspname from pg_namespace where nspname in ('
    + MANAGED_SCHEMAS.map((s) => "'" + s + "'").join(',') + ')');
  evidence.managedSchemas = managed.rows.map((r) => r.nspname);
  if (evidence.managedSchemas.length > 0) {
    throw new NotDisposableError(
      'The target carries managed schemas that only exist on a real project: '
      + evidence.managedSchemas.join(', ') + '. This is production-shaped, so destructive '
      + 'initialization is refused regardless of what the connection string says.', evidence);
  }

  // Supabase's API roles are CLUSTER-level, so they survive a schema drop. If someone has reset a
  // real project's schemas the managed-schema check above goes quiet, but these do not — which is
  // exactly the "hostname detector fails on a production-shaped target" case the invariant names.
  const roles = await db.query(
    "select rolname from pg_roles where rolname in ('anon','authenticated','service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin')");
  evidence.supabaseRoles = roles.rows.map((r) => r.rolname);
  if (evidence.supabaseRoles.length > 0) {
    throw new NotDisposableError(
      'The target cluster carries Supabase API roles (' + evidence.supabaseRoles.join(', ')
      + ') and no sentinel. Roles are cluster-level and survive a schema drop, so an empty-looking '
      + 'schema list does not make a real project disposable.', evidence);
  }

  const userTables = await db.query(
    "select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  evidence.publicTables = userTables.rows[0].n;
  if (evidence.publicTables > 0) {
    throw new NotDisposableError(
      'The target has ' + evidence.publicTables + ' table(s) in public and no sentinel. It is not a '
      + 'fresh disposable instance and this harness has never owned it, so its contents are somebody '
      + "else's.", evidence);
  }

  // Pristine and unclaimed. Plant the sentinel so later steps of the same job take route 1, and so
  // the claim is recorded in the database rather than inferred again from emptiness.
  if (plant) {
    const token = 'dbtest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    await db.exec(
      'create table if not exists public.' + SENTINEL_TABLE
      + ' (run_token text primary key, planted_at timestamptz not null default now(),'
      + " note text not null default 'Planted by qa/dbtest. Presence of this row authorizes"
      + " destructive re-initialization by the test harness. If you are reading this on a database"
      + " you care about, the harness was pointed at the wrong target.');"
      + " insert into public." + SENTINEL_TABLE + '(run_token) values (' + "'" + token + "'"
      + ') on conflict do nothing;');
    evidence.run_token = token;
  }
  evidence.route = 'pristine';
  return { disposable: true, route: 'pristine', evidence };
}

/**
 * The sentinel must survive the harness's own DROP of `public`. Call after a destructive init.
 * Cheap, and it keeps route 1 available to the next step of the same job.
 */
export async function replantSentinel(db, runToken) {
  await db.exec(
    'create table if not exists public.' + SENTINEL_TABLE
    + ' (run_token text primary key, planted_at timestamptz not null default now(), note text);'
    + " insert into public." + SENTINEL_TABLE + "(run_token, note) values ('"
    + String(runToken || 'dbtest-replanted').replace(/'/g, "''")
    + "', 'Re-planted after destructive init.') on conflict do nothing;");
}
