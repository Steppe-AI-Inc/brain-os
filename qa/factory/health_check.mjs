#!/usr/bin/env node
// Prove `node.mjs health` on a real control plane — healthy, and each way it can be BROKEN.
//
// A health check that has only ever been run against a working system is not a health check; it is a
// greeting. The value is entirely in what it says when something is wrong, so each failure mode is created
// deliberately here and the output is checked for naming the right one.
import { startLocalPg } from './local_pg.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const NODE_MJS = join(ROOT, 'scripts', 'factory-runner', 'node.mjs');

let pass = 0;
const failures = [];
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + label); }
  else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + detail : '')); }
};

const run = (url) => {
  const env = { ...process.env };
  if (url === null) delete env.FACTORY_RUNNER_PG_URL; else env.FACTORY_RUNNER_PG_URL = url;
  const r = spawnSync(process.execPath, [NODE_MJS, 'health'],
    { encoding: 'utf8', env, cwd: ROOT, timeout: 90000 });
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
};

const pg = await startLocalPg();
const { default: pgLib } = await import('pg');
const admin = new pgLib.Client({ connectionString: pg.superUrl });
await admin.connect();

try {
  // ---- the schema is NOT yet applied: health must say so, and say which file fixes it ----------------
  await admin.query('grant usage on schema public to ' + pg.runnerRole);
  const before = run(pg.runnerUrl);
  check('before the schema is applied, health names the missing schema and the file that fixes it',
    /factory schema/i.test(before.out) && /001_factory_control_plane/.test(before.out) && before.code === 1,
    before.out.trim().slice(-300));

  // ---- apply it, grant, and expect a clean bill -------------------------------------------------------
  await admin.query(readFileSync(join(ROOT, 'supabase/control-plane/001_factory_control_plane.sql'), 'utf8'));
  await admin.query('grant usage on schema factory to ' + pg.runnerRole);
  await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);

  const healthy = run(pg.runnerUrl);
  check('with the schema applied and privileges granted, the node reports HEALTHY',
    /HEALTHY — this node can claim work\./.test(healthy.out) && healthy.code === 0,
    healthy.out.trim().slice(-400));
  check('it reports each link separately: connection, superuser status, schema, queue, registration',
    /connected as/.test(healthy.out) && /NOT a superuser/.test(healthy.out)
    && /factory schema is present/.test(healthy.out) && /can read the queue/.test(healthy.out)
    && /registered itself/.test(healthy.out), healthy.out.trim().slice(-400));

  // ---- IT MUST NOT PRINT THE CREDENTIAL ---------------------------------------------------------------
  // The password is generated per run, so this is a real test and not a search for a fixed string.
  const secret = decodeURIComponent(new URL(pg.runnerUrl).password);
  check('it NEVER prints the password, and never prints the connection string',
    !healthy.out.includes(secret) && !healthy.out.includes(pg.runnerUrl),
    'a health command that echoes its credential leaves one in a scrollback buffer');
  check('...but it does print enough to identify the connection: host, database, sslmode',
    /host\s+127\.0\.0\.1/.test(healthy.out) && /db\s+factory_control_plane/.test(healthy.out)
    && /sslmode/.test(healthy.out), healthy.out.trim().slice(0, 300));

  // ---- a superuser URL is refused BEFORE connecting ---------------------------------------------------
  const su = run(pg.superUrl);
  check('a superuser URL is refused, and the refusal explains why rather than just failing',
    /superuser/i.test(su.out) && su.code === 1, su.out.trim().slice(-260));

  // ---- privileges revoked: health must blame the grant, not the schema --------------------------------
  await admin.query('revoke select on all tables in schema factory from ' + pg.runnerRole);
  const noSelect = run(pg.runnerUrl);
  check('with SELECT revoked, health fails and names permission rather than reporting a healthy node',
    noSelect.code === 1 && /permission denied|cannot read/i.test(noSelect.out),
    noSelect.out.trim().slice(-260));
  await admin.query('grant select on all tables in schema factory to ' + pg.runnerRole);

  // ---- an unreachable host: the message must be about connecting ---------------------------------------
  const dead = run('postgresql://factory_runner:x@127.0.0.1:1/none?sslmode=require');
  check('an unreachable database reports a CONNECTION failure, not a schema one',
    dead.code === 1 && /cannot connect/i.test(dead.out), dead.out.trim().slice(-200));

  // ---- TLS: advisory on loopback, FATAL on a remote host ----------------------------------------------
  //
  // The first version of this only tested the loopback path — which is the one case where TLS does not
  // matter. The case that matters is a shared control plane reached over a network with no TLS, and that
  // must be a hard failure rather than one warning among several.
  const noTlsLocal = run(pg.runnerUrl.replace(/\?.*$/, ''));
  check('on LOOPBACK, a missing sslmode is noted but does not fail the node',
    /loopback connection/.test(noTlsLocal.out) && noTlsLocal.code === 0,
    noTlsLocal.out.trim().slice(-300));

  // A remote host that will not resolve: the TLS row must still fail FIRST, because it is a property of
  // the URL and is knowable without connecting.
  const remoteNoTls = run('postgresql://factory_runner:x@db.example.invalid:5432/cp');
  check('on a REMOTE host, a missing sslmode is a hard failure',
    /TLS is requested for a REMOTE host/.test(remoteNoTls.out) && remoteNoTls.code === 1,
    remoteNoTls.out.trim().slice(-300));
} finally {
  try { await admin.end(); } catch { /* ignore */ }
  await pg.stop();
}

console.log('');
console.log('health_check: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }
