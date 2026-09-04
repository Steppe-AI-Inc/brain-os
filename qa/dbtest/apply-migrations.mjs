#!/usr/bin/env node
// REAL POSTGRESQL MIGRATION VALIDATION — parse and EXECUTE, not read.
//
// Three consecutive DB review rounds were forced to declare CODE INSPECTED because no psql,
// docker or db-query access existed in this environment. That is an infrastructure defect,
// not a per-round caveat: no amount of careful reading tells you whether SQL parses, whether
// a trigger fires in the right order, or whether a CHECK actually refuses a row.
//
// PGlite is real PostgreSQL (18.3) compiled to WASM, so it runs in Node with no Docker and
// no machine-wide install. It gives the two things static review can never give:
// SQL PARSED and DDL EXECUTED against a disposable database.
//
// It is NOT a full Supabase. What it cannot check is reported explicitly at the end rather
// than left for a reader to assume.
//
//   node apply-migrations.mjs              # apply the whole chain, report per file
//   node apply-migrations.mjs --stop-first # stop at the first failure
import { openDb, bootstrap } from './db.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const MIGDIR = join(REPO, 'supabase', 'migrations');
const STOP_FIRST = process.argv.includes('--stop-first');

// The four migrations this campaign is validating. Each gets its OWN verdict — a PASS on
// one implies nothing about the others (the founder's standing rule, and round 2's).
const TARGETS = new Set([
  '202609020001_chat_channel_state_durable_conversation.sql',
  '202609020002_set_person_assignment_clear_manager.sql',
  '202609020003_messaging_transport_foundation.sql',
  '202609030001_agent_run_capacity_retry.sql',
]);

// ENGINE: PGlite by default, or a REAL PostgreSQL server when DBTEST_PG_URL is set. The
// neutralisation below is applied on BOTH engines so the two runs validate identical text.
const db = await openDb();
console.log(`engine: ${db.engine} — ${db.version}`);
const results = [];

// Extensions PGlite does not bundle. Each occurrence is NEUTRALISED and COUNTED, never
// silently dropped: a migration that only applied because an extension statement vanished
// has not been validated for that statement, and the report has to say so.
// pgcrypto is deliberately NOT in this list: it is available from PGlite's contrib set and
// is genuinely created, so neutralising it would have been a silent downgrade of real
// coverage to shimmed coverage.
const UNAVAILABLE_EXT = /^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http|vector)["']?[^;]*;/gim;
const neutralised = [];

// `vector` is shimmed as a DOMAIN (bootstrap step 2), and a domain cannot carry a type
// modifier, so `vector(1536)` must lose its dimension here. Recorded like everything else:
// embedding-column findings from this harness are worthless — which is acceptable, because
// none of the four migrations under test declares one.
const VECTOR_MODIFIER = /\bvector\s*\(\s*\d+\s*\)/gi;
const VECTOR_INDEX = /create\s+index[^;]*?using\s+(hnsw|ivfflat)[^;]*;/gi;

function transform(label, sql) {
  // A REAL pgvector (real-postgresql job) needs no neutralisation of vector at all.
  if (db.extensions.vector) {
    return sql.replace(/^s*creates+extensions+(ifs+nots+existss+)?["']?(pg_net|pgjwt|pg_graphql|pg_stat_statements|uuid-ossp|http)["']?[^;]*;/gim, (m) => {
      neutralised.push({ label, kind: 'extension', statement: m.trim().replace(/s+/g, ' ') });
      return `-- [harness] neutralised (extension unavailable on this engine): ${m.trim().replace(/s+/g, ' ')}
`;
    });
  }
  return sql
    .replace(UNAVAILABLE_EXT, (m) => {
      neutralised.push({ label, kind: 'extension', statement: m.trim().replace(/\s+/g, ' ') });
      return `-- [harness] neutralised (extension unavailable in PGlite): ${m.trim().replace(/\s+/g, ' ')}\n`;
    })
    .replace(VECTOR_MODIFIER, (m) => {
      neutralised.push({ label, kind: 'vector-modifier', statement: m.trim() });
      return 'vector';
    })
    // pgvector's index access methods do not exist without the extension. These indexes are
    // a RAG performance concern and touch no table the four target migrations depend on for
    // correctness — but the statement is skipped, so it is recorded as unvalidated. Without
    // this, `chat_channels` is never created and migration A cannot be reached at all.
    .replace(VECTOR_INDEX, (m) => {
      neutralised.push({ label, kind: 'vector-index', statement: m.trim().replace(/\s+/g, ' ').slice(0, 160) });
      return `-- [harness] neutralised (pgvector access method unavailable)\n`;
    });
}

async function run(label, sql, isTarget) {
  sql = transform(label, sql);
  try {
    await db.exec(sql);
    results.push({ label, status: 'APPLIED', isTarget });
    return true;
  } catch (e) {
    const msg = String(e.message || e).split('\n').slice(0, 3).join(' | ');
    // PGlite surfaces a syntax error differently from a semantic one; distinguishing them
    // matters, because "does not parse" and "parses but the schema disagrees" are different
    // findings with different owners.
    const kind = /syntax error/i.test(msg) ? 'PARSE_FAILED' : 'EXECUTE_FAILED';
    results.push({ label, status: kind, isTarget, error: msg });
    // A failed statement leaves PGlite's implicit transaction ABORTED, and every later file
    // then dies with "current transaction is aborted" — which looks exactly like twelve
    // independent failures and is really one. Recover so each migration is judged on its
    // own merits. (Found by this harness reporting the four targets as failing when they
    // had never actually been executed.)
    try { await db.exec('rollback;'); } catch { /* no open transaction — fine */ }
    return false;
  }
}

console.log('bootstrap: Supabase-compatible shim (roles, auth schema, auth.uid/jwt/role)');
// On a real engine that ships pgvector the type is REAL; bootstrap.sql's domain shim then
// skips itself. PGlite has no pgvector, so this is a no-op there and the shim applies.
// Issued DIRECTLY, never through run(): run() applies transform(), which neutralises
// `create extension ... vector` — CI run 33829043446 proved that path silently produced the
// domain shim on a server that had the real extension.
if (db.extensions.vector) await db.exec('create extension if not exists vector;');
await run('_bootstrap.sql', readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'), false);
if (results[0].status !== 'APPLIED') {
  console.log('BOOTSTRAP FAILED — nothing below is meaningful:', results[0].error);
  process.exit(1);
}

const files = readdirSync(MIGDIR).filter((f) => f.endsWith('.sql')).sort();
console.log(`applying ${files.length} migrations in filename order\n`);

let firstFailureIdx = -1;
for (const f of files) {
  const sql = readFileSync(join(MIGDIR, f), 'utf8');
  const ok = await run(f, sql, TARGETS.has(f));
  const r = results[results.length - 1];
  if (!ok) {
    if (firstFailureIdx === -1) firstFailureIdx = results.length - 1;
    console.log(`${r.status.padEnd(14)} ${f}`);
    console.log(`               ${r.error}`);
    if (STOP_FIRST) break;
  } else if (TARGETS.has(f)) {
    console.log(`APPLIED  *TARGET*  ${f}`);
  }
}

// ---- Report ---------------------------------------------------------------------------
const applied = results.filter((r) => r.status === 'APPLIED').length;
const failed = results.filter((r) => r.status !== 'APPLIED');
const targetRows = results.filter((r) => r.isTarget);

console.log('\n' + '='.repeat(78));
console.log(`applied ${applied}/${results.length}; ${failed.length} failed`);
console.log('\nPER-TARGET VERDICT (each stands alone):');
for (const t of TARGETS) {
  const row = targetRows.find((r) => r.label === t);
  if (!row) {
    console.log(`  NOT REACHED    ${t}`);
    console.log('                 an earlier migration failed, so this was never applied — no verdict is possible');
  } else if (row.status === 'APPLIED') {
    console.log(`  SQL PARSED + DDL EXECUTED   ${t}`);
  } else {
    console.log(`  ${row.status}  ${t}`);
    console.log(`                 ${row.error}`);
  }
}

if (failed.length) {
  console.log('\nALL FAILURES (ancestor failures matter — they decide whether the targets ran against a faithful schema):');
  for (const r of failed) console.log(`  ${r.status.padEnd(14)} ${r.label}\n                 ${r.error}`);
}

if (neutralised.length) {
  console.log(`
NEUTRALISED EXTENSION STATEMENTS (${neutralised.length}) — each is an UNVALIDATED line:`);
  for (const n of neutralised) console.log(`  ${n.label}: ${n.statement}`);
}

console.log('\nWHAT THIS RUN DOES NOT PROVE:');
console.log('  * PGlite is single-user and superuser: RLS POLICY CREATION is validated here,');
console.log('    but policy ENFORCEMENT per persona needs the role-switching suite, not this file.');
console.log('  * The bootstrap shim defines auth.uid()/jwt()/role() and the Supabase roles. Any');
console.log('    migration that passes only because the shim is more permissive than real');
console.log('    Supabase is NOT validated. The shim is deliberately minimal for that reason.');
console.log('  * Supabase extensions beyond pgcrypto, storage/realtime schemas, and PostgREST');
console.log('    behaviour are absent.');
console.log('  * This is SQL PARSED + INTEGRATION EXECUTED. It is not LIVE VERIFIED, and it');
console.log('    says nothing about production data.');

writeFileSync(join(HERE, 'apply-report.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  engine: 'PGlite 0.5.8 (PostgreSQL 18.3, wasm32)',
  migrations_dir: 'supabase/migrations',
  total: results.length, applied, failed: failed.length,
  neutralised_extension_statements: neutralised,
  results,
}, null, 1) + '\n');
console.log('\nreport: qa/dbtest/apply-report.json');
process.exit(failed.length ? 1 : 0);
