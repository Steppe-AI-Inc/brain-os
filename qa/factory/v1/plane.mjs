// A DISPOSABLE FACTORY V1 PLANE for the implementer's suites, shaped like the r3 judging plane (VERIFICATION_SPEC §3.3, §3.5): the
// migration is applied AS THE APPLYING LOGIN, never as a superuser.
//
//   1. qa/factory/v1/applying_role_plane.mjs starts a scratch PostgreSQL whose bootstrap superuser is `supabase_admin`, aligns
//      `postgres` to APPLYING_ROLE_OBSERVATION.json (NOSUPERUSER, CREATEROLE, ...; factory_runner held with ADMIN only), and
//      provisions it as 69df2f52 AS `postgres` (the 69df2f52 files 001..003 read from git at 69df2f52, and the statements of the
//      provisioner's dedicated-Supabase mode, including the default-privilege grant to factory_runner).
//   2. optionally, BASELINE_69df2f52_EVIDENCE_ROWS.json loaded unchanged (the verifier adds no row and fills no column).
//   2a. the release signer (scripts/factory-control-plane/release_signer.sql), AS `postgres`: part of the plane, before any
//      migration, as the founder's one-time bootstrap makes it on the live plane (signer: false starts a plane without one).
//   3. the candidate migration, AS `postgres` (applyAsApplyingLogin: it refuses a superuser login), in one transaction: the Director
//      instrument's live-migration step when the baseline rows are loaded, else the migration files verbatim.
//   4. the founder's API-login step, emulated AS `postgres` (which administers the two API roles through the ADMIN grant PostgreSQL
//      gives the creator of a role): LOGIN and a password sent as a SCRAM verifier computed client-side, as psql's \password does.
//
// superUrl is the bootstrap superuser, for read-backs and test fixtures only. adminUrl is the applying login. runnerUrl is the legacy
// factory_runner login. It never touches the live plane, the live checkout, runner.env or the live task (S-15): every URL here is
// the scratch server's.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { startApplyingRolePlane, applyAsApplyingLogin, scramVerifier } from './applying_role_plane.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const PROVISION = 'scripts/factory-runner/provision-control-plane.mjs';
const BASELINE_FILES = [PROVISION, 'supabase/control-plane/001_factory_control_plane.sql',
  'supabase/control-plane/002_director_state_machine.sql', 'supabase/control-plane/003_resource_governance.sql'];
export const ROWS_FILE = 'qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json';

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();

/** The 69df2f52 provisioning inputs in this tree are byte-identical to 69df2f52's (the plane itself reads them from git at 69df2f52). */
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

const urlFor = (baseUrl, user, password) => {
  const u = new URL(baseUrl);
  u.username = user; u.password = password;
  return u.toString();
};

export async function connect(url) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

export async function startV1Plane({ migrate = true, baselineRows = false, apiLogins = true, quiet = true, signer = true } = {}) {
  assertBaselineProvisioning();
  const plane = await startApplyingRolePlane({ baselineRows, quiet, signer });
  try {
    Object.assign(plane, { migrated: false, migrationSha256: sha256(compose()) });
    if (migrate) { plane.applied = await applyAsApplyingLogin(plane); plane.migrated = true; }
    if (migrate && apiLogins) await enableApiLogins(plane);
    return plane;
  } catch (e) {
    await plane.stop();
    throw e;
  }
}

/** The founder's API-login step (FOUNDER_PREPARED_STEPS §2), emulated AS the applying login: LOGIN, and a password sent only as a
 * SCRAM verifier computed here (psql's \password). PUBLIC holds CONNECT on the database, as on the live plane. */
export async function enableApiLogins(plane) {
  const c = await connect(plane.adminUrl);
  try {
    for (const role of ['factory_node_api', 'factory_admin_api']) {
      const pw = randomBytes(18).toString('base64url');
      await c.query(`alter role ${role} with login`);
      await c.query(`alter role ${role} with password '${scramVerifier(pw)}'`);
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
