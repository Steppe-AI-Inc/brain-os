// A DISPOSABLE FACTORY V1 PLANE for the implementer's suites: a fresh PostgreSQL, provisioned AS 69df2f52 provisions it, then the
// candidate migration - the same order VERIFICATION_SPEC §3 (5) prescribes.
//
//   1. qa/factory/local_pg.mjs starts a scratch server (its data directory is removed on stop).
//   2. scripts/factory-runner/provision-control-plane.mjs --admin <superuser> - the 69df2f52 provisioning, applying 001-003 and
//      granting factory_runner its 69df2f52 privileges, including the default-privilege grant. Both it and 001-003 are asserted
//      byte-identical to 69df2f52 before they run.
//   3. optionally, BASELINE_69df2f52_EVIDENCE_ROWS.json loaded unchanged (the verifier adds no row and fills no column).
//   4. the candidate migration (scripts/factory-control-plane/migration.mjs), in one transaction.
//   5. the founder's API-login step, emulated: LOGIN and a random password on factory_node_api / factory_admin_api.
//
// It never touches the live plane, the live checkout, runner.env or the live task (S-15): every URL here is the scratch server's.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalPg } from '../local_pg.mjs';
import { apply, compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const PROVISION = 'scripts/factory-runner/provision-control-plane.mjs';
const BASELINE_FILES = [PROVISION, 'supabase/control-plane/001_factory_control_plane.sql',
  'supabase/control-plane/002_director_state_machine.sql', 'supabase/control-plane/003_resource_governance.sql'];
export const ROWS_FILE = 'qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json';

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();

/** The 69df2f52 provisioning inputs in this tree are byte-identical to 69df2f52's (else the plane would not be "as 69df2f52"). */
export function assertBaselineProvisioning() {
  for (const f of BASELINE_FILES) {
    const want = git('rev-parse', BASELINE + ':' + f);
    const have = git('hash-object', f);
    if (want !== have) throw new Error(f + ' is not byte-identical to ' + BASELINE.slice(0, 8) + ' (' + have + ' != ' + want + ')');
  }
  // and no top-level control-plane file was added: the 69df2f52 provisioning applies every top-level NNN_*.sql
  const top = git('ls-files', 'supabase/control-plane').split('\n').filter((f) => /^supabase\/control-plane\/[^/]+\.sql$/.test(f));
  const base = git('ls-tree', '--name-only', BASELINE, 'supabase/control-plane/').split('\n').filter((f) => /\.sql$/.test(f));
  if (top.join('|') !== base.join('|')) throw new Error('top-level control-plane SQL differs from 69df2f52: ' + top.join(', '));
}

const urlFor = (superUrl, user, password) => {
  const u = new URL(superUrl);
  u.username = user; u.password = password;
  return u.toString();
};

export async function connect(url) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Load the Director's baseline rows unchanged, in their load order (VERIFICATION_SPEC §3 (3)). */
export async function loadBaselineRows(superUrl) {
  const rows = JSON.parse(readFileSync(join(ROOT, ROWS_FILE), 'utf8'));
  const c = await connect(superUrl);
  try {
    await c.query('begin');
    await c.query("set local time zone 'UTC'");
    for (const t of rows.load_order) {
      if (!rows[t].length) continue;
      await c.query(`insert into factory.${t} select * from jsonb_populate_recordset(null::factory.${t}, $1::jsonb)`, [JSON.stringify(rows[t])]);
    }
    await c.query('commit');
  } catch (e) { try { await c.query('rollback'); } catch { /* ended */ } throw e; } finally { await c.end(); }
  return Object.fromEntries(rows.load_order.map((t) => [t, rows[t].length]));
}

export async function startV1Plane({ migrate = true, baselineRows = false, apiLogins = true, quiet = true } = {}) {
  assertBaselineProvisioning();
  const pg = await startLocalPg({ quiet });
  try {
    const r = spawnSync(process.execPath, [join(ROOT, PROVISION), '--admin', pg.superUrl], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
    const m = /FACTORY_RUNNER_PG_URL=(\S+)/.exec(r.stdout || '');
    if (r.status !== 0 || !m) throw new Error('69df2f52 provisioning failed: ' + (r.stdout || '') + (r.stderr || ''));
    const plane = { ...pg, runnerUrl: m[1], migrated: false, loaded: null, migrationSha256: sha256(compose()) };
    if (baselineRows) plane.loaded = await loadBaselineRows(pg.superUrl);
    if (migrate) { await apply(pg.superUrl); plane.migrated = true; }
    if (migrate && apiLogins) await enableApiLogins(plane);
    return plane;
  } catch (e) {
    await pg.stop();
    throw e;
  }
}

/** The founder's API-login step, emulated on a disposable plane: LOGIN and a random password on the two API roles. */
export async function enableApiLogins(plane) {
  const c = await connect(plane.superUrl);
  try {
    for (const role of ['factory_node_api', 'factory_admin_api']) {
      const pw = randomBytes(18).toString('base64url');
      await c.query(`alter role ${role} with login password '${pw}'`);
      await c.query(`grant connect on database factory_control_plane to ${role}`);
      plane[role === 'factory_node_api' ? 'nodeApiUrl' : 'adminApiUrl'] = urlFor(plane.superUrl, role, pw);
    }
  } finally { await c.end(); }
  return plane;
}

/** Run fn(client) as `url`, returning its result or the error ({ error, code, message }) - never throwing a database refusal. */
export async function as(url, fn) {
  const c = await connect(url);
  try { return await fn(c); } finally { await c.end(); }
}

export async function tryQuery(c, sql, params) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { return { ok: false, code: e.code, message: String(e.message) }; }
}
