#!/usr/bin/env node
// DEVELOPER APPROXIMATION OF THE r3 JUDGING PLANE'S APPLYING LOGIN (VERIFICATION_SPEC §3.3). Never evidence for a verdict.
//
// The live control plane is applied by Supabase's `postgres`: NOSUPERUSER, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, holding
// factory_runner with ADMIN only (inherit false, set false), createrole_self_grant empty (APPLYING_ROLE_OBSERVATION.json). A
// candidate migration applied as a superuser in a test can pass and still fail there, because a superuser skips every privilege
// check. So EVERY v1 developer suite gets its plane from here (plane.mjs delegates to it) and applies the migration only through
// applyAsApplyingLogin(), which refuses a superuser login:
//   1. a disposable embedded PostgreSQL whose bootstrap superuser is `supabase_admin` (the judging plane's); `postgres` is created
//      and aligned to the observation (attributes, memberships with their options, its search_path setting, the database ACL);
//   2. provisioned as 69df2f52 AS `postgres`: the 69df2f52 files 001..003 (read from git at 69df2f52, never from this tree) and the
//      statements of provision-control-plane.mjs's dedicated-Supabase mode (its project-ref and TLS checks are not run, and its
//      identity row names this disposable plane, as §3.3 states);
//   3. optionally BASELINE_69df2f52_EVIDENCE_ROWS.json loaded unchanged (load_order; complete rows);
//   4. applyAsApplyingLogin(): AS `postgres`, in ONE simple-Query message, either the live-migration step the Director instrument
//      tools/build_live_migration_step.mjs builds (exported from the designated Director commit into a temporary directory and run
//      as an external tool: WO-1, never imported or copied into this tree) when the baseline rows are loaded, or the migration files
//      verbatim, each followed by one LF, inside BEGIN / COMMIT (the instrument's check needs the baseline rows).
// The bootstrap superuser's URL (superUrl) is for read-backs and test fixtures only; nothing applies the migration with it.
// Limits (stated, not hidden): PostgreSQL 18 here, 17 live; the Supabase platform schemas, roles, supautils hooks and event
// triggers are not reproduced (only the roles the applying login is a member of, and the database / schema ACLs it depends on).
//
//   node qa/factory/v1/applying_role_plane.mjs [--tree <commit> | --worktree] [--director <commit>] [--raw]
//     --tree      the committed blobs of the candidate migration at <commit> (default HEAD), as the verifier builds the step
//     --worktree  the working-tree files instead (developer loop; CR LF read as LF, as git stores them)
//     --raw       when the tool refuses to build the step, apply the migration files verbatim in one transaction instead (diagnosis
//                 only: it tells a privilege failure apart from the tool's refusal; never a substitute for the step)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { stopServer } from '../local_pg.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
// the designated Director commit (r3); FACTORY_DESIGNATED_DIRECTOR overrides it, as in the static contract
export const DIRECTOR = process.env.FACTORY_DESIGNATED_DIRECTOR || 'c7a845b61a3b0b419e8c9dfeff397547fdc75b03';
const git = (...a) => { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
const rand = () => randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lf = (b) => Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const byPath = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** The Director's applying-role observation, read from the designated Director commit (never from the tree). */
export function observation(director = DIRECTOR) {
  return JSON.parse(git('show', director + ':qa/verification/auto-enrollment-v1/APPLYING_ROLE_OBSERVATION.json').toString('utf8'));
}

/** The candidate migration (contract §1): every .sql file added under supabase/control-plane/ since 69df2f52, edge/ excluded, in
 * byte order of repository-relative path. tree: a commit (its committed files) or null (the working tree, untracked files included). */
export function candidateMigrationPaths(tree = null) {
  const added = git('diff', '--name-only', '--diff-filter=A', BASELINE, ...(tree ? [git('rev-parse', tree).toString('utf8').trim()] : []), '--', 'supabase/control-plane/')
    .toString('utf8').trim().split('\n');
  const untracked = tree ? [] : git('ls-files', '--others', '--exclude-standard', '--', 'supabase/control-plane/').toString('utf8').trim().split('\n');
  return [...new Set([...added, ...untracked])].filter((p) => p && p.endsWith('.sql') && !p.startsWith('supabase/control-plane/edge/')).sort(byPath);
}

/** Each migration file's bytes: the committed blob at `tree`, or the working-tree file with CR LF read as LF (as git stores it). */
export function readMigration(paths, tree = null) {
  const at = tree ? git('rev-parse', tree).toString('utf8').trim() : null;
  return paths.map((p) => { const bytes = at ? git('show', at + ':' + p) : lf(readFileSync(join(ROOT, p))); return { path: p, bytes, sha256: sha(bytes) }; });
}

/** Build the live-migration step with the Director instrument, exported from `director` into `work` (never into this tree). */
export function buildStep(work, files, director = DIRECTOR) {
  const dir = mkdtempSync(join(work, 'step-'));
  const tools = join(dir, 'director', 'tools'); mkdirSync(tools, { recursive: true });
  for (const p of git('ls-tree', '-r', '--name-only', director, 'qa/verification/auto-enrollment-v1/tools/').toString('utf8').trim().split('\n'))
    writeFileSync(join(tools, p.split('/').pop()), git('show', director + ':' + p));
  for (const f of ['BASELINE_69df2f52_EVIDENCE_MANIFEST.json', 'BASELINE_69df2f52_EVIDENCE_ROWS.json'])
    writeFileSync(join(dir, 'director', f), git('show', director + ':qa/verification/auto-enrollment-v1/' + f));
  // each file under its repository-relative path, so the instrument sees (and orders) the real paths
  const migRoot = join(dir, 'mig');
  const args = files.map((f) => { const t = join(migRoot, ...f.path.split('/')); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, f.bytes); return t; });
  const stepFile = join(dir, 'step.sql');
  const r = spawnSync(process.execPath, [join(tools, 'build_live_migration_step.mjs'), stepFile, ...args], { cwd: tools, encoding: 'utf8', windowsHide: true });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (r.status !== 0 || !existsSync(stepFile)) return { ok: false, out };
  const text = readFileSync(stepFile, 'utf8');
  return { ok: true, out, text, sha256: sha(Buffer.from(text, 'utf8')) };
}

/** A SCRAM-SHA-256 verifier computed client-side, as psql's \password sends it: the password itself never reaches the server's
 * statement text (the founder's prepared API-login and rotation steps use \password; S-12). ASCII passwords only (SASLprep = identity). */
export function scramVerifier(password, iterations = 4096) {
  if (!/^[\x21-\x7e]+$/.test(password)) throw new Error('scramVerifier: printable ASCII passwords only');
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return 'SCRAM-SHA-256$' + iterations + ':' + salt.toString('base64') + '$' + storedKey.toString('base64') + ':' + serverKey.toString('base64');
}

const ATTRS = ['rolsuper', 'rolinherit', 'rolcreaterole', 'rolcreatedb', 'rolcanlogin', 'rolreplication', 'rolbypassrls'];

/**
 * Start the plane: aligned, provisioned as 69df2f52 AS postgres, optionally with the baseline rows. Returns
 * { port, dir, database, superUrl (bootstrap superuser: read-backs and fixtures only), adminUrl (postgres, the applying login),
 *   runnerUrl (factory_runner), loaded, alignment: [{ id, ok, detail }], observation, stop() }.
 * Throws when the alignment or the provisioning fails (the plane is then stopped and removed).
 */
export async function startApplyingRolePlane({ baselineRows = false, quiet = true, director = DIRECTOR } = {}) {
  const OBS = observation(director);
  const dir = mkdtempSync(join(tmpdir(), 'factory-applying-'));
  const dataDir = join(dir, 'data');
  const port = await freePort(); const suPass = 'su_' + rand(); const pgPass = 'pg_' + rand(); const frPass = 'fr_' + rand();
  const server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'supabase_admin', password: suPass, port, persistent: false,
    onLog: quiet ? () => {} : (m) => process.stderr.write(String(m)), onError: quiet ? () => {} : (m) => process.stderr.write(String(m)) });
  let stopped = false;
  const pgCtl = () => (server.process && server.process.spawnargs && server.process.spawnargs[0] ? join(dirname(server.process.spawnargs[0]), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl') : null);
  const onExit = () => { if (stopped) return; const c = pgCtl(); if (c && existsSync(c)) spawnSync(c, ['stop', '-D', dataDir, '-m', 'immediate', '-w', '-t', '30'], { stdio: 'ignore', windowsHide: true, timeout: 45000 }); try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ } };
  process.once('exit', onExit);
  const stop = async () => {
    if (stopped) return; stopped = true;
    try { await stopServer(server, dataDir); } catch { /* down */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
  };
  const url = (user, password) => 'postgresql://' + user + ':' + encodeURIComponent(password) + '@127.0.0.1:' + port + '/postgres';
  const plane = { port, dir, database: 'postgres', superUrl: url('supabase_admin', suPass), adminUrl: url('postgres', pgPass), runnerUrl: url('factory_runner', frPass),
    loaded: null, alignment: [], observation: OBS, director, stop };
  const row = (id, ok, detail) => { plane.alignment.push({ id, ok: !!ok, detail }); if (!ok) throw new Error('applying-role plane ' + id + ' failed: ' + detail); };
  try {
    await server.initialise(); await server.start();
    // ---- alignment, as the bootstrap superuser ----------------------------------------------------------------------------
    const su = new pg.Client({ connectionString: plane.superUrl }); await su.connect();
    try {
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
    } finally { await su.end(); }

    // ---- as postgres: provision as 69df2f52 (the dedicated-Supabase statements) ------------------------------------------------
    const ap = new pg.Client({ connectionString: plane.adminUrl }); await ap.connect();
    try {
      const me = (await ap.query(`select current_user u, ${ATTRS.map((k) => 'r.' + k).join(', ')} from pg_catalog.pg_roles r where r.rolname = current_user`)).rows[0];
      row('P1', me.u === 'postgres' && ATTRS.every((k) => me[k] === OBS.attributes[k]), 'the applying login is postgres: ' + ATTRS.map((k) => k + '=' + me[k]).join(' '));
      const names = git('ls-tree', '--name-only', BASELINE, 'supabase/control-plane/').toString('utf8').trim().split('\n').filter((p) => /\/\d{3}_.*\.sql$/.test(p)).sort();
      for (const p of names) await ap.query(git('show', BASELINE + ':' + p).toString('utf8'));
      const R = 'factory_runner';
      await ap.query(`create role ${R} with login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit password '${frPass}'`);
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
      const fr = (await ap.query(`select m.admin_option a, m.inherit_option i, m.set_option s from pg_catalog.pg_auth_members m
          where m.roleid = 'factory_runner'::regrole and m.member = 'postgres'::regrole`)).rows;
      const live = OBS.member_of.find((m) => m.granted_role === 'factory_runner');
      row('P2', fr.length === 1 && fr[0].a === live.admin_option && fr[0].i === live.inherit_option && fr[0].s === live.set_option,
        'provisioned as 69df2f52 AS postgres; postgres holds factory_runner ' + JSON.stringify(fr) + ' (live ' + live.admin_option + '/' + live.inherit_option + '/' + live.set_option + ')');
      // ---- the baseline rows, unchanged -------------------------------------------------------------------------------------
      if (baselineRows) {
        const rows = JSON.parse(git('show', director + ':qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json').toString('utf8'));
        await ap.query('begin'); await ap.query("set local time zone 'UTC'");
        try {
          for (const t of rows.load_order) if (rows[t].length)
            await ap.query(`insert into factory.${t} select * from jsonb_populate_recordset(null::factory.${t}, $1::jsonb)`, [JSON.stringify(rows[t])]);
          await ap.query('commit');
        } catch (e) { await ap.query('rollback').catch(() => {}); throw e; }
        plane.loaded = Object.fromEntries(rows.load_order.map((t) => [t, rows[t].length]));
        row('P3', true, 'baseline evidence rows loaded unchanged: ' + JSON.stringify(plane.loaded));
      }
    } finally { await ap.end(); }
    return plane;
  } catch (e) {
    await stop();
    throw e;
  }
}

/**
 * Apply the candidate migration AS THE APPLYING LOGIN (postgres), never as a superuser: it refuses a superuser login, and a login
 * whose attributes differ from the observation, before sending anything. mode 'step' (the default when the baseline rows are
 * loaded): the Director instrument's live-migration step; 'verbatim': BEGIN, each file + LF, COMMIT. One simple-Query message.
 * tree: null = the working tree, or a commit whose committed blobs are applied. Throws the server's error (the transaction rolled back).
 */
export async function applyAsApplyingLogin(plane, { tree = null, mode = null } = {}) {
  const OBS = plane.observation || observation(plane.director);
  const files = readMigration(candidateMigrationPaths(tree), tree);
  const m = mode || (plane.loaded ? 'step' : 'verbatim');
  let text, stepSha256 = null;
  if (m === 'step') {
    const b = buildStep(plane.dir, files, plane.director || DIRECTOR);
    if (!b.ok) throw new Error('the Director instrument refused to build the live-migration step: ' + b.out.split('\n').pop());
    text = b.text; stepSha256 = b.sha256;
  } else {
    text = "set client_encoding = 'UTF8';\nset standard_conforming_strings = on;\nbegin;\n" + files.map((f) => f.bytes.toString('utf8') + '\n').join('') + 'commit;\n';
  }
  const c = new pg.Client({ connectionString: plane.adminUrl });
  await c.connect();
  try {
    const me = (await c.query(`select r.rolname, ${ATTRS.map((k) => 'r.' + k).join(', ')} from pg_catalog.pg_roles r where r.rolname = current_user`)).rows[0];
    if (!me || me.rolsuper) throw new Error('REFUSING to apply the migration as a superuser login (' + (me && me.rolname) + '): the live applying login is NOSUPERUSER, and a superuser skips every privilege check the live plane makes');
    const off = ATTRS.filter((k) => me[k] !== OBS.attributes[k]);
    if (me.rolname !== 'postgres' || off.length) throw new Error('REFUSING: the applying login is not postgres aligned to APPLYING_ROLE_OBSERVATION.json (' + me.rolname + '; differs: ' + off.join(',') + ')');
    try { await c.query(text); }
    catch (e) {
      await c.query('rollback').catch(() => {});
      const err = new Error(e.message + (e.where ? ' | where: ' + String(e.where).split('\n')[0] : '') + (e.code ? ' | sqlstate ' + e.code : ''));
      err.code = e.code; throw err;
    }
  } finally { await c.end(); }
  return { mode: m, stepSha256, files: files.map(({ path, sha256 }) => ({ path, sha256 })) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// CLI: the rows M0, M1, P0-P3, S1 (the step applied as postgres) and W1-W6 (the rows the step wrote, §3.5), for the verifier-shaped check of one tree
const isEntry = () => { try { const a = realpathSync(resolve(process.argv[1] || '')), b = realpathSync(fileURLToPath(import.meta.url)); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; } catch { return false; } };
if (isEntry()) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
  const WORKTREE = process.argv.includes('--worktree');
  const TREE = WORKTREE ? null : arg('--tree', 'HEAD');
  const director = arg('--director', DIRECTOR);
  const RAW = process.argv.includes('--raw');
  const results = [];
  const row = (id, ok, detail) => { results.push({ id, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id + ' - ' + detail); };
  let plane = null;
  const label = TREE ? git('rev-parse', TREE).toString('utf8').trim().slice(0, 12) : 'the working tree';
  try {
    const changedBaseline = git('diff', '--name-only', '--diff-filter=MDR', BASELINE, ...(TREE ? [git('rev-parse', TREE).toString('utf8').trim()] : []), '--', 'supabase/control-plane/').toString('utf8').trim();
    row('M0', changedBaseline === '', 'no 69df2f52 control-plane file changed at ' + label + (changedBaseline ? ': ' + changedBaseline : ''));
    const files = readMigration(candidateMigrationPaths(TREE), TREE);
    console.log('candidate migration at ' + label + ': ' + files.length + ' files');
    const probe = mkdtempSync(join(tmpdir(), 'factory-step-probe-'));
    let built;
    try { built = buildStep(probe, files, director); } finally { rmSync(probe, { recursive: true, force: true }); }
    row('M1', built.ok, built.ok ? 'the Director instrument (' + director.slice(0, 8) + ') built the step: sha256 ' + built.sha256 : 'the Director instrument REFUSED: ' + built.out.split('\n').pop());
    plane = await startApplyingRolePlane({ baselineRows: true, director });
    for (const a of plane.alignment) row(a.id, a.ok, a.detail);
    if (built.ok || RAW) {
      const what = built.ok ? 'the live-migration step' : 'the migration verbatim (--raw DIAGNOSIS, not the step)';
      // §3.5 "the rows the migration writes", read before and after the step as this plane's superuser (W1-W6, migration_rows.mjs)
      const { snapshot, rowChecks } = await import('./migration_rows.mjs');
      const c = new pg.Client({ connectionString: plane.superUrl }); await c.connect();
      try {
        const before = await snapshot(c);
        let committed = false;
        try {
          const r = await applyAsApplyingLogin(plane, { tree: TREE, mode: built.ok ? 'step' : 'verbatim' });
          const n = (await c.query(`select count(*)::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'factory' and c.relkind = 'r'`)).rows[0].n;
          row('S1', true, what + ' committed AS postgres (NOSUPERUSER)' + (r.stepSha256 ? ', step sha256 ' + r.stepSha256 : '') + '; tables in schema factory now ' + n);
          committed = true;
        } catch (e) { row('S1', false, what + ' FAILED AS postgres: ' + e.message); }
        if (committed) {
          const after = await snapshot(c, before);
          for (const w of await rowChecks(c, before, after, { operator: 'a1e0f000-0000-4000-8000-000000000001',
            policies: ['a1e0f000-0000-4000-8000-000000000101', 'a1e0f000-0000-4000-8000-000000000102'] })) row(w.id.split(' ')[0], w.ok, w.id.slice(w.id.indexOf(' ') + 1) + (w.detail ? ' - ' + w.detail : ''));
        }
      } finally { await c.end(); }
    } else row('S1', false, 'nothing applied: the step was refused (re-run with --raw to diagnose the migration under this login)');
  } catch (e) {
    row('X0', false, 'applying_role_plane did not complete: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  } finally {
    if (plane) await plane.stop();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`applying_role_plane [${TREE ? 'tree ' + TREE : 'working tree'}, director ${director.slice(0, 8)}]: ${results.length - failed}/${results.length} OK`);
  process.exit(failed ? 1 : 0);
}
