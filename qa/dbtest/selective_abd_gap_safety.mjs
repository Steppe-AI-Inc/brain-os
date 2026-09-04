#!/usr/bin/env node
// SELECTIVE A/B/D GAP-SAFETY PROOF (founder authorized A=202609020001, B=202609020002,
// D=202609030001; EXCLUDED C=202609020003 and 202609040001). The approved set is
// NON-CONTIGUOUS — C sits between B and D in version order — so a production apply must skip
// C yet still apply D (a higher version), and C/040001 must remain applyable afterward.
//
// This proves the SUBSTANTIVE risk at the SQL/object level on real PostgreSQL semantics
// (PGlite): does D have any hard dependency on C, and does C apply cleanly once D is already
// present (the out-of-order "gap")? It does NOT test the supabase CLI's own ordering
// bookkeeping — that is validated separately once the real pending set is known.
//
//   node selective_abd_gap_safety.mjs
import { openDb, bootstrap, transformFor } from './db.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGDIR = join(resolve(HERE, '..', '..'), 'supabase', 'migrations');
const C = '202609020003_messaging_transport_foundation.sql';
const CH = '202609040001_chat_channels_creator_immutable.sql';
const EXCLUDE = new Set([C, CH]);

const db = await openDb();
const transform = transformFor(db);
console.log(`engine: ${db.engine} — ${db.version}\n`);
if (db.extensions.vector) await db.exec('create extension if not exists vector;');
await db.exec(readFileSync(join(HERE, 'bootstrap.sql'), 'utf8'));

const files = readdirSync(MIGDIR).filter((f) => f.endsWith('.sql')).sort();
let failed = 0, appliedD = false;
console.log('PHASE 1 — apply every migration EXCEPT C and 040001 (A, B, D and all others):');
for (const f of files) {
  if (EXCLUDE.has(f)) { console.log(`  SKIP    ${f}`); continue; }
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); if (f.startsWith('202609030001')) appliedD = true; }
  catch (e) { failed++; console.log(`  FAIL    ${f}\n          ${String(e.message).split('\n')[0]}`); }
}
console.log(`  applied ${files.length - EXCLUDE.size} files, ${failed} failed; D applied = ${appliedD}\n`);

const one = async (q) => { const r = await db.query(q); return Number((r.rows[0] && Object.values(r.rows[0])[0]) || 0); };
const checks = [];
const assert = (name, ok, detail) => { checks.push([name, ok, detail]); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + detail}`); };

console.log('PHASE 2 — assert D is present and C/040001 objects are ABSENT (no leakage):');
assert('phase1 applied with 0 failures', failed === 0, `${failed} migrations failed`);
assert("D's guard function guard_agent_run_retry_columns exists",
  await one("select count(*) from pg_proc where proname = 'guard_agent_run_retry_columns'") === 1, 'missing');
assert("D's claim_blocked_run_for_retry exists",
  await one("select count(*) from pg_proc where proname = 'claim_blocked_run_for_retry'") >= 1, 'missing');
assert("C's table channel_transport_bindings is ABSENT",
  await one("select count(*) from pg_tables where schemaname='public' and tablename='channel_transport_bindings'") === 0, 'C leaked in');
assert("C's table external_identity_bindings is ABSENT",
  await one("select count(*) from pg_tables where schemaname='public' and tablename='external_identity_bindings'") === 0, 'C leaked in');
assert("040001's trigger chat_channels_creator_immutable_guard is ABSENT",
  await one("select count(*) from pg_trigger where tgname='chat_channels_creator_immutable_guard'") === 0, '040001 leaked in');

console.log('\nPHASE 3 — now apply C, then 040001 (the out-of-order gap) and assert they succeed:');
for (const f of [C, CH]) {
  try { await db.exec(transform(readFileSync(join(MIGDIR, f), 'utf8'))); console.log(`  APPLIED ${f}`); }
  catch (e) { failed++; console.log(`  FAIL    ${f}\n          ${String(e.message).split('\n')[0]}`); }
}
assert("C applied after D — channel_transport_bindings now exists",
  await one("select count(*) from pg_tables where schemaname='public' and tablename='channel_transport_bindings'") === 1, 'C failed to apply after D');
assert("040001 applied — chat_channels_creator_immutable_guard now exists",
  await one("select count(*) from pg_trigger where tgname='chat_channels_creator_immutable_guard'") === 1, '040001 failed to apply');

const bad = checks.filter(([, ok]) => !ok).length;
console.log(`\nselective_abd_gap_safety: ${checks.length - bad}/${checks.length} checks passed, ${bad} failed`);
console.log(bad === 0
  ? 'GAP-SAFE: A/B/D apply without C; C and 040001 apply cleanly afterward. D has no hard dependency on C.'
  : 'NOT gap-safe — see failures above.');
process.exit(bad === 0 ? 0 : 1);
