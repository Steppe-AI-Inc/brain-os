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

  await db.exec(`set role ${role};`);
  try {
    const who = (await db.query('select current_user cu, session_user su, current_setting(\'row_security\') rs')).rows[0];
    ev.current_user = who.cu; ev.session_user = who.su; ev.row_security = who.rs;
    if (who.cu !== role) throw new Error(`SET ROLE did not take effect: current_user is ${who.cu}, expected ${role}`);
    if (who.su === role) throw new Error(`session_user is also ${role} — the login role IS the test role, so nothing was switched`);
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
    await db.exec('reset role;');
  }
  const after = (await db.query('select current_user cu')).rows[0].cu;
  if (after !== ev.login_user) throw new Error(`RESET ROLE did not restore the login role (${after} vs ${ev.login_user})`);
  ev.ok = true;
  return ev;
}

/** The evidence label a persona verdict may carry on this engine. PGlite is never allowed
 *  to say SECURITY VERIFIED. */
export function securityVerdictLabel(db) {
  return db.engine === 'real-postgresql'
    ? 'SECURITY VERIFIED (real PostgreSQL, non-superuser role enforcement, self-checked)'
    : 'RLS ENFORCEMENT (PGlite emulation) — NOT SECURITY VERIFIED; requires the real-PostgreSQL job';
}
