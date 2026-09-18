#!/usr/bin/env node
// THE BRAIN-OS DATABASE HARNESSES ON A DISPOSABLE REAL POSTGRESQL 18.
//
// `qa/dbtest/db.mjs` in the product repo has two engines and one evidence ladder: PGlite (in-process,
// superuser) may say INTEGRATION VERIFIED and never SECURITY VERIFIED; only a real PostgreSQL server,
// after the harness's own role self-check, may say SECURITY VERIFIED, and only a real server has the two
// connections the concurrency row needs. The CI service container was the only such server until now.
// This script gives the same harnesses the factory's own throwaway server (`local_pg.mjs`: a fresh
// initdb in a temp directory, removed on exit) so the security layer can be measured on this machine
// with nothing reaching any production host.
//
// TWO THINGS THE FIRST RUN TAUGHT, kept here so they are not re-learned:
//   * the database is created with ENCODING 'UTF8' from template0. A Windows initdb defaults the cluster
//     to WIN1252, in which the drafts' box-drawing comment characters (U+2500) do not exist; the first run
//     failed the rollback row on exactly that and on nothing in the SQL. Production is UTF8.
//   * the harnesses get a database of their own (`dbtest`), because db.mjs drops the public/auth/storage
//     schemas on every open - it must never share a database with anything that matters.
//
// usage: node qa/factory/dbtest_on_disposable_pg.mjs <product repo> [<log dir>] [harness ...]
//   product repo: a checkout holding qa/dbtest (with its node_modules installed)
//   log dir:      where each harness's full output is written (default: <tmp>/brain-os-dbtest-<ts>)
//   harnesses:    default apply-migrations acceptance personas draft_202609110001_acceptance concurrency
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalPg } from './local_pg.mjs';

const [repo, logDirArg, ...harnessArgs] = process.argv.slice(2);
if (!repo || !existsSync(join(repo, 'qa', 'dbtest', 'db.mjs'))) {
  console.log('usage: node qa/factory/dbtest_on_disposable_pg.mjs <product repo with qa/dbtest> [<log dir>] [harness ...]');
  process.exit(2);
}
const DEFAULT = ['apply-migrations', 'acceptance', 'personas', 'draft_202609110001_acceptance', 'concurrency'];
const harnesses = (harnessArgs.length ? harnessArgs : DEFAULT).filter((h) => existsSync(join(repo, 'qa', 'dbtest', h + '.mjs')));
const logDir = logDirArg || join(tmpdir(), 'brain-os-dbtest-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, ''));
mkdirSync(logDir, { recursive: true });

const pg = await startLocalPg({ quiet: true });
let failed = 0;
try {
  const { default: pgLib } = await import('pg');
  const admin = new pgLib.Client({ connectionString: pg.superUrl });
  await admin.connect();
  await admin.query("create database dbtest encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'");
  const ver = (await admin.query('select version() v')).rows[0].v;
  const enc = (await admin.query("select pg_encoding_to_char(encoding) e from pg_database where datname = 'dbtest'")).rows[0].e;
  await admin.end();
  const url = pg.superUrl.replace(/\/factory_control_plane$/, '/dbtest');

  const head = ['engine: ' + ver, 'database: dbtest, encoding ' + enc + ', disposable server on port ' + pg.port + ' (data directory removed on exit)',
    'repo: ' + repo, 'logs: ' + logDir];
  console.log(head.join('\n'));
  const summary = [...head, ''];
  for (const h of harnesses) {
    const r = spawnSync(process.execPath, [h + '.mjs'], {
      cwd: join(repo, 'qa', 'dbtest'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, DBTEST_PG_URL: url },
    });
    const log = (r.stdout || '') + (r.stderr || '');
    writeFileSync(join(logDir, h + '.log'), log);
    const lines = log.split(/\r?\n/).filter((l) => /^(applied|acceptance:|personas:|concurrency:|\d+ pass, \d+ fail|\s+VERDICT)/.test(l));
    const line = h + ' rc=' + r.status + ' :: ' + (lines.slice(-1)[0] || '(no summary line)').trim().slice(0, 200);
    if (r.status !== 0) failed++;
    summary.push(line);
    console.log(line);
  }
  summary.push('', failed ? 'FAILED: ' + failed + ' harness(es) exited non-zero' : 'ALL HARNESSES EXITED 0');
  writeFileSync(join(logDir, 'SUMMARY.txt'), summary.join('\n') + '\n');
  console.log(summary.slice(-1)[0]);
} finally {
  await pg.stop();
}
process.exit(failed ? 1 : 0);
