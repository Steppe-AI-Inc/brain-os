#!/usr/bin/env node
// A DISPOSABLE, REAL POSTGRESQL FOR FACTORY ACCEPTANCE.
//
// The lease and claiming tests are about `select ... for update skip locked`, transaction visibility and
// two clients racing. None of that can be proved against an in-process shim: PGlite is a real Postgres
// compiled to WASM but is single-connection, and a fake that always grants the lock would pass every test
// this suite exists to fail. So this starts an actual PostgreSQL server on a scratch data directory, on a
// port nobody else is using, and tears it down afterwards.
//
// It is DISPOSABLE and NON-PRODUCTION by construction: a fresh initdb in a temp directory, a random
// superuser password that exists only in this process, and a data directory removed on exit. Nothing here
// touches, reads, or can reach a production database.
//
// NOTE ON THE SUPERUSER. initdb creates one, and db.mjs REFUSES to connect as `postgres` — correctly, since
// "a least-privilege accessor pointed at a superuser is not least privilege". So the harness uses the
// superuser once, to create the schema and a least-privilege role, and hands the runner a URL for THAT
// role. The acceptance tests therefore exercise the same refusal surface the shared control plane will.
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const RUNNER_ROLE = 'factory_runner';
const RUNNER_PASSWORD = 'factory_local_' + Math.random().toString(36).slice(2, 10);

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function startLocalPg({ quiet = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-pg-'));
  const port = await freePort();
  const superPassword = 'super_' + Math.random().toString(36).slice(2, 12);

  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'),
    user: 'postgres',
    password: superPassword,
    port,
    persistent: false,
    onLog: quiet ? () => {} : (m) => process.stderr.write(String(m)),
    onError: quiet ? () => {} : (m) => process.stderr.write(String(m)),
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('factory_control_plane');

  const superUrl = 'postgresql://postgres:' + encodeURIComponent(superPassword)
    + '@127.0.0.1:' + port + '/factory_control_plane';

  // The least-privilege role the runner will actually use. Creating a role is DDL, which db.mjs refuses
  // by design — so it is done here, with the superuser, exactly as a founder would do it once against the
  // shared control plane. The runner never holds this authority.
  const { default: pgLib } = await import('pg');
  const admin = new pgLib.Client({ connectionString: superUrl });
  await admin.connect();
  await admin.query('create role ' + RUNNER_ROLE + " login password '" + RUNNER_PASSWORD + "'");
  await admin.query('grant connect on database factory_control_plane to ' + RUNNER_ROLE);
  await admin.query('grant usage on schema public to ' + RUNNER_ROLE);
  await admin.end();

  const runnerUrl = 'postgresql://' + RUNNER_ROLE + ':' + encodeURIComponent(RUNNER_PASSWORD)
    + '@127.0.0.1:' + port + '/factory_control_plane';

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try { await pg.stop(); } catch { /* already down */ }
    try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
  };
  process.once('exit', () => { if (!stopped) { try { pg.stopSync?.(); } catch { /* best effort */ } } });

  return { port, dir, superUrl, runnerUrl, runnerRole: RUNNER_ROLE, admin: superUrl, stop };
}

// `node local_pg.mjs` starts one and prints its URLs, for manual poking.
if (process.argv[1] && process.argv[1].endsWith('local_pg.mjs')) {
  const pg = await startLocalPg({ quiet: false });
  console.log('port        ' + pg.port);
  console.log('super       ' + pg.superUrl);
  console.log('runner      ' + pg.runnerUrl);
  console.log('');
  console.log('Ctrl-C to stop; the data directory is removed on exit.');
  process.on('SIGINT', async () => { await pg.stop(); process.exit(0); });
}
