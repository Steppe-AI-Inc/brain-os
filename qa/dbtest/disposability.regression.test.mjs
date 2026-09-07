// DB_TEST_HARNESS_CANNOT_DESTRUCTIVELY_INITIALIZE_A_NON_EPHEMERAL_DATABASE
//
// Adversarial tests for the proof that gates openDb()'s DROP block. Every case here is a way the
// old hostname denylist would have said "not production" about a database that is production —
// which is the whole reason the boundary moved from the connection string to the database itself.
//
// Pure: a scripted fake connection, no engine, no network, no credentials. It runs anywhere,
// including on a laptop with no Postgres, which is the point — a safety proof that only runs in CI
// is a safety proof that does not run when someone points a harness at the wrong host at 2am.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposable, NotDisposableError, SENTINEL_TABLE } from './disposability.mjs';

// A fake connection answering by pattern. `state` describes the database being impersonated.
function fakeDb(state) {
  const execLog = [];
  const query = async (sql) => {
    if (/current_database\(\)/.test(sql)) {
      if (state.unidentifiable) throw new Error('connection lost');
      return { rows: [{ db: state.database || 'postgres', v: state.version || 'PostgreSQL 15.1' }] };
    }
    if (new RegExp("table_name='" + SENTINEL_TABLE + "'").test(sql)) {
      return { rows: [{ n: state.sentinelTable ? 1 : 0 }] };
    }
    if (new RegExp('from public\.' + SENTINEL_TABLE).test(sql)) {
      return { rows: state.sentinelRow ? [{ run_token: state.sentinelRow, planted_at: 'now' }] : [] };
    }
    if (/from pg_namespace/.test(sql)) {
      return { rows: (state.managedSchemas || []).map((nspname) => ({ nspname })) };
    }
    if (/from pg_roles/.test(sql)) {
      return { rows: (state.supabaseRoles || []).map((rolname) => ({ rolname })) };
    }
    if (/table_type='BASE TABLE'/.test(sql)) {
      return { rows: [{ n: state.publicTables || 0 }] };
    }
    throw new Error('fakeDb: unscripted query: ' + sql);
  };
  return { db: { query, exec: async (sql) => { execLog.push(sql); } }, execLog };
}

// What a real Supabase project looks like from inside, regardless of the URL used to reach it.
const PRODUCTION = {
  database: 'postgres',
  managedSchemas: ['auth', 'storage', 'vault', 'supabase_migrations'],
  supabaseRoles: ['anon', 'authenticated', 'service_role'],
  publicTables: 84,
};
const PRODUCTION_URL = 'postgres://postgres.pvphxgrtdfrudejjhzjk:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const refusal = async (state, url) => {
  const { db } = fakeDb(state);
  return assert.rejects(() => assertDisposable(db, { url }), NotDisposableError);
};

test('REFUSES_PRODUCTION_REACHED_BY_ITS_OWN_URL', async () => {
  await refusal(PRODUCTION, PRODUCTION_URL);
});

// THE CASE THE INVARIANT IS ABOUT. The hostname says localhost; the database is production —
// reached through a tunnel, a bouncer, an /etc/hosts entry, a port-forward, or a copied .env whose
// host half was edited and whose credentials half was not. The old denylist passes this happily
// and then drops five schemas.
test('REFUSES_PRODUCTION_WHEN_THE_HOSTNAME_DETECTOR_IS_DEFEATED', async () => {
  await refusal(PRODUCTION, 'postgres://user:pw@localhost:5432/postgres');
});

test('REFUSES_PRODUCTION_WHEN_THE_PROJECT_REF_FORMAT_CHANGES', async () => {
  await refusal(PRODUCTION, 'postgres://user:pw@db.some-new-ref-format.supabase-next.dev:5432/postgres');
});

// A project whose schemas were dropped still carries cluster-level API roles. An empty schema list
// is not emptiness.
test('REFUSES_A_TARGET_CARRYING_MANAGED_SCHEMAS_AND_NOTHING_ELSE', async () => {
  await refusal({ database: 'postgres', managedSchemas: ['auth', 'storage'], supabaseRoles: [], publicTables: 0 },
    'postgres://user:pw@localhost:5432/postgres');
});

test('REFUSES_A_RESET_PROJECT_THAT_STILL_CARRIES_SUPABASE_ROLES', async () => {
  await refusal({ database: 'postgres', managedSchemas: [], supabaseRoles: ['service_role'], publicTables: 0 },
    'postgres://user:pw@localhost:5432/postgres');
});

test('REFUSES_A_POPULATED_DATABASE_THIS_HARNESS_HAS_NEVER_OWNED', async () => {
  await refusal({ database: 'someones_app', managedSchemas: [], supabaseRoles: [], publicTables: 12 },
    'postgres://user:pw@localhost:5432/someones_app');
});

// The sentinel is proof only when this harness planted it. A bare table of the same name is the
// first thing an accident or an attacker reproduces, so the ROW is the proof, not the name.
test('REFUSES_AN_EMPTY_SENTINEL_TABLE', async () => {
  await refusal({ sentinelTable: true, sentinelRow: null }, 'postgres://user:pw@localhost:5432/x');
});

test('REFUSES_A_TARGET_IT_CANNOT_IDENTIFY', async () => {
  await refusal({ unidentifiable: true }, 'postgres://user:pw@localhost:5432/x');
});

// ── The two ways a database is allowed to prove itself ──────────────────────────────────────────
test('ALLOWS_A_PRISTINE_UNCLAIMED_DATABASE_AND_PLANTS_THE_SENTINEL', async () => {
  const { db, execLog } = fakeDb({ database: 'postgres', managedSchemas: [], supabaseRoles: [], publicTables: 0 });
  const r = await assertDisposable(db, { url: 'postgres://postgres:postgres@localhost:5432/postgres' });
  assert.equal(r.disposable, true);
  assert.equal(r.route, 'pristine');
  assert.equal(execLog.length, 1, 'the sentinel must be planted exactly once');
  assert.match(execLog[0], new RegExp('insert into public\.' + SENTINEL_TABLE));
  assert.match(r.evidence.run_token, /^dbtest-/);
});

test('ALLOWS_A_DATABASE_CARRYING_THIS_HARNESSES_OWN_SENTINEL', async () => {
  const { db, execLog } = fakeDb({ sentinelTable: true, sentinelRow: 'dbtest-abc-123', publicTables: 40 });
  const r = await assertDisposable(db, { url: 'postgres://postgres:postgres@postgres:5432/postgres' });
  assert.equal(r.route, 'sentinel');
  assert.equal(r.evidence.run_token, 'dbtest-abc-123');
  assert.equal(execLog.length, 0, 'the sentinel route must not write anything');
});

// A refusal that does not say what it refused sends the next person back to guessing.
test('A_REFUSAL_NAMES_THE_EVIDENCE_IT_REFUSED_ON', async () => {
  const { db } = fakeDb(PRODUCTION);
  await assert.rejects(() => assertDisposable(db, { url: PRODUCTION_URL }), (e) => {
    assert.ok(e instanceof NotDisposableError);
    // Match the REASON, not the evidence dump every refusal appends — the dump contains these
    // strings whichever guard fired, so matching the whole message proves nothing about which did.
    const NL = String.fromCharCode(10);
    const reason = e.message.split(NL + 'Evidence:')[0];
    assert.match(reason, /managed schemas/);
    assert.match(reason, /supabase_migrations/);
    assert.deepEqual(e.evidence.managedSchemas, PRODUCTION.managedSchemas);
    return true;
  });
});

// A HOST BEING ON THE ALLOWLIST MUST NOT BE SUFFICIENT. If it ever becomes sufficient, every case
// above collapses, because every one of them can be reached from localhost.
test('AN_ALLOWLISTED_HOSTNAME_IS_NOT_ITSELF_PERMISSION', async () => {
  for (const host of ['localhost', '127.0.0.1', 'postgres', 'db']) {
    await refusal(PRODUCTION, 'postgres://user:pw@' + host + ':5432/postgres');
  }
});
