#!/usr/bin/env node
// WO-1 DEVELOPER VERIFICATION (the implementer's; never independent): the Factory V1 schema on a disposable plane provisioned as
// 69df2f52 with the Director's baseline rows loaded, before and after the candidate migration.
//
//   C  catalog read-back: roles, owners, grants, default privileges, memberships, SECURITY DEFINER search_path, seeded rows
//   L  legacy refusals AS factory_runner: authority records, EXECUTE, the reserved capability, enrolled / new-model rows,
//      new-model columns, SET ROLE - and the same refusals after a 69df2f52 provisioning grant is re-run (the guard, not only
//      the missing grant, refuses)
//   M  mixed fleet through the FROZEN claim.mjs: a lapsed enrolled lease and lock never fail or stall the legacy claim
//   E  envelope immutability by node, and the invariants that hold for every writer
//   P  baseline preservation: the manifest's evidence-field hashes are unchanged by the migration
//
// usage: node qa/factory/v1/schema_acceptance.mjs [--evidence <file>]
// Touches nothing but a scratch PostgreSQL it starts and removes (S-15).
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect, tryQuery, enableApiLogins } from './plane.mjs';
import { apply, compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { OPERATOR, ADMIN, asEngine, enrolledComputer, newModelWorkOrder, enrolledRun, enrolledCheckpoint, legacyWorkOrder } from './fixtures.mjs';

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

const evidence = [];
const note = (s) => { evidence.push(s); };

const plane = await startV1Plane({ migrate: false, baselineRows: true });
let sup;
try {
  sup = await connect(plane.superUrl);
  note('plane: disposable scratch PostgreSQL ' + (await sup.query('show server_version')).rows[0].server_version + ', provisioned by the 69df2f52 provision-control-plane.mjs (byte-identical, asserted)');
  note('baseline rows loaded unchanged: ' + JSON.stringify(plane.loaded));

  // ================================================================== P (before) / the migration
  const before = await evidenceHashes(sup);
  const beforeCat = await catalogFacts(sup);
  row('P0 manifest evidence hashes on the loaded copy, BEFORE the migration, equal the manifest',
    before.agent_runs === MANIFEST.set_sha256.agent_runs && before.work_orders === MANIFEST.set_sha256.work_orders && before.checkpoints === MANIFEST.set_sha256.checkpoints,
    'counts ' + before.counts.join('/') + ' runs ' + before.agent_runs.slice(0, 12));
  const t0 = Date.now();
  const applied = await apply(plane.superUrl);
  note('migration applied in one transaction: sha256 ' + applied.sha256 + ' (' + (Date.now() - t0) + ' ms)');
  await enableApiLogins(plane);
  row('P1 the migration commits on a 69df2f52 plane holding the baseline rows (its in-transaction self-check passed)', applied.sha256 === sha256(compose()), applied.sha256);
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
  const reserved = (await sup.query(`select count(*)::int n from factory.work_orders where 'factory-enrolled-v1' = any(requires_capabilities)`)).rows[0].n;
  row('P6 no legacy work order gained factory-enrolled-v1', reserved === 0);
  // a second migration run is refused (it runs exactly once)
  let second = null; try { await apply(plane.superUrl); } catch (e) { second = String(e.message); }
  row('P7 a second application is refused and changes nothing', /already applied/.test(second || ''), second && second.slice(0, 90));

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
  const definer = (await sup.query(`select p.oid::regprocedure::text f, p.proconfig from pg_proc p where p.pronamespace = 'factory'::regnamespace and p.prosecdef`)).rows;
  row('C10 every SECURITY DEFINER function pins an empty search_path', definer.every((d) => (d.proconfig || []).some((x) => x === 'search_path=""' || x === 'search_path=')),
    definer.length + ' definer functions');
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
  row('C12 the migration seeds one operator tenant and the two policy versions, and writes no tenant admin, computer or S-16(a) binding',
    seeded.t === 1 && seeded.o === 1 && seeded.a === 0 && seeded.c === 0 && seeded.v === 2, JSON.stringify(seeded));
  const sqlText = compose();
  const planeRefs = ['plane_identity', 'current_database', 'inet_server_addr', 'inet_server_port', 'current_setting', 'pg_settings', 'set_config']
    .filter((w) => new RegExp('\\b' + w + '\\b', 'i').test(sqlText.replace(/--[^\n]*/g, '')));
  row('C13 static scan: no statement of the migration reads a plane-distinguishing value (plane_identity, current_database, server address, settings)',
    planeRefs.length === 0, planeRefs.join(','));
  const trig = (await sup.query(`select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'factory'::regnamespace and not t.tgisinternal`)).rows;
  row('C14 the legacy guard is attached to each 69df2f52 table, and the authority guard + no-truncate to each new table',
    BASE_TABLES.every((b) => trig.some((t) => t.relname === b && t.tgname === 'factory_v1_legacy_guard'))
    && NEW_TABLES.every((n) => trig.some((t) => t.relname === n && t.tgname === 'factory_v1_a_authority') && trig.some((t) => t.relname === n && t.tgname === 'factory_v1_no_truncate')));
  const guardDef = (await sup.query(`select pg_get_functiondef('factory._legacy_guard()'::regprocedure) d`)).rows[0].d;
  const listsAgree = [];
  for (const t of BASE_TABLES) {
    const cols = (await sup.query('select factory._baseline_columns($1) c', [t])).rows[0].c;
    const m = new RegExp("when '" + t + "' then array\\[([^\\]]*)\\]").exec(guardDef);
    const inGuard = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
    listsAgree.push(inGuard && canon(inGuard) === canon(cols));
  }
  row('C15 the legacy guard\'s 69df2f52 column lists equal factory._baseline_columns() (asserted against the catalog in part 000)', listsAgree.every(Boolean));

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
    const call = await tryQuery(run, `select factory._is_engine()`);
    row('L2 factory_runner holds EXECUTE on no factory function, and a direct call is refused', ex.length === 0 && refused(call, /permission denied/), ex.join(',') || call.message);

    // the reserved capability, in any spelling
    const nid = 'legacy-' + randomUUID().slice(0, 8);
    const rc = [
      await tryQuery(run, `insert into factory.nodes (node_id, capabilities) values ($1, '["factory-enrolled-v1"]')`, [nid]),
      await tryQuery(run, `insert into factory.nodes (node_id, capabilities) values ($1, '[" Factory-Enrolled-V1 "]')`, [nid + 'b']),
    ];
    await run.query(`insert into factory.nodes (node_id, capabilities) values ($1, '["edge-verify"]')`, [nid]);
    rc.push(await tryQuery(run, `update factory.nodes set capabilities = capabilities || '["factory-enrolled-v1"]' where node_id = $1`, [nid]));
    rc.push(await tryQuery(run, `insert into factory.work_orders (work_order_id, title, requires_capabilities) values ($1, 'x', '{factory-enrolled-v1}')`, [randomUUID()]));
    const lw = await legacyWorkOrder(run, { title: 'legacy for reserved' });
    rc.push(await tryQuery(run, `update factory.work_orders set requires_capabilities = '{FACTORY-ENROLLED-V1}' where work_order_id = $1`, [lw]));
    row('L3 factory_runner: the reserved capability factory-enrolled-v1 is refused on a node and on a work order, insert and update, in any spelling',
      rc.every((r) => refused(r, /factory_legacy_refused/)), rc.map((r) => r.ok ? 'ALLOWED' : 'refused').join(','));

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
    const ins = [
      await tryQuery(run, `insert into factory.checkpoints (run_id, work_order_id, location) values ($1, $2, 'forged://')`, [nmRun, nmWo]),
      await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'in_progress')`, [nmWo, nid]),
      await tryQuery(run, `insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at) values ('surf/forged', $1, $2, now() + interval '1 hour')`, [nmRun, nid]),
      await tryQuery(run, `insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)`, [lw, nmWo]),
      await tryQuery(run, `insert into factory.founder_notifications (work_order_id, why_blocked, exact_action, what_continues) values ($1, 'x', 'x', 'x')`, [nmWo]),
      await tryQuery(run, `insert into factory.nodes (node_id, principal_id, computer_id) values ('forged-node', $1, $2)`, [comp.principalId, comp.computerId]),
    ];
    row('L5 factory_runner: an INSERT of a new-model row (checkpoint / run / lock / dependency / notification / node for an enrolled identity) is refused by name',
      ins.every((r) => refused(r, /factory_legacy_refused/)), ins.map((r) => r.ok ? 'ALLOWED' : r.message.slice(0, 40)).join(' | '));
    const lr = await legacyWorkOrder(run, { title: 'legacy run owner' });
    const lrun = (await run.query(`insert into factory.agent_runs (work_order_id, node_id, status) values ($1, $2, 'queued') returning run_id`, [lw, nid])).rows[0].run_id;
    const cols = [
      await tryQuery(run, `insert into factory.agent_runs (work_order_id, node_id, status, principal_id) values ($1, $2, 'queued', $3)`, [lr, nid, comp.principalId]),
      await tryQuery(run, `update factory.agent_runs set run_kind = 'verification' where run_id = $1`, [lrun]),
      await tryQuery(run, `update factory.work_orders set priority_num = 1000000 where work_order_id = $1`, [lr]),
      await tryQuery(run, `update factory.work_orders set requires_verification = false where work_order_id = $1`, [lr]),
      await tryQuery(run, `insert into factory.work_orders (work_order_id, title, tenant_id) values ($1, 'x', 'b2e0f000-0000-4000-8000-000000000002')`, [randomUUID()]),
      await tryQuery(run, `update factory.nodes set tenant_id = 'b2e0f000-0000-4000-8000-000000000002' where node_id = $1`, [nid]),
      await tryQuery(run, `update factory.nodes set principal_id = $2, computer_id = $3 where node_id = $1`, [nid, comp.principalId, comp.computerId]),
    ];
    row('L6 factory_runner: setting or changing any column the migration added (identity, run kind, numeric priority, verification, tenant) is refused',
      cols.every((r) => refused(r, /factory_legacy_refused/)), cols.map((r) => r.ok ? 'ALLOWED' : 'refused').join(','));
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
  const polRev = await eng(`update factory.verification_policies set require_physical_separation = true, version = version + 1, updated_by = 'test' where scope = 'tenant_default'`);
  const polVers = (await sup.query(`select count(*)::int n from factory.verification_policy_versions`)).rows[0].n;
  row('E9 policies: never deleted; every change is a new version, and every version is kept', !polDel.ok && !polNoVer.ok && polRev.ok && polVers === 3, 'versions ' + polVers);
  note('policy stricter-only through the Admin API (the API branch of the guard) is proved with the admin front doors (IMP-9)');
  row('E10 tenant_admins: the migration wrote no row, and the table refuses every writer that is not the engine', seeded.a === 0 && refused(await tryQuery(sup, `insert into factory.tenant_admins (tenant_id, auth_user_id, tier) values ($1, $2, 'admin')`, [OPERATOR, randomUUID()]), /factory_authority_refused/));
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
