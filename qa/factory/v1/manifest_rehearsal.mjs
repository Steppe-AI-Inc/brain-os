#!/usr/bin/env node
// AC-11 REHEARSAL WITH THE DIRECTOR'S OWN INSTRUMENTS (VERIFICATION_SPEC §3 (3), §3.5), as the implementer's developer evidence, on the
// applying-role plane (applying_role_plane.mjs: bootstrap superuser `supabase_admin`, the migration applied AS `postgres`, never as a
// superuser):
//   1. a disposable plane provisioned as 69df2f52 AS the applying login, BASELINE_69df2f52_EVIDENCE_ROWS.json loaded unchanged;
//   2. qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs run with FACTORY_TARGET=disposable, the plane's non-superuser
//      factory_runner URL, and FACTORY_BASELINE_CHECKOUT = a 69df2f52 checkout (never the candidate tree, never the live checkout):
//      here a sparse clone in the temp directory, sharing this repository's objects read-only, with the 69df2f52 package-lock and
//      the same installed pg versions (the tool verifies both);
//   3. tools/live_catalog_snapshot.mjs as a READER: a non-superuser login the bootstrap superuser creates under a random name, granted
//      USAGE on schema factory and SELECT on the factory relations that exist then, and nothing else (§3.5);
//   4. the live-migration step (the Director instrument's) AS `postgres`; 5. both tools again.
// Rows: R1 the manifest set hashes equal the manifest before AND after; CD1..CD4 the catalog difference (after minus before) equals
// qa/implementation/auto-enrollment-v1/predicted_catalog_difference.json in the sections the privilege model decides, and no row of
// the difference names the reader; CD5 the relations and columns sections lose nothing (the step only adds).
// usage: node qa/factory/v1/manifest_rehearsal.mjs [--evidence <file>]
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, BASELINE, startV1Plane, connect } from './plane.mjs';
import { applyAsApplyingLogin } from './applying_role_plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';

const TOOLS = join(ROOT, 'qa/verification/auto-enrollment-v1/tools');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json'), 'utf8'));
const PREDICTED = JSON.parse(readFileSync(join(ROOT, 'qa/implementation/auto-enrollment-v1/predicted_catalog_difference.json'), 'utf8'));
const B69 = join(tmpdir(), 'factory-v1-baseline-69df2f52');
const g = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function baselineCheckout() {
  if (!existsSync(join(B69, '.git'))) {
    mkdirSync(B69, { recursive: true });
    g('clone', '--quiet', '--shared', '--no-checkout', ROOT, B69);
    g('-C', B69, 'sparse-checkout', 'set', '--no-cone', '/scripts/factory-runner/', '/package.json', '/package-lock.json');
  }
  g('-C', B69, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', BASELINE);
  if (g('-C', B69, 'rev-parse', 'HEAD') !== BASELINE) throw new Error('the baseline checkout is not at ' + BASELINE);
  if (!existsSync(join(B69, 'node_modules'))) {
    // the 69df2f52 package-lock pins pg; this tree's installed pg is the same version (the instrument refuses otherwise)
    const r = spawnSync('cmd', ['/c', 'mklink', '/J', join(B69, 'node_modules'), join(ROOT, 'node_modules')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('could not link node_modules: ' + r.stdout + r.stderr);
  }
  return B69;
}

const toolEnv = (url) => {
  const env = { ...process.env, FACTORY_TARGET: 'disposable', FACTORY_RUNNER_PG_URL: url, FACTORY_BASELINE_CHECKOUT: B69 };
  for (const k of Object.keys(env)) if (/^PG/i.test(k) || ['FACTORY_OBSERVER_ENV', 'FACTORY_DIRECTOR_INTERIM_RUNNER_ENV', 'FACTORY_BASELINE_ROWS_OUT', 'FACTORY_RUNNER_ENV_FILE'].includes(k)) delete env[k];
  return env;
};
const runManifest = (runnerUrl, out) => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'baseline_manifest.mjs'), out], { encoding: 'utf8', env: toolEnv(runnerUrl), cwd: ROOT, timeout: 120000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const m = (name) => (new RegExp('set_sha256 ' + name + ' ([0-9a-f]{64})').exec(text) || [])[1];
  return { status: r.status, text, set: { agent_runs: m('agent_runs'), work_orders: m('work_orders'), checkpoints: m('checkpoints') },
    observed: (/observed: .*/.exec(text) || [''])[0] };
};
const runSnapshot = (readerUrl, out) => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'live_catalog_snapshot.mjs'), out], { encoding: 'utf8', env: toolEnv(readerUrl), cwd: ROOT, timeout: 180000 });
  const text = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, text, snap: r.status === 0 && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null };
};
const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v));
const diff = (a, b) => { const A = new Set(a.map(canon)), B = new Set(b.map(canon)); return { added: b.filter((x) => !A.has(canon(x))), removed: a.filter((x) => !B.has(canon(x))) }; };
const sameSet = (x, y) => canon([...x].map(canon).sort()) === canon([...y].map(canon).sort());

const lines = [];
const results = [];
const say = (s) => { lines.push(s); console.log(s); };
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); say((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + detail : '')); };
baselineCheckout();
say('baseline checkout: ' + B69 + ' at ' + g('-C', B69, 'rev-parse', 'HEAD') + ' (sparse: scripts/factory-runner, package.json, package-lock.json)');
const plane = await startV1Plane({ migrate: false, baselineRows: true });
try {
  say('plane: disposable, provisioned as 69df2f52 AS the applying login postgres; rows loaded ' + JSON.stringify(plane.loaded));
  const out = (n) => join(plane.dir, n);
  // the reader (§3.5): created by the bootstrap superuser under a name nothing else uses; USAGE and SELECT on what exists now, nothing more
  const reader = 'qa_reader_' + randomBytes(5).toString('hex');
  const readerPw = randomBytes(18).toString('hex');
  const su = await connect(plane.superUrl);
  try {
    await su.query(`create role ${reader} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit password '${readerPw}'`);
    await su.query(`grant usage on schema factory to ${reader}`);
    await su.query(`grant select on all tables in schema factory to ${reader}`);
    await su.query(`grant select on all sequences in schema factory to ${reader}`);
  } finally { await su.end(); }
  const readerUrl = new URL(plane.runnerUrl); readerUrl.username = reader; readerUrl.password = readerPw;

  const pre = runManifest(plane.runnerUrl, out('manifest-before.json'));
  say('baseline_manifest BEFORE the migration: exit ' + pre.status + ' ' + JSON.stringify(pre.set));
  say('  ' + pre.observed);
  const snapBefore = runSnapshot(readerUrl.toString(), out('catalog-before.json'));
  say('live_catalog_snapshot BEFORE (as the reader): exit ' + snapBefore.status + ' ' + (snapBefore.snap ? snapBefore.snap.snapshot_sha256 : snapBefore.text.trim().split('\n').pop()));
  const r = await applyAsApplyingLogin(plane);
  say('candidate migration applied AS postgres as the ' + r.mode + ': step sha256 ' + r.stepSha256);
  const post = runManifest(plane.runnerUrl, out('manifest-after.json'));
  say('baseline_manifest AFTER the migration:  exit ' + post.status + ' ' + JSON.stringify(post.set));
  say('  ' + post.observed);
  const snapAfter = runSnapshot(readerUrl.toString(), out('catalog-after.json'));
  say('live_catalog_snapshot AFTER (as the reader):  exit ' + snapAfter.status + ' ' + (snapAfter.snap ? snapAfter.snap.snapshot_sha256 : snapAfter.text.trim().split('\n').pop()));

  const eq = (s) => s.agent_runs === MANIFEST.set_sha256.agent_runs && s.work_orders === MANIFEST.set_sha256.work_orders && s.checkpoints === MANIFEST.set_sha256.checkpoints;
  say('manifest set_sha256: ' + JSON.stringify(MANIFEST.set_sha256));
  row('R1 AC-11 rehearsal: the Director instrument\'s set hashes equal the manifest before AND after the live-migration step applied AS the applying login',
    pre.status === 0 && post.status === 0 && eq(pre.set) && eq(post.set) && /disposable/.test(post.observed));
  if (!(pre.status === 0 && post.status === 0)) { console.log(pre.text); console.log(post.text); }

  // ---- the catalog difference (after minus before), read with the Director's tool as the reader
  const B = snapBefore.snap, A = snapAfter.snap;
  if (!B || !A) { row('CD0 the Director snapshot tool read the plane before and after, as the reader', false, (B ? '' : snapBefore.text) + (A ? '' : snapAfter.text)); }
  else {
    const d = Object.fromEntries(B.hashed_sections.map((k) => [k, Array.isArray(B[k]) ? diff(B[k], A[k]) : { changed: canon(B[k]) !== canon(A[k]) }]));
    say('difference per section: ' + B.hashed_sections.map((k) => k + (d[k].changed !== undefined ? (d[k].changed ? ' changed' : ' =') : ' +' + d[k].added.length + '/-' + d[k].removed.length)).join(', '));
    const P = PREDICTED.sections;
    const exact = ['role_memberships', 'default_acl', 'roles', 'schema_acl', 'database_acl', 'role_database_settings', 'column_acl', 'extensions', 'event_triggers'];
    const off = exact.filter((k) => !(sameSet(d[k].added, P[k].added) && sameSet(d[k].removed, P[k].removed)));
    row('CD1 role_memberships: after minus before is exactly the predicted four rows (PostgreSQL\'s creator grants; SET without INHERIT on factory_owner), nothing removed',
      sameSet(d.role_memberships.added, P.role_memberships.added) && d.role_memberships.removed.length === 0, JSON.stringify(d.role_memberships));
    row('CD2 default_acl, roles, schema_acl, database_acl, role settings, column_acl, extensions, event triggers: the difference is exactly predicted_catalog_difference.json',
      off.length === 0, off.map((k) => k + ' ' + JSON.stringify(d[k])).join(' | ') || 'default_acl ' + JSON.stringify(d.default_acl));
    const BASE8 = ['agent_runs', 'checkpoints', 'director_lease', 'founder_notifications', 'nodes', 'surface_locks', 'work_order_dependencies', 'work_orders'];
    const newRels = new Set(A.relations.filter((x) => !B.relations.includes(x)).map((x) => x.split(':')[0]));
    const tAdd = d.table_acl.added, tBadNew = tAdd.filter((t) => newRels.has(t.sch + '.' + t.tbl) && t.grantee !== 'factory_owner');
    const tBase = tAdd.filter((t) => BASE8.includes(t.tbl) && t.sch === 'factory');
    const tOther = tAdd.filter((t) => !newRels.has(t.sch + '.' + t.tbl) && !(BASE8.includes(t.tbl) && t.sch === 'factory'));
    const fBad = d.function_acl.added.filter((f) => !(f.grantee === 'factory_owner' || (f.grantee === 'factory_node_api' && /^node_/.test(f.fn)) || (f.grantee === 'factory_admin_api' && /^admin_/.test(f.fn))));
    row('CD3 table_acl / function_acl: the 69df2f52 tables gain exactly factory_owner SELECT/INSERT/UPDATE/DELETE/REFERENCES; every new relation and function lists only its owner (and each front door its one API role); nothing removed',
      tBase.length === 40 && tBase.every((t) => t.grantee === 'factory_owner' && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES'].includes(t.priv))
        && tBadNew.length === 0 && tOther.length === 0 && d.table_acl.removed.length === 0 && fBad.length === 0 && d.function_acl.removed.length === 0,
      'base ' + tBase.length + ', new-relation rows not the owner ' + JSON.stringify(tBadNew.slice(0, 4)) + ', other ' + JSON.stringify(tOther.slice(0, 4)) + ', function rows ' + JSON.stringify(fBad.slice(0, 4)));
    const namesReader = B.hashed_sections.filter((k) => Array.isArray(B[k]) && [...d[k].added, ...d[k].removed].some((x) => JSON.stringify(x).includes(reader)));
    row('CD4 no row of the difference names the reader (§3.5), and the reader stayed unable to read the relations the migration adds',
      namesReader.length === 0 && [...newRels].every((rel) => !A.table_acl.some((t) => t.sch + '.' + t.tbl === rel && t.grantee === reader)), namesReader.join(','));
    // CD5 the step takes nothing away from the plane: every relation and every column the plane had before it is still there, with the
    // same type and default (the snapshot's row for it is unchanged). A column retyped in a way that keeps every value, or dropped from
    // an empty table, shows here although no row reads its data back
    row('CD5 relations and columns: after minus before removes nothing - every relation and column of the plane before the step is still there with the same type and default; the step only adds',
      d.relations.removed.length === 0 && d.columns.removed.length === 0 && d.relations.added.length > 0 && d.columns.added.length > 0,
      'relations +' + d.relations.added.length + '/-' + d.relations.removed.length + ', columns +' + d.columns.added.length + '/-' + d.columns.removed.length
        + (d.relations.removed.length + d.columns.removed.length ? ' removed ' + JSON.stringify([...d.relations.removed, ...d.columns.removed].slice(0, 6)) : ''));
  }
  const ev = process.argv.indexOf('--evidence');
  const ok = results.every((x) => x.ok);
  if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/manifest_rehearsal.mjs', 'migration sha256 ' + sha256(compose()), ...lines,
    results.filter((x) => x.ok).length + '/' + results.length + ' OK'].join('\n') + '\n');
  say('manifest_rehearsal: ' + results.filter((x) => x.ok).length + '/' + results.length + ' OK');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  row('X0 manifest_rehearsal did not complete', false, (e && e.stack) || String(e));
  process.exitCode = 1;
} finally {
  await plane.stop();
}
// An explicit exit code: embedded-postgres registers async-exit-hook, which ends a process that finishes on its own with
// process.exit(0) at 'beforeExit', whatever process.exitCode says - a failed row would otherwise leave this suite with exit 0.
process.exit(results.length > 0 && results.every((x) => x.ok) ? 0 : 1);
