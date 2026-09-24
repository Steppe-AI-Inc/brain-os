// THE ONE WAY A FACTORY WORKER REACHES THE DATABASE.
//
// Today every one of ten factory-runner scripts carries its own `runSql` that shells out to
// `npx supabase db query --linked`. That means each of them inherits, ambiently, whatever the
// machine's Supabase CLI credential can do — which on this laptop is full production write. A
// scheduler poll and a production migration travel the same wire with the same authority.
//
// This module replaces all ten. Three things change:
//
//   1. NO AMBIENT CREDENTIAL. It connects with FACTORY_RUNNER_PG_URL — an explicit, least-privilege
//      role — and it never falls back to `--linked`. A missing URL is a refusal, not a fallback,
//      because a fallback to ambient authority is how "least privilege" quietly becomes "whatever
//      the laptop had".
//
//   2. STATEMENT CLASS ENFORCED IN THE CLIENT. A factory worker does DML. It never does DDL, never
//      touches supabase_migrations, never GRANTs. That is verified true of all ten scripts today
//      (no CREATE/ALTER/DROP/GRANT/REVOKE anywhere in scripts/factory-runner), so encoding it costs
//      nothing and closes the gap between "we checked once" and "it cannot". The database role must
//      enforce the same thing server-side; this is the second layer, not the boundary.
//
//   3. EVERY CALL DECLARES ITS CLASS. `read()` and `write()` are different functions, and read()
//      refuses a mutating statement. A script that only reads cannot silently start writing.
//
// The least-privilege role itself is founder DDL — creating a role IS schema change, so this
// module cannot bootstrap its own boundary. Until that role exists, point FACTORY_RUNNER_PG_URL at
// a development database; this module works identically and the refusals below still apply.

// `pg` is imported lazily inside connect() so the refusal paths — and their tests — need no driver.

export const FACTORY_RUNNER_PG_URL = process.env.FACTORY_RUNNER_PG_URL || '';

export class FactoryDbRefusal extends Error {
  constructor(msg) { super('REFUSED — ' + msg); this.name = 'FactoryDbRefusal'; }
}

// Statement classes a factory worker must never execute, whatever its role happens to allow.
const FORBIDDEN = [
  [/\bcreate\s+(table|schema|function|extension|policy|role|user|index|type|view|trigger)\b/i, 'DDL (CREATE)'],
  [/\balter\s+(table|schema|function|role|user|type|view|publication|database)\b/i, 'DDL (ALTER)'],
  [/\bdrop\s+(table|schema|function|extension|policy|role|user|index|type|view|trigger|publication)\b/i, 'DDL (DROP)'],
  [/\b(grant|revoke)\b/i, 'privilege change'],
  [/\bsupabase_migrations\b/i, 'migration history'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\bset\s+role\b/i, 'role escalation'],
  [/\bsecurity\s+definer\b/i, 'SECURITY DEFINER definition'],
];

const MUTATING = /\b(insert|update|delete|merge|upsert)\b/i;

/** @returns {string|null} the reason this statement is refused, or null if it is allowed. */
export function classifyStatement(sql) {
  for (const [re, what] of FORBIDDEN) {
    if (re.test(sql)) return what;
  }
  return null;
}

function assertAllowed(sql) {
  const bad = classifyStatement(sql);
  if (bad) {
    throw new FactoryDbRefusal('a factory worker attempted ' + bad + '. Factory workers perform DML '
      + 'only. Schema change, privilege change and migration-history writes are production release '
      + 'operations and belong to the release broker, which requires a founder authorization '
      + 'manifest. If this statement is legitimate, it is a release, not a poll.');
  }
}

// THE URL IS JUDGED BEFORE A SOCKET IS OPENED, and the judgement fails closed. Two machines sharing one
// control plane reach it over a network, and the three ways that goes wrong are all in the URL: it names
// the superuser; it names the production project; or it crosses a network in the clear. A connection that
// is refused here never sends the password anywhere. Loopback is the one exception to the TLS rule - it
// does not cross a network - and it is the only exception.
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|\[?::1\]?|localhost)$/i;
const TLS_MODES = ['require', 'verify-ca', 'verify-full'];
// The Brain OS production project. A host that names it is the product database whatever else the URL says.
const PRODUCTION_HOST_MARKS = ['pvphxgrtdfrudejjhzjk'];
/** @returns {string|null} why this URL must not be connected to, or null when it may be. Pure; no I/O. */
export function assessUrl(url) {
  if (!url) return 'FACTORY_RUNNER_PG_URL is not set';
  let u;
  try { u = new URL(url); } catch { return 'FACTORY_RUNNER_PG_URL is not a URL'; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return 'FACTORY_RUNNER_PG_URL is not a postgresql:// URL';
  // THE QUERY STRING CANNOT OVERRIDE WHO OR WHERE. pg honours ?user=, ?host=, ?port=, ?password= and more OVER the URL's own
  // parts, and takes the LAST of a repeated key: '?user=postgres' made a least-privilege URL connect as the superuser and
  // '?sslmode=require&sslmode=disable' connected in the clear, both passing the checks below, which read the URL's own parts
  // (independent verification 2026-09-24, round 3). Only the TLS and client settings the Factory writes may appear, once each.
  const ALLOWED_QUERY = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'application_name', 'connect_timeout', 'options'];
  const keys = [...u.searchParams.keys()];
  const foreign = [...new Set(keys.filter((k) => !ALLOWED_QUERY.includes(k)))];
  if (foreign.length) {
    return 'FACTORY_RUNNER_PG_URL carries ' + foreign.map((k) => '?' + k + '=').join(', ') + ' in its query string - pg lets query settings '
      + 'override the URL itself (the user, the host, TLS). Write the connection in the URL; only ' + ALLOWED_QUERY.join(', ') + ' may be query parameters.';
  }
  const repeated = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (repeated.length) return 'FACTORY_RUNNER_PG_URL repeats ' + repeated.join(', ') + ' in its query string - pg uses the LAST value, which is not the one checked here.';
  const username = decodeURIComponent(u.username || '');
  // `postgres`, `supabase_admin`, and Supabase's pooler form `postgres.<ref>` are all the superuser.
  if (username === 'postgres' || username === 'supabase_admin' || /^postgres\./.test(username)) {
    return 'FACTORY_RUNNER_PG_URL connects as the `postgres` superuser. A least-privilege accessor pointed at '
      + 'a superuser is not least privilege; it is the same authority with a longer variable name.';
  }
  const host = (u.hostname || '').replace(/^\[|\]$/g, '');
  // the WHOLE url is searched - a pooler names the project in `options=project=<ref>`, not in the host
  let lower = '';
  try { lower = decodeURIComponent(url).toLowerCase(); } catch { lower = String(url).toLowerCase(); }
  const extra = (process.env.FACTORY_FORBIDDEN_HOST_MARKS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const mark of [...PRODUCTION_HOST_MARKS, ...extra]) {
    if (mark && lower.includes(mark.toLowerCase())) {
      return 'FACTORY_RUNNER_PG_URL names the PRODUCTION project (' + mark + '). The control plane is a separate, '
        + 'non-production database; nothing in the Factory may hold a connection into the product.';
    }
  }
  if (!LOOPBACK.test(host)) {
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    if (!TLS_MODES.includes(mode)) {
      return 'FACTORY_RUNNER_PG_URL reaches ' + host + ' over a network with sslmode=' + (mode || '(none)')
        + '. A shared control plane is reached over TLS or not at all: add ?sslmode=require (verify-full when the '
        + 'server certificate is known). Only a loopback address may connect in the clear.';
    }
  }
  return null;
}

async function connect() {
  if (!FACTORY_RUNNER_PG_URL) {
    throw new FactoryDbRefusal('FACTORY_RUNNER_PG_URL is not set. This module deliberately has no '
      + 'fallback: the previous mechanism (`supabase db query --linked`) worked precisely because '
      + 'it silently borrowed whatever production credential the machine happened to hold, which is '
      + 'the defect being removed. Set an explicit least-privilege connection.');
  }
  const why = assessUrl(FACTORY_RUNNER_PG_URL);
  if (why) throw new FactoryDbRefusal(why);
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: FACTORY_RUNNER_PG_URL });
  await client.connect();
  return client;
}

/** Run a read. Refuses anything that mutates, so a reader cannot become a writer by edit. */
export async function read(sql, params = []) {
  assertAllowed(sql);
  if (MUTATING.test(sql)) {
    throw new FactoryDbRefusal('read() was given a mutating statement. Use write() and make the '
      + 'change visible at the call site.');
  }
  const client = await connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

/** Run a DML write. */
export async function write(sql, params = []) {
  assertAllowed(sql);
  const client = await connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

/**
 * Run a function with a live client, for the one thing a fixed statement list cannot express: read a
 * row, then decide, inside a single transaction. The atomic claim needs exactly this.
 *
 * IT GOES THROUGH connect(), so every refusal above still applies — a missing FACTORY_RUNNER_PG_URL is
 * still a refusal and a superuser URL is still a refusal. What it does not do is classify each
 * statement, because the caller is issuing several as one unit. Callers are therefore expected to be
 * orchestration code in this directory, and the statement-class guarantee for them comes from the
 * database role, which is the layer that was always meant to be the boundary.
 */
export async function withClient(fn) {
  const client = await connect();
  try { return await fn(client); } finally { await client.end(); }
}
/** Several statements in one transaction, all-or-nothing. */
export async function transaction(statements) {
  for (const { sql } of statements) assertAllowed(sql);
  const client = await connect();
  try {
    await client.query('begin');
    const out = [];
    for (const { sql, params } of statements) out.push(await client.query(sql, params || []));
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* already aborted */ }
    throw e;
  } finally { await client.end(); }
}
