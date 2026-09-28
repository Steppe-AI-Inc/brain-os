// Director instrument (READ-ONLY): records the live applying role (Supabase `postgres`) that the founder's live-migration step runs
// as: its pg_roles attributes; its role configuration (names AND values); its memberships with their admin, inherit and set options
// and grantor; the current database's configuration for this role and for all roles; createrole_self_grant as the observing
// session reads it; and (Director r3) every role's settings, so a judging plane aligns them and compares them by value. VERIFICATION_SPEC.md §3.3 ("The judging plane") aligns every judging plane's applying login to this record;
// LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json holds the same settings only by hash, which the values recorded here reproduce. A
// setting whose name suggests a secret (key, secret, password, token, jwt) is recorded by name only: this record is public, and a
// short secret's sha256 could be reversed by enumeration.
// Credential, module pinning and the read-only pinned session: plane_access.mjs.
// usage: FACTORY_TARGET=live <one credential variable> FACTORY_BASELINE_CHECKOUT=<ROOT> node applying_role_observation.mjs <outFile>
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openPlane } from './plane_access.mjs';

const ROOT = process.env.FACTORY_BASELINE_CHECKOUT;
const out = process.argv[2];
if (!out) { console.log('usage: applying_role_observation.mjs <outFile>'); process.exit(2); }
const { target, observed, session } = await openPlane(ROOT);
if (target !== 'live') { console.log('refused: this instrument records the LIVE applying role (FACTORY_TARGET=live)'); process.exit(2); }
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const SECRETISH = /key|secret|password|token|jwt/i;

const rec = await session(async (q) => {
  const role = (await q(`select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls,
    coalesce(rolconfig, '{}'::text[]) rolconfig from pg_roles where rolname = 'postgres'`))[0];
  if (!role) return null;
  const member_of = (await q(`select pg_get_userbyid(m.roleid) granted_role, m.admin_option, m.inherit_option, m.set_option,
    pg_get_userbyid(m.grantor) grantor from pg_auth_members m
    where m.member = (select oid from pg_roles where rolname = 'postgres') order by 1, 5`));
  const db_settings = (await q(`select coalesce(s.setconfig, '{}'::text[]) cfg from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase
    where d.datname = current_database() and s.setrole = (select oid from pg_roles where rolname = 'postgres')`)).map((r) => r.cfg).flat();
  const db_all_roles = (await q(`select coalesce(s.setconfig, '{}'::text[]) cfg from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase
    where d.datname = current_database() and s.setrole = 0`)).map((r) => r.cfg).flat();
  const self_grant = (await q(`select current_setting('createrole_self_grant') v`))[0].v;
  // Director r3: every role's settings (all databases, and this database), so a judging plane aligns them and compares them by value
  const all_role_settings = await q(`select case when s.setrole = 0 then '(all roles)' else pg_get_userbyid(s.setrole) end role,
    coalesce(d.datname, '(all databases)') db, coalesce(s.setconfig, '{}'::text[]) cfg from pg_db_role_setting s left join pg_database d on d.oid = s.setdatabase
    where s.setdatabase = 0 or d.datname = current_database() order by 1, 2`);
  return { role, member_of, db_settings, db_all_roles, self_grant, all_role_settings };
});
if (!rec) { console.log('refused: no postgres role on this plane'); process.exit(2); }
const setting = (kv) => { const i = String(kv).indexOf('='); const name = kv.slice(0, i), value = kv.slice(i + 1);
  return SECRETISH.test(name) ? { name, secret_named: true } : { name, value }; };
const { rolconfig, ...attributes } = rec.role;
const record = {
  record: 'live applying role (Supabase postgres), for VERIFICATION_SPEC.md §3.3 "The judging plane"',
  instrument: 'qa/verification/auto-enrollment-v1/tools/applying_role_observation.mjs',
  observed,
  attributes,
  role_configuration: rolconfig.map(setting),
  database_role_configuration: rec.db_settings.map(setting),
  database_configuration_all_roles: rec.db_all_roles.map(setting),
  createrole_self_grant: { value: rec.self_grant, read_as: 'the observing session (server and database level; a role-level value is in role_configuration)' },
  member_of: rec.member_of,
  role_settings: rec.all_role_settings.map((r) => ({ role: r.role, db: r.db, settings: r.cfg.map(setting) })),
};
writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
console.log('postgres: ' + JSON.stringify(attributes) + ' | settings ' + record.role_configuration.map((s) => s.name).join(',') +
  ' | database settings (all roles) ' + record.database_configuration_all_roles.map((s) => s.name).join(',') +
  ' | createrole_self_grant ' + JSON.stringify(rec.self_grant) + ' | member of ' + rec.member_of.length + ' roles');
process.exit(0);
