// ENGINE ADAPTER for the migration validation harnesses.
//
// Two engines, one interface, one evidence ladder:
//
//   PGlite (default)          real PostgreSQL 18 compiled to WASM, in-process, superuser.
//                             FAST INTEGRATION SMOKE: SQL PARSED, DDL EXECUTED, INTEGRATION
//                             VERIFIED. Its RLS results are "RLS enforcement (PGlite
//                             emulation)" — a real engine, but a single-user WASM build
//                             whose role/GUC/extension surface has NOT been shown to match
//                             Supabase. It is NOT allowed to produce SECURITY VERIFIED.
//
//   Real PostgreSQL           DBTEST_PG_URL=postgres://... (the GitHub Actions service
//                             container, or any disposable server). This is the only engine
//                             that may produce SECURITY VERIFIED, and only after the
//                             self-check below has proven that the role really changed, is
//                             not a superuser, cannot bypass RLS, has row_security on, and
//                             that a known-forbidden operation fails FOR THE EXPECTED
//                             AUTHORIZATION REASON.
//
// NEVER POINT THIS AT PRODUCTION. The adapter refuses any URL that looks like a Supabase
// project host; the harnesses drop and create objects freely.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDisposable, replantSentinel, NotDisposableError } from './disposability.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const PG_URL = process.env.DBTEST_PG_URL || '';
export const ENGINE = PG_URL ? 'real-postgresql' : 'pglite';

if (PG_URL && /supabase\.(co|com|in)|pooler\.supabase|pvphxgrtdfrudejjhzjk/i.test(PG_URL)) {
  console.log('REFUSED: DBTEST_PG_URL points at a Supabase project host. The validation harness is destructive and must never run against production.');
  process.exit(9);
}

/**
 * @returns {Promise<{exec:(sql:string)=>Promise<void>, query:(sql:string)=>Promise<{rows:any[]}>, close:()=>Promise<void>, engine:string, version:string, extensions:{vector:boolean, pgcrypto:boolean}}>}
 */
export async function openDb() {
  if (PG_URL) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: PG_URL });
    await client.connect();
    const exec = async (sql) => { await client.query(sql); };
    const query = async (sql) => client.query(sql);
    const version = (await query('select version() v')).rows[0].v;
    // POSITIVE PROOF OF DISPOSABILITY, BEFORE ANY DROP. Nothing below runs until the database
    // itself has proven it is an explicitly disposable test instance — it carries this harness's
    // own sentinel, or it is pristine and unclaimed. Unknown or ambiguous target => REFUSE.
    // This holds even if the connection string is wrong, DBTEST_PG_URL points at production, the
    // hostname denylist above fails to match, the project-ref format changes, or a caller ignores
    // every instruction in this file: production carries auth/storage/vault/supabase_migrations,
    // so it fails the pristine route, and it has never carried the sentinel, so it fails that one.
    let disposal;
    try {
      disposal = await assertDisposable({ exec, query }, { url: PG_URL });
    } catch (e) {
      await client.end();
      if (e instanceof NotDisposableError) { console.log(e.message); process.exit(9); }
      throw e;
    }

    // DISPOSABLE MEANS DISPOSABLE. The CI service database persists across the job's
    // steps, so each harness starts by dropping everything the previous one built —
    // schemas (which takes extensions, domains, tables, functions and policies with them)
    // and the realtime publication. Roles are cluster-level and are re-used; bootstrap
    // creates them with IF NOT EXISTS. This is also why db.mjs refuses production hosts.
    // (CI run 33829043446: the apply step's bootstrap left a `vector` domain behind and the
    // acceptance step's real `create extension vector` then collided with it.)
    await exec(`drop schema if exists public cascade; create schema public;
      grant all on schema public to public;
      drop schema if exists auth cascade; drop schema if exists storage cascade;
      drop schema if exists extensions cascade; drop schema if exists vault cascade;
      drop publication if exists supabase_realtime;`);
    await replantSentinel({ exec, query }, disposal.evidence.run_token);
    // pgvector is REAL here when the image ships it (pgvector/pgvector:pgNN); pgcrypto is
    // contrib and always present on a stock image.
    const available = (await query(`select name from pg_available_extensions where name in ('vector','pgcrypto')`)).rows.map((r) => r.name);
    return { exec, query, close: () => client.end(), engine: ENGINE, version,
      extensions: { vector: available.includes('vector'), pgcrypto: available.includes('pgcrypto') } };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const db = await PGlite.create({ extensions: { pgcrypto } });
  const version = (await db.query('select version() v')).rows[0].v;
  return { exec: (sql) => db.exec(sql).then(() => undefined), query: (sql) => db.query(sql), close: () => db.close(),
    engine: ENGINE, version, extensions: { vector: false, pgcrypto: true } };
}

/** Bootstrap the Supabase-compatible shim. On a real engine with pgvector available the
 *  `vector` type is the REAL extension, and bootstrap.sql's domain shim is skipped by its
 *  own existence check. */
export async function bootstrap(db) {
  if (db.extensions.vector) await db.exec('create extension if not exists vector;');
  await db.exec(readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'));
}

/** The migration-text transform the three harnesses share. Extensions PGlite cannot load
 *  are neutralised on BOTH engines so the two runs validate identical text — the point of
 *  the real-PostgreSQL job is the SECURITY layer, not extension coverage. `vector` itself
 *  is left alone when the engine really has it. */
export function transformFor(db) {
  const skipExt = db.extensions.vector
    ? /^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http)["']?[^;]*;/gim
    : /^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http|vector)["']?[^;]*;/gim;
  return (s) => {
    let out = s.replace(skipExt, '');
    if (!db.extensions.vector) {
      out = out.replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'vector')
        .replace(/create\s+index[^;]*?using\s+(hnsw|ivfflat)[^;]*;/gi, '');
    }
    return out;
  };
}

/**
 * REAL POSTGRES SECURITY SELF-CHECK (founder-mandated, run BEFORE any persona test).
 * Proves, on the live connection, that the persona mechanism is what it claims:
 *   1. SET ROLE really changes current_user (and session_user stays the login role);
 *   2. the test role is NOT a superuser and does NOT have BYPASSRLS;
 *   3. row_security is on;
 *   4. the expected Supabase grants exist (usage on public for the API roles);
 *   5. a known-forbidden write (INSERT with no policy) fails, and fails for the EXPECTED
 *      authorization reason (SQLSTATE 42501 / row-level security), not a typo/FK/missing
 *      table; a policy-filtered read returns only the allowed rows.
 * Returns the evidence record; throws on the first failed check so no persona verdict can
 * be produced on a connection where enforcement is unproven.
 */
// ROUND 3 / D-1: the identities the code under test PRIVILEGES. A persona connection whose
// session_user is one of these cannot exercise any guard written against session_user, so
// the self-check refuses to let a persona verdict be produced on it.
export const PRIVILEGED_SESSION_USERS = Object.freeze(['postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin']);
export const PERSONA_LOGIN_ROLE = 'qa_authenticator';

/** Enter the PostgREST-shaped session: session_user = a NON-superuser login role. Requires
 *  the login role to be a superuser (it is, on both engines). Returns the login role name so
 *  leavePersonaSession can restore it — PGlite's RESET SESSION AUTHORIZATION is a no-op
 *  (reviewer probe scratch/sessauth_probe.mjs), so the original role is named explicitly. */
export async function enterPersonaSession(db) {
  const login = (await db.query('select session_user su')).rows[0].su;
  await db.exec(`set session authorization ${PERSONA_LOGIN_ROLE};`);
  return login;
}
export async function leavePersonaSession(db, login) {
  try { await db.exec('reset role;'); } catch { /* none set */ }
  await db.exec(`set session authorization ${login};`);
  try { await db.exec('reset role;'); } catch { /* none set */ }
  // ROUND 3 / X-3: the persona JWT must not leak into the next top-level statement.
  await db.exec(`select set_config('request.jwt.claims', '', false);`);
  const su = (await db.query('select session_user su')).rows[0].su;
  if (su !== login) throw new Error(`persona session teardown failed: session_user is ${su}, expected ${login}`);
}

export async function securitySelfCheck(db, role = 'authenticated') {
  const ev = { engine: db.engine, version: db.version, role };
  await db.exec(`create table if not exists public._rls_selfcheck(id int, owner text);
    alter table public._rls_selfcheck enable row level security;
    grant select, insert on public._rls_selfcheck to authenticated, anon;
    drop policy if exists sc on public._rls_selfcheck;
    create policy sc on public._rls_selfcheck for select using (owner = 'alice');
    delete from public._rls_selfcheck;
    insert into public._rls_selfcheck values (1,'alice'),(2,'bob');`);
  const before = (await db.query('select current_user cu, session_user su')).rows[0];
  ev.login_user = before.cu;
  ev.superuser_sees = (await db.query('select count(*)::int c from public._rls_selfcheck')).rows[0].c;

  // The persona SESSION: a non-superuser login identity, then SET ROLE down — PostgREST's shape.
  const login = await enterPersonaSession(db);
  try {
    const sess = (await db.query(`select session_user su, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = session_user`)).rows[0];
    ev.persona_session_user = sess.su;
    if (sess.su !== PERSONA_LOGIN_ROLE) throw new Error(`SET SESSION AUTHORIZATION did not take effect: session_user is ${sess.su}`);
    if (PRIVILEGED_SESSION_USERS.includes(sess.su)) throw new Error(`session_user ${sess.su} is an identity the code under test privileges — no guard written against session_user can refuse it`);
    if (sess.rolsuper) throw new Error(`persona session role ${sess.su} is a SUPERUSER`);
    if (sess.rolbypassrls) throw new Error(`persona session role ${sess.su} has BYPASSRLS`);
    await db.exec(`set role ${role};`);
    const who = (await db.query('select current_user cu, session_user su, current_setting(\'row_security\') rs')).rows[0];
    ev.current_user = who.cu; ev.session_user = who.su; ev.row_security = who.rs;
    if (who.cu !== role) throw new Error(`SET ROLE did not take effect: current_user is ${who.cu}, expected ${role}`);
    if (who.su === role) throw new Error(`session_user is also ${role} — the login role IS the test role, so nothing was switched`);
    if (PRIVILEGED_SESSION_USERS.includes(who.su)) throw new Error(`session_user is ${who.su} after SET ROLE — a privileged identity leaked into the persona session`);
    if (who.rs !== 'on') throw new Error(`row_security is ${who.rs}, expected on`);
    const attrs = (await db.query(`select rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = current_user`)).rows[0];
    ev.rolsuper = attrs.rolsuper; ev.rolbypassrls = attrs.rolbypassrls;
    if (attrs.rolsuper) throw new Error(`${role} is a SUPERUSER — RLS would be bypassed`);
    if (attrs.rolbypassrls) throw new Error(`${role} has BYPASSRLS — RLS would be bypassed`);
    ev.has_public_usage = (await db.query(`select has_schema_privilege(current_user, 'public', 'USAGE') ok`)).rows[0].ok === true;
    if (!ev.has_public_usage) throw new Error(`${role} lacks USAGE on schema public — denials below would be grant gaps, not policy`);
    ev.role_sees = (await db.query('select count(*)::int c from public._rls_selfcheck')).rows[0].c;
    if (!(ev.superuser_sees === 2 && ev.role_sees === 1)) {
      throw new Error(`policy filter not observed: login sees ${ev.superuser_sees}, ${role} sees ${ev.role_sees} (expected 2 / 1)`);
    }
    // The known-forbidden operation: there is NO insert policy, so this must fail with
    // insufficient_privilege / RLS — and for no other reason.
    let forbidden = null;
    try { await db.exec(`insert into public._rls_selfcheck values (3,'mallory');`); }
    catch (e) { forbidden = e; }
    finally { try { await db.exec('rollback;'); } catch { /* no txn */ } }
    if (!forbidden) throw new Error('the known-forbidden INSERT SUCCEEDED — RLS is not enforced on this connection');
    const msg = String(forbidden.message || forbidden);
    const code = forbidden.code || (msg.match(/\b42501\b/) || [])[0] || null;
    ev.forbidden_op_sqlstate = code; ev.forbidden_op_message = msg.split('\n')[0];
    const expectedReason = code === '42501' || /row-level security|insufficient_privilege|permission denied/i.test(msg);
    if (!expectedReason) throw new Error(`the forbidden INSERT failed for the WRONG reason: ${msg.split('\n')[0]}`);
  } finally {
    await leavePersonaSession(db, login);
  }
  const after = (await db.query('select current_user cu, session_user su')).rows[0];
  if (after.cu !== ev.login_user || after.su !== ev.login_user) throw new Error(`teardown did not restore the login role (${after.cu}/${after.su} vs ${ev.login_user})`);
  ev.ok = true;
  return ev;
}

/** ROUND 4 / R4-5: on the real engine, a SECOND connection authenticated AS qa_authenticator.
 *  On it the persona identity is the ENGINE's boundary, not a harness convention — the login
 *  role is not a superuser, so SET SESSION AUTHORIZATION postgres is refused by PostgreSQL
 *  itself. Returns null on PGlite (single in-process connection; the SET SESSION AUTHORIZATION
 *  convention remains, labelled as emulation). */
export async function openPersonaDb(db) {
  if (!PG_URL || db.engine !== 'real-postgresql') return null;
  const { default: pg } = await import('pg');
  const url = new URL(PG_URL);
  url.username = PERSONA_LOGIN_ROLE;
  url.password = 'qa_authenticator_dbtest';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const p = { engine: db.engine + ' (persona connection)', version: db.version, extensions: db.extensions,
    exec: async (sql) => { await client.query(sql); }, query: async (sql) => client.query(sql), close: () => client.end() };
  const who = (await p.query('select session_user su, current_user cu')).rows[0];
  if (who.su !== PERSONA_LOGIN_ROLE) throw new Error(`persona connection is ${who.su}, expected ${PERSONA_LOGIN_ROLE}`);
  // The engine boundary, proven on the connection itself: escaping to the superuser must FAIL.
  let escaped = false;
  try { await p.exec('set session authorization postgres;'); escaped = true; } catch { /* expected */ }
  if (escaped) { await client.end(); throw new Error('persona connection could SET SESSION AUTHORIZATION postgres — it is not an engine boundary'); }
  try { await p.exec('set role postgres;'); escaped = true; } catch { /* expected */ }
  if (escaped) { await client.end(); throw new Error('persona connection could SET ROLE postgres'); }
  return p;
}

/** The evidence label a persona verdict may carry on this engine. PGlite is never allowed
 *  to say SECURITY VERIFIED. */
export function securityVerdictLabel(db) {
  return db.engine === 'real-postgresql'
    ? 'SECURITY VERIFIED (real PostgreSQL, non-superuser role enforcement, self-checked)'
    : 'RLS ENFORCEMENT (PGlite emulation) — NOT SECURITY VERIFIED; requires the real-PostgreSQL job';
}

// ── READ-ONLY LIVE CONNECTION ───────────────────────────────────────────────────────────────────
// `live_preflight_abd.mjs --pre|--post` calls itself a READ-ONLY preflight, and until now reached
// production through openDb() — the function that drops five schemas. It was safe only because a
// hostname denylist refused first, i.e. the read-only tool was one regex away from being the most
// destructive thing in the repo.
//
// This is the connection a live verification is supposed to use. It is a SEPARATE environment
// variable, so no amount of confusion about DBTEST_PG_URL can route a destructive harness here and
// no confusion about LIVE_READONLY_PG_URL can route a read-only check into the dropper. It never
// touches the DROP block, it never plants a sentinel, and it PROVES its own read-onlyness with a
// DDL probe that must fail with SQLSTATE 25006 before any caller is handed the connection.
export const LIVE_READONLY_PG_URL = process.env.LIVE_READONLY_PG_URL || '';

export class ReadOnlyProofError extends Error {
  constructor(msg) { super('REFUSED — the connection could not prove it is read-only.\n' + msg); this.name = 'ReadOnlyProofError'; }
}

/**
 * Open a connection that is proven read-only before it is returned.
 * @returns {Promise<{query:(sql:string)=>Promise<{rows:any[]}>, close:()=>Promise<void>, engine:string, version:string, readOnlyProof:object}>}
 */
export async function openReadOnlyDb() {
  if (!LIVE_READONLY_PG_URL) {
    throw new ReadOnlyProofError('LIVE_READONLY_PG_URL is not set. A live read-only check has no '
      + 'fallback: it does not borrow DBTEST_PG_URL, because that is the destructive harness\'s '
      + 'variable and sharing it is how a read-only tool acquires write authority.');
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: LIVE_READONLY_PG_URL });
  await client.connect();
  const query = async (sql) => client.query(sql);
  const close = () => client.end();

  // Ask the session to be read-only, then PROVE it. Asking is not evidence — a GUC can be
  // overridden per-transaction, and a role granted write access is unaffected by a session default.
  await client.query('set default_transaction_read_only = on');
  const proof = { requested: true };
  proof.guc = (await query('show default_transaction_read_only')).rows[0].default_transaction_read_only;
  proof.user = (await query('select current_user u, session_user su')).rows[0];

  // The probe. A write must FAIL, and fail for the read-only reason (25006), not because the
  // table name was a typo — a typo would fail too, and a probe that cannot tell those apart proves
  // nothing. Rolled back either way.
  let probe = 'NO_ERROR';
  try {
    await client.query('begin');
    await client.query('create temporary table _ro_probe_should_never_exist(x int)');
    probe = 'NO_ERROR';
  } catch (e) {
    probe = e.code || 'UNKNOWN';
  } finally {
    try { await client.query('rollback'); } catch { /* already aborted */ }
  }
  proof.ddlProbeSqlstate = probe;
  if (probe !== '25006') {
    await close();
    throw new ReadOnlyProofError('A DDL probe on this connection returned SQLSTATE ' + probe
      + ', expected 25006 (read_only_sql_transaction). ' + (probe === 'NO_ERROR'
        ? 'The write SUCCEEDED — this connection can write, and must not be used for a read-only '
        + 'live check. Point LIVE_READONLY_PG_URL at a role created with NOLOGIN-equivalent write '
        + 'privileges revoked, not merely at a session with a GUC set.'
        : 'The write failed for a DIFFERENT reason, so read-onlyness is unproven: a probe that '
        + 'fails for the wrong reason is not evidence.')
      + '\nProof record: ' + JSON.stringify(proof));
  }

  const version = (await query('select version() v')).rows[0].v;
  return { query, close, engine: 'real-postgresql-readonly', version, readOnlyProof: proof,
    exec: async () => { throw new ReadOnlyProofError('exec() is not available on a read-only connection.'); } };
}
