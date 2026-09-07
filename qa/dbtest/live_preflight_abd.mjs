#!/usr/bin/env node
// LIVE PREFLIGHT for the founder-authorized production batch A/B/D — READ-ONLY against the target DB.
//   A = 202609020001_chat_channel_state_durable_conversation
//   B = 202609020002_set_person_assignment_clear_manager
//   D = 202609030001_agent_run_capacity_retry
//   EXCLUDED (must be UNTOUCHED): C = 202609020003_messaging_transport_foundation, 202609040001_chat_channels_creator_immutable
//
// Per migration, verifies against the LIVE catalog (pg_catalog / supabase_migrations only — no writes):
//   history   — supabase_migrations.schema_migrations contains the version (post-apply) / not (pre-apply)
//   functions — every `create [or replace] function` exists; SECURITY DEFINER flag matches the SQL
//   triggers  — every `create trigger` exists on its table
//   policies  — every `create policy` exists on its table; every `enable row level security` table has RLS on
//   grants    — `revoke execute ... from <role>` really revoked; `grant execute ... to <role>` really granted
// Plus the founder-mandated security self-check on a real engine (non-superuser, no BYPASSRLS, row_security on,
// a known-forbidden INSERT fails with 42501). Emits: A/B/D — LIVE VERIFIED | FAILED, C — UNTOUCHED | TOUCHED.
//
//   DBTEST_PG_URL=<production session-pooler URL, read-only role> node live_preflight_abd.mjs --post   # after apply
//   DBTEST_PG_URL=... node live_preflight_abd.mjs --pre                                                # before apply
//   node live_preflight_abd.mjs --smoke   # no URL: PGlite, applies everything except C/040001, then runs the same checks
import { openDb, bootstrap, transformFor, securitySelfCheck, ENGINE } from './db.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGDIR = join(resolve(HERE, '..', '..'), 'supabase', 'migrations');
const MODE = process.argv.includes('--post') ? 'post' : process.argv.includes('--pre') ? 'pre' : 'smoke';
const BATCH = {
  A: '202609020001_chat_channel_state_durable_conversation.sql',
  B: '202609020002_set_person_assignment_clear_manager.sql',
  D: '202609030001_agent_run_capacity_retry.sql',
};
const EXCLUDED = { C: '202609020003_messaging_transport_foundation.sql', X040001: '202609040001_chat_channels_creator_immutable.sql' };
const version = (f) => f.slice(0, 12);

// ---- parse expectations out of each migration's SQL (structure, not semantics) ---------------------
function expectations(sql) {
  const s = sql.replace(/--[^\n]*/g, '');
  const fn = (name) => name.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
  const out = { functions: [], triggers: [], policies: [], rls: [], revokes: [], grants: [] };
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\)\s*(?:returns|language|as|security)[\s\S]*?(?=;\s*\n|\$\$)/gi)) {
    const body = s.slice(m.index, s.indexOf('$$;', m.index) > 0 ? s.indexOf('$$;', m.index) : m.index + 2000);
    out.functions.push({ name: fn(m[1]), secdef: /security\s+definer/i.test(body) });
  }
  for (const m of s.matchAll(/create\s+trigger\s+([\w"]+)[\s\S]*?\bon\s+([\w."]+)/gi)) out.triggers.push({ name: fn(m[1]), table: fn(m[2]) });
  for (const m of s.matchAll(/create\s+policy\s+("[^"]+"|[\w]+)\s+on\s+([\w."]+)/gi)) out.policies.push({ name: m[1].replace(/"/g, ''), table: fn(m[2]) });
  for (const m of s.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([\w."]+)\s+enable\s+row\s+level\s+security/gi)) out.rls.push(fn(m[1]));
  for (const m of s.matchAll(/revoke\s+(?:all|execute)[\s\S]*?\bon\s+function\s+([\w."]+)\s*\([^)]*\)\s+from\s+([\w,\s]+?);/gi)) for (const r of m[2].split(',')) out.revokes.push({ fn: fn(m[1]), role: r.trim().toLowerCase() });
  for (const m of s.matchAll(/grant\s+execute[\s\S]*?\bon\s+function\s+([\w."]+)\s*\([^)]*\)\s+to\s+([\w,\s]+?);/gi)) for (const r of m[2].split(',')) out.grants.push({ fn: fn(m[1]), role: r.trim().toLowerCase() });
  return out;
}

const db = await openDb();
console.log(`engine: ${db.engine} — ${db.version}   mode: ${MODE}\n`);
// db.mjs's query wrapper takes only `sql` (no bind params): substitute $N with safely-quoted literals.
// Every value comes from this repo's own migration files (identifiers) or a fixed role name.
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const q = async (sql, params = []) => (await db.query(sql.replace(/\$(\d+)/g, (_, i) => lit(params[Number(i) - 1])))).rows;
const one = async (sql, params = []) => { const r = await q(sql, params); return r.length ? Number(Object.values(r[0])[0]) : 0; };

if (MODE === 'smoke') {
  if (db.engine !== 'pglite') { console.log('smoke mode needs PGlite (unset DBTEST_PG_URL)'); process.exit(2); }
  const t = transformFor(db);
  if (db.extensions.vector) await db.exec('create extension if not exists vector;');
  await db.exec(readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'));
  const excluded = new Set(Object.values(EXCLUDED));
  for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) if (!excluded.has(f)) await db.exec(t(readFileSync(join(MIGDIR, f), 'utf8')));
  // PGlite has no supabase_migrations table; emulate what `db push` records for the applied set
  await db.exec('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);');
  for (const f of readdirSync(MIGDIR).filter((x) => x.endsWith('.sql')).sort()) if (!excluded.has(f)) await db.exec(`insert into supabase_migrations.schema_migrations(version,name) values ('${version(f)}','${f}') on conflict do nothing;`);
  console.log('smoke: applied every migration except C/040001 on PGlite, history table emulated\n');
}

// ---- security self-check (real engine only; PGlite is integration smoke) ----------------------------
if (db.engine === 'real-postgresql') {
  try { const ev = await securitySelfCheck(db); console.log('security self-check: PASS', JSON.stringify(ev).slice(0, 160)); }
  catch (e) { console.log('security self-check: FAIL —', e.message); console.log('\nNO migration verdict can be LIVE VERIFIED on a connection whose enforcement is unproven.'); process.exit(1); }
} else console.log('security self-check: SKIPPED on PGlite (smoke only — a real engine is required for LIVE VERIFIED)');

// ---- migration history --------------------------------------------------------------------------------
let history = [];
try { history = (await q('select version from supabase_migrations.schema_migrations order by version')).map((r) => String(r.version)); }
catch (e) { console.log('history: cannot read supabase_migrations.schema_migrations —', e.message.split('\n')[0]); }
console.log(`history: ${history.length} applied versions; latest = ${history.at(-1) ?? '(none)'}`);

const verdicts = {};
const check = (bucket, name, ok, detail) => { bucket.push([name, ok, detail]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + detail}`); };

for (const [tag, file] of Object.entries(BATCH)) {
  console.log(`\n=== ${tag}: ${file} ===`);
  const checks = []; const exp = expectations(readFileSync(join(MIGDIR, file), 'utf8'));
  const inHistory = history.includes(version(file));
  if (MODE === 'pre') check(checks, 'history: NOT yet applied (pre-apply state)', !inHistory, 'already present in schema_migrations');
  else check(checks, `history: version ${version(file)} recorded`, inHistory, 'missing from schema_migrations');
  for (const f of exp.functions) {
    const rows = await q(`select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [f.name]);
    if (MODE === 'pre') continue;
    check(checks, `function ${f.name} exists`, rows.length > 0, 'not found in pg_proc');
    if (rows.length) check(checks, `function ${f.name} SECURITY DEFINER == ${f.secdef}`, rows.some((r) => !!r.prosecdef === f.secdef), `prosecdef=${rows.map((r) => r.prosecdef).join(',')}`);
  }
  if (MODE !== 'pre') {
    for (const t of exp.triggers) check(checks, `trigger ${t.name} on ${t.table}`, (await one(`select count(*) from pg_trigger tg join pg_class c on c.oid=tg.tgrelid where tg.tgname=$1 and c.relname=$2 and not tg.tgisinternal`, [t.name, t.table])) > 0, 'missing');
    for (const p of exp.policies) check(checks, `policy "${p.name}" on ${p.table}`, (await one(`select count(*) from pg_policies where policyname=$1 and tablename=$2`, [p.name, p.table])) > 0, 'missing');
    for (const t of exp.rls) check(checks, `RLS enabled on ${t}`, (await one(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1 and c.relrowsecurity`, [t])) > 0, 'relrowsecurity=false');
    for (const r of exp.revokes) { if (r.role === 'public') continue; const has = await q(`select has_function_privilege($1, (select oid from pg_proc where proname=$2 limit 1), 'EXECUTE') as ok`, [r.role, r.fn]).catch(() => [{ ok: null }]); check(checks, `EXECUTE on ${r.fn} revoked from ${r.role}`, has[0]?.ok === false, `has_function_privilege=${has[0]?.ok}`); }
    for (const g of exp.grants) { const has = await q(`select has_function_privilege($1, (select oid from pg_proc where proname=$2 limit 1), 'EXECUTE') as ok`, [g.role, g.fn]).catch(() => [{ ok: null }]); check(checks, `EXECUTE on ${g.fn} granted to ${g.role}`, has[0]?.ok === true, `has_function_privilege=${has[0]?.ok}`); }
  }
  const fails = checks.filter(([, ok]) => !ok).length;
  verdicts[tag] = MODE === 'pre' ? (fails ? 'PRE-APPLY STATE WRONG' : 'PRE-APPLY OK (not yet applied)') : (db.engine === 'real-postgresql' ? (fails ? 'FAILED' : 'LIVE VERIFIED') : (fails ? 'SMOKE FAILED' : 'SMOKE OK (PGlite — not LIVE)'));
}

console.log('\n=== EXCLUDED must be UNTOUCHED ===');
const touched = [];
for (const [tag, file] of Object.entries(EXCLUDED)) {
  const exp = expectations(readFileSync(join(MIGDIR, file), 'utf8'));
  const inHistory = history.includes(version(file));
  const anyFn = (await Promise.all(exp.functions.map((f) => one(`select count(*) from pg_proc where proname=$1`, [f.name])))).some((n) => n > 0);
  const anyTrg = (await Promise.all(exp.triggers.map((t) => one(`select count(*) from pg_trigger where tgname=$1`, [t.name])))).some((n) => n > 0);
  const ok = !inHistory && !anyFn && !anyTrg;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${tag} ${file}: ${ok ? 'UNTOUCHED' : 'TOUCHED (history=' + inHistory + ' fn=' + anyFn + ' trg=' + anyTrg + ')'}`);
  if (!ok) touched.push(tag);
}

console.log('\n================ VERDICTS ================');
for (const [tag, v] of Object.entries(verdicts)) console.log(`  ${tag} — ${v}`);
console.log(`  C / 040001 — ${touched.length ? 'TOUCHED: ' + touched.join(',') : 'UNTOUCHED'}`);
const bad = Object.values(verdicts).some((v) => /FAIL|WRONG/.test(v)) || touched.length > 0;
process.exit(bad ? 1 : 0);
