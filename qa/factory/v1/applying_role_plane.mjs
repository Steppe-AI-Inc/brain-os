#!/usr/bin/env node
// DEVELOPER APPROXIMATION OF THE r3 JUDGING PLANE'S APPLYING LOGIN (VERIFICATION_SPEC §3.3). Never evidence for a verdict.
//
// The live control plane is applied by Supabase's `postgres`: NOSUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, holding
// factory_runner with ADMIN only (inherit false, set false), createrole_self_grant empty (APPLYING_ROLE_OBSERVATION.json). A
// candidate migration applied as a superuser in a test can pass and still fail there. This plane reproduces that login on a
// disposable embedded PostgreSQL: the bootstrap superuser is `supabase_admin`, `postgres` is aligned to the observation, and every
// later statement runs AS `postgres`, as the judging plane runs them:
//   1. provision as 69df2f52: the dedicated-Supabase statements of provision-control-plane.mjs and the 69df2f52 files 001..003,
//      read from git (69df2f52), never from this tree;
//   2. load BASELINE_69df2f52_EVIDENCE_ROWS.json unchanged (load_order; complete rows);
//   3. build the live-migration step with the Director instrument tools/build_live_migration_step.mjs, exported from the Director
//      commit into a temporary directory and run as an external tool (WO-1: never imported or copied into this tree), over the
//      committed blobs of the candidate migration (contract §1) at --tree;
//   4. apply the step as `postgres` in ONE simple-Query message.
// Limits (stated, not hidden): PostgreSQL 18 here, 17 live; the Supabase platform schemas, roles and event triggers are not
// reproduced (only the roles the applying login is a member of, and the database / schema ACLs it depends on).
//   node qa/factory/v1/applying_role_plane.mjs [--tree <commit>] [--director <commit>] [--raw]
//     --raw  when the tool refuses to build the step, apply the migration files verbatim in one transaction instead (diagnosis
//            only: it tells a privilege failure apart from the tool's refusal; never a substitute for the step)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { stopServer } from '../local_pg.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const TREE = arg('--tree', 'HEAD');
const DIRECTOR = arg('--director', 'c7a845b61a3b0b419e8c9dfeff397547fdc75b03');
const RAW = process.argv.includes('--raw');
const git = (...a) => { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'buffer', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const rand = () => Math.random().toString(36).slice(2, 12);
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

const OBS = JSON.parse(git('show', DIRECTOR + ':qa/verification/auto-enrollment-v1/APPLYING_ROLE_OBSERVATION.json').toString('utf8'));
const ROWS_TEXT = git('show', DIRECTOR + ':qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json').toString('utf8');
const ROWS = JSON.parse(ROWS_TEXT);

const work = mkdtempSync(join(tmpdir(), 'factory-applying-'));
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id + ' - ' + detail); };
let server = null, dataDir = null;
try {
  // ---- the Director instrument, exported (not copied into the tree) ------------------------------------------------------
  const dirTools = join(work, 'director', 'tools'); mkdirSync(dirTools, { recursive: true });
  for (const p of git('ls-tree', '-r', '--name-only', DIRECTOR, 'qa/verification/auto-enrollment-v1/tools/').toString('utf8').trim().split('\n'))
    writeFileSync(join(dirTools, p.split('/').pop()), git('show', DIRECTOR + ':' + p));
  for (const f of ['BASELINE_69df2f52_EVIDENCE_MANIFEST.json', 'BASELINE_69df2f52_EVIDENCE_ROWS.json'])
    writeFileSync(join(work, 'director', f), git('show', DIRECTOR + ':qa/verification/auto-enrollment-v1/' + f));

  // ---- the candidate migration at --tree (contract §1): committed blobs, byte order of path ---------------------------------
  const treeSha = git('rev-parse', TREE).toString('utf8').trim();
  const paths = git('diff', '--name-only', '--diff-filter=A', BASELINE, treeSha, '--', 'supabase/control-plane/').toString('utf8').trim().split('\n')
    .filter((p) => p.endsWith('.sql') && !p.startsWith('supabase/control-plane/edge/')).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const changedBaseline = git('diff', '--name-only', '--diff-filter=MDR', BASELINE, treeSha, '--', 'supabase/control-plane/').toString('utf8').trim();
  row('M0', changedBaseline === '', 'no 69df2f52 control-plane file changed at ' + treeSha.slice(0, 12) + (changedBaseline ? ': ' + changedBaseline : ''));
  const migDir = join(work, 'mig'); mkdirSync(migDir);
  const migFiles = paths.map((p, i) => { const f = join(migDir, String(i).padStart(3, '0') + '_' + p.split('/').pop()); writeFileSync(f, git('show', treeSha + ':' + p)); return f; });
  console.log('candidate migration at ' + treeSha.slice(0, 12) + ': ' + paths.length + ' files');
  const stepFile = join(work, 'step.sql');
  const b = spawnSync(process.execPath, [join(dirTools, 'build_live_migration_step.mjs'), stepFile, ...migFiles], { cwd: dirTools, encoding: 'utf8' });
  const built = b.status === 0 && existsSync(stepFile);
  row('M1', built, built ? 'the Director instrument built the step (' + (b.stdout.match(/step[^\n]*sha256[^\n]*/i) || [''])[0].slice(0, 120) + ')' : 'the Director instrument REFUSED: ' + (b.stdout + b.stderr).trim().split('\n').pop());

  // ---- the plane --------------------------------------------------------------------------------------------------------
  const port = await freePort(); const suPass = 'su_' + rand(); const pgPass = 'pg_' + rand();
  dataDir = join(work, 'data');
  server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'supabase_admin', password: suPass, port, persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise(); await server.start();
  const conn = (user, password) => new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user, password });
  const su = conn('supabase_admin', suPass); await su.connect();
  const a = OBS.attributes;
  const attrs = [a.rolsuper ? 'superuser' : 'nosuperuser', a.rolinherit ? 'inherit' : 'noinherit', a.rolcreaterole ? 'createrole' : 'nocreaterole', a.rolcreatedb ? 'createdb' : 'nocreatedb',
    a.rolcanlogin ? 'login' : 'nologin', a.rolreplication ? 'replication' : 'noreplication', a.rolbypassrls ? 'bypassrls' : 'nobypassrls'].join(' ');
  await su.query(`create role postgres ${attrs} password '${pgPass}'`);
  for (const m of OBS.member_of) {
    if (m.granted_role === 'factory_runner') continue; // postgres creates it below, which grants ADMIN automatically, as live
    if (!/^pg_/.test(m.granted_role)) await su.query(`create role ${m.granted_role} nologin`).catch(() => {});
    await su.query(`grant ${m.granted_role} to postgres with admin ${m.admin_option}, inherit ${m.inherit_option}, set ${m.set_option} granted by supabase_admin`);
  }
  for (const s of OBS.role_configuration || []) if (s.name === 'search_path') await su.query(`alter role postgres set search_path = "$user", public, extensions`);
  await su.query(`grant connect, create, temporary on database postgres to postgres`);
  await su.query(`create schema extensions authorization postgres`);
  await su.query(`create extension if not exists pgcrypto schema extensions`);
  await su.query(`create extension if not exists "uuid-ossp" schema extensions`);
  await su.query(`revoke create on schema public from public`);
  const self = (await su.query(`select current_setting('createrole_self_grant') v`)).rows[0].v;
  row('P0', self === (OBS.createrole_self_grant.value || ''), 'createrole_self_grant = ' + JSON.stringify(self) + ' (live ' + JSON.stringify(OBS.createrole_self_grant.value) + ')');
  await su.end();

  // ---- as postgres: provision as 69df2f52 (dedicated-Supabase statements) -------------------------------------------------
  const ap = conn('postgres', pgPass); await ap.connect();
  const me = (await ap.query('select current_user u, r.rolsuper s from pg_roles r where r.rolname = current_user')).rows[0];
  row('P1', me.u === 'postgres' && me.s === false, 'the applying login is postgres, NOSUPERUSER');
  const names = git('ls-tree', '--name-only', BASELINE, 'supabase/control-plane/').toString('utf8').trim().split('\n').filter((p) => /\/\d{3}_.*\.sql$/.test(p)).sort();
  let provisioned = true;
  try {
    for (const p of names) await ap.query(git('show', BASELINE + ':' + p).toString('utf8'));
    const R = 'factory_runner';
    await ap.query(`create role ${R} with login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit password 'fr_${rand()}'`);
    await ap.query(`grant connect on database "postgres" to ${R}`);
    await ap.query(`grant usage on schema factory to ${R}`);
    await ap.query(`grant select, insert, update, delete on all tables in schema factory to ${R}`);
    await ap.query(`alter default privileges in schema factory grant select, insert, update, delete on tables to ${R}`);
    await ap.query(`revoke create on database "postgres" from ${R}`);
    await ap.query(`revoke all on schema public from ${R}`);
    await ap.query(`revoke all privileges on all tables in schema public from ${R}`);
    await ap.query('create table if not exists factory.plane_identity (project_ref text primary key, provisioned_at timestamptz not null default now(), note text)');
    await ap.query('revoke all on factory.plane_identity from ' + R);
    await ap.query('grant select on factory.plane_identity to ' + R);
    await ap.query('insert into factory.plane_identity (project_ref, note) values ($1, $2)', ['disposableapplying', 'disposable applying-role plane']);
  } catch (e) { provisioned = false; row('P2', false, 'provisioning as 69df2f52 AS postgres failed: ' + e.message); }
  if (provisioned) {
    const fr = (await ap.query(`select m.admin_option a, m.inherit_option i, m.set_option s from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where r.rolname = 'factory_runner' and u.rolname = 'postgres'`)).rows[0];
    const live = OBS.member_of.find((m) => m.granted_role === 'factory_runner');
    row('P2', !!fr && fr.a === live.admin_option && fr.i === live.inherit_option && fr.s === live.set_option,
      'provisioned as 69df2f52 AS postgres; postgres holds factory_runner admin=' + fr?.a + ' inherit=' + fr?.i + ' set=' + fr?.s + ' (live ' + live.admin_option + '/' + live.inherit_option + '/' + live.set_option + ')');
    // ---- the baseline rows, unchanged ---------------------------------------------------------------------------------
    let loaded = 0;
    try {
      for (const t of ROWS.load_order) for (const r of ROWS[t]) { await ap.query(`insert into factory.${t} select * from jsonb_populate_record(null::factory.${t}, $1::jsonb)`, [JSON.stringify(r)]); loaded++; }
      row('P3', true, 'baseline evidence rows loaded unchanged: ' + loaded);
    } catch (e) { row('P3', false, 'loading the baseline rows failed after ' + loaded + ': ' + e.message); }
    // ---- the step (or, with --raw after a refusal, the migration verbatim) -----------------------------------------------
    let text = null, what = '';
    if (built) { text = readFileSync(stepFile, 'utf8'); what = 'the live-migration step'; }
    else if (RAW) { text = 'begin;\n' + migFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + '\ncommit;\n'; what = 'the migration verbatim (--raw DIAGNOSIS, not the step)'; }
    if (text) {
      try {
        await ap.query(text);
        const n = (await ap.query(`select count(*)::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname in ('factory', 'factory_api', 'factory_admin') and c.relkind = 'r'`)).rows[0].n;
        row('S1', true, what + ' committed AS postgres (NOSUPERUSER); tables in the factory schemas now ' + n);
      } catch (e) {
        await ap.query('rollback').catch(() => {});
        row('S1', false, what + ' FAILED AS postgres: ' + e.message + (e.where ? ' | where: ' + String(e.where).split('\n')[0] : '') + (e.code ? ' | sqlstate ' + e.code : ''));
      }
    } else row('S1', false, 'nothing applied: the step was refused (re-run with --raw to diagnose the migration under this login)');
  }
  await ap.end();
} catch (e) {
  row('X0', false, 'applying_role_plane did not complete: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  if (server) { try { await stopServer(server, dataDir); } catch { /* down */ } }
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok).length;
console.log(`applying_role_plane [tree ${TREE}, director ${DIRECTOR.slice(0, 8)}]: ${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
