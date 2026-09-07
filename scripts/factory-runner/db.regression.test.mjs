// Regressions for the canonical factory DB accessor. Pure: no connection is ever opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement, read, write, FactoryDbRefusal } from './db.mjs';

test('DML is allowed', () => {
  for (const s of ['insert into public.agent_runs (id) values (1)', 'update public.tasks set status=$1 where id=$2',
    'delete from public.worker_heartbeats where stale', 'select * from public.tasks']) {
    assert.equal(classifyStatement(s), null, s);
  }
});

test('FACTORY_WORKER_CANNOT_EXECUTE_DDL_OR_TOUCH_MIGRATION_HISTORY', () => {
  const cases = [
    ['create table public.evil(x int)', 'DDL (CREATE)'],
    ['ALTER TABLE public.agents ADD COLUMN has_production_authority boolean', 'DDL (ALTER)'],
    ['drop schema public cascade', 'DDL (DROP)'],
    ['grant all on schema public to anon', 'privilege change'],
    ['revoke select on public.finance from authenticated', 'privilege change'],
    ["insert into supabase_migrations.schema_migrations (version) values ('202609020003')", 'migration history'],
    ['delete from supabase_migrations.schema_migrations where version = $1', 'migration history'],
    ['truncate public.tasks', 'TRUNCATE'],
    ['set role service_role', 'role escalation'],
    ['create function f() returns void language sql security definer as $$ select 1 $$', 'DDL (CREATE)'],
  ];
  for (const [sql, expected] of cases) assert.equal(classifyStatement(sql), expected, sql);
});

test('read() refuses a mutating statement before connecting', async () => {
  await assert.rejects(() => read('update public.tasks set status = 1'), FactoryDbRefusal);
});

test('NO_FALLBACK_TO_AMBIENT_AUTHORITY — without FACTORY_RUNNER_PG_URL every call refuses', async () => {
  // This test file is run with the variable unset. If someone adds a fallback to `--linked`, this
  // read would succeed on any machine holding the CLI credential — which is the machine this test
  // was written on.
  assert.equal(process.env.FACTORY_RUNNER_PG_URL || '', '', 'run this test with FACTORY_RUNNER_PG_URL unset');
  await assert.rejects(() => read('select 1'), (e) => e instanceof FactoryDbRefusal && /no fallback/.test(e.message));
  await assert.rejects(() => write('insert into public.x values (1)'), FactoryDbRefusal);
});

test('a superuser connection string is refused as not least-privilege', async () => {
  process.env.FACTORY_RUNNER_PG_URL = 'postgres://postgres:pw@localhost:5432/postgres';
  try {
    const { read: r2 } = await import('./db.mjs?superuser=' + Date.now());
    // The re-import is a distinct module instance, so its FactoryDbRefusal is a distinct class;
    // match by name and message rather than instanceof.
    await assert.rejects(() => r2('select 1'), (e) => e.name === 'FactoryDbRefusal' && /superuser/.test(e.message));
  } finally { delete process.env.FACTORY_RUNNER_PG_URL; }
});
