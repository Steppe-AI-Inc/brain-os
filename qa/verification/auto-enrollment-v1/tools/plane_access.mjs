// Director instrument helper (READ-ONLY). Used by baseline_manifest.mjs and live_catalog_snapshot.mjs. It:
//   1. accepts exactly one explicit credential, and a declared FACTORY_TARGET that must match it:
//        FACTORY_OBSERVER_ENV=<env file>        the founder-provisioned SELECT-only observer role    -> FACTORY_TARGET=live
//        FACTORY_DIRECTOR_INTERIM_RUNNER_ENV=1  the Director's interim, runner.env read-only,
//                                               candidate stage only                                 -> FACTORY_TARGET=live
//        FACTORY_RUNNER_PG_URL=<url>            a disposable plane (non-superuser login)             -> FACTORY_TARGET=disposable
//   2. loads the database modules from ROOT only after checking them against sha256 constants of the 69df2f52 blobs, and checking
//      that ROOT's package-lock is the 69df2f52 one and every installed package on pg's dependency path has its 69df2f52 version.
//      This keeps candidate code out of the instrument's own modules. It does not hash installed package files (a recorded limit).
//   3. runs every read on ONE session inside `begin transaction isolation level repeatable read read only`, with search_path,
//      TimeZone and IntervalStyle set locally (search_path = pg_catalog), so a role or database setting cannot redirect a catalog
//      name to a look-alike object, and any write that a read might trigger fails;
//   4. observes, never asserts, what it reached (current_user, database, server version, factory.plane_identity, a sha256 of the
//      server address, the session settings) and checks the target both ways: a live read must reach the live Factory plane, and a
//      disposable read must not.
// It never prints or stores a URL or a password.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
export const LIVE_REF = 'npvhuoozkbexddnvkqsj';
// sha256 of each 69df2f52 blob, LF-normalized
const PINNED = {
  'scripts/factory-runner/db.mjs': 'c2c3696427e54d50e573f3da15d8da695e49360c8f474cb38a32d91d3be9ef3f',
  'scripts/factory-runner/runner-env.mjs': 'a852194ade0c65896b6d2a99d9a9831c744a2a5cdf81c0abe4e7dccce569b152',
  'scripts/factory-runner/url-judge.mjs': '4eaed32d5730b8f3bd0460690ce06743be1f15362b03d9e3b0f8cf824a818d8b',
  'package-lock.json': 'e216195236979194bbad2ae23813a80a824e2b3dced77a435d11d731eee942d1',
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lf = (b) => Buffer.from(b.toString('utf8').split('\r\n').join('\n'), 'utf8');
const refuse = (m) => { console.log('refused: ' + m); process.exit(2); };

export async function openPlane(ROOT) {
  const set = ['FACTORY_OBSERVER_ENV', 'FACTORY_RUNNER_PG_URL', 'FACTORY_DIRECTOR_INTERIM_RUNNER_ENV'].filter((k) => process.env[k]);
  if (set.length !== 1) refuse('set exactly one of FACTORY_OBSERVER_ENV, FACTORY_RUNNER_PG_URL, FACTORY_DIRECTOR_INTERIM_RUNNER_ENV=1 (found: ' + (set.join(', ') || 'none') + ')');
  const mode = { FACTORY_OBSERVER_ENV: 'observer', FACTORY_RUNNER_PG_URL: 'disposable', FACTORY_DIRECTOR_INTERIM_RUNNER_ENV: 'interim' }[set[0]];
  if (mode === 'interim' && process.env.FACTORY_DIRECTOR_INTERIM_RUNNER_ENV !== '1') refuse('FACTORY_DIRECTOR_INTERIM_RUNNER_ENV must be 1');
  const want = mode === 'disposable' ? 'disposable' : 'live';
  if (process.env.FACTORY_TARGET !== want) refuse('FACTORY_TARGET must be ' + want + ' for this credential (got ' + (process.env.FACTORY_TARGET || 'unset') + ')');

  const pinned = [];
  let rootHead;
  try {
    for (const [m, want256] of Object.entries(PINNED)) {
      if (sha(lf(readFileSync(join(ROOT, m)))) !== want256) refuse(m + ' under ROOT is not the ' + BASELINE + ' file');
      pinned.push({ file: m, sha256: want256 });
    }
    for (const d of ['scripts/node_modules', 'scripts/factory-runner/node_modules']) if (existsSync(join(ROOT, d))) refuse(d + ' exists under ROOT (it would shadow the pinned packages)');
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).packages;
    const seen = new Set();
    const walk = (n) => { const k = 'node_modules/' + n; if (seen.has(k) || !lock[k]) return; seen.add(k); for (const d of Object.keys(lock[k].dependencies || {})) walk(d); };
    walk('pg');
    for (const k of seen) {
      const installed = JSON.parse(readFileSync(join(ROOT, k, 'package.json'), 'utf8')).version;
      if (installed !== lock[k].version) refuse(k + ' under ROOT is ' + installed + ', not the ' + BASELINE + ' version ' + lock[k].version);
      pinned.push({ file: k, version: installed });
    }
    rootHead = execFileSync('git', ['--no-replace-objects', '-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    refuse('ROOT ' + ROOT + ' cannot be proven to carry the ' + BASELINE + ' database modules and packages (' + String(e.code || e.message).split('\n')[0] + ')');
  }

  const { loadRunnerUrl, ensureRunnerEnv } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/runner-env.mjs')).href);
  if (mode === 'observer') {
    const r = loadRunnerUrl(process.env.FACTORY_OBSERVER_ENV);
    if (!r.usable) refuse('observer env not usable: ' + r.note);
    process.env.FACTORY_RUNNER_PG_URL = r.url;
  } else if (mode === 'interim') ensureRunnerEnv();
  const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);

  // one read-only, repeatable-read session with pinned settings; fn receives q(sql, params) -> rows
  const session = (fn) => db.withClient(async (c) => {
    await c.query('begin transaction isolation level repeatable read read only');
    try {
      await c.query('set local search_path = pg_catalog');
      await c.query("set local timezone = 'UTC'");
      await c.query("set local intervalstyle = 'iso_8601'");
      const s = (await c.query(`select pg_catalog.current_setting('transaction_read_only') ro, pg_catalog.current_setting('search_path') sp,
        pg_catalog.current_setting('TimeZone') tz`)).rows[0];
      if (s.ro !== 'on' || s.sp !== 'pg_catalog' || s.tz !== 'UTC') refuse('session settings not pinned: ' + JSON.stringify(s));
      return await fn(async (sql, p) => (await c.query(sql, p || [])).rows, s);
    } finally { await c.query('rollback'); }
  });

  const observed = await session(async (q, s) => {
    const who = (await q(`select current_user cu, session_user su, current_database() dbname, current_setting('server_version') ver,
      coalesce(host(inet_server_addr()), 'local') || ':' || coalesce(inet_server_port()::text, '') srv`))[0];
    const hasPI = (await q(`select to_regclass('factory.plane_identity') is not null ok`))[0].ok;
    const pi = hasPI ? await q(`select project_ref, note from factory.plane_identity order by provisioned_at`) : 'none';
    return {
      mode, target: want, current_user: who.cu, session_user: who.su, database: who.dbname, server_version: who.ver,
      server_address_sha256: sha(who.srv), plane_identity: pi, session: { transaction_read_only: s.ro, search_path: s.sp, timezone: s.tz },
      root_head: rootHead, pinned,
    };
  });
  const refs = Array.isArray(observed.plane_identity) ? observed.plane_identity.map((p) => p.project_ref) : [];
  let liveAddr = null;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    liveAddr = JSON.parse(readFileSync(join(here, '..', 'LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json'), 'utf8')).observed.server_address_sha256;
  } catch { /* no committed referent yet */ }
  if (want === 'live' && !refs.includes(LIVE_REF)) refuse('FACTORY_TARGET=live but the plane reports ' + JSON.stringify(refs));
  if (want === 'disposable' && (refs.includes(LIVE_REF) || (liveAddr && observed.server_address_sha256 === liveAddr))) refuse('FACTORY_TARGET=disposable but this is the live Factory plane');
  return { db, mode, target: want, observed, session };
}
