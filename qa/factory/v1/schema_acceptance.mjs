#!/usr/bin/env node
// WO-1 DEVELOPER VERIFICATION (the implementer's; never independent): the Factory V1 schema on a disposable plane provisioned as
// 69df2f52 with the Director's baseline rows loaded, before and after the candidate migration.
//
//   THE PLANE is shaped like the r3 judging plane (VERIFICATION_SPEC §3.3): the bootstrap superuser is `supabase_admin` (read-backs
//   and fixtures only), and the migration is applied AS THE APPLYING LOGIN `postgres` (NOSUPERUSER, aligned to
//   APPLYING_ROLE_OBSERVATION.json), as the live-migration step the Director instrument builds (applying_role_plane.mjs).
//   C  catalog read-back: roles, owners, grants, default privileges, memberships, SECURITY DEFINER search_path, seeded rows
//   AL the applying login and the privilege model: the login is live-shaped before the migration; the role memberships and default
//      privileges the migration adds are exactly the predicted ones; the applying login inherits nothing from factory_owner; PUBLIC
//      holds nothing; factory_owner keeps no transient privilege; functions are born without PUBLIC EXECUTE; part 990's revokes by
//      name cover every relation factory_owner owns
//   L  legacy refusals AS factory_runner: authority records, EXECUTE, the reserved capability, enrolled / new-model rows,
//      new-model columns, SET ROLE - and the same refusals after a 69df2f52 provisioning grant is re-run (the guard, not only
//      the missing grant, refuses)
//   M  mixed fleet through the FROZEN claim.mjs: a lapsed enrolled lease and lock never fail or stall the legacy claim
//   E  envelope immutability by node, and the invariants that hold for every writer
//   P  baseline preservation: the manifest's evidence-field hashes are unchanged by the migration; a database not provisioned as
//      69df2f52 (P0n) and a second application (P7) abort the migration's one transaction and leave nothing behind
//   RO / OB / FS  the founder's prepared steps (FOUNDER_PREPARED_STEPS.md), their SQL read from the document and run AS the applying
//      login: the factory_runner rotation (step R) restores no privilege; the observer step (1b) reaches every factory relation; the
//      tenant-admin step (3) and the API-login step (2) work under that login
//
// usage: node qa/factory/v1/schema_acceptance.mjs [--evidence <file>]
// Touches nothing but a scratch PostgreSQL it starts and removes (S-15).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect, tryQuery, enableApiLogins } from './plane.mjs';
import { applyAsApplyingLogin, scramVerifier, DIRECTOR } from './applying_role_plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, ADMIN, asEngine, enrolledComputer, newModelWorkOrder, enrolledRun, enrolledCheckpoint, legacyWorkOrder, nodeIdOf } from './fixtures.mjs';
import { snapshot, rowChecks } from './migration_rows.mjs';

const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
const refused = (r, re = /factory_(authority|legacy)_refused|permission denied/) => !r.ok && r.code === '42501' && re.test(r.message);

const NEW_TABLES = ['agent_principals', 'audit_events', 'authorization_envelopes', 'certifications', 'computer_fingerprints', 'computers',
  'enrollment_transitions', 'enrollments', 'node_assertion_jtis', 'node_credentials', 'node_sessions', 'pairing_attempts', 'pairing_codes',
  'release_revocations', 'releases', 'tenant_admins', 'tenants', 'verification_policies', 'verification_policy_versions'];
const BASE_TABLES = ['agent_runs', 'checkpoints', 'director_lease', 'founder_notifications', 'nodes', 'surface_locks', 'work_order_dependencies', 'work_orders'];

// ---- the manifest's evidence-field hashes, by the manifest's own rule (tools/baseline_manifest.mjs) --------------------------------
const canon = (v) => {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
};
const h = (o) => createHash('sha256').update(canon(o)).digest('hex');
const TS = new Set(['started_at', 'finished_at', 'completed_at', 'created_at']);
const sel = (fields) => fields.map((f) => TS.has(f) ? "to_char(" + f + " at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as " + f : f).join(', ');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json'), 'utf8'));
async function evidenceHashes(c) {
  await c.query('begin transaction isolation level repeatable read read only');
  try {
    await c.query("set local timezone = 'UTC'");
    const { agent_runs: RF, work_orders: WF, checkpoints: CF } = MANIFEST.fields;
    const runs = (await c.query(`select ${sel(RF)} from factory.agent_runs where base_commit like '69df2f52%' order by started_at, run_id`)).rows;
    const woIds = [...new Set(runs.map((r) => r.work_order_id))];
    const wos = (await c.query(`select ${sel(WF)} from factory.work_orders where work_order_id = any($1::uuid[]) order by created_at, work_order_id`, [woIds])).rows;
    const cps = (await c.query(`select ${sel(CF)} from factory.checkpoints where work_order_id = any($1::uuid[]) or payload::text like '%69df2f52%' order by created_at, checkpoint_id`, [woIds])).rows;
    return { agent_runs: h(runs), work_orders: h(wos), checkpoints: h(cps), counts: [runs.length, wos.length, cps.length],
      rows: { agent_runs: runs.map(h), work_orders: wos.map(h), checkpoints: cps.map(h) } };
  } finally { await c.query('rollback'); }
}
const manifestRows = { agent_runs: MANIFEST.agent_runs.map((r) => r.sha256), work_orders: MANIFEST.work_orders.map((r) => r.sha256), checkpoints: MANIFEST.checkpoints.map((r) => r.sha256) };

const catalogFacts = async (c) => (await c.query(`
  select
    (select coalesce(json_agg(r.rolname order by r.rolname), '[]') from pg_auth_members m join pg_roles r on r.oid = m.roleid
      where m.member = (select oid from pg_roles where rolname = 'factory_runner')) as runner_member_of,
    (select coalesce(json_agg(r.rolname order by r.rolname), '[]') from pg_auth_members m join pg_roles r on r.oid = m.member
      where m.roleid = (select oid from pg_roles where rolname = 'factory_runner')) as members_of_runner,
    (select coalesce(json_agg(t order by t), '[]') from (select c.relname || ':' || p as t from pg_class c,
       unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      where c.relnamespace = 'factory'::regnamespace and c.relkind = 'r' and c.relname <> 'plane_identity'
        and has_table_privilege('factory_runner', c.oid, p)) x) as runner_table_privs`)).rows[0];

// ---- every pg_auth_members row (by name, with its options and grantor), and every pg_default_acl entry: before / after -----------
const authMembers = async (c) => (await c.query(`select pg_get_userbyid(m.roleid) || ' <- ' || pg_get_userbyid(m.member) || ' admin=' || m.admin_option
    || ' inherit=' || m.inherit_option || ' set=' || m.set_option || ' by ' || pg_get_userbyid(m.grantor) r from pg_auth_members m order by 1`)).rows.map((x) => x.r);
const defaultAcl = async (c) => (await c.query(`select pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '(all schemas)') || ' ' || d.defaclobjtype::text
    || ' ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type r
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) a order by 1`)).rows.map((x) => x.r);
const minus = (a, b) => a.filter((x) => !b.includes(x));
// PostgreSQL 16+ creator grants (CREATE ROLE by a CREATEROLE non-superuser: ADMIN, granted by the bootstrap superuser) plus the one
// createrole_self_grant = 'set' grant on factory_owner (granted by the creator): the ONLY memberships the migration adds
const PREDICTED_MEMBERS = [
  'factory_admin_api <- postgres admin=true inherit=false set=false by supabase_admin',
  'factory_node_api <- postgres admin=true inherit=false set=false by supabase_admin',
  'factory_owner <- postgres admin=false inherit=false set=true by postgres',
  'factory_owner <- postgres admin=true inherit=false set=false by supabase_admin'];
const PREDICTED_DEFACL_REMOVED = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].map((p) => 'postgres factory r factory_runner ' + p);
const PREDICTED_DEFACL_ADDED = ['factory_owner (all schemas) f factory_owner EXECUTE'];

// ---- the founder's prepared steps: a section of FOUNDER_PREPARED_STEPS.md by its heading, and its fenced blocks of one language ----
const STEPS_MD = readFileSync(join(ROOT, 'qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md'), 'utf8').replace(/\r\n/g, '\n');
const mdSection = (headingRe) => { const lines = STEPS_MD.split('\n'); const i = lines.findIndex((l) => headingRe.test(l)); if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^## /.test(l)); return lines.slice(i, j < 0 ? undefined : j).join('\n'); };
const mdBlocks = (section, lang) => [...section.matchAll(/^```([a-z]*)\n([\s\S]*?)^```$/gm)].filter((m) => lang === null || m[1] === lang).map((m) => m[2]);

const evidence = [];
const note = (s) => { evidence.push(s); };

const plane = await startV1Plane({ migrate: false, baselineRows: true });
let sup;
try {
  sup = await connect(plane.superUrl);
  note('plane: disposable scratch PostgreSQL ' + (await sup.query('show server_version')).rows[0].server_version + ', bootstrap superuser '
    + (await sup.query('select current_user u')).rows[0].u + '; provisioned as 69df2f52 AS the applying login postgres (applying_role_plane.mjs)');
  note('baseline rows loaded unchanged: ' + JSON.stringify(plane.loaded));
  const serverMajor = Number((await sup.query('show server_version_num')).rows[0].server_version_num.slice(0, 2));

  // ================================================================== P (before) / the migration
  const before = await evidenceHashes(sup);
  const beforeCat = await catalogFacts(sup);
  row('P0 manifest evidence hashes on the loaded copy, BEFORE the migration, equal the manifest',
    before.agent_runs === MANIFEST.set_sha256.agent_runs && before.work_orders === MANIFEST.set_sha256.work_orders && before.checkpoints === MANIFEST.set_sha256.checkpoints,
    'counts ' + before.counts.join('/') + ' runs ' + before.agent_runs.slice(0, 12));
  const OBS = plane.observation;
  const pgRole = (await sup.query(`select rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls from pg_roles where rolname = 'postgres'`)).rows[0];
  const frHeld = (await sup.query(`select admin_option a, inherit_option i, set_option s from pg_auth_members where roleid = 'factory_runner'::regrole and member = 'postgres'::regrole`)).rows;
  const selfGrant = (await sup.query(`select current_setting('createrole_self_grant') v`)).rows[0].v;
  row('AL0 BEFORE the migration the applying login is postgres, NOSUPERUSER, with exactly the observed attributes; it holds factory_runner with ADMIN only; createrole_self_grant is the observed value',
    pgRole && pgRole.rolsuper === false && Object.keys(pgRole).every((k) => pgRole[k] === OBS.attributes[k])
      && frHeld.length === 1 && frHeld[0].a === true && frHeld[0].i === false && frHeld[0].s === false && selfGrant === (OBS.createrole_self_grant.value || ''),
    JSON.stringify({ postgres: pgRole, factory_runner_held: frHeld, createrole_self_grant: selfGrant }));
  // P0n THE MIGRATION CARRIES NO PRECONDITION BLOCK: on a database that is not provisioned as 69df2f52 it stops at the first statement
  // that refers to a 69df2f52 object the database lacks, and its one transaction leaves nothing behind. Two fresh databases of this cluster, each
  // dropped afterwards: (a) no schema factory; (b) schema factory without the 69df2f52 tables. (A cluster without the role
  // factory_runner cannot be shown here: roles belong to the cluster, and this one holds it. Part 000's default-privilege revoke
  // names that role, so there the same transaction aborts at that statement.) Run before the migration is applied on this plane,
  // while the three roles do not exist yet, so a role that survived would be seen.
  const membersPre = await authMembers(sup);
  const bareRuns = [];
  for (const [db, setup] of [['qa_not_69df2f52_a', null], ['qa_not_69df2f52_b', 'create schema factory authorization postgres']]) {
    await sup.query('create database ' + db);
    let err = null;
    try {
      if (setup) { const b = await connect(plane.superUrl.replace(/\/postgres$/, '/' + db)); try { await b.query(setup); } finally { await b.end(); } }
      try { await applyAsApplyingLogin({ ...plane, adminUrl: plane.adminUrl.replace(/\/postgres$/, '/' + db), loaded: null }, { mode: 'verbatim' }); }
      catch (e) { err = e; }
    } finally { await sup.query('drop database ' + db + ' with (force)'); }
    bareRuns.push({ db, code: err ? err.code : null, message: err ? String(err.message).split(' | ')[0].slice(0, 90) : 'COMMITTED' });
  }
  const rolesAfterBare = (await sup.query(`select count(*)::int n from pg_roles where rolname in ('factory_owner', 'factory_node_api', 'factory_admin_api')`)).rows[0].n;
  row('P0n on a database not provisioned as 69df2f52 the migration (AS the applying login) aborts at the first statement naming a missing 69df2f52 object - no schema factory: 3F000 at the schema grant; schema factory without the 69df2f52 tables: 42P01 at the table grant - and nothing survives: no factory role, no membership',
    bareRuns[0].code === '3F000' && /schema "factory" does not exist/.test(bareRuns[0].message) && bareRuns[1].code === '42P01' && /relation "factory\.nodes" does not exist/.test(bareRuns[1].message)
      && rolesAfterBare === 0 && canon(await authMembers(sup)) === canon(membersPre), JSON.stringify({ runs: bareRuns, rolesAfterBare }));
  const membersBefore = await authMembers(sup);
  const defaclBefore = await defaultAcl(sup);
  // §3.5 "the rows the migration writes": every table in every schema, read before and after as the plane's superuser
  const rowsBefore = await snapshot(sup);
  const t0 = Date.now();
  let applied;
  try { applied = await applyAsApplyingLogin(plane); }
  catch (e) { row('P1 the live-migration step commits when the applying login postgres (NOSUPERUSER) runs it', false, e.message); throw e; }
  const rowsAfter = await snapshot(sup, rowsBefore);
  note('migration applied AS postgres as the ' + applied.mode + ' (' + (Date.now() - t0) + ' ms): step sha256 ' + applied.stepSha256 + '; files '
    + applied.files.map((f) => f.path.split('/').pop() + ' ' + f.sha256.slice(0, 12)).join(', '));
  await enableApiLogins(plane);
  const tenantsNow = (await sup.query(`select to_regclass('factory.tenants') is not null t`)).rows[0].t;
  row('P1 the live-migration step (the Director instrument at ' + DIRECTOR.slice(0, 8) + ') commits when the applying login postgres (NOSUPERUSER) runs it on a 69df2f52 plane holding the baseline rows; its in-transaction checks (part 990 (c), (d)) passed',
    applied.mode === 'step' && /^[0-9a-f]{64}$/.test(applied.stepSha256 || '') && tenantsNow, 'step sha256 ' + applied.stepSha256);
  const after = await evidenceHashes(sup);
  row('P2 manifest evidence-field set hashes are UNCHANGED after the migration (AC-11 on the copy)',
    after.agent_runs === MANIFEST.set_sha256.agent_runs && after.work_orders === MANIFEST.set_sha256.work_orders && after.checkpoints === MANIFEST.set_sha256.checkpoints,
    JSON.stringify({ agent_runs: after.agent_runs, work_orders: after.work_orders, checkpoints: after.checkpoints }));
  row('P3 every manifest row hash is unchanged, row by row',
    ['agent_runs', 'work_orders', 'checkpoints'].every((t) => canon(after.rows[t]) === canon(manifestRows[t])));
  const nodesKept = (await sup.query('select count(*)::int n from factory.nodes')).rows[0].n;
  row('P4 no node record deleted; no evidence row added (the migration writes no computer, run or work order)', nodesKept === plane.loaded.nodes
    && (await sup.query('select (select count(*) from factory.agent_runs)::int r, (select count(*) from factory.work_orders)::int w, (select count(*) from factory.checkpoints)::int c')).rows
      .every((x) => x.r === plane.loaded.agent_runs && x.w === plane.loaded.work_orders && x.c === plane.loaded.checkpoints));
  const legacyTenant = (await sup.query(`select count(*)::int n from factory.agent_runs where tenant_id <> $1`, [OPERATOR])).rows[0].n;
  row('P5 every existing row carries the operator tenant (tenant_id added; evidence fields untouched)', legacyTenant === 0);
  // S-9 over every table of schema factory. factory.plane_identity is a 69df2f52 provisioning row present only on a dedicated-Supabase
  // plane; giving it tenant_id would need a statement that names it (S-10). It is excluded here under the Director's ruling on
  // CR-007 (APPROVED, option 1: a 69df2f52 provisioning artifact, outside S-9), and the exclusion is printed on every run.
  const s9 = (await sup.query(`select c.relname r, a.attnum is not null has_col, coalesce(a.attnotnull, false) not_null
      from pg_class c left join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
     where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'plane_identity' order by 1`)).rows;
  const s9Bad = s9.filter((x) => !(x.has_col && x.not_null)).map((x) => x.r);
  row('P5b S-9: every table in schema factory - the 69df2f52 tables and every table the migration adds - has a NOT NULL tenant_id (factory.plane_identity excluded: CR-007)',
    s9.length >= BASE_TABLES.length + NEW_TABLES.length && BASE_TABLES.concat(NEW_TABLES).every((t) => s9.some((x) => x.r === t)) && s9Bad.length === 0,
    s9.length + ' tables' + (s9Bad.length ? '; without a NOT NULL tenant_id: ' + s9Bad.join(', ') : ''));
  note('plane_identity: factory.plane_identity (a 69df2f52 provisioning row, plane-dependent) is excluded from the P5b tenant_id scan: outside S-9 (CR-007, APPROVED option 1); present here: '
    + (await sup.query(`select count(*)::int n from pg_class where relnamespace = 'factory'::regnamespace and relname = 'plane_identity'`)).rows[0].n);
  console.log('INFO ' + evidence[evidence.length - 1]);
  const reserved = (await sup.query(`select count(*)::int n from factory.work_orders where 'factory-enrolled-v1' = any(requires_capabilities)`)).rows[0].n;
  row('P6 no legacy work order gained factory-enrolled-v1', reserved === 0);
  // W1-W6 (contract §1 "What a candidate migration writes"; VERIFICATION_SPEC §3.5), on the plane holding the baseline rows
  for (const w of await rowChecks(sup, rowsBefore, rowsAfter, { operator: OPERATOR, policies: ['a1e0f000-0000-4000-8000-000000000101', 'a1e0f000-0000-4000-8000-000000000102'] })) row(w.id, w.ok, w.detail);
  // a second migration run is refused (it runs exactly once): the roles it creates belong to the cluster, so `create role
  // factory_owner` fails in the second run's one transaction (part 000 carries no precondition block)
  const membersAfter = await authMembers(sup);
  const defaclAfter = await defaultAcl(sup);
  const tablesAfter = (await sup.query(`select count(*)::int n from pg_class where relnamespace = 'factory'::regnamespace`)).rows[0].n;
  let second = null, secondCode = null; try { await applyAsApplyingLogin(plane); } catch (e) { second = String(e.message); secondCode = e.code; }
  row('P7 a second application (AS the applying login) is refused - 42710 at `create role factory_owner`, the role exists - and changes nothing (memberships, default privileges, relations)',
    secondCode === '42710' && /role "factory_owner" already exists/.test(second || '')
    && canon(await authMembers(sup)) === canon(membersAfter) && canon(await defaultAcl(sup)) === canon(defaclAfter)
    && (await sup.query(`select count(*)::int n from pg_class where relnamespace = 'factory'::regnamespace`)).rows[0].n === tablesAfter, second && second.slice(0, 90));

  // ================================================================== C catalog
  const roles = (await sup.query(`select rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit
                                    from pg_roles where rolname in ('factory_owner','factory_node_api','factory_admin_api') order by 1`)).rows;
  row('C1 roles factory_owner / factory_node_api / factory_admin_api: no superuser, createrole, createdb, replication or bypassrls; noinherit',
    roles.length === 3 && roles.every((r) => !r.rolsuper && !r.rolcreaterole && !r.rolcreatedb && !r.rolreplication && !r.rolbypassrls && !r.rolinherit),
    roles.map((r) => r.rolname).join(','));
  const owner = (await sup.query(`select relname, pg_get_userbyid(relowner) o from pg_class where relnamespace = 'factory'::regnamespace and relkind = 'r' order by 1`)).rows;
  const newOwned = owner.filter((r) => r.o === 'factory_owner').map((r) => r.relname);
  row('C2 exactly the 19 new tables exist and are owned by factory_owner; the 69df2f52 tables keep their owner',
    canon(newOwned) === canon(NEW_TABLES) && owner.filter((r) => BASE_TABLES.includes(r.relname)).every((r) => r.o !== 'factory_owner'),
    newOwned.length + ' new');
  const afterCat = await catalogFacts(sup);
  const runnerNew = afterCat.runner_table_privs.filter((t) => NEW_TABLES.includes(t.split(':')[0]));
  row('C3 factory_runner holds NO privilege (any kind) on any new table (has_table_privilege)', runnerNew.length === 0, runnerNew.join(','));
  const colPriv = (await sup.query(`select count(*)::int n from pg_class c join pg_attribute a on a.attrelid = c.oid
     where c.relnamespace = 'factory'::regnamespace and c.relname = any($1) and a.attnum > 0 and not a.attisdropped
       and (has_column_privilege('factory_runner', c.oid, a.attnum, 'SELECT') or has_column_privilege('factory_runner', c.oid, a.attnum, 'INSERT')
         or has_column_privilege('factory_runner', c.oid, a.attnum, 'UPDATE') or has_column_privilege('factory_runner', c.oid, a.attnum, 'REFERENCES'))`, [NEW_TABLES])).rows[0].n;
  const attacl = (await sup.query(`select count(*)::int n from pg_class c join pg_attribute a on a.attrelid = c.oid
     where c.relnamespace = 'factory'::regnamespace and c.relname = any($1) and a.attacl is not null`, [NEW_TABLES])).rows[0].n;
  row('C4 no column-level privilege for factory_runner on any new table (has_column_privilege; pg_attribute.attacl empty)', colPriv === 0 && attacl === 0, 'columns ' + colPriv + ', attacl ' + attacl);
  // C3s the identity sequences PostgreSQL creates for the new tables (found through pg_depend, not by name): factory_runner and the two
  // API roles hold no USAGE, SELECT or UPDATE on any of them (PUBLIC on them is AL2's)
  const ownedSeqs = `select sq.oid from pg_class sq, pg_depend dep where sq.relkind = 'S' and dep.objid = sq.oid and dep.classid = 'pg_class'::regclass
       and dep.refclassid = 'pg_class'::regclass and dep.refobjid in (select ('factory.' || t)::regclass::oid from unnest($1::text[]) t)`;
  const seqNames = (await sup.query(`select oid::regclass::text seq from pg_class where oid in (${ownedSeqs}) order by 1`, [NEW_TABLES])).rows.map((r) => r.seq);
  const seqGrants = (await sup.query(`select q.oid::regclass::text || ':' || r || ':' || p x from pg_class q,
      unnest(array['factory_runner', 'factory_node_api', 'factory_admin_api']) r, unnest(array['USAGE', 'SELECT', 'UPDATE']) p
     where q.oid in (${ownedSeqs}) and has_sequence_privilege(r, q.oid, p)`, [NEW_TABLES])).rows.map((r) => r.x);
  row('C3s factory_runner and the two API roles hold no USAGE, SELECT or UPDATE on the identity sequences of the new tables (has_sequence_privilege; the sequences found through pg_depend)',
    seqNames.length === 3 && seqGrants.length === 0, 'sequences ' + seqNames.join(',') + '; held [' + seqGrants.join(',') + ']');
  const baseBefore = beforeCat.runner_table_privs.filter((t) => BASE_TABLES.includes(t.split(':')[0]));
  const baseAfter = afterCat.runner_table_privs.filter((t) => BASE_TABLES.includes(t.split(':')[0]));
  row('C5 factory_runner keeps exactly its 69df2f52 privileges on the 69df2f52 tables', canon(baseBefore) === canon(baseAfter), baseAfter.length + ' grants');
  const fnExec = (await sup.query(`select p.oid::regprocedure::text f,
      has_function_privilege('factory_runner', p.oid, 'EXECUTE') runner,
      exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') pub,
      has_function_privilege('factory_node_api', p.oid, 'EXECUTE') node_api, has_function_privilege('factory_admin_api', p.oid, 'EXECUTE') admin_api
     from pg_proc p where p.pronamespace = 'factory'::regnamespace`)).rows;
  row('C6 no factory function is executable by factory_runner or PUBLIC (' + fnExec.length + ' functions)', fnExec.every((f) => !f.runner && !f.pub),
    fnExec.filter((f) => f.runner || f.pub).map((f) => f.f).join(','));
  // C18 / C19 (AC-7, AC-10: "No node operation exists outside the S-7 list"; the route surface is exactly S-7): the functions each API
  // role can EXECUTE, read from the catalog, are exactly its operations - by exact name, one function each, every one SECURITY DEFINER
  const S7_FNS = ['node_time', 'node_session_open', 'node_enroll_start', 'node_enroll_complete', 'node_register', 'node_heartbeat', 'node_claim', 'node_renew',
    'node_checkpoint', 'node_complete', 'node_release', 'node_verification_claim', 'node_certify', 'node_report_state', 'node_credential_rotate'];
  const adminSrc = readFileSync(join(ROOT, 'supabase/control-plane/edge/supabase/functions/_shared/admin_api.ts'), 'utf8');
  const ADMIN_FNS = [...((/export const ADMIN_OPS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(adminSrc) || [])[1] || '').matchAll(/fn:\s*'([a-z_]+)'/g)].map((x) => x[1]);
  const roleFns = async (role) => (await sup.query(`select p.proname n, p.prosecdef d, (select count(*)::int from pg_proc q where q.pronamespace = p.pronamespace and q.proname = p.proname) c
      from pg_proc p where p.pronamespace = 'factory'::regnamespace and has_function_privilege($1, p.oid, 'EXECUTE') order by 1`, [role])).rows;
  const nodeFns = await roleFns('factory_node_api'), adminFns = await roleFns('factory_admin_api');
  const sameSet = (rows, want) => JSON.stringify(rows.map((r) => r.n).sort()) === JSON.stringify([...want].sort()) && rows.every((r) => r.d && r.c === 1);
  row('C18 factory_node_api can EXECUTE exactly the 15 S-7 operations (by exact name, one function each, SECURITY DEFINER) and nothing else in schema factory',
    S7_FNS.length === 15 && sameSet(nodeFns, S7_FNS), JSON.stringify({ extra: nodeFns.map((r) => r.n).filter((n) => !S7_FNS.includes(n)), missing: S7_FNS.filter((n) => !nodeFns.some((r) => r.n === n)),
      notDefinerOrOverloaded: nodeFns.filter((r) => !r.d || r.c !== 1).map((r) => r.n) }));
  row('C19 factory_admin_api can EXECUTE exactly the ' + ADMIN_FNS.length + ' Admin API operations named in admin_api.ts ADMIN_OPS (one function each, SECURITY DEFINER) and nothing else in schema factory',
    ADMIN_FNS.length === 23 && sameSet(adminFns, ADMIN_FNS), JSON.stringify({ extra: adminFns.map((r) => r.n).filter((n) => !ADMIN_FNS.includes(n)), missing: ADMIN_FNS.filter((n) => !adminFns.some((r) => r.n === n)) }));
  // C20 (AC-10, S-10 "superusers are refused"): EVERY front door, called from the plane's superuser session with typed nulls, raises 42501
  // factory_superuser_refused - and nothing is written (each call in its own transaction, rolled back; the table counts are compared too)
  const doors = (await sup.query(`select p.proname n, array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) types
      from pg_proc p where p.pronamespace = 'factory'::regnamespace and p.proname ~ '^(node|admin)_' order by 1`)).rows;
  const tableCounts = async () => (await sup.query(`select string_agg(c.relname || '=' || (xpath('/row/n/text()', query_to_xml(format('select count(*) n from factory.%I', c.relname), false, true, '')))[1]::text, ',' order by c.relname) s
      from pg_class c where c.relnamespace = 'factory'::regnamespace and c.relkind = 'r'`)).rows[0].s;
  const countsBefore = await tableCounts();
  const notRefused = [];
  for (const dr of doors) {
    await sup.query('begin');
    let outcome;
    try { const r = await sup.query(`select factory.${dr.n}(${dr.types.map((t) => 'null::' + t).join(', ')}) r`); outcome = 'ANSWERED ' + JSON.stringify(r.rows[0].r).slice(0, 60); }
    catch (e) { outcome = e.code === '42501' && /^factory_superuser_refused/.test(e.message) ? 'refused' : 'ERROR ' + e.code + ' ' + String(e.message).slice(0, 60); }
    await sup.query('rollback');
    if (outcome !== 'refused') notRefused.push(dr.n + ': ' + outcome);
  }
  const countsAfter = await tableCounts();
  row('C20 every front door (' + doors.length + ': the 15 node and 23 admin operations) called from a superuser session raises 42501 factory_superuser_refused; no factory table changes',
    doors.length === 38 && notRefused.length === 0 && countsAfter === countsBefore, JSON.stringify({ notRefused, countsSame: countsAfter === countsBefore }));
  const defacl = (await sup.query(`select pg_get_userbyid(d.defaclrole) r, d.defaclobjtype t, a.grantee::regrole::text g, a.privilege_type p
      from pg_default_acl d cross join aclexplode(d.defaclacl) a where d.defaclnamespace = 'factory'::regnamespace`)).rows;
  row('C7 pg_default_acl in schema factory: no default grant to factory_runner (the 69df2f52 grant revoked)', !defacl.some((d) => d.g === 'factory_runner'),
    defacl.map((d) => d.r + '/' + d.t + '->' + d.g + ':' + d.p).join(' '));
  row('C8 pg_auth_members: factory_runner is a member of the same roles as at 69df2f52 (none), and its members are unchanged; no API role is a member of it',
    canon(beforeCat.runner_member_of) === canon(afterCat.runner_member_of) && afterCat.runner_member_of.length === 0
      && canon(beforeCat.members_of_runner) === canon(afterCat.members_of_runner)
      && !afterCat.members_of_runner.some((r) => /^factory_(node_api|admin_api|owner)$/.test(r)),
    'member of ' + JSON.stringify(afterCat.runner_member_of) + '; members ' + JSON.stringify(afterCat.members_of_runner));
  const apiTable = (await sup.query(`select count(*)::int n from pg_class c, unnest(array['factory_node_api','factory_admin_api']) r,
      unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      where c.relnamespace = 'factory'::regnamespace and c.relkind in ('r','v','m','S') and has_table_privilege(r, c.oid, p)`)).rows[0].n;
  row('C9 the API roles hold no table privilege at all (only front-door EXECUTE)', apiTable === 0);
  const allFns = (await sup.query(`select p.oid::regprocedure::text f, p.proconfig, p.prosecdef from pg_proc p where p.pronamespace = 'factory'::regnamespace`)).rows;
  const badSp = allFns.filter((d) => !(d.proconfig || []).some((x) => x === 'search_path=pg_catalog, pg_temp'));
  row('C10 every factory function - front doors, guards and helpers - pins exactly search_path=pg_catalog, pg_temp (pg_catalog first, the session\'s temporary schema last)',
    allFns.length >= 100 && badSp.length === 0, badSp.length ? badSp.map((d) => d.f).join(', ') : allFns.length + ' functions (' + allFns.filter((d) => d.prosecdef).length + ' SECURITY DEFINER)');
  // (the engine test lives only in the two guards: factory._is_engine, which nothing in the product called, is not created)
  const idText = (await sup.query(`select pg_get_functiondef('factory._via_api()'::regprocedure) d`)).rows[0].d;
  const noIsEngine = (await sup.query(`select count(*)::int n from pg_proc where pronamespace = 'factory'::regnamespace and proname = '_is_engine'`)).rows[0].n === 0;
  const guardText = (await sup.query(`select pg_get_functiondef('factory._legacy_guard()'::regprocedure) d`)).rows[0].d
    + (await sup.query(`select pg_get_functiondef('factory._authority_guard()'::regprocedure) d`)).rows[0].d;
  // every other occurrence of current_user / session_user in these bodies (a ::cast, CAST(... AS ...), ||, format(), ...) fails
  const idStray = [...(idText + '\n' + guardText).replace(/--[^\n]*/g, '')
    .replace(/\bcurrent_user (=|<>) 'factory_owner'::pg_catalog\.name(?![\w.:])/g, '')
    .replace(/\bsession_user in \('factory_node_api'::pg_catalog\.name, 'factory_admin_api'::pg_catalog\.name\)(?![\w.:])/g, '')
    .matchAll(/\b(current_user|session_user|current_role)\b[^\n]{0,40}/gi)].map((m) => m[0].trim());
  row('C16 the engine tests (the legacy and authority guards) and the API-caller test (factory._via_api) compare current_user / session_user with pg_catalog.name constants, in exactly that shape; no other use of either (no cast, CAST, concatenation or format) appears in those functions; no other engine-test function exists',
    idStray.length === 0 && noIsEngine
      && /session_user (in|=)[^;]*::pg_catalog\.name/.test(idText) && /current_user = 'factory_owner'::pg_catalog\.name/.test(guardText)
      && /current_user <> 'factory_owner'::pg_catalog\.name/.test(guardText),
    idStray.length ? 'other uses: ' + JSON.stringify(idStray) : 'identity tests carry no shadowable type' + (noIsEngine ? '' : '; factory._is_engine exists'));
  const pol = (await sup.query(`select policy_id, scope, campaign_key, title, version, require_distinct_run, require_distinct_identity, require_verifier_authority,
      require_physical_separation, restrict_bound_computer_authoring, director_document_paths, frozen from factory.verification_policies order by scope desc`)).rows;
  const wantPol = [
    { scope: 'tenant_default', campaign_key: null, require_distinct_run: true, require_distinct_identity: true, require_verifier_authority: true,
      require_physical_separation: false, restrict_bound_computer_authoring: false, director_document_paths: [], frozen: false },
    { scope: 'campaign', campaign_key: 'auto-enrollment-v1', require_distinct_run: true, require_distinct_identity: true, require_verifier_authority: true,
      require_physical_separation: true, restrict_bound_computer_authoring: true, director_document_paths: ['docs/', 'qa/verification/', 'qa/work-orders/', 'governance/'], frozen: true }];
  const strip = (p) => { const { policy_id, title, version, ...rest } = p; return rest; };
  row('C11 the seeded policy rows are exactly contract §1\'s two rows (tenant default; campaign Auto-Enrollment V1)',
    pol.length === 2 && canon(pol.map(strip)) === canon(wantPol) && pol.every((p) => p.version === 1), JSON.stringify(pol.map((p) => p.title)));
  const seeded = (await sup.query(`select (select count(*) from factory.tenants)::int t, (select count(*) from factory.tenants where is_operator)::int o,
      (select count(*) from factory.tenant_admins)::int a, (select count(*) from factory.computers)::int c,
      (select count(*) from factory.verification_policy_versions)::int v`)).rows[0];
  // (contract §1: exactly the policy rows and the one operator tenant row - no policy-version row; a seeded policy's version 1 is
  // recorded when its first change replaces it, E9)
  row('C12 the migration seeds one operator tenant, and writes no policy-version row, tenant admin, computer or S-16(a) binding',
    seeded.t === 1 && seeded.o === 1 && seeded.a === 0 && seeded.c === 0 && seeded.v === 0, JSON.stringify(seeded));
  // (the static contract's scanner - the r3 §3.4 hit list, not a fixed word list: current_catalog, SHOW, SET ... FROM CURRENT, the
  // server's address and version, dynamic SQL included)
  const { scanSql } = await import(pathToFileURL(join(ROOT, 'qa', 'scenarios-runner', 'factory_v1_plane_scan.mjs')).href);
  const scanned = scanSql(readdirSync(join(ROOT, 'supabase', 'control-plane', 'v1')).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ path: 'supabase/control-plane/v1/' + f, text: readFileSync(join(ROOT, 'supabase', 'control-plane', 'v1', f), 'utf8'), kind: 'migration' })));
  const planeRefs = scanned.hits.filter((x) => ['plane_identity', 'database', 'server', 'setting'].includes(x.construct)).map((x) => x.file.split('/').pop() + ':' + x.line + ' ' + x.text);
  row('C13 static scan (the shared §3.4 scanner): no statement or function of the migration reads a plane-distinguishing value (plane_identity, current_database / current_catalog, the server\'s address, port or version, a setting)',
    scanned.units.length > 100 && planeRefs.length === 0, planeRefs.join(','));
  const trig = (await sup.query(`select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'factory'::regnamespace and not t.tgisinternal`)).rows;
  row('C14 the legacy guard is attached to each 69df2f52 table, and the authority guard + no-truncate to each new table',
    BASE_TABLES.every((b) => trig.some((t) => t.relname === b && t.tgname === 'factory_v1_legacy_guard'))
    && NEW_TABLES.every((n) => trig.some((t) => t.relname === n && t.tgname === 'factory_v1_a_authority') && trig.some((t) => t.relname === n && t.tgname === 'factory_v1_no_truncate')));
  const guardDef = (await sup.query(`select pg_get_functiondef('factory._legacy_guard()'::regprocedure) d`)).rows[0].d;
  const listsAgree = [];
  for (const t of BASE_TABLES) {
    const cols = (await sup.query('select factory._baseline_columns($1) c', [t])).rows[0].c;
    // the arm in exactly one shape: `when '<t>' then array[...]` followed directly by the next `when` or by `end` (an arm extended
    // past its array is not found, and fails)
    const m = new RegExp("when\\s+'" + t + "'\\s+then\\s+array\\[([^\\]]*)\\]\\s+(when|end)[^a-z_]").exec(guardDef);
    const inGuard = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
    listsAgree.push(inGuard && canon(inGuard) === canon(cols));
  }
  row('C15 the legacy guard\'s 69df2f52 column lists, read from its definition on the plane, equal factory._baseline_columns() table by table (the source comparison is static R10)', listsAgree.every(Boolean));
  // the guard's enrolled node-id namespace is the very pattern every agent principal's node_id is held to (part 020's CHECK), so every
  // node id the Factory issues falls inside the fence, whatever form the minting takes
  const guardPat = (/enrolled_id constant text := '([^']+)'/.exec(guardDef) || [])[1] || null;
  const checkPats = (await sup.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'factory.agent_principals'::regclass and contype = 'c'`)).rows
    .map((r) => /\bnode_id ~ '([^']+)'/.exec(r.d)).filter(Boolean).map((x) => x[1]);
  row('C17 the legacy guard\'s enrolled node-id pattern is exactly the CHECK on factory.agent_principals.node_id',
    guardPat !== null && checkPats.length === 1 && checkPats[0] === guardPat, JSON.stringify({ guard: guardPat, check: checkPats }));

  // ================================================================== AL the applying login and the privilege model
  const addedM = minus(membersAfter, membersBefore), removedM = minus(membersBefore, membersAfter);
  row('AL1 pg_auth_members: the migration added exactly the four predicted rows (PostgreSQL\'s creator ADMIN grants on the three roles, and SET without INHERIT on factory_owner) and removed none; no member is factory_runner or a new role',
    canon([...addedM].sort()) === canon([...PREDICTED_MEMBERS].sort()) && removedM.length === 0,
    'added ' + JSON.stringify(addedM) + ' removed ' + JSON.stringify(removedM));
  const pgReach = (await sup.query(`select pg_has_role('postgres', 'factory_owner', 'USAGE') o_usage, pg_has_role('postgres', 'factory_owner', 'SET') o_set,
      pg_has_role('postgres', 'factory_node_api', 'USAGE') n_usage, pg_has_role('postgres', 'factory_node_api', 'SET') n_set,
      pg_has_role('postgres', 'factory_admin_api', 'USAGE') a_usage, pg_has_role('postgres', 'factory_admin_api', 'SET') a_set`)).rows[0];
  // SELECT is not asked: the live applying login reads everything through pg_read_all_data (APPLYING_ROLE_OBSERVATION.json)
  const writePrivs = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', ...(serverMajor >= 17 ? ['MAINTAIN'] : [])];
  const pgWrites = (await sup.query(`select t || ':' || p x from unnest($1::text[]) t, unnest($2::text[]) p where has_table_privilege('postgres', 'factory.' || t, p)`,
    [NEW_TABLES, writePrivs])).rows.map((r) => r.x);
  const idSeqs = (await sup.query(`select d.objid::regclass::text s from pg_depend d join pg_class s on s.oid = d.objid and s.relkind = 'S'
      where d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass and d.refobjid = any (select ('factory.' || t)::regclass::oid from unnest($1::text[]) t) order by 1`, [NEW_TABLES])).rows.map((r) => r.s);
  const publicHolds = (await sup.query(`select c.oid::regclass::text r from pg_class c, aclexplode(c.relacl) a
      where c.oid = any (select x::regclass::oid from unnest($1::text[]) x) and a.grantee = 0`, [[...NEW_TABLES.map((t) => 'factory.' + t), ...idSeqs]])).rows.map((r) => r.r);
  row('AL2 the applying login may SET ROLE factory_owner but inherits none of its privileges, and can neither use nor become either API role; it can write to no authority table; no relation the migration created grants PUBLIC anything',
    pgReach.o_usage === false && pgReach.o_set === true && !pgReach.n_usage && !pgReach.n_set && !pgReach.a_usage && !pgReach.a_set && pgWrites.length === 0 && publicHolds.length === 0 && idSeqs.length === 3,
    JSON.stringify(pgReach) + ' postgres writes [' + pgWrites.slice(0, 6).join(',') + '] PUBLIC on [' + publicHolds.join(',') + '] identity sequences ' + idSeqs.length);
  const ownerOn = (await sup.query(`select t, has_table_privilege('factory_owner', 'factory.' || t, 'SELECT') s, has_table_privilege('factory_owner', 'factory.' || t, 'INSERT') i,
      has_table_privilege('factory_owner', 'factory.' || t, 'UPDATE') u, has_table_privilege('factory_owner', 'factory.' || t, 'DELETE') d,
      has_table_privilege('factory_owner', 'factory.' || t, 'REFERENCES') r, has_table_privilege('factory_owner', 'factory.' || t, 'TRIGGER') tg,
      has_table_privilege('factory_owner', 'factory.' || t, 'TRUNCATE') tr from unnest($1::text[]) t`, [BASE_TABLES])).rows;
  const ownerSchema = (await sup.query(`select has_schema_privilege('factory_owner', 'factory', 'USAGE') u, has_schema_privilege('factory_owner', 'factory', 'CREATE') c`)).rows[0];
  row('AL3 on each 69df2f52 table factory_owner keeps SELECT, INSERT, UPDATE, DELETE and REFERENCES and nothing more (no TRIGGER once part 080 has attached the legacy guard, no TRUNCATE); on schema factory it keeps USAGE and has lost CREATE',
    ownerOn.length === 8 && ownerOn.every((o) => o.s && o.i && o.u && o.d && o.r && !o.tg && !o.tr) && ownerSchema.u === true && ownerSchema.c === false,
    JSON.stringify(ownerOn.filter((o) => !(o.s && o.i && o.u && o.d && o.r && !o.tg && !o.tr)).map((o) => o.t)) + ' schema ' + JSON.stringify(ownerSchema));
  const defRemoved = minus(defaclBefore, defaclAfter), defAdded = minus(defaclAfter, defaclBefore);
  row('AL4 default privileges after the migration: the applying login\'s 69df2f52 entry for factory_runner has been removed, and the single new entry is factory_owner\'s all-schemas entry for functions, in which PUBLIC has no EXECUTE',
    canon([...defRemoved].sort()) === canon([...PREDICTED_DEFACL_REMOVED].sort()) && canon(defAdded) === canon(PREDICTED_DEFACL_ADDED) && !defaclAfter.some((d) => / PUBLIC /.test(d) && /^factory_owner /.test(d)),
    'removed ' + JSON.stringify(defRemoved) + ' added ' + JSON.stringify(defAdded));
  let probe = null;
  try {
    await sup.query('begin');
    await sup.query('grant create on schema factory to factory_owner');
    await sup.query('set local role factory_owner');
    await sup.query(`create function factory.qa_probe_born_acl() returns integer language sql as 'select 1'`);
    probe = (await sup.query(`select p.proacl is not null explicit, not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) no_public,
        has_function_privilege('factory_runner', p.oid, 'EXECUTE') runner, has_function_privilege('postgres', p.oid, 'EXECUTE') applying
        from pg_proc p where p.oid = 'factory.qa_probe_born_acl()'::regprocedure`)).rows[0];
  } catch (e) { probe = { error: e.message }; } finally { await sup.query('rollback').catch(() => {}); }
  row('AL5 a function factory_owner creates in schema factory is born without PUBLIC EXECUTE (the global default-privilege entry, not a per-schema no-op): explicit ACL, no PUBLIC, no EXECUTE for factory_runner or the applying login',
    probe && probe.explicit === true && probe.no_public === true && probe.runner === false && probe.applying === false, JSON.stringify(probe));
  // part 990's two revoke statements, read from its source (comments removed): `revoke all on table <list> from public, factory_runner;`
  // and `revoke all on sequence <list> from public, factory_runner;`
  const src990 = readFileSync(join(ROOT, 'supabase/control-plane/v1/990_finalize.sql'), 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
  const revokeList = (kind) => {
    const all = [...src990.matchAll(new RegExp('\\brevoke all on ' + kind + '\\s+([^;]*?)\\s+from public, factory_runner;', 'gi'))];
    return all.length === 1 ? (all[0][1].match(/factory\.[a-z_0-9]+/g) || []) : [];
  };
  const listed = revokeList('table');
  const owned = (await sup.query(`select c.oid::regclass::text r, c.relkind k from pg_class c where c.relnamespace = 'factory'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') and c.relowner = 'factory_owner'::regrole order by 1`)).rows;
  // the identity sequences part 990 names, compared with the ones PostgreSQL actually created for the new tables (pg_depend, read
  // here outside the migration)
  const seqsListed = revokeList('sequence');
  const uncovered = owned.filter((o) => !listed.includes(o.r) && !seqsListed.includes(o.r)).map((o) => o.r);
  row('AL6 part 990\'s two revokes by name - of its 19 tables, and of the identity sequences PostgreSQL created for them - cover every relation factory_owner owns, and name nothing else',
    listed.length === 19 && uncovered.length === 0 && [...listed, ...seqsListed].every((l) => owned.some((o) => o.r === l)) && canon([...listed].sort()) === canon(NEW_TABLES.map((t) => 'factory.' + t).sort())
      && idSeqs.length === 3 && canon([...seqsListed].sort()) === canon([...idSeqs].sort()),
    'listed ' + listed.length + ' + ' + seqsListed.length + ' sequences (created ' + JSON.stringify(idSeqs) + '), owned ' + owned.length + ', uncovered ' + JSON.stringify(uncovered));
  // AL7 (§3.3 "the candidate's API logins", §3.5): the API roles own nothing, in any database; they are members of no role; and every
  // privilege recorded for them (pg_shdepend: every object whose ACL names them, in every database, shared objects included) is
  // USAGE on schema factory or EXECUTE on a function in schema factory, never with a grant option (C18 / C19 say which functions).
  // Anything else they can do comes from PUBLIC.
  const apiDeps = (await sup.query(`select r.rolname api, d.deptype t, d.classid::regclass::text cls, d.objid::bigint obj, d.objsubid sub,
      d.dbid = (select oid from pg_database where datname = current_database()) here,
      case when d.classid = 'pg_namespace'::regclass then (select nspname::text from pg_namespace where oid = d.objid)
           when d.classid = 'pg_proc'::regclass then (select pronamespace::regnamespace::text from pg_proc where oid = d.objid) end nsp,
      case when d.classid = 'pg_namespace'::regclass then (select array_agg(a.privilege_type || case when a.is_grantable then ' WITH GRANT' else '' end order by 1)
                                                             from pg_namespace n, aclexplode(n.nspacl) a where n.oid = d.objid and a.grantee = r.oid)
           when d.classid = 'pg_proc'::regclass then (select array_agg(a.privilege_type || case when a.is_grantable then ' WITH GRANT' else '' end order by 1)
                                                        from pg_proc p, aclexplode(p.proacl) a where p.oid = d.objid and a.grantee = r.oid) end privs
    from pg_shdepend d join pg_roles r on r.oid = d.refobjid
   where d.refclassid = 'pg_authid'::regclass and r.rolname in ('factory_node_api', 'factory_admin_api')`)).rows;
  const apiOk = (d) => d.t === 'a' && d.here && d.sub === 0 && d.nsp === 'factory'
    && ((d.cls === 'pg_namespace' && JSON.stringify(d.privs) === '["USAGE"]') || (d.cls === 'pg_proc' && JSON.stringify(d.privs) === '["EXECUTE"]'));
  const apiMember = (await sup.query(`select r.rolname api, m.roleid::regrole::text granted from pg_auth_members m join pg_roles r on r.oid = m.member
      where r.rolname in ('factory_node_api', 'factory_admin_api')`)).rows;
  const apiBad = apiDeps.filter((d) => !apiOk(d));
  row('AL7 the API roles own no object in any database, are members of no role, and hold no recorded privilege other than USAGE on schema factory and EXECUTE on functions in schema factory (no grant option); beyond that they have only what PUBLIC has',
    apiBad.length === 0 && apiMember.length === 0 && apiDeps.some((d) => d.cls === 'pg_namespace') && apiDeps.some((d) => d.cls === 'pg_proc'),
    JSON.stringify({ other: apiBad.slice(0, 6), memberOf: apiMember, recorded: apiDeps.length }));

  // ================================================================== fixtures (as the engine)
  const comp = await enrolledComputer(sup, { name: 'enrolled-A' });
  const nmWo = await newModelWorkOrder(sup, { surface: ['surf/X'] });
  const nmRun = await enrolledRun(sup, comp, nmWo, { surfaces: ['surf/X'] });
  const nmCp = await enrolledCheckpoint(sup, comp, nmRun, nmWo);
  const nmWo2 = await newModelWorkOrder(sup, { surface: ['surf/Q'], title: 'new-model queued' });
  await asEngine(sup, () => sup.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [nmWo2, nmWo]));
  await asEngine(sup, () => sup.query(`insert into factory.tenants (tenant_id, name) values ('b2e0f000-0000-4000-8000-000000000002', 'second')`));
  await asEngine(sup, () => sup.query(`insert into factory.node_sessions (tenant_id, credential_id, token_hash, expires_at) values ($1, $2, sha256(gen_random_uuid()::text::bytea), now() + interval '10 minutes')`, [OPERATOR, comp.credentialId]));
  row('F1 the engine (factory_owner) writes an enrolled computer, envelope, principal, credential, new-model work order, run, lock and checkpoint through every guard', true, comp.nodeId);

  // ================================================================== L legacy refusals as factory_runner
  const run = await connect(plane.runnerUrl);
  try {
    const who = (await run.query('select current_user u, session_user s')).rows[0];
    note('legacy connection: current_user ' + who.u + ', session_user ' + who.s);
    const authorityWrites = [
      ['tenants', `insert into factory.tenants (tenant_id, name) values ('${randomUUID()}', 'x')`],
      ['tenant_admins', `insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ('${OPERATOR}', '${randomUUID()}', 'founder')`],
      ['computers', `update factory.computers set display_name = 'x'`],
      ['authorization_envelopes', `update factory.authorization_envelopes set authorized_roles = '{generic,verifier,release_broker}'`],
      ['authorization_envelopes', `insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ('${OPERATOR}', '${comp.computerId}', 2, '{release_broker}', '${ADMIN}')`],
      ['agent_principals', `insert into factory.agent_principals (tenant_id, computer_id, node_id, created_via, created_by) values ('${OPERATOR}', '${comp.computerId}', 'node-${'a'.repeat(32)}', 'admin_create', '${ADMIN}')`],
      ['node_credentials', `update factory.node_credentials set status = 'active'`],
      ['pairing_codes', `delete from factory.pairing_codes`],
      ['enrollments', `update factory.enrollments set state = 'ALIVE'`],
      ['node_sessions', `delete from factory.node_sessions`],
      ['audit_events', `insert into factory.audit_events (tenant_id, actor_kind, action, outcome) values ('${OPERATOR}', 'server', 'forged', 'ok')`],
      ['verification_policies', `update factory.verification_policies set require_physical_separation = false, version = version + 1`],
      ['verification_policies', `delete from factory.verification_policies`],
      ['certifications', `insert into factory.certifications (tenant_id, work_order_id, verification_work_order_id, candidate_run_id, candidate_commit, certifying_run_id, certifying_node_id, certifying_principal_id, certifying_computer_id, certifying_credential_id, certifier_envelope_version, verdict, policies, authoring_set) values ('${OPERATOR}', '${nmWo}', '${nmWo}', '${nmRun}', '${'a'.repeat(40)}', '${randomUUID()}', 'n', '${comp.principalId}', '${comp.computerId}', '${comp.credentialId}', 1, 'PASS', '[]', '[{}]')`],
      ['releases', `insert into factory.releases (tenant_id, channel, version, source_sha, digest, key_id, signature, receipt_sha256, manifest, published_by) values ('${OPERATOR}', 'production', '1.0.0', '${'a'.repeat(40)}', '${'b'.repeat(64)}', 'key-00000001', '${'A'.repeat(86)}', '${'c'.repeat(64)}', '{}', '${ADMIN}')`],
      ['release_revocations', `insert into factory.release_revocations (tenant_id, kind, key_id, revoked_by) values ('${OPERATOR}', 'key', 'key-00000001', '${ADMIN}')`],
    ];
    const l1 = [];
    for (const [t, sql] of authorityWrites) { const r = await tryQuery(run, sql); if (!refused(r)) l1.push(t + ': ' + (r.ok ? 'ALLOWED' : r.code + ' ' + r.message)); }
    row('L1 factory_runner: every write to an authority record is refused (tenants, admins, computers, envelopes, principals, credentials, pairing, enrollments, sessions, audit, policies, certifications, releases, revocations)',
      l1.length === 0, l1.join(' | ') || authorityWrites.length + ' writes refused');
    for (const t of NEW_TABLES) { const r = await tryQuery(run, `select 1 from factory.${t} limit 1`); if (r.ok) l1.push('SELECT ' + t); }
    row('L1r factory_runner cannot even read an authority record (no SELECT either)', !l1.some((x) => x.startsWith('SELECT')));
    const ex = [];
    for (const f of fnExec) { const r = await tryQuery(run, `select has_function_privilege(current_user, '${f.f}', 'EXECUTE') x`); if (!r.ok || r.rows[0].x) ex.push(f.f); }
    const call = await tryQuery(run, `select factory._via_api()`);
    row('L2 factory_runner holds EXECUTE on no factory function, and a direct call is refused', ex.length === 0 && refused(call, /permission denied/), ex.join(',') || call.message);

    // THE REFUSED LEGACY WRITES of L3, L5 and L6 are lists of [name, sql, params], built for a suffix that keeps the ids they insert
    // distinct: L9 replays exactly these writes in another session.
    const runWrites = async (c, writes) => { const out = []; for (const [n, sql, p] of writes) out.push([n, await tryQuery(c, sql, p)]); return out; };
    const allRefused = (res) => res.every(([, r]) => refused(r, /factory_legacy_refused/));
    const notRefused = (res) => res.filter(([, r]) => !refused(r, /factory_legacy_refused/)).map(([n, r]) => n + ': ' + (r.ok ? 'ALLOWED' : r.code + ' ' + r.message.slice(0, 50)));

    // the reserved capability, in any spelling
    const nid = 'legacy-' + randomUUID().slice(0, 8);
    await run.query(`insert into factory.nodes (node_id, capabilities) values ($1, '["edge-verify"]')`, [nid]);
    const lw = await legacyWorkOrder(run, { title: 'legacy for reserved' });
    const reservedWrites = (sfx) => [
      ['node insert', `insert into factory.nodes (node_id, capabilities) values ($1, '["factory-enrolled-v1"]')`, [nid + 'r' + sfx]],
      ['node insert, other spelling', `insert into factory.nodes (node_id, capabilities) values ($1, '[" Factory-Enrolled-V1 "]')`, [nid + 'b' + sfx]],
      ['node update', `update factory.nodes set capabilities = capabilities || '["factory-enrolled-v1"]' where node_id = $1`, [nid]],
      ['work order insert', `insert into factory.work_orders (work_order_id, title, requires_capabilities) values ($1, 'x', '{factory-enrolled-v1}')`, [randomUUID()]],
      ['work order update, other spelling', `update factory.work_orders set requires_capabilities = '{FACTORY-ENROLLED-V1}' where work_order_id = $1`, [lw]],
    ];
    const rc = await runWrites(run, reservedWrites(''));
    row('L3 factory_runner: the reserved capability factory-enrolled-v1 is refused on a node and on a work order, insert and update, in any spelling',
      allRefused(rc), notRefused(rc).join(' | ') || rc.length + ' writes refused');

    // new-model rows: UPDATE / DELETE skipped (unchanged, no error); INSERT refused
    const snap = async () => (await sup.query(`select
        (select to_jsonb(r) from factory.agent_runs r where run_id = $1) run,
        (select to_jsonb(c) from factory.checkpoints c where checkpoint_id = $2) cp,
        (select to_jsonb(w) from factory.work_orders w where work_order_id = $3) wo,
        (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from factory.surface_locks l where run_id = $1) locks,
        (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from factory.work_order_dependencies d where work_order_id = $4) deps,
        (select to_jsonb(n) from factory.nodes n where node_id = $5) node`, [nmRun, nmCp, nmWo, nmWo2, comp.nodeId])).rows[0];
    const s0 = await snap();
    const skip = [
      ['run -> done', `update factory.agent_runs set status = 'done', termination_reason = 'forged', finished_at = now() where run_id = '${nmRun}'`],
      ['run renew', `update factory.agent_runs set lease_expires_at = now() + interval '1 hour' where run_id = '${nmRun}'`],
      ['run delete', `delete from factory.agent_runs where run_id = '${nmRun}'`],
      ['checkpoint update', `update factory.checkpoints set payload = '{"forged":1}' where checkpoint_id = '${nmCp}'`],
      ['checkpoint delete', `delete from factory.checkpoints where checkpoint_id = '${nmCp}'`],
      ['verification-required WO -> done', `update factory.work_orders set status = 'done', completed_at = now() where work_order_id = '${nmWo}'`],
      ['WO delete', `delete from factory.work_orders where work_order_id = '${nmWo2}'`],
      ['lock delete', `delete from factory.surface_locks where run_id = '${nmRun}'`],
      ['lock extend', `update factory.surface_locks set lease_expires_at = now() + interval '1 day' where run_id = '${nmRun}'`],
      ['lock re-own', `update factory.surface_locks set node_id = 'legacy-x', run_id = run_id where run_id = '${nmRun}'`],
      ['dependency delete', `delete from factory.work_order_dependencies where work_order_id = '${nmWo2}'`],
      ['enrolled node self-assert role', `update factory.nodes set security_role = 'release_broker', capabilities = '["x"]' where node_id = '${comp.nodeId}'`],
      ['enrolled node heartbeat forge', `update factory.nodes set last_heartbeat_at = now() where node_id = '${comp.nodeId}'`],
    ];
    const skipBad = [];
    for (const [n, sql] of skip) { const r = await tryQuery(run, sql); if (!r.ok || r.rowCount !== 0) skipBad.push(n + ': ' + (r.ok ? r.rowCount + ' rows' : r.message)); }
    const s1 = await snap();
    row('L4 factory_runner: every UPDATE / DELETE of an enrolled run, checkpoint, lock, node, a new-model work order (incl. moving a verification-required one to done) or a dependency naming one is SKIPPED - no error, 0 rows, server rows byte-identical',
      skipBad.length === 0 && canon(s0) === canon(s1), skipBad.join(' | ') || skip.length + ' writes skipped');
    const newModelInserts = (sfx) => [
      ['checkpoint of an enrolled run', `insert into factory.checkpoints (run_id, work_order_id, location) values ($1, $2, 'forged://')`, [nmRun, nmWo]],
      ['run of a new-model work order', `insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'in_progress')`, [nmWo, nid]],
      ['lock of an enrolled run', `insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at) values ($1, $2, $3, now() + interval '1 hour')`, ['surf/forged' + sfx, nmRun, nid]],
      ['dependency on a new-model work order', `insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)`, [lw, nmWo]],
      ['notification of a new-model work order', `insert into factory.founder_notifications (work_order_id, why_blocked, exact_action, what_continues) values ($1, 'x', 'x', 'x')`, [nmWo]],
      ['node of an enrolled identity', `insert into factory.nodes (node_id, principal_id, computer_id) values ($1, $2, $3)`, ['forged-node' + sfx, comp.principalId, comp.computerId]],
    ];
    const ins = await runWrites(run, newModelInserts(''));
    row('L5 factory_runner: an INSERT of a new-model row (checkpoint / run / lock / dependency / notification / node for an enrolled identity) is refused by name',
      allRefused(ins), notRefused(ins).join(' | ') || ins.length + ' inserts refused');
    const lr = await legacyWorkOrder(run, { title: 'legacy run owner' });
    const lrun = (await run.query(`insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'queued') returning run_id`, [lw, nid])).rows[0].run_id;
    // the first and last writes name an identity (the guard's new-model test refuses them); the five between carry none, so the
    // guard's new-column comparison is what refuses them
    const newColumnWrites = () => [
      ['run insert with principal_id', `insert into factory.agent_runs (work_order_id, node_id, status, principal_id) values ($1, $2, 'queued', $3)`, [lr, nid, comp.principalId]],
      ['run update run_kind', `update factory.agent_runs set run_kind = 'verification' where run_id = $1`, [lrun]],
      ['work order update priority_num', `update factory.work_orders set priority_num = 1000000 where work_order_id = $1`, [lr]],
      ['work order update requires_verification', `update factory.work_orders set requires_verification = false where work_order_id = $1`, [lr]],
      ['work order insert, other tenant', `insert into factory.work_orders (work_order_id, title, tenant_id) values ($1, 'x', 'b2e0f000-0000-4000-8000-000000000002')`, [randomUUID()]],
      ['node update tenant_id', `update factory.nodes set tenant_id = 'b2e0f000-0000-4000-8000-000000000002' where node_id = $1`, [nid]],
      ['node update principal_id', `update factory.nodes set principal_id = $2, computer_id = $3 where node_id = $1`, [nid, comp.principalId, comp.computerId]],
    ];
    const cols = await runWrites(run, newColumnWrites());
    row('L6 factory_runner: setting or changing any column the migration added (identity, run kind, numeric priority, verification, tenant) is refused',
      allRefused(cols), notRefused(cols).join(' | ') || cols.length + ' writes refused');
    const reach = (await run.query(`select coalesce(json_agg(rolname), '[]') r from pg_roles where rolname <> current_user and pg_has_role(current_user, oid, 'MEMBER')`)).rows[0].r;
    const setRoles = [];
    for (const r of ['factory_owner', 'factory_node_api', 'factory_admin_api', 'postgres', ...reach]) setRoles.push(await tryQuery(run, `set role ${r}`));
    row('L7 factory_runner can reach no role (pg_has_role), and SET ROLE to factory_owner / either API role / postgres is refused',
      reach.length === 0 && setRoles.every((r) => !r.ok), 'reachable ' + JSON.stringify(reach));

    // L8: the same refusals after a 69df2f52 provisioning grant is re-run: the GUARD refuses, not only the missing grant
    await sup.query('grant select, insert, update, delete on all tables in schema factory to factory_runner');
    const l8 = [];
    for (const [t, sql] of authorityWrites) { const r = await tryQuery(run, sql); if (!refused(r, /factory_authority_refused|factory_immutable/)) l8.push(t + ': ' + (r.ok ? 'ALLOWED ' + r.rowCount : r.message.slice(0, 60))); }
    const s2 = await snap();
    for (const [, sql] of skip) await tryQuery(run, sql);
    const s3 = await snap();
    await sup.query('revoke all on ' + NEW_TABLES.map((t) => 'factory.' + t).join(', ') + ' from factory_runner');
    row('L8 even with DML on every factory table re-granted (a 69df2f52 provisioning re-run), every authority write is refused by the guard and every enrolled / new-model row is still skipped',
      l8.length === 0 && canon(s2) === canon(s3) && canon(s0) === canon(s3), l8.join(' | ') || 'guard held');

    // ================================================================== L9 / L9b: the guards hold for a session holding pg_temp types
    // A FRESH legacy session creates pg_temp types named like built-ins (text, name, uuid, jsonb) before its first write. Every
    // write of L3, L5 and L6 is replayed verbatim and must still be refused by name; the L4 writes run last and must still skip (0
    // rows), so no write judged here runs after one that changed the fixture rows; the rows the legacy guard protects are unchanged.
    const run2 = await connect(plane.runnerUrl);
    try {
      const shadows = [`create domain pg_temp.text as pg_catalog."char"`, `create domain pg_temp.name as pg_catalog."char"`,
        `create domain pg_temp.uuid as pg_catalog.uuid check (true)`, `create domain pg_temp.jsonb as pg_catalog.jsonb check (true)`];
      const madeShadow = [];
      for (const s of shadows) { const r = await tryQuery(run2, s); if (!r.ok) madeShadow.push(s.slice(14, 26) + ': ' + r.message.slice(0, 40)); }
      const sh0 = await snap();
      const shRefusals = [...await runWrites(run2, reservedWrites('-t')), ...await runWrites(run2, newModelInserts('-t')), ...await runWrites(run2, newColumnWrites())];
      const shSkip = [];
      for (const [n, sql] of skip) { const r = await tryQuery(run2, sql); if (!r.ok || r.rowCount !== 0) shSkip.push(n + ': ' + (r.ok ? r.rowCount + ' rows' : r.message.slice(0, 40))); }
      const sh1 = await snap();
      row('L9 in a fresh factory_runner session holding pg_temp types named text / name / uuid / jsonb, every write of L3, L5 and L6 (the reserved capability, new-model inserts, every new column) is still refused by name and every write of L4 still skips (0 rows); server rows byte-identical',
        madeShadow.length === 0 && shRefusals.length === rc.length + ins.length + cols.length && allRefused(shRefusals) && shSkip.length === 0 && canon(sh0) === canon(sh1),
        madeShadow.length ? 'type setup failed: ' + madeShadow.join('; ')
          : (notRefused(shRefusals).join(' | ') || shRefusals.length + ' writes refused') + '; skips ' + (shSkip.join(' | ') || skip.length + ' ok'));
      // L9b: the authority guard under the same shadow, inside a re-grant window (its only reachable window - L8)
      await sup.query('grant select, insert, update, delete on all tables in schema factory to factory_runner');
      const l9b = [];
      for (const [t, sql] of authorityWrites) { const r = await tryQuery(run2, sql); if (!refused(r, /factory_authority_refused|factory_immutable/)) l9b.push(t + ': ' + (r.ok ? 'ALLOWED' : r.message.slice(0, 50))); }
      await sup.query('revoke all on ' + NEW_TABLES.map((t) => 'factory.' + t).join(', ') + ' from factory_runner');
      row('L9b in the same session holding pg_temp types, inside the L8 re-grant window, every authority write is still refused by the authority guard', l9b.length === 0, l9b.join(' | ') || 'authority guard held');
    } finally { await run2.end(); }
    // (L9c is retired: it probed factory._is_engine, which the migration no longer creates. The two engine tests that remain are
    // the guards', and L9 / L9b hold them under the same pg_temp shadow.)

    // ================================================================== L10: no legacy write bears an id in the enrolled node-id namespace
    // An agent principal's node_id is 'node-' + 32 hex (comp.nodeId: enrolled). A legacy write naming such an id - as node_id,
    // authoring / verification node, a lock's node, or a work order's director node - is refused by name, even with principal_id NULL
    // and a legacy work order. That holds before an enrollment too: the node id of a computer added but not yet enrolled (it has a
    // principal and no node row yet), and an id in that form no principal holds.
    const preComputer = randomUUID(), prePrincipal = randomUUID(), preNodeId = nodeIdOf(prePrincipal);
    await asEngine(sup, async () => {
      await sup.query(`insert into factory.computers (computer_id, tenant_id, display_name, created_by) values ($1, $2, 'added, not enrolled', $3)`, [preComputer, OPERATOR, ADMIN]);
      await sup.query(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, created_by)
                       values ($1, $2, 1, '{generic}', '{}', $3)`, [OPERATOR, preComputer, ADMIN]);
      await sup.query(`insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by)
                       values ($1, $2, $3, $4, 'add_computer', $5)`, [prePrincipal, OPERATOR, preComputer, preNodeId, ADMIN]);
    });
    const unheldNodeId = 'node-' + randomBytes(16).toString('hex');
    const lwF3 = await legacyWorkOrder(run, { title: 'legacy for the node-id namespace' });
    const lrunF3 = (await run.query(`insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'queued') returning run_id`, [lwF3, nid])).rows[0].run_id;
    const f3 = [
      ['run insert node', await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'queued')`, [lwF3, comp.nodeId])],
      ['run insert authoring_node', await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status, authoring_node_id) values ($1, $3, 'queued', $2)`, [lwF3, comp.nodeId, nid])],
      ['run insert verification_node', await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status, verification_node_id) values ($1, $3, 'queued', $2)`, [lwF3, comp.nodeId, nid])],
      ['run update node -> enrolled', await tryQuery(run, `update factory.agent_runs set node_id = $2 where run_id = $1`, [lrunF3, comp.nodeId])],
      ['lock insert node', await tryQuery(run, `insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at) values ('surf/f3', $1, $2, now() + interval '1 hour')`, [lrunF3, comp.nodeId])],
      ['WO update director_node', await tryQuery(run, `update factory.work_orders set director_node_id = $2 where work_order_id = $1`, [lwF3, comp.nodeId])],
      ['node insert, enrolled id', await tryQuery(run, `insert into factory.nodes (node_id) values ($1)`, [comp.nodeId])],
      ['node insert, id of a computer added but not enrolled', await tryQuery(run, `insert into factory.nodes (node_id) values ($1)`, [preNodeId])],
      ['node insert, id no principal holds', await tryQuery(run, `insert into factory.nodes (node_id) values ($1)`, [unheldNodeId])],
      ['run insert node, not enrolled yet', await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'queued')`, [lwF3, preNodeId])],
    ];
    // strictly the guard's refusal: a before-row trigger fires before the primary-key check, so an existing row never answers for it
    const f3Bad = f3.filter(([, r]) => !refused(r, /factory_legacy_refused/));
    const prinStillNull = (await sup.query(`select count(*)::int n from factory.agent_runs where run_id = $1 and principal_id is null`, [lrunF3])).rows[0].n;
    const planted = (await sup.query(`select count(*)::int n from factory.nodes where node_id = any($1)`, [[preNodeId, unheldNodeId]])).rows[0].n;
    row('L10 factory_runner: an INSERT or UPDATE of agent_runs / surface_locks / work_orders / nodes that names an id in the enrolled node-id namespace (node_id / authoring / verification / director) is refused by name - enrolled, added but not yet enrolled, or held by no principal - and principal_id stays NULL',
      f3Bad.length === 0 && prinStillNull === 1 && planted === 0,
      (f3Bad.map(([n, r]) => n + ': ' + (r.ok ? 'ALLOWED' : r.code + ' ' + r.message.slice(0, 40))).join(' | ') || f3.length + ' writes refused') + '; node rows planted ' + planted);
    // L10f / L10g: a checkpoint or a lock of a run that bears an enrolled node id with principal_id NULL (the guard's run -> enrolled
    // node branches). No legacy path can write such a run (L10), so it is written here as the engine.
    const plantedRun = randomUUID();
    await asEngine(sup, () => sup.query(`insert into factory.agent_runs (run_id, work_order_id, node_id, status) values ($1, $2, $3, 'queued')`, [plantedRun, lwF3, comp.nodeId]));
    const cpIns = await tryQuery(run, `insert into factory.checkpoints (run_id, work_order_id, location) values ($1, $2, 'f3://')`, [plantedRun, lwF3]);
    await asEngine(sup, () => sup.query(`insert into factory.checkpoints (checkpoint_id, run_id, work_order_id, location) values ($1, $2, $3, 'f3://seed')`, [randomUUID(), plantedRun, lwF3]));
    const cpUpd = await tryQuery(run, `update factory.checkpoints set location = 'forged' where run_id = $1`, [plantedRun]);
    row('L10f a legacy checkpoint of a run bearing an enrolled node id is refused on INSERT and skipped on UPDATE',
      refused(cpIns, /factory_legacy_refused/) && cpUpd.ok && cpUpd.rowCount === 0, 'insert ' + (cpIns.ok ? 'ALLOWED' : 'refused') + '; update ' + (cpUpd.ok ? cpUpd.rowCount + ' rows' : cpUpd.message.slice(0, 30)));
    // the lock names a legacy node (nid), so only the run it belongs to makes it new-model
    const lockIns = await tryQuery(run, `insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at) values ('surf/f3-run', $1, $2, now() + interval '1 hour')`, [plantedRun, nid]);
    await asEngine(sup, () => sup.query(`insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at) values ('surf/f3-seed', $1, $2, now() + interval '1 hour')`, [plantedRun, nid]));
    const lock0 = (await sup.query(`select coalesce(jsonb_agg(to_jsonb(l) order by l.surface), '[]') j from factory.surface_locks l where l.run_id = $1`, [plantedRun])).rows[0].j;
    const lockUpd = await tryQuery(run, `update factory.surface_locks set lease_expires_at = now() + interval '1 day' where run_id = $1`, [plantedRun]);
    const lockDel = await tryQuery(run, `delete from factory.surface_locks where run_id = $1`, [plantedRun]);
    const lock1 = (await sup.query(`select coalesce(jsonb_agg(to_jsonb(l) order by l.surface), '[]') j from factory.surface_locks l where l.run_id = $1`, [plantedRun])).rows[0].j;
    row('L10g a legacy lock (naming a legacy node) of a run bearing an enrolled node id is refused on INSERT, and skipped on UPDATE and DELETE (0 rows; the lock unchanged)',
      refused(lockIns, /factory_legacy_refused/) && lockUpd.ok && lockUpd.rowCount === 0 && lockDel.ok && lockDel.rowCount === 0 && lock0.length === 1 && canon(lock0) === canon(lock1),
      'insert ' + (lockIns.ok ? 'ALLOWED' : lockIns.code) + '; update ' + (lockUpd.ok ? lockUpd.rowCount + ' rows' : lockUpd.message.slice(0, 30))
        + '; delete ' + (lockDel.ok ? lockDel.rowCount + ' rows' : lockDel.message.slice(0, 30)) + '; locks ' + lock0.length + ' -> ' + lock1.length);

    // ================================================================== M mixed fleet through the FROZEN claim.mjs
    // An enrolled run whose lease has lapsed, holding surf/M (its lock at 'infinity'); a legacy work order owning surf/M at the head of
    // the legacy queue; another legacy work order behind it. The frozen claim must never fail or say "another node won" on surf/M: it
    // claims the next eligible legacy work order in one poll, and the enrolled run, work order and lock stay exactly as they were.
    const mWo = await newModelWorkOrder(sup, { surface: ['surf/M'], title: 'enrolled, lapsing' });
    const mRun = await enrolledRun(sup, comp, mWo, { surfaces: ['surf/M'], leaseSeconds: 1 });
    await asEngine(sup, () => sup.query(`update factory.agent_runs set lease_expires_at = now() - interval '5 minutes' where run_id = $1`, [mRun]));
    // clear the legacy queue of the loaded baseline rows' claimable work, so the pick order is exactly the two below
    await sup.query(`update factory.work_orders set status = 'done' where status = 'queued' and not ('factory-enrolled-v1' = any(requires_capabilities)) and work_order_id not in ($1, $2)`, [lw, lr]);
    await sup.query(`update factory.work_orders set status = 'done' where work_order_id in ($1, $2)`, [lw, lr]);
    const headWo = await legacyWorkOrder(run, { surface: ['surf/M'], title: 'legacy head, owns surf/M', createdAt: '2000-01-01T00:00:00Z' });
    const nextWo = await legacyWorkOrder(run, { surface: ['surf/N'], title: 'legacy next, owns surf/N', createdAt: '2000-01-02T00:00:00Z' });
    const mBefore = (await sup.query(`select (select to_jsonb(r) from factory.agent_runs r where run_id = $1) run, (select to_jsonb(w) from factory.work_orders w where work_order_id = $2) wo,
        (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from factory.surface_locks l where run_id = $1) locks`, [mRun, mWo])).rows[0];
    process.env.FACTORY_RUNNER_PG_URL = plane.runnerUrl;
    process.env.FACTORY_ADMISSION = 'off';
    const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
    const legacyNode = 'legacy-mixed-' + randomUUID().slice(0, 6);
    await claim.registerNode({ nodeId: legacyNode, capabilities: [], securityRole: 'release_broker', platform: 'test' });
    let claimed = null, claimErr = null;
    const logs = []; const origLog = console.log; console.log = (...a) => logs.push(a.join(' '));
    try { claimed = await claim.claimWork({ nodeId: legacyNode }); } catch (e) { claimErr = e; } finally { console.log = origLog; }
    const mAfter = (await sup.query(`select (select to_jsonb(r) from factory.agent_runs r where run_id = $1) run, (select to_jsonb(w) from factory.work_orders w where work_order_id = $2) wo,
        (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from factory.surface_locks l where run_id = $1) locks`, [mRun, mWo])).rows[0];
    const holdM = (await sup.query(`select count(*)::int n from factory.surface_locks l join factory.agent_runs r on r.run_id = l.run_id where l.surface = 'surf/M' and r.principal_id is null`)).rows[0].n;
    row('M1 frozen claim.mjs on the migrated plane: with a lapsed enrolled lease and lock on surf/M and a legacy work order owning surf/M at the head, the legacy claim neither fails nor reports "another node won"; it claims the NEXT legacy work order in one poll',
      !claimErr && claimed && claimed.work_order_id === nextWo && !logs.some((l) => /another node|23505/.test(l)),
      claimErr ? String(claimErr.message) : 'claimed ' + (claimed && claimed.work_order_id === nextWo ? 'the next legacy work order' : JSON.stringify(claimed)));
    row('M2 ... and no legacy run holds surf/M, and the enrolled run, its work order and its lock are byte-identical (the front doors own their expiry)',
      holdM === 0 && canon(mBefore) === canon(mAfter), 'legacy holders of surf/M: ' + holdM);
    // the whole frozen lifecycle still works for the legacy run on the migrated plane
    const hb = claimed && await claim.heartbeat({ runId: claimed.run_id, nodeId: legacyNode });
    let cpOk = false; try { if (claimed) { await claim.checkpoint({ runId: claimed.run_id, workOrderId: claimed.work_order_id, location: 'test://p1', nodeId: legacyNode }); cpOk = true; } } catch (e) { cpOk = String(e.message); }
    const done = claimed && await claim.completeRun({ runId: claimed.run_id, status: 'done', terminationReason: 'completed', nodeId: legacyNode });
    const fin = claimed && (await sup.query(`select r.status rs, w.status ws, (select count(*)::int from factory.surface_locks where run_id = r.run_id) locks from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.run_id = $1`, [claimed.run_id])).rows[0];
    row('M3 the frozen register / claim / heartbeat / checkpoint / complete lifecycle is intact for a legacy run on the migrated plane',
      hb === true && cpOk === true && done && done.superseded === false && fin && fin.rs === 'done' && fin.ws === 'done' && fin.locks === 0, JSON.stringify(fin));
    // a legacy node with a self-written release_broker role and every legacy capability still cannot claim new-model work
    await sup.query(`update factory.work_orders set status = 'done' where status = 'queued' and not ('factory-enrolled-v1' = any(requires_capabilities))`);
    const q0 = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1`, [nmWo2])).rows[0].n;
    const onlyNm = await claim.claimWork({ nodeId: legacyNode });
    const nm1 = await claim.claimWork({ nodeId: legacyNode, onlyWorkOrderId: nmWo2 });
    const q1 = (await sup.query(`select count(*)::int n from factory.agent_runs where work_order_id = $1`, [nmWo2])).rows[0].n;
    row('M4 a legacy node that self-wrote security_role = release_broker cannot claim a new-model work order (no factory-enrolled-v1), even named directly',
      onlyNm === null && nm1 === null && q0 === q1, 'claims ' + JSON.stringify([onlyNm, nm1]));
  } finally { await run.end(); }

  // ================================================================== E envelope immutability by node; invariants for every writer
  const nodeApi = await connect(plane.nodeApiUrl);
  try {
    const e1 = [
      await tryQuery(nodeApi, `update factory.authorization_envelopes set authorized_roles = '{generic,verifier,release_broker}' where computer_id = $1`, [comp.computerId]),
      await tryQuery(nodeApi, `insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ($1, $2, 2, '{release_broker}', $3)`, [OPERATOR, comp.computerId, ADMIN]),
      await tryQuery(nodeApi, `update factory.computers set current_envelope_version = 2 where computer_id = $1`, [comp.computerId]),
      await tryQuery(nodeApi, `update factory.nodes set capabilities = '["release"]' where node_id = $1`, [comp.nodeId]),
      await tryQuery(nodeApi, `insert into factory.agent_principals (tenant_id, computer_id, node_id, created_via, created_by) values ($1, $2, 'node-${'b'.repeat(32)}', 'admin_create', $3)`, [OPERATOR, comp.computerId, ADMIN]),
    ];
    row('E1 the Node API role cannot change an envelope, the envelope pointer, its own node record or mint a principal (no table privilege at all)',
      e1.every((r) => refused(r, /permission denied/)), e1.map((r) => r.ok ? 'ALLOWED' : 'refused').join(','));
  } finally { await nodeApi.end(); }

  // ================================================================== L11 / L11b: no front door evaluates code the calling session defined
  // A FRESH API session holds a probe function that raises if it runs, and a pg_temp domain named like a built-in type that the front
  // door declares in its own body (node_session_open: timestamptz; admin_add_computer: uuid), whose CHECK calls the probe. The call
  // passes untyped NULLs, which bind to the front door's parameter types. The front door returns an ordinary refusal, and no error
  // text says the probe ran.
  const probeFrontDoor = async (url, typeName, call, label, id) => {
    const c = await connect(url);
    try {
      const p = await tryQuery(c, `create function pg_temp.qa_probe_${id}(x pg_catalog.${typeName}) returns boolean language plpgsql as $p$ begin raise exception 'probe ran as %', current_user; end $p$`);
      const d = await tryQuery(c, `create domain pg_temp.${typeName} as pg_catalog.${typeName} check (pg_temp.qa_probe_${id}(value))`);
      const r = await tryQuery(c, call);
      const ranAsOwner = (!r.ok && /probe ran as/.test(r.message)) || (r.ok && JSON.stringify(r.rows).includes('probe ran as'));
      const refusalName = r.ok ? (r.rows[0] && r.rows[0].r && r.rows[0].r.refused) : null;
      return { setup: p.ok && d.ok, ranAsOwner, ok: r.ok, refusalName, detail: (p.ok && d.ok) ? (r.ok ? 'refused=' + refusalName : r.message.slice(0, 50)) : 'setup: ' + (p.message || d.message || '').slice(0, 50), label };
    } finally { await c.end(); }
  };
  const l11 = await probeFrontDoor(plane.nodeApiUrl, 'timestamptz', `select factory.node_session_open(null, null, null, null, null, null) r`, 'node_session_open', 'ts');
  row('L11 node_session_open, called by a factory_node_api session holding a pg_temp domain named timestamptz whose CHECK calls the session\'s own probe, never evaluates that CHECK: the call returns an ordinary refusal, and no error says the probe ran',
    l11.setup && !l11.ranAsOwner && l11.ok && l11.refusalName === 'bad_assertion', l11.detail);
  const l11b = await probeFrontDoor(plane.adminApiUrl, 'uuid', `select factory.admin_add_computer(null, null, null) r`, 'admin_add_computer', 'uu');
  row('L11b admin_add_computer, called by a factory_admin_api session holding a pg_temp domain named uuid the same way, never evaluates that CHECK: an ordinary refusal, and the probe never ran',
    l11b.setup && !l11b.ranAsOwner && l11b.ok, l11b.detail);

  const eng = async (sql, params) => { try { await asEngine(sup, () => sup.query(sql, params)); return { ok: true }; } catch (e) { return { ok: false, code: e.code, message: String(e.message) }; } };
  const e2 = {
    envelopeUpdate: await eng(`update factory.authorization_envelopes set max_heavy = 0 where computer_id = $1`, [comp.computerId]),
    envelopeDelete: await eng(`delete from factory.authorization_envelopes where computer_id = $1`, [comp.computerId]),
    envelopeSkip: await eng(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ($1, $2, 3, '{generic}', $3)`, [OPERATOR, comp.computerId, ADMIN]),
    envelopeReserved: await eng(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, created_by) values ($1, $2, 2, '{generic}', '{factory-enrolled-v1}', $3)`, [OPERATOR, comp.computerId, ADMIN]),
  };
  row('E2 envelopes are immutable versions for every writer (no update / delete; only the next version; never a reserved capability)',
    !e2.envelopeUpdate.ok && !e2.envelopeDelete.ok && !e2.envelopeSkip.ok && !e2.envelopeReserved.ok, Object.entries(e2).map(([k, v]) => k + ':' + (v.ok ? 'ALLOWED' : 'refused')).join(' '));
  const amend2 = await (async () => { try { await asEngine(sup, async () => {
    await sup.query(`insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by, reason) values ($1, $2, 2, '{generic}', $3, 'narrowed')`, [OPERATOR, comp.computerId, ADMIN]);
    await sup.query(`update factory.computers set current_envelope_version = 2 where computer_id = $1`, [comp.computerId]); }); return true; } catch (e) { return String(e.message); } })();
  const rewind = await eng(`update factory.computers set current_envelope_version = 1 where computer_id = $1`, [comp.computerId]);
  row('E3 an amendment is the next version plus the pointer; the pointer never rewinds (amending back is a new version with the old content)', amend2 === true && !rewind.ok, String(amend2));
  const cred = await eng(`update factory.node_credentials set status = 'revoked', revoked_at = now(), revoked_by_kind = 'admin', revoked_by = $2, revoke_reason = 'admin_revoke' where credential_id = $1`, [comp.credentialId, ADMIN]);
  const reactivate = await eng(`update factory.node_credentials set status = 'active', revoked_at = null, revoked_by_kind = null, revoked_by = null, revoke_reason = null where credential_id = $1`, [comp.credentialId]);
  row('E4 a revoked credential never becomes active again (every writer)', cred.ok && !reactivate.ok, reactivate.message && reactivate.message.slice(0, 80));
  const p2 = randomUUID();
  const mint = await eng(`insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by) values ($1, $2, $3, $4, 'add_computer', $5)`,
    [p2, OPERATOR, comp.computerId, 'node-' + p2.replace(/-/g, ''), ADMIN]);
  const princUpd = await eng(`update factory.agent_principals set computer_id = computer_id where principal_id = $1`, [comp.principalId]);
  row('E5 a computer has exactly one Add-Computer principal, and a principal is never updated or deleted', !mint.ok && !princUpd.ok, (mint.message || '').slice(0, 60));
  const foreign = await enrolledComputer(sup, { name: 'enrolled-B' });
  const wrongPrincipal = await eng(`insert into factory.node_credentials (tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, replaces_credential_id)
      select $1, $2, $3, k, encode(sha256(k), 'hex'), 'rotate', $4 from (select gen_random_uuid()::text::bytea as x) s, lateral (select substring(sha256(x) from 1 for 32) as k) kk`,
    [OPERATOR, foreign.computerId, foreign.principalId, comp.credentialId]);
  row('E6 a rotated credential is bound to the principal of the credential it replaces - binding it to another principal is refused (S-13)',
    !wrongPrincipal.ok && /factory_principal_refused/.test(wrongPrincipal.message || ''), (wrongPrincipal.message || '').slice(0, 80));
  const auditId = (await (async () => { let id; await asEngine(sup, async () => { id = (await sup.query(`insert into factory.audit_events (tenant_id, actor_kind, action, outcome) values ($1, 'server', 'test.event', 'ok') returning event_id`, [OPERATOR])).rows[0].event_id; }); return id; })());
  const auditUpd = await eng(`update factory.audit_events set outcome = 'refused' where event_id = $1`, [auditId]);
  const auditDel = await eng(`delete from factory.audit_events where event_id = $1`, [auditId]);
  const trunc = await tryQuery(sup, 'truncate factory.audit_events');
  row('E7 the audit log is append-only for every writer, the superuser included (no update, delete or truncate)', !auditUpd.ok && !auditDel.ok && !trunc.ok);
  const bound = await enrolledComputer(sup, { name: 'home (S-16a bound at Add Computer)', s16a: true });
  const unbind = await eng(`update factory.computers set s16a_bound_at = null, s16a_bound_by = null where computer_id = $1`, [bound.computerId]);
  const rebind = await eng(`update factory.computers set s16a_bound_at = now(), s16a_bound_by = $2 where computer_id = $1`, [foreign.computerId, ADMIN]);
  let secondBound = null; try { await enrolledComputer(sup, { name: 'second bound', s16a: true }); secondBound = 'ALLOWED'; } catch (e) { secondBound = String(e.message).slice(0, 60); }
  row('E8 the S-16(a) binding is add-only at Add Computer: unbinding, binding later, and a second active bound computer are all refused',
    !unbind.ok && !rebind.ok && secondBound !== 'ALLOWED', [unbind, rebind].map((r) => r.ok ? 'ALLOWED' : 'refused').join(',') + ',' + secondBound);
  const polDel = await eng(`delete from factory.verification_policies`);
  const polNoVer = await eng(`update factory.verification_policies set require_physical_separation = true where scope = 'tenant_default'`);
  const pol1 = (await sup.query(`select to_jsonb(p) - 'updated_at' j from factory.verification_policies p where scope = 'tenant_default'`)).rows[0].j;
  const polRev = await eng(`update factory.verification_policies set require_physical_separation = true, version = version + 1, updated_by = 'test' where scope = 'tenant_default'`);
  const polRev2 = await eng(`update factory.verification_policies set restrict_bound_computer_authoring = false, version = version + 1, updated_by = 'test2' where scope = 'tenant_default'`);
  const vers = (await sup.query(`select v.version, v.snapshot, v.recorded_by from factory.verification_policy_versions v join factory.verification_policies p using (policy_id)
      where p.scope = 'tenant_default' order by v.version`)).rows;
  const otherVers = (await sup.query(`select count(*)::int n from factory.verification_policy_versions v join factory.verification_policies p using (policy_id) where p.scope <> 'tenant_default'`)).rows[0].n;
  // every version kept: the seeded version 1 exactly as seeded (recorded when the first change replaced it), then 2 and 3; an unchanged
  // policy has no version row (the migration writes none)
  row('E9 policies: never deleted; every change is a new version, and every version is kept - the seeded version 1 exactly as it was seeded, then each change once; an unchanged policy has none',
    !polDel.ok && !polNoVer.ok && polRev.ok && polRev2.ok && vers.map((v) => v.version).join(',') === '1,2,3' && canon(vers[0].snapshot) === canon(pol1)
      && vers[0].recorded_by === 'director:contract-§1' && vers[1].recorded_by === 'test' && vers[2].recorded_by === 'test2' && otherVers === 0,
    JSON.stringify({ versions: vers.map((v) => v.version + ':' + v.recorded_by), other: otherVers }));
  note('policy stricter-only through the Admin API (the API branch of the guard) is proved with the admin front doors (IMP-9)');
  row('E10 tenant_admins: the migration wrote no row, and the table refuses every writer that is not the engine', seeded.a === 0 && refused(await tryQuery(sup, `insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'admin')`, [OPERATOR, randomUUID()]), /factory_authority_refused/));
  // E10b the tenant-admins guard (S-8; CR-001, CR-003: the table is written only by the founder's prepared step, never through an API)
  // refuses a write that arrives through an API login even from inside a SECURITY DEFINER body owned by factory_owner, where the
  // authority guard's engine test passes. No front door writes the table, so the row plants a probe one: created as factory_owner
  // (CREATE on schema factory granted for it and revoked after), called once AS factory_admin_api, and dropped.
  const adminsBefore = (await sup.query('select count(*)::int n from factory.tenant_admins')).rows[0].n;
  let viaApi = null;
  try {
    await sup.query('grant create on schema factory to factory_owner');
    await sup.query('set role factory_owner');
    await sup.query(`create function factory.qa_probe_tenant_admin_write(p uuid) returns void language sql security definer set search_path = pg_catalog, pg_temp
      as $q$ insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ('${OPERATOR}', p, 'admin') $q$`);
    await sup.query('grant execute on function factory.qa_probe_tenant_admin_write(uuid) to factory_admin_api');
    await sup.query('reset role');
    const apiLogin = await connect(plane.adminApiUrl);
    try { viaApi = await tryQuery(apiLogin, 'select factory.qa_probe_tenant_admin_write($1)', [randomUUID()]); } finally { await apiLogin.end(); }
  } catch (e) { viaApi = { ok: false, code: 'SETUP', message: String(e.message) }; } finally {
    await sup.query('reset role').catch(() => {});
    await sup.query('drop function if exists factory.qa_probe_tenant_admin_write(uuid)');
    await sup.query('revoke create on schema factory from factory_owner');
  }
  const adminsAfter = (await sup.query('select count(*)::int n from factory.tenant_admins')).rows[0].n;
  row('E10b tenant_admins: a write that arrives through an API login (factory_admin_api) is refused by the tenant-admins guard by name, even from inside a SECURITY DEFINER body owned by factory_owner; nothing is written',
    refused(viaApi, /^factory_tenant_admins_refused/) && adminsAfter === adminsBefore, JSON.stringify({ viaApi, adminsBefore, adminsAfter }));

  // ================================================================== RO / OB / FS the founder's prepared steps, AS the applying login
  const ap = await connect(plane.adminUrl);
  try {
    const runnerOn = async (c) => (await c.query(`select t from unnest($1::text[]) t
        where has_table_privilege('factory_runner', 'factory.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`, [NEW_TABLES])).rows.map((r) => r.t);
    const runnerDefacl = async (c) => (await c.query(`select d.defaclobjtype::text || ':' || a.privilege_type x from pg_default_acl d, aclexplode(d.defaclacl) a
        where d.defaclnamespace = 'factory'::regnamespace and a.grantee = 'factory_runner'::regrole`)).rows.map((r) => r.x);
    // step R: \password factory_runner (psql sends ALTER ROLE ... PASSWORD with a SCRAM verifier computed client-side), then its read-backs
    const stepR = mdSection(/^## R\. /);
    const rPsql = mdBlocks(stepR, 'psql').join('\n');
    const rSql = mdBlocks(stepR, 'sql');
    const newPw = randomBytes(24).toString('hex');
    const rotate = await tryQuery(ap, `alter role factory_runner with password '${scramVerifier(newPw)}'`);
    const rReads = [];
    for (const q of rSql) { const r = await tryQuery(ap, q); rReads.push(r.ok ? r.rows.length : 'ERR ' + r.message); }
    const rotatedUrl = new URL(plane.runnerUrl); rotatedUrl.password = newPw;
    const legacyAfter = await (async () => { try { const c = await connect(rotatedUrl.toString()); try { return (await c.query('select count(*)::int n from factory.nodes')).rows[0].n >= 0; } finally { await c.end(); } } catch (e) { return e.message; } })();
    row('RO1 the factory_runner rotation (FOUNDER_PREPARED_STEPS step R: \\password, never the provisioner) run AS the applying login restores no privilege: factory_runner holds nothing on any authority table, no default-privilege entry reaches it, and the legacy login works with the new password',
      /\\password factory_runner/.test(rPsql) && !mdBlocks(stepR, null).some((b) => /provision-control-plane/.test(b)) && rotate.ok && rSql.length === 2
        && rReads.every((n) => n === 0) && (await runnerOn(ap)).length === 0 && (await runnerDefacl(ap)).length === 0 && legacyAfter === true,
      JSON.stringify({ rotate: rotate.ok || rotate.message, readBacks: rReads, legacy: legacyAfter }));
    // the superseded 69df2f52 re-provisioning grant, AS the applying login (rolled back): with warnings or an error, it hands the
    // legacy role nothing on an authority table, because the applying login does not inherit factory_owner's privileges
    let frozen = null, charac = null;
    try {
      await ap.query('begin');
      const g = await tryQuery(ap, 'grant select, insert, update, delete on all tables in schema factory to factory_runner');
      frozen = { grant: g.ok ? 'ok' : g.code, authority: await runnerOn(ap) };
      // characterization only (not a row; CR-006, the analysis went to the Director privately): the frozen provisioner's next statement
      const d = await tryQuery(ap, 'alter default privileges in schema factory grant select, insert, update, delete on tables to factory_runner');
      charac = { ok: d.ok, reAdded: d.ok ? (await runnerDefacl(ap)).length : 0 };
    } catch (e) { frozen = { error: e.message }; } finally { await ap.query('rollback').catch(() => {}); }
    row('RO2 the superseded 69df2f52 re-provisioning grant (`grant ... on all tables in schema factory to factory_runner`) run AS the applying login hands factory_runner nothing on any authority table',
      frozen && Array.isArray(frozen.authority) && frozen.authority.length === 0, JSON.stringify(frozen));
    note('characterization for CR-006 (not a row; rolled back): ' + JSON.stringify(charac));
    console.log('INFO ' + evidence[evidence.length - 1]);

    // step 1b: a stand-in observer, provisioned as the founder would (USAGE, and SELECT on the 69df2f52 relations, granted AS the
    // applying login); then the step's SQL from the document, AS the applying login
    const observer = 'qa_observer_' + randomBytes(4).toString('hex');
    await sup.query(`create role ${observer} nologin`);
    await ap.query(`grant usage on schema factory to ${observer}`);
    // the applying login's own relations; PostgreSQL warns "no privileges were granted" for the rest (no grant option there)
    await ap.query(`grant select on all tables in schema factory to ${observer}`);
    await ap.query(`grant select on all sequences in schema factory to ${observer}`);
    const step1b = mdSection(/^## 1b\. /);
    const b1 = mdBlocks(step1b, 'sql').map((q) => q.split('<observer role>').join(observer));
    const b1Run = b1.length === 2 ? await tryQuery(ap, b1[0]) : { ok: false, message: 'step 1b holds ' + b1.length + ' sql blocks, not 2' };
    const b1Read = b1.length === 2 ? await tryQuery(ap, b1[1]) : { ok: false };
    const unreadable = (await sup.query(`select c.oid::regclass::text r from pg_class c where c.relnamespace = 'factory'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'S') and not has_table_privilege($1, c.oid, 'SELECT')`, [observer])).rows.map((r) => r.r);
    row('OB1 FOUNDER_PREPARED_STEPS step 1b, executed from the document by the applying login for a stand-in observer role, leaves every relation in schema factory (the 69df2f52 ones and the migration\'s) readable by that role; the step grants through SET ROLE factory_owner',
      /set local role factory_owner;/.test(b1[0] || '') && b1Run.ok && b1Read.ok && b1Read.rows.length === 0 && unreadable.length === 0,
      b1Run.ok ? 'unreadable ' + JSON.stringify(unreadable) : String(b1Run.message));

    // step 3: the founder's tenant_admins row, through the authority guard, AS the applying login
    const founderId = randomUUID();
    const s3 = mdBlocks(mdSection(/^## 3\. /), 'sql').map((q) => q.split("<the founder''s Brain OS auth user id>").join(founderId));
    const s3Run = s3.length === 1 ? await tryQuery(ap, s3[0]) : { ok: false, message: 'step 3 holds ' + s3.length + ' sql blocks' };
    const s3Row = (await sup.query(`select tier from factory.tenant_admins where auth_user_id = $1`, [founderId])).rows;
    row('FS1 the prepared tenant-admins step (FOUNDER_PREPARED_STEPS 3) run AS the applying login writes the founder row through the authority guard (SET ROLE factory_owner)',
      s3Run.ok && s3Row.length === 1 && s3Row[0].tier === 'founder', s3Run.ok ? JSON.stringify(s3Row) : String(s3Run.message));

    // step 2: LOGIN (ALTER ROLE) and \password AS the applying login (ADMIN from CREATE ROLE); its read-backs
    const s2 = mdSection(/^## 2\. /);
    const s2Sql = mdBlocks(s2, 'sql');
    const s2Login = s2Sql.length === 3 ? await tryQuery(ap, s2Sql[0]) : { ok: false, message: 'step 2 holds ' + s2Sql.length + ' sql blocks, not 3' };
    const apiPw = randomBytes(24).toString('hex');
    const s2Pw = await tryQuery(ap, `alter role factory_admin_api with password '${scramVerifier(apiPw)}'`);
    const s2Read1 = s2Sql.length === 3 ? await tryQuery(ap, s2Sql[1]) : { ok: false };
    const s2Read2 = s2Sql.length === 3 ? await tryQuery(ap, s2Sql[2]) : { ok: false };
    const apiUrl = new URL(plane.adminApiUrl); apiUrl.password = apiPw;
    const apiWho = await (async () => { try { const c = await connect(apiUrl.toString()); try { return (await c.query('select current_user u')).rows[0].u; } finally { await c.end(); } } catch (e) { return e.message; } })();
    row('FS2 the prepared API-login step (FOUNDER_PREPARED_STEPS 2) runs AS the applying login: LOGIN and a \\password verifier on the API roles; its read-backs show login on both roles and no table privilege',
      /\\password factory_node_api/.test(mdBlocks(s2, 'psql').join('\n')) && s2Login.ok && s2Pw.ok && s2Read1.ok && s2Read1.rows.length === 2 && s2Read1.rows.every((r) => r.rolcanlogin === true)
        && s2Read2.ok && s2Read2.rows.length === 0 && apiWho === 'factory_admin_api',
      JSON.stringify({ login: s2Login.ok || s2Login.message, password: s2Pw.ok || s2Pw.message, read1: s2Read1.ok ? s2Read1.rows.length : s2Read1.message, read2: s2Read2.ok ? s2Read2.rows.length : s2Read2.message, connect: apiWho }));
  } finally { await ap.end(); }
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 schema_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  if (sup) await sup.end().catch(() => {});
  await plane.stop();
}

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('schema_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) {
  writeFileSync(process.argv[ev + 1], ['qa/factory/v1/schema_acceptance.mjs', 'migration sha256 ' + sha256(compose()), ...evidence, '',
    ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '',
    (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
}
process.exit(failed.length ? 1 : 0);
