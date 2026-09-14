// Disposable database layer for Factory V1 acceptance - built on the PINNED qa/dbtest/db.mjs
// (origin/p1/control-plane-phase0), imported by absolute file URL. Two engines:
//
//   PGlite (default)        real PostgreSQL 18 in WASM, ONE superuser connection, in-process.
//                           Evidence level: LOCAL_DB_CONTRACT. Never called real multi-connection.
//   embedded PostgreSQL 17  DBTEST_PG_URL set by preflight; real server, real roles, two
//                           connections. Evidence level: REAL_POSTGRES_LOCAL. Never promoted to
//                           CROSS_NODE_REAL.
//
// Both go through the pinned adapter's disposability gate before any DROP. Production is
// unreachable by construction (no credential on this machine) and refused by the adapter's
// hostname/sentinel checks besides.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { worktree, pinnedPath } from './provenance.mjs';

// Identities the Home-PC SQL suites hardcode (qa/scenarios-runner/*.sql). Seeded so those
// suites run unmodified; they are synthetic fixtures in a disposable database, nothing more.
export const IDS = Object.freeze({
  FOUNDER_AUTH: 'cbcc41cf-830d-4600-8545-3b9e22c8297f',
  MANAGER_AUTH: '9c92a8d5-853c-4ef3-846a-f4fe8c42d97a',
  MANAGER_PROFILE: '66ef2052-d002-4592-b841-82cd2171b51a',
  COMPANY: 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d',
  COMPANY_B: 'ed8ae510-ddbc-4be6-9d9e-d1f725b1382b',
  EMPLOYEE_AUTH: '22222222-0000-0000-0000-000000000002',
});

let cached = null;

/**
 * Open the disposable engine, bootstrap the Supabase shim and apply the pinned migration chain.
 * @param {{refKey?:string, realUrl?:string|null}} opts  realUrl -> embedded PostgreSQL
 */
export async function openFactoryDb({ refKey = 'p1', realUrl = null } = {}) {
  const wt = worktree(refKey);
  const dbmjsPath = join(wt.path, 'qa', 'dbtest', 'db.mjs');
  // PG_URL is read at module load; a separate module instance per engine keeps them apart.
  if (realUrl) process.env.DBTEST_PG_URL = realUrl; else delete process.env.DBTEST_PG_URL;
  const dbmod = await import(pathToFileURL(dbmjsPath).href + '?engine=' + (realUrl ? 'real' : 'pglite') + '&t=' + Date.now());
  const db = await dbmod.openDb();
  await dbmod.bootstrap(db);
  const transform = dbmod.transformFor(db);
  const migdir = join(wt.path, 'supabase', 'migrations');
  const applied = [];
  for (const f of readdirSync(migdir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migdir, f), 'utf8');
    try { await db.exec(transform(sql)); applied.push({ file: f, status: 'APPLIED' }); }
    catch (e) {
      try { await db.exec('rollback;'); } catch {}
      applied.push({ file: f, status: 'FAILED', error: String(e.message || e).split('\n')[0].slice(0, 300) });
    }
  }
  const failed = applied.filter((a) => a.status !== 'APPLIED');
  const handle = {
    db, dbmod, engine: db.engine, version: db.version, refKey, source_sha: wt.sha,
    finding_class: realUrl ? 'REAL_POSTGRES_LOCAL' : 'LOCAL_DB_CONTRACT',
    security_label: dbmod.securityVerdictLabel(db),
    applied, migration_chain_complete: failed.length === 0, failed_migrations: failed,
    exec: (sql) => db.exec(sql), query: (sql) => db.query(sql), close: () => db.close(),
  };
  cached = handle;
  return handle;
}

/** `now()` is transaction-stable; the harness never compares against JS wall-clock. */
export async function assertTxContinuity(h) {
  await h.exec("begin; select set_config('qa.probe', '1', true);");
  const v = (await h.query("select current_setting('qa.probe', true) v")).rows[0].v;
  await h.exec('rollback;');
  return v === '1';
}

export async function asSuperuser(h) {
  try { await h.exec('reset role;'); } catch {}
  try { await h.exec('set session authorization postgres;'); } catch {}
  await h.exec("select set_config('request.jwt.claims', '', false);");
}

/**
 * PostgREST-shaped persona: session_user = qa_authenticator (NOSUPERUSER), current_user = role,
 * auth.uid() from request.jwt.claims. Returns leave().
 */
export async function asPersona(h, claims, role = 'authenticated') {
  const login = await h.dbmod.enterPersonaSession(h.db);
  await h.exec(`set role ${role};`);
  await h.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims).replace(/'/g, "''")}', false);`);
  return async () => { try { await h.exec('rollback;'); } catch {} await h.dbmod.leavePersonaSession(h.db, login); };
}

/** Run a statement expecting failure; returns {ok, sqlstate, message}. Rolls back any aborted tx. */
export async function attempt(h, sql) {
  try { const r = await h.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) {
    const msg = String(e.message || e);
    const code = e.code || (msg.match(/\b(\d{2}[0-9A-Z]{3})\b/) || [])[1] || null;
    try { await h.exec('rollback;'); } catch {}
    return { ok: false, sqlstate: code, message: msg.split('\n')[0].slice(0, 300) };
  }
}

/** Seed the identities the Home-PC suites expect (founder, manager of COMPANY, employee, company B). */
export async function seedIdentities(h) {
  await asSuperuser(h);
  await h.exec(`
    insert into public.companies (id, name, status) values ('${IDS.COMPANY}', 'QA Disposable Co A', 'active') on conflict (id) do nothing;
    insert into public.companies (id, name, status) values ('${IDS.COMPANY_B}', 'QA Disposable Co B', 'active') on conflict (id) do nothing;
    insert into auth.users (id, email) values ('${IDS.FOUNDER_AUTH}', 'founder@qa.disposable') on conflict (id) do nothing;
    insert into auth.users (id, email) values ('${IDS.MANAGER_AUTH}', 'manager@qa.disposable') on conflict (id) do nothing;
    insert into auth.users (id, email) values ('${IDS.EMPLOYEE_AUTH}', 'employee@qa.disposable') on conflict (id) do nothing;
  `);
  // handle_new_auth_user (if the trigger exists in the chain) creates profiles; make them deterministic.
  await h.exec(`
    insert into public.profiles (id, auth_user_id, full_name, role, active)
      select gen_random_uuid(), '${IDS.FOUNDER_AUTH}', 'QA Founder', 'founder', true
      where not exists (select 1 from public.profiles where auth_user_id = '${IDS.FOUNDER_AUTH}');
    update public.profiles set role = 'founder', active = true where auth_user_id = '${IDS.FOUNDER_AUTH}';
    insert into public.profiles (id, auth_user_id, full_name, role, active)
      select '${IDS.MANAGER_PROFILE}', '${IDS.MANAGER_AUTH}', 'QA Manager', 'employee', true
      where not exists (select 1 from public.profiles where auth_user_id = '${IDS.MANAGER_AUTH}');
    update public.profiles set id = '${IDS.MANAGER_PROFILE}', role = 'employee', active = true where auth_user_id = '${IDS.MANAGER_AUTH}' and id <> '${IDS.MANAGER_PROFILE}';
    insert into public.profiles (id, auth_user_id, full_name, role, active)
      select gen_random_uuid(), '${IDS.EMPLOYEE_AUTH}', 'QA Employee', 'employee', true
      where not exists (select 1 from public.profiles where auth_user_id = '${IDS.EMPLOYEE_AUTH}');
    update public.profiles set role = 'employee', active = true where auth_user_id = '${IDS.EMPLOYEE_AUTH}';
    insert into public.company_memberships (company_id, profile_id, role_in_company)
      select '${IDS.COMPANY}', '${IDS.MANAGER_PROFILE}', 'manager'
      where not exists (select 1 from public.company_memberships where company_id = '${IDS.COMPANY}' and profile_id = '${IDS.MANAGER_PROFILE}');
    insert into public.company_memberships (company_id, profile_id, role_in_company)
      select '${IDS.COMPANY}', p.id, 'employee' from public.profiles p where p.auth_user_id = '${IDS.EMPLOYEE_AUTH}'
      and not exists (select 1 from public.company_memberships m where m.company_id = '${IDS.COMPANY}' and m.profile_id = p.id);
  `);
  const r = await h.query(`select (select count(*)::int from public.profiles) profiles, (select count(*)::int from public.company_memberships) memberships, (select count(*)::int from public.companies) companies`);
  return r.rows[0];
}

export const founderClaims = () => ({ sub: IDS.FOUNDER_AUTH, role: 'authenticated' });
export const managerClaims = () => ({ sub: IDS.MANAGER_AUTH, role: 'authenticated' });
export const employeeClaims = () => ({ sub: IDS.EMPLOYEE_AUTH, role: 'authenticated' });

/**
 * Execute a Home-PC scenarios-runner suite (begin; … select json_build_object(...) as verdict; rollback;)
 * on the disposable engine and capture its verdict object. Cross-check evidence only.
 */
export async function runSqlSuite(h, relPath, refKey = 'master') {
  const text = readFileSync(pinnedPath(refKey, relPath), 'utf8');
  const idx = text.lastIndexOf('select json_build_object(');
  if (idx < 0) return { verdict: null, all_pass: null, error: { message: 'SUITE_SHAPE_UNEXPECTED: no json_build_object verdict' } };
  const endIdx = text.indexOf('as verdict;', idx);
  if (endIdx < 0) return { verdict: null, all_pass: null, error: { message: 'SUITE_SHAPE_UNEXPECTED: no "as verdict;"' } };
  let body = text.slice(0, idx);
  const verdictSql = text.slice(idx, endIdx + 'as verdict;'.length);
  const stripped = body.replace(/--.*$/gm, '').trim();
  const beginsTx = /^begin\s*;/i.test(stripped);
  if (!beginsTx) body = 'begin;\n' + body;
  await asSuperuser(h);
  let error = null, verdict = null;
  try {
    await h.exec(body);
    verdict = (await h.query(verdictSql)).rows[0].verdict;
    if (typeof verdict === 'string') { try { verdict = JSON.parse(verdict); } catch {} }
  } catch (e) {
    const msg = String(e.message || e);
    error = { sqlstate: e.code || (msg.match(/\b(\d{2}[0-9A-Z]{3})\b/) || [])[1] || null, message: msg.split('\n')[0].slice(0, 400) };
  } finally {
    try { await h.exec('rollback;'); } catch {}
    await asSuperuser(h);
  }
  const all_pass = verdict && typeof verdict === 'object' ? (verdict.all_pass === true || verdict.all_pass === 'true') : null;
  return { verdict, all_pass, error, persona_fidelity: 'SET_ROLE_ONLY (session_user stays postgres inside the suite)', began_tx_itself: beginsTx };
}

/** Move fixture time. Lease constants are never shortened; only row timestamps move. */
export async function moveTime(h, runId, { claimed_at_minus_min = null, retry_after_minus_min = null, heartbeat_minus_min = null, status = null } = {}) {
  const sets = [];
  if (claimed_at_minus_min != null) sets.push(`claimed_at = now() - make_interval(mins => ${Number(claimed_at_minus_min)})`);
  if (retry_after_minus_min != null) sets.push(`retry_after = now() - make_interval(mins => ${Number(retry_after_minus_min)})`);
  if (heartbeat_minus_min != null) sets.push(`last_heartbeat_at = now() - make_interval(mins => ${Number(heartbeat_minus_min)})`);
  if (status) sets.push(`status = '${status}'::public.work_status`);
  if (!sets.length) return;
  await h.exec(`update public.agent_runs set ${sets.join(', ')} where id = '${runId}';`);
}

/** Minimal factory fixtures: one registered agent, one canonical work order. */
export async function seedFactory(h, { agentId = '33123660-2f38-4290-8de7-35b8f696247a', woId = 'aaaaaaaa-0000-4000-8000-00000000aa01' } = {}) {
  await asSuperuser(h);
  await h.exec(`
    insert into public.agents (id, name, role, active, category, execution_provider, has_production_authority, definition_path)
      values ('${agentId}', 'qa-disposable-director', 'software_factory', true, 'SOFTWARE_FACTORY', 'claude_code_background', true, '.claude/agents/qa-disposable.md')
      on conflict (id) do nothing;
    insert into public.agents (id, name, role, active, category, execution_provider, has_production_authority, definition_path)
      values ('44444444-0000-4000-8000-000000000044', 'qa-disposable-verifier', 'verification', true, 'VERIFICATION', 'claude_code_background', true, '.claude/agents/qa-disposable-verifier.md')
      on conflict (id) do nothing;
    insert into public.canonical_work_orders (id, company_id, title, status, work_type)
      values ('${woId}', '${IDS.COMPANY}', 'QA disposable work order', 'queued', 'software_development')
      on conflict (id) do nothing;
  `);
  return { agentId, verifierAgentId: '44444444-0000-4000-8000-000000000044', woId };
}

export function currentHandle() { return cached; }
