#!/usr/bin/env node
// ROUND 3 / D-4: TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN under GENUINE concurrency.
//
// PGlite is single-connection, so the FOR UPDATE SKIP LOCKED property of
// claim_blocked_run_for_retry had never been exercised by anybody — a second SEQUENTIAL claim
// returning zero rows is necessary, nowhere near sufficient. This harness opens TWO real
// connections to a real PostgreSQL server (DBTEST_PG_URL, the CI service container) and
// races them inside open transactions:
//
//   client 1: BEGIN; claim -> holds the row lock
//   client 2: BEGIN; claim -> must SKIP the locked row and return zero rows, NOT block, NOT
//             return the same row
//   client 1: COMMIT -> client 2's next claim finds nothing eligible (the run is claimed)
//
// The claim is made as the supervisor's transport identity (a direct superuser connection,
// session_user = postgres) because that is what the function is written for and the only
// way it can be called (ROUND 3 / D-2: no role holds EXECUTE).
//
// Runs ONLY on the real engine; on PGlite it prints why it cannot and exits 0 without a
// verdict, so a missing DBTEST_PG_URL can never be mistaken for a pass.
import { openDb, bootstrap, transformFor, PG_URL } from './db.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGDIR = join(resolve(HERE, '..', '..'), 'supabase', 'migrations');

if (!PG_URL) {
  console.log('concurrency: NO VERDICT — requires a real PostgreSQL server (DBTEST_PG_URL). PGlite is single-connection and cannot exercise FOR UPDATE SKIP LOCKED.');
  process.exit(0);
}

const db = await openDb();
console.log(`engine: ${db.engine} — ${db.version}`);
const transform = transformFor(db);
await bootstrap(db);
for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); }
  catch (e) { console.log(`SETUP FAILED at ${f}: ${String(e.message).split('\n')[0]}`); process.exit(1); }
}
// One eligible blocked run.
await db.exec(`insert into public.agent_runs (id, status, blocked_at, retry_after, attempt_count, source_sha, blocked_reason)
  values ('dddd0000-0000-0000-0000-00000000000d', 'blocked', now() - interval '1 hour', now() - interval '1 minute', 1, 'abc1234', 'PROVIDER_CAPACITY_BLOCKED: test')
  on conflict (id) do update set status = 'blocked', retry_after = now() - interval '1 minute', claimed_by = null, claimed_at = null;`);

const { default: pg } = await import('pg');
const c1 = new pg.Client({ connectionString: PG_URL }); await c1.connect();
const c2 = new pg.Client({ connectionString: PG_URL }); await c2.connect();
const claim = (c, who) => c.query(`select id from public.claim_blocked_run_for_retry($1, 6, interval '30 minutes')`, [who]).then((r) => r.rows);

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
try {
  await c1.query('begin');
  const first = await claim(c1, 'supervisor-1');
  check('supervisor-1 claims the eligible run inside an open transaction', first.length === 1, JSON.stringify(first));

  await c2.query('begin');
  // If SKIP LOCKED were missing this would BLOCK until c1 commits; bound it so a hang is a FAIL, not a stall.
  const raced = await Promise.race([
    claim(c2, 'supervisor-2'),
    new Promise((_, rej) => setTimeout(() => rej(new Error('supervisor-2 BLOCKED on the locked row for 5s — SKIP LOCKED is not in effect')), 5000)),
  ]).catch((e) => ({ error: String(e.message) }));
  check('supervisor-2, racing inside its own transaction, gets ZERO rows and does not block', Array.isArray(raced) && raced.length === 0, Array.isArray(raced) ? JSON.stringify(raced) : raced.error);
  await c2.query('commit');

  await c1.query('commit');
  const after = await claim(c2, 'supervisor-2');
  check('after supervisor-1 commits, the run is claimed and supervisor-2 still gets nothing', after.length === 0, JSON.stringify(after));
  const row = (await db.query(`select claimed_by, attempt_count from public.agent_runs where id = 'dddd0000-0000-0000-0000-00000000000d'`)).rows[0];
  check('exactly one claimant is recorded', row.claimed_by === 'supervisor-1', JSON.stringify(row));
} finally {
  await c1.end(); await c2.end(); await db.close();
}
console.log(`\nconcurrency: ${failed === 0 ? 'TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN — VERIFIED under real concurrency (real PostgreSQL, two connections)' : failed + ' check(s) FAILED'}`);
process.exit(failed ? 1 : 0);
