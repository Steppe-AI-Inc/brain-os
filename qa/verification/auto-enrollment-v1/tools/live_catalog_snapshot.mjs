// Director tool (READ-ONLY): a catalog snapshot of a Factory plane, read from pg_catalog, which shows every object whatever role
// reads it (information_schema filters by the reader's privileges). It is the referent for AC-10 and the S-15 activity check.
// Hashed (the catalog):
//   - every non-platform schema's relations (owner, row security), columns with defaults and column ACLs, functions (signature,
//     SECURITY DEFINER flag, config, sha256 of the body), triggers, RLS policies, rules, view definitions, constraints, indexes and
//     their ACLs;
//   - every non-built-in role with its attributes and settings, role memberships (pg_auth_members), per-role / per-database settings,
//     the current database's ACL, every schema's ACL, default ACLs, extensions, event triggers;
//   - RLS policies on the platform `storage` schema, and storage buckets when this login may read them.
// Not hashed: the observation time and, per `factory` table (plain or partitioned only), the pg_stat_user_tables counters and a sha256
// per row keyed by primary key (heartbeat and lease-expiry columns excluded), for the S-15 live-activity check. A table this login
// cannot SELECT is listed as unreadable. Views are never selected from (their definitions are hashed instead).
// Every read runs on one read-only session with search_path = pg_catalog (plane_access.mjs), so a candidate object cannot stand in
// for a catalog name, and nothing a read triggers can write. SELECT only; never prints or stores a URL.
// ROOT (FACTORY_BASELINE_CHECKOUT): a checkout whose database modules are the 69df2f52 files (the Director-branch checkout after
// npm ci, a fresh 69df2f52 clone, or, for the Director on the Home machine, the frozen legacy checkout read-only). Never the candidate.
// usage: FACTORY_TARGET=live|disposable <one credential variable> node live_catalog_snapshot.mjs <outFile>
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openPlane } from './plane_access.mjs';

const ROOT = process.env.FACTORY_BASELINE_CHECKOUT || 'C:/Users/Dell/dev/brain-os-factory-cp';
const out = process.argv[2];
if (!out) { console.log('usage: live_catalog_snapshot.mjs <outFile>'); process.exit(2); }
const { target, observed, session } = await openPlane(ROOT);
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const qi = (s) => '"' + String(s).split('"').join('""') + '"';
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v));

// Platform-managed schemas are listed by name and ACL only (storage also by its RLS policies); every other schema is read in full.
const PLATFORM = ['pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', '_realtime', 'extensions', 'graphql', 'graphql_public',
  'pgbouncer', 'vault', 'pgsodium', 'pgsodium_masks', 'net', 'supabase_functions', 'supabase_migrations', 'cron', '_analytics', 'pgtle'];
const NP = `n.nspname <> all($1::text[]) and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;
const VOLATILE = new Set(['last_heartbeat_at', 'heartbeat_at', 'lease_expires_at']);

const snap = await session(async (q) => {
  const P = [PLATFORM];
  const rels = await q(`select n.nspname sch, c.relname rel, c.relkind kind, pg_get_userbyid(c.relowner) owner, c.relrowsecurity rls, c.relforcerowsecurity force_rls,
    case when c.relkind in ('v','m') then pg_get_viewdef(c.oid) else '' end vdef
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where ${NP} and c.relkind in ('r','v','m','p','f','S') order by 1, 2`, P);
  const cols = await q(`select n.nspname sch, c.relname tbl, c.relkind kind, a.attnum num, a.attname col, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull notnull,
    coalesce(pg_get_expr(d.adbin, d.adrelid), '') dflt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where ${NP} and c.relkind in ('r','v','m','p','f') and a.attnum > 0 and not a.attisdropped order by 1, 2, 4`, P);
  const colacl = await q(`select n.nspname sch, c.relname tbl, a.attname col, coalesce(g.rolname, 'PUBLIC') grantee, x.privilege_type priv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid, aclexplode(a.attacl) x
    left join pg_roles g on g.oid = x.grantee where ${NP} and a.attnum > 0 and not a.attisdropped and a.attacl is not null order by 1, 2, 3, 4, 5`, P);
  const fns = await q(`select n.nspname sch, p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_userbyid(p.proowner) owner, p.prosecdef secdef,
    coalesce(array_to_string(p.proconfig, ','), '') config, p.prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ${NP} order by 1, 2, 3`, P);
  const roles = await q(`select rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolcanlogin,
    coalesce(rolconfig, '{}'::text[]) rolconfig from pg_roles where rolname not like 'pg\\_%' order by 1`);
  const members = await q(`select pg_get_userbyid(m.roleid) granted_role, pg_get_userbyid(m.member) member, m.admin_option
    from pg_auth_members m where not (pg_get_userbyid(m.roleid) like 'pg\\_%' and pg_get_userbyid(m.member) like 'pg\\_%') order by 1, 2`);
  const settings = await q(`select coalesce(d.datname, '(all databases)') db, case when s.setrole = 0 then '(all roles)' else pg_get_userbyid(s.setrole) end role,
    s.setconfig config from pg_db_role_setting s left join pg_database d on d.oid = s.setdatabase
    where s.setdatabase = 0 or d.datname = current_database() order by 1, 2`);
  const dbacl = await q(`select d.datname db, coalesce(g.rolname, 'PUBLIC') grantee, x.privilege_type priv
    from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x left join pg_roles g on g.oid = x.grantee
    where d.datname = current_database() order by 2, 3`);
  const tacl = await q(`select n.nspname sch, c.relname tbl, coalesce(g.rolname, 'PUBLIC') grantee, x.privilege_type priv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
    left join pg_roles g on g.oid = x.grantee where ${NP} and c.relkind in ('r','v','m','p','f','S') order by 1, 2, 3, 4`, P);
  const facl = await q(`select n.nspname sch, p.proname fn, pg_get_function_identity_arguments(p.oid) args, coalesce(g.rolname, 'PUBLIC') grantee, x.privilege_type priv
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
    left join pg_roles g on g.oid = x.grantee where ${NP} order by 1, 2, 3, 4, 5`, P);
  const schemas = await q(`select n.nspname schema, pg_get_userbyid(n.nspowner) owner, coalesce(g.rolname, 'PUBLIC') grantee, x.privilege_type priv
    from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x left join pg_roles g on g.oid = x.grantee
    where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' order by 1, 3, 4`);
  const dacl = await q(`select coalesce(n.nspname, '(all schemas)') sch, pg_get_userbyid(d.defaclrole) for_role, coalesce(g.rolname, 'PUBLIC') grantee, d.defaclobjtype objtype, x.privilege_type priv
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) x
    left join pg_roles g on g.oid = x.grantee where n.oid is null or (${NP}) order by 1, 2, 3, 4, 5`, P);
  const trig = await q(`select n.nspname sch, c.relname tbl, t.tgname, t.tgenabled enabled, pg_get_triggerdef(t.oid) def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where ${NP} and not t.tgisinternal order by 1, 2, 3`, P);
  const pol = await q(`select n.nspname sch, c.relname tbl, p.polname, p.polcmd cmd, p.polpermissive permissive,
    array_to_string(array(select coalesce(pg_get_userbyid(r), 'PUBLIC') from unnest(p.polroles) r order by 1), ',') roles,
    coalesce(pg_get_expr(p.polqual, p.polrelid), '') qual, coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') chk
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
    where (${NP}) or n.nspname = 'storage' order by 1, 2, 3`, P);
  const rules = await q(`select n.nspname sch, c.relname tbl, r.rulename, pg_get_ruledef(r.oid) def
    from pg_rewrite r join pg_class c on c.oid = r.ev_class join pg_namespace n on n.oid = c.relnamespace
    where ${NP} and r.rulename <> '_RETURN' order by 1, 2, 3`, P);
  const cons = await q(`select n.nspname sch, c.relname tbl, k.conname, k.contype, pg_get_constraintdef(k.oid) def
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where ${NP} order by 1, 2, 3`, P);
  const idx = await q(`select n.nspname sch, c.relname idx, pg_get_indexdef(c.oid) def
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where ${NP} and c.relkind in ('i','I') order by 1, 2`, P);
  const ext = await q(`select e.extname, e.extversion, n.nspname sch from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1`);
  const evt = await q(`select e.evtname, e.evtevent, e.evtenabled, p.proname fn from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid order by 1`);
  // by oid, so a login without USAGE on schema storage gets "unreadable" instead of an error
  const canBuckets = (await q(`select coalesce(bool_and(has_schema_privilege(current_user, n.oid, 'USAGE') and has_table_privilege(current_user, c.oid, 'SELECT')), false) ok
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets'`))[0].ok;
  const buckets = canBuckets
    ? { readable: true, rows: await q(`select id, name, public, file_size_limit, coalesce(array_to_string(allowed_mime_types, ','), '') mime from storage.buckets order by id`) }
    : { readable: false, note: 'storage.buckets is not readable by this login; the observer role covers it' };

  // not hashed
  const observedAt = (await q(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') t`))[0].t;
  const counters = await q(`select relname tbl, n_tup_ins::bigint::text ins, n_tup_upd::bigint::text upd, n_tup_del::bigint::text del
    from pg_stat_user_tables where schemaname = 'factory' order by 1`);
  const activity = [];
  const tables = await q(`select c.oid, c.relname tbl, has_table_privilege(current_user, c.oid, 'SELECT') readable
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'factory' and c.relkind in ('r','p') order by 2`);
  for (const t of tables) {
    if (!t.readable) { activity.push({ table: t.tbl, unreadable: true }); continue; }
    const pk = (await q(`select a.attname col from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = $1 and i.indisprimary order by a.attnum`, [t.oid])).map((r) => r.col);
    const rows = (await q(`select to_jsonb(t) j from factory.${qi(t.tbl)} t`)).map((r) => r.j);
    const keyed = rows.map((j) => {
      const stable = Object.fromEntries(Object.entries(j).filter(([k]) => !VOLATILE.has(k)));
      return { key: pk.length ? pk.map((k) => String(j[k])).join('|') : sha(canon(j)), sha256: sha(canon(stable)) };
    }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    activity.push({ table: t.tbl, primary_key: pk, n: rows.length, rows: keyed });
  }
  return { rels, cols, colacl, fns, roles, members, settings, dbacl, tacl, facl, schemas, dacl, trig, pol, rules, cons, idx, ext, evt, buckets, observedAt, counters, activity };
});

const s = snap;
const cfg = (arr) => ({ names: (arr || []).map((kv) => String(kv).split('=')[0]).sort(), values_sha256: sha(JSON.stringify([...(arr || [])].sort())) });
const snapshot = {
  snapshot: 'Factory plane catalog, read from pg_catalog',
  materialized_by: target === 'live' ? 'DIRECTOR (read-only SELECT)' : 'VERIFIER (disposable plane)', observed,
  instrument: 'qa/verification/auto-enrollment-v1/tools/live_catalog_snapshot.mjs',
  platform_schemas_listed_by_acl_only: PLATFORM,
  relations: s.rels.map((r) => r.sch + '.' + r.rel + ':' + r.kind + ' owner=' + r.owner + (r.rls ? ' rls' : '') + (r.force_rls ? ' force_rls' : '') + (r.vdef ? ' viewdef=' + sha(r.vdef) : '')),
  columns: s.cols.map((c) => c.sch + '.' + c.tbl + '.' + c.col + ':' + c.typ + (c.notnull ? ' not null' : '') + (c.dflt ? ' default=' + sha(c.dflt) : '')),
  column_acl: s.colacl,
  functions: s.fns.map((f) => ({ name: f.sch + '.' + f.proname, args: f.args, owner: f.owner, security_definer: f.secdef, config: f.config, body_sha256: sha(f.src) })),
  // setting values can hold secrets: only their names are recorded in clear, and a sha256 of the values
  roles: s.roles.map((r) => ({ ...r, rolconfig: cfg(r.rolconfig) })), role_memberships: s.members,
  role_database_settings: s.settings.map((x) => ({ db: x.db, role: x.role, ...cfg(x.config) })), database_acl: s.dbacl,
  table_acl: s.tacl, function_acl: s.facl, schema_acl: s.schemas, default_acl: s.dacl,
  triggers: s.trig.map((t) => ({ table: t.sch + '.' + t.tbl, name: t.tgname, enabled: t.enabled, def_sha256: sha(t.def) })),
  policies: s.pol.map((p) => ({ table: p.sch + '.' + p.tbl, name: p.polname, cmd: p.cmd, permissive: p.permissive, roles: p.roles, qual_sha256: sha(p.qual), check_sha256: sha(p.chk) })),
  rules: s.rules.map((r) => ({ table: r.sch + '.' + r.tbl, name: r.rulename, def_sha256: sha(r.def) })),
  constraints: s.cons.map((k) => ({ table: k.sch + '.' + k.tbl, name: k.conname, type: k.contype, def_sha256: sha(k.def) })),
  indexes: s.idx.map((i) => ({ index: i.sch + '.' + i.idx, def_sha256: sha(i.def) })),
  extensions: s.ext, event_triggers: s.evt, storage_buckets: s.buckets,
};
const HASHED = ['relations', 'columns', 'column_acl', 'functions', 'roles', 'role_memberships', 'role_database_settings', 'database_acl', 'table_acl',
  'function_acl', 'schema_acl', 'default_acl', 'triggers', 'policies', 'rules', 'constraints', 'indexes', 'extensions', 'event_triggers', 'storage_buckets'];
snapshot.hashed_sections = HASHED;
snapshot.snapshot_sha256 = sha(canon(Object.fromEntries(HASHED.map((k) => [k, snapshot[k]]))));
snapshot.not_hashed = { observed_at_utc: s.observedAt, factory_table_counters: s.counters, factory_table_rows: s.activity };
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(HASHED.map((k) => k + ' ' + (Array.isArray(snapshot[k]) ? snapshot[k].length : (snapshot[k].readable ? snapshot[k].rows.length : 'unreadable'))).join(', '));
console.log('snapshot_sha256', snapshot.snapshot_sha256, '| observed:', observed.mode, observed.target, 'as', observed.current_user, 'plane',
  JSON.stringify(observed.plane_identity), 'root', observed.root_head.slice(0, 8), 'session', JSON.stringify(observed.session));
process.exit(0);
